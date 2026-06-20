export function handleUiBackButton(S, deps, d1, d2) {
    if (d1 !== deps.moveBack || d2 !== 127) return;

    /* Back: close the topmost open dialog/menu layer; otherwise (with Shift)
     * suspend + hide the module. Schwung Sound and co-run surfaces use Menu as
     * their supported exit because physical Back belongs to the host path. */
    if (S.tapTempoOpen) {
        deps.closeTapTempo();
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
    } else if (S.globalMenuOpen && S.routeCheckOpen) {
        S.routeCheckOpen = false;
        deps.forceRedraw();
    } else if (S.globalMenuOpen) {
        S.globalMenuOpen = false;
        S.lastSentMenuEditValue = null;
        deps.forceRedraw();
    } else if (S.shiftHeld) {
        if (S.schwungCoRunSlot >= 0) deps.exitSchwungCoRun();
        deps.saveState();                  /* sets pendingSuspendSave */
        S.pendingHideAfterSave = true;     /* drained one tick after save fires */
    }
}

export function handleUiUndoButton(S, deps, d1, d2) {
    if (d1 !== deps.moveUndo || d2 !== 127) return;

    /* Undo button: press = undo; Shift+Undo = redo. The SEQ ARP bank (4) is
     * per-clip pfx state that the DSP undo/redo doesn't restore, so we snapshot
     * it across the swap and re-bake it from the saved params. */
    if (S.shiftHeld) {
        if (S.redoAvailable) {
            if (S.redoSeqArpSnapshot) {
                const _t = S.redoSeqArpSnapshot.track;
                S.undoSeqArpSnapshot = { track: _t, params: S.bankParams[_t][4].slice() };
            } else {
                S.undoSeqArpSnapshot = null;
            }
            if (deps.setParam)
                deps.setParam('redo_restore', '1');
            if (S.redoSeqArpSnapshot) {
                const { track, params } = S.redoSeqArpSnapshot;
                for (let k = 0; k < 8; k++) {
                    const pm = deps.banks[4].knobs[k];
                    if (pm) S.bankParams[track][4][k] = params[k];
                }
            }
            S.undoAvailable = true;
            S.redoAvailable = false;
            S.pendingUndoSync = 5;
            deps.showActionPopup('REDO');
        } else {
            deps.showActionPopup('NOTHING TO', 'REDO');
        }
    } else {
        if (S.undoAvailable) {
            if (S.undoSeqArpSnapshot) {
                const _t = S.undoSeqArpSnapshot.track;
                S.redoSeqArpSnapshot = { track: _t, params: S.bankParams[_t][4].slice() };
            } else {
                S.redoSeqArpSnapshot = null;
            }
            if (deps.setParam)
                deps.setParam('undo_restore', '1');
            if (S.undoSeqArpSnapshot) {
                const { track, params } = S.undoSeqArpSnapshot;
                for (let k = 0; k < 8; k++) {
                    const pm = deps.banks[4].knobs[k];
                    if (pm) S.bankParams[track][4][k] = params[k];
                }
            }
            S.redoAvailable = true;
            S.undoAvailable = false;
            S.pendingUndoSync = 5;
            deps.showActionPopup('UNDO');
        } else {
            deps.showActionPopup('NOTHING TO', 'UNDO');
        }
    }
    S.screenDirty = true;
}

