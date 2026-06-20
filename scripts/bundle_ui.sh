#!/bin/bash
# Bundle Overture's ES module tree into dist/overture/ui.js with esbuild, then
# gate the result through the device's QuickJS.
#
# Why esbuild (not hand-rolled concatenation): shadow_ui only resolves imports
# from /data/UserData/schwung/shared/, so the tool's own ./*.mjs modules must be
# inlined into a single file. The old python concatenator broke silently whenever
# a module was missing from a manual ORDER list, two modules declared the same
# top-level name, or a local import was aliased — none of which the V8-based tests
# or `node --check` catch, because they run against *source*, never the QuickJS
# bundle. esbuild resolves the dependency graph itself (no ORDER list), renames
# colliding symbols per their original module scope, and honors aliased imports,
# eliminating that entire bug class.
#
# The QuickJS parse gate then runs the artifact through the exact engine the
# device uses. A clean parse still ends in a "could not load module
# /data/.../shared/*" error here (those externals don't exist off-device) — that
# is expected and treated as success; only a SyntaxError fails the build.
#
# HOST-ONLY: needs node/esbuild (and ideally a qjs binary). These are not present
# in the aarch64 cross-compile Docker image, so build.sh runs this on the host
# side only; the output lands in the volume-mounted dist/ that the Docker pass
# packs into the tarball.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOOL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$TOOL_DIR/.." && pwd)"

ENTRY="$TOOL_DIR/ui/ui.js"
OUT="$TOOL_DIR/dist/overture/ui.js"
SHARED_EXTERNAL='/data/UserData/schwung/shared/*'

# --- locate esbuild ---
# esbuild is the tool's own host build dependency (overture-ui/package.json). Prefer
# the tool's node_modules; fall back to the web emulator workspace (legacy
# location) or a PATH/$ESBUILD binary so older checkouts keep building.
ESBUILD="${ESBUILD:-}"
if [ -z "$ESBUILD" ]; then
    if [ -x "$TOOL_DIR/node_modules/.bin/esbuild" ]; then
        ESBUILD="$TOOL_DIR/node_modules/.bin/esbuild"
    elif [ -x "$REPO_DIR/web/node_modules/.bin/esbuild" ]; then
        ESBUILD="$REPO_DIR/web/node_modules/.bin/esbuild"
    elif command -v esbuild >/dev/null 2>&1; then
        ESBUILD="$(command -v esbuild)"
    fi
fi
if [ -z "$ESBUILD" ]; then
    echo "ERROR: esbuild not found. Run 'pnpm -C overture-ui install', or set \$ESBUILD." >&2
    exit 1
fi

mkdir -p "$(dirname "$OUT")"

# Dev-only debug logging is gated by the OVERTURE_DEBUG_LOG build-time define.
# Default false (production): every `OVERTURE_DEBUG_LOG && dlog(...)` folds to
# `false && ...` and esbuild DCE removes it + tree-shakes core/ui_debug_log.mjs
# out entirely. Opt in for a dev build: `OVERTURE_DEBUG_LOG=1 ./scripts/bundle_ui.sh`.
case "${OVERTURE_DEBUG_LOG:-}" in
    1|true|TRUE|yes|on) DEBUG_LOG_DEFINE=true ;;
    *)                  DEBUG_LOG_DEFINE=false ;;
esac
echo "OVERTURE_DEBUG_LOG define: $DEBUG_LOG_DEFINE"

echo "Bundling ui/ui.js -> dist/overture/ui.js via esbuild ($ESBUILD)"
"$ESBUILD" "$ENTRY" \
    --bundle \
    --format=esm \
    --platform=neutral \
    --target=es2020 \
    "--external:$SHARED_EXTERNAL" \
    "--define:OVERTURE_DEBUG_LOG=$DEBUG_LOG_DEFINE" \
    --legal-comments=none \
    --outfile="$OUT"
echo "Bundle: $(wc -c < "$OUT") bytes"

# --- QuickJS parse gate ---
QJS="${QJS_BIN:-}"
if [ -z "$QJS" ]; then
    CAND="$REPO_DIR/schwung/libs/quickjs/quickjs-2025-04-26/qjs"
    if [ -x "$CAND" ]; then
        QJS="$CAND"
    elif command -v qjs >/dev/null 2>&1; then
        QJS="$(command -v qjs)"
    fi
fi
if [ -z "$QJS" ]; then
    echo "WARN: qjs not found — skipping QuickJS parse gate. Build schwung/libs/quickjs (or set \$QJS_BIN) to enable it."
    exit 0
fi

GATE_OUT="$("$QJS" -m "$OUT" 2>&1 || true)"
if printf '%s' "$GATE_OUT" | grep -q "SyntaxError"; then
    echo "QuickJS parse gate FAILED:" >&2
    printf '%s\n' "$GATE_OUT" >&2
    exit 1
fi
echo "QuickJS parse gate: OK (external shared/* module-load errors are expected off-device)"
