import {
    MoveShift,
    MoveBack,
    MovePlay,
    MoveLeft,
    MoveRight,
    MoveUp,
    MoveDown,
    MoveMute,
    MoveDelete
} from '/data/UserData/schwung/shared/constants.mjs';

import {
    Red,
    Blue,
    VividYellow,
    Green,
    DeepRed,
    DarkBlue,
    Mustard,
    DeepGreen,
    DarkGrey,
    LightGrey,
    HotMagenta,
    DeepMagenta,
    Cyan,
    PurpleBlue,
    Purple,
    DarkPurple,
    Bright,
    BurntOrange,
    White,
    SkyBlue,
    DeepBlue
} from '/data/UserData/schwung/shared/constants.mjs';

import {
    setLED,
    setButtonLED,
    isNoiseMessage,
    decodeDelta
} from '/data/UserData/schwung/shared/input_filter.mjs';

import {
    installConsoleOverride
} from '/data/UserData/schwung/shared/logger.mjs';

import {
    createInfo, createValue, createEnum, createToggle, createAction, createDivider, formatItemValue
} from '/data/UserData/schwung/shared/menu_items.mjs';

import {
    createMenuState, handleMenuInput
} from '/data/UserData/schwung/shared/menu_nav.mjs';

import {
    createMenuStack
} from '/data/UserData/schwung/shared/menu_stack.mjs';

import {
    drawMenuHeader, drawMenuList, menuLayoutDefaults
} from '/data/UserData/schwung/shared/menu_layout.mjs';

import {
    createTextKeyboard
} from './components/ui_text_keyboard.mjs';

import {
    MoveNoteSession, MoveUndo, MoveLoop, MoveCopy, MoveMainTouch, MoveRec,
    MoveCapture, MoveSample, MoveMainButton, MoveMainKnob,
    LED_OFF, LED_STEP_ACTIVE, LED_STEP_CURSOR, SCENE_BTN_FLASH_TICKS,
    NUM_TRACKS, NUM_CLIPS, DRUM_LANES, DRUM_BASE_NOTE,
    FLAG_JUMP_TO_OVERTAKE, FLAG_JUMP_TO_TOOLS, NUM_STEPS,
    TRACK_COLORS, TRACK_DIM_COLORS, SCENE_LETTERS, TRACK_PAD_BASE, TOP_PAD_BASE,
    TPS_VALUES, NOTE_KEYS, SCALE_NAMES, SCALE_DISPLAY, DELAY_LABELS,
    fmtSign, fmtStretch, fmtLen, fmtLgto, fmtRes, fmtPct, fmtNote, fmtPages,
    fmtDly, fmtBool, fmtRoute, fmtPlain, fmtNA, fmtGateMod,
    fmtArpStyle, fmtArpRate, fmtArpSteps, fmtArpOct, fmtVelOverride, fmtPlayDir, fmtRevStyle,
    MCUFONT, pixelPrint, pixelPrintC,
    BANKS, ACTION_POPUP_TICKS, PAD_MODE_DRUM, PAD_MODE_MELODIC_SCALE,
    POLL_INTERVAL, TAP_TEMPO_FLASH_TICKS,
    PARAM_LED_BANKS, STATE_VERSION,
    CC_GRADIENT_BASE, CC_GRADIENT_LEVELS, CC_GRADIENT_SCALARS
} from './core/ui_constants.mjs';

import { S, resetUiState } from './core/ui_state.mjs';
import { initDebugLog, dlog } from './core/ui_debug_log.mjs';
import { saveState, writeSidecar, doClearSession, showActionPopup, uuidToStatePath, uuidToUiStatePath, readActiveSet, loadNameIndex, saveNameIndex, copyStateFiles, findInheritCandidates,
    SNAPSHOT_CAP, snapshotLabel, loadSnapshotManifest, commitSnapshot, applySnapshotToLive, dropSnapshots } from './persist/ui_persistence.mjs';
import { drawGlobalMenu } from './menu/ui_dialogs.mjs';
import { trackClipHasContent, sceneAllQueued, updateSceneMapLEDs } from './core/ui_scene.mjs';
import { effectiveClip, updateStepLEDs, updateSessionLEDs, updateTrackLEDs, flashAtRate, drawPositionBar, invalidateLEDCache, paintCoRunSideButtons } from './render/ui_leds.mjs';
import { renderSplashScreen } from './render/ui_splash.mjs';
import { requestExport, confirmExportStart, pollPendingExport } from './persist/ui_export.mjs';
import {
    canEditSoundRoute,
    schSlotForTrack
} from './core/ui_routes.mjs';
import {
    advancePendingEditSoundEntry,
    adjustSchwungSoundVisibleParam,
    applySchwungSoundBrowserSelection,
    beginSaveSchwungSoundPreset,
    closeSchwungSoundBrowser,
    closeSchwungSoundPage,
    expireSchwungSoundStatusFlash,
    expireSchwungSoundParamPeek,
    openSchwungSoundBrowser,
    openSchwungSoundPresetBrowser,
    refreshSchwungCoRunSlotMask,
    requestEditSoundForTrack,
    rotateSchwungSoundPage,
    selectSchwungSoundComponent,
    touchSchwungSoundVisibleParam,
    toggleSchwungSoundParamDetail
} from './core/ui_sound_edit.mjs';
import { renderSchwungSoundPage } from './render/ui_sound_edit_render.mjs';
import {
    PARAM_PEEK_DETAIL_TICKS
} from './core/ui_motion.mjs';
import {
    renderTrackBankOverview
} from './render/ui_parameter_page_render.mjs';
import {
    drawAltArrow as renderDrawAltArrow,
    drawBankHeaderRight as renderDrawBankHeaderRight,
    drawBankHeading as renderDrawBankHeading,
    drawBankHeadingInverted as renderDrawBankHeadingInverted,
    drawBankStrip as renderDrawBankStrip
} from './render/ui_bank_chrome_render.mjs';
import {
    renderSessionIdleView,
    renderDrumTrackIdleView,
    renderMelodicTrackIdleView,
    renderMotionIdleView
} from './render/ui_idle_render.mjs';
import {
    renderSessionOverview
} from './render/ui_session_overview_render.mjs';
import {
    handleSessionViewSideRowPress,
    handleSessionViewStepRelease
} from './view/ui_session_view_workflow.mjs';
import {
    renderPerfModeOled
} from './render/ui_perf_render.mjs';
import {
    renderSessionActionPopup,
    renderTrackActionPopup
} from './render/ui_popup_render.mjs';
import {
    renderCompressLimitNotice,
    renderMergePlacementPrompt,
    renderNoNoteFlashNotice,
    renderSceneBakePickerPrompt,
    renderShiftStepHelp
} from './render/ui_prompt_render.mjs';
import {
    renderAutoRouteOverlay
} from './render/ui_auto_route_render.mjs';
import {
    renderBakeConfirm,
    renderBakeSceneConfirm,
    renderClearAutomationMenu,
    renderInheritPicker,
    renderLgtoConfirm,
    renderRecordBlockedDialog,
    renderSnapshotPicker,
    renderStateWipeConfirm,
    renderXposeConfirm
} from './render/ui_modal_render.mjs';
import {
    renderParamPeek
} from './render/ui_param_peek_render.mjs';
import {
    renderLoopView
} from './render/ui_loop_render.mjs';
import {
    handleLoopJog,
    handleLoopStepPress,
    handleLoopStepRelease,
    resolveLoopGesture
} from './perform/ui_loop_gesture_workflow.mjs';
import {
    renderCcStepEditView
} from './render/ui_cc_step_edit_render.mjs';
import {
    onCcButtonsImpl,
    onCcJogImpl,
    onCcKnobsImpl,
    onCcMsgImpl,
    onCcSideImpl,
    onCcStepEditImpl,
    onCcTransportImpl,
    onPadPressImpl,
    onPadPressTrackViewImpl,
    onPadReleaseImpl,
    onStepButtonsImpl,
    switchViewCleanupImpl
} from './input/ui_input_dispatch_workflow.mjs';
import {
    handleUiMidiInternalMessage
} from './midi/ui_midi_internal_workflow.mjs';
import {
    onMidiExternalImpl
} from './midi/ui_midi_external_workflow.mjs';
import {
    onPadAftertouchImpl
} from './pad/ui_pad_aftertouch_workflow.mjs';
import {
    clearAllMuteSoloImpl,
    effectiveMuteImpl,
    setTrackMuteImpl,
    setTrackSoloImpl
} from './perform/ui_mute_solo_workflow.mjs';
import {
    applyExtMidiRemapImpl
} from './midi/ui_ext_midi_remap_workflow.mjs';
import {
    extNoteOffAllImpl,
    liveSendNoteImpl,
    recordNoteOffImpl,
    recordNoteOnImpl
} from './perform/ui_live_note_workflow.mjs';
import {
    clearRecordingNoteBuffers,
    createRecordingWorkflowState,
    disarmRecordImpl,
    handoffRecordingToTrackImpl
} from './perform/ui_recording_workflow.mjs';
import {
    handleUiKnobTouch
} from './input/ui_knob_touch_workflow.mjs';
import {
    pollDspWorkflow
} from './sync/ui_polldsp_workflow.mjs';
import {
    renderTrackStepEditView
} from './render/ui_step_edit_render.mjs';
import {
    renderStepIntervalOverlay
} from './render/ui_step_interval_render.mjs';
import {
    renderMetroIndicator
} from './render/ui_track_chrome_render.mjs';
import {
    handleTrackViewStepRelease,
    handleTrackViewMelodicStepNoteAssignment
} from './view/ui_track_view_step_workflow.mjs';
import {
    createLiveNoteQueues,
    createPadRuntimeState,
    createPadSurfaceRuntime,
    drumPadToLane as padSurfaceDrumPadToLane,
    handleCaptureDrumLanePress,
    handleDrumLanePadPress,
    handleDrumVelocityPadPress,
    queueLiveNoteOff,
    resolveDrumPadTarget
} from './pad/ui_pad_surface.mjs';
import {
    handleDeleteDrumLaneClear,
    handleDrumLaneFactoryReset,
    handleDrumLaneCopyPaste,
    handleDrumLaneMuteSolo,
    copyDrumClipImpl,
    copyDrumLaneImpl,
    cutDrumClipImpl,
    cutDrumLaneImpl
} from './drum/ui_drum_lane_workflows.mjs';
import {
    handleDrumRepeat2LaneAftertouch,
    handleDrumRepeatPadAftertouch,
    resetDrumRepeatGrooveForLane,
    editDrumRepeatGrooveStep,
    handleDrumRepeatPadPress,
    handleDrumRepeatPadRelease,
    cycleDrumRepeatPerformMode,
    prepareDrumRepeatLoopPress,
    latchHeldDrumRepeatsOnLoopPress,
    handleDrumRepeatLoopTapRelease,
    handleDeleteLoopDrumRepeatStop
} from './drum/ui_drum_repeat_workflows.mjs';
import {
    unlatchAllTracks
} from './perform/ui_latch_workflows.mjs';
import {
    createTrackClipSyncFacade
} from './sync/ui_track_clip_sync_facade.mjs';
import {
    runTickWorkflow
} from './tick/ui_tick_workflow.mjs';
import {
    createEntrypointErrorWrapper
} from './lifecycle/ui_entrypoint_diagnostics.mjs';
import {
    drawUIImpl
} from './render/ui_screen_router_workflow.mjs';
import { createRenderSurface } from './render/ui_render_surface.mjs';
import {
    createHostParamAdapters,
    createUiFlagAdapters,
    hasShadowSetParam,
    optionalHostFileExists,
    optionalHostModuleGetParam,
    optionalHostModuleGetParamUndefined,
    optionalHostReadFile,
    optionalHostModuleSetParam,
    optionalHostWriteFile
} from './sync/ui_sync_adapters.mjs';
import {
    createButtonCcHardwareAdapters,
    createExtMidiRemapHostAdapters,
    createInputDispatchHardwareAdapters,
    createJogCcHardwareAdapters,
    createMidiInternalHardwareAdapters,
    createNavigationCcHardwareAdapters,
    createPadHardwareAdapters,
    createTransportCcHardwareAdapters,
    optionalHostExitModule,
    optionalMoveMidiExternalSend,
    optionalMoveMidiInjectToMove,
    optionalShadowSendMidiToDsp
} from './input/ui_input_adapters.mjs';
import {
    createTickHostAdapters
} from './tick/ui_tick_adapters.mjs';
import {
    buildGlobalMenuItemsImpl,
    doShiftStepCommonImpl,
    ensureGlobalMenuFreshImpl,
    jumpToMenuLabelImpl,
    openGlobalMenuImpl
} from './menu/ui_global_menu.mjs';
import {
    closeTapTempoImpl,
    openTapTempoImpl,
    registerTapTempoImpl
} from './perform/ui_tap_tempo_workflow.mjs';
import {
    maybeShowInheritPickerImpl,
    resolveInheritPickerImpl
} from './persist/ui_inherit_picker_workflow.mjs';
import {
    clearAutoMenuClickImpl,
    clearAutoMenuRotateImpl,
    closeClearAutoMenuImpl,
    openClearAutoMenuImpl
} from './menu/ui_clear_auto_workflow.mjs';
import {
    buildLedInitQueueImpl,
    clearAllLEDsImpl,
    drainLedInitImpl,
    installFlagsWrapImpl,
    removeFlagsWrapImpl
} from './render/ui_led_init_workflow.mjs';
import {
    PERF_MOD_FULL_NAMES,
    PERF_MOD_PAD_MAP,
    PERF_MOD_POPUP_TICKS,
    sendPerfModsImpl,
    updatePerfModeLEDsImpl
} from './render/ui_perf_leds.mjs';
import {
    anyMelodicClipHasContentImpl,
    xposeCancelPreviewImpl,
    xposeCommitImpl,
    xposePreviewSetImpl
} from './perform/ui_transpose_workflow.mjs';
import {
    beginSnapshotSaveImpl,
    closeSnapshotPickerImpl,
    openLoadSnapshotImpl,
    openSaveSnapshotImpl,
    snapshotPickerClickImpl,
    snapshotPickerRotateImpl
} from './persist/ui_snapshot_workflow.mjs';
import {
    enterMoveNativeCoRunImpl,
    enterSchwungCoRunImpl,
    exitMoveNativeCoRunImpl,
    exitSchwungCoRunImpl
} from './corun/ui_corun_workflow.mjs';
import {
    createParameterBankRuntime
} from './bank/ui_bank_params.mjs';
import {
    ccKnobDeltaImpl
} from './bank/ui_bank_state.mjs';
import {
    defaultStepNoteImpl,
    drumNoteLabelImpl,
    scaleNudgeNoteImpl,
    stepEntryVelocityImpl
} from './core/ui_note_edit_helpers.mjs';
import {
    clearClipImpl,
    clearRowImpl,
    clearStepImpl,
    copyClipImpl,
    copyRowImpl,
    copyStepImpl,
    cutClipImpl,
    cutRowImpl,
    doDoubleFillImpl,
    doLaneDoubleFillImpl,
    hardResetClipImpl,
    selectClipOnTrackImpl
} from './sync/ui_clip_edit_ops.mjs';
import {
    clipIsEmptyImpl,
    focusedClipIsEmptyImpl,
    selectTrackGestureImpl,
    switchActiveTrackImpl
} from './view/ui_track_selection_workflow.mjs';
import {
    closeConvertConfirmImpl,
    convertTrackTypeImpl,
    trackHasAnyDataImpl
} from './view/ui_track_convert_workflow.mjs';
import {
    runInitWorkflowImpl
} from './lifecycle/ui_init_workflow.mjs';

