function loopGestureCtxFor(S, deps, track) {
    if (S.trackPadMode[track] !== deps.padModeDrum) {
        if (S.activeBank === 6) return 3;
        return 0;
    }
    return S.activeBank === 7 ? 2 : 1;
}

function clampPageToWindow(currentPage, startStep, lenSteps) {
    const startPage = startStep >> 4;
    const lastPage = startPage + ((lenSteps + 15) >> 4) - 1;
    if (currentPage < startPage) return startPage;
    if (currentPage > lastPage) return lastPage;
    return currentPage;
}

/* Loop+step gesture fire helper. Both the deferred fallback and the active A/B
 * range gesture route through atomic `*_loop_set` DSP keys so there is one DSP
 * write path for loop start plus length. */
function fireLoopWindowSet(S, deps, track, ctx, startStep, lenSteps) {
    if (!deps.setParam) return;
    if (ctx === 3) {
        const clip = deps.effectiveClip(track);
        const lane = S.ccActiveLane[track];
        S.ccLaneLoopStart[track][clip][lane] = startStep;
        S.ccLaneLength[track][clip][lane] = lenSteps;
        const packed = (startStep << 16) | (lenSteps & 0xFFFF);
        deps.setParam('t' + track + '_c' + clip + '_k' + lane + '_cc_loop_set', String(packed));
        S.trackCurrentPage[track] = clampPageToWindow(S.trackCurrentPage[track], startStep, lenSteps);
        return;
    }

    const packed = (startStep << 16) | (lenSteps & 0xFFFF);
    if (ctx === 0) {
        const clip = deps.effectiveClip(track);
        S.clipLength[track][clip] = lenSteps;
        S.clipLoopStart[track][clip] = startStep;
        S.clipLengthManuallySet[track][clip] = true;
        S.trackCurrentPage[track] = clampPageToWindow(S.trackCurrentPage[track], startStep, lenSteps);
        deps.setParam('t' + track + '_c' + clip + '_loop_set', String(packed));
    } else if (ctx === 1) {
        const lane = S.activeDrumLane[track];
        S.drumLaneLength[track] = lenSteps;
        S.drumLaneLoopStart[track] = startStep;
        S.drumLaneLengthManuallySet[track] = true;
        S.drumStepPage[track] = clampPageToWindow(S.drumStepPage[track], startStep, lenSteps);
        deps.setParam('t' + track + '_l' + lane + '_loop_set', String(packed));
    } else {
        S.drumLaneLength[track] = lenSteps;
        S.drumLaneLoopStart[track] = startStep;
        S.drumLaneLengthManuallySet[track] = true;
        S.drumStepPage[track] = clampPageToWindow(S.drumStepPage[track], startStep, lenSteps);
        S.pendingDrumResync = 2;
        S.pendingDrumResyncTrack = track;
        deps.setParam('t' + track + '_all_lanes_loop_set', String(packed));
    }
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
        fireLoopWindowSet(S, deps, S.loopGestureTrack, S.loopGestureCtx, startStep, lenSteps);
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
        fireLoopWindowSet(S, deps, track, ctx, newLs, newLen);
    }

    deps.forceRedraw();
    return true;
}

export function handleLoopStepRelease(S, deps, idx) {
    if (S.loopGestureStart < 0) return false;
    if (idx === S.loopGestureStart) resolveLoopGesture(S, deps, true);
    return true;
}

export function handleLoopJog(S, deps, delta) {
    const track = S.activeTrack;

    if (S.recordArmed && !S.recordCountingIn) {
        return true;
    }

    if (S.trackPadMode[track] === deps.padModeDrum) {
        const lane = S.activeDrumLane[track];
        const current = S.drumLaneLength[track];
        const next = Math.max(1, Math.min(256, current + delta));
        if (next !== current) {
            S.drumLaneLength[track] = next;
            S.drumLaneLengthManuallySet[track] = true;
            const loopStart = S.drumLaneLoopStart[track] | 0;
            const maxPage = Math.max(0, Math.floor((loopStart + next - 1) / 16));
            S.loopJogActive = true;
            S.loopJogLastTick = S.tickCount;
            S.drumStepPage[track] = maxPage;
            if (deps.setParam) {
                if (S.activeBank === 7) {
                    deps.setParam('t' + track + '_all_lanes_length', String(next));
                } else {
                    deps.setParam('t' + track + '_l' + lane + '_clip_length', String(next));
                }
            }
            deps.forceRedraw();
        }
        return true;
    }

    const clip = deps.effectiveClip(track);

    if (S.activeBank === 6) {
        const lane = S.ccActiveLane[track];
        let current = S.ccLaneLength[track][clip][lane];
        if (current === 0) {
            const clipTps = S.clipTPS[track][clip] || 24;
            const laneTps = S.ccLaneTps[track][clip][lane] || clipTps;
            current = Math.max(1, Math.round(S.clipLength[track][clip] * clipTps / laneTps));
        }
        const next = Math.max(1, Math.min(256, current + delta));
        if (next !== current) {
            S.ccLaneLength[track][clip][lane] = next;
            S.loopJogActive = true;
            S.loopJogLastTick = S.tickCount;
            const loopStart = S.ccLaneLoopStart[track][clip][lane] | 0;
            S.trackCurrentPage[track] = Math.max(0, Math.floor((loopStart + next - 1) / 16));
            if (deps.setParam) {
                deps.setParam('t' + track + '_c' + clip + '_k' + lane + '_cc_lane_length', String(next));
            }
            deps.forceRedraw();
        }
        return true;
    }

    const current = S.clipLength[track][clip];
    const next = Math.max(1, Math.min(256, current + delta));
    if (next !== current) {
        S.clipLength[track][clip] = next;
        S.clipLengthManuallySet[track][clip] = true;
        S.loopJogActive = true;
        S.loopJogLastTick = S.tickCount;
        const loopStart = S.clipLoopStart[track][clip] | 0;
        S.trackCurrentPage[track] = Math.max(0, Math.floor((loopStart + next - 1) / 16));
        if (deps.setParam) {
            deps.setParam('t' + track + '_clip_length', String(next));
        }
        deps.forceRedraw();
    }
    return true;
}