export function handleUiPlayButton(S, deps, d1, d2) {
    if (d1 !== deps.movePlay || d2 !== 127) return;

    if (S.deleteHeld) {
        if (deps.setParam) {
            if (!S.playing) {
                /* Stopped: panic clears will_relaunch + all clip state atomically for all tracks. */
                deps.setParam('transport', 'panic');
                for (let t = 0; t < deps.numTracks; t++) {
                    S.trackWillRelaunch[t] = false;
                    S.trackQueuedClip[t]   = -1;
                }
                /* Mirror the playing-branch sweep so LEDs/UI stay in sync with audio panic. */
                deps.unlatchAllTracks();
            } else {
                deps.setParam('transport', 'deactivate_all');
                /* Unlatch Rpt1/Rpt2/TARP across all tracks. */
                deps.unlatchAllTracks();
            }
        }
    } else if (S.muteHeld) {
        S.muteUsedAsModifier = true;
        if (S.metronomeOn !== 0) S.metronomeOnLast = S.metronomeOn;
        S.metronomeOn = S.metronomeOn === 0 ? S.metronomeOnLast : 0;
        if (deps.setParam)
            deps.setParam('metro_on', String(S.metronomeOn));
        deps.showActionPopup('METRO ' + (S.metronomeOn === 0 ? 'OFF' : 'ON'));
    } else if (S.loopHeld && !S.sessionView) {
        /* Loop+Play (Track View only): restart with active clip starting at
         * the first step of the visible page; other tracks land at the
         * musically-equivalent offset. Atomic single set_param. */
        const t      = S.activeTrack;
        const isDrum = S.trackPadMode[t] === deps.padModeDrum;
        const page   = isDrum ? (S.drumStepPage[t] | 0) : (S.trackCurrentPage[t] | 0);
        const lane   = isDrum ? (S.activeDrumLane[t] | 0) : -1;
        if (deps.setParam) {
            deps.setParam('transport', 'restart_at:' + t + ':' + page + ':' + lane);
        }
    } else if (S.shiftHeld) {
        /* Restart: atomic DSP-side stop+play. Single set_param avoids
         * coalescing flakiness when stop+play land in same audio block. */
        if (deps.setParam) {
            deps.setParam('transport', S.playing ? 'restart' : 'play');
        }
    } else {
        if (S.recordCountingIn) {
            deps.disarmRecord();
        } else if (deps.setParam) {
            /* Use the combined `transport=play_focus:T:C` set_param so the
             * DSP arms the focused track's clip + sets playing=1 in a
             * single buffer. Sending launch_clip + transport=play as two
             * separate set_params coalesces (same buffer same channel),
             * leaving clip_playing=0 on the first cycle after a clip clear. */
            if (!S.playing && !S.sessionView
                    && !S.trackClipPlaying[S.activeTrack]
                    && !S.trackWillRelaunch[S.activeTrack]
                    && deps.focusedClipIsEmpty(S.activeTrack)) {
                const t = S.activeTrack;
                const c = S.trackActiveClip[t];
                deps.setParam('transport', 'play_focus:' + t + ':' + c);
                S.trackQueuedClip[t] = c;
            } else {
                deps.setParam('transport', S.playing ? 'stop' : 'play');
            }
        }
    }
}

export function handleUiRecordButton(S, deps, d1, d2) {
    if (d1 !== deps.moveRec || d2 !== 127) return;

    if (S.recordArmed) {
        if (S.recordCountingIn) {
            /* Record pressed during count-in -> cancel queued transport+record. */
            deps.disarmRecord();
        } else {
            const t = S.recordArmedTrack >= 0 ? S.recordArmedTrack : S.activeTrack;
            const c = S.trackActiveClip[t];
            if (S.clipAdaptiveMode[t][c] && !S.recordScheduledStop && S.playing) {
                /* Schedule stop at end of current page. */
                const isDrum = S.trackPadMode[t] === deps.padModeDrum;
                const step   = isDrum ? S.drumCurrentStep[t] : S.trackCurrentStep[t];
                S.recordScheduledStop       = true;
                S.recordScheduledStopTarget = (Math.floor(step / 16) + 1) * 16;
            } else {
                deps.disarmRecord();
            }
        }
        return;
    }

    /* Arming path. First gate: refuse if the active clip / lane is playing in
     * any non-Forward direction. */
    const t = S.activeTrack;
    const c = S.trackActiveClip[t];
    const isDrum = S.trackPadMode[t] === deps.padModeDrum;
    const playbackDir = isDrum
        ? (S.drumLanePlaybackDir[t][S.activeDrumLane[t]] | 0)
        : (S.clipPlaybackDir[t][c] | 0);
    if (playbackDir !== 0) {
        S.recordBlockedDialog    = true;
        S.recordBlockedDialogSel = 0;
        deps.forceRedraw();
        return;
    }

    if (!S.playing) {
        /* Stopped -> DSP-side 1-bar count-in; transport+recording fire from render thread. */
        const rawBpm = deps.getParam ? parseFloat(deps.getParam('bpm')) : 120;
        const bpm = (rawBpm > 0 && isFinite(rawBpm)) ? rawBpm : 120;
        S.recordArmed          = true;
        S.recordCountingIn     = true;
        S.recordArmedTrack     = S.activeTrack;
        S.recordBpm            = bpm;
        S.countInStartTick     = S.tickCount;
        S.countInBeatStartTick = S.tickCount;
        S.countInQuarterTicks  = Math.round(196 * 60 / bpm);
        S.pendingPrerollNotes       = [];
        S.pendingPrerollToggleQueue = [];
        if (deps.setParam)
            deps.setParam('record_count_in', String(S.activeTrack));
        S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
        deps.setButtonLED(deps.moveRec, deps.red);
        return;
    }

    /* Playing -> arm with no count-in. Adaptive mode defers DSP recording to
     * the next page boundary; fixed mode records immediately. */
    const rawBpmLive = deps.getParam ? parseFloat(deps.getParam('bpm')) : 120;
    const adaptive = isDrum
        ? (!S.drumClipNonEmpty[t][c] && !S.drumLaneLengthManuallySet[t])
        : (!S.clipNonEmpty[t][c] && !S.clipLengthManuallySet[t][c]);
    S.recordArmed       = true;
    S.recordCountingIn  = false;
    S.recordArmedTrack  = t;
    S.recordPendingPage = adaptive;
    S.recordBpm         = (rawBpmLive > 0 && isFinite(rawBpmLive)) ? rawBpmLive : 120;
    if (adaptive) S.clipAdaptiveMode[t][c] = true;
    deps.setButtonLED(deps.moveRec, deps.red);
    if (deps.setParam)
        deps.setParam('t' + t + '_recording', adaptive ? '2' : '1');
    S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
}

