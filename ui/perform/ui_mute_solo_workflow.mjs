export function effectiveMuteImpl(S, t) {
    const anySolo = S.trackSoloed.some(function(s) { return s; });
    return S.trackMuted[t] || (anySolo && !S.trackSoloed[t]);
}

export function setTrackMuteImpl(S, deps, t, on) {
    S.trackMuted[t] = on;
    if (on && S.trackSoloed[t]) {
        S.trackSoloed[t] = false;
        if (typeof deps.setParam === 'function')
            deps.setParam('t' + t + '_solo', '0');
    }
    if (typeof deps.setParam === 'function')
        deps.setParam('t' + t + '_mute', on ? '1' : '0');
    S.screenDirty = true;
}

export function setTrackSoloImpl(S, deps, t, on) {
    S.trackSoloed[t] = on;
    if (on && S.trackMuted[t]) {
        S.trackMuted[t] = false;
        if (typeof deps.setParam === 'function')
            deps.setParam('t' + t + '_mute', '0');
    }
    if (typeof deps.setParam === 'function')
        deps.setParam('t' + t + '_solo', on ? '1' : '0');
    S.screenDirty = true;
}

export function clearAllMuteSoloImpl(S, deps) {
    for (let _t = 0; _t < deps.numTracks; _t++) {
        S.trackMuted[_t]  = false;
        S.trackSoloed[_t] = false;
    }
    if (typeof deps.setParam === 'function')
        deps.setParam('mute_all_clear', '1');
    S.screenDirty = true;
}
