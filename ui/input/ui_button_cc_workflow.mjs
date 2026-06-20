/* Modifier / mode buttons split out of _onCC_buttons.
 *
 * handleUiCaptureButton — Capture button (CC 52). Press tracks held state and
 *   cancels any in-flight dialog/picker/merge (symmetric with Sample's press);
 *   a bare-tap release opens the scene-bake picker (Session View) or the
 *   clip-bake confirm (Track View), unless Capture was used as a modifier
 *   (Capture+row scene capture, Capture+pad drum-lane select).
 *
 * Handlers take everything via deps so they can be unit-tested without the host. */

export function handleUiShiftButton(S, deps, d1, d2) {
    if (d1 !== deps.moveShift) return;

    S.shiftHeld = d2 === 127;
    S.shiftTrackLEDActive = d2 === 127;
    /* PHASE-1: re-push padmap on Shift transitions so DSP on_midi sees
     * all-0xFF while Shift is held (suppress pad-shortcut notes) and
     * the real map again on release. See computePadNoteMap mute logic. */
    deps.computePadNoteMap();
    if (!S.shiftHeld && S.jogTouched) S.jogTouched = false;
    /* Deferred Shift+Step3 dispatch: fire on Shift release so the Shift
     * held state doesn't leak into Move firmware / Schwung chain editor. */
    if (!S.shiftHeld && S.pendingEditEntryTrack >= 0) {
        const _t = S.pendingEditEntryTrack;
        S.pendingEditEntryTrack = -1;
        deps.editSoundForTrack(_t);
    }
    if (!S.sessionView) deps.forceRedraw();
}

export function handleUiDeleteButton(S, deps, d1, d2) {
    if (d1 !== deps.moveDelete) return false;

    S.deleteHeld = d2 === 127;
    /* Loop+Delete on auto bank: reset active lane's loop params */
    if (d2 === 127 && S.loopHeld && S.activeBank === 6 &&
            S.trackPadMode[S.activeTrack] !== deps.padModeDrum && !S.sessionView) {
        var _rdt = S.activeTrack, _rdac = deps.effectiveClip(_rdt), _rdl = S.ccActiveLane[_rdt];
        S.ccLaneLoopStart[_rdt][_rdac][_rdl] = 0;
        S.ccLaneLength[_rdt][_rdac][_rdl] = 0;
        S.ccLaneTps[_rdt][_rdac][_rdl] = 0;
        S.ccLaneResTps[_rdt][_rdac][_rdl] = 0;
        S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
        S.pendingDefaultSetParams.push({ key: 't' + _rdt + '_c' + _rdac + '_k' + _rdl + '_cc_lane_reset', val: '1' });
        deps.showActionPopup('LANE LOOP', 'RESET');
        deps.forceRedraw();
        deps.computePadNoteMap();
        return true;
    }
    /* AUTO-bank Delete-tap → CLEAR AUTOMATION menu. Arm on press (melodic
     * AUTO bank only); a clean release (nothing happened while held, see the
     * disqualify check at the top of this handler) opens the menu. */
    if (d2 === 127) {
        S.deleteTapArmed = (S.activeBank === 6 && !S.sessionView &&
                            S.trackPadMode[S.activeTrack] !== deps.padModeDrum &&
                            !S.clearAutoMenu);
    } else if (S.deleteTapArmed) {
        S.deleteTapArmed = false;
        deps.openClearAutoMenu();
    }
    /* delete_held now rides as the 35th token in the tN_padmap payload
     * (computePadNoteMap), so it shares the tick-based self-heal and
     * avoids the onMidiMessage coalescing risk the old separate
     * t0_delete_held push had. */
    deps.computePadNoteMap();
    return false;
}

export function handleUiCopyButton(S, deps, d1, d2) {
    if (d1 !== deps.moveCopy) return;

    S.copyHeld = d2 === 127;
    if (!S.copyHeld) {
        S.copySrc = null;
        deps.invalidateLEDCache();
    }
    deps.computePadNoteMap();
}

