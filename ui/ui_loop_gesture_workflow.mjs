function loopGestureCtxFor(S, deps, track) {
    if (S.trackPadMode[track] !== deps.padModeDrum) {
        if (S.activeBank === 6) return 3;
        return 0;
    }
    return S.activeBank === 7 ? 2 : 1;
}

export function handleLoopStepPress(S, deps, idx) {
    if (!S.loopHeld) return false;

    if (S.recordArmed && !S.recordCountingIn) {
        return true;
    }

    if (S.loopGestureStart < 0) {
        /* Capture context at press-time so later release is immune to track,
         * lane, clip, or bank flips while the gesture is held. */
        const track = S.activeTrack;
        const ctx = loopGestureCtxFor(S, deps, track);
        S.loopGestureStart = idx;
        S.loopGestureFired = false;
        S.loopGestureCtx = ctx;
        S.loopGestureTrack = track;
        S.loopGestureClip = (ctx === 0 || ctx === 3) ? deps.effectiveClip(track) : -1;
        S.loopGestureLane = (ctx === 1) ? S.activeDrumLane[track] : -1;
        deps.forceRedraw();
        return true;
    }

    if (idx !== S.loopGestureStart) {
        const a = Math.min(S.loopGestureStart, idx);
        const b = Math.max(S.loopGestureStart, idx);
        const startStep = a * 16;
        const lenSteps = (b - a + 1) * 16;
        deps.fireLoopWindowSet(S.loopGestureTrack, S.loopGestureCtx, startStep, lenSteps);
        S.loopGestureFired = true;
        deps.forceRedraw();
    }

    return true;
}

export function resolveLoopGesture(S, deps, fireFallback) {
    const a = S.loopGestureStart;
    if (a < 0) return false;

    const ctx = S.loopGestureCtx;
    const track = S.loopGestureTrack;
    const clip = S.loopGestureClip;
    const fired = S.loopGestureFired;
    S.loopGestureStart = -1;
    S.loopGestureFired = false;
    S.loopGestureTrack = -1;
    S.loopGestureClip = -1;
    S.loopGestureLane = -1;

    if (fired) {
        deps.forceRedraw();
        return true;
    }

    if (fireFallback) {
        /* Single-tap fallback sets an end page. Existing non-zero starts are
         * preserved unless the tap falls below the current window start. */
        let currentLs;
        let currentLen;
        if (ctx === 3) {
            const ccLane = S.ccActiveLane[track];
            currentLs = S.ccLaneLoopStart[track][clip][ccLane] | 0;
            currentLen = S.ccLaneLength[track][clip][ccLane] | 0;
            if (currentLen === 0) {
                const clipTps = S.clipTPS[track][clip] || 24;
                const laneTps = S.ccLaneTps[track][clip][ccLane] || clipTps;
                currentLs = Math.round((S.clipLoopStart[track][clip] | 0) * clipTps / laneTps);
                currentLen = Math.max(1, Math.round(S.clipLength[track][clip] * clipTps / laneTps));
            }
        } else if (ctx === 0) {
            currentLs = S.clipLoopStart[track][clip] | 0;
            currentLen = S.clipLength[track][clip] | 0;
        } else {
            currentLs = S.drumLaneLoopStart[track] | 0;
            currentLen = S.drumLaneLength[track] | 0;
        }

        const startPage = currentLs >> 4;
        let newLs;
        let newLen;
        if (currentLs === 0 || a < startPage) {
            newLs = 0;
            newLen = (a + 1) * 16;
        } else {
            newLs = currentLs;
            newLen = (a - startPage + 1) * 16;
        }
        if (newLen === currentLen && currentLen === 32) {
            newLen = 16;
        }
        deps.fireLoopWindowSet(track, ctx, newLs, newLen);
    }

    deps.forceRedraw();
    return true;
}

export function handleLoopStepRelease(S, deps, idx) {
    if (S.loopGestureStart < 0) return false;
    if (idx === S.loopGestureStart) resolveLoopGesture(S, deps, true);
    return true;
}
