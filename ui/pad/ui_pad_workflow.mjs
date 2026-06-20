/* Pad-surface handlers split out of _onPadPress / _onPadPressTrackView /
 * _onPadRelease.
 *
 * The pad grid (notes 68-99) and the step buttons (notes 16-31) emit note-on
 * (0x90 d2>0) and note-off (0x80, or 0x90 d2==0) MIDI. _onMidiInternal routes
 * those to _onPadPress / _onPadRelease, which each ran a long ladder of context
 * checks (co-run inject, tap-tempo, arp step-interval editors, performance-mode
 * intercept, session-view clip launch, then track-view note/drum dispatch) and
 * an early `return;` per consumed context.
 *
 * Each consuming handler here:
 *   - returns false when its context guard doesn't match (fall through to the
 *     next handler), and
 *   - returns true when it consumed the event (mirrors the original `return;`).
 *
 * A couple of handlers are pure side effects that the original ran WITHOUT a
 * return (the co-run drum inject on press, and the co-run note-off on release):
 * those return nothing and are dispatched as plain statements.
 *
 * The track-view note/drum chain (handleUiPadTrackViewDrumOrMelodic) is kept as
 * ONE handler rather than split per branch: in the original it is a single
 * if/else-if selection over shared modifier state (drum-mode handling, melodic
 * step-edit, Shift+bank-select, Shift+track-select, live note), and the
 * mutual-exclusivity lives in the else-if chaining itself. Splitting it into
 * independent boolean handlers would require replicating each branch's negation
 * of the prior guards — error-prone with no upside. The leading guarded blocks
 * that DO early-return (drum lane reset/clear, drum-repeat, capture-select) are
 * separate handlers ahead of it.
 *
 * Handlers take everything via deps so they can be unit-tested without the host. */

import { enqueueDrumRecNoteOff, isArmedForTrack } from '../perform/ui_recording_workflow.mjs';

/* ----------------------------------------------------------------------------
 * _onPadPress preamble + contexts
 * ------------------------------------------------------------------------- */

/* Move-native co-run + drum-mode active track: inject a plain pad-on on cable 0
 * so Move firmware both plays the drum and focuses that cell for editing.
 * Overture suppresses its own monitor note for this pad, so the tap is one
 * Move-native hit at the real pad velocity. Side effect only — the original did
 * NOT return here, so this is dispatched as a statement (returns nothing). */
export function handleUiPadCoRunDrumInject(S, deps, status, d1, d2) {
    if (S.moveCoRunTrack >= 0 &&
            S.trackPadMode[S.activeTrack] === deps.padModeDrum &&
            d1 >= 68 && d1 <= 99 && ((d1 - 68) % 8) < 4 &&
            (status & 0xF0) === 0x90 && d2 > 0 &&
            deps.injectToMove) {
        deps.injectToMove([0x09, 0x90, d1, d2 & 0x7F]);  /* plain pad on */
        S.moveCoRunDrumHeld = d1;
    }
}

/* Tap-tempo dialog open: a grid pad registers a tap. */
export function handleUiPadTapTempo(S, deps, d1) {
    if (S.tapTempoOpen && d1 >= 68 && d1 <= 99) {
        deps.registerTapTempo(d1);
        return true;
    }
    return false;
}

/* Arp Steps interval mode (jog-clicked into bank 4): pad press = step vel level edit.
 * Column = step (0..7); row sets level (1=bottom..4=top). Bottom-row press when
 * already at level 1 → level 0 (step off). Persistent (no Steps Mode gate).
 * Loop-held: pad column sets step pattern loop length (1..8). */
export function handleUiPadArpStepIntervalSeq(S, deps, d1) {
    if (!S.sessionView && S.stepIntervalMode && S.activeBank === 4 &&
            d1 >= 68 && d1 <= 99) {
        const idx = d1 - 68;
        const col = idx % 8;
        const t   = S.activeTrack;
        const ac  = deps.effectiveClip(t);
        if (S.loopHeld) {
            const newLen = col + 1;
            if (S.seqArpStepLoopLen[t][ac] !== newLen) {
                S.seqArpStepLoopLen[t][ac] = newLen;
                if (deps.setParam)
                    deps.setParam('t' + t + '_seq_arp_step_loop_len', String(newLen));
                deps.forceRedraw();
            }
            return true;
        }
        const row = Math.floor(idx / 8);
        const cur = S.seqArpStepVel[t][ac][col] | 0;
        const newLvl = (row === 0 && cur === 1) ? 0 : (row + 1);
        if (newLvl !== cur) {
            S.seqArpStepVel[t][ac][col] = newLvl;
            if (deps.setParam)
                deps.setParam('t' + t + '_seq_arp_step_vel', col + ' ' + newLvl);
            deps.forceRedraw();
        }
        return true;
    }
    return false;
}

