import { readMelodicClipFromDsp } from './ui_clip_track_sync.mjs';

function resyncMelodicClipReadback(S, deps, track, clip) {
    readMelodicClipFromDsp(S, deps, track, clip, {
        preserveInactiveSteps: true,
        refreshActiveBankParams: true
    });
}

export function runLiveNoteDrain(S, deps) {
    /* Flush live note batches; one set_param per track so no coalescing.
     * Defer for 1 tick after any step button event so the step set_param clears
     * its audio block before live_notes fires. */
    if (S.tickCount <= S.stepOpTick + 1) return;
    if (typeof deps.host_module_set_param !== 'function') return;
    for (let t = 0; t < deps.NUM_TRACKS; t++) {
        if (deps.pendingLiveNotes[t].length === 0) continue;
        const evts = deps.pendingLiveNotes[t];
        deps.pendingLiveNotes[t] = [];
        const offPitches = new Set();
        const onPitches  = new Set();
        for (const e of evts) (e.isOff ? offPitches : onPitches).add(e.pitch);
        const collide = new Set();
        for (const p of offPitches) if (onPitches.has(p)) collide.add(p);
        const parts = [];
        if (collide.size === 0) {
            for (const e of evts) if (e.isOff)  parts.push('off ' + e.pitch);
            for (const e of evts) if (!e.isOff) parts.push('on '  + e.pitch + ' ' + e.vel);
        } else {
            for (const e of evts) if (e.isOff  && !collide.has(e.pitch)) parts.push('off ' + e.pitch);
            for (const e of evts) if (!e.isOff && !collide.has(e.pitch)) parts.push('on '  + e.pitch + ' ' + e.vel);
            for (const e of evts) if (collide.has(e.pitch))
                parts.push(e.isOff ? ('off ' + e.pitch) : ('on ' + e.pitch + ' ' + e.vel));
        }
        deps.host_module_set_param('t' + t + '_live_notes', parts.join(' '));
    }
}

export function runDeferredDrumNoteOffDrain(deps) {
    for (let t = 0; t < deps.NUM_TRACKS; t++) {
        if (deps.pendingDrumNoteOffs[t].length === 0) continue;
        const offs = deps.pendingDrumNoteOffs[t].splice(0);
        for (const pitch of offs) deps.liveSendNote(t, 0x80, pitch, 0);
    }
}

export function runExternalRouteQueueDrain(S, deps) {
    if (S.extSendAsyncEnabled || typeof deps.host_module_get_param !== 'function') return;
    const eq = deps.host_module_get_param('ext_queue');
    if (!eq || eq.length === 0) return;
    const msgs = eq.split(';');
    for (let mi = 0; mi < msgs.length; mi++) {
        const p = msgs[mi].split(' ');
        if (p.length < 3) continue;
        const s = parseInt(p[0], 10), d1 = parseInt(p[1], 10), d2 = parseInt(p[2], 10);
        const cin = (s >> 4) & 0x0F;
        if (typeof deps.move_midi_external_send === 'function')
            deps.move_midi_external_send([cin, s, d1, d2]);
    }
}

export function runMetroNoteOffTask(S, deps) {
    if (S.metroNoteOffTick < 0 || S.tickCount < S.metroNoteOffTick) return;
    S.metroNoteOffTick = -1;
    if (typeof deps.move_midi_inject_to_move === 'function')
        deps.move_midi_inject_to_move([0x09, 0x80, 108, 0]);
}

export function runPadMapSelfHealTask(S, deps) {
    if (!S.dspInboundEnabled) return;
    const muted = deps.padDispatchMuted();
    if (muted !== S.lastPushedMuted) deps.computePadNoteMap();
    if ((S.tickCount % 5) !== 0 || typeof deps.host_module_get_param !== 'function') return;

    const dspM = deps.host_module_get_param('pad_dispatch_muted');
    if (dspM !== null && dspM !== undefined) {
        const dspMi = parseInt(dspM, 10);
        const jsM = muted ? 1 : 0;
        if (dspMi !== jsM) deps.computePadNoteMap();
    }
    const dspMap0 = deps.host_module_get_param('pad_note_map_0');
    if (dspMap0 !== null && dspMap0 !== undefined) {
        const dspMap0i = parseInt(dspMap0, 10);
        const jsMap0 = muted && S.sessionView ? 0xFF
            : Math.max(0, Math.min(127, (S.padNoteMap[0] | 0) +
                (S.trackPadMode[S.activeTrack] === deps.PAD_MODE_DRUM ? 0 : (S.trackOctave[S.activeTrack] | 0) * 12)));
        const expect = S.padNoteMap[0] === 0xFF ? 255 : jsMap0;
        if (dspMap0i !== expect) deps.computePadNoteMap();
    }
}