/* ------------------------------------------------------------------ */
/* Parameter bank definitions                                           */
/* ------------------------------------------------------------------ */

function bankHeader(bankIdx) {
    return '[ ' + BANKS[bankIdx].name + ' ]';
}

function drawBankStrip(rightX, hdrBgWhite) {
    return renderDrawBankStrip(renderSurface(), rightX, hdrBgWhite);
}

function drawBankHeaderRight(showTrack, hdrBgWhite) {
    renderDrawBankHeaderRight(renderSurface(), showTrack, hdrBgWhite);
}

function drawBankHeading(name, showTrack) {
    renderDrawBankHeading(renderSurface(), name, showTrack);
}

function drawBankHeadingInverted(name, showTrack) {
    renderDrawBankHeadingInverted(renderSurface(), name, showTrack);
}

function drawAltArrow(x, hdrBgWhite, on) {
    renderDrawAltArrow(renderSurface(), x, hdrBgWhite, on);
}

/* Iter knob list: 36 entries, raw byte at each position. Index 0 = default (1/1).
 * Sorted by cycle_len then cycle_idx: 1/1, 1/2, 2/2, 1/3, 2/3, 3/3, ..., 8/8. */
const STEP_ITER_LIST = (function() {
    const L = [0];
    for (let cl = 2; cl <= 8; cl++)
        for (let ci = 1; ci <= cl; ci++)
            L.push((cl << 4) | ci);
    return L;
})();


function drawMetroIndicator() {
    renderMetroIndicator(renderSurface());
}

/* ------------------------------------------------------------------ */
/* Global menu items                                                    */
/* ------------------------------------------------------------------ */

/* Stub state for not-yet-wired global menu params */

/* Launch quantization: 0=Now, 1=1/16, 2=1/8, 3=1/4, 4=1/2, 5=1-bar; default 0 */

function createGlobalMenuDeps() {
    return {
        applyTrackConfig,
        computePadNoteMap,
        forceRedraw,
        editSoundForTrack,
        openTapTempo,
        xposePreviewSet,
        openLoadSnapshot,
        ...createHostParamAdapters()
    };
}

function buildGlobalMenuItems() {
    return buildGlobalMenuItemsImpl(S, createGlobalMenuDeps());
}

function createGlobalMenuWorkflowDeps() {
    return {
        buildGlobalMenuItems,
        createMenuState,
        createMenuStack,
        exitMoveNativeCoRun,
        exitSchwungCoRun,
        closeTapTempo,
        openTapTempo,
        setParam: optionalHostModuleSetParam(),
        showActionPopup
    };
}

function createTapTempoDeps() {
    return {
        getParam: host_module_get_param,
        setParam: optionalHostModuleSetParam(),
        computePadNoteMap,
        invalidateLEDCache
    };
}

function createInheritPickerDeps() {
    return {
        fileExists: optionalHostFileExists(),
        uuidToStatePath,
        loadNameIndex,
        findInheritCandidates,
        copyStateFiles
    };
}

function createClearAutoMenuDeps() {
    return {
        effectiveClip,
        invalidateLEDCache,
        showActionPopup
    };
}

function createLedInitDeps() {
    return {
        setLED,
        setButtonLED,
        setPaletteEntryRGB,
        reapplyPalette,
        invalidateLEDCache,
        ...createUiFlagAdapters()
    };
}

function createTransposeDeps() {
    return {
        numTracks: NUM_TRACKS,
        numClips: NUM_CLIPS,
        padModeDrum: PAD_MODE_DRUM,
        setParam: optionalHostModuleSetParam(),
        computePadNoteMap,
        forceRedraw
    };
}

function createSnapshotDeps() {
    return {
        snapshotCap: SNAPSHOT_CAP,
        stateVersion: STATE_VERSION,
        now: Date.now,
        snapshotLabel,
        saveState,
        showActionPopup,
        loadSnapshotManifest,
        dropSnapshots,
        applySnapshotToLive
    };
}

function createCoRunDeps() {
    return {
        corunTargetChainEdit: CORUN_TARGET_CHAIN_EDIT,
        corunTargetMoveNative: CORUN_TARGET_MOVE_NATIVE,
        overtureCorunKeepMask: OVERTURE_CORUN_KEEP_MASK,
        shadowCorunBegin: typeof shadow_corun_begin === 'function' ? shadow_corun_begin : null,
        shadowCorunEnd: typeof shadow_corun_end === 'function' ? shadow_corun_end : null,
        shadowSetSkipLedClear: typeof shadow_set_skip_led_clear === 'function' ? shadow_set_skip_led_clear : null,
        moveMidiInjectToMove: optionalMoveMidiInjectToMove(),
        computePadNoteMap,
        showActionPopup,
        reapplyPalette,
        invalidateLEDCache,
        forceRedraw
    };
}


/* ------------------------------------------------------------------ */
/* UI state                                                             */
/* ------------------------------------------------------------------ */

/* Performance Mode state. Session View + Loop held → pad grid shows Perf Mode.
 * S.perfStack: currently-held R0 length pads (same stack semantics as old looper
 * step stack; rate captured at press time). Top = active rate.
 * S.perfModsToggled: latched modifier bitmask (Latch-toggle presses).
 * S.perfModsHeld: momentary bitmask (held mod pads, not Latch-pressed).
 * DSP receives (S.perfModsToggled | S.perfModsHeld) as perf_mods each change. */
/* Co-run target enum + keep-mask flags — mirrors corun_target_t and the
 * CORUN_GRP_* / CORUN_KEEP_* bits in Schwung's shadow_constants.h. The shim
 * registers these as globals on shadow_ui's JS context; redeclaring them
 * here makes the Overture tool context self-contained on platforms that scope
 * globals differently. Keep in sync with docs/CORUN.md. */
const CORUN_TARGET_NONE        = 0;
const CORUN_TARGET_CHAIN_EDIT  = 1;
const CORUN_TARGET_MOVE_NATIVE = 2;
const CORUN_GRP_PADS           = 1 << 1;
const CORUN_GRP_STEPS          = 1 << 2;
const CORUN_GRP_TRANSPORT      = 1 << 3;
const CORUN_GRP_MENU           = 1 << 10;
/* Default split: tool keeps pads / steps / transport / Menu, cedes the rest. */
const OVERTURE_CORUN_KEEP_DEFAULT = CORUN_GRP_PADS | CORUN_GRP_STEPS | CORUN_GRP_TRANSPORT | CORUN_GRP_MENU;
/* Opt out of framework Back-as-exit. Overture uses Menu as the canonical exit
 * (existing muscle memory) and lets Back cede to the peer for sub-view nav
 * (chain editor pop-up, Move firmware preset/synth navigation). */
const CORUN_KEEP_BACK_BIT      = 1 << 15;
const OVERTURE_CORUN_KEEP_MASK  = OVERTURE_CORUN_KEEP_DEFAULT | CORUN_KEEP_BACK_BIT;

const LOOPER_RATES_STRAIGHT = [12, 24, 48, 96, 192];   /* 1/32, 1/16, 1/8, 1/4, 1/2 */
const PERF_LATCH_LONG_PRESS = 100;     /* ~510ms → clear all toggled mods + exit Latch mode */
/* Preset S.snapshots: 16 slots (step buttons 1-16).
 * S.perfRecalledSlot: which slot is active (-1 = none); preset bits are
 * copied into S.perfModsToggled on recall so mod pads can toggle them off.
 * Factory presets populate slots 0-7 (steps 1-8) at init. */

/* View lock: double-tap Loop keeps Perf Mode alive after Loop is released.
 * Single tap while locked → unlock + stop loop. */
const LOOP_TAP_TICKS  = 40;
const LOOP_DBLTAP_GAP = 80;

/* Live pad note input — isomorphic 4ths diatonic layout. */
function scaleNudgeNote(note, dir, key, scale) {
    return scaleNudgeNoteImpl(S, note, dir, key, scale);
}


/* Per-pad press runtime owned by Pad Surface. padPitch ensures matching note-off
 * even if the map changes mid-hold; padPressTick powers drum tap-vs-hold. */
const padPressRuntime = createPadRuntimeState();
const padPitch = padPressRuntime.padPitch;
const padPressTick = padPressRuntime.padPressTick;
const padSurfaceRuntime = createPadSurfaceRuntime(S, {
    PAD_MODE_DRUM,
    DRUM_LANES,
    DRUM_BASE_NOTE,
    optionalHostModuleSetParam
});
const DRUM_TAP_TICKS = 10;  /* ~30ms — taps shorter than this suppress the release note-off */

/* S.clipSteps[track][clip][step] — JS-authoritative mirror of DSP step data */
/* S.clipNonEmpty[track][clip] — cached result of clipHasContent; updated on every S.clipSteps write */

