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

export function handleTrackViewDrumStepPress(S, deps, idx) {
    if (S.shiftHeld || S.trackPadMode[S.activeTrack] !== deps.padModeDrum)
        return false;

    const track = S.activeTrack;
    const lane = S.activeDrumLane[track];
    const absStep = S.drumStepPage[track] * 16 + idx;
    S.stepBtnPressedTick[idx] = S.tickCount;

    if (S.heldStep < 0) {
        S.heldStepBtn = idx;
        S.heldStep = absStep;
        const cur = S.drumLaneSteps[track][lane][absStep];
        if (cur !== '0') {
            S.stepWasEmpty = false;
            S.heldStepNotes = [S.drumLaneNote[track][lane]];
            const rv = deps.getParam ? deps.getParam('t' + track + '_l' + lane + '_step_' + absStep + '_vel') : null;
            const rg = deps.getParam ? deps.getParam('t' + track + '_l' + lane + '_step_' + absStep + '_gate') : null;
            const rn = deps.getParam ? deps.getParam('t' + track + '_l' + lane + '_step_' + absStep + '_nudge') : null;
            S.stepEditVel = rv !== null ? parseInt(rv, 10) : 100;
            S.stepEditGate = rg !== null ? parseInt(rg, 10) : Math.max(1, Math.floor((S.drumLaneTPS[track] || 24) / 2));
            S.stepEditNudge = rn !== null ? parseInt(rn, 10) : 0;
            const ri = deps.getParam ? deps.getParam('t' + track + '_l' + lane + '_step_' + absStep + '_iter') : null;
            const rr = deps.getParam ? deps.getParam('t' + track + '_l' + lane + '_step_' + absStep + '_rand') : null;
            const rx = deps.getParam ? deps.getParam('t' + track + '_l' + lane + '_step_' + absStep + '_ratch') : null;
            S.stepEditIter = ri !== null ? parseInt(ri, 10) : 0;
            S.stepEditRand = rr !== null ? parseInt(rr, 10) : 0;
            S.stepEditRatch = rx !== null ? parseInt(rx, 10) : 0;
        } else {
            S.stepWasEmpty = true;
            S.heldStepNotes = [];
            S.stepEditVel = deps.stepEntryVelocity(track, -1, true);
            S.stepEditGate = Math.max(1, Math.floor((S.drumLaneTPS[track] || 24) / 2));
            S.stepEditNudge = 0;
            S.stepEditIter = 0;
            S.stepEditRand = 0;
            S.stepEditRatch = 0;
        }
        deps.forceRedraw();
    } else if (S.stepBtnPressedTick[S.heldStepBtn] >= 0) {
        const absStep2 = S.drumStepPage[track] * 16 + idx;
        const cur2 = S.drumLaneSteps[track][lane][absStep2];
        if (deps.setParam) {
            if (cur2 !== '1') {
                deps.setParam('t' + track + '_l' + lane + '_step_' + absStep2 + '_toggle', String(deps.stepEntryVelocity(track, -1, true)));
                S.drumLaneSteps[track][lane][absStep2] = '1';
                S.drumLaneHasNotes[track][lane] = true;
            } else {
                deps.setParam('t' + track + '_l' + lane + '_step_' + absStep2 + '_clear', '1');
                S.drumLaneSteps[track][lane][absStep2] = '0';
                S.drumLaneHasNotes[track][lane] = S.drumLaneSteps[track][lane].some(c => c !== '0');
            }
        }
        S.stepBtnPressedTick[idx] = -1;
        deps.forceRedraw();
    } else if (S.heldStepNotes.length > 0) {
        S.stepBtnPressedTick[S.heldStepBtn] = -1;
        S.stepWasHeld = true;
        const tappedStep = S.drumStepPage[track] * 16 + idx;
        if (tappedStep !== S.heldStep) {
            const len = S.drumLaneLength[track];
            const tps = S.drumLaneTPS[track] || 24;
            /* Gate extends through the tapped step, up to tappedStep + 1. */
            const dist = tappedStep > S.heldStep
                ? tappedStep - S.heldStep + 1
                : len - S.heldStep + tappedStep + 1;
            const newGate = Math.max(1, Math.min(dist * tps, 65535));
            if (deps.setParam)
                deps.setParam('t' + track + '_l' + lane + '_step_' + S.heldStep + '_gate', String(newGate));
            S.stepEditGate = newGate;
            deps.forceRedraw();
        }
    }

    return true;
}