/* Arp Steps interval mode (jog-clicked into bank 5 = TARP): pad press = step vel level edit.
 * Loop-held: pad column sets step pattern loop length (1..8). */
export function handleUiPadArpStepIntervalTarp(S, deps, d1) {
    if (!S.sessionView && S.stepIntervalMode && S.activeBank === 5 &&
            d1 >= 68 && d1 <= 99) {
        const idx = d1 - 68;
        const col = idx % 8;
        const t   = S.activeTrack;
        if (S.loopHeld) {
            const newLen = col + 1;
            if (S.tarpStepLoopLen[t] !== newLen) {
                S.tarpStepLoopLen[t] = newLen;
                if (deps.setParam)
                    deps.setParam('t' + t + '_tarp_step_loop_len', String(newLen));
                deps.forceRedraw();
            }
            return true;
        }
        const row = Math.floor(idx / 8);
        const cur = S.tarpStepVel[t][col] | 0;
        const newLvl = (row === 0 && cur === 1) ? 0 : (row + 1);
        if (newLvl !== cur) {
            S.tarpStepVel[t][col] = newLvl;
            if (deps.setParam)
                deps.setParam('t' + t + '_tarp_step_vel', col + ' ' + newLvl);
            deps.forceRedraw();
        }
        return true;
    }
    return false;
}

/* Performance Mode pad intercept: absorb all pad presses when Perf Mode is active. */
export function handleUiPadPerfMode(S, deps, d1) {
    if (S.sessionView && (S.loopHeld || S.perfViewLocked) && d1 >= 68 && d1 <= 99) {
        if (d1 >= 68 && d1 <= 75) {
            /* R0: rate pads 0-4 (arm/stack), hold (5), sync (6), latch (7) */
            const subIdx = d1 - 68;
            if (subIdx === 7) {
                S.perfLatchPressedTick = S.tickCount;
            } else if (subIdx === 6) {
                S.perfSync = !S.perfSync;
                if (deps.setParam)
                    deps.setParam('looper_sync', S.perfSync ? '1' : '0');
            } else if (subIdx === 5) {
                /* Hold pad: in sticky mode → cancel sticky + stop loop.
                 * Otherwise → momentary hold (length releases don't pop while held). */
                if (S.perfStickyLengths.size > 0) {
                    S.perfStickyLengths = new Set();
                    S.perfStack         = [];
                    if (!S.loopHeld) S.perfViewLocked = false;
                    if (deps.setParam)
                        deps.setParam('looper_stop', '1');
                } else {
                    S.perfHoldPadHeld = true;
                }
            } else {
                const ticks = deps.looperRatesStraight[subIdx];
                if (S.shiftHeld) {
                    /* Shift+length toggles sticky hold for that length */
                    if (S.perfStickyLengths.has(subIdx)) {
                        /* Remove sticky + pop from stack */
                        S.perfStickyLengths.delete(subIdx);
                        const sIdx = S.perfStack.findIndex(function(e) { return e.idx === subIdx; });
                        if (sIdx >= 0) S.perfStack.splice(sIdx, 1);
                        if (deps.setParam) {
                            if (S.perfStack.length === 0) deps.setParam('looper_stop', '1');
                            else deps.setParam('looper_arm', String(S.perfStack[S.perfStack.length - 1].ticks));
                        }
                        if (S.perfStickyLengths.size === 0 && !S.loopHeld) S.perfViewLocked = false;
                    } else {
                        /* Add sticky + ensure on stack + lock view */
                        S.perfStickyLengths.add(subIdx);
                        if (S.perfStack.findIndex(function(e) { return e.idx === subIdx; }) < 0) {
                            S.perfStack.push({ idx: subIdx, ticks: ticks });
                            if (deps.setParam)
                                deps.setParam('looper_arm', String(ticks));
                        }
                        S.perfViewLocked = true;
                    }
                } else {
                    const inStack = S.perfStack.findIndex(function(e) { return e.idx === subIdx; }) >= 0;
                    const inHeld  = S.perfStickyLengths.has(subIdx) || S.perfHoldPadHeld;
                    if (!inStack) {
                        S.perfStack.push({ idx: subIdx, ticks: ticks });
                        if (deps.setParam)
                            deps.setParam('looper_arm', String(ticks));
                    } else if (inHeld) {
                        /* Re-trigger capture for a held loop: atomic stop + arm */
                        if (deps.setParam)
                            deps.setParam('looper_retrigger', String(ticks));
                    }
                }
            }
        } else {
            const modIdx = deps.perfModPadMap[d1];
            if (modIdx !== undefined) {
                const bit = (1 << modIdx);
                if (S.perfLatchMode) {
                    S.perfModsToggled ^= bit;
                } else if (S.perfModsToggled & bit) {
                    /* Non-latch press on an already-on bit (e.g. from preset recall):
                     * clear it instead of stacking a momentary held bit on top. */
                    S.perfModsToggled &= ~bit;
                } else {
                    S.perfModsHeld |= bit;
                }
                S.perfModPopupName    = deps.perfModFullNames[modIdx] || '';
                S.perfModPopupEndTick = S.tickCount + deps.perfModPopupTicks;
                deps.sendPerfMods();
            }
        }
        deps.forceRedraw();
        return true;
    }
    return false;
}

