#!/bin/bash
# Build seq8.c -> WebAssembly for the Overture emulator's behavior tier.
#
# seq8.c #includes seq8_set_param.c (single translation unit), so only seq8.c +
# the glue are compiled. Uses the standard emscripten runtime (MEMFS for the
# log/state files seq8 opens). Output: dist/wasm/seq8.{js,wasm}.
#
# Runs emcc inside the emscripten/emsdk Docker image when emcc isn't on PATH.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

EMSDK_IMAGE="${EMSDK_IMAGE:-emscripten/emsdk:3.1.74}"
OUT_DIR="dist/wasm"
mkdir -p "$OUT_DIR"

EXPORTED_FUNCTIONS='["_seq8_boot","_seq8_create","_seq8_destroy","_seq8_on_midi","_seq8_set_param","_seq8_get_param","_seq8_get_error","_seq8_render","_seq8_set_bpm","_seq8_api_version","_malloc","_free"]'
RUNTIME_METHODS='["ccall","cwrap","UTF8ToString","stringToUTF8","lengthBytesUTF8","getValue","setValue","HEAPU8","HEAP16"]'

read -r -d '' EMCC_CMD <<EOF || true
emcc dsp/seq8.c dsp/seq8_wasm_glue.c \
  -O3 -I. \
  -s MODULARIZE=1 -s EXPORT_NAME=Seq8Module \
  -s ENVIRONMENT=web,worker,node \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s EXPORTED_FUNCTIONS='${EXPORTED_FUNCTIONS}' \
  -s EXPORTED_RUNTIME_METHODS='${RUNTIME_METHODS}' \
  -o ${OUT_DIR}/seq8.js
EOF

run_build() {
    echo "=== Building seq8 -> wasm ==="
    eval "$EMCC_CMD"
}

if command -v emcc >/dev/null 2>&1; then
    run_build
else
    echo "emcc not found, building via Docker ($EMSDK_IMAGE)..."
    docker run --rm -v "$PROJECT_DIR:/src" -u "$(id -u):$(id -g)" -w /src \
        "$EMSDK_IMAGE" bash -lc "$EMCC_CMD"
fi

echo ""
echo "=== Artifacts ==="
ls -lh "${OUT_DIR}/seq8.js" "${OUT_DIR}/seq8.wasm"
echo "Build complete: ${OUT_DIR}/seq8.{js,wasm}"