export function runDefaultSetParamDrain(S, deps) {
    /* Drain first-run default set_params one per tick, after state is fully settled.
     * clearDrainHold defers the drain past the on_midi-context buffer where
     * a clearClip caller fired synchronous set_params (see clearClip comment). */
    if (S.clearDrainHold > 0) {
        S.clearDrainHold--;
    } else if (S.pendingDefaultSetParams.length > 0 && !S.pendingSetLoad && S.pendingDspSync === 0
            && typeof deps.host_module_set_param === 'function') {
        const dp = S.pendingDefaultSetParams.shift();
        deps.host_module_set_param(dp.key, dp.val);
    }
}

function refreshDspMirrorFromDsp(S, deps, opts) {
    deps.pollDSP();
    for (let t = 0; t < S.trackCurrentPage.length; t++)
        S.trackCurrentPage[t] = Math.max(0, Math.floor(S.trackCurrentStep[t] / 16));
    deps.syncClipsFromDsp();
    deps.syncMuteSoloFromDsp();
    if (opts.restoreSidecar) deps.restoreUiSidecar(true);
    deps.computePadNoteMap();
    if (opts.clearStateLoading) S.stateLoading = false;
    deps.invalidateLEDCache();
    deps.forceRedraw();
}

export function runDspMirrorResyncTasks(S, deps) {
    /* Poll every 100 ticks (~0.5s): detect DSP hot-reload via instance nonce. */
    if ((S.tickCount % 100) === 0 && typeof deps.host_module_get_param === 'function' &&
            typeof deps.host_module_set_param === 'function') {
        const newInstanceId = deps.host_module_get_param('instance_id');
        if (newInstanceId && S.lastDspInstanceId !== '' && newInstanceId !== S.lastDspInstanceId) {
            refreshDspMirrorFromDsp(S, deps, { restoreSidecar: false, clearStateLoading: false });
        }
        if (newInstanceId) S.lastDspInstanceId = newInstanceId;
    }

    /* Deferred resync after set change: wait ~5 ticks for state_load to land on audio thread. */
    if (S.pendingDspSync > 0) {
        S.pendingDspSync--;
        if (S.pendingDspSync === 0) {
            refreshDspMirrorFromDsp(S, deps, { restoreSidecar: true, clearStateLoading: true });
        }
    }
}

export function runMoveCoRunTickTasks(S, deps) {
    /* Deferred Move co-run entry inject — see enterMoveNativeCoRun(). Fire the
     * track-button press now that the shim's co-run path is active, so Move's
     * track + knob LED repaint passes through to hardware instead of being stripped. */
    if (S.pendingMoveCoRunInject > 0) {
        S.pendingMoveCoRunInject--;
        if (S.pendingMoveCoRunInject === 0 && S.moveCoRunTrack >= 0) {
            const ch = S.trackChannel[S.moveCoRunTrack] | 0;
            if (ch >= 1 && ch <= 4) {
                const coCC = 44 - ch;  /* ch 1 -> CC 43 (Track 1) ... ch 4 -> CC 40 (Track 4) */
                /* Reliable landing: alternate a neighbor track-button with the
                 * co-run track, ending on the co-run track (twice), so Move
                 * definitively selects + shows the routed track. Each neighbor->co-run
                 * transition forces a fresh selection; the doubled co-run tail covers
                 * a missed/coalesced final press. Well-spaced (gap below) so Move
                 * processes each as a distinct press. */
                const nb = (coCC === 43) ? 42 : 43;  /* any track button != co-run */
                S.moveCoRunPressQueue = [nb, coCC, nb, coCC];
                S.moveCoRunPressGap = 0;
            }
        }
    }
    /* Drain the co-run track-button press sequence (Option B full-row repaint):
     * one injected press every few ticks until the queue empties. Prefix each
     * press with a defensive Shift-off (CC 49=0) — Move firmware's internal
     * Shift state can be ambiguous when a tool entered co-run via Shift+Step
     * (the physical Shift release was zeroed shim-side in non-co-run mode, so
     * Move never saw it), and a plain track-button press with Shift "held"
     * lands on Move's track-routing menu instead of the preset editor. */
    if (S.moveCoRunPressQueue && S.moveCoRunPressQueue.length > 0 &&
            typeof deps.move_midi_inject_to_move === 'function') {
        if (S.moveCoRunPressGap > 0) {
            S.moveCoRunPressGap--;
        } else {
            const cc = S.moveCoRunPressQueue.shift();
            deps.move_midi_inject_to_move([0x0B, 0xB0, 49, 0]);    /* Shift off (defensive) */
            deps.move_midi_inject_to_move([0x0B, 0xB0, cc, 127]);
            deps.move_midi_inject_to_move([0x0B, 0xB0, cc, 0]);
            S.moveCoRunPressGap = 5;
        }
    }
}