/* ----------------------------------------------------------------------------
 * _onPadPressTrackView ladder (track-view pad dispatch)
 * ------------------------------------------------------------------------- */

/* Drum lane RESET: Shift+Delete+lane pad — full factory reset (length, loop,
 * pfx, Rpt groove all wiped). midi_note is preserved (lane identity). */
export function handleUiPadTrackViewDrumLaneReset(S, deps, d1) {
    if (d1 < deps.trackPadBase || d1 >= deps.trackPadBase + 32) return false;
    const padIdx = d1 - deps.trackPadBase;
    if (S.trackPadMode[S.activeTrack] === deps.padModeDrum && S.shiftHeld && S.deleteHeld) {
        const t    = S.activeTrack;
        const lane = deps.drumPadToLane(padIdx);
        deps.drumLaneFactoryReset(t, lane);
        return true;
    }
    return false;
}

/* Drum lane CLEAR: Delete+lane pad (no shift) — notes-only clear, preserves
 * length, loop window, pfx params, midi_note. Undoable. */
export function handleUiPadTrackViewDrumLaneClear(S, deps, d1) {
    if (d1 < deps.trackPadBase || d1 >= deps.trackPadBase + 32) return false;
    const padIdx = d1 - deps.trackPadBase;
    if (S.trackPadMode[S.activeTrack] === deps.padModeDrum && !S.shiftHeld && S.deleteHeld) {
        const t    = S.activeTrack;
        const lane = deps.drumPadToLane(padIdx);
        deps.deleteDrumLaneClear(t, lane, {
            markUndo: true,
            popupArgs: ['LANE', 'CLEARED']
        });
        return true;
    }
    return false;
}

/* Drum-repeat (Rpt groove) pad gesture — unconditional within the pad range,
 * regardless of pad mode. Returns true when the repeat workflow consumed it. */
export function handleUiPadTrackViewDrumRepeat(S, deps, d1, d2) {
    if (d1 < deps.trackPadBase || d1 >= deps.trackPadBase + 32) return false;
    const padIdx = d1 - deps.trackPadBase;
    return deps.drumRepeatPadPress(padIdx, d2) ? true : false;
}

/* Capture + drum pad: silently select lane without playing a note. Consumes
 * only when the capture workflow handled the lane; otherwise falls through to
 * the normal drum-mode handling (matches the original non-returning guard). */
export function handleUiPadTrackViewCaptureDrumLane(S, deps, d1) {
    if (d1 < deps.trackPadBase || d1 >= deps.trackPadBase + 32) return false;
    const padIdx = d1 - deps.trackPadBase;
    if (S.trackPadMode[S.activeTrack] === deps.padModeDrum && S.captureHeld && !S.muteHeld && !S.copyHeld && !S.deleteHeld) {
        const t = S.activeTrack;
        const drumPadTarget = deps.resolveDrumPadTarget(padIdx, S.drumLanePage[t], deps.drumLanes);
        if (deps.captureDrumLanePress(padIdx, drumPadTarget)) {
            return true;
        }
    }
    return false;
}

/* Drum-mode handling OR melodic note/step/bank/track dispatch — the shared
 * if/else-if selection. Reached only after the returning guards above did not
 * consume the press. Consumes the pad whenever d1 is in the grid range. */