/* Drum mode state */
/* S.drumLaneSteps[t][l] — '0'/'1'/'2' per step (up to 256), cached from DSP for the active clip */
/* S.drumLaneHasNotes[t][l] — true if lane l has any programmed hits */
/* S.drumLaneNote[t][l] — current MIDI note for lane l (JS mirror of lane->midi_note) */
/* S.drumLaneFlashTick[t][l] — S.tickCount when this lane last fired a hit (for pad flash) */
/* Per-track drum lane mute/solo bitmasks (uint32 mirrors of DSP drum_lane_mute/drum_lane_solo) */
/* Drum Repeat state */
/* Rpt2 state */
/* Per-track per-lane repeat groove state mirrors */
/* SEQ ARP per-clip step_vel[8] mirror. Stored as level 0..4:
 *   0 = step off (no note)
 *   1 = bottom row (vel 10)
 *   4 = top row (vel = incoming) — default. */
/* TRACK ARP per-track step_vel[8] mirror (per-track, not per-clip). */
const DRUM_FLASH_TICKS = 8; /* ~130ms pad flash duration after a drum hit */
/* S.drumClipNonEmpty[t][c] — true if any lane in drum clip c of track t has content */
/* Per-track config (formerly TRACK bank 0 params) */

/* Per-tick scene state cache — computed once at top of tick(), O(1) lookup in LED update fns */


/* ------------------------------------------------------------------ */
/* Parameter bank state                                                 */
/* ------------------------------------------------------------------ */

/* S.activeBank: index 0-6 (pad 92-98). CLIP bank (0) is default. */

/* S.knobTouched: 0-7 (MoveKnob1Touch-8Touch note numbers), or -1 = none */

/* Per-physical-knob sensitivity accumulators.
 * S.knobAccum[k] counts raw encoder ticks; fires delta when >= pm.sens.
 * S.knobLastDir[k] tracks last direction for reversal detection.
 * S.knobLocked[k] blocks further firing until touch release (used by lock=true params). */

/* S.bankSelectTick: S.tickCount at last bank select, used for the State 3 timeout.
 * -1 = timeout not active. */
const BANK_DISPLAY_TICKS = 94;  /* ~1000ms at 94Hz device tick rate (was 392 = ~4.2s; constant was miscalibrated for 196Hz) */
const STRETCH_BLOCKED_TICKS = 294;  /* ~1500ms at 196Hz */
const NO_NOTE_FLASH_TICKS = 118;     /* ~600ms at 196Hz */
const KNOB_TURN_HIGHLIGHT_TICKS = 120;            /* ~600ms at 196Hz — highlight after turn without touch */

/* S.bankParams[track][bankIdx][knobIdx] = integer value (JS-authoritative).
 * Initialized from BANKS defaults; refreshed from DSP on bank select. */

/* CC PARAM bank (bank 6) — per-track state, JS-authoritative */

/* Scratch palette indices for CC bank live value display (51-58, all undefined in palette).
 * Updated dynamically via SysEx each tick — one entry per knob. */

/* Pack a SysEx byte array into 4-byte USB-MIDI SysEx packets for move_midi_internal_send. */
function _sysexPkts(bytes) {
    const out = [];
    for (let i = 0; i < bytes.length; i += 3) {
        const rem = bytes.length - i;
        const cin = rem >= 3 ? (rem === 3 ? 0x07 : 0x04) : (rem === 2 ? 0x06 : 0x05);
        out.push(cin, bytes[i], rem > 1 ? bytes[i + 1] : 0, rem > 2 ? bytes[i + 2] : 0);
    }
    return out;
}

/* Pre-packed reapply SysEx: [F0 00 21 1D 01 01 05 F7] */
const _CC_REAPPLY_PKT = _sysexPkts([0xF0, 0x00, 0x21, 0x1D, 0x01, 0x01, 0x05, 0xF7]);

/* Set palette entry idx to RGB (0-255 each), then call reapplyPalette to push to LEDs. */
function setPaletteEntryRGB(idx, r, g, b) {
    move_midi_internal_send(_sysexPkts([
        0xF0, 0x00, 0x21, 0x1D, 0x01, 0x01, 0x03,
        idx & 0x7F,
        r & 0x7F, r >> 7,
        g & 0x7F, g >> 7,
        b & 0x7F, b >> 7,
        0, 0,   /* white channel = 0 */
        0xF7
    ]));
}

function reapplyPalette() { move_midi_internal_send(_CC_REAPPLY_PKT); }

function editSoundForTrack(t) {
    const popup = requestEditSoundForTrack(t, {
        hasCoRun: typeof shadow_corun_begin === 'function',
        hasMoveInject: typeof move_midi_inject_to_move === 'function'
    });
    showActionPopup(popup.title, popup.body);
}

/* ------------------------------------------------------------------ */
/* Step entry state                                                     */
/* ------------------------------------------------------------------ */

/* S.heldStepBtn: physical button index 0-15 that is currently held (-1 = none).
 * Stored separately from S.heldStep so a second button press doesn't cause the
 * first button's release to exit step edit prematurely. */

const STEP_HOLD_TICKS      = 19;   /* ~200ms at ~94Hz (device actual): below = tap, at/above = hold */
const STEP_SAVE_HOLD_TICKS = 70;   /* ~750ms at 94Hz */
const STEP_SAVE_FLASH_TICKS = 40;  /* ~200ms double-blink on step button LEDs after save */

/* Metronome */

/* Undo/redo availability (mirrors DSP undo_valid/redo_valid; set on every undoable action) */

/* Per-track mute/solo state (JS mirrors DSP) */

/* Suspend detection (suspend_keeps_js) */

/* Global menu state (Phase 5q) */

/* Tap Tempo screen state */

/* Session overview overlay (hold CC 50) */
const NOTE_SESSION_HOLD_TICKS = 40;  /* ~200ms at 196Hz */

/* Real-time recording state */

const pendingLiveNotes = createLiveNoteQueues(NUM_TRACKS);  /* buffered live notes flushed each tick */
const pendingDrumNoteOffs = Array.from({length: NUM_TRACKS}, () => []);  /* drum tap note-offs deferred 1 tick to avoid coalescing with note-on */
const recordingWorkflowState = createRecordingWorkflowState();
const _drumRecNoteOns  = recordingWorkflowState.drumRecNoteOns;  /* { track, laneNote, vel } — queued drum recording note-ons */
const _drumRecNoteOffs = recordingWorkflowState.drumRecNoteOffs;  /* { track, laneNote } — queued drum recording note-offs */


/* ------------------------------------------------------------------ */
/* Utility                                                              */
/* ------------------------------------------------------------------ */

function midiNoteName(n) {
    const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    return names[n % 12] + (Math.floor(n / 12) - 1);
}

function createMuteSoloWorkflowDeps() {
    return {
        numTracks: NUM_TRACKS,
        setParam: optionalHostModuleSetParam()
    };
}

function effectiveMute(t) {
    return effectiveMuteImpl(S, t);
}

function setTrackMute(t, on) {
    return setTrackMuteImpl(S, createMuteSoloWorkflowDeps(), t, on);
}

function setTrackSolo(t, on) {
    return setTrackSoloImpl(S, createMuteSoloWorkflowDeps(), t, on);
}

function clearAllMuteSolo() {
    return clearAllMuteSoloImpl(S, createMuteSoloWorkflowDeps());
}

/* Immediately refresh S.seqActiveNotes for the given step if it is the current
 * sequencer position on the active track — call after any step state change. */
function refreshSeqNotesIfCurrent(t, ac, absIdx) {
    return getTrackClipSyncFacade().refreshSeqNotesIfCurrent(t, ac, absIdx);
}

/* Clear all notes from a step and deactivate it (atomic DSP write). */
function clearStep(t, ac, absIdx) {
    return clearStepImpl(S, createClipEditOpsDeps(), t, ac, absIdx);
}

function showModePopup(title, items, activeIdx) {
    S.actionPopupLines     = [title, ...items];
    S.actionPopupHighlight = activeIdx + 1;
    S.actionPopupEndTick   = S.tickCount + ACTION_POPUP_TICKS;
    S.screenDirty = true;
}

function playMetronomeClick() {
    /* DSP handles click audio via render_block; nothing to do here */
}

/* Deps for the clip/row/step clipboard-op cluster (ui_clip_edit_ops.mjs).
 * setParam null-guarded; the per-clip bank refresh/reset wrappers + forceRedraw
 * close over module-global S. */
function createClipEditOpsDeps() {
    return {
        setParam: optionalHostModuleSetParam(),
        resetPerClipBankParamsToDefault,
        refreshPerClipBankParams,
        forceRedraw,
        effectiveClip,
        clipHasContent,
        refreshSeqNotesIfCurrent
    };
}

/* Clear all steps in a clip. clearClip runs in on_midi context and schedules
 * its tN_cC_clear via pendingDefaultSetParams. The drain at tick() bottom
 * fires on the SAME audio buffer as the synchronous set_param fan-out from
 * resetPerClipBankParamsToDefault below — and the host coalesces all of them
 * down to a single survivor, eating the queued _clear. clearDrainHold defers
 * the drain by one tick so _clear lands in a clean buffer. */
function clearClip(t, ac, keepPlaying) {
    return clearClipImpl(S, createClipEditOpsDeps(), t, ac, keepPlaying);
}

/* Full factory reset: clip_init on DSP + JS mirror cleared. Track View only. */
function hardResetClip(t, ac) {
    return hardResetClipImpl(S, createClipEditOpsDeps(), t, ac);
}

/* Copy clip src→dst (single atomic DSP write, JS mirror update). */
function copyClip(srcT, srcC, dstT, dstC) {
    return copyClipImpl(S, createClipEditOpsDeps(), srcT, srcC, dstT, dstC);
}

/* Cut clip: copy src→dst then hard-reset src (single atomic DSP write, JS mirror update). */
function cutClip(srcT, srcC, dstT, dstC) {
    return cutClipImpl(S, createClipEditOpsDeps(), srcT, srcC, dstT, dstC);
}

/* Copy all 8 tracks for a scene row (single atomic DSP write, JS mirror update). */
function copyRow(srcRow, dstRow) {
    return copyRowImpl(S, createClipEditOpsDeps(), srcRow, dstRow);
}

/* Cut row: copy all tracks src→dst then hard-reset src (single atomic DSP write, JS mirror update). */
function cutRow(srcRow, dstRow) {
    return cutRowImpl(S, createClipEditOpsDeps(), srcRow, dstRow);
}

/* Copy step src→dst within same clip (single atomic DSP write, JS mirror update). */
function copyStep(t, ac, srcAbs, dstAbs) {
    return copyStepImpl(S, createClipEditOpsDeps(), t, ac, srcAbs, dstAbs);
}

/* Copy active clip's lane srcLane to dstLane (same track, preserves dst midi_note). */
function copyDrumLane(t, srcLane, dstLane) {
    return copyDrumLaneImpl(S, createDrumLaneWorkflowDeps(), t, srcLane, dstLane);
}

/* Cut active clip's lane srcLane into dstLane (copy then clear src). */
function cutDrumLane(t, srcLane, dstLane) {
    return cutDrumLaneImpl(S, createDrumLaneWorkflowDeps(), t, srcLane, dstLane);
}

/* Copy all 32 lanes of drum_clips[srcC] on srcT to drum_clips[dstC] on dstT; preserve dst midi_notes. */
function copyDrumClip(srcT, srcC, dstT, dstC) {
    return copyDrumClipImpl(S, createDrumLaneWorkflowDeps(), srcT, srcC, dstT, dstC);
}

/* Cut all 32 lanes of drum_clips[srcC] on srcT into drum_clips[dstC] on dstT; undo dst only. */
function cutDrumClip(srcT, srcC, dstT, dstC) {
    return cutDrumClipImpl(S, createDrumLaneWorkflowDeps(), srcT, srcC, dstT, dstC);
}

/* Clear all 8 tracks for a scene row (single atomic DSP write, JS mirror update). */
function clearRow(rowIdx) {
    return clearRowImpl(S, createClipEditOpsDeps(), rowIdx);
}

function createRecordingWorkflowDeps() {
    return {
        padModeDrum: PAD_MODE_DRUM,
        moveRec: MoveRec,
        ledOff: LED_OFF,
        setParam: optionalHostModuleSetParam(),
        setButtonLED
    };
}

