export function trackHasAnyDataImpl(S, deps, t) {
    for (let c = 0; c < deps.numClips; c++)
        if (S.clipNonEmpty[t][c] || S.drumClipNonEmpty[t][c]) return true;
    return false;
}

export function convertTrackTypeImpl(S, deps, t, toDrum) {
    if (!deps.setParam) return;
    deps.setParam('t' + t + (toDrum ? '_convert_to_drum' : '_convert_to_melodic'), '1');
    S.trackPadMode[t] = toDrum ? deps.padModeDrum : deps.padModeMelodicScale;
    if (trackHasAnyDataImpl(S, deps, t)) deps.syncClipsFromDsp();
    else if (deps.getParam) deps.getParam('t' + t + '_pad_mode');
    if (toDrum) {
        if (t === S.activeTrack && (S.activeBank === 2 || S.activeBank === 4)) S.activeBank = 0;
    } else {
        if (t === S.activeTrack && S.activeBank === 7) S.activeBank = 0;
        S.drumVelZoneArmed[t] = false;
        S.drumLastVelZone[t]  = 0;
    }
    deps.computePadNoteMap();
    deps.invalidateLEDCache();
    deps.forceRedraw();
}

export function closeConvertConfirmImpl(S) {
    S.confirmConvertToDrum = false;
    if (S.globalMenuState) S.globalMenuState.editing = false;
    if (S.globalMenuState) S.globalMenuState.editValue = null;
    S.lastSentMenuEditValue = null;
    S.bpmWasEditing = false;
}