export function handleUiPadTrackViewDrumOrMelodic(S, deps, d1, d2) {
    if (d1 < deps.trackPadBase || d1 >= deps.trackPadBase + 32) return false;
    const padIdx = d1 - deps.trackPadBase;
    /* Drum mode pad handling */
    if (S.trackPadMode[S.activeTrack] === deps.padModeDrum && (!S.shiftHeld || S.muteHeld || S.copyHeld)) {
        const t = S.activeTrack;
        const drumPadTarget = deps.resolveDrumPadTarget(padIdx, S.drumLanePage[t], deps.drumLanes);
        const lane = drumPadTarget.kind === 'lane' ? drumPadTarget.lane : -1;
        const velZone = drumPadTarget.kind === 'velocity' ? drumPadTarget.zone : -1;
        if (velZone >= 0) {
            deps.drumVelocityPadPress(padIdx, drumPadTarget);
        } else if (lane >= 0 && lane < deps.drumLanes && S.copyHeld && !S.muteHeld) {
            deps.drumLaneCopyPaste(t, lane);
        } else if (lane >= 0 && lane < deps.drumLanes && S.muteHeld) {
            deps.drumLaneMuteSolo(t, lane);
        } else if (lane >= 0 && lane < deps.drumLanes) {
            if (S.deleteHeld) {
                deps.deleteDrumLaneClear(t, lane, {
                    refreshBankParams: true,
                    popupArgs: ['LANE CLEARED']
                });
            } else {
                deps.drumLanePadPress(padIdx, d2, drumPadTarget);
            }
        }
    } else if (S.heldStep >= 0 && !S.shiftHeld) {
        /* Step edit: tap pad to toggle note assignment for held step */
        if (S.padNoteMap[padIdx] === 0xFF) return true; /* OOB pad — no note to toggle */
        const _pitchRaw = S.padNoteMap[padIdx] + S.trackOctave[S.activeTrack] * 12;
        if (_pitchRaw < 0 || _pitchRaw > 127) return true; /* OOB after track-octave shift */
        const pitch = _pitchRaw;
        const vel = deps.effectiveVelocity(d2);
        deps.melodicStepNoteAssignment(
            pitch,
            deps.stepEntryVelocity(S.activeTrack, vel, false)
        );
        /* Preview note */
        deps.padPitch[padIdx] = pitch;
        S.liveActiveNotes.add(pitch);
        deps.liveSendNote(S.activeTrack, 0x90, pitch, vel);
    } else if (S.shiftHeld && padIdx >= 24 && padIdx <= 31) {
        const _padOff = padIdx - 24;
        const _isDrum = S.trackPadMode[S.activeTrack] === deps.padModeDrum;
        let bankIdx;
        if (_isDrum) {
            /* Drum pad map: 92=ALL LANES(7) 93=DRUM LANE(0) 94=NOTE FX(1)
                             95=MIDI DLY(3) 96=RPT GROOVE(5) 97=hidden
                             98=CC PARAM(6) 99=hidden */
            const DRUM_PAD_MAP = [7, 0, 1, 3, 5, -1, 6, -1];
            bankIdx = DRUM_PAD_MAP[_padOff];
        } else {
            bankIdx = _padOff;
        }
        if (bankIdx >= 0 && bankIdx <= 7 && deps.banks[bankIdx]) {
            if (S.activeBank === bankIdx) {
                S.bankSelectTick = -1;
            } else {
                S.activeBank = bankIdx;
                S.trackActiveBank[S.activeTrack] = bankIdx;
                if (bankIdx === 7) S.allLanesConfirmed = false;
                if (bankIdx === 6) S.schLabelFetchLane = 0;
                deps.readBankParams(S.activeTrack, bankIdx);
                S.bankSelectTick = S.tickCount;
                deps.writeSidecar();
            }
            S.screenDirty = true;
        }
    } else if (S.shiftHeld && padIdx < deps.numTracks) {
        /* Shift + bottom-row pad: select active track (legacy fallback to the
         * Change #1 side-button track-select; shares selectTrackGesture). */
        deps.selectTrackGesture(padIdx);
        S.screenDirty = true;
    } else if (!S.shiftHeld) {
        /* Live note — apply per-track octave shift; skip OOB to avoid ghost
         * dispatches of clamped note 0 (or 127) when multiple pads' shifted
         * pitches land outside [0,127]. */
        const basePitch = S.padNoteMap[padIdx];
        if (basePitch === 0xFF) return true; /* OOB base */
        const _pitchRaw = basePitch + S.trackOctave[S.activeTrack] * 12;
        if (_pitchRaw < 0 || _pitchRaw > 127) return true; /* OOB after track-octave shift */
        const pitch = _pitchRaw;
        deps.padPitch[padIdx] = pitch;
        S.atLastSent[padIdx] = -1;   /* fresh press → next aftertouch always sends */
        S.lastPlayedNote  = pitch;
        S.lastPadVelocity = deps.effectiveVelocity(d2);
        S.liveActiveNotes.add(pitch);
        deps.liveSendNote(S.activeTrack, 0x90, pitch, deps.effectiveVelocity(d2));
        /* Record capture: queue into _recNoteOns regardless of count-in
         * state. Flush is gated on !S.recordCountingIn so events accumulate
         * during count-in and drain at the count-in→recording transition.
         * DSP authoritatively filters: on patched Schwung, presses without
         * an active on_midi slot are dropped (early count-in window etc.),
         * so JS doesn't need its own (rate-mismatched) timing filter. */
        if (isArmedForTrack(S, S.activeTrack))
            deps.recordNoteOn(pitch, deps.effectiveVelocity(d2), S.recordArmedTrack);
    }
    return true;
}