export function runPendingUndoSyncTask(S, deps) {
    /* Deferred targeted re-sync after undo/redo: re-read only the affected clip(s). */
    if (S.pendingUndoSync <= 0) return;
    S.pendingUndoSync--;
    if (S.pendingUndoSync !== 0) return;

    const info = deps.host_module_get_param('last_restore');
    deps.syncClipsTargeted(info);
    /* apply_clip_restore clears tr->recording on the DSP side; re-establish it.
     * Also flush stale JS note buffers since DSP called finalize_pending_notes. */
    if (S.recordArmed && !S.recordCountingIn && S.recordArmedTrack >= 0) {
        deps.clearRecordingNoteBuffers();
        deps.host_module_set_param('t' + S.recordArmedTrack + '_recording', '1');
    }
    deps.invalidateLEDCache();
    deps.forceRedraw();
}

export function runDeferredLaneEditReadbackTasks(S, deps) {
    /* Deferred _steps re-read after _reassign: confirm DSP move in JS mirror. */
    if (S.pendingAllLanesStretchCheck >= 0) {
        const track = S.pendingAllLanesStretchCheck;
        S.pendingAllLanesStretchCheck = -1;
        const result = deps.host_module_get_param('t' + track + '_all_lanes_stretch_result');
        if (result !== null && parseInt(result, 10) === -1) {
            deps.showActionPopup('NO ROOM');
            S.bankParams[track][7][1] -= (S.knobLastDir[1] || 1);
        }
    }
    if (S.allLanesQntResetTick >= 0 && S.tickCount >= S.allLanesQntResetTick) {
        S.bankParams[S.allLanesQntResetTrack][7][3] = -1;
        S.allLanesQntResetTick  = -1;
        S.allLanesQntResetTrack = -1;
        S.screenDirty = true;
    }
    if (S.allLanesResResetTick >= 0 && S.tickCount >= S.allLanesResResetTick) {
        S.bankParams[S.allLanesResResetTrack][7][0] = -1;
        S.allLanesResResetTick  = -1;
        S.allLanesResResetTrack = -1;
        S.screenDirty = true;
    }
    if (S.allLanesDirResetTick >= 0 && S.tickCount >= S.allLanesDirResetTick) {
        S.bankParams[S.allLanesDirResetTrack][7][6] = -1;
        S.allLanesDirResetTick  = -1;
        S.allLanesDirResetTrack = -1;
        S.screenDirty = true;
    }
}

export function runDeferredContentResyncTasks(S, deps) {
    if (S.pendingDrumResync > 0) {
        S.pendingDrumResync--;
        if (S.pendingDrumResync === 0) {
            deps.syncDrumClipContent(S.pendingDrumResyncTrack);
            deps.syncDrumLanesMeta(S.pendingDrumResyncTrack);
            deps.syncDrumLaneSteps(S.pendingDrumResyncTrack, S.activeDrumLane[S.pendingDrumResyncTrack]);
            deps.forceRedraw();
        }
    }
    if (S.pendingDrumLaneResync > 0) {
        S.pendingDrumLaneResync--;
        if (S.pendingDrumLaneResync === 0) {
            const drT = S.pendingDrumLaneResyncTrack;
            const drL = S.pendingDrumLaneResyncLane;
            deps.syncDrumLaneSteps(drT, drL);
            /* Also refresh per-lane bank params (NOTE FX, DELAY, Repeat Groove)
             * so post-reset and post-mutation pfx values reflect DSP. Without
             * this, Lane Reset would leave NOTE FX/DELAY mirrors showing the
             * pre-reset values until the next track switch. */
            deps.refreshDrumLaneBankParams(drT, drL);
            deps.forceRedraw();
        }
    }
    if (S.pendingStepsReread > 0) {
        S.pendingStepsReread--;
        if (S.pendingStepsReread === 0) {
            const prt  = S.pendingStepsRereadTrack;
            const prac = S.pendingStepsRereadClip;
            resyncMelodicClipReadback(S, deps, prt, prac);
            deps.forceRedraw();
        }
    }
    if (S.pendingSceneBakeResync > 0) {
        S.pendingSceneBakeResync--;
        if (S.pendingSceneBakeResync === 0) {
            const sc = S.pendingSceneBakeClip;
            for (let t = 0; t < deps.NUM_TRACKS; t++) {
                if (S.trackPadMode[t] === deps.PAD_MODE_DRUM) {
                    if (S.trackActiveClip[t] === sc) {
                        deps.syncDrumClipContent(t);
                        deps.syncDrumLanesMeta(t);
                        deps.syncDrumLaneSteps(t, S.activeDrumLane[t]);
                    }
                } else {
                    resyncMelodicClipReadback(S, deps, t, sc);
                }
            }
            deps.forceRedraw();
        }
    }
}