function disarmRecord() {
    return disarmRecordImpl(S, recordingWorkflowState, createRecordingWorkflowDeps());
}

function handoffRecordingToTrack(newTrack) {
    return handoffRecordingToTrackImpl(S, recordingWorkflowState, createRecordingWorkflowDeps(), newTrack);
}

function effectiveVelocity(rawVel) { return rawVel; }

function stepEntryVelocity(t, liveVel, allowZone) {
    return stepEntryVelocityImpl(S, t, liveVel, allowZone);
}

function flushChordBatch() {}

/* DSP-side recording: buffer note events; tick() flushes as a single batched set_param so
 * chords (multiple pads hit in the same ~5ms JS tick) are not lost to coalescing. */
const liveNoteRecordingState = recordingWorkflowState.liveNoteRecordingState;
const _recordingNoteTrack = liveNoteRecordingState.recordingNoteTrack; /* pitch → track index, for matching note-offs */
const extHeldNotes = liveNoteRecordingState.extHeldNotes; /* pitch → {track, recording} — external MIDI held notes */

function recordNoteOn(pitch, velocity, rt) {
    return recordNoteOnImpl(S, liveNoteRecordingState, pitch, velocity, rt);
}

function recordNoteOff(pitch) {
    return recordNoteOffImpl(S, liveNoteRecordingState, pitch);
}


function openTapTempo() {
    openTapTempoImpl(S, createTapTempoDeps());
}

function closeTapTempo() {
    closeTapTempoImpl(S, createTapTempoDeps());
}

function registerTapTempo(padNote) {
    registerTapTempoImpl(S, createTapTempoDeps(), padNote);
}

/* True when a clip has no note/hit data. CC-only automation does not count:
 * this gates implicit focused-clip launches so clips intentionally left off
 * stay off when browsing tracks or starting transport. */
function _clipIsEmpty(t, c) {
    return clipIsEmptyImpl(S, createTrackSelectionWorkflowDeps(), t, c);
}

function _focusedClipIsEmpty(t) {
    return focusedClipIsEmptyImpl(S, createTrackSelectionWorkflowDeps(), t);
}

/* Save the current S.activeBank into the outgoing track's per-track slot,
 * switch to newT, then restore the new track's stored bank into S.activeBank.
 * Existing post-switch validity checks (e.g. drum-track hidden banks → 0)
 * still apply to the loaded value. Use at every site that assigns S.activeTrack. */
function _switchActiveTrack(newT) {
    return switchActiveTrackImpl(S, createTrackSelectionWorkflowDeps(), newT);
}

/* Full active-track switch for a user navigation gesture (side button / bottom-pad).
 * Wraps _switchActiveTrack with the surrounding ceremony every nav site needs:
 * external note-off, recording handoff, drum-lane resync + bank fallback, padmap
 * rebake, sequencer-LED reset and redraw. newT is clamped to 0..NUM_TRACKS-1; a
 * no-op switch (same track) returns early. Mirrors the Shift+bottom-pad path
 * (the most complete of the legacy sites) so drum tracks render their lanes. */
function selectTrackGesture(newT) {
    return selectTrackGestureImpl(S, createTrackSelectionWorkflowDeps(), newT);
}

/* Track-View clip select/launch/toggle for the Change #1 hold-reveal overlay.
 * This is the exact state machine that used to live inline in _onCC_side's
 * Track-View else-branch (before side buttons became track-select): re-launch a
 * pending-stop clip, arm stop-at-end on a playing active clip, cancel a queued/
 * relaunch clip, else focus + launch. Now reached by tapping a step while a side
 * button is held (S.revealClipsTrack). */
function selectClipOnTrack(t, clipIdx) {
    return selectClipOnTrackImpl(S, createClipEditOpsDeps(), t, clipIdx);
}

function doDoubleFill() {
    return doDoubleFillImpl(S, createClipEditOpsDeps());
}

function doLaneDoubleFill() {
    return doLaneDoubleFillImpl(S, createClipEditOpsDeps());
}

function openGlobalMenu() {
    return openGlobalMenuImpl(S, createGlobalMenuWorkflowDeps());
}

function ensureGlobalMenuFresh() {
    return ensureGlobalMenuFreshImpl(S, createGlobalMenuWorkflowDeps());
}

/* "REC Unavailable" two-option dialog (OK | BAKE NOW). Opens when Record
 * is pressed on a clip / lane in any non-Forward direction or Audio reverse
 * style. OK dismisses; BAKE NOW opens the standard bake confirm dialog
 * pre-targeted at the active clip / drum lane. */
function drawStateWipeConfirm() {
    renderStateWipeConfirm(renderSurface(), S.confirmStateWipeSel);
}

function drawRecordBlockedDialog() {
    renderRecordBlockedDialog(renderSurface(), S.recordBlockedDialogSel);
}

/* Destructive Lgto confirm dialog. Right-turn of CLIP K8 / DRUM LANE K8
 * opens this. OK applies; CANCEL aborts. Undoable. */
function drawLgtoConfirm() {
    renderLgtoConfirm(renderSurface(), {
        isDrum: S.confirmLgtoIsDrum,
        selected: S.confirmLgtoSel
    });
}

function drawBakeConfirm() {
    renderBakeConfirm(renderSurface(), {
        wrapPhase: S.confirmBakeWrapPhase,
        wrapSel: S.confirmBakeWrapSel,
        isMultiLoop: S.confirmBakeIsMultiLoop,
        isDrum: S.confirmBakeIsDrum,
        drumLoopOpen: S.confirmBakeDrumLoopOpen,
        drumMode: S.confirmBakeDrumMode,
        drumLoopSel: S.confirmBakeDrumLoopSel,
        sel: S.confirmBakeSel
    });
}


function drawInheritPicker() {
    renderInheritPicker(renderSurface(), S.pendingInheritPicker);
}

function drawSnapshotPicker() {
    renderSnapshotPicker(renderSurface(), S.snapshotPicker);
}

/* CLEAR AUTOMATION modal — checkable AT / PB(disabled) / CC + a CLEAR action. */
function drawClearAutoMenu() {
    renderClearAutomationMenu(renderSurface(), S.clearAutoMenu);
}

function drawBakeSceneConfirm() {
    renderBakeSceneConfirm(renderSurface(), {
        wrapPhase: S.confirmBakeSceneWrapPhase,
        wrapSel: S.confirmBakeSceneWrapSel,
        sel: S.confirmBakeSceneSel
    });
}

function drawXposeConfirm() {
    renderXposeConfirm(renderSurface(), {
        key: S.confirmXposeKey,
        scale: S.confirmXposeScale,
        sel: S.confirmXposeSel,
        noteKeys: NOTE_KEYS,
        scaleDisplay: SCALE_DISPLAY
    });
}

function clipHasContent(t, c) {
    const s = S.clipSteps[t][c];
    for (let i = 0; i < NUM_STEPS; i++) if (s[i]) return true;
    return false;
}


/* ---- Transpose all melodic clips on global Key/Scale change ----------
 * Browsing the Key/Scale menu item arms a live preview (pads relayout +
 * DSP plays clips transposed); the knob-click commits behind a confirm.
 * Committed key/scale stay in S.padKey/S.padScale until commit; the
 * candidate lives in S.xposePrev* while previewing. */

/* Any melodic (non-drum) clip on any track with notes? */
function anyMelodicClipHasContent() {
    return anyMelodicClipHasContentImpl(S, createTransposeDeps());
}

/* Arm/refresh preview for candidate (candK,candS). Candidate == committed
 * cancels instead (no-op change). Runs from the menu-edit tick driver. */
function xposePreviewSet(candK, candS) {
    xposePreviewSetImpl(S, createTransposeDeps(), candK, candS);
}

/* Drop the preview: DSP returns playback to true pitch; pads back to committed.
 * The apply(flag=0) is queued (drained from tick) — set_param fired directly from
 * the onMidi confirm-click path is unreliable/coalesced. */
function xposeCancelPreview() {
    xposeCancelPreviewImpl(S, createTransposeDeps());
}

/* Commit: bake the transpose into all melodic clips, adopt the new key/scale.
 * The apply(flag=1) is queued (drained from tick — set_param from the onMidi
 * confirm path is unreliable). The DSP bake skips empty clips; on the JS side a
 * transpose changes only note PITCH — step occupancy, lengths, loops and config
 * are unchanged and the pad layout is rebuilt here — so no clip resync is needed
 * (held-step note pitches refresh on the next press). */
function xposeCommit(candK, candS) {
    xposeCommitImpl(S, createTransposeDeps(), candK, candS);
}

function computePadNoteMap() {
    return padSurfaceRuntime.computePadNoteMap();
}

/* Drum helpers --------------------------------------------------------------- */

let _trackClipSyncFacade = null;
function getTrackClipSyncFacade() {
    if (!_trackClipSyncFacade) {
        _trackClipSyncFacade = createTrackClipSyncFacade(S, {
            TPS_VALUES,
            createHostParamAdapters,
            optionalHostFileExists,
            optionalHostModuleGetParam,
            optionalHostModuleGetParamUndefined,
            optionalHostReadFile,
            setActiveDrumLane,
            clipHasContent,
            readBankParams
        });
    }
    return _trackClipSyncFacade;
}

/** Sync one drum lane's step data and length from DSP. */
function syncDrumLaneSteps(t, l) {
    return getTrackClipSyncFacade().syncDrumLaneSteps(t, l);
}

/** Sync lane notes and hit-presence for all lanes of track t (active clip). */
function syncDrumLanesMeta(t) {
    return getTrackClipSyncFacade().syncDrumLanesMeta(t);
}


/** Convert a padIdx (0-31) to drum lane index for the current lane page, or -1 if right half. */
function drumPadToLane(padIdx) {
    return padSurfaceDrumPadToLane(padIdx, S.drumLanePage[S.activeTrack]);
}

function createDrumClipSyncDeps() {
    return getTrackClipSyncFacade().createDrumClipSyncDeps();
}

function createClipStateSyncDeps() {
    return getTrackClipSyncFacade().createClipStateSyncDeps();
}

function createDrumPadPressDeps() {
    return {
        setActiveDrumLane,
        syncDrumLaneSteps,
        refreshDrumLaneBankParams,
        effectiveVelocity,
        liveSendNote,
        stepEntryVelocity,
        host_module_set_param: optionalHostModuleSetParam(),
        forceRedraw,
        padPitch,
        padPressTick,
        drumRecNoteOns: _drumRecNoteOns
    };
}

function createDrumLaneWorkflowDeps() {
    return {
        DRUM_LANES,
        setActiveDrumLane,
        refreshDrumLaneBankParams,
        copyDrumLane,
        cutDrumLane,
        invalidateLEDCache,
        showActionPopup,
        host_module_set_param: optionalHostModuleSetParam(),
        forceRedraw
    };
}

function createDrumRepeatWorkflowDeps() {
    return {
        PAD_MODE_DRUM,
        DRUM_LANES,
        drumPadToLane,
        setActiveDrumLane,
        syncDrumLaneSteps,
        refreshDrumLaneBankParams,
        host_module_set_param: optionalHostModuleSetParam(),
        forceRedraw,
        padPitch,
        setDrumPerformMode,
        showModePopup
    };
}

/* Pad Surface runtime setter for S.activeDrumLane that also pushes the
 * value to DSP via tN_active_drum_lane so on_midi.drum_pad_event can
 * fire vel-pad preview at the active lane's note. Keep this wrapper name for
 * ui.js callers; the runtime owns the mutation/write invariant. */
function setActiveDrumLane(t, lane) {
    return padSurfaceRuntime.setActiveDrumLane(t, lane);
}

/* Pad Surface runtime setter for S.drumPerformMode that also pushes the
 * value to DSP via tN_drum_perform_mode so on_midi.drum_pad_event can
 * gate the vel-zone preview branch correctly (Rpt modes skip the
 * preview; only NORMAL fires it). */
function setDrumPerformMode(t, mode) {
    return padSurfaceRuntime.setDrumPerformMode(t, mode);
}

/* Pad Surface runtime setter for S.drumLanePage that also pushes the
 * value to DSP via tN_drum_lane_page so on_midi.drum_pad_event can
 * translate left-half padIdx → absolute drum lane index (Rpt2 lane-pad
 * classification + Rpt1 lane-swap-while-holding). */