export function handleUiMuteModifierButton(S, deps, d1, d2) {
    if (d1 !== deps.moveMute) return;

    /* Modifier-state tracking for the Mute button. The action half (clear-all,
     * per-track mute/solo toggle) lives in handleUiMuteButton on the transport
     * handler; both fire for the same CC. */
    S.muteHeld = d2 === 127;
    if (d2 === 127) S.muteUsedAsModifier = false;
    if (S.sessionView) deps.invalidateLEDCache();
    deps.computePadNoteMap();
}

export function handleUiCaptureButton(S, deps, d1, d2) {
    if (d1 !== deps.moveCapture) return;

    if (d2 === 127) {
        S.captureHeld           = true;
        S.captureUsedAsModifier = false;
        /* Press also cancels in-flight dialogs/pickers/merge — symmetric with
         * Sample's press behavior. */
        if (S.pendingSceneBakePicker) { S.pendingSceneBakePicker = false; S.captureUsedAsModifier = true; }
        if (S.pendingMergePlacement)  {
            S.pendingMergePlacement = false;
            S.captureUsedAsModifier = true;
            S.pendingDefaultSetParams.push({ key: 'merge_cancel', val: '1' });
        }
        if (S.confirmBake)            { S.confirmBake            = false; S.captureUsedAsModifier = true;
                                        S.confirmBakeDrumLoopOpen = false; S.confirmBakeWrapPhase = false; }
        if (S.confirmBakeScene)       { S.confirmBakeScene       = false; S.captureUsedAsModifier = true; }
        deps.computePadNoteMap();
        deps.forceRedraw();
    } else {
        S.captureHeld = false;
        /* Bare-tap release: open clip-bake (Track View) or scene-bake picker
         * (Session View). Suppressed when Capture was used as a modifier
         * (scene capture via Capture+row, drum-lane select via Capture+pad). */
        if (!S.captureUsedAsModifier) {
            if (S.sessionView) {
                S.pendingSceneBakePicker = true;
                S.screenDirty = true;
            } else {
                const _bt = S.activeTrack, _bc = S.trackActiveClip[_bt];
                const _isDrum = S.trackPadMode[_bt] === deps.padModeDrum;
                S.confirmBake             = true;
                S.confirmBakeIsDrum       = _isDrum;
                S.confirmBakeIsMultiLoop  = !_isDrum;
                S.confirmBakeSel          = _isDrum ? 2 : 1;
                S.confirmBakeTrack        = _bt;
                S.confirmBakeClip         = _bc;
                S.confirmBakeDrumLoopOpen = false;
                S.confirmBakeWrapPhase    = false;
                S.screenDirty             = true;
            }
        }
        deps.computePadNoteMap();
        deps.forceRedraw();
    }
}

export function handleUiMenuCoRunExitButton(S, deps, d1, d2) {
    if (d1 !== deps.moveMenu || d2 !== 127) return false;

    if (S.schwungSoundPage) {
        deps.closeSchwungSoundPage();
        deps.forceRedraw();
        return true;
    }

    /* Schwung co-run exits on Menu. Move co-run disables Menu entirely —
     * swallowed by the guard in the MoveNoteSession block. Outside co-run
     * Overture ignores Menu (no other handler), so this is dormant unless a
     * Schwung session is active. */
    if (S.schwungCoRunSlot >= 0) {
        deps.exitSchwungCoRun();
        deps.forceRedraw();
        return true;
    }

    return false;
}

