import {
    runCcGradientPalette,
    runCcLiveValPoll,
    runDefaultSetParamDrain,
    runDeferredCcBitsRefresh,
    runDeferredContentResyncTasks,
    runDeferredLaneEditReadbackTasks,
    runDeferredDrumNoteOffDrain,
    runDspMirrorResyncTasks,
    runEndOfTickPersistenceTasks,
    runExternalRouteQueueDrain,
    runExtMidiRemapReapply,
    runGlobalMenuParamPreview,
    runAltModeFlash,
    runLiveNoteDrain,
    runMetroBeatDetect,
    runMetroNoteOffTask,
    runMoveCoRunTickTasks,
    runOrphanPrune,
    runOverlayTimerExpiries,
    runPadMapSelfHealTask,
    runPendingEditSoundAdvance,
    runPendingPadNoteMapRecompute,
    runPendingSetLoad,
    runPendingTrackConvert,
    runPendingUndoSyncTask,
    runRecordingEventFlush,
    runRepeatRecordingLaneRefreshTask,
    runSceneCacheRefresh,
    runSchLabelFetch,
    runSessionStepHoldToSave,
    runSessionViewEdgeTasks,
    runSideButtonHoldThreshold,
    runSuspendDetection,
    runTransportButtonLEDs,
    runTransposePreviewSelfHeal,
    runViewLEDsAndBlinks
} from './ui_tick_tasks.mjs';
import {
    handleTrackViewChordFirstStepTick,
    handleTrackViewStepHoldThreshold
} from '../view/ui_track_view_step_workflow.mjs';

