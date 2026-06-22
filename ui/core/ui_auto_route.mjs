/* Auto-route: Schwung slots (live, own file) + Move tracks (injected gesture).
 *
 * Pure builders + a tick drain. An orchestrator (`beginAutoRoute`) seeds the
 * canonical routing — Move native tracks (T1-4) on MIDI ch 1-4, Schwung slots
 * (T5-8) on ch 5-8 — re-seeds the Schwung slots live via `deps.shadowSetParam`,
 * and queues a blind front-panel gesture macro that drives Move's routing menu
 * by injection. `runAutoRouteTickTasks` drains that queue one step per tick with
 * inter-step gaps and a hard watchdog.
 *
 * Tier 1 / blind: no host changes. Two runtime constants (`JOG_DOWN`/`JOG_UP`)
 * are first-run-tunable (Move's jog is a relative encoder; if the menu scrolls
 * the wrong way, swap them). See overture-auto-route-draft.md.
 *
 * PURE + dependency-injected: no `globalThis`, no host calls except via `deps`.
 * NOT wired into the live tick pipeline yet — reachable only from its own test.
 */

export const ROUTE_SCHWUNG = 0, ROUTE_MOVE = 1;

/* Canonical map: T1-4 Move ch1-4, T5-8 Schwung ch5-8.
 *
 * NOTE: this mirrors the expected map open-coded in
 * `ui/core/ui_route_check.mjs` (`routeCheckStatus`: expectedRoute = t<4?1:0,
 * expectedCh = t+1). The two should be unified by importing this canonical
 * helper there — do NOT edit ui_route_check.mjs as part of this change.
 *
 * @param {number} t  0-based track index (0-7)
 * @returns {{ route: number, channel: number }}
 */
export function canonicalRoute(t) {
    return { route: t < 4 ? ROUTE_MOVE : ROUTE_SCHWUNG, channel: t + 1 };
}

/* Canonical receive channel for Schwung slot `i` (0-3): slot i -> ch i+5.
 * (Slot i is track i+4, whose canonical channel is (i+4)+1 = i+5.)
 *
 * @param {number} i  0-based Schwung slot index (0-3)
 * @returns {number}  MIDI channel 5-8
 */
export function canonicalSlotChannel(i) {
    return canonicalRoute(i + 4).channel;
}

/* ---- gesture builder ---------------------------------------------------- */

/* cable-0 CC inject packet (matches the existing co-run drain). */
const INJ = (cc, val) => [0x0B, 0xB0, cc & 0x7f, val & 0x7f];

/* CC constants (from the on-device dbus-monitor spike). */
const SHIFT = 49, JOG = 14, CLICK = 3, BACK = 51;

/* 0-based track -> Move track-button CC: track N (1-based) = CC (44 - N). */
const trackCC = t0 => 44 - (t0 + 1);

/* Jog relative-encoder direction values. Verified on-device 2026-06-22:
 * 0x01 scrolls DOWN, 0x7f scrolls UP (the initial guess was inverted — the
 * Move-track channels came out mirror-imaged, ch14/13/12/11 for tracks 1-4). */
const JOG_DOWN = 0x01;
const JOG_UP   = 0x7f;

const press = (cc, gap = 4) => ({ emit: [INJ(cc, 127), INJ(cc, 0)], gap });
const hold  = (cc, val, gap = 2) => ({ emit: [INJ(cc, val)], gap });
const jog   = (val, gap = 2) => ({ emit: [INJ(JOG, val)], gap });

/* Captured menu structure (new sets default every track to `auto`):
 *   - Shift + track-button -> routing menu (3 items); MIDI In = item 2.
 *   - MIDI In channel selector = 18 items; Channel N at position N+2 (item 1 =
 *     auto). Pinning the menu to the top first makes this idempotent regardless
 *     of the start value.
 *
 * Steps to set ONE track's MIDI-In channel. Higher channels emit more
 * down-detents, so the step count grows with the channel number.
 *
 * @param {number} t0       0-based track index
 * @param {number} channel  target MIDI channel (1-based)
 * @returns {Array<{emit: number[][], gap: number}>}
 */
