/* Rewrite the cable-2 channel remap table for the active track.
 * When the active track is ROUTE_MOVE, incoming external MIDI is remapped to the
 * track's channel so Move's firmware routes it to the correct track instrument. */
export function applyExtMidiRemapImpl(S, deps) {
    const t = S.activeTrack;
    const isMove = S.trackRoute[t] === deps.routeMove;
    const hasRemap = typeof deps.enable === 'function';
    if (!hasRemap) return;
    if (!isMove) {
        deps.clear();
        for (var _i = 0; _i < 16; _i++) {
            deps.set(_i, deps.blockValue);
        }
        deps.enable(1);
        S.extMidiRemapActive = false;
        return;
    }
    const outCh = S.trackChannel[t] - 1;  /* 0-indexed */
    deps.clear();
    if (S.midiInChannel === 0) {
        for (var _i = 0; _i < 16; _i++) {
            if (_i !== outCh) deps.set(_i, outCh);
        }
    } else {
        const inCh = S.midiInChannel - 1;  /* 0-indexed */
        if (inCh !== outCh) deps.set(inCh, outCh);
    }
    deps.enable(1);
    S.extMidiRemapActive = true;
}
