#!/bin/sh
# contact sheet of stills/*.png -> $1
FF=${FFMPEG:-ffmpeg}
$FF -y -loglevel error -pattern_type glob -i 'stills/*.png' -vf "scale=640:360,drawbox=x=0:y=0:w=640:h=360:color=gray@0.6:t=1,tile=3x5" -frames:v 1 "$1"
