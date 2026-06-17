export function clipIsEmptyImpl(S, deps, t, c) {
    return (S.trackPadMode[t] === deps.padModeDrum)
        ? !S.drumClipNonEmpty[t][c]
        : !S.clipNonEmpty[t][c];
}

export function focusedClipIsEmptyImpl(S, deps, t) {
    return clipIsEmptyImpl(S, deps, t, S.trackActiveClip[t]);
}

export function switchActiveTrackImpl(S, deps, newT) {
    S.trackActiveBank[S.activeTrack] = S.activeBank;
    S.activeTrack = newT | 0;
    S.activeBank = S.trackActiveBank[S.activeTrack] | 0;
    if (S.activeBank === 7) S.allLanesConfirmed = false;
    if (S.playing && !S.sessionView
            && !S.trackClipPlaying[S.activeTrack]
            && !S.trackWillRelaunch[S.activeTrack]
            && S.trackQueuedClip[S.activeTrack] === -1
            && focusedClipIsEmptyImpl(S, deps, S.activeTrack)) {
        const _ac = S.trackActiveClip[S.activeTrack];
        if (deps.setParam)
            deps.setParam('t' + S.activeTrack + '_launch_clip', String(_ac));
        S.trackQueuedClip[S.activeTrack] = _ac;
    }
}

export function selectTrackGestureImpl(S, deps, newT) {
    newT = Math.min(deps.numTracks - 1, Math.max(0, newT | 0));
    if (newT === S.activeTrack) return;
    deps.extNoteOffAll();
    deps.handoffRecordingToTrack(newT);
    switchActiveTrackImpl(S, deps, newT);
    if (S.trackPadMode[newT] === deps.padModeDrum) {
        if (S.activeBank === 2 || S.activeBank === 4) S.activeBank = 0;
        deps.resyncDrumTrack(newT);
    } else {
        if (S.activeBank === 7) S.activeBank = 0;
        deps.refreshPerClipBankParams(newT);
    }
    deps.computePadNoteMap();
    S.seqActiveNotes.clear();
    S.seqLastStep = -1;
    S.seqLastClip = -1;
    deps.forceRedraw();
}