export function runRepeatRecordingLaneRefreshTask(S, deps) {
    if (!S.recordArmed || !S.playing || S.sessionView) return false;
    const track = S.activeTrack;
    if (S.trackPadMode[track] !== deps.PAD_MODE_DRUM) return false;
    if (S.drumRepeatHeldPad[track] < 0 &&
            S.drumRepeat2HeldLanes[track].size === 0 &&
            S.drumRepeat2LatchedLanes[track].size === 0)
        return false;

    deps.syncDrumLaneSteps(track, S.activeDrumLane[track]);
    deps.forceRedraw();
    return true;
}

export function runEndOfTickPersistenceTasks(S, deps) {
    /* Suspend save: fires last so no subsequent set_param can overwrite it.
     * Quit/Shift+Back use the else-if branches below so the exit/hide call
     * only runs on a tick AFTER the save set_param has reached DSP — same-tick
     * exit would tear the module down before the buffer processes the save. */
    if (S.pendingSuspendSave && typeof deps.host_module_set_param === 'function') {
        S.pendingSuspendSave = false;
        deps.updateNameIndex();
        deps.host_module_set_param('save', '1');
    } else if (S.pendingExitAfterSave) {
        S.pendingExitAfterSave = false;
        deps.removeFlagsWrap();
        S.ledInitComplete = false;
        deps.invalidateLEDCache();
        deps.clearAllLEDs();
        for (let i = 0; i < 4; i++) deps.setButtonLED(40 + i, deps.LED_OFF);
        if (typeof deps.host_exit_module === 'function') deps.host_exit_module();
    } else if (S.pendingHideAfterSave) {
        S.pendingHideAfterSave = false;
        deps.removeFlagsWrap();
        S.ledInitComplete = false;
        deps.invalidateLEDCache();
        deps.clearAllLEDs();
        for (let i = 0; i < 4; i++) deps.setButtonLED(40 + i, deps.LED_OFF);
        if (typeof deps.host_hide_module === 'function') deps.host_hide_module();
    } else if (S.pendingSnapshotCopy) {
        /* One tick after the 'save' above flushed live state to disk
         * synchronously — copy it into the snapshot + update manifest. */
        const sc = S.pendingSnapshotCopy;
        S.pendingSnapshotCopy = null;
        deps.commitSnapshot(S.currentSetUuid, sc.id, sc.label);
    }
}

export function runPendingTrackConvert(S, deps) {
    /* Track-type conversion runs here (tick context) so the get_param
     * round-trips inside convertTrackType -> syncClipsFromDsp work — they
     * return null on the on_midi path where the triggers fire. */
    if (S.pendingTrackConvert) {
        const _pc = S.pendingTrackConvert;
        S.pendingTrackConvert = null;
        deps.convertTrackType(_pc.t, _pc.toDrum);
    }
}

export function runPendingPadNoteMapRecompute(S, deps) {
    /* Deferred padmap recompute for leaving-DRUM (see applyTrackConfig else
     * branch). Fire ONLY when the pendingDefaultSetParams queue is empty —
     * otherwise the tN_padmap push would land in the same tick as a queue-
     * drained tN_* push for the same track, and the empirically-observed
     * same-track set_param interference drops the padmap push. */
    if (S.pendingPadNoteMapRecompute && S.pendingDefaultSetParams.length === 0
            && S.clearDrainHold === 0) {
        S.pendingPadNoteMapRecompute = false;
        deps.computePadNoteMap();
    }
}

