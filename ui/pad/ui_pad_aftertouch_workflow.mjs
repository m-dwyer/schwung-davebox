export function onPadAftertouchImpl(S, deps, d1, d2) {
    const t      = S.activeTrack;
    const padIdx = d1 - deps.trackPadBase;

    /* Melodic aftertouch send (Phase 1: live). DSP tN_live_at routes via pfx_send
     * for the track's route (Move inject / Schwung internal / External USB). Poly
     * carries the sounded pitch (padPitch[]); Channel is track-wide. Deduped per
     * pad so a steady press doesn't spam the set_param channel. */
    if (S.trackPadMode[t] !== deps.PAD_MODE_DRUM) {
        let mode = S.trackAtMode[t] | 0;
        if (mode === 0) return;                       /* Off — send nothing */
        if (S.trackRoute[t] === 1 && mode === 2) mode = 1;  /* Move = poly only */
        if (padIdx < 0 || padIdx >= 32) return;
        const pitch = deps.padPitch[padIdx];
        if (pitch < 0) return;                        /* no live note on this pad */
        if (S.atLastSent[padIdx] === d2) return;      /* unchanged — skip */
        S.atLastSent[padIdx] = d2;
        if (typeof deps.setParam === 'function')
            deps.setParam('t' + t + '_live_at', pitch + ' ' + d2 + ' ' + mode);
        return;
    }

    if (S.trackPadMode[t] === deps.PAD_MODE_DRUM && S.drumPerformMode[t] === 1 &&
            S.drumRepeatHeldPad[t] === padIdx && d2 > 0) {
        deps.handleDrumRepeatPadAftertouch(S, deps.drumRepeatDeps, t, padIdx, d2);
    }
    if (S.trackPadMode[t] === deps.PAD_MODE_DRUM && S.drumPerformMode[t] === 2 && d2 > 0) {
        const col2 = padIdx % 8;
        if (col2 < 4) {
            const lane = deps.drumPadToLane(padIdx);
            if (lane >= 0 && S.drumRepeat2HeldLanes[t].has(lane)) {
                deps.handleDrumRepeat2LaneAftertouch(S, deps.drumRepeatDeps, t, lane, d2);
            }
        }
    }
}