export function handleTrackViewMelodicStepPress(S, deps, idx) {
    if (S.shiftHeld || S.trackPadMode[S.activeTrack] === deps.padModeDrum)
        return false;

    S.stepBtnPressedTick[idx] = S.tickCount;

    if (S.heldStep < 0) {
        const clip = deps.effectiveClip(S.activeTrack);
        const absStep = S.trackCurrentPage[S.activeTrack] * 16 + idx;
        S.heldStepBtn = idx;
        S.heldStep = absStep;

        const stepState = S.clipSteps[S.activeTrack][clip][absStep];
        if (stepState === 0) {
            S.stepWasEmpty = true;
            S.heldStepNotes = [];
            if (S.activeBank === 6) {
                S.ccStepEditActive = true;
            } else {
                S.stepEditVel = 100;
                S.stepEditGate = (S.clipTPS[S.activeTrack][clip] || 24);
                S.stepEditNudge = 0;
                S.stepEditIter = 0;
                S.stepEditRand = 0;
                S.stepEditRatch = 0;
            }
        } else {
            S.stepWasEmpty = false;
            S.heldStepNotes = [];
            if (S.activeBank === 6) {
                S.ccStepEditActive = true;
            } else {
                S.stepEditVel = 100;
                S.stepEditGate = (S.clipTPS[S.activeTrack][clip] || 24);
                S.stepEditNudge = 0;
                S.stepEditIter = 0;
                S.stepEditRand = 0;
                S.stepEditRatch = 0;
            }
        }

        if (S.liveActiveNotes.size > 0 && S.activeBank !== 6) {
            S.pendingChordToStep = {
                t: S.activeTrack,
                ac: clip,
                step: absStep,
                wasEmpty: stepState === 0,
                pitches: [...S.liveActiveNotes].sort(function(a, b) { return a - b; }),
                vel: deps.stepEntryVelocity(S.activeTrack, deps.effectiveVelocity(S.lastPadVelocity), false)
            };
            S.stepBtnPressedTick[idx] = -1;
            S.stepWasHeld = true;
        }
        deps.forceRedraw();
    } else if (S.stepBtnPressedTick[S.heldStepBtn] >= 0 && S.activeBank !== 6) {
        const clip = deps.effectiveClip(S.activeTrack);
        const absStep = S.trackCurrentPage[S.activeTrack] * 16 + idx;
        const prefix = 't' + S.activeTrack + '_c' + clip + '_step_' + absStep;
        const stepState = S.clipSteps[S.activeTrack][clip][absStep];
        if (stepState === 0) {
            const assignNote = S.lastPlayedNote >= 0 ? S.lastPlayedNote : -1;
            if (assignNote >= 0 && deps.setParam) {
                deps.setParam(prefix + '_toggle', assignNote + ' ' + deps.stepEntryVelocity(S.activeTrack, -1, false));
                S.clipSteps[S.activeTrack][clip][absStep] = 1;
                S.clipNonEmpty[S.activeTrack][clip] = true;
                deps.refreshSeqNotesIfCurrent(S.activeTrack, clip, absStep);
            }
        } else if (stepState === 1) {
            if (deps.setParam)
                deps.setParam(prefix, '0');
            S.clipSteps[S.activeTrack][clip][absStep] = 2;
            if (S.clipNonEmpty[S.activeTrack][clip])
                S.clipNonEmpty[S.activeTrack][clip] = deps.clipHasContent(S.activeTrack, clip);
            deps.refreshSeqNotesIfCurrent(S.activeTrack, clip, absStep);
        } else {
            if (deps.setParam)
                deps.setParam(prefix, '1');
            S.clipSteps[S.activeTrack][clip][absStep] = 1;
            S.clipNonEmpty[S.activeTrack][clip] = true;
            deps.refreshSeqNotesIfCurrent(S.activeTrack, clip, absStep);
        }
        S.stepBtnPressedTick[idx] = -1;
        deps.forceRedraw();
    } else if (S.heldStepNotes.length > 0 && S.activeBank !== 6) {
        S.stepBtnPressedTick[S.heldStepBtn] = -1;
        S.stepWasHeld = true;
        const clip = deps.effectiveClip(S.activeTrack);
        const tappedStep = S.trackCurrentPage[S.activeTrack] * 16 + idx;
        if (tappedStep !== S.heldStep) {
            const len = S.clipLength[S.activeTrack][clip];
            const tps = S.clipTPS[S.activeTrack][clip] || 24;
            /* Gate extends through the tapped step; repeat tap shrinks to prior span. */
            const dist = tappedStep > S.heldStep
                ? tappedStep - S.heldStep + 1
                : len - S.heldStep + tappedStep + 1;
            const spanGate = dist * tps;
            const newGate = Math.max(1, Math.min(
                S.stepEditGate >= spanGate ? (dist - 1) * tps : spanGate, 65535));
            if (deps.setParam)
                deps.setParam('t' + S.activeTrack + '_c' + clip + '_step_' + S.heldStep + '_gate', String(newGate));
            S.stepEditGate = newGate;
            deps.forceRedraw();
        }
    }

    return true;
}

