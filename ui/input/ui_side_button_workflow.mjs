export function releaseUiSideButtonHoldReveal(S, deps, idx) {
    if (S.sideHeldBtn !== idx) return false;
    S.sideHeldBtn        = -1;
    S.sideBtnPressedTick = -1;
    if (S.revealClipsTrack >= 0) {
        S.revealClipsTrack = -1;
        deps.forceRedraw();
    }
    return true;
}

export function pressTrackViewSideButton(S, deps, idx) {
    /* Track View (Change #1): side button SELECTS THE ACTIVE TRACK
     * (was: clip switch, relocated to the hold-reveal overlay + Session pads).
     * Reversed mapping (CC43=track 1 ... CC40=track 4), matching the
     * Shift+bottom-pad legacy gesture. Shift banks to tracks 5-8. */
    const trackInBank = 3 - idx;
    const target      = trackInBank + (S.shiftHeld ? 4 : 0);
    deps.selectTrackGesture(target);

    /* Arm hold detection: a sustained hold promotes to the clips-reveal
     * overlay in tick() (revealClipsTrack = the now-active track). A quick
     * tap releases before the threshold and just leaves the track selected. */
    S.sideHeldBtn        = idx;
    S.sideBtnPressedTick = S.tickCount;
}

export function handleUiSideButton(S, deps, d1, d2) {
    /* Side button release: exit the hold-reveal clips overlay and clear the
     * hold-tracking state. Matched on the button that armed it. */
    if (d1 >= 40 && d1 <= 43 && d2 === 0) {
        releaseUiSideButtonHoldReveal(S, deps, d1 - 40);
        return;
    }

    if (d1 >= 40 && d1 <= 43 && d2 === 127) {
        const idx = d1 - 40;
        if (deps.handleSessionViewSideRowPress(3 - idx)) {
            return;
        }
        pressTrackViewSideButton(S, deps, idx);
    }
}
