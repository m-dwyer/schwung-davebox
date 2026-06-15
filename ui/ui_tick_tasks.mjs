function rereadMelodicClip(S, deps, track, clip) {
    const bulk = deps.host_module_get_param('t' + track + '_c' + clip + '_steps');
    if (bulk && bulk.length >= deps.NUM_STEPS) {
        for (let rs = 0; rs < deps.NUM_STEPS; rs++)
            S.clipSteps[track][clip][rs] = bulk[rs] === '1' ? 1 : (bulk[rs] === '2' ? 2 : 0);
        S.clipNonEmpty[track][clip] = deps.clipHasContent(track, clip);
    }
    const len = deps.host_module_get_param('t' + track + '_c' + clip + '_length');
    if (len !== null && len !== undefined) S.clipLength[track][clip] = parseInt(len, 10) || 16;
    const tps = deps.host_module_get_param('t' + track + '_c' + clip + '_tps');
    if (tps !== null && tps !== undefined) {
        const tv = parseInt(tps, 10);
        S.clipTPS[track][clip] = deps.TPS_VALUES.indexOf(tv) >= 0 ? tv : 24;
    }
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
            rereadMelodicClip(S, deps, prt, prac);
            if (prac === S.trackActiveClip[prt]) deps.refreshPerClipBankParams(prt);
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
                    rereadMelodicClip(S, deps, t, sc);
                    if (sc === S.trackActiveClip[t]) deps.refreshPerClipBankParams(t);
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