export function handleTrackViewStepRelease(S, deps, btn) {
    if (btn !== S.heldStepBtn)
        return false;

    if (S.trackPadMode[S.activeTrack] === deps.padModeDrum) {
        const track = S.activeTrack;
        const lane = S.activeDrumLane[track];
        let drumStepCleared = false;

        if (S.stepBtnPressedTick[btn] >= 0) {
            S.stepBtnPressedTick[btn] = -1;
            if (S.stepWasEmpty) {
                const writeVel = deps.stepEntryVelocity(track, -1, true);
                S.stepEditVel = writeVel;
                if (deps.setParam)
                    deps.setParam('t' + track + '_l' + lane + '_step_' + S.heldStep + '_toggle', String(writeVel));
                S.drumLaneSteps[track][lane][S.heldStep] = '1';
                S.drumLaneHasNotes[track][lane] = true;
            } else {
                if (deps.setParam)
                    deps.setParam('t' + track + '_l' + lane + '_step_' + S.heldStep + '_clear', '1');
                S.drumLaneSteps[track][lane][S.heldStep] = '0';
                S.drumLaneHasNotes[track][lane] = S.drumLaneSteps[track][lane].some(c => c !== '0');
                drumStepCleared = true;
            }
            if (deps.getParam) {
                const clip = S.trackActiveClip[track];
                const hasContent = deps.getParam('t' + track + '_c' + clip + '_drum_has_content');
                S.drumClipNonEmpty[track][clip] = hasContent === '1';
            }
        }

        let drumDidReassign = false;
        if (S.stepWasHeld && S.heldStepNotes.length > 0) {
            const tpsMid = Math.floor((S.drumLaneTPS[track] || 24) / 2);
            let dstStep = -1;
            if (S.stepEditNudge >= tpsMid)
                dstStep = (S.heldStep + 1) % S.drumLaneLength[track];
            else if (S.stepEditNudge < -tpsMid)
                dstStep = (S.heldStep - 1 + S.drumLaneLength[track]) % S.drumLaneLength[track];
            if (dstStep >= 0) {
                if (deps.setParam)
                    deps.setParam('t' + track + '_l' + lane + '_step_' + S.heldStep + '_reassign', String(dstStep));
                S.drumLaneSteps[track][lane][S.heldStep] = '0';
                S.pendingDrumLaneResync = 3;
                S.pendingDrumLaneResyncTrack = track;
                S.pendingDrumLaneResyncLane = lane;
                drumDidReassign = true;
            }
        }

        if (!drumStepCleared && !drumDidReassign && S.heldStepNotes.length > 0) {
            if (deps.setParam)
                deps.setParam('t' + track + '_l' + lane + '_step_' + S.heldStep + '_vel', String(S.stepEditVel));
        }
    } else {
        if (S.stepBtnPressedTick[btn] >= 0 && S.activeBank !== 6) {
            const clip = deps.effectiveClip(S.activeTrack);
            const absIdx = S.heldStep;
            S.stepBtnPressedTick[btn] = -1;
            if (S.stepWasEmpty) {
                if (S.lastPlayedNote >= 0) {
                    const assignNote = S.lastPlayedNote;
                    const assignVel = deps.stepEntryVelocity(S.activeTrack, -1, false);
                    if (deps.setParam)
                        deps.setParam('t' + S.activeTrack + '_c' + clip + '_step_' + absIdx + '_toggle', assignNote + ' ' + assignVel);
                    S.clipSteps[S.activeTrack][clip][absIdx] = 1;
                    S.clipNonEmpty[S.activeTrack][clip] = true;
                    deps.refreshSeqNotesIfCurrent(S.activeTrack, clip, absIdx);
                } else {
                    S.noNoteFlashEndTick = S.tickCount + deps.noNoteFlashTicks;
                    S.screenDirty = true;
                }
            } else {
                deps.clearStep(S.activeTrack, clip, absIdx);
                deps.refreshSeqNotesIfCurrent(S.activeTrack, clip, absIdx);
            }
        }

        if (S.stepWasHeld && S.heldStep >= 0 && S.heldStepNotes.length > 0 && S.activeBank !== 6) {
            const clip = deps.effectiveClip(S.activeTrack);
            const len = S.clipLength[S.activeTrack][clip];
            let dstStep = -1;
            if (S.stepEditNudge >= 12)
                dstStep = (S.heldStep + 1) % len;
            else if (S.stepEditNudge <= -13)
                dstStep = (S.heldStep - 1 + len) % len;
            if (dstStep >= 0) {
                if (deps.setParam)
                    deps.setParam('t' + S.activeTrack + '_c' + clip + '_step_' + S.heldStep + '_reassign', String(dstStep));
                S.clipSteps[S.activeTrack][clip][S.heldStep] = 0;
            }
            S.pendingStepsReread = 2;
            S.pendingStepsRereadTrack = S.activeTrack;
            S.pendingStepsRereadClip = clip;
        }
    }

    S.heldStepBtn = -1;
    S.heldStep = -1;
    S.heldStepNotes = [];
    S.stepWasEmpty = false;
    S.stepWasHeld = false;
    deps.forceRedraw();
    return true;
}
