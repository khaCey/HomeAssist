#!/usr/bin/env bash
# Run Chromium kiosk on the local display (e.g. monitor attached to akamaru).
# If you're SSH'd in, run once from a terminal on the desktop:  xhost +local
# Then from SSH:  ./scripts/kiosk.sh   or:  DISPLAY=:0 chromium --kiosk http://akamaru:4173

export DISPLAY=:0
chromium --kiosk http://akamaru:4173