export function handleUiLoopPerfModeButton(S, deps, d1, d2) {
    /* Loop button (CC 58, Session View): enter/exit Performance Mode.
     * Pad presses in Perf Mode drive rate capture + modifier engage.
     * Double-tap locks the view after Loop is released. */
    if (d1 !== deps.moveLoop || !S.sessionView) return false;

    if (d2 === 127) {
        if (S.shiftHeld) {
            /* Shift+Loop: toggle perf latch mode (mod pads momentary vs sticky). */
            S.perfLatchMode = !S.perfLatchMode;
            deps.forceRedraw();
            return true;
        }
        S.loopPressTick = S.tickCount;
        S.loopHeld      = true;
        deps.forceRedraw();
        return true;
    }
    const heldDuration = S.tickCount - S.loopPressTick;
    const wasTap       = heldDuration < deps.loopTapTicks;

    if (S.perfViewLocked) {
        /* Locked + tap → unlock + stop. */
        if (wasTap) {
            S.perfViewLocked    = false;
            S.loopHeld          = false;
            S.loopJogActive     = false;
            S.perfStack         = [];
            S.perfStickyLengths = new Set();
            S.perfHoldPadHeld   = false;
            S.perfModsHeld      = 0;
            deps.sendPerfMods();
            if (deps.setParam)
                deps.setParam('looper_stop', '1');
            deps.invalidateLEDCache();
            deps.forceRedraw();
        }
        return true;
    }

    if (wasTap) {
        /* Tap → lock Perf Mode; preserve running loop + mods. */
        S.perfViewLocked = true;
        S.loopHeld       = true;
        deps.forceRedraw();
        return true;
    }

    /* Hold release: exit Perf Mode. Sticky lengths/hold pad auto-lock if still active. */
    S.loopHeld      = false;
    S.loopJogActive = false;
    S.perfModsHeld = 0;
    if (S.perfStickyLengths.size > 0 || S.perfHoldPadHeld) {
        S.perfViewLocked = true;
        if (!S.perfHoldPadHeld)
            S.perfStack = S.perfStack.filter(function(e) { return S.perfStickyLengths.has(e.idx); });
        if (S.perfStack.length > 0 && deps.setParam)
            deps.setParam('looper_arm', String(S.perfStack[S.perfStack.length - 1].ticks));
    } else {
        if (S.perfStack.length > 0 && deps.setParam)
            deps.setParam('looper_stop', '1');
        S.perfStack = [];
    }
    deps.sendPerfMods();
    deps.invalidateLEDCache();
    deps.forceRedraw();
    return true;
}

