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