export function runExtMidiRemapReapply(S, deps) {
    /* Reapply cable-2 channel remap if anything affecting it changed. */
    const _rt = S.activeTrack;
    const _rr = S.trackRoute[_rt];
    const _rc = S.trackChannel[_rt];
    const _rm = S.midiInChannel;
    if (_rt !== S._lastRemapTrack || _rr !== S._lastRemapRoute ||
            _rc !== S._lastRemapChannel || _rm !== S._lastRemapMidiIn) {
        /* TARP latch is per-track musical intent — preserved across track/
         * route/channel/MIDI-in changes. Only Stop transport and Delete+Play
         * clear it deliberately. */
        deps.applyExtMidiRemap();
        S._lastRemapTrack = _rt; S._lastRemapRoute = _rr;
        S._lastRemapChannel = _rc; S._lastRemapMidiIn = _rm;
    }
}

export function runSessionViewEdgeTasks(S, deps) {
    /* Reset TARP latch when entering session view */
    if (S.sessionView && !S._lastSessionView) {
        const _t = S.activeTrack;
        if (S.bankParams[_t][5][7] | 0) {
            S.bankParams[_t][5][7] = 0;
            if (deps.host_module_set_param)
                deps.host_module_set_param('t' + _t + '_tarp_latch', '0');
        }
    }
    /* Session-view edge re-pushes padmap so DSP on_midi gates pad dispatch
     * (session pads launch clips, not notes). */
    if (S.sessionView !== S._lastSessionView) {
        deps.computePadNoteMap();
    }
    S._lastSessionView = S.sessionView;
}

export function runDeferredCcBitsRefresh(S, deps) {
    /* Clear CC step-edit active flag once the step is released */
    if (S.ccStepEditActive && S.heldStep < 0)
        S.ccStepEditActive = false;

    /* Deferred CC auto-bits/rest re-read (set from MIDI handlers where get_param
     * is null, e.g. Delete+step whole-step clear). */
    if (S.pendingCCBitsRefresh >= 0 && deps.host_module_get_param) {
        const _rt = S.activeTrack, _rc = S.pendingCCBitsRefresh;
        S.pendingCCBitsRefresh = -1;
        const _bits = deps.host_module_get_param('t' + _rt + '_c' + _rc + '_cc_auto_bits');
        if (_bits !== null) S.trackCCAutoBits[_rt][_rc] = parseInt(_bits, 10) || 0;
        const _rest = deps.host_module_get_param('t' + _rt + '_c' + _rc + '_cc_rest');
        if (_rest) {
            const _rp = _rest.split(' ');
            for (let _k = 0; _k < 8; _k++) {
                const _rv = parseInt(_rp[_k], 10);
                S.clipCCVal[_rt][_rc][_k] = (_rv >= 0 && _rv <= 127) ? _rv : -1;
            }
        }
        deps.invalidateLEDCache();
    }
}

export function runCcLiveValPoll(S, deps) {
    /* Poll the defined output value at the playhead per knob (255 = "—") for the
     * realtime display + knob-LED feedback while the CC bank is visible & playing. */
    if (S.activeBank === 6 && S.playing && !S.sessionView && !S.ccStepEditActive) {
        const _lv = deps.host_module_get_param('t' + S.activeTrack + '_cc_cur_vals');
        if (_lv) {
            const _lp = _lv.split(' ');
            for (let _k = 0; _k < 8 && _k < _lp.length; _k++) {
                const _v = parseInt(_lp[_k], 10);
                S.trackCCLiveVal[S.activeTrack][_k] = (_v >= 0 && _v <= 127) ? _v : -1;
            }
        }
    }
}

export function runSchLabelFetch(S, deps) {
    /* Sch label fetch: one shadow_get_param per tick to avoid blocking.
     * Triggered on bank-6 entry; fetches param name for each Sch lane. */
    if (S.schLabelFetchLane >= 0 && S.schLabelFetchLane < 8 && deps.shadow_get_param) {
        const _ft = S.activeTrack;
        const _fk = S.schLabelFetchLane;
        S.schLabelFetchLane++;
        if (S.trackCCType[_ft][_fk] === 2) {
            const _slot = deps.schSlotForTrack(_ft);
            if (_slot >= 0) {
                const _name = deps.shadow_get_param(_slot, 'knob_' + S.trackCCAssign[_ft][_fk] + '_param');
                S.schLabel[_ft][_fk] = _name || null;
            }
        }
        if (S.schLabelFetchLane >= 8) S.schLabelFetchLane = -1;
        S.screenDirty = true;
    }
}