/* ----------------------------------------------------------------------------
 * _onPadRelease ladder
 * ------------------------------------------------------------------------- */

/* Tap-tempo dialog open: swallow grid pad releases. */
export function handleUiPadReleaseTapTempo(S, deps, d1) {
    if (S.tapTempoOpen && d1 >= 68 && d1 <= 99) return true;
    return false;
}

/* Co-run drum hold release: if the hold-threshold inject fired, send note-off
 * to close the held note in Move firmware. Always clear hold state on any
 * release of the tracked pad, even if the threshold hadn't fired yet. Side
 * effect only — the original did NOT return here, so this is a statement. */
export function handleUiPadReleaseCoRunDrum(S, deps, d1) {
    if (S.moveCoRunTrack >= 0 && S.moveCoRunDrumHeld === d1 &&
            deps.injectToMove) {
        deps.injectToMove([0x08, 0x80, d1, 0]);    /* plain pad off */
        S.moveCoRunDrumHeld = -1;
    }
}

/* Step buttons (notes 16-31): if a Loop+step gesture is in flight and the
 * released step is the held start, resolve the gesture — fire the length-only
 * fallback when no B-tap landed, or just clear state when the range already
 * fired on the B-tap. */
export function handleUiPadReleaseLoopStep(S, deps, d1) {
    if (d1 >= 16 && d1 <= 31 && S.loopGestureStart >= 0) {
        const idx = d1 - 16;
        deps.loopStepRelease(idx);
        return true;
    }
    return false;
}

/* Swallow pad releases while SEQ ARP step-level editor is open. */
export function handleUiPadReleaseSeqArpEditor(S, deps, d1) {
    if (!S.sessionView && S.activeBank === 4 && S.knobTouched === 4 &&
            (S.bankParams[S.activeTrack][4][4] | 0) !== 0 &&
            d1 >= 68 && d1 <= 99) {
        const _pi = d1 - deps.trackPadBase;
        if (_pi >= 0 && _pi < 32 && deps.padPitch[_pi] >= 0) {
            deps.liveSendNote(S.activeTrack, 0x80, deps.padPitch[_pi], 0);
            S.liveActiveNotes.delete(deps.padPitch[_pi]);
            deps.padPitch[_pi] = -1;
        }
        return true;
    }
    return false;
}

/* Swallow pad releases while TRACK ARP step-level editor is open. */
export function handleUiPadReleaseTarpArpEditor(S, deps, d1) {
    if (!S.sessionView && S.activeBank === 5 && S.knobTouched === 4 &&
            (S.bankParams[S.activeTrack][5][4] | 0) !== 0 &&
            d1 >= 68 && d1 <= 99) {
        const _pi = d1 - deps.trackPadBase;
        if (_pi >= 0 && _pi < 32 && deps.padPitch[_pi] >= 0) {
            deps.liveSendNote(S.activeTrack, 0x80, deps.padPitch[_pi], 0);
            S.liveActiveNotes.delete(deps.padPitch[_pi]);
            deps.padPitch[_pi] = -1;
        }
        return true;
    }
    return false;
}

