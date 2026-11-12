#!/usr/bin/env sh
# Regenerate the local scheme-library snapshot used by the "Start from" picker.
# Requires the Tinted CLI (`tinty`) with an installed schemes repo (`tinty install`).
# Any arguments are passed to tinty as global options, e.g. `-c config.toml -d data-dir`
# to read from an isolated install instead of your own (CI does this).
set -e
cd "$(dirname "$0")/.."
tinty "$@" list --json > data/schemes.json
echo "Wrote data/schemes.json ($(wc -c < data/schemes.json) bytes)"
