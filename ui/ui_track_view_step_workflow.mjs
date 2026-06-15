export function handleTrackViewCopyStepPress(S, deps, idx) {
    if (!S.copyHeld) return false;

    const track = S.activeTrack;
    const clip = deps.effectiveClip(track);
    const absStep = S.trackCurrentPage[track] * 16 + idx;

    if (!S.copySrc) {
        S.copySrc = { kind: 'step', absStep: absStep };
        deps.invalidateLEDCache();
        return true;
    }

    if (S.copySrc.kind === 'step') {
        if (S.copySrc.absStep !== absStep)
            deps.copyStep(track, clip, S.copySrc.absStep, absStep);
        deps.invalidateLEDCache();
        deps.forceRedraw();
    }

    return true;
}

export function handleTrackViewDeleteStepPress(S, deps, idx) {
    if (!S.deleteHeld) return false;

    const track = S.activeTrack;

    if (S.activeBank === 6 && S.trackPadMode[track] !== deps.padModeDrum) {
        const clip = deps.effectiveClip(track);
        const absStep = S.trackCurrentPage[track] * 16 + idx;
        const lane = S.ccActiveLane[track];
        const laneTps = S.ccLaneTps[track][clip][lane];
        const tps = laneTps > 0 ? laneTps : (S.clipTPS[track][clip] || 24);
        const tickStart = absStep * tps;
        const tickEnd = Math.min(65535, tickStart + tps - 1);

        S.undoAvailable = true;
        S.redoAvailable = false;
        S.undoSeqArpSnapshot = null;
        if (deps.setParam)
            deps.setParam('t' + track + '_cc_auto_clear_step', clip + ' ' + tickStart + ' ' + tickEnd);
        S.pendingCCBitsRefresh = clip;
        deps.showActionPopup('CC STEP', 'CLEAR');
        deps.invalidateLEDCache();
        deps.forceRedraw();
        return true;
    }

    if (S.trackPadMode[track] === deps.padModeDrum) {
        const lane = S.activeDrumLane[track];
        const absStep = S.drumStepPage[track] * 16 + idx;
        if (deps.setParam)
            deps.setParam('t' + track + '_l' + lane + '_step_' + absStep + '_clear', '1');
        S.drumLaneSteps[track][lane][absStep] = '0';
        S.drumLaneHasNotes[track][lane] = S.drumLaneSteps[track][lane].some(c => c !== '0');
        deps.forceRedraw();
        return true;
    }

    const clip = deps.effectiveClip(track);
    const absStep = S.trackCurrentPage[track] * 16 + idx;
    deps.clearStep(track, clip, absStep);
    deps.forceRedraw();
    return true;
}