export function handleUiLoopTrackViewButton(S, deps, d1, d2) {
    /* Loop button (CC 58, Track View): hold + step buttons sets clip length */
    if (d1 !== deps.moveLoop || S.sessionView) return false;

    S.loopHeld = d2 === 127;
    deps.computePadNoteMap();
    /* Arp Steps overlay: Loop is repurposed as a modifier for the pad-column
     * loop-length gesture. Skip every other Loop side-effect (TARP unlatch,
     * drum repeat latch, loop-window gesture) while the overlay is active. */
    if (S.stepIntervalMode) {
        if (!S.loopHeld && S.loopGestureStart >= 0) S.loopGestureStart = -1;
        deps.forceRedraw();
        return true;
    }
    if (S.loopHeld) {
        /* Latch or clear drum repeat on the active track */
        const _lrt = S.activeTrack;
        S.loopPressTick = S.tickCount;
        /* Tap-loop-alone unlatch eligibility (drum tracks only). Snapshot
         * "no fresh physical pad press" at press time so the release path
         * can distinguish a true alone-tap from a tap-while-latching
         * gesture. For Rpt1, drumRepeatHeldPad doubles as the latched-pad
         * reference once latched, so we must allow that case (latched +
         * no fresh press = the unlatch gesture we want). Rpt2 uses two
         * separate sets (held vs latched) so its check is simpler. */
        deps.prepareDrumRepeatLoopPress(_lrt, S.trackPadMode[_lrt] === deps.padModeDrum, S.liveActiveNotes.size);
        /* Delete+Loop on auto bank: reset active lane's loop/res/zoom to clip defaults */
        if (S.deleteHeld && S.activeBank === 6 && S.trackPadMode[_lrt] !== deps.padModeDrum) {
            var _rac = deps.effectiveClip(_lrt);
            var _rl = S.ccActiveLane[_lrt];
            S.ccLaneLoopStart[_lrt][_rac][_rl] = 0;
            S.ccLaneLength[_lrt][_rac][_rl] = 0;
            S.ccLaneTps[_lrt][_rac][_rl] = 0;
            S.ccLaneResTps[_lrt][_rac][_rl] = 0;
            S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
            S.pendingDefaultSetParams.push({ key: 't' + _lrt + '_c' + _rac + '_k' + _rl + '_cc_lane_reset', val: '1' });
            deps.showActionPopup('LANE LOOP', 'RESET');
            deps.forceRedraw();
            return true;
        }
        /* Delete+Loop: unconditionally stop active drum repeat latch */
        if (S.deleteHeld && S.trackPadMode[_lrt] === deps.padModeDrum) {
            deps.handleDeleteLoopDrumRepeatStop(_lrt);
            return true;
        }
        /* TARP latch shortcut: Loop press while holding a pad on a melodic track */
        if (S.trackPadMode[_lrt] !== deps.padModeDrum && S.liveActiveNotes.size > 0) {
            const _latchNow = (S.bankParams[_lrt][5][7] | 0) !== 0;
            if (_latchNow) {
                /* Latch ON: holding any pad + loop turns it off */
                S.bankParams[_lrt][5][7] = 0;
                if (deps.setParam)
                    S.pendingDefaultSetParams.push({ key: 't' + _lrt + '_tarp_latch', val: '0' });
            } else if ((S.bankParams[_lrt][5][0] | 0) !== 0) {
                /* Latch OFF: turn it on (only when TARP style is set) */
                S.bankParams[_lrt][5][7] = 1;
                if (deps.setParam)
                    S.pendingDefaultSetParams.push({ key: 't' + _lrt + '_tarp_latch', val: '1' });
            }
        } else if (S.trackPadMode[_lrt] !== deps.padModeDrum &&
                   (S.bankParams[_lrt][5][7] | 0) !== 0 &&
                   S.tarpHeldNotes[_lrt].size > 0) {
            /* Loop press with no pads held + latch on + notes in buffer:
             * clear the latched buffer without changing tarp_latch. */
            if (deps.setParam)
                deps.setParam('t' + _lrt + '_tarp_clear_latched', '1');
            S.tarpHeldNotes[_lrt].clear();
        }
        deps.latchHeldDrumRepeatsOnLoopPress(_lrt);
        S.heldStepBtn        = -1;
        S.heldStep           = -1;
        S.heldStepNotes      = [];
        S.stepWasEmpty       = false;
        S.stepWasHeld        = false;
        S.stepBtnPressedTick.fill(-1);
        S.sessionStepHeld    = -1;
        S.sessionStepHeldCtx = 0;
    } else {
        S.loopJogActive = false;
        /* Loop released before the held start step — treat as aborted
         * gesture and fire the length-only fallback (single-tap semantics). */
        if (S.loopGestureStart >= 0) {
            deps.resolveLoopGesture(true);
            S.loopTapUnlatchTrack = -1;
        }
        /* Tap-loop-alone: unlatch all latched repeats on active drum track.
         * Eligibility was snapshotted at press (no pads/lanes held + drum
         * track). A long hold disqualifies (treated like a gesture timeout). */
        deps.handleDrumRepeatLoopTapRelease();
    }
    deps.forceRedraw();
    return true;
}

