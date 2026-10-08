#!/usr/bin/env bash
# Turns record-app-video.mjs's takes into the deliverables:
#
#   store-<lang>   -> app-preview-<lang>-886x1920.mp4   App Store preview (H.264 High 4.0,
#                     30 fps, silent stereo AAC: App Store Connect's app preview
#                     specification, read 2026-10-08, which lists 10-12 Mbit/s and
#                     15-30 s). The video is average-bitrate: target 11 Mbit/s,
#                     capped at 12. This UI is mostly flat colour and encodes
#                     below the target (about 7.7 Mbit/s on a real take); no
#                     -minrate pads it up. The run fails when a store take's
#                     duration is outside 15-30 s.
#   social-<lang>  -> app-social-<lang>-1080x1920.mp4   9:16 clip for Reels, Bluesky, Mastodon
#   loop-<lang>    -> app-loop-<lang>.mp4 + .webm + .jpg  the install page's muted loop,
#                     540 px wide, no audio, poster from the first frame
#
#   encode.sh <takes-dir> <out-dir>
#
# Each take's .json timeline says where the content starts and ends; the
# loading head before "start" is cut. Needs ffmpeg (brew install ffmpeg).
# Exits non-zero, after encoding every take and printing its row, if a store
# take's duration is outside the 15-30 s App Store Connect accepts.
set -euo pipefail
IN=${1:?takes dir}
OUT=${2:?out dir}
mkdir -p "$OUT"

mark() { python3 -c "import json; d=json.load(open('$1')); print(next(m['t'] for m in d['timeline'] if m['name']=='$2'))"; }
dur() { ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$1"; }
size() { ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$1"; }

SILENCE=(-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000)

failed=0
printf '%-36s %9s %10s %8s\n' file size duration MB
for json in "$IN"/*.json; do
  stem=$(basename "$json" .json)
  profile=${stem%-*}
  lang=${stem##*-}
  take="$IN/$stem.webm"
  [ -f "$take" ] || { echo "no take for $stem" >&2; continue; }
  start=$(mark "$json" start)
  end=$(mark "$json" end)
  # The recorder marks "start" after the first caption has faded in and
  # "end" before its last hold ends; a little slack on both sides.
  ss=$(python3 -c "print(max(0.0, $start + 0.3))")
  to=$(python3 -c "print($end + 0.5)")
  case $profile in
    store)
      out="$OUT/app-preview-$lang-886x1920.mp4"
      ffmpeg -y -v error -ss "$ss" -to "$to" -i "$take" "${SILENCE[@]}" \
        -map 0:v:0 -map 1:a:0 -r 30 -c:v libx264 -preset slow -profile:v high -level 4.0 -pix_fmt yuv420p \
        -b:v 11M -maxrate 12M -bufsize 24M -c:a aac -b:a 256k -ar 48000 -shortest -movflags +faststart "$out"
      ;;
    social)
      out="$OUT/app-social-$lang-1080x1920.mp4"
      ffmpeg -y -v error -ss "$ss" -to "$to" -i "$take" "${SILENCE[@]}" \
        -map 0:v:0 -map 1:a:0 -r 30 -c:v libx264 -preset slow -profile:v high -level 4.0 -pix_fmt yuv420p \
        -crf 19 -maxrate 12M -bufsize 24M -c:a aac -b:a 128k -ar 48000 -shortest -movflags +faststart "$out"
      ;;
    loop)
      out="$OUT/app-loop-$lang.mp4"
      ffmpeg -y -v error -ss "$ss" -to "$to" -i "$take" -an -vf "scale=540:-2" -r 30 \
        -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart "$out"
      ffmpeg -y -v error -ss "$ss" -to "$to" -i "$take" -an -vf "scale=540:-2" -r 30 \
        -c:v libvpx-vp9 -crf 34 -b:v 0 -row-mt 1 "$OUT/app-loop-$lang.webm"
      ffmpeg -y -v error -ss "$ss" -i "$take" -frames:v 1 -vf "scale=540:-2" -q:v 4 "$OUT/app-loop-$lang.jpg"
      ;;
    *) echo "unknown profile $profile" >&2; continue ;;
  esac
  files=("$out")
  if [ "$profile" = loop ]; then files+=("$OUT/app-loop-$lang.webm"); fi
  for f in "${files[@]}"; do
    printf '%-36s %9s %10.2f %8.2f\n' "$(basename "$f")" "$(size "$f")" "$(dur "$f")" "$(python3 -c "import os; print(os.path.getsize('$f')/1e6)")"
  done
  if [ "$profile" = store ] && ! python3 -c "import sys; sys.exit(0 if 15 <= float(sys.argv[1]) <= 30 else 1)" "$(dur "$out")"; then
    echo "error: $(basename "$out") runs $(printf '%.2f' "$(dur "$out")") s; App Store Connect takes 15-30 s per preview" >&2
    failed=1
  fi
done
exit "$failed"
