/* Capacitive knob-touch note handlers (notes 0-9) split out of _onKnobTouch.
 *
 * This workflow preserves the original stateful touch-on/touch-off behavior:
 * physical knobs 0-7 update param-peek state and bank side effects; note 9
 * drives the main jog touch overview. MIDI consume/return rules stay in
 * ui_midi_internal_workflow.mjs. */

function resetTransientNudge(S, deps, d1, relPm, resetClockShiftNudge) {
    if (relPm.dspKey === 'nudge') {
        S.bankParams[S.activeTrack][S.activeBank][d1] = 0;
        if (deps.setParam) {
            const isAllLanesNudge = S.trackPadMode[S.activeTrack] === deps.padModeDrum && S.activeBank === 7;
            const isDrumNudge = S.trackPadMode[S.activeTrack] === deps.padModeDrum && S.activeBank === 0;
            if (isAllLanesNudge)
                deps.setParam('t' + S.activeTrack + '_all_lanes_nudge', '0');
            else if (isDrumNudge)
                deps.setParam('t' + S.activeTrack + '_l' + S.activeDrumLane[S.activeTrack] + '_nudge', '0');
            else
                deps.setParam('t' + S.activeTrack + '_nudge', '0');
        }
    } else if (relPm.dspKey === 'clock_shift' || relPm.dspKey === 'beat_stretch') {
        S.clockShiftTouchDelta = 0;
        S.bankParams[S.activeTrack][S.activeBank][d1] = 0;
        /* Shft knob doubles as Nudge under Shift held; the 0x90 release path
         * reset this DSP accumulator in the original handler. */
        if (resetClockShiftNudge && relPm.dspKey === 'clock_shift' && deps.setParam) {
            const isAllLanes = S.trackPadMode[S.activeTrack] === deps.padModeDrum && S.activeBank === 7;
            const isDrum = S.trackPadMode[S.activeTrack] === deps.padModeDrum && S.activeBank === 0;
            if (isAllLanes)
                deps.setParam('t' + S.activeTrack + '_all_lanes_nudge', '0');
            else if (isDrum)
                deps.setParam('t' + S.activeTrack + '_l' + S.activeDrumLane[S.activeTrack] + '_nudge', '0');
            else
                deps.setParam('t' + S.activeTrack + '_nudge', '0');
        }
    }
}

function resetKnobTouchState(S, d1) {
    S.knobTouched = -1;
    S.knobTouchStartTick = -1;
    S.knobLocked[d1] = false;
    S.knobAccum[d1] = 0;
    S.screenDirty = true;
}

