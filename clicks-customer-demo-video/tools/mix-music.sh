#!/usr/bin/env bash
# Lays the music bed under a rendered film and ducks it against the narration.
#
# The duck is a real sidechain compressor keyed off the voice track, so it
# follows the actual speech rather than a hand-written envelope — and because
# the video stream is stream-copied, adding music costs no render and no
# further generation loss.
#
#   bash tools/mix-music.sh [in.mp4] [bed.wav] [out.mp4]
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FF="$ROOT/node_modules/ffmpeg-static/ffmpeg.exe"
IN="${1:-$ROOT/deliverables/clicks-customer-demo.mp4}"
BED="${2:-$ROOT/public/music/bed.wav}"
OUT="${3:-$ROOT/deliverables/clicks-customer-demo.mp4}"
TMP="$ROOT/build/_mixed.mp4"

DUR=$("$FF" -hide_banner -i "$IN" 2>&1 | grep Duration | sed 's/.*Duration: \([0-9:.]*\),.*/\1/' \
  | awk -F: '{print ($1*3600)+($2*60)+$3}')
echo "film $DUR s   bed $(basename "$BED")"

# The bed arrives already levelled to -26 LUFS by the prep step, so no extra
# gain here — attenuating twice is what buried it on the first pass. The
# sidechain alone takes it down roughly 9 dB while anyone is speaking.
#
# The master lift is a flat +3 dB rather than loudnorm: single-pass loudnorm
# applies time-varying gain, which pumped the music-only stretches up to meet
# the dialogue and flattened the whole mix.
"$FF" -hide_banner -loglevel error -y -i "$IN" -stream_loop -1 -i "$BED" -filter_complex "
  [1:a]atrim=0:${DUR},asetpts=N/SR/TB,highpass=f=40,
       afade=t=in:st=0:d=2.5,afade=t=out:st=$(awk -v d="$DUR" 'BEGIN{printf "%.2f", d-3}'):d=3[bed];
  [0:a]asplit=2[voice][key];
  [bed][key]sidechaincompress=threshold=0.012:ratio=8:attack=12:release=380:makeup=1[duck];
  [voice][duck]amix=inputs=2:normalize=0:dropout_transition=0[mix];
  [mix]volume=3dB,alimiter=limit=0.9:attack=5:release=60[out]
" -map 0:v -map "[out]" -c:v copy -c:a aac -b:a 192k -movflags +faststart "$TMP"

mv -f "$TMP" "$OUT"
echo "wrote $OUT"
"$FF" -hide_banner -nostats -i "$OUT" -af volumedetect -f null - 2>&1 | grep -E "mean_volume|max_volume"