function midiInMacro(t0, channel) {
    const s = [];
    s.push(hold(SHIFT, 127, 2));                                            // shift down
    s.push({ emit: [INJ(trackCC(t0), 127), INJ(trackCC(t0), 0)], gap: 6 }); // track press (-> routing menu)
    s.push(hold(SHIFT, 0, 4));                                             // shift up
    for (let i = 0; i < 3; i++) s.push(jog(JOG_UP));                       // pin routing menu top
    s.push(jog(JOG_DOWN));                                                 // item1 -> MIDI In (item2)
    s.push(press(CLICK, 4));                                              // enter selector
    for (let i = 0; i < 18; i++) s.push(jog(JOG_UP));                      // pin selector top (auto)
    for (let i = 0; i < channel + 1; i++) s.push(jog(JOG_DOWN));           // -> Channel N (pos N+2)
    s.push(press(CLICK, 4));                                              // confirm
    s.push(press(BACK, 4));                                               // back to note view
    return s;
}

/* Build the full gesture macro for Move tracks T1-4 from a [c0..c3] channel map.
 *
 * @param {number[]} channelByTrack  1-based target channel per Move track (len 4)
 * @returns {Array<{emit: number[][], gap: number}>}
 */
export function buildAutoRouteMacro(channelByTrack) {
    let steps = [];
    for (let t = 0; t < 4; t++) steps = steps.concat(midiInMacro(t, channelByTrack[t]));
    return steps;
}

/* The gesture builder is exported for tests; named after the macro it builds. */
export { midiInMacro };

/* ---- orchestrator + tick drain ----------------------------------------- */

/**
 * Host slice this module needs (Interface Segregation). The composition root in
 * ui.js structurally satisfies this; `State` is the shared contract (ui/types).
 *
 * @typedef {Object} AutoRouteDeps
 * @property {(slot: number, key: string, val: string) => void} [shadowSetParam]
 *   Live Schwung per-slot param setter (writes Schwung's own chain config).
 *   `globalThis.shadow_set_param` on device. Optional — re-seed is skipped if absent.
 * @property {(slot: number, key: string, val: string, timeoutMs: number) => boolean} [shadowSetParamTimeout]
 *   BLOCKING per-slot param setter (`globalThis.shadow_set_param_timeout`). Unlike
 *   the fire-and-forget `shadowSetParam`, it round-trips per call so four
 *   back-to-back slot writes in one tick don't get dropped by set_param coalescing
 *   (only the LAST set_param per buffer reaches DSP). Preferred when present.
 * @property {(packet: number[]) => void} [move_midi_inject_to_move]
 *   Safe cable-0 CC inject into Move's MIDI_IN. The macro drain aborts if absent.
 * @property {(key: string) => (string | null)} [host_module_get_param]
 *   Host get_param. Used by `runAutoRouteRequest` to read the set uuid in tick.
 * @property {(path: string) => (string | null)} [host_read_file]
 *   Host file reader. Used by `readCurrentSongIndex` to read Move's Settings.json.
 */

/* Move's per-set transition counter lives in the device settings file. It
 * changes on EVERY set transition (saved or unsaved/blank), unlike active_set.txt
 * (stale on unmaterialized sets) — making it a robust set-change signal on the
 * resume/init edges. */
const SETTINGS_PATH = '/data/UserData/settings/Settings.json';

/**
 * Read Move's `currentSongIndex` from Settings.json. Returns the integer index,
 * or -1 on any failure (missing reader, missing file, parse error, missing key).
 *
 * @param {AutoRouteDeps} deps
 * @returns {number}
 */
export function readCurrentSongIndex(deps) {
    try {
        if (typeof deps.host_read_file !== 'function') return -1;
        const raw = deps.host_read_file(SETTINGS_PATH);
        if (!raw) return -1;
        const obj = JSON.parse(raw);
        const idx = obj && obj.currentSongIndex;
        if (typeof idx !== 'number' || !isFinite(idx)) return -1;
        return idx | 0;
    } catch (_e) {
        return -1;
    }
}

/**
 * Begin auto-route for the current set: seed canonical routing, re-seed Schwung
 * slots live, and queue the Move gesture macro. Idempotent per `uuid` (runs once
 * per set). Sets overlay + watchdog flags consumed by `runAutoRouteTickTasks`.
 *
 * @param {import('../types').State} S
 * @param {AutoRouteDeps} deps
 * @param {string} [uuid]  set UUID; second call with same uuid is a no-op
 * @param {{ force?: boolean }} [opts]  force=true bypasses the once-per-uuid
 *   guard (manual re-trigger from Route Check)
 * @returns {void}
 */