export function handleUiKnobTouch(S, deps, status, d1, d2) {
    /* Knob touch (notes 0-7). MoveKnob1-8Touch = notes 0-7.
     * Hardware: d2=127 = touch on; d2 in 0-63 (via 0x90 or 0x80) = touch off.
     * Note 9 (jog touch): shows bank overview while held, locked out in global menu. */
    if (d1 < 0 || d1 > 9) return;

    if ((status & 0xF0) === 0x90) {
        if (d2 === 127) {
            if (d1 <= 7 && S.activeBank >= 0) {
                S.knobTouched = d1; S.knobTouchStartTick = S.tickCount;
                S.knobTurnedTick[d1] = -1; S.screenDirty = true;
                if (S.schwungSoundPage && S.schwungSoundPage.paramDetail) {
                    if (deps.touchSchwungSoundVisibleParam) deps.touchSchwungSoundVisibleParam(d1);
                    return;
                }
                /* CC bank: touching a knob makes it the active lane (persistent
                 * - drives the step-LED gradient and highlighted overview cell). */
                if (S.activeBank === 6 && S.trackPadMode[S.activeTrack] !== deps.padModeDrum) {
                    S.ccActiveLane[S.activeTrack] = d1;
                    deps.invalidateLEDCache();
                }
                /* Perf view: touch knob k toggles looper for track k */
                if (S.perfViewLocked) {
                    const looperTrack = d1;
                    const newLooper = S.trackLooper[looperTrack] !== 0 ? 0 : 1;
                    S.trackLooper[looperTrack] = newLooper;
                    deps.applyTrackConfig(looperTrack, 'track_looper', newLooper);
                    deps.showActionPopup('LOOPER ' + (newLooper ? 'ON' : 'OFF'), 'TRACK ' + (looperTrack + 1));
                    deps.setButtonLED(71 + looperTrack, newLooper ? deps.trackColors[looperTrack] : deps.ledOff, true);
                }
                /* CC bank: Delete+touch clears this knob's automation + resting value -> "-" */
                if (S.activeBank === 6 && S.deleteHeld && !S.shiftHeld &&
                        S.trackPadMode[S.activeTrack] !== deps.padModeDrum) {
                    const track = S.activeTrack, clip = deps.effectiveClip(track);
                    S.trackCCAutoBits[track][clip] &= ~(1 << d1);
                    S.trackCCLiveVal[track][d1] = -1;
                    S.clipCCVal[track][clip][d1] = -1;
                    if (deps.setParam)
                        deps.setParam('t' + track + '_cc_auto_clear_k', clip + ' ' + d1);
                    deps.showActionPopup('CC', 'CLEAR');
                    deps.invalidateLEDCache();
                }
                /* CC bank: touch-record - start overwriting automation while held.
                 * Initial value = current live/output value, else clip rest, else 0. */
                if (S.activeBank === 6 && !S.deleteHeld && !S.sessionView &&
                        S.recordArmed && !S.recordCountingIn &&
                        S.trackPadMode[S.activeTrack] !== deps.padModeDrum) {
                    const clip = deps.effectiveClip(S.activeTrack);
                    const liveValue = S.trackCCLiveVal[S.activeTrack][d1];
                    const restValue = S.clipCCVal[S.activeTrack][clip][d1];
                    const touchValue = liveValue >= 0 ? liveValue : (restValue >= 0 ? restValue : 0);
                    deps.setParam('t' + S.activeTrack + '_cc_touch',
                        d1 + ' 1 ' + touchValue);
                    S.trackCCAutoBits[S.activeTrack][clip] |= (1 << d1);
                }
                /* SEQ ARP K5 / TRACK ARP K5 touch: switch pads to vel-slider editor immediately. */
                if ((S.activeBank === 4 && d1 === 4) || (S.activeBank === 5 && d1 === 4)) deps.forceRedraw();
            }
            if (d1 === deps.moveMainTouch && !S.globalMenuOpen && !S.shiftHeld) { S.jogTouched = true; deps.forceRedraw(); }
        } else if (d2 < 64) {
            if (d1 <= 7) {
                if (S.schwungSoundPage && S.schwungSoundPage.paramDetail) {
                    resetKnobTouchState(S, d1);
                    return;
                }
                if (S.activeBank >= 0 && deps.banks[S.activeBank].knobs[d1]) {
                    const relPm = deps.banks[S.activeBank].knobs[d1];
                    resetTransientNudge(S, deps, d1, relPm, true);
                    /* ALL LANES: schedule display reset to '--' after ~500ms on touch release */
                    if (S.trackPadMode[S.activeTrack] === deps.padModeDrum && S.activeBank === 7) {
                        if (d1 === 0) { S.allLanesResResetTick = S.tickCount + 47; S.allLanesResResetTrack = S.activeTrack; }
                        if (d1 === 3) { S.allLanesQntResetTick = S.tickCount + 47; S.allLanesQntResetTrack = S.activeTrack; }
                        if (d1 === 6) { S.allLanesDirResetTick = S.tickCount + 47; S.allLanesDirResetTrack = S.activeTrack; }
                    }
                }
                /* CC bank: touch-record - stop overwriting automation on release */
                if (S.activeBank === 6 && S.recordArmed && !S.recordCountingIn &&
                        S.trackPadMode[S.activeTrack] !== deps.padModeDrum)
                    deps.setParam('t' + S.activeTrack + '_cc_touch', d1 + ' 0 0');
                /* SEQ ARP K5 / TRACK ARP K5 release: refresh pads (vel-slider editor -> normal pads). */
                if ((S.activeBank === 4 && d1 === 4) || (S.activeBank === 5 && d1 === 4)) deps.forceRedraw();
                resetKnobTouchState(S, d1);
            }
            if (d1 === deps.moveMainTouch && S.jogTouched) { S.jogTouched = false; S.bankSelectTick = -1; deps.forceRedraw(); }
        }
        return;
    }

    if ((status & 0xF0) === 0x80) {
        if (d1 <= 7) {
            if (S.schwungSoundPage && S.schwungSoundPage.paramDetail) {
                resetKnobTouchState(S, d1);
                return;
            }
            if (S.activeBank >= 0 && deps.banks[S.activeBank].knobs[d1]) {
                const relPm = deps.banks[S.activeBank].knobs[d1];
                resetTransientNudge(S, deps, d1, relPm, false);
                /* ALL LANES K4 (Qnt): schedule display reset to '--' after ~500ms */
                if (S.trackPadMode[S.activeTrack] === deps.padModeDrum && S.activeBank === 7 && d1 === 3) {
                    S.allLanesQntResetTick = S.tickCount + 47;
                    S.allLanesQntResetTrack = S.activeTrack;
                }
            }
            if ((S.activeBank === 4 && d1 === 4) || (S.activeBank === 5 && d1 === 4)) deps.forceRedraw();
            resetKnobTouchState(S, d1);
        }
        if (d1 === deps.moveMainTouch && S.jogTouched) { S.jogTouched = false; S.bankSelectTick = -1; deps.forceRedraw(); }
        return;
    }
}