function setDrumLanePage(t, page) {
    return padSurfaceRuntime.setDrumLanePage(t, page);
}

/** Sync S.drumClipNonEmpty[t] for all clips — called on track switch and state load. */
function syncDrumClipContent(t) {
    return getTrackClipSyncFacade().syncDrumClipContent(t);
}

function drumNoteLabel(midiNote) {
    return drumNoteLabelImpl(midiNote);
}

/* --------------------------------------------------------------------------- */

function defaultStepNote() {
    return defaultStepNoteImpl(S);
}


/* Synchronously zero every LED that SEQ8 owns — call before host_hide_module(). */
function clearAllLEDs() {
    clearAllLEDsImpl(createLedInitDeps());
}

function installFlagsWrap() {
    installFlagsWrapImpl(S, createLedInitDeps());
}

function removeFlagsWrap() {
    removeFlagsWrapImpl(createLedInitDeps());
}

function buildLedInitQueue() {
    return buildLedInitQueueImpl();
}

function drainLedInit() {
    drainLedInitImpl(S, createLedInitDeps());
}

/* Read per-clip bank params from DSP into S.bankParams for track t.
 * Reads from clip[active_clip].pfx_params directly — immune to pfx_sync timing. */
function refreshDrumLaneBankParams(t, lane) {
    return getTrackClipSyncFacade().refreshDrumLaneBankParams(t, lane);
}

/* Full drum-track resync after track switches. Side-button selection,
 * Shift+pad, and Shift+jog all need the same lane metadata, active-lane
 * steps, clip-content dots, and bank params. */
function resyncDrumTrack(t) {
    return getTrackClipSyncFacade().resyncDrumTrack(t);
}

function refreshPerClipBankParams(t) {
    return getTrackClipSyncFacade().refreshPerClipBankParams(t);
}

/* Read TRACK ARP step_vel[8] from DSP for track t. Called on init and track switch. */
function readTarpStepVel(t) {
    return getTrackClipSyncFacade().readTarpStepVel(t);
}

/* Read Rpt2 per-lane rate idx[32] from DSP for track t. Called after state
 * load so the rate-pad LED highlight matches the persisted DSP state.
 * (Rpt1's per-track last-rate lives only in DSP — JS has no mirror for it.) */
function readDrumRepeatRates(t) {
    return getTrackClipSyncFacade().readDrumRepeatRates(t);
}

let _parameterBankRuntime = null;
function getParameterBankRuntime() {
    if (!_parameterBankRuntime) {
        _parameterBankRuntime = createParameterBankRuntime(S, {
            createHostParamAdapters,
            hasShadowSetParam,
            refreshDrumLaneBankParams,
            syncDrumLanesMeta,
            syncDrumLaneSteps,
            syncDrumClipContent,
            computePadNoteMap,
            forceRedraw,
            showActionPopup
        });
    }
    return _parameterBankRuntime;
}

/* Reset per-clip S.bankParams to defaults for track t (no DSP call needed —
 * DSP already reset them; this just keeps JS mirrors in sync). */
function resetPerClipBankParamsToDefault(t) {
    return getParameterBankRuntime().resetPerClipBankParamsToDefault(t);
}

function createPollDspWorkflowDeps() {
    return {
        /* constants */
        numTracks: NUM_TRACKS,
        numSteps: NUM_STEPS,
        drumLanes: DRUM_LANES,
        padModeDrum: PAD_MODE_DRUM,
        moveSample: MoveSample,
        ledOff: LED_OFF,
        corunChainEdit: CORUN_TARGET_CHAIN_EDIT,
        corunMoveNative: CORUN_TARGET_MOVE_NATIVE,
        /* host */
        ...createHostParamAdapters(),
        writeFile: optionalHostWriteFile(),
        corunState: typeof shadow_corun_state === 'function' ? shadow_corun_state : null,
        /* helpers (close over module-global S) */
        exitSchwungCoRun,
        exitMoveNativeCoRun,
        effectiveClip,
        refreshPerClipBankParams,
        syncDrumLanesMeta,
        syncDrumLaneSteps,
        setButtonLED,
        showActionPopup,
        syncClipsFromDsp,
        clipHasContent,
        disarmRecord,
        unlatchAllTracks,
        focusedClipIsEmpty: _focusedClipIsEmpty,
        uuidToStatePath,
        updateNameIndex
    };
}

/* Public wrapper retained for tick-path callers and host-global naming. */
function pollDSP() {
    return pollDspWorkflow(S, createPollDspWorkflowDeps());
}

/* Refresh name -> uuid mapping after any successful save so that future
 * duplicates of this set can inherit its state. In-memory cache; disk write
 * happens on suspend, deferred-save, and clear-session. */
function updateNameIndex() {
    if (!S.currentSetUuid || !S.currentSetName) return;
    if (!S.nameIndexCache) S.nameIndexCache = loadNameIndex();
    if (S.nameIndexCache[S.currentSetName] === S.currentSetUuid) return;
    S.nameIndexCache[S.currentSetName] = S.currentSetUuid;
    saveNameIndex(S.nameIndexCache);
}

/* Reset NOTE FX, HARMZ, and MIDI DLY banks to DSP defaults for track t.
 * The pfx_reset push itself is deferred via pendingDefaultSetParams — when
 * called from a MIDI handler (jog click), a synchronous push competes with
 * the same-buffer MIDI delivery and is silently coalesced away, leaving DSP
 * with no reset despite the OLED reporting success. The delay_level=127
 * override is queued after the reset so it lands on a later tick (DSP zeros
 * delay_level during the reset). */
function resetFxBanks(t) {
    return getParameterBankRuntime().resetFxBanks(t);
}

function resetTarp(t) {
    return getParameterBankRuntime().resetTarp(t);
}

function resetSingleFxBank(t, bankIdx) {
    return getParameterBankRuntime().resetSingleFxBank(t, bankIdx);
}

/* ------------------------------------------------------------------ */
/* Parameter bank: read from DSP and write to DSP                      */
/* ------------------------------------------------------------------ */

/* Read all wired params for bankIdx on track t from DSP into S.bankParams. */
function readBankParams(t, bankIdx) {
    return getParameterBankRuntime().readBankParams(t, bankIdx);
}

function readTrackConfig(t) {
    return getTrackClipSyncFacade().readTrackConfig(t);
}

function applyTrackConfig(t, key, val) {
    return getParameterBankRuntime().applyTrackConfig(t, key, val);
}

/* Convert a track between melodic and drum, translating note content so the
 * music follows the track. The DSP handler (tN_convert_to_drum/_to_melodic)
 * does the data move AND flips pad_mode atomically in a single set_param, so
 * there is no coalescing drop. We then resync JS from DSP — syncClipsFromDsp()'s
 * get_param round-trips double as the audio-thread sync barrier. */
function trackHasAnyData(t) {
    return trackHasAnyDataImpl(S, createTrackConvertWorkflowDeps(), t);
}

function convertTrackType(t, toDrum) {
    return convertTrackTypeImpl(S, createTrackConvertWorkflowDeps(), t, toDrum);
}

/* Tear down the Keys->Drums confirm dialog and the menu's edit state so a
 * lingering enum edit doesn't replay. Call on Yes, No, and Back-cancel. */
function closeConvertConfirm() {
    return closeConvertConfirmImpl(S);
}

function createExtMidiRemapWorkflowDeps() {
    return {
        routeMove: 1,
        blockValue: 254,
        ...createExtMidiRemapHostAdapters()
    };
}

/* Rewrite the cable-2 channel remap table for the active track.
 * When the active track is ROUTE_MOVE, incoming external MIDI is remapped to the
 * track's channel so Move's firmware routes it to the correct track instrument.
 * Called from tick() on any change to activeTrack/route/channel/midiInChannel,
 * and directly from init() on first load / resume after full exit. */
function applyExtMidiRemap() {
    return applyExtMidiRemapImpl(S, createExtMidiRemapWorkflowDeps());
}

function bankHasAltParams(t, bank) {
    return getParameterBankRuntime().bankHasAltParams(t, bank);
}

function altIndicatorActive(t, bank) {
    return getParameterBankRuntime().altIndicatorActive(t, bank);
}

/* Send a single param change to DSP and apply any JS-side side-effects. */
function applyBankParam(t, bankIdx, knobIdx, val) {
    return getParameterBankRuntime().applyBankParam(t, bankIdx, knobIdx, val);
}

function createLiveNoteWorkflowDeps() {
    return {
        pendingLiveNotes,
        move_midi_external_send: optionalMoveMidiExternalSend(),
        shadow_send_midi_to_dsp: optionalShadowSendMidiToDsp()
    };
}

function liveSendNote(t, type, pitch, vel, rawVel) {
    OVERTURE_DEBUG_LOG && dlog('DEBUG', 'live-note t=' + (t | 0)
        + ' type=' + (type | 0)
        + ' pitch=' + (pitch | 0)
        + ' vel=' + (vel | 0)
        + ' raw=' + (rawVel ? 1 : 0)
        + ' route=' + (S.trackRoute[t | 0] | 0)
        + ' ch=' + (S.trackChannel[t | 0] | 0)
        + ' dspInbound=' + (S.dspInboundEnabled ? 1 : 0)
        + ' pendingQ=' + (pendingLiveNotes[t | 0] ? pendingLiveNotes[t | 0].length : -1));
    return liveSendNoteImpl(S, createLiveNoteWorkflowDeps(), t, type, pitch, vel, rawVel);
}

function extNoteOffAll() {
    return extNoteOffAllImpl(S, liveNoteRecordingState, {
        liveSendNote
    });
}

function createTrackSelectionWorkflowDeps() {
    return {
        computePadNoteMap,
        extNoteOffAll,
        forceRedraw,
        handoffRecordingToTrack,
        numTracks: NUM_TRACKS,
        padModeDrum: PAD_MODE_DRUM,
        refreshPerClipBankParams,
        resyncDrumTrack,
        setParam: optionalHostModuleSetParam()
    };
}

function createMidiExternalWorkflowDeps() {
    return {
        drumRecNoteOns: _drumRecNoteOns,
        drumRecNoteOffs: _drumRecNoteOffs,
        effectiveVelocity,
        extHeldNotes,
        liveSendNote,
        melodicStepNoteAssignment: function (pitch, vel, opts) {
            return handleTrackViewMelodicStepNoteAssignment(S, createTrackViewStepWorkflowDeps(), pitch, vel, opts);
        },
        padModeDrum: PAD_MODE_DRUM,
        recordNoteOn,
        recordNoteOff
    };
}



function sceneAllPlaying(sceneIdx) {
    let hasAny = false;
    if (S.playing) {
        for (let t = 0; t < NUM_TRACKS; t++) {
            if (!S.trackClipPlaying[t]) continue;
            if (S.trackActiveClip[t] !== sceneIdx) return false;
            hasAny = true;
        }
    } else {
        for (let t = 0; t < NUM_TRACKS; t++) {
            if (!S.trackWillRelaunch[t] && S.trackQueuedClip[t] < 0) continue;
            if (effectiveClip(t) !== sceneIdx) return false;
            hasAny = true;
        }
    }
    return hasAny;
}

function sceneAnyPlaying(sceneIdx) {
    for (let t = 0; t < NUM_TRACKS; t++) {
        if (S.trackClipPlaying[t] && S.trackActiveClip[t] === sceneIdx) return true;
    }
    return false;
}






/* Send current combined modifier bitmask to DSP. */
function sendPerfMods() {
    sendPerfModsImpl(S, {
        setParam: optionalHostModuleSetParam()
    });
}

/* Draw the full 4-row pad grid for Performance Mode.
 * R0 (68-75): rate pads 1-6 (pulse at capture rate), triplet toggle, latch.
 * R1 (76-83): PITCH modifier pads (HotMagenta family).
 * R2 (84-91): VEL/GATE modifier pads (VividYellow family).
 * R3 (92-99): WILD modifier pads (Cyan family).
 * Also clears step buttons (16-31) — not used in Perf Mode. */
function updatePerfModeLEDs() {
    updatePerfModeLEDsImpl(S, { setLED });
}