export function beginAutoRoute(S, deps, uuid, opts) {
    if (S.autoRouteQueue) return;                                         // a run is already in flight
    if (!(opts && opts.force)) {
        if (uuid && S.autoRouteAppliedUuid === uuid) return;             // once per set
    }
    if (uuid) S.autoRouteAppliedUuid = uuid;

    // (a) Overture's own routing state -> canonical.
    for (let t = 0; t < 8; t++) {
        const c = canonicalRoute(t);
        S.trackRoute[t] = c.route;
        S.trackChannel[t] = c.channel;
    }
    // (b) Schwung slots -> ch 5..8 (live, self-persisting, no fork).
    // Prefer the BLOCKING setter: four back-to-back fire-and-forget set_params in
    // one tick coalesce to only the LAST reaching DSP (on device this left just
    // slot 4 / ch8 set). shadow_set_param_timeout round-trips per call so all four
    // land. Fall back to the non-blocking setter only when the timeout variant is
    // absent (older host / stock Schwung).
    if (typeof deps.shadowSetParamTimeout === 'function')
        for (let i = 0; i < 4; i++)
            deps.shadowSetParamTimeout(i, 'slot:receive_channel', String(canonicalSlotChannel(i)), 500);
    else if (typeof deps.shadowSetParam === 'function')
        for (let i = 0; i < 4; i++)
            deps.shadowSetParam(i, 'slot:receive_channel', String(canonicalSlotChannel(i)));

    // (c) Move tracks -> ch 1..4 via injected gesture.
    S.autoRouteQueue    = buildAutoRouteMacro([1, 2, 3, 4]);
    S.autoRouteGap      = 0;
    S.autoRouteActive   = true;       // drives "Configuring…" overlay + input lockout
    S.autoRouteWatchdog = 1200;       // ~13s @ ~94Hz hard abort
}

/**
 * Drain a pending manual auto-route request (queued from the Route Check view's
 * jog-click). Runs in tick context — where get_param works and set_param doesn't
 * coalesce — so it can read the set uuid and force a fresh `beginAutoRoute`.
 * No-op unless `S.pendingAutoRouteRequest` is set; clears the flag on fire.
 *
 * @param {import('../types').State} S
 * @param {AutoRouteDeps & { host_module_get_param?: (key: string) => (string | null) }} deps
 * @returns {void}
 */
export function runAutoRouteRequest(S, deps) {
    if (!S.pendingAutoRouteRequest) return;
    S.pendingAutoRouteRequest = false;
    const uuid = deps.host_module_get_param
        ? (deps.host_module_get_param('state_uuid') || '') : '';
    beginAutoRoute(S, deps, uuid, { force: true });
}

/* Finish (or abort) the macro: clear the queue + overlay/watchdog flags.
 *
 * @param {import('../types').State} S
 * @param {boolean} ok
 * @returns {void}
 */
function endAutoRoute(S, ok) {
    S.autoRouteQueue = null;
    S.autoRouteActive = false;
    S.autoRouteWatchdog = 0;
    // TODO: if (!ok) deps.showActionPopup('ROUTE SETUP', why);
    void ok;
}

/**
 * Drain one step of the queued gesture macro per tick (with inter-step gaps and
 * a hard watchdog). No-op when no macro is queued. Aborts if the inject host
 * function is missing or the watchdog expires; finishes cleanly when drained.
 *
 * @param {import('../types').State} S
 * @param {AutoRouteDeps} deps
 * @returns {void}
 */
export function runAutoRouteTickTasks(S, deps) {
    if (!S.autoRouteQueue) return;
    if (S.autoRouteWatchdog > 0 && --S.autoRouteWatchdog === 0) return endAutoRoute(S, false);
    if (typeof deps.move_midi_inject_to_move !== 'function')             return endAutoRoute(S, false);
    if (S.autoRouteGap > 0) { S.autoRouteGap--; return; }
    if (S.autoRouteQueue.length === 0)                                  return endAutoRoute(S, true);
    const step = S.autoRouteQueue.shift();
    for (const ev of step.emit) deps.move_midi_inject_to_move(ev);
    S.autoRouteGap = step.gap | 0;
}