export function handleUiMuteButton(S, deps, d1, d2) {
    if (d1 !== deps.moveMute) return;

    /* Press: Delete+Mute clears mute/solo. In a Track View drum clip it clears
     * that track's drum-lane mute/solo (and counts as a modifier so release
     * doesn't also toggle the track); otherwise it clears every track. */
    if (d2 === 127) {
        if (S.deleteHeld) {
            if (!S.sessionView && S.trackPadMode[S.activeTrack] === deps.padModeDrum) {
                S.drumLaneMute[S.activeTrack] = 0;
                S.drumLaneSolo[S.activeTrack] = 0;
                if (deps.setParam)
                    deps.setParam('t' + S.activeTrack + '_drum_mute_all_clear', '1');
                S.muteUsedAsModifier = true;
                deps.forceRedraw();
            } else {
                deps.clearAllMuteSolo();
            }
        }
    }

    /* Release: toggle the active track's mute (or solo with Shift) in Track
     * View, but only when Mute was not used as a modifier this gesture. */
    if (d2 === 0) {
        if (!S.muteUsedAsModifier && !S.deleteHeld && !S.sessionView) {
            if (S.shiftHeld) deps.setTrackSolo(S.activeTrack, !S.trackSoloed[S.activeTrack]);
            else             deps.setTrackMute(S.activeTrack, !S.trackMuted[S.activeTrack]);
        }
    }
}

export function handleUiSampleButton(S, deps, d1, d2) {
    if (d1 !== deps.moveSample || S.shiftHeld) return;

    /* Sample press: track held state; cancel dialogs/merge immediately on press. */
    if (d2 === 127) {
        S.sampleHeld           = true;
        S.sampleUsedAsModifier = false;
        if (S.pendingInheritPicker) {
            deps.resolveInheritPicker(-1);
            S.sampleUsedAsModifier = true;
        } else if (S.confirmBakeScene) {
            S.confirmBakeScene     = false;
            S.sampleUsedAsModifier = true;
            deps.forceRedraw();
        } else if (S.confirmBake) {
            S.confirmBake             = false;
            S.confirmBakeDrumLoopOpen = false;
            S.confirmBakeWrapPhase    = false;
            S.sampleUsedAsModifier    = true;
            deps.forceRedraw();
        } else if (S.dspMergeState !== 0) {
            S.pendingDefaultSetParams.push({ key: 'merge_stop', val: '1' });
            S.sampleUsedAsModifier = true;
            /* LED stays green until DSP finalizes at page boundary. */
        }
    }

    /* Sample release: in Session View arm/stop multi-track live merge; in
     * Track View bare tap is a no-op. */
    if (d2 === 0) {
        S.sampleHeld = false;
        if (!S.sampleUsedAsModifier && S.sessionView) {
            if (S.dspMergeState !== 0) {
                S.pendingDefaultSetParams.push({ key: 'merge_stop', val: '1' });
                /* LED stays Red until DSP finalizes at page boundary. */
            } else {
                S.pendingDefaultSetParams.push({ key: 'merge_arm', val: '1' });
                S.pendingMergeArm = true;
                deps.setButtonLED(deps.moveSample, deps.red);
                deps.showActionPopup('LIVE MERGE', 'Capturing all 8', 'tracks. Tap Sample', 'again to stop.');
                S.actionPopupEndTick = S.tickCount + 280;
            }
        }
    }
}