function forceRedraw() {
    S.screenDirty = true;
    if (!S.ledInitComplete) return;
    if (S.sessionView) {
        updateSessionLEDs();
        if (S.loopHeld || S.perfViewLocked) updatePerfModeLEDs();
        else { updateSceneMapLEDs(); for (let i = 0; i < 16; i++) setLED(16 + i, LED_OFF); }
    } else {
        updateStepLEDs();
    }
    updateTrackLEDs();
}

/* ------------------------------------------------------------------ */
/* Display                                                              */
/* ------------------------------------------------------------------ */

/* Render Surface — assembled once from the host drawing primitives, the local
 * chrome helpers, and the render-time param queries. Memoized: the references are
 * stable for the runtime's life, so every render module shares the one surface
 * instead of rebuilding a bespoke deps bag each frame. Built lazily on first draw
 * so the optional host param read resolves after the host globals exist. */
let _renderSurface = null;
function renderSurface() {
    if (_renderSurface === null) {
        _renderSurface = createRenderSurface({
            print,
            pixelPrint,
            fill_rect,
            clear_screen,
            drawBankHeading,
            drawBankHeadingInverted,
            drawAltArrow,
            drawMenuHeader,
            drawMetroIndicator,
            drawPositionBar,
            altIndicatorActive,
            bankHasAltParams,
            midiNoteName,
            host_module_get_param: optionalHostModuleGetParam(),
        });
    }
    return _renderSurface;
}

let _textKeyboard = null;
function textKeyboard() {
    if (_textKeyboard === null) {
        _textKeyboard = createTextKeyboard({
            print,
            fill_rect,
            clear_screen,
            decodeDelta,
            moveMidiInternalSend: typeof move_midi_internal_send === 'function' ? move_midi_internal_send : null,
            getPadLedSnapshot: typeof shadow_get_pad_led_snapshot === 'function' ? shadow_get_pad_led_snapshot : null,
            hostPadBlock: typeof host_pad_block === 'function' ? host_pad_block : null
        });
    }
    return _textKeyboard;
}

function drawUI() {
    if (textKeyboard().isActive()) {
        textKeyboard().render();
        return;
    }
    return drawUIImpl(S, {
        renderSurface,
        paintCoRunSideButtons,
        renderAutoRouteOverlay,
        renderSessionOverview,
        drawInheritPicker,
        drawSnapshotPicker,
        drawClearAutoMenu,
        renderSceneBakePickerPrompt,
        renderMergePlacementPrompt,
        drawStateWipeConfirm,
        drawRecordBlockedDialog,
        drawLgtoConfirm,
        drawXposeConfirm,
        drawBakeSceneConfirm,
        drawBakeConfirm,
        ensureGlobalMenuFresh,
        drawGlobalMenu,
        renderPerfModeOled,
        renderSchwungSoundPage,
        renderSplashScreen,
        clear_screen,
        renderSessionActionPopup,
        renderSessionIdleView,
        renderCompressLimitNotice,
        renderTrackActionPopup,
        renderNoNoteFlashNotice,
        renderShiftStepHelp,
        renderCcStepEditView,
        renderTrackStepEditView,
        renderLoopView,
        renderStepIntervalOverlay,
        renderMotionIdleView,
        bankHasAltParams,
        renderParamPeek,
        syncDrumRepeatState: function(t, lane) { return syncDrumRepeatState(t, lane); },
        renderTrackBankOverview,
        renderDrumTrackIdleView,
        renderMelodicTrackIdleView
    });
}


