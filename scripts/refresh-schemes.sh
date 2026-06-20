#!/usr/bin/env sh
# Regenerate the local scheme-library snapshot used by the "Start from" picker.
# Requires the Tinted CLI (`tinty`) with an installed schemes repo (`tinty install`).
set -e
cd "$(dirname "$0")/.."
tinty list --json > data/schemes.json
echo "Wrote data/schemes.json ($(wc -c < data/schemes.json) bytes)"
