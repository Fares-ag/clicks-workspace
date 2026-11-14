#!/usr/bin/env bash
# Turns the raw text-to-speech takes into something that sits in a mix.
#
# Raw TTS is dry, evenly loud and leaves long gaps at every full stop, which is
# most of what makes it sound synthetic. This:
#   - trims the dead air at the head and caps any internal gap at 0.22 s,
#     so the read moves at a human pace instead of pausing to think;
#   - high-passes the rumble, adds a little chest at 180 Hz and presence at 4 kHz;
#   - compresses gently so quiet syllables keep up with loud ones;
#   - adds a very short room reflection, because a completely dry voice reads
#     as "recorded in a vacuum" to most listeners;
#   - normalises to about -18 LUFS so every line sits the same under the music.
#
#   bash tools/polish-vo.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FF="$ROOT/node_modules/ffmpeg-static/ffmpeg.exe"
SRC="$ROOT/footage/vo-raw"
OUT="$ROOT/public/vo"
mkdir -p "$OUT"

CHAIN="silenceremove=start_periods=1:start_duration=0:start_threshold=-45dB:detection=peak,\
silenceremove=stop_periods=-1:stop_duration=0.35:stop_threshold=-45dB:stop_silence=0.22:detection=peak,\
highpass=f=85,\
equalizer=f=180:t=q:w=1.0:g=1.5,\
equalizer=f=4000:t=q:w=1.2:g=2.0,\
acompressor=threshold=-20dB:ratio=3:attack=8:release=160:makeup=2,\
aecho=0.85:0.9:24:0.1,\
loudnorm=I=-18:TP=-1.5:LRA=9"

# Two takes are split at their own sentence boundaries (found with
# silencedetect) so the words can be spread across a long chapter instead of
# landing in one clump with dead air after it.
split() {  # split <raw> <out> <start> <end>
  "$FF" -hide_banner -loglevel error -y -ss "$3" -to "$4" -i "$SRC/$1.mp3"     -af "$CHAIN" -ar 48000 -b:a 192k "$OUT/$2.mp3"
  echo "  $2.mp3  $("$FF" -hide_banner -i "$OUT/$2.mp3" 2>&1 | grep Duration | sed 's/.*Duration: \([0-9:.]*\),.*//')"
}

for f in "$SRC"/*.mp3; do
  n=$(basename "$f")
  "$FF" -hide_banner -loglevel error -y -i "$f" -af "$CHAIN" -ar 48000 -b:a 192k "$OUT/$n"
  d=$("$FF" -hide_banner -i "$OUT/$n" 2>&1 | grep Duration | sed 's/.*Duration: \([0-9:.]*\),.*/\1/')
  raw=$("$FF" -hide_banner -i "$f" 2>&1 | grep Duration | sed 's/.*Duration: \([0-9:.]*\),.*/\1/')
  echo "$n  $raw -> $d"
done

echo "splits:"
split 05-ontheway 05a-follow      0     2.36
split 05-ontheway 05b-distance    2.58  4.36
split 05-ontheway 05c-arrive      4.50  7.10
split 06-done     06a-pay         0     2.56
split 06-done     06b-receipt     2.68  7.47