export function runTickWorkflow(S, deps) {
    S.tickCount++;
    if (S.bootSplashTicks > 0) S.bootSplashTicks--;

    /* Ableton .ablbundle export runs here (tick context) so get_param('bpm')
     * resolves — it returns null on the on_midi path where the menu action
     * fires. host_system_cmd blocks for the python packager; transport is
     * stopped (guarded in exportSession) so the brief tick stall is benign. */
    deps.pollPendingExport();

    runPendingTrackConvert(S, { convertTrackType: deps.convertTrackType });

    /* Recompute must stay BEFORE runDefaultSetParamDrain — its queue-empty gate
     * avoids same-track set_param interference with a drained tN_* push. */
    runPendingPadNoteMapRecompute(S, { computePadNoteMap: deps.computePadNoteMap });

    /* PHASE-1: edge-detect modal pad-dispatch mute changes that aren't
     * caught by explicit hooks (dialogs, ARP-step-edit, knob-touch state).
     * Cheap check — boolean compare. Tick is ~10.6 ms, more than fast
     * enough for non-button-CC modal transitions (dialog open / knob touch). */
    /* Self-heal: every 5 ticks (~50ms), read back DSP's pad_dispatch_muted
     * and pad_note_map_0 via get_param and re-push the padmap if either
     * diverges from JS truth. */
    runPadMapSelfHealTask(S, {
        PAD_MODE_DRUM: deps.PAD_MODE_DRUM,
        host_module_get_param: deps.host_module_get_param,
        padDispatchMuted: deps.padDispatchMuted,
        computePadNoteMap: deps.computePadNoteMap
    });

    runExtMidiRemapReapply(S, { applyExtMidiRemap: deps.applyExtMidiRemap });

    runSessionViewEdgeTasks(S, {
        host_module_set_param: deps.host_module_set_param,
        computePadNoteMap: deps.computePadNoteMap
    });

    /* isSuspended is the one cross-block tick local — threaded to the terminal
     * drawUI gate at the bottom of the orchestrator. */
    const isSuspended = runSuspendDetection(S, {
        clearScreen: deps.clearScreen,
        saveState: deps.saveState,
        removeFlagsWrap: deps.removeFlagsWrap,
        host_ext_midi_remap_enable: deps.host_ext_midi_remap_enable,
        installFlagsWrap: deps.installFlagsWrap,
        applyExtMidiRemap: deps.applyExtMidiRemap,
        readActiveSet: deps.readActiveSet,
        host_module_get_param: deps.host_module_get_param,
        maybeShowInheritPicker: deps.maybeShowInheritPicker,
        invalidateLEDCache: deps.invalidateLEDCache,
        buildLedInitQueue: deps.buildLedInitQueue,
        forceRedraw: deps.forceRedraw
    });

    runMetroNoteOffTask(S, {
        move_midi_inject_to_move: deps.move_midi_inject_to_move
    });

    runLiveNoteDrain(S, {
        NUM_TRACKS: deps.NUM_TRACKS,
        host_module_set_param: deps.host_module_set_param,
        pendingLiveNotes: deps.pendingLiveNotes
    });

    runDeferredDrumNoteOffDrain({
        NUM_TRACKS: deps.NUM_TRACKS,
        pendingDrumNoteOffs: deps.pendingDrumNoteOffs,
        liveSendNote: deps.liveSendNote
    });

    runExternalRouteQueueDrain(S, {
        host_module_get_param: deps.host_module_get_param,
        move_midi_external_send: deps.move_midi_external_send
    });

    runDeferredCcBitsRefresh(S, {
        host_module_get_param: deps.host_module_get_param,
        invalidateLEDCache: deps.invalidateLEDCache
    });

    runCcLiveValPoll(S, { host_module_get_param: deps.host_module_get_param });

    runSchLabelFetch(S, {
        shadow_get_param: deps.shadow_get_param,
        schSlotForTrack: deps.schSlotForTrack
    });

    runCcGradientPalette(S, {
        PAD_MODE_DRUM: deps.PAD_MODE_DRUM,
        CC_GRADIENT_LEVELS: deps.CC_GRADIENT_LEVELS,
        CC_GRADIENT_SCALARS: deps.CC_GRADIENT_SCALARS,
        CC_GRADIENT_BASE: deps.CC_GRADIENT_BASE,
        MovePlay: deps.MovePlay,
        MoveRec: deps.MoveRec,
        MoveSample: deps.MoveSample,
        Green: deps.Green,
        Red: deps.Red,
        LED_OFF: deps.LED_OFF,
        setPaletteEntryRGB: deps.setPaletteEntryRGB,
        reapplyPalette: deps.reapplyPalette,
        setButtonLED: deps.setButtonLED,
        invalidateLEDCache: deps.invalidateLEDCache
    });

    /* Phase 1 / Bundle 2C-Rpt1: pendingRepeatLane queue removed. Lane swap
     * while holding a rate pad is now fired immediately on press from the
     * lane-pad branch in _onPadPress (different set_param key from the
     * other lane-pad pushes — no coalescing). */

    /* Must stay BEFORE runDefaultSetParamDrain (gates on !pendingSetLoad) and
     * runDspMirrorResyncTasks (decrements the pendingDspSync=5 set here). */
    runPendingSetLoad(S, {
        host_module_set_param: deps.host_module_set_param,
        disarmRecord: deps.disarmRecord
    });

    runDefaultSetParamDrain(S, {
        host_module_set_param: deps.host_module_set_param
    });

    runDspMirrorResyncTasks(S, {
        host_module_get_param: deps.host_module_get_param,
        host_module_set_param: deps.host_module_set_param,
        pollDSP: deps.pollDSP,
        syncClipsFromDsp: deps.syncClipsFromDsp,
        syncMuteSoloFromDsp: deps.syncMuteSoloFromDsp,
        restoreUiSidecar: deps.restoreUiSidecar,
        computePadNoteMap: deps.computePadNoteMap,
        invalidateLEDCache: deps.invalidateLEDCache,
        forceRedraw: deps.forceRedraw
    });

    runMoveCoRunTickTasks(S, {
        move_midi_inject_to_move: deps.move_midi_inject_to_move
    });

    runPendingUndoSyncTask(S, {
        host_module_get_param: deps.host_module_get_param,
        host_module_set_param: deps.host_module_set_param,
        syncClipsTargeted: deps.syncClipsTargeted,
        clearRecordingNoteBuffers: deps.clearRecordingNoteBuffers,
        invalidateLEDCache: deps.invalidateLEDCache,
        forceRedraw: deps.forceRedraw
    });

    runDeferredLaneEditReadbackTasks(S, {
        host_module_get_param: deps.host_module_get_param,
        showActionPopup: deps.showActionPopup
    });

    runDeferredContentResyncTasks(S, {
        NUM_TRACKS: deps.NUM_TRACKS,
        NUM_STEPS: deps.NUM_STEPS,
        PAD_MODE_DRUM: deps.PAD_MODE_DRUM,
        TPS_VALUES: deps.TPS_VALUES,
        host_module_get_param: deps.host_module_get_param,
        syncDrumClipContent: deps.syncDrumClipContent,
        syncDrumLanesMeta: deps.syncDrumLanesMeta,
        syncDrumLaneSteps: deps.syncDrumLaneSteps,
        refreshDrumLaneBankParams: deps.refreshDrumLaneBankParams,
        refreshPerClipBankParams: deps.refreshPerClipBankParams,
        clipHasContent: deps.clipHasContent,
        forceRedraw: deps.forceRedraw
    });

    runRepeatRecordingLaneRefreshTask(S, {
        PAD_MODE_DRUM: deps.PAD_MODE_DRUM,
        syncDrumLaneSteps: deps.syncDrumLaneSteps,
        forceRedraw: deps.forceRedraw
    });

    runGlobalMenuParamPreview(S);

    runTransposePreviewSelfHeal(S, { xposeCancelPreview: deps.xposeCancelPreview });

    if (!S.ledInitComplete) {
        deps.drainLedInit();
    } else {
        runOverlayTimerExpiries(S, {
            BANK_DISPLAY_TICKS: deps.BANK_DISPLAY_TICKS,
            KNOB_TURN_HIGHLIGHT_TICKS: deps.KNOB_TURN_HIGHLIGHT_TICKS,
            PARAM_PEEK_DETAIL_TICKS: deps.PARAM_PEEK_DETAIL_TICKS,
            expireSchwungSoundParamPeek: deps.expireSchwungSoundParamPeek
        });

        runSessionStepHoldToSave(S, {
            STEP_SAVE_HOLD_TICKS: deps.STEP_SAVE_HOLD_TICKS,
            NUM_TRACKS: deps.NUM_TRACKS,
            DRUM_LANES: deps.DRUM_LANES,
            STEP_SAVE_FLASH_TICKS: deps.STEP_SAVE_FLASH_TICKS,
            host_module_set_param: deps.host_module_set_param,
            showActionPopup: deps.showActionPopup,
            forceRedraw: deps.forceRedraw
        });

        if ((S.tickCount % deps.POLL_INTERVAL) === 0) { deps.pollDSP(); S.screenDirty = true; }

        if (S.schwungCoRunSlot >= 0 && (S.tickCount % deps.POLL_INTERVAL) === 0) {
            deps.refreshSchwungCoRunSlotMask(S.activeTrack);
        }

        runPendingEditSoundAdvance(S, {
            advancePendingEditSoundEntry: deps.advancePendingEditSoundEntry,
            enterMoveNativeCoRun: deps.enterMoveNativeCoRun,
            enterSchwungCoRun: deps.enterSchwungCoRun
        });

        runMetroBeatDetect(S, {
            host_module_get_param: deps.host_module_get_param,
            playMetronomeClick: deps.playMetronomeClick
        });

        runSideButtonHoldThreshold(S, {
            STEP_HOLD_TICKS: deps.STEP_HOLD_TICKS,
            forceRedraw: deps.forceRedraw
        });

        handleTrackViewStepHoldThreshold(S, deps.createTrackViewStepWorkflowDeps());

        handleTrackViewChordFirstStepTick(S, deps.createTrackViewStepWorkflowDeps());

        runSceneCacheRefresh(S, {
            sceneAllPlaying: deps.sceneAllPlaying,
            sceneAllQueued: deps.sceneAllQueued,
            sceneAnyPlaying: deps.sceneAnyPlaying
        });

        runTransportButtonLEDs(S, {
            setButtonLED: deps.setButtonLED,
            flashAtRate: deps.flashAtRate,
            host_module_get_param: deps.host_module_get_param,
            POLL_INTERVAL: deps.POLL_INTERVAL,
            Green: deps.Green,
            LED_OFF: deps.LED_OFF,
            Red: deps.Red,
            DarkGrey: deps.DarkGrey,
            White: deps.White,
            VividYellow: deps.VividYellow,
            TRACK_COLORS: deps.TRACK_COLORS,
            MovePlay: deps.MovePlay,
            MoveRec: deps.MoveRec,
            MoveSample: deps.MoveSample,
            MoveLoop: deps.MoveLoop,
            MoveCapture: deps.MoveCapture,
            MoveMute: deps.MoveMute,
            MoveShift: deps.MoveShift,
            MoveNoteSession: deps.MoveNoteSession,
            MoveUndo: deps.MoveUndo,
            MoveDelete: deps.MoveDelete,
            MoveCopy: deps.MoveCopy,
            MoveUp: deps.MoveUp,
            MoveDown: deps.MoveDown,
            MoveLeft: deps.MoveLeft,
            MoveRight: deps.MoveRight
        });

        runViewLEDsAndBlinks(S, {
            updateSessionLEDs: deps.updateSessionLEDs,
            updatePerfModeLEDs: deps.updatePerfModeLEDs,
            updateSceneMapLEDs: deps.updateSceneMapLEDs,
            updateStepLEDs: deps.updateStepLEDs,
            updateTrackLEDs: deps.updateTrackLEDs,
            setLED: deps.setLED,
            PAD_MODE_DRUM: deps.PAD_MODE_DRUM,
            White: deps.White,
            LED_OFF: deps.LED_OFF
        });
    }
    runRecordingEventFlush(S, {
        host_module_set_param: deps.host_module_set_param,
        host_module_get_param: deps.host_module_get_param,
        drumRecNoteOns: deps.drumRecNoteOns,
        drumRecNoteOffs: deps.drumRecNoteOffs,
        PAD_MODE_DRUM: deps.PAD_MODE_DRUM,
        disarmRecord: deps.disarmRecord,
        invalidateLEDCache: deps.invalidateLEDCache,
        forceRedraw: deps.forceRedraw
    });

    runEndOfTickPersistenceTasks(S, {
        host_module_set_param: deps.host_module_set_param,
        host_exit_module: deps.host_exit_module,
        host_hide_module: deps.host_hide_module,
        updateNameIndex: deps.updateNameIndex,
        removeFlagsWrap: deps.removeFlagsWrap,
        invalidateLEDCache: deps.invalidateLEDCache,
        clearAllLEDs: deps.clearAllLEDs,
        setButtonLED: deps.setButtonLED,
        commitSnapshot: deps.commitSnapshot,
        LED_OFF: deps.LED_OFF
    });

    runOrphanPrune(S, {
        host_module_set_param: deps.host_module_set_param,
        host_file_exists: deps.host_file_exists,
        loadNameIndex: deps.loadNameIndex,
        uuidToStatePath: deps.uuidToStatePath,
        saveNameIndex: deps.saveNameIndex
    });

    runAltModeFlash(S, { altIndicatorActive: deps.altIndicatorActive });

    if (S.screenDirty && !isSuspended) { S.screenDirty = false; deps.drawUI(); }
}