export function handleUiNoteSessionButton(S, deps, d1, d2) {
    /* Note/Session view toggle: Shift+press = open global menu (Track View only);
     * tap = switch view; hold = session overview. Press also acts as the
     * universal dialog-dismissal "out" — closing whichever dialog/picker/menu
     * is on top before any view change. */
    if (d1 !== deps.moveNoteSession) return false;

    /* Move co-run: Menu button is disabled — swallow press and release so it
     * neither exits co-run nor toggles the view. Step 3 / Back are the exits. */
    if (S.moveCoRunTrack >= 0) return true;
    if (d2 === 127) {
        /* Co-run exit is the framework's job now — the shim catches Back
         * during corun_active() and calls shadow_corun_end() itself, and
         * pollDSP picks up target=NONE on the next frame and runs
         * exitMoveNativeCoRun()/exitSchwungCoRun() for the JS cleanup.
         * No Menu intercept needed here. */
        if (S.snapshotPicker) {
            /* Back out of a confirm to the list, else close the picker. */
            if (S.snapshotPicker.confirm) S.snapshotPicker.confirm = null;
            else deps.closeSnapshotPicker();
            deps.forceRedraw();
            return true;
        }
        if (S.shiftHeld) {
            if (S.globalMenuOpen) { S.globalMenuOpen = false; deps.forceRedraw(); }
            else { deps.openGlobalMenu(); }
        } else if (S.routeCheckOpen) {
            S.routeCheckOpen = false;
            deps.forceRedraw();
        } else if (S.tapTempoOpen) {
            deps.closeTapTempo();
            deps.forceRedraw();
        } else if (S.confirmStateWipe) {
            S.confirmStateWipe = false;
            deps.removeFlagsWrap();
            deps.clearAllLEDs();
            if (deps.exitModule) deps.exitModule();
            deps.forceRedraw();
        } else if (S.recordBlockedDialog) {
            S.recordBlockedDialog = false;
            deps.forceRedraw();
        } else if (S.confirmLgto) {
            S.confirmLgto = false;
            deps.forceRedraw();
        } else if (S.confirmBake) {
            S.confirmBake          = false;
            S.confirmBakeWrapPhase = false;
            deps.forceRedraw();
        } else if (S.globalMenuOpen && S.confirmClearSession) {
            S.confirmClearSession = false;
            deps.forceRedraw();
        } else if (S.globalMenuOpen && S.confirmSaveState) {
            S.confirmSaveState = false;
            deps.forceRedraw();
        } else if (S.globalMenuOpen && S.confirmConvertToDrum) {
            deps.closeConvertConfirm();
            deps.forceRedraw();
        } else if (S.globalMenuOpen && S.exportDoneDialog) {
            S.exportDoneDialog = false;
            S.globalMenuOpen   = false;
            deps.forceRedraw();
        } else if (S.globalMenuOpen && S.confirmExport) {
            S.confirmExport = false;
            deps.forceRedraw();
        } else if (S.globalMenuOpen) {
            S.globalMenuOpen = false;
            S.lastSentMenuEditValue = null;
            deps.forceRedraw();
        } else if (S.stepIntervalMode && !S.sessionView) {
            /* Arp Steps overlay: Note/Session exits the overlay without switching view. */
            S.stepIntervalMode = false;
            deps.computePadNoteMap();
            deps.forceRedraw();
        } else {
            /* Switch immediately (like Loop entering perf); tap vs hold resolved on release */
            S.noteSessionPressedTick = S.tickCount;
            S.sessionViewMomentary   = true;
            S.sessionView            = !S.sessionView;
            deps.switchViewCleanup();
            deps.invalidateLEDCache();
            S.screenDirty = true;
        }
    } else if (d2 === 0) {
        if (S.noteSessionPressedTick >= 0 &&
                (S.tickCount - S.noteSessionPressedTick) < deps.noteSessionHoldTicks) {
            /* Tap release: make permanent (don't switch back) */
            S.sessionViewMomentary = false;
        } else if (S.sessionViewMomentary) {
            /* Hold release: switch back to original view */
            S.sessionViewMomentary = false;
            S.sessionView          = !S.sessionView;
            deps.switchViewCleanup();
            deps.invalidateLEDCache();
            deps.forceRedraw();
        }
        S.noteSessionPressedTick = -1;
    }
    return true;
}
