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

export function handleTrackViewMuteStepPress(S) {
    if (!S.muteHeld) return false;

    /* Track View Mute+step currently falls through to normal step editing. */
    return false;
}

export function handleTrackViewShiftStepPress(S, deps, idx) {
    if (!S.shiftHeld) return false;

    deps.doShiftStepCommon(idx);

    const track = S.activeTrack;
    const isDrum = S.trackPadMode[track] === deps.padModeDrum;

    if (idx === 7) {
        if (isDrum) {
            deps.cycleDrumRepeatPerformMode(track);
        } else {
            S.padLayoutChromatic[track] = !S.padLayoutChromatic[track];
            deps.computePadNoteMap();
            deps.showActionPopup(S.padLayoutChromatic[track] ? 'CHROMATIC' : 'IN-SCALE');
        }
    } else if (idx === 9) {
        const curVel = S.trackVelOverride[track];
        const nextVel = curVel === 0 ? 100 : 0;
        deps.applyTrackConfig(track, 'track_vel_override', nextVel);
    } else if (idx === 10 && !isDrum) {
        const curStyle = S.bankParams[track][5][0] | 0;
        const nextStyle = curStyle !== 0 ? 0 : S.lastTarpStyle[track];
        S.bankParams[track][5][0] = nextStyle;
        deps.applyBankParam(track, 5, 0, nextStyle);
    } else if (idx === 14) {
        if (S.activeBank === 6 && !isDrum) {
            deps.doLaneDoubleFill();
        } else {
            deps.doDoubleFill();
        }
    } else if (idx === 15 && S.activeBank !== 6) {
        if (isDrum) {
            if (S.activeBank === 7) {
                if (deps.setParam)
                    deps.setParam('t' + track + '_drum_lanes_qnt', '100');
                S.bankParams[track][7][3] = 100;
                S.drumLaneQnt[track] = 100;
                S.bankParams[track][1][2] = 100;
            } else {
                const lane = S.activeDrumLane[track];
                if (deps.setParam)
                    deps.setParam('t' + track + '_l' + lane + '_pfx_set', 'quantize 100');
                S.drumLaneQnt[track] = 100;
                S.bankParams[track][1][2] = 100;
            }
        } else {
            if (deps.setParam)
                deps.setParam('t' + track + '_quantize', '100');
            S.bankParams[track][1][3] = 100;
        }
        deps.showActionPopup('QUANT 100%');
    }

    deps.forceRedraw();
    return true;
}