function fmtHex(b) {
    return (b & 0xff).toString(16).padStart(2, '0').toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                            */
/* ------------------------------------------------------------------ */

/* Inherit-picker entry. On first launch in a freshly-pasted Move duplicate
 * (Copy-suffixed name + no canonical state file), check the name index for
 * family members and either auto-inherit (one candidate) or show a picker
 * dialog (two or more). Returns one of:
 *   'auto'   — silently inherited from the single candidate
 *   'picker' — dialog opened, S.pendingInheritPicker set
 *   'blank'  — nothing to inherit; let normal flow proceed */
function maybeShowInheritPicker(uuid, name) {
    return maybeShowInheritPickerImpl(S, createInheritPickerDeps(), uuid, name);
}

/* Resolve the inherit picker: action is either the candidates index to
 * inherit from, or -1 for "Start blank". Always trigger pendingSetLoad
 * so DSP runs its state_load handler — which both resets the internal
 * state (clip_init, drum_track_init, etc.) and reads the canonical file.
 * For "Start blank" the file is missing on purpose; the reset alone gives
 * a clean slate. For inherit, we copy the source's state files first so
 * the load reads the seeded content. */
function resolveInheritPicker(action) {
    resolveInheritPickerImpl(S, createInheritPickerDeps(), action);
}

/* ------------------------------------------------------------------ */
/* Snapshots — Save state / Load state                                 */
/* Self-contained modal (S.snapshotPicker), modeled on the inherit     */
/* picker. Confirm dialogs are folded into the picker object so the     */
/* only integration points are draw, jog-rotate, jog-click and close.  */
/* ------------------------------------------------------------------ */

/* Flush live state to disk (deferred 'save') then copy it into snapshot
 * `id` next tick — pendingSnapshotCopy is drained one tick after the save,
 * by which point seq8_save_state has written the file synchronously.
 * Reusing an existing id overwrites that snapshot in place. */
function beginSnapshotSave(id) {
    beginSnapshotSaveImpl(S, createSnapshotDeps(), id);
}

/* Save state action. Under the cap → new timestamped snapshot. At the cap →
 * open the overwrite picker to choose which existing one to replace. */
function openSaveSnapshot() {
    openSaveSnapshotImpl(S, createSnapshotDeps());
}

/* Load state action. Empty → popup. If any snapshots predate the current
 * state version, offer to wipe them before showing the list. */
function openLoadSnapshot() {
    openLoadSnapshotImpl(S, createSnapshotDeps());
}

function closeSnapshotPicker() {
    closeSnapshotPickerImpl(S);
}

/* Jog rotation inside the picker: toggle a confirm's Yes/No, else move
 * the list selection. */
function snapshotPickerRotate(delta) {
    snapshotPickerRotateImpl(S, delta);
}

/* Jog click inside the picker: resolve a confirm, or arm one for the
 * selected entry. */
function snapshotPickerClick() {
    snapshotPickerClickImpl(S, createSnapshotDeps());
}

/* ---- CLEAR AUTOMATION menu (Delete-tap on the AUTO bank) ---- */
function openClearAutoMenu() {
    openClearAutoMenuImpl(S);
}
function closeClearAutoMenu() {
    closeClearAutoMenuImpl(S);
}
function clearAutoMenuRotate(delta) {
    clearAutoMenuRotateImpl(S, delta);
}
function clearAutoMenuClick() {
    clearAutoMenuClickImpl(S, createClearAutoMenuDeps());
}

function enterSchwungCoRun(t, slot) {
    enterSchwungCoRunImpl(S, createCoRunDeps(), t, slot);
}

function exitSchwungCoRun() {
    exitSchwungCoRunImpl(S, createCoRunDeps());
}

function enterMoveNativeCoRun(t) {
    enterMoveNativeCoRunImpl(S, createCoRunDeps(), t);
}

function exitMoveNativeCoRun() {
    exitMoveNativeCoRunImpl(S, createCoRunDeps());
}

function restoreUiSidecar(applyDefaultsNow) {
    return getTrackClipSyncFacade().restoreUiSidecar(applyDefaultsNow);
}

function syncClipsFromDsp() {
    return getTrackClipSyncFacade().syncClipsFromDsp();
}

function createTrackConvertWorkflowDeps() {
    return {
        computePadNoteMap,
        forceRedraw,
        getParam: optionalHostModuleGetParam(),
        invalidateLEDCache,
        numClips: NUM_CLIPS,
        padModeDrum: PAD_MODE_DRUM,
        padModeMelodicScale: PAD_MODE_MELODIC_SCALE,
        setParam: optionalHostModuleSetParam(),
        syncClipsFromDsp
    };
}

function createInitWorkflowDeps() {
    return {
        installConsoleOverride,
        exposeState: function (state) {
            if (typeof globalThis !== 'undefined') globalThis.overtureUiState = state;
        },
        shadowCorunEnd: (typeof shadow_corun_end === 'function') ? shadow_corun_end : null,
        banks: BANKS,
        getParam: optionalHostModuleGetParam(),
        log: function (msg) { console.log(msg); },
        readActiveSet,
        maybeShowInheritPicker,
        fileExists: optionalHostFileExists(),
        host_read_file: optionalHostReadFile(),
        syncClipsFromDsp,
        syncMuteSoloFromDsp,
        extHeldNotes,
        restoreUiSidecar,
        shadowInboundPadMidiActive: (typeof shadow_inbound_pad_midi_active === 'function') ? shadow_inbound_pad_midi_active : null,
        shadowOvertakeSendExternalAsyncActive: (typeof shadow_overtake_send_external_async_active === 'function') ? shadow_overtake_send_external_async_active : null,
        computePadNoteMap,
        applyExtMidiRemap,
        invalidateLEDCache,
        buildLedInitQueue,
        installFlagsWrap,
        clearScreen: clear_screen
    };
}

/* Targeted re-sync after undo/redo: re-read only the affected clips rather than all 64.
 * infoStr format: "d t c" (drum) or "m t0 c0 t1 c1 ..." (melodic, 1-16 pairs).
 * Falls back to full syncClipsFromDsp() if infoStr is missing or unparseable. */
function syncClipsTargeted(infoStr) {
    return getTrackClipSyncFacade().syncClipsTargeted(infoStr);
}

function syncMuteSoloFromDsp() {
    return getTrackClipSyncFacade().syncMuteSoloFromDsp();
}

/* --- DIAGNOSTIC (2026-05-23 crash investigation) ---------------------------
 * QuickJS swallows unhandled exceptions thrown inside entry-point callbacks.
 * Keep public callbacks in this file while the capture details live in the
 * tiny UI Runtime diagnostic module. */
const _entrypointDiagnostics = createEntrypointErrorWrapper(S);
function runEntrypoint(where, fn) {
    return _entrypointDiagnostics.runEntrypoint(where, fn);
}

globalThis.init = function () {
    /* Rebind the memoized render surface to the host's current draw primitives.
     * The surface caches print/fill_rect/clear_screen by value (a per-frame
     * allocation optimization — see renderSurface()), valid because they're
     * stable for a runtime's life. init() is the runtime's (re)bind point: once
     * at launch, once per Shift+Back resume (a cheap one-off rebuild). It also
     * lets the headless harness swap host primitives per createHarness() without
     * rendering into a stale recorder. */
    _renderSurface = null;
    OVERTURE_DEBUG_LOG && initDebugLog();
    runEntrypoint('init', function () { runInitWorkflowImpl(S, createInitWorkflowDeps()); });
};

/* Headless-test teardown hook: the vitest behaviour harness reuses one ui.js
 * runtime across createHarness() calls, so it resets the S singleton before each
 * init() to isolate tests (init() preserves most state by design — the on-device
 * Shift+Back resume model). Unused on device (an extra global, like exposeState).
 * The render surface is NOT reset here — init() rebinds it (see below). */
if (typeof globalThis !== 'undefined') globalThis.__overtureResetState = resetUiState;

function createTickWorkflowDeps() {
    return {
        NUM_TRACKS,
        NUM_STEPS,
        DRUM_LANES,
        PAD_MODE_DRUM,
        TPS_VALUES,
        POLL_INTERVAL,
        BANK_DISPLAY_TICKS,
        KNOB_TURN_HIGHLIGHT_TICKS,
        PARAM_PEEK_DETAIL_TICKS,
        expireSchwungSoundParamPeek,
        expireSchwungSoundStatusFlash,
        tickTextEntry: function () {
            return textKeyboard().tick();
        },
        STEP_SAVE_HOLD_TICKS,
        STEP_SAVE_FLASH_TICKS,
        STEP_HOLD_TICKS,
        CC_GRADIENT_LEVELS,
        CC_GRADIENT_SCALARS,
        CC_GRADIENT_BASE,
        MovePlay,
        MoveRec,
        MoveSample,
        MoveLoop,
        MoveCapture,
        MoveMute,
        MoveShift,
        MoveNoteSession,
        MoveUndo,
        MoveDelete,
        MoveCopy,
        MoveUp,
        MoveDown,
        MoveLeft,
        MoveRight,
        Green,
        Red,
        DarkGrey,
        White,
        VividYellow,
        LED_OFF,
        TRACK_COLORS,
        ...createTickHostAdapters(),
        clearScreen: clear_screen,
        pendingLiveNotes,
        pendingDrumNoteOffs,
        drumRecNoteOns: _drumRecNoteOns,
        drumRecNoteOffs: _drumRecNoteOffs,
        pollPendingExport,
        convertTrackType,
        computePadNoteMap,
        padDispatchMuted: function() { return padSurfaceRuntime.padDispatchMuted(); },
        applyExtMidiRemap,
        saveState,
        removeFlagsWrap,
        installFlagsWrap,
        readActiveSet,
        maybeShowInheritPicker,
        invalidateLEDCache,
        buildLedInitQueue,
        forceRedraw,
        liveSendNote,
        schSlotForTrack,
        setPaletteEntryRGB,
        reapplyPalette,
        setButtonLED,
        setLED,
        disarmRecord,
        pollDSP,
        syncClipsFromDsp,
        syncMuteSoloFromDsp,
        restoreUiSidecar,
        syncClipsTargeted,
        clearRecordingNoteBuffers: function () {
            clearRecordingNoteBuffers(S, recordingWorkflowState);
        },
        showActionPopup,
        syncDrumClipContent,
        syncDrumLanesMeta,
        syncDrumLaneSteps,
        refreshDrumLaneBankParams,
        refreshPerClipBankParams,
        clipHasContent,
        xposeCancelPreview,
        drainLedInit,
        refreshSchwungCoRunSlotMask,
        advancePendingEditSoundEntry,
        enterMoveNativeCoRun,
        enterSchwungCoRun,
        playMetronomeClick,
        createTrackViewStepWorkflowDeps,
        sceneAllPlaying,
        sceneAllQueued,
        sceneAnyPlaying,
        flashAtRate,
        updateSessionLEDs,
        updatePerfModeLEDs,
        updateSceneMapLEDs,
        updateStepLEDs,
        updateTrackLEDs,
        updateNameIndex,
        clearAllLEDs,
        commitSnapshot,
        loadNameIndex,
        uuidToStatePath,
        saveNameIndex,
        altIndicatorActive,
        drawUI
    };
}

globalThis.tick = function () { runEntrypoint('tick', _tickImpl); };
function _tickImpl() {
    runTickWorkflow(S, createTickWorkflowDeps());
}

/* ------------------------------------------------------------------ */
/* MIDI input                                                           */
/* ------------------------------------------------------------------ */

function _onCC_jog(d1, d2) {
    onCcJogImpl(S, createInputDispatchWorkflowDeps(), d1, d2);
}

function _onCC_buttons(d1, d2) {
    onCcButtonsImpl(S, createInputDispatchWorkflowDeps(), d1, d2);
}

function _onCC_transport(d1, d2) {
    onCcTransportImpl(S, createInputDispatchWorkflowDeps(), d1, d2);
}

function _onCC_side(d1, d2) {
    onCcSideImpl(S, createInputDispatchWorkflowDeps(), d1, d2);
}

function ccKnobDelta(d2, k) {
    return ccKnobDeltaImpl(S, d2, k);
}

function _onCC_stepedit(d1, d2) {
    onCcStepEditImpl(S, createInputDispatchWorkflowDeps(), d1, d2);
}

function _onCC_knobs(d1, d2) {
    onCcKnobsImpl(S, createInputDispatchWorkflowDeps(), d1, d2);
}

function _switchViewCleanup() {
    switchViewCleanupImpl(S, createInputDispatchWorkflowDeps());
}

function _onCCMsg(d1, d2) {
    onCcMsgImpl({
        onJog: _onCC_jog,
        onButtons: _onCC_buttons,
        onTransport: _onCC_transport,
        onSide: _onCC_side,
        onStepEdit: _onCC_stepedit,
        onKnobs: _onCC_knobs
    }, d1, d2);
}


function createPadWorkflowDeps() {
    return {
        ...createPadHardwareAdapters(),
        /* constants */
        padModeDrum: PAD_MODE_DRUM,
        drumLanes: DRUM_LANES,
        numTracks: NUM_TRACKS,
        banks: BANKS,
        looperRatesStraight: LOOPER_RATES_STRAIGHT,
        perfModPadMap: PERF_MOD_PAD_MAP,
        perfModFullNames: PERF_MOD_FULL_NAMES,
        perfModPopupTicks: PERF_MOD_POPUP_TICKS,
        drumTapTicks: DRUM_TAP_TICKS,
        /* host */
        setParam: optionalHostModuleSetParam(),
        injectToMove: optionalMoveMidiInjectToMove(),
        /* module-global arrays (passed by reference; handlers mutate elements) */
        padPitch,
        padPressTick,
        pendingDrumNoteOffs,
        drumRecNoteOffs: _drumRecNoteOffs,
        /* helpers (close over module-global S) */
        drumPadToLane,
        resolveDrumPadTarget,
        effectiveVelocity,
        stepEntryVelocity,
        effectiveClip,
        liveSendNote,
        recordNoteOn,
        recordNoteOff,
        registerTapTempo,
        selectTrackGesture,
        readBankParams,
        writeSidecar,
        sendPerfMods,
        forceRedraw,
        /* sub-workflow thunks (each builds its own deps) */
        drumLaneFactoryReset: function (t, lane) { return handleDrumLaneFactoryReset(S, createDrumLaneWorkflowDeps(), t, lane); },
        deleteDrumLaneClear: function (t, lane, opts) { return handleDeleteDrumLaneClear(S, createDrumLaneWorkflowDeps(), t, lane, opts); },
        drumRepeatPadPress: function (padIdx, d2) { return handleDrumRepeatPadPress(S, createDrumRepeatWorkflowDeps(), S.activeTrack, padIdx, d2); },
        captureDrumLanePress: function (padIdx, target) { return handleCaptureDrumLanePress(S, createDrumPadPressDeps(), S.activeTrack, padIdx, target); },
        drumVelocityPadPress: function (padIdx, target) { return handleDrumVelocityPadPress(S, createDrumPadPressDeps(), S.activeTrack, padIdx, target); },
        drumLaneCopyPaste: function (t, lane) { return handleDrumLaneCopyPaste(S, createDrumLaneWorkflowDeps(), t, lane); },
        drumLaneMuteSolo: function (t, lane) { return handleDrumLaneMuteSolo(S, createDrumLaneWorkflowDeps(), t, lane); },
        drumLanePadPress: function (padIdx, d2, target) { return handleDrumLanePadPress(S, createDrumPadPressDeps(), S.activeTrack, padIdx, d2, target); },
        melodicStepNoteAssignment: function (pitch, vel) { return handleTrackViewMelodicStepNoteAssignment(S, createTrackViewStepWorkflowDeps(), pitch, vel); },
        loopStepRelease: function (idx) { return handleLoopStepRelease(S, createLoopGestureWorkflowDeps(), idx); },
        sessionViewStepRelease: function (btn) { return handleSessionViewStepRelease(S, createSessionViewWorkflowDeps(), btn); },
        trackViewStepRelease: function (btn) { return handleTrackViewStepRelease(S, createTrackViewStepWorkflowDeps(), btn); },
        drumRepeatPadRelease: function (t, padIdx) { return handleDrumRepeatPadRelease(S, createDrumRepeatWorkflowDeps(), t, padIdx); }
    };
}

function _onPadPressTrackView(status, d1, d2) {
    OVERTURE_DEBUG_LOG && dlog('DEBUG', 'pad track-view press status=' + (status | 0)
        + ' d1=' + (d1 | 0)
        + ' d2=' + (d2 | 0)
        + ' activeTrack=' + (S.activeTrack | 0)
        + ' padMode=' + (S.trackPadMode[S.activeTrack] | 0)
        + ' pad0=' + (S.padNoteMap[0] | 0)
        + ' heldStep=' + (S.heldStep | 0)
        + ' shift=' + (S.shiftHeld ? 1 : 0)
        + ' copy=' + (S.copyHeld ? 1 : 0)
        + ' mute=' + (S.muteHeld ? 1 : 0)
        + ' cap=' + (S.captureHeld ? 1 : 0)
        + ' sv=' + (S.sessionView ? 1 : 0));
    onPadPressTrackViewImpl(S, createInputDispatchWorkflowDeps(), status, d1, d2);
}

function _onPadPress(status, d1, d2) {
    OVERTURE_DEBUG_LOG && dlog('DEBUG', 'pad press status=' + (status | 0)
        + ' d1=' + (d1 | 0)
        + ' d2=' + (d2 | 0)
        + ' activeTrack=' + (S.activeTrack | 0)
        + ' soundPage=' + (S.schwungSoundPage ? 1 : 0)
        + ' sv=' + (S.sessionView ? 1 : 0)
        + ' lastMuted=' + (S.lastPushedMuted ? 1 : 0));
    onPadPressImpl(S, createInputDispatchWorkflowDeps(), status, d1, d2);
}

function _jumpToMenuLabel(label) {
    return jumpToMenuLabelImpl(S, createGlobalMenuWorkflowDeps(), label);
}

function _doShiftStepCommon(idx) {
    return doShiftStepCommonImpl(S, createGlobalMenuWorkflowDeps(), idx);
}

function createSessionViewWorkflowDeps() {
    return {
        clearClip,
        clearRow,
        clipIsEmpty: _clipIsEmpty,
        copyClip,
        copyDrumClip,
        copyRow,
        cutClip,
        cutDrumClip,
        cutRow,
        doShiftStepCommon: _doShiftStepCommon,
        forceRedraw,
        handoffRecordingToTrack,
        hardResetClip,
        invalidateLEDCache,
        numTracks: NUM_TRACKS,
        padModeDrum: PAD_MODE_DRUM,
        refreshPerClipBankParams,
        setParam: optionalHostModuleSetParam(),
        setTrackMute,
        setTrackSolo,
        sendPerfMods,
        showActionPopup,
        trackClipHasContent,
        switchActiveTrack: _switchActiveTrack
    };
}

function createSideButtonWorkflowDeps() {
    return {
        forceRedraw,
        handleSessionViewSideRowPress: function (rowIdx) {
            return handleSessionViewSideRowPress(S, createSessionViewWorkflowDeps(), rowIdx);
        },
        selectTrackGesture
    };
}

function createTransportCcWorkflowDeps() {
    return {
        ...createTransportCcHardwareAdapters(),
        banks: BANKS,
        clearAllMuteSolo,
        closeConvertConfirm,
        closeTapTempo,
        disarmRecord,
        exitSchwungCoRun,
        focusedClipIsEmpty: _focusedClipIsEmpty,
        forceRedraw,
        getParam: optionalHostModuleGetParam(),
        numTracks: NUM_TRACKS,
        padModeDrum: PAD_MODE_DRUM,
        red: Red,
        resolveInheritPicker,
        saveState,
        setButtonLED,
        setParam: optionalHostModuleSetParam(),
        setTrackMute,
        setTrackSolo,
        showActionPopup,
        unlatchAllTracks: function () {
            return unlatchAllTracks(S, NUM_TRACKS);
        }
    };
}

function createButtonCcWorkflowDeps() {
    return {
        ...createButtonCcHardwareAdapters(),
        clearAllLEDs,
        closeConvertConfirm,
        closeSchwungSoundBrowser,
        closeSchwungSoundPage,
        closeSnapshotPicker,
        closeTapTempo,
        computePadNoteMap,
        editSoundForTrack,
        effectiveClip,
        exitModule: optionalHostExitModule(),
        exitSchwungCoRun,
        forceRedraw,
        handleDeleteLoopDrumRepeatStop: function (track) {
            return handleDeleteLoopDrumRepeatStop(S, createDrumRepeatWorkflowDeps(), track);
        },
        handleDrumRepeatLoopTapRelease: function () {
            return handleDrumRepeatLoopTapRelease(S, LOOP_TAP_TICKS);
        },
        invalidateLEDCache,
        latchHeldDrumRepeatsOnLoopPress: function (track) {
            return latchHeldDrumRepeatsOnLoopPress(S, { host_module_set_param: optionalHostModuleSetParam() }, track);
        },
        loopTapTicks: LOOP_TAP_TICKS,
        noteSessionHoldTicks: NOTE_SESSION_HOLD_TICKS,
        openClearAutoMenu,
        openGlobalMenu,
        removeFlagsWrap,
        prepareDrumRepeatLoopPress: function (track, isDrumTrack, liveActiveNoteCount) {
            return prepareDrumRepeatLoopPress(S, track, isDrumTrack, liveActiveNoteCount);
        },
        resolveLoopGesture: function (fireFallback) {
            return resolveLoopGesture(S, createLoopGestureWorkflowDeps(), fireFallback);
        },
        sendPerfMods,
        setParam: optionalHostModuleSetParam(),
        showActionPopup,
        switchViewCleanup: _switchViewCleanup,
        padModeDrum: PAD_MODE_DRUM
    };
}

function createNavigationCcWorkflowDeps() {
    return {
        ...createNavigationCcHardwareAdapters(),
        computePadNoteMap,
        effectiveClip,
        forceRedraw,
        numClips: NUM_CLIPS,
        padModeDrum: PAD_MODE_DRUM,
        queueLiveNoteOff: function (track, pitch) {
            return queueLiveNoteOff(pendingLiveNotes, track, pitch);
        },
        setDrumLanePage,
        setParam: optionalHostModuleSetParam(),
        syncDrumLanesMeta,
        syncDrumLaneSteps
    };
}

function createLoopGestureWorkflowDeps() {
    return {
        effectiveClip,
        forceRedraw,
        padModeDrum: PAD_MODE_DRUM,
        setParam: optionalHostModuleSetParam()
    };
}

function createTrackViewStepWorkflowDeps() {
    return {
        applyBankParam,
        applyTrackConfig,
        clearStep,
        copyStep,
        computePadNoteMap,
        cycleDrumRepeatPerformMode: function (track) {
            return cycleDrumRepeatPerformMode(S, createDrumRepeatWorkflowDeps(), track);
        },
        doDoubleFill,
        doLaneDoubleFill,
        doShiftStepCommon: _doShiftStepCommon,
        effectiveClip,
        effectiveVelocity,
        clipHasContent,
        forceRedraw,
        getParam: optionalHostModuleGetParam(),
        invalidateLEDCache,
        noNoteFlashTicks: NO_NOTE_FLASH_TICKS,
        padModeDrum: PAD_MODE_DRUM,
        refreshSeqNotesIfCurrent,
        scaleNudgeNote,
        setParam: optionalHostModuleSetParam(),
        ccKnobDelta,
        stepHoldTicks: STEP_HOLD_TICKS,
        stepEntryVelocity,
        stepIterList: STEP_ITER_LIST,
        showActionPopup
    };
}

function createKnobCcWorkflowDeps() {
    return {
        applyBankParam,
        applyTrackConfig,
        adjustSchwungSoundVisibleParam,
        banks: BANKS,
        ccKnobDelta,
        decodeDelta,
        computePadNoteMap,
        editDrumRepeatGrooveStep: function (track, lane, step, dir, editNudge) {
            return editDrumRepeatGrooveStep(S, { host_module_set_param: optionalHostModuleSetParam() }, track, lane, step, dir, editNudge);
        },
        effectiveClip,
        forceRedraw,
        getParam: optionalHostModuleGetParam(),
        hasShadowSetParam: hasShadowSetParam(),
        invalidateLEDCache,
        padModeDrum: PAD_MODE_DRUM,
        refreshPerClipBankParams,
        setParam: optionalHostModuleSetParam(),
        showActionPopup,
        stepEntryVelocity,
        stretchBlockedTicks: STRETCH_BLOCKED_TICKS,
        tpsValues: TPS_VALUES
    };
}

function createJogCcWorkflowDeps() {
    return {
        ...createJogCcHardwareAdapters(),
        padModeDrum: PAD_MODE_DRUM,
        numTracks: NUM_TRACKS,
        numClips: NUM_CLIPS,
        banks: BANKS,
        decodeDelta,
        setParam: optionalHostModuleSetParam(),
        exitModule: optionalHostExitModule(),
        forceRedraw,
        computePadNoteMap,
        showActionPopup,
        invalidateLEDCache,
        effectiveClip,
        resolveInheritPicker,
        snapshotPickerClick,
        snapshotPickerRotate,
        clearAutoMenuClick,
        clearAutoMenuRotate,
        closeTapTempo,
        closeSchwungSoundPage,
        removeFlagsWrap,
        clearAllLEDs,
        doClearSession,
        openSaveSnapshot,
        closeConvertConfirm,
        confirmExportStart,
        xposeCommit,
        xposeCancelPreview,
        anyMelodicClipHasContent,
        handleMenuInput,
        ensureGlobalMenuFresh,
        resetFxBanks,
        resetSingleFxBank,
        resetTarp,
        resetDrumRepeatGrooveForLane: function (track, lane) {
            return resetDrumRepeatGrooveForLane(S, { showActionPopup }, track, lane);
        },
        bankHasAltParams,
        extNoteOffAll,
        handoffRecordingToTrack,
        switchActiveTrack: _switchActiveTrack,
        resyncDrumTrack,
        refreshPerClipBankParams,
        readBankParams,
        writeSidecar,
        handleLoopJog: function (delta) {
            return handleLoopJog(S, createLoopGestureWorkflowDeps(), delta);
        },
        rotateSchwungSoundPage,
        toggleSchwungSoundParamDetail,
        openSchwungSoundBrowser,
        openSchwungSoundPresetBrowser,
        beginSaveSchwungSoundPreset: function () {
            return beginSaveSchwungSoundPreset(textKeyboard());
        },
        applySchwungSoundBrowserSelection: function () {
            OVERTURE_DEBUG_LOG && dlog('DEBUG', 'sound-edit wrapper apply-browser before padmap copy=' + (S.copyHeld ? 1 : 0)
                + ' cap=' + (S.captureHeld ? 1 : 0)
                + ' sv=' + (S.sessionView ? 1 : 0)
                + ' lastMuted=' + (S.lastPushedMuted ? 1 : 0));
            const handled = applySchwungSoundBrowserSelection(textKeyboard());
            computePadNoteMap();
            OVERTURE_DEBUG_LOG && dlog('DEBUG', 'sound-edit wrapper apply-browser after padmap handled=' + (handled ? 1 : 0)
                + ' copy=' + (S.copyHeld ? 1 : 0)
                + ' cap=' + (S.captureHeld ? 1 : 0)
                + ' sv=' + (S.sessionView ? 1 : 0)
                + ' lastMuted=' + (S.lastPushedMuted ? 1 : 0));
            return handled;
        },
        enterSchwungCoRun
    };
}

function createInputDispatchWorkflowDeps() {
    return {
        ...createInputDispatchHardwareAdapters(),
        createButtonCcWorkflowDeps,
        createJogCcWorkflowDeps,
        createKnobCcWorkflowDeps,
        createLoopGestureWorkflowDeps,
        createNavigationCcWorkflowDeps,
        createPadWorkflowDeps,
        createSessionViewWorkflowDeps,
        createSideButtonWorkflowDeps,
        createTrackViewStepWorkflowDeps,
        createTransportCcWorkflowDeps,
        exitMoveNativeCoRun,
        exitSchwungCoRun,
        forceRedraw,
        handleLoopStepPress: function (idx) {
            return handleLoopStepPress(S, createLoopGestureWorkflowDeps(), idx);
        },
        ledOff: LED_OFF,
        onPadPressTrackView: _onPadPressTrackView,
        selectClipOnTrack,
        selectSchwungSoundComponent,
        sendPerfMods,
        setLED,
        setParam: optionalHostModuleSetParam(),
    };
}

function _onStepButtons(d1, d2) {
    onStepButtonsImpl(S, createInputDispatchWorkflowDeps(), d1, d2);
}

function _onPadRelease(status, d1, d2) {
    onPadReleaseImpl(S, createInputDispatchWorkflowDeps(), status, d1, d2);
}

function syncHeldModifierReleaseBeforeTextEntry(data) {
    const status = data[0] | 0;
    const d1 = (data[1] ?? 0) | 0;
    const d2 = (data[2] ?? 0) | 0;
    if (status !== 0xB0 || d2 !== 0) return false;

    let changed = false;
    if (d1 === MoveCapture && S.captureHeld) {
        S.captureHeld = false;
        changed = true;
    } else if (d1 === MoveCopy && S.copyHeld) {
        S.copyHeld = false;
        S.copySrc = null;
        invalidateLEDCache();
        changed = true;
    } else if (d1 === MoveMute && S.muteHeld) {
        S.muteHeld = false;
        if (S.sessionView) invalidateLEDCache();
        changed = true;
    } else if (d1 === MoveLoop && S.loopHeld) {
        S.loopHeld = false;
        S.loopJogActive = false;
        changed = true;
    } else if (d1 === MoveShift && S.shiftHeld) {
        S.shiftHeld = false;
        S.shiftTrackLEDActive = false;
        changed = true;
    } else if (d1 === MoveDelete && S.deleteHeld) {
        S.deleteHeld = false;
        S.deleteTapArmed = false;
        changed = true;
    }

    if (changed) {
        computePadNoteMap();
        S.screenDirty = true;
    }
    return changed;
}

globalThis.onMidiMessageInternal = function (data) { runEntrypoint('onMidiInternal', function () { _onMidiInternalImpl(data); }); };
function _onMidiInternalImpl(data) {
    if (textKeyboard().isActive()) {
        syncHeldModifierReleaseBeforeTextEntry(data);
        textKeyboard().handleMidi(data);
        if (!textKeyboard().isActive()) {
            invalidateLEDCache();
            computePadNoteMap();
        }
        S.screenDirty = true;
        return;
    }
    /* Auto-route lockout: the gesture macro is injecting front-panel CCs into
     * Move; swallow physical front-panel input so the user can't fight the macro
     * (and so injected CCs that echo back don't re-enter Overture's handlers). */
    if (S.autoRouteActive) return;
    handleUiMidiInternalMessage(S, createMidiInternalWorkflowDeps(), data);
}

function createMidiInternalWorkflowDeps() {
    return {
        ...createMidiInternalHardwareAdapters(),
        closeClearAutoMenu,
        isNoiseMessage,
        onCc: _onCCMsg,
        onKnobTouch: _onKnobTouch,
        onPadAftertouch: _onPadAftertouch,
        onPadPress: _onPadPress,
        onPadRelease: _onPadRelease,
        onStepButtons: _onStepButtons
    };
}

function _onKnobTouch(status, d1, d2) {
    handleUiKnobTouch(S, createKnobTouchWorkflowDeps(), status, d1, d2);
}

function createKnobTouchWorkflowDeps() {
    return {
        applyTrackConfig,
        banks: BANKS,
        effectiveClip,
        forceRedraw,
        invalidateLEDCache,
        ledOff: LED_OFF,
        moveMainTouch: MoveMainTouch,
        padModeDrum: PAD_MODE_DRUM,
        setButtonLED,
        setParam: optionalHostModuleSetParam(),
        showActionPopup,
        touchSchwungSoundVisibleParam,
        trackColors: TRACK_COLORS
    };
}

/* Pad pressure (poly aftertouch). On drum tracks: routes continuous pressure to
 * the held drum-repeat pad's velocity (Rpt1) or the held repeat lanes (Rpt2). On
 * melodic tracks: forwards pad pressure as aftertouch to the track output per the
 * track's AftTch mode (Off/Poly/Channel). Called from the top of
 * _onMidiInternalImpl, before isNoiseMessage would drop the 0xA0. */
function _onPadAftertouch(d1, d2) {
    return onPadAftertouchImpl(S, createPadAftertouchWorkflowDeps(), d1, d2);
}

function createPadAftertouchWorkflowDeps() {
    return {
        ...createPadHardwareAdapters(),
        PAD_MODE_DRUM,
        padPitch,
        drumPadToLane,
        drumRepeatDeps: createDrumRepeatWorkflowDeps(),
        handleDrumRepeatPadAftertouch,
        handleDrumRepeat2LaneAftertouch,
        setParam: optionalHostModuleSetParam()
    };
}

globalThis.onMidiMessageExternal = function (data) { runEntrypoint('onMidiExternal', function () { _onMidiExternalImpl(data); }); };
function _onMidiExternalImpl(data) {
    return onMidiExternalImpl(S, createMidiExternalWorkflowDeps(), data);
};