export function runCcGradientPalette(S, deps) {
    /* CC-bank step-LED gradient palette: 6 white brightness levels (the playhead
     * uses the track color instead). Written on bank-6 entry / track switch
     * (not per frame); the step LEDs themselves are driven in updateStepLEDs. */
    if (S.activeBank === 6 && !S.sessionView && S.trackPadMode[S.activeTrack] !== deps.PAD_MODE_DRUM &&
            S.ccGradPaletteTrack !== S.activeTrack) {
        S.ccGradPaletteTrack = S.activeTrack;
        for (let _l = 0; _l < deps.CC_GRADIENT_LEVELS; _l++) {
            const _w = Math.round(255 * deps.CC_GRADIENT_SCALARS[_l]);
            deps.setPaletteEntryRGB(deps.CC_GRADIENT_BASE + _l, _w, _w, _w);
        }
        deps.reapplyPalette();
        deps.setButtonLED(deps.MovePlay,   S.playing ? deps.Green : deps.LED_OFF, true);
        deps.setButtonLED(deps.MoveRec,    (S.recordArmed || S.recordScheduledStop) ? deps.Red : deps.LED_OFF, true);
        deps.setButtonLED(deps.MoveSample, S.dspMergeState >= 2 ? deps.Green : S.dspMergeState === 1 ? deps.Red : deps.LED_OFF, true);
        /* reapplyPalette reset the buttonCache — force-resend the 8 knob LEDs
         * next render (their stopped-state named colors would otherwise be
         * silently dropped) and the step LEDs. */
        S._forceKnobReemit = true;
        deps.invalidateLEDCache();
    }
}

export function runPendingSetLoad(S, deps) {
    /* Set change detected in init(): send UUID so DSP constructs path and loads.
     * Suppressed while the inherit picker is open — state_load fires only
     * after the user picks a source (or "Start blank"). */
    if (S.pendingSetLoad && !S.pendingInheritPicker && deps.host_module_set_param) {
        S.pendingSetLoad = false;
        S.stateLoading = true;
        deps.disarmRecord();
        S.heldStep = -1; S.heldStepBtn = -1; S.heldStepNotes = []; S.stepWasEmpty = false; S.stepWasHeld = false;
        S.seqActiveNotes.clear(); S.seqLastStep = -1; S.seqLastClip = -1;
        S.pendingDspSync = 5;
        deps.host_module_set_param('state_load', S.currentSetUuid || '');
    }
}

export function runGlobalMenuParamPreview(S) {
    /* Real-time preview while editing any global menu parameter.
     * Only send set_param when the edit value actually changes — avoids flooding
     * the DSP param queue (which would starve tN_launch_clip / transport commands). */
    if (S.globalMenuOpen && S.globalMenuState && S.globalMenuItems) {
        const item = S.globalMenuItems[S.globalMenuState.selectedIndex];
        if (item && S.globalMenuState.editing && S.globalMenuState.editValue !== null) {
            if (item.set && S.globalMenuState.editValue !== S.lastSentMenuEditValue) {
                item.set(S.globalMenuState.editValue);
                S.lastSentMenuEditValue = S.globalMenuState.editValue;
                S.screenDirty = true;
            }
            S.bpmWasEditing = true;
        } else if (S.bpmWasEditing && !S.globalMenuState.editing) {
            if (item && item.set && item.get) item.set(item.get());
            S.bpmWasEditing = false;
            S.lastSentMenuEditValue = null;
        }
    }
}

export function runTransposePreviewSelfHeal(S, deps) {
    /* Transpose preview self-heal: cancel a stranded preview/dialog if we've left
     * the Key/Scale edit by any path the edit-exit hook doesn't cover (whole menu
     * closed, navigated away). */
    if (S.xposePrevKey !== null || S.confirmXpose) {
        const _it = (S.globalMenuOpen && S.globalMenuState && S.globalMenuItems)
                    ? S.globalMenuItems[S.globalMenuState.selectedIndex] : null;
        const _onKeyScale = !!(_it && S.globalMenuState.editing &&
                               (_it.label === 'Key' || _it.label === 'Scale'));
        if (S.confirmXpose) {
            /* dialog stranded by Back / menu close (Back isn't a jog-click) → cancel */
            if (!_onKeyScale) { S.confirmXpose = false; deps.xposeCancelPreview(); }
        } else if (!_onKeyScale) {
            deps.xposeCancelPreview();
        }
    }
}
