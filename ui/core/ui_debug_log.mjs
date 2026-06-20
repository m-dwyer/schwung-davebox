/* ui_debug_log.mjs — DEV-ONLY host-boundary debug logger.
 *
 * GATED BY THE BUILD-TIME `OVERTURE_DEBUG_LOG` DEFINE. Production bundles set it
 * false (esbuild `--define:OVERTURE_DEBUG_LOG=false`), so every call site —
 * written `OVERTURE_DEBUG_LOG && dlog(...)` — folds to `false && ...` and
 * esbuild's dead-code elimination deletes the call, its arguments, and (since
 * nothing then imports this module) tree-shakes the whole file out. A production
 * bundle contains zero trace of it (`grep dlog dist/overture/ui.js` is empty).
 * Dev bundles (`OVERTURE_DEBUG_LOG=1 ./scripts/bundle_ui.sh`) keep it.
 *
 * BOUNDED BY CONSTRUCTION. Unlike the host shim's append-forever debug.log (which
 * reached 522 MB), this keeps only the last RING_MAX lines in memory and flushes
 * by OVERWRITING the file — it can never grow without bound, on any partition.
 *
 * Lives in core/ (a dependency leaf) with no concept-folder imports, so any
 * module — including other core/ modules — can call it without a layering
 * violation. Uses host globals (host_write_file/host_read_file) directly, like
 * ui_entrypoint_diagnostics.mjs; those are no-ops off-device (tests just read the
 * in-memory ring via the test seam). */
/*
 * USAGE (no call sites ship yet — wire it only when diagnosing something):
 *   1. Bootstrap once at startup, in ui.js init():
 *          OVERTURE_DEBUG_LOG && initDebugLog();
 *   2. Log at any point of interest, ALWAYS behind the build flag so prod DCEs it:
 *          OVERTURE_DEBUG_LOG && dlog('DEBUG', 'sound: set_param slot=' + slot + ' ' + key);
 *   3. Build a dev bundle:  OVERTURE_DEBUG_LOG=1 ./scripts/bundle_ui.sh
 *      (a plain prod bundle strips every trace — verify: `grep dlog dist/overture/ui.js`.)
 *   4. On device, choose a level (default OFF = silent):
 *          echo DEBUG > /data/UserData/schwung/overture-debug-level   # then relaunch
 *      Read it back at /data/UserData/schwung/overture-debug.log; delete the level
 *      file to silence. The log can never exceed RING_MAX lines (overwrite, not append).
 */

const LEVELS = { OFF: 0, ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };
const RING_MAX = 400;
const LOG_PATH = '/data/UserData/schwung/overture-debug.log';
/* Runtime level control WITHOUT a redeploy: drop a file containing one of
 * OFF/ERROR/WARN/INFO/DEBUG at this path and relaunch. Absent -> OFF, so even a
 * dev build writes NOTHING (no log file appears) until you explicitly opt in. */
const LEVEL_FLAG_PATH = '/data/UserData/schwung/overture-debug-level';

let _level = LEVELS.OFF;
let _seq = 0;
const _ring = [];

/* Read the level flag file once at startup (cheap). Call behind the flag from
 * init(): `OVERTURE_DEBUG_LOG && initDebugLog();`. */
export function initDebugLog() {
    try {
        if (typeof host_read_file === 'function') {
            const raw = host_read_file(LEVEL_FLAG_PATH);
            if (raw) {
                const name = String(raw).trim().toUpperCase();
                if (Object.prototype.hasOwnProperty.call(LEVELS, name)) _level = LEVELS[name];
            }
        }
    } catch (_e) { /* keep default level */ }
    if (_level === LEVELS.OFF) return; /* no level-file -> write nothing at all */
    _seq++;
    _ring.push(_seq + ' INFO debug-log init level=' + _levelName());
    _flush();
}

/* Record one line if its level passes the threshold, then flush (overwrite).
 * ALWAYS call behind the build flag: `OVERTURE_DEBUG_LOG && dlog('DEBUG', ...)`. */
export function dlog(level, msg) {
    const lv = Object.prototype.hasOwnProperty.call(LEVELS, level) ? LEVELS[level] : LEVELS.INFO;
    if (lv > _level) return;
    _seq++;
    _ring.push(_seq + ' ' + level + ' ' + msg);
    if (_ring.length > RING_MAX) _ring.splice(0, _ring.length - RING_MAX);
    _flush();
}

function _flush() {
    try {
        if (typeof host_write_file === 'function')
            host_write_file(LOG_PATH, _ring.join('\n') + '\n');
    } catch (_e) { /* logging must never break the tool */ }
}

function _levelName() {
    for (const k in LEVELS) if (LEVELS[k] === _level) return k;
    return '?';
}

/* --- Test seam (no host needed; exercised with OVERTURE_DEBUG_LOG defined true
 * in vitest). --- */
export function _debugLogRingForTest() { return _ring.slice(); }
export function _resetDebugLogForTest(levelName) {
    _ring.length = 0;
    _seq = 0;
    _level = Object.prototype.hasOwnProperty.call(LEVELS, levelName) ? LEVELS[levelName] : LEVELS.WARN;
}
