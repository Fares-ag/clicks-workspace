#!/usr/bin/env bash
# Emulator helpers for capturing clicks-user footage.
#   source tools/emu.sh   then: shot <name> | rec <name> <secs> | tap x y | demoui on|off
ADB="C:/Users/TS/AppData/Local/Android/Sdk/platform-tools/adb.exe"
D="${EMU:-emulator-5554}"
PKG="com.roya.clicks_user"
ROOT="C:/Users/TS/Downloads/clicks-workspace/clicks-customer-demo-video"
STILLS="$ROOT/footage/stills"
CLIPS="$ROOT/footage/clips"
mkdir -p "$STILLS" "$CLIPS"

# SystemUI demo mode drops itself after navigation, so re-arm it before every grab.
# Note: no repeated `enter` here — hammering it wedges SystemUI into a blank black bar.
dm() {
  "$ADB" -s "$D" shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941 >/dev/null 2>&1
  "$ADB" -s "$D" shell am broadcast -a com.android.systemui.demo -e command network -e mobile hide >/dev/null 2>&1
  "$ADB" -s "$D" shell am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4 -e fully true >/dev/null 2>&1
  "$ADB" -s "$D" shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false >/dev/null 2>&1
  "$ADB" -s "$D" shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false >/dev/null 2>&1
}

# Mean luminance of the status-bar strip. ~0 means SystemUI has wedged (all black).
sblum() {
  "$FF" -hide_banner -loglevel error -y -i "$1" -vf "crop=1080:128:0:0,scale=1:1"     -f rawvideo -pix_fmt gray - 2>/dev/null | od -An -tu1 | tr -d ' 
'
}

# Kick SystemUI when it wedges (blank black bar), then put demo mode back once.
sbfix() {
  "$ADB" -s "$D" root >/dev/null 2>&1; sleep 2
  "$ADB" -s "$D" shell "pkill -f com.android.systemui" >/dev/null 2>&1
  sleep 9
  "$ADB" -s "$D" shell settings put global sysui_demo_allowed 1 >/dev/null 2>&1
  "$ADB" -s "$D" shell am broadcast -a com.android.systemui.demo -e command enter >/dev/null 2>&1
  sleep 1
  dm
  sleep 2
}

# The "Waiting for dispatch" screen leaves the status bar painted solid black
# (app-side, survives a SystemUI restart) — only an app relaunch clears it.
# Warn rather than auto-repair: a relaunch would throw away navigation state.
sbguard() {
  "$ADB" -s "$D" exec-out screencap -p > "$STILLS/_guard.png"
  local l; l=$(sblum "$STILLS/_guard.png")
  if [ -z "$l" ] || [ "$l" -lt 40 ]; then
    echo "  !! status bar blank (lum=$l) — relaunch the app before keeping this frame"
  fi
}

# Relaunch into a clean status bar and re-arm demo mode.
reset_app() {
  stopapp; launch "${1:-12}"
  "$ADB" -s "$D" shell am broadcast -a com.android.systemui.demo -e command enter >/dev/null 2>&1
  sleep 1; dm; sleep 1.5
}

shot() {
  sbguard
  "$ADB" -s "$D" exec-out screencap -p > "$STILLS/$1.png"
  echo "shot $1.png ($(stat -c %s "$STILLS/$1.png") bytes, sb lum $(sblum "$STILLS/$1.png"))"
}

# Bottom-nav tap targets (device px, 1080x2400).
NAV_HOME="108 2240"; NAV_ACTIVITY="324 2240"; NAV_SOS="540 2192"; NAV_SERVICES="756 2240"; NAV_SETTINGS="972 2240"
tap()  { "$ADB" -s "$D" shell input tap "$1" "$2"; sleep "${3:-2}"; }
swipe(){ "$ADB" -s "$D" shell input swipe "$1" "$2" "$3" "$4" "${5:-350}"; sleep "${6:-1}"; }
typex(){ "$ADB" -s "$D" shell input text "$1"; sleep 1; }
key()  { "$ADB" -s "$D" shell input keyevent "$1"; sleep "${2:-1}"; }
focus(){ "$ADB" -s "$D" shell dumpsys window 2>/dev/null | grep -E "mCurrentFocus" | head -1; }
launch(){ "$ADB" -s "$D" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1; sleep "${1:-8}"; }
stopapp(){ "$ADB" -s "$D" shell am force-stop "$PKG"; sleep 1; }

# Record N seconds to footage/clips/<name>.mp4 (portrait, device-native).
rec() {
  local name="$1" secs="${2:-10}"
  "$ADB" -s "$D" shell screenrecord --size 1080x2400 --bit-rate 12000000 --time-limit "$secs" /sdcard/_rec.mp4 &
  local pid=$!
  echo "recording $name for ${secs}s…"
  wait $pid
  sleep 1
  "$ADB" -s "$D" pull /sdcard/_rec.mp4 "$CLIPS/$name.mp4" >/dev/null 2>&1
  "$ADB" -s "$D" shell rm -f /sdcard/_rec.mp4
  echo "clip $name.mp4 ($(stat -c %s "$CLIPS/$name.mp4" 2>/dev/null) bytes)"
}

# Clean status bar for filming: fixed clock, full bars, no clutter.
demoui() {
  if [ "$1" = "on" ]; then
    "$ADB" -s "$D" shell settings put global sysui_demo_allowed 1
    "$ADB" -s "$D" shell am broadcast -a com.android.systemui.demo -e command enter >/dev/null
    "$ADB" -s "$D" shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941 >/dev/null
    "$ADB" -s "$D" shell am broadcast -a com.android.systemui.demo -e command network -e mobile hide >/dev/null
    # `fully true` drops the "!" no-internet badge the emulator puts on the wifi glyph.
    "$ADB" -s "$D" shell am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4 -e fully true >/dev/null
    "$ADB" -s "$D" shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false >/dev/null
    "$ADB" -s "$D" shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false >/dev/null
    echo "demo UI on (09:41, full bars)"
  else
    "$ADB" -s "$D" shell am broadcast -a com.android.systemui.demo -e command exit >/dev/null
    echo "demo UI off"
  fi
}

# Doha coordinates for the SOS/tracking screens.
geo() { "$ADB" -s "$D" emu geo fix "${1:-51.4883967}" "${2:-25.3269467}"; echo "geo set"; }

"$@"

# ---- host-side window capture (device screenrecord is broken on this emulator) ----
FF="$ROOT/node_modules/ffmpeg-static/ffmpeg.exe"
WIN="title=Android Emulator - blox_api_35:5554"

# grec <name> <secs>  — start a background gdigrab capture, prints the pid.
grec() {
  "$FF" -hide_banner -loglevel error -y -f gdigrab -framerate 30 -draw_mouse 0 \
    -i "$WIN" -t "$2" -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p \
    "$CLIPS/$1.mp4" >/dev/null 2>&1 &
  echo $!
}

# Downscaled copy of a still, for quick visual checks without burning context.
peek() { "$FF" -hide_banner -loglevel error -y -i "$STILLS/$1.png" -vf "scale=420:-2" "$STILLS/_peek.png"; echo "$STILLS/_peek.png"; }
