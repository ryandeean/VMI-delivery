#!/bin/sh
# Join the rendered 60fps segments, fold them to 30fps with a 180-degree
# shutter (two-frame blend), add film grain, and mux the score.
set -e
FF=${FFMPEG:-ffmpeg}
cd "$(dirname "$0")"
ls out/seg_*.mp4 | sort -V | sed "s/^/file '/; s/\$/'/; s#file 'out/#file '#" > out/list.txt
$FF -y -loglevel error -stats -f concat -safe 0 -i out/list.txt -i out/audio.wav \
  -filter_complex "[0:v]tmix=frames=2,fps=30,noise=c0s=4:c0f=t+u,format=yuv420p[v]" \
  -map "[v]" -map 1:a -c:v libx264 -preset slow -crf 21 -profile:v high -tune grain -g 60 \
  -c:a aac -b:a 256k -movflags +faststart -shortest it-couldnt-be-done.mp4