/* Perf Mode pad release: handle R0 rate pad pop + mod pad release. */
export function handleUiPadReleasePerfMode(S, deps, d1) {
    if (S.sessionView && (S.loopHeld || S.perfViewLocked) && d1 >= 68 && d1 <= 99) {
        if (d1 >= 68 && d1 <= 75) {
            const subIdx = d1 - 68;
            if (subIdx === 7) {
                /* Latch release: toggle latch mode (mod pads momentary vs sticky). */
                S.perfLatchMode = !S.perfLatchMode;
            } else if (subIdx === 5) {
                /* Hold pad release: drop momentary state + stop all loops it was holding */
                if (S.perfHoldPadHeld) {
                    S.perfHoldPadHeld = false;
                    if (S.perfStack.length > 0) {
                        S.perfStack = [];
                        if (deps.setParam)
                            deps.setParam('looper_stop', '1');
                    }
                }
            } else if (subIdx < 5) {
                /* Rate pad release: pop from stack — unless sticky-held or hold-pad held */
                if (!S.perfStickyLengths.has(subIdx) && !S.perfHoldPadHeld) {
                    const sIdx = S.perfStack.findIndex(function(e) { return e.idx === subIdx; });
                    if (sIdx >= 0) {
                        S.perfStack.splice(sIdx, 1);
                        if (S.perfStack.length === 0) {
                            if (deps.setParam)
                                deps.setParam('looper_stop', '1');
                        } else {
                            const top = S.perfStack[S.perfStack.length - 1];
                            if (deps.setParam)
                                deps.setParam('looper_arm', String(top.ticks));
                        }
                    }
                }
            }
        } else {
            /* Modifier pad release: clear momentary held bit */
            const modIdx = deps.perfModPadMap[d1];
            if (modIdx !== undefined) {
                S.perfModsHeld &= ~(1 << modIdx);
                deps.sendPerfMods();
            }
        }
        deps.forceRedraw();
        return true;
    }
    return false;
}

/* Step button release: tap-toggle if within threshold, always exit step edit. */
export function handleUiPadReleaseStepButton(S, deps, d1) {
    if (d1 >= 16 && d1 <= 31) {
        S.stepOpTick = S.tickCount;
        const btn = d1 - 16;
        if (deps.sessionViewStepRelease(btn)) {
            return true;
        }
        deps.trackViewStepRelease(btn);
        return true;
    }
    return false;
}

/* Grid pad release (notes 68-99): drum-repeat release, then live note-off +
 * preroll/record bookkeeping. */
export function handleUiPadReleasePadNote(S, deps, d1) {
    if (d1 >= deps.trackPadBase && d1 < deps.trackPadBase + 32) {
        const padIdx = d1 - deps.trackPadBase;
        const t = S.activeTrack;
        if (deps.drumRepeatPadRelease(t, padIdx))
            return true;
        const pitch = deps.padPitch[padIdx] >= 0 ? deps.padPitch[padIdx] : S.padNoteMap[padIdx];
        if (pitch === 0xFF) return true; /* OOB pad — press was skipped, nothing to release */
        S.liveActiveNotes.delete(pitch);
        if (S.pendingPrerollNote !== null) {
            const _prRelPitch = S.pendingPrerollNote.laneNote;
            if (_prRelPitch === pitch)
                S.pendingPrerollNote.releasedAtTick = S.tickCount;
        }
        for (let _pri = 0; _pri < S.pendingPrerollNotes.length; _pri++) {
            if (S.pendingPrerollNotes[_pri].pitch === pitch) {
                S.pendingPrerollNotes[_pri].releasedAtTick = S.tickCount;
                break;
            }
        }
        deps.padPitch[padIdx] = -1;
        if (!S.sessionView) {
            const t = S.activeTrack;
            if (S.trackPadMode[t] === deps.padModeDrum &&
                    (S.tickCount - deps.padPressTick[padIdx]) < deps.drumTapTicks)
                deps.pendingDrumNoteOffs[t].push(pitch);
            else
                deps.liveSendNote(t, 0x80, pitch, 0);
        }
        deps.padPressTick[padIdx] = -1;
        if (S.recordArmed) {
            const _t = S.activeTrack;
            if (S.trackPadMode[_t] === deps.padModeDrum) {
                if (_t === S.recordArmedTrack)
                    enqueueDrumRecNoteOff(deps.drumRecNoteOffs, _t, pitch);
            } else {
                deps.recordNoteOff(pitch);
            }
        }
        return true;
    }
    return false;
}
