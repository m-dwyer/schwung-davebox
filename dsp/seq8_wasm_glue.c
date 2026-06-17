/*
 * seq8_wasm_glue.c — Emscripten glue exposing seq8's plugin_api_v2 vtable as a
 * flat C ABI for the Overture emulator (behavior tier; see overture/docs/EMULATOR.md).
 *
 * seq8.c exports only `move_plugin_init_v2`; the lifecycle/event impls are static
 * and reached through the returned vtable. This file wires a host_api_v1_t whose
 * MIDI-out/log callbacks forward to JS, then exposes init/create/on_midi/set_param/
 * get_param/render as plain exported functions the emulator host shim can ccall.
 *
 * Built with the STANDARD emscripten runtime (NOT STANDALONE_WASM): the tool runs
 * on the main thread (unlike moveforge's audio-worklet DSP), and seq8 opens log/
 * state files via fopen/opendir — MEMFS provides those in-browser.
 */
#include <emscripten.h>
#include <stdint.h>
#include <string.h>
#include <stdlib.h>
#include <sys/stat.h>

#include "host/plugin_api_v1.h"

/* The only non-static symbol seq8.c exports. */
extern plugin_api_v2_t *move_plugin_init_v2(const host_api_v1_t *host);

static plugin_api_v2_t *g_plugin = NULL;
static float            g_bpm    = 120.0f;

/* ---- host -> JS bridges ------------------------------------------------ */
/* Every packet the sequencer emits is forwarded to JS with a lane tag so the
 * emulator can route it (0 = internal/Schwung chain, 2 = external/USB-A,
 * 3 = inject_to_move/Move native tracks). Packets are 4-byte USB-MIDI. */
EM_JS(void, js_emit_midi, (int tag, int b0, int b1, int b2, int b3), {
    if (Module.onSeq8Midi) Module.onSeq8Midi(tag, b0, b1, b2, b3);
});
EM_JS(void, js_log, (const char *msg), {
    if (Module.onSeq8Log) Module.onSeq8Log(UTF8ToString(msg));
});

static int host_midi_send_internal(const uint8_t *m, int len) {
    js_emit_midi(0, m[0], len > 1 ? m[1] : 0, len > 2 ? m[2] : 0, len > 3 ? m[3] : 0);
    return len;
}
static int host_midi_send_external(const uint8_t *m, int len) {
    js_emit_midi(2, m[0], len > 1 ? m[1] : 0, len > 2 ? m[2] : 0, len > 3 ? m[3] : 0);
    return len;
}
static int host_midi_inject_to_move(const uint8_t *m, int len) {
    js_emit_midi(3, m[0], len > 1 ? m[1] : 0, len > 2 ? m[2] : 0, len > 3 ? m[3] : 0);
    return len;
}
static void  host_log(const char *msg)   { js_log(msg); }
static int   host_get_clock_status(void) { return MOVE_CLOCK_STATUS_RUNNING; }
static float host_get_bpm(void)          { return g_bpm; }

static host_api_v1_t g_host = {0};

/* ---- flat exports for the emulator host shim --------------------------- */

/* Initialize the plugin vtable + the MEMFS dirs seq8 opens for log/state. */
EMSCRIPTEN_KEEPALIVE int seq8_boot(void) {
    mkdir("/data", 0777);
    mkdir("/data/UserData", 0777);
    mkdir("/data/UserData/schwung", 0777);
    mkdir("/data/UserData/schwung/set_state", 0777);

    g_host.api_version        = MOVE_PLUGIN_API_VERSION;
    g_host.sample_rate        = MOVE_SAMPLE_RATE;
    g_host.frames_per_block   = MOVE_FRAMES_PER_BLOCK;
    g_host.log                = host_log;
    g_host.midi_send_internal = host_midi_send_internal;
    g_host.midi_send_external = host_midi_send_external;
    g_host.get_clock_status   = host_get_clock_status;
    g_host.get_bpm            = host_get_bpm;
    g_host.midi_inject_to_move = host_midi_inject_to_move;
    /* mapped_memory / mod_* left NULL: seq8 guards these. */

    g_plugin = move_plugin_init_v2(&g_host);
    return g_plugin ? 0 : -1;
}

EMSCRIPTEN_KEEPALIVE void *seq8_create(const char *module_dir, const char *json_defaults) {
    if (!g_plugin) return NULL;
    const char *dir = (module_dir && module_dir[0])
                          ? module_dir
                          : "/data/UserData/schwung/modules/tools/overture";
    const char *defs = (json_defaults && json_defaults[0]) ? json_defaults : NULL;
    return g_plugin->create_instance(dir, defs);
}

EMSCRIPTEN_KEEPALIVE void seq8_destroy(void *inst) {
    if (g_plugin && inst) g_plugin->destroy_instance(inst);
}

EMSCRIPTEN_KEEPALIVE void seq8_on_midi(void *inst, int status, int d1, int d2, int source) {
    if (!g_plugin || !inst) return;
    uint8_t m[3] = { (uint8_t)status, (uint8_t)d1, (uint8_t)d2 };
    g_plugin->on_midi(inst, m, 3, source);
}

EMSCRIPTEN_KEEPALIVE void seq8_set_param(void *inst, const char *key, const char *val) {
    if (g_plugin && inst) g_plugin->set_param(inst, key, val ? val : "");
}

/* Authoritative get_param: returns length written, or -1 when not found, so the
 * JS host shim can distinguish a real value from null (matches host semantics). */
EMSCRIPTEN_KEEPALIVE int seq8_get_param(void *inst, const char *key, char *buf, int buflen) {
    if (!g_plugin || !inst) return -1;
    return g_plugin->get_param(inst, key, buf, buflen);
}

EMSCRIPTEN_KEEPALIVE int seq8_get_error(void *inst, char *buf, int buflen) {
    if (!g_plugin || !inst) return 0;
    return g_plugin->get_error(inst, buf, buflen);
}

/* Advance one audio block — this is what crosses step boundaries and emits MIDI.
 * The stereo int16 output (metronome only, for a tool) is discarded. */
static int16_t g_render_buf[MOVE_FRAMES_PER_BLOCK * 2];
EMSCRIPTEN_KEEPALIVE void seq8_render(void *inst, int frames) {
    if (!g_plugin || !inst) return;
    if (frames <= 0 || frames > MOVE_FRAMES_PER_BLOCK) frames = MOVE_FRAMES_PER_BLOCK;
    memset(g_render_buf, 0, sizeof(int16_t) * frames * 2);
    g_plugin->render_block(inst, g_render_buf, frames);
}

EMSCRIPTEN_KEEPALIVE void  seq8_set_bpm(float bpm) { g_bpm = bpm; }
EMSCRIPTEN_KEEPALIVE float seq8_api_version(void)  { return g_plugin ? (float)g_plugin->api_version : 0.0f; }
