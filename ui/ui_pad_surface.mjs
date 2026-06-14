export const SCALE_INTERVALS = [
    [0, 2, 4, 5, 7, 9, 11],        /*  0 Major           */
    [0, 2, 3, 5, 7, 8, 10],        /*  1 Minor           */
    [0, 2, 3, 5, 7, 9, 10],        /*  2 Dorian          */
    [0, 1, 3, 5, 7, 8, 10],        /*  3 Phrygian        */
    [0, 2, 4, 6, 7, 9, 11],        /*  4 Lydian          */
    [0, 2, 4, 5, 7, 9, 10],        /*  5 Mixolydian      */
    [0, 1, 3, 5, 6, 8, 10],        /*  6 Locrian         */
    [0, 2, 3, 5, 7, 8, 11],        /*  7 Harmonic Minor  */
    [0, 2, 3, 5, 7, 9, 11],        /*  8 Melodic Minor   */
    [0, 2, 4, 7, 9],               /*  9 Pentatonic Major*/
    [0, 3, 5, 7, 10],              /* 10 Pentatonic Minor*/
    [0, 3, 5, 6, 7, 10],           /* 11 Blues           */
    [0, 2, 4, 6, 8, 10],           /* 12 Whole Tone      */
    [0, 2, 3, 5, 6, 8, 9, 11],     /* 13 Diminished      */
];

export function createLiveNoteQueues(numTracks) {
    return Array.from({length: numTracks}, () => []);
}

export function queueLiveNoteOn(queues, track, pitch, vel) {
    queues[track].push({ isOff: false, pitch, vel });
}

export function queueLiveNoteOff(queues, track, pitch) {
    queues[track].push({ isOff: true, pitch });
}

export function drumPadToLane(padIdx, lanePage) {
    const col = padIdx % 8;
    if (col >= 4) return -1;
    const row = Math.floor(padIdx / 8);
    return (lanePage | 0) * 16 + row * 4 + col;
}

export function drumPadToVelZone(padIdx) {
    const col = padIdx % 8;
    if (col < 4) return -1;
    const row = Math.floor(padIdx / 8);
    return row * 4 + (col - 4);
}

export function updatePadNoteMap(S, deps) {
    const t = S.activeTrack;
    if (S.trackPadMode[t] === deps.PAD_MODE_DRUM) {
        const page = S.drumLanePage[t] | 0;
        const coRunSilentLeft = (S.moveCoRunTrack >= 0);
        for (let i = 0; i < 32; i++) {
            const lane = drumPadToLane(i, page);
            if (lane < 0) { S.padNoteMap[i] = 0xFF; continue; }
            if (coRunSilentLeft) { S.padNoteMap[i] = 0xFF; continue; }
            const note = (lane >= 0 && lane < deps.DRUM_LANES)
                ? ((S.drumLaneNote[t][lane] | 0) || (deps.DRUM_BASE_NOTE + lane))
                : 0xFF;
            S.padNoteMap[i] = note & 0xFF;
        }
        return;
    }

    const effKey   = S.xposePrevKey   !== null ? S.xposePrevKey   : S.padKey;
    const effScale = S.xposePrevScale !== null ? S.xposePrevScale : S.padScale;
    const root = S.padOctave[t] * 12 + effKey;
    const intervals = SCALE_INTERVALS[effScale] || SCALE_INTERVALS[0];
    S.padScaleSet.clear();
    for (let i = 0; i < intervals.length; i++) S.padScaleSet.add(intervals[i]);
    if (S.padLayoutChromatic[t]) {
        for (let i = 0; i < 32; i++) {
            const col = i % 8;
            const row = Math.floor(i / 8);
            const p = root + col + row * 8;
            S.padNoteMap[i] = (p < 0 || p > 127) ? 0xFF : p;
        }
    } else {
        const n = intervals.length;
        for (let i = 0; i < 32; i++) {
            const col = i % 8;
            const row = Math.floor(i / 8);
            const deg = col + row * 3;
            const oct = Math.floor(deg / n);
            const semitone = oct * 12 + intervals[deg % n];
            const p = root + semitone;
            S.padNoteMap[i] = (p < 0 || p > 127) ? 0xFF : p;
        }
    }
}

export function buildDspPadMapPayload(S, deps, padDispatchMuted) {
    const t = S.activeTrack;
    const isDrum = S.trackPadMode[t] === deps.PAD_MODE_DRUM;
    const octShift = isDrum ? 0 : ((S.trackOctave[t] | 0) * 12);
    let payload = '';
    for (let i = 0; i < 32; i++) {
        let out;
        if (padDispatchMuted && S.sessionView) {
            out = 0xFF;
        } else {
            const p = S.padNoteMap[i];
            out = (p === 0xFF) ? 0xFF : Math.max(0, Math.min(127, p + octShift));
        }
        payload += (i ? ' ' : '') + out;
    }
    payload += ' ' + (S.extSendAsyncEnabled ? 1 : 0);
    payload += ' ' + (padDispatchMuted ? 1 : 0);
    payload += ' ' + (S.deleteHeld ? 1 : 0);
    return payload;
}

export function applyPadNoteMap(S, deps) {
    updatePadNoteMap(S, deps);
    if (S.dspInboundEnabled && typeof deps.host_module_set_param === 'function') {
        const padDispatchMuted = deps.padDispatchMuted();
        const payload = buildDspPadMapPayload(S, deps, padDispatchMuted);
        deps.host_module_set_param('t' + S.activeTrack + '_padmap', payload);
        S.lastPushedMuted = padDispatchMuted;
    }
}
