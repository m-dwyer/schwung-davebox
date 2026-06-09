#!/bin/bash
# Deploy the inject-probe dev tool to a Move. Mirrors install_palette.sh.
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MOVE_HOST="${MOVE_HOST:-move.local}"
DEST="/data/UserData/schwung/modules/tools/inject-probe"

echo "Checking connection to ${MOVE_HOST}..."
ssh -o ConnectTimeout=5 "root@${MOVE_HOST}" "echo Connected." || { echo "Cannot reach ${MOVE_HOST}"; exit 1; }

echo "Installing inject-probe..."
ssh "root@${MOVE_HOST}" "mkdir -p ${DEST}"
scp "${PROJECT_DIR}/tools/inject-probe/module.json" "root@${MOVE_HOST}:${DEST}/module.json"
scp "${PROJECT_DIR}/tools/inject-probe/ui.js"       "root@${MOVE_HOST}:${DEST}/ui.js"
echo "Done. Open Tools -> Inject Probe (the menu rescans on open)."
echo "Note: plain Back suspends + keeps injecting; Shift+Back fully unloads (needed before a redeploy takes effect)."
