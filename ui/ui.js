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
    MoveNoteSession, MoveUndo, MoveLoop, MoveCopy, MoveMainTouch, MoveRec,
    MoveCapture, MoveSample, MoveMainButton, MoveMainKnob,
    LED_OFF, LED_STEP_ACTIVE, LED_STEP_CURSOR, SCENE_BTN_FLASH_TICKS,
    LEDS_PER_FRAME, NUM_TRACKS, NUM_CLIPS, DRUM_LANES, DRUM_BASE_NOTE,
    FLAG_JUMP_TO_OVERTAKE, FLAG_JUMP_TO_TOOLS, SEQ8_NAV_FLAGS, NUM_STEPS,
    TRACK_COLORS, TRACK_DIM_COLORS, SCENE_LETTERS, TRACK_PAD_BASE, TOP_PAD_BASE,
    TPS_VALUES, NOTE_KEYS, SCALE_NAMES, SCALE_DISPLAY, DELAY_LABELS,
    fmtSign, fmtStretch, fmtLen, fmtLgto, fmtRes, fmtPct, fmtNote, fmtPages,
    fmtDly, fmtBool, fmtRoute, fmtPlain, fmtNA, fmtGateMod,
    fmtArpStyle, fmtArpRate, fmtArpSteps, fmtArpOct, fmtVelOverride, fmtPlayDir, fmtRevStyle,
    MCUFONT, pixelPrint, pixelPrintC,
    BANKS, ACTION_POPUP_TICKS, PAD_MODE_DRUM, PAD_MODE_MELODIC_SCALE,
    POLL_INTERVAL, TAP_TEMPO_FLASH_TICKS, TAP_TEMPO_RESET_MS,
    PARAM_LED_BANKS, STATE_VERSION,
    CC_GRADIENT_BASE, CC_GRADIENT_LEVELS, CC_GRADIENT_SCALARS
} from './ui_constants.mjs';

import { S } from './ui_state.mjs';
import { saveState, writeSidecar, doClearSession, showActionPopup, uuidToStatePath, uuidToUiStatePath, readActiveSet, loadNameIndex, saveNameIndex, copyStateFiles, findInheritCandidates,
    SNAPSHOT_CAP, snapshotLabel, loadSnapshotManifest, commitSnapshot, applySnapshotToLive, dropSnapshots } from './ui_persistence.mjs';
import { drawGlobalMenu } from './ui_dialogs.mjs';
import { trackClipHasContent, sceneAllQueued, updateSceneMapLEDs } from './ui_scene.mjs';
import { effectiveClip, updateStepLEDs, updateSessionLEDs, updateTrackLEDs, flashAtRate, drawPositionBar, invalidateLEDCache, paintCoRunSideButtons } from './ui_leds.mjs';
import { renderSplashScreen } from './ui_splash.mjs';
import { requestExport, confirmExportStart, pollPendingExport } from './ui_export.mjs';
import {
    canEditSoundRoute,
    schSlotForTrack,
    routeCheckExpectedLabel,
    routeCheckNeedsWarning
} from './ui_routes.mjs';
import {
    advancePendingEditSoundEntry,
    refreshSchwungCoRunSlotMask,
    requestEditSoundForTrack
} from './ui_sound_edit.mjs';
import {
    PARAM_PEEK_DETAIL_TICKS
} from './ui_motion.mjs';
import {
    renderTrackBankOverview
} from './ui_bank_render.mjs';
import {
    drawAltArrow as renderDrawAltArrow,
    drawBankHeaderRight as renderDrawBankHeaderRight,
    drawBankHeading as renderDrawBankHeading,
    drawBankHeadingInverted as renderDrawBankHeadingInverted,
    drawBankStrip as renderDrawBankStrip
} from './ui_bank_chrome_render.mjs';
import {
    renderSessionIdleView,
    renderDrumTrackIdleView,
    renderMelodicTrackIdleView,
    renderMotionIdleView
} from './ui_idle_render.mjs';
import {
    renderSessionOverview
} from './ui_session_overview_render.mjs';
import {
    handleSessionViewClipPadPress,
    handleSessionViewSideRowPress,
    handleSessionViewStepPress,
    handleSessionViewStepRelease
} from './ui_session_view_workflow.mjs';
import {
    renderPerfModeOled
} from './ui_perf_render.mjs';
import {
    renderSessionActionPopup,
    renderTrackActionPopup
} from './ui_popup_render.mjs';
import {
    renderCompressLimitNotice,
    renderMergePlacementPrompt,
    renderNoNoteFlashNotice,
    renderSceneBakePickerPrompt,
    renderShiftStepHelp
} from './ui_prompt_render.mjs';
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
} from './ui_modal_render.mjs';
import {
    renderParamPeek
} from './ui_param_peek_render.mjs';
import {
    renderLoopView
} from './ui_loop_render.mjs';
import {
    handleLoopJog,
    handleLoopStepPress,
    handleLoopStepRelease,
    resolveLoopGesture
} from './ui_loop_gesture_workflow.mjs';
import {
    renderCcStepEditView
} from './ui_cc_step_edit_render.mjs';
import {
    handleUiCcMessage
} from './ui_cc_message_workflow.mjs';
import {
    handleUiMidiInternalMessage
} from './ui_midi_internal_workflow.mjs';
import {
    handleUiSideButton
} from './ui_side_button_workflow.mjs';
import {
    handleUiBackButton,
    handleUiUndoButton,
    handleUiMuteButton,
    handleUiPlayButton,
    handleUiRecordButton,
    handleUiSampleButton
} from './ui_transport_cc_workflow.mjs';
import {
    handleUiPageNavButton,
    handleUiSceneNavButton
} from './ui_navigation_cc_workflow.mjs';
import {
    handleUiCaptureButton,
    handleUiCopyButton,
    handleUiDeleteButton,
    handleUiLoopPerfModeButton,
    handleUiLoopTrackViewButton,
    handleUiMenuCoRunExitButton,
    handleUiMuteModifierButton,
    handleUiNoteSessionButton,
    handleUiShiftButton
} from './ui_button_cc_workflow.mjs';
import {
    handleUiKnobAltDelayClockFb,
    handleUiKnobAltRandomMode,
    handleUiKnobCcParam,
    handleUiKnobDrumAllLanes,
    handleUiKnobDrumClip,
    handleUiKnobDrumNoteFX,
    handleUiKnobDrumRepeatGroove,
    handleUiKnobGeneric,
    handleUiKnobMelodicInQ,
    handleUiKnobOverlaySwallow,
    handleUiKnobStepInterval
} from './ui_knob_cc_workflow.mjs';
import {
    handleUiJogAltToggle,
    handleUiJogBakeConfirm,
    handleUiJogBakeScene,
    handleUiJogClearAutoMenu,
    handleUiJogConfirmLgto,
    handleUiJogDeleteReset,
    handleUiJogGlobalMenu,
    handleUiJogInheritPicker,
    handleUiJogMovement,
    handleUiJogRecordBlocked,
    handleUiJogShiftDeleteReset,
    handleUiJogSnapshotPicker,
    handleUiJogStateWipe,
    handleUiJogStepIntervalExit,
    handleUiJogStepIntervalToggle,
    handleUiJogTapTempo
} from './ui_jog_cc_workflow.mjs';
import {
    handleUiPadArpStepIntervalSeq,
    handleUiPadArpStepIntervalTarp,
    handleUiPadCoRunDrumInject,
    handleUiPadPerfMode,
    handleUiPadReleaseCoRunDrum,
    handleUiPadReleaseLoopStep,
    handleUiPadReleasePadNote,
    handleUiPadReleasePerfMode,
    handleUiPadReleaseSeqArpEditor,
    handleUiPadReleaseStepButton,
    handleUiPadReleaseTapTempo,
    handleUiPadReleaseTarpArpEditor,
    handleUiPadTapTempo,
    handleUiPadTrackViewCaptureDrumLane,
    handleUiPadTrackViewDrumLaneClear,
    handleUiPadTrackViewDrumLaneReset,
    handleUiPadTrackViewDrumOrMelodic,
    handleUiPadTrackViewDrumRepeat
} from './ui_pad_workflow.mjs';
import {
    pollAutomationAtIndicator,
    pollCoRunReconcile,
    pollCountInEnd,
    pollDeferredBankRefresh,
    pollDeferredSave,
    pollMergeStateMachine,
    pollPlayheadPads,
    pollRecordPendingPage,
    pollSeqActiveNotes,
    pollSeqFollowPage,
    pollSnapshotClipStates,
    pollSnapshotTracks,
    pollStepLedRefresh,
    pollTransportTransitions
} from './ui_polldsp_workflow.mjs';
import {
    renderTrackStepEditView
} from './ui_step_edit_render.mjs';
import {
    renderStepIntervalOverlay
} from './ui_step_interval_render.mjs';
import {
    renderMetroIndicator
} from './ui_track_chrome_render.mjs';
import {
    handleTrackViewCopyStepPress,
    handleTrackViewDeleteStepPress,
    handleTrackViewMuteStepPress,
    handleTrackViewShiftStepPress,
    handleTrackViewDrumStepPress,
    handleTrackViewMelodicStepPress,
    handleTrackViewStepRelease,
    handleTrackViewStepHoldThreshold,
    handleTrackViewChordFirstStepTick,
    handleTrackViewMelodicStepNoteAssignment,
    handleTrackViewStepEditKnob
} from './ui_track_view_step_workflow.mjs';
import {
    SCALE_INTERVALS,
    applyPadNoteMap,
    createLiveNoteQueues,
    drumPadToLane as padSurfaceDrumPadToLane,
    drumVelZoneToVelocity,
    handleCaptureDrumLanePress,
    handleDrumLanePadPress,
    handleDrumVelocityPadPress,
    queueLiveNoteOff,
    queueLiveNoteOn,
    resolveDrumPadTarget
} from './ui_pad_surface.mjs';
import {
    handleDeleteDrumLaneClear,
    handleDrumLaneFactoryReset,
    handleDrumLaneCopyPaste,
    handleDrumLaneMuteSolo
} from './ui_drum_lane_workflows.mjs';
import {
    handleDrumRepeat2LaneAftertouch,
    handleDrumRepeatPadAftertouch,
    resetDrumRepeatGrooveForLane,
    copyDrumRepeatGrooveMirrors,
    moveDrumRepeatGrooveMirrors,
    editDrumRepeatGrooveStep,
    handleDrumRepeatPadPress,
    handleDrumRepeatPadRelease,
    cycleDrumRepeatPerformMode,
    prepareDrumRepeatLoopPress,
    latchHeldDrumRepeatsOnLoopPress,
    handleDrumRepeatLoopTapRelease,
    handleDeleteLoopDrumRepeatStop
} from './ui_drum_repeat_workflows.mjs';
import {
    unlatchAllTracks
} from './ui_latch_workflows.mjs';
import {
    readDrumRepeatRatesFromDsp,
    readTrackArpStepConfigFromDsp,
    readTrackConfigFromDsp,
    refreshDrumLaneBankParamsFromDsp,
    refreshPerClipBankParamsFromDsp
} from './ui_clip_track_sync.mjs';
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
    buildGlobalMenuItemsImpl
} from './ui_global_menu.mjs';
import {
    applyBankParamImpl,
    applyTrackConfigImpl,
    readBankParamsImpl,
    resetFxBanksImpl,
    resetPerClipBankParamsToDefaultImpl,
    resetSingleFxBankImpl
} from './ui_bank_params.mjs';
import {
    clearClipImpl,
    clearRowImpl,
    copyClipImpl,
    copyRowImpl,
    copyStepImpl,
    cutClipImpl,
    cutRowImpl,
    doDoubleFillImpl,
    hardResetClipImpl,
    selectClipOnTrackImpl
} from './ui_clip_edit_ops.mjs';
import {
    syncDrumClipContentImpl,
    syncDrumLaneStepsImpl,
    syncDrumLanesMetaImpl
} from './ui_drum_clip_sync.mjs';
import {
    refreshSeqNotesIfCurrentImpl,
    restoreUiSidecarImpl,
    syncClipsFromDspImpl,
    syncClipsTargetedImpl,
    syncMuteSoloFromDspImpl
} from './ui_clip_state_sync.mjs';

/* ------------------------------------------------------------------ */
/* Parameter bank definitions                                           */
/* ------------------------------------------------------------------ */

function bankHeader(bankIdx) {
    return '[ ' + BANKS[bankIdx].name + ' ]';
}

function drawBankStrip(rightX, hdrBgWhite) {
    return renderDrawBankStrip(createBankChromeRenderDeps(), rightX, hdrBgWhite);
}

function drawBankHeaderRight(showTrack, hdrBgWhite) {
    renderDrawBankHeaderRight(createBankChromeRenderDeps(), showTrack, hdrBgWhite);
}

function drawBankHeading(name, showTrack) {
    renderDrawBankHeading(createBankChromeRenderDeps(), name, showTrack);
}

function drawBankHeadingInverted(name, showTrack) {
    renderDrawBankHeadingInverted(createBankChromeRenderDeps(), name, showTrack);
}

function drawAltArrow(x, hdrBgWhite, on) {
    renderDrawAltArrow(createBankChromeRenderDeps(), x, hdrBgWhite, on);
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
    renderMetroIndicator(createMetroIndicatorRenderDeps());
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
        getParam: typeof host_module_get_param === 'function' ? host_module_get_param : null,
        setParam: typeof host_module_set_param === 'function' ? host_module_set_param : null
    };
}

function buildGlobalMenuItems() {
    return buildGlobalMenuItemsImpl(S, createGlobalMenuDeps());
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
/* Pad → modifier bit index. R1=bits 0-7 (pitch), R2=bits 8-15 (vel/gate), R3=bits 16-23 (wild). */
const PERF_MOD_PAD_MAP = Object.freeze({
    76: 0,  /* Oct↑    */ 77: 1,  /* Oct↓    */ 78: 2,  /* Sc↑     */ 79: 3,  /* Sc↓     */
    80: 4,  /* 5th     */ 81: 5,  /* Triton  */ 82: 6,  /* Drift   */ 83: 7,  /* Storm   */
    84: 8,  /* Soft    */ 85: 9,  /* Hard    */ 86: 10, /* Cresc   */ 87: 11, /* Pulse   */
    88: 12, /* Sdchn   */ 89: 13, /* Stac    */ 90: 14, /* Lgto    */ 91: 15, /* RmpG    */
    92: 16, /* ½time   */ 93: 17, /* 3Skip   */ 94: 18, /* Phnm    */ 95: 19, /* Sprs    */
    96: 20, /* Gltch   */ 97: 21, /* Stggr   */ 98: 22, /* Shfl    */ 99: 23, /* Back    */
});
const PERF_MOD_FULL_NAMES = [
    'Octave Up','Octave Down','Scale Up','Scale Down','Fifth','Tritone','Drift','Storm',
    'Decrescendo','Swell','Crescendo','Pulse','Sidechain','Staccato','Legato','Ramp Gate',
    'Half Time','3 Skip','Phantom','Sparse','Glitch','Stagger','Shuffle','Backwards',
];

/* Preset S.snapshots: 16 slots (step buttons 1-16).
 * S.perfRecalledSlot: which slot is active (-1 = none); preset bits are
 * copied into S.perfModsToggled on recall so mod pads can toggle them off.
 * Factory presets populate slots 0-7 (steps 1-8) at init. */
const PERF_MOD_POPUP_TICKS = 80; /* ~500ms at ~160 ticks/s */

/* View lock: double-tap Loop keeps Perf Mode alive after Loop is released.
 * Single tap while locked → unlock + stop loop. */
const LOOP_TAP_TICKS  = 40;
const LOOP_DBLTAP_GAP = 80;

/* Live pad note input — isomorphic 4ths diatonic layout. */
/* Step-edit pitch nudge: move note up/down to next in-scale pitch.
 * When scale-aware is off, shifts by exactly 1 semitone per dir. */
function scaleNudgeNote(note, dir, key, scale) {
    if (!S.scaleAware) return Math.max(0, Math.min(127, note + dir));
    const ivls = SCALE_INTERVALS[scale];
    let candidate = note + dir;
    while (candidate >= 0 && candidate <= 127) {
        const pc = ((candidate - key) % 12 + 12) % 12;
        if (ivls.indexOf(pc) >= 0) return candidate;
        candidate += dir;
    }
    return Math.max(0, Math.min(127, note + dir));
}


/* Per-pad pitch sent at note-on — ensures matching note-off even if map changes mid-hold. */
const padPitch = new Array(32).fill(-1);
const padPressTick = new Array(32).fill(-1);  /* tick when each pad was pressed, for drum tap-vs-hold detection */
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
const _drumRecNoteOns  = [];  /* { track, laneNote, vel } — queued drum recording note-ons */
const _drumRecNoteOffs = [];  /* { track, laneNote } — queued drum recording note-offs */


/* ------------------------------------------------------------------ */
/* Utility                                                              */
/* ------------------------------------------------------------------ */

function midiNoteName(n) {
    const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    return names[n % 12] + (Math.floor(n / 12) - 1);
}

function effectiveMute(t) {
    const anySolo = S.trackSoloed.some(function(s) { return s; });
    return S.trackMuted[t] || (anySolo && !S.trackSoloed[t]);
}

function setTrackMute(t, on) {
    S.trackMuted[t] = on;
    if (on && S.trackSoloed[t]) {
        S.trackSoloed[t] = false;
        if (typeof host_module_set_param === 'function')
            host_module_set_param('t' + t + '_solo', '0');
    }
    if (typeof host_module_set_param === 'function')
        host_module_set_param('t' + t + '_mute', on ? '1' : '0');
    S.screenDirty = true;
}

function setTrackSolo(t, on) {
    S.trackSoloed[t] = on;
    if (on && S.trackMuted[t]) {
        S.trackMuted[t] = false;
        if (typeof host_module_set_param === 'function')
            host_module_set_param('t' + t + '_mute', '0');
    }
    if (typeof host_module_set_param === 'function')
        host_module_set_param('t' + t + '_solo', on ? '1' : '0');
    S.screenDirty = true;
}

function clearAllMuteSolo() {
    for (let _t = 0; _t < NUM_TRACKS; _t++) {
        S.trackMuted[_t]  = false;
        S.trackSoloed[_t] = false;
    }
    if (typeof host_module_set_param === 'function')
        host_module_set_param('mute_all_clear', '1');
    S.screenDirty = true;
}

/* Immediately refresh S.seqActiveNotes for the given step if it is the current
 * sequencer position on the active track — call after any step state change. */
function refreshSeqNotesIfCurrent(t, ac, absIdx) {
    return refreshSeqNotesIfCurrentImpl(S, createClipStateSyncDeps(), t, ac, absIdx);
}

/* Clear all notes from a step and deactivate it (atomic DSP write). */
function clearStep(t, ac, absIdx) {
    if (typeof host_module_set_param !== 'function') return;
    S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
    S.pendingDefaultSetParams.push({ key: 't' + t + '_c' + ac + '_step_' + absIdx + '_clear', val: '1' });
    S.clipSteps[t][ac][absIdx] = 0;
    if (S.clipNonEmpty[t][ac]) S.clipNonEmpty[t][ac] = clipHasContent(t, ac);
    refreshSeqNotesIfCurrent(t, ac, absIdx);
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
        setParam: typeof host_module_set_param === 'function' ? host_module_set_param : null,
        resetPerClipBankParamsToDefault,
        refreshPerClipBankParams,
        forceRedraw,
        effectiveClip
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
    if (srcLane === dstLane) return;
    if (typeof host_module_set_param !== 'function') return;
    S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
    S.pendingDefaultSetParams.push({ key: 't' + t + '_l' + srcLane + '_copy_to', val: String(dstLane) });
    const steps = S.drumLaneSteps[t];
    for (let s = 0; s < 256; s++) steps[dstLane][s] = steps[srcLane][s];
    S.drumLaneHasNotes[t][dstLane] = S.drumLaneHasNotes[t][srcLane];
    if (S.drumLaneHasNotes[t][srcLane]) S.drumClipNonEmpty[t][S.trackActiveClip[t]] = true;
    copyDrumRepeatGrooveMirrors(S, t, srcLane, dstLane);
    S.pendingDrumLaneResync = 2; S.pendingDrumLaneResyncTrack = t; S.pendingDrumLaneResyncLane = dstLane;
}

/* Cut active clip's lane srcLane into dstLane (copy then clear src). */
function cutDrumLane(t, srcLane, dstLane) {
    if (srcLane === dstLane) return;
    if (typeof host_module_set_param !== 'function') return;
    S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
    S.pendingDefaultSetParams.push({ key: 't' + t + '_l' + srcLane + '_cut_to', val: String(dstLane) });
    const steps = S.drumLaneSteps[t];
    for (let s = 0; s < 256; s++) { steps[dstLane][s] = steps[srcLane][s]; steps[srcLane][s] = '0'; }
    S.drumLaneHasNotes[t][dstLane] = S.drumLaneHasNotes[t][srcLane];
    S.drumLaneHasNotes[t][srcLane] = false;
    let anyHits = false;
    for (let l = 0; l < DRUM_LANES; l++) if (S.drumLaneHasNotes[t][l]) { anyHits = true; break; }
    S.drumClipNonEmpty[t][S.trackActiveClip[t]] = anyHits;
    moveDrumRepeatGrooveMirrors(S, t, srcLane, dstLane);
    S.pendingDrumLaneResync = 2; S.pendingDrumLaneResyncTrack = t; S.pendingDrumLaneResyncLane = dstLane;
}

/* Copy all 32 lanes of drum_clips[srcC] on srcT to drum_clips[dstC] on dstT; preserve dst midi_notes. */
function copyDrumClip(srcT, srcC, dstT, dstC) {
    if (srcT === dstT && srcC === dstC) return;
    if (typeof host_module_set_param !== 'function') return;
    S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
    S.pendingDefaultSetParams.push({ key: 'drum_clip_copy', val: `${srcT} ${srcC} ${dstT} ${dstC}` });
    S.drumClipNonEmpty[dstT][dstC] = S.drumClipNonEmpty[srcT][srcC];
    if (dstC === S.trackActiveClip[dstT]) { S.pendingDrumResync = 2; S.pendingDrumResyncTrack = dstT; }
}

/* Cut all 32 lanes of drum_clips[srcC] on srcT into drum_clips[dstC] on dstT; undo dst only. */
function cutDrumClip(srcT, srcC, dstT, dstC) {
    if (srcT === dstT && srcC === dstC) return;
    if (typeof host_module_set_param !== 'function') return;
    S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
    S.pendingDefaultSetParams.push({ key: 'drum_clip_cut', val: `${srcT} ${srcC} ${dstT} ${dstC}` });
    S.drumClipNonEmpty[dstT][dstC] = S.drumClipNonEmpty[srcT][srcC];
    S.drumClipNonEmpty[srcT][srcC] = false;
    if (srcC === S.trackActiveClip[srcT]) {
        for (let l = 0; l < DRUM_LANES; l++) {
            for (let s = 0; s < 256; s++) S.drumLaneSteps[srcT][l][s] = '0';
            S.drumLaneHasNotes[srcT][l] = false;
        }
        S.drumLaneLength[srcT] = 16;
        S.drumLaneTPS[srcT]    = 24;
    }
    if (dstC === S.trackActiveClip[dstT]) { S.pendingDrumResync = 2; S.pendingDrumResyncTrack = dstT; }
}

/* Clear all 8 tracks for a scene row (single atomic DSP write, JS mirror update). */
function clearRow(rowIdx) {
    return clearRowImpl(S, createClipEditOpsDeps(), rowIdx);
}

/* Disarm real-time recording: clear DSP flag (triggers deferred save), update LED. */
function disarmRecord() {
    if (!S.recordArmed) return;
    const t = S.recordArmedTrack;
    const _wasCountingIn   = S.recordCountingIn;
    S.recordArmed          = false;
    S.recordPendingPage    = false;
    S.recordCountingIn     = false;
    S.recordArmedTrack     = -1;
    S.countInStartTick    = -1;
    S.countInQuarterTicks = 0;
    _recordingNoteTrack.clear();
    S._recNoteOns.length   = 0;
    S._recNoteOffs.length  = 0;
    _drumRecNoteOns.length  = 0;
    _drumRecNoteOffs.length = 0;
    S.pendingPrerollNote          = null;
    S.pendingPrerollNotes         = [];
    S.pendingPrerollToggleQueue   = [];
    S.pendingPrerollGate          = null;
    if (t >= 0) {
        const _dat = S.trackActiveClip[t];
        S.clipAdaptiveMode[t][_dat] = false;
        if (S.trackPadMode[t] === PAD_MODE_DRUM) {
            S.pendingDrumResync      = 2;
            S.pendingDrumResyncTrack = t;
        }
    }
    S.recordScheduledStop       = false;
    S.recordScheduledStopTarget = -1;
    S.pendingScheduledDisarm    = false;
    if (typeof host_module_set_param === 'function') {
        if (_wasCountingIn) {
            /* Count-in active: only cancel is needed; sending _recording 0 would coalesce it away */
            host_module_set_param('record_count_in_cancel', '1');
        } else {
            if (t >= 0) host_module_set_param('t' + t + '_recording', '0');
        }
    }
    setButtonLED(MoveRec, LED_OFF);
}

/* Move recording to a different track while staying armed. No-op if not actively recording. */
function handoffRecordingToTrack(newTrack) {
    if (!S.recordArmed || S.recordCountingIn || newTrack === S.recordArmedTrack) return;
    const old = S.recordArmedTrack;
    _recordingNoteTrack.clear();
    S.recordArmedTrack      = newTrack;
    if (typeof host_module_set_param === 'function') {
        if (old >= 0) host_module_set_param('t' + old + '_recording', '0');
        host_module_set_param('t' + newTrack + '_recording', '1');
    }
}

function effectiveVelocity(rawVel) { return rawVel; }

/* Step-entry velocity. Single source of truth used by every step-write site.
 *
 * Drum context (allowZone=true, used at drum step-tap sites and the drum
 * vel-pad-while-step-held site): drum vel zones ALWAYS win over VelIn.
 *   active vel-pad press now (liveVel >= 0)  →  zone velocity
 *   sticky vel-zone armed                    →  sticky zone velocity
 *   VelIn engaged                            →  VelIn value
 *   otherwise                                →  100
 *
 * Melodic context (allowZone=false): VelIn wins over pad press.
 *   VelIn engaged                            →  VelIn value
 *   live pad press now (liveVel >= 0)        →  pad press velocity
 *   otherwise                                →  100
 */
function stepEntryVelocity(t, liveVel, allowZone) {
    if (allowZone) {
        if (liveVel >= 0) return liveVel;
        if (S.drumVelZoneArmed && S.drumVelZoneArmed[t])
            return drumVelZoneToVelocity(S.drumLastVelZone[t]);
        const tvo = S.trackVelOverride[t];
        if (tvo > 0) return tvo;
        return 100;
    }
    const tvo = S.trackVelOverride[t];
    if (tvo > 0) return tvo;
    if (liveVel >= 0) return liveVel;
    return 100;
}

function flushChordBatch() {}

/* DSP-side recording: buffer note events; tick() flushes as a single batched set_param so
 * chords (multiple pads hit in the same ~5ms JS tick) are not lost to coalescing. */
const _recordingNoteTrack = new Map(); /* pitch → track index, for matching note-offs */
const extHeldNotes = new Map(); /* pitch → {track, recording} — external MIDI held notes */

function recordNoteOn(pitch, velocity, rt) {
    _recordingNoteTrack.set(pitch, rt);
    S._recNoteOns.push({pitch, vel: velocity, rt});
}

function recordNoteOff(pitch) {
    const rt = _recordingNoteTrack.get(pitch);
    if (rt === undefined) return;
    _recordingNoteTrack.delete(pitch);
    S._recNoteOffs.push({pitch, rt});
}


function openTapTempo() {
    S.tapTempoOpen      = true;
    S.tapTempoTapTimes  = [];
    S.tapTempoBpm       = Math.max(40, Math.min(250, Math.round(parseFloat(host_module_get_param('bpm')) || 120)));
    S.tapTempoFlashTick = -1;
    S.tapTempoFlashPad  = -1;
    computePadNoteMap();
    invalidateLEDCache();
    S.screenDirty = true;
}

function closeTapTempo() {
    S.tapTempoOpen = false;
    if (typeof host_module_set_param === 'function')
        host_module_set_param('bpm', String(S.tapTempoBpm));
    computePadNoteMap();
    invalidateLEDCache();
    S.screenDirty = true;
}

function registerTapTempo(padNote) {
    const nowMs  = Date.now();
    const taps   = S.tapTempoTapTimes;
    const last   = taps.length > 0 ? taps[taps.length - 1] : -1;
    const intvl  = last >= 0 ? nowMs - last : -1;

    /* Inactivity reset: gap exceeds 2s */
    if (intvl > TAP_TEMPO_RESET_MS) {
        S.tapTempoTapTimes = [nowMs];
    } else if (intvl > 0 && taps.length >= 2) {
        /* Deviation reset: new interval differs from previous by >~1.8x */
        const prevIntvl = taps[taps.length - 1] - taps[taps.length - 2];
        const ratio     = intvl / prevIntvl;
        if (ratio > 1.8 || ratio < 0.55) {
            /* Tempo change: keep last tap as anchor for new session */
            S.tapTempoTapTimes = [last, nowMs];
        } else {
            taps.push(nowMs);
            /* Sliding window: cap at last 9 taps (8 intervals) */
            if (taps.length > 9) S.tapTempoTapTimes = taps.slice(-9);
        }
    } else {
        taps.push(nowMs);
    }

    if (S.tapTempoTapTimes.length >= 2) {
        const t = S.tapTempoTapTimes;
        const n = t.length;
        const avgInterval = (t[n - 1] - t[0]) / (n - 1);
        if (avgInterval > 0) {
            S.tapTempoBpm = Math.max(40, Math.min(250, Math.round(60000 / avgInterval)));
            host_module_set_param('bpm', String(S.tapTempoBpm));
        }
    }
    S.tapTempoFlashTick = S.tickCount;
    S.tapTempoFlashPad  = padNote;
    S.screenDirty = true;
}

/* True when a clip has no note/hit data. CC-only automation does not count:
 * this gates implicit focused-clip launches so clips intentionally left off
 * stay off when browsing tracks or starting transport. */
function _clipIsEmpty(t, c) {
    return (S.trackPadMode[t] === PAD_MODE_DRUM)
        ? !S.drumClipNonEmpty[t][c]
        : !S.clipNonEmpty[t][c];
}

function _focusedClipIsEmpty(t) {
    return _clipIsEmpty(t, S.trackActiveClip[t]);
}

/* Save the current S.activeBank into the outgoing track's per-track slot,
 * switch to newT, then restore the new track's stored bank into S.activeBank.
 * Existing post-switch validity checks (e.g. drum-track hidden banks → 0)
 * still apply to the loaded value. Use at every site that assigns S.activeTrack. */
function _switchActiveTrack(newT) {
    S.trackActiveBank[S.activeTrack] = S.activeBank;
    S.activeTrack = newT | 0;
    S.activeBank = S.trackActiveBank[S.activeTrack] | 0;
    if (S.activeBank === 7) S.allLanesConfirmed = false;
    /* Focused-clip-by-default: ONLY while transport is running — entering a track
     * launches its focused clip so it's live. While stopped we do NOT arm (passive
     * track-scrolling must not queue clips for the next transport start); the
     * displayed clip is instead armed at transport start (see _onCC_transport).
     * Skip if already live, in Session View, or if the focused clip has note
     * data (a clip intentionally left off must not be re-launched by scroll). */
    if (S.playing && !S.sessionView
            && !S.trackClipPlaying[S.activeTrack]
            && !S.trackWillRelaunch[S.activeTrack]
            && S.trackQueuedClip[S.activeTrack] === -1
            && _focusedClipIsEmpty(S.activeTrack)) {
        const _ac = S.trackActiveClip[S.activeTrack];
        if (typeof host_module_set_param === 'function')
            host_module_set_param('t' + S.activeTrack + '_launch_clip', String(_ac));
        S.trackQueuedClip[S.activeTrack] = _ac;
    }
}

/* Full active-track switch for a user navigation gesture (side button / bottom-pad).
 * Wraps _switchActiveTrack with the surrounding ceremony every nav site needs:
 * external note-off, recording handoff, drum-lane resync + bank fallback, padmap
 * rebake, sequencer-LED reset and redraw. newT is clamped to 0..NUM_TRACKS-1; a
 * no-op switch (same track) returns early. Mirrors the Shift+bottom-pad path
 * (the most complete of the legacy sites) so drum tracks render their lanes. */
function selectTrackGesture(newT) {
    newT = Math.min(NUM_TRACKS - 1, Math.max(0, newT | 0));
    if (newT === S.activeTrack) return;
    extNoteOffAll();
    handoffRecordingToTrack(newT);
    _switchActiveTrack(newT);
    if (S.trackPadMode[newT] === PAD_MODE_DRUM) {
        /* Fall back from banks hidden on drum tracks */
        if (S.activeBank === 2 || S.activeBank === 4) S.activeBank = 0;
        resyncDrumTrack(newT);
    } else {
        if (S.activeBank === 7) S.activeBank = 0;
        refreshPerClipBankParams(newT);
    }
    computePadNoteMap();
    S.seqActiveNotes.clear();
    S.seqLastStep = -1;
    S.seqLastClip = -1;
    forceRedraw();
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
    var _t = S.activeTrack, _ac = effectiveClip(_t), _l = S.ccActiveLane[_t];
    var _len = S.ccLaneLength[_t][_ac][_l] || S.clipLength[_t][_ac];
    if (_len * 2 > 256) {
        showActionPopup('LANE FULL');
        return;
    }
    S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
    S.ccLaneLength[_t][_ac][_l] = _len * 2;
    var _pre = 't' + _t + '_c' + _ac + '_k' + _l;
    S.pendingDefaultSetParams.push({ key: _pre + '_cc_lane_double_fill', val: '1' });
    showActionPopup('LANE LOOP', 'DOUBLED');
    forceRedraw();
}

function openGlobalMenu() {
    /* Co-run owns the OLED — exit it before opening the menu so Overture
     * can draw again. */
    if (S.schwungCoRunSlot >= 0) exitSchwungCoRun();
    if (S.moveCoRunTrack >= 0) exitMoveNativeCoRun();
    S.globalMenuItems         = buildGlobalMenuItems();
    S.globalMenuState         = createMenuState();
    S.globalMenuStack         = createMenuStack();
    S.globalMenuOpen          = true;
    S.globalMenuBuiltForTrack = S.activeTrack;
    S.lastSentMenuEditValue   = null;
    S.screenDirty             = true;
    S.jogTouched              = false;
}

/* Rebuild the global menu items list if the active track has changed since the
 * last build. The Edit Sound action is route-dependent, so a Shift+jog track
 * switch with the menu open must rebuild the list. Cursor preserved by
 * label-match when possible, otherwise clamped. */
function ensureGlobalMenuFresh() {
    if (!S.globalMenuOpen) return;
    if (S.globalMenuBuiltForTrack === S.activeTrack) return;
    let prevLabel = null;
    if (S.globalMenuItems && S.globalMenuState) {
        const _cur = S.globalMenuItems[S.globalMenuState.selectedIndex];
        if (_cur) prevLabel = _cur.label || null;
    }
    S.globalMenuItems = buildGlobalMenuItems();
    if (prevLabel && S.globalMenuState) {
        let idx = -1;
        for (let i = 0; i < S.globalMenuItems.length; i++) {
            const _it = S.globalMenuItems[i];
            if (_it && _it.label === prevLabel) { idx = i; break; }
        }
        if (idx >= 0) S.globalMenuState.selectedIndex = idx;
        else S.globalMenuState.selectedIndex = Math.min(
            S.globalMenuState.selectedIndex,
            Math.max(0, S.globalMenuItems.length - 1));
    }
    S.globalMenuBuiltForTrack = S.activeTrack;
}

function routeCheckWarnForTrack(t) {
    if (routeCheckNeedsWarning(t))
        showActionPopup('ROUTE CHECK', routeCheckExpectedLabel(t));
}



/* "REC Unavailable" two-option dialog (OK | BAKE NOW). Opens when Record
 * is pressed on a clip / lane in any non-Forward direction or Audio reverse
 * style. OK dismisses; BAKE NOW opens the standard bake confirm dialog
 * pre-targeted at the active clip / drum lane. */
function drawStateWipeConfirm() {
    renderStateWipeConfirm(createModalRenderDeps(), S.confirmStateWipeSel);
}

function drawRecordBlockedDialog() {
    renderRecordBlockedDialog(createModalRenderDeps(), S.recordBlockedDialogSel);
}

/* Destructive Lgto confirm dialog. Right-turn of CLIP K8 / DRUM LANE K8
 * opens this. OK applies; CANCEL aborts. Undoable. */
function drawLgtoConfirm() {
    renderLgtoConfirm(createModalRenderDeps(), {
        isDrum: S.confirmLgtoIsDrum,
        selected: S.confirmLgtoSel
    });
}

function drawBakeConfirm() {
    renderBakeConfirm(createModalRenderDeps(), {
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
    renderInheritPicker(createModalRenderDeps(), S.pendingInheritPicker);
}

function drawSnapshotPicker() {
    renderSnapshotPicker(createModalRenderDeps(), S.snapshotPicker);
}

/* CLEAR AUTOMATION modal — checkable AT / PB(disabled) / CC + a CLEAR action. */
function drawClearAutoMenu() {
    renderClearAutomationMenu(createModalRenderDeps(), S.clearAutoMenu);
}

function drawBakeSceneConfirm() {
    renderBakeSceneConfirm(createModalRenderDeps(), {
        wrapPhase: S.confirmBakeSceneWrapPhase,
        wrapSel: S.confirmBakeSceneWrapSel,
        sel: S.confirmBakeSceneSel
    });
}

function drawXposeConfirm() {
    renderXposeConfirm(createModalRenderDeps(), {
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


/* PHASE-1: helper for the pad-dispatch mute condition. Modal sources:
 * - sessionView                 — pads launch clips
 * - button-helds (Shift/Delete/Copy/Mute/Capture/Loop) — pads are shortcuts
 * - tapTempoOpen                — pads are tap input
 * - ARP step-edit pad mode      — K5 held in SEQ ARP (bank 4) or TRACK ARP
 *                                  (bank 5) with steps mode != Off; pads edit
 *                                  step velocity, not play notes
 * globalMenuOpen is NOT in this list — pads should still play notes in
 * track view while the menu is open (user confirmed 2026-05-17). */
function _padDispatchMutedNow() {
    if (S.sessionView) return true;
    if (S.shiftHeld || S.deleteHeld || S.muteHeld || S.copyHeld
        || S.captureHeld || S.loopHeld || S.tapTempoOpen) return true;
    if ((S.activeBank === 4 || S.activeBank === 5)
        && S.knobTouched === 4
        && S.bankParams[S.activeTrack]
        && ((S.bankParams[S.activeTrack][S.activeBank] || [])[4] | 0) !== 0) return true;
    /* Arp Steps overlay: pads are the persistent vel-level editor, not playable. */
    if (S.stepIntervalMode && (S.activeBank === 4 || S.activeBank === 5)) return true;
    return false;
}

/* ---- Transpose all melodic clips on global Key/Scale change ----------
 * Browsing the Key/Scale menu item arms a live preview (pads relayout +
 * DSP plays clips transposed); the knob-click commits behind a confirm.
 * Committed key/scale stay in S.padKey/S.padScale until commit; the
 * candidate lives in S.xposePrev* while previewing. */

/* Any melodic (non-drum) clip on any track with notes? */
function anyMelodicClipHasContent() {
    for (let t = 0; t < NUM_TRACKS; t++) {
        if (S.trackPadMode[t] === PAD_MODE_DRUM) continue;
        for (let c = 0; c < NUM_CLIPS; c++) if (S.clipNonEmpty[t][c]) return true;
    }
    return false;
}

/* Arm/refresh preview for candidate (candK,candS). Candidate == committed
 * cancels instead (no-op change). Runs from the menu-edit tick driver. */
function xposePreviewSet(candK, candS) {
    if (candK === S.padKey && candS === S.padScale) { xposeCancelPreview(); return; }
    S.xposePrevKey = candK; S.xposePrevScale = candS;
    computePadNoteMap();   /* relayout pads to candidate (also pushes padmap) */
    if (typeof host_module_set_param === 'function')
        host_module_set_param('t0_xpose_prev',
            S.padKey + ' ' + S.padScale + ' ' + candK + ' ' + candS);
    S.screenDirty = true;
}

/* Drop the preview: DSP returns playback to true pitch; pads back to committed.
 * The apply(flag=0) is queued (drained from tick) — set_param fired directly from
 * the onMidi confirm-click path is unreliable/coalesced. */
function xposeCancelPreview() {
    if (S.xposePrevKey === null && S.xposePrevScale === null) return;
    S.xposePrevKey = null; S.xposePrevScale = null;
    S.pendingDefaultSetParams.push({ key: 't0_xpose_apply',
        val: S.padKey + ' ' + S.padScale + ' ' + S.padKey + ' ' + S.padScale + ' 0' });
    computePadNoteMap();
    S.screenDirty = true;
}

/* Commit: bake the transpose into all melodic clips, adopt the new key/scale.
 * The apply(flag=1) is queued (drained from tick — set_param from the onMidi
 * confirm path is unreliable). The DSP bake skips empty clips; on the JS side a
 * transpose changes only note PITCH — step occupancy, lengths, loops and config
 * are unchanged and the pad layout is rebuilt here — so no clip resync is needed
 * (held-step note pitches refresh on the next press). */
function xposeCommit(candK, candS) {
    S.pendingDefaultSetParams.push({ key: 't0_xpose_apply',
        val: S.padKey + ' ' + S.padScale + ' ' + candK + ' ' + candS + ' 1' });
    S.padKey = candK; S.padScale = candS;
    S.xposePrevKey = null; S.xposePrevScale = null;
    computePadNoteMap();
    forceRedraw();
    S.screenDirty = true;
}

function computePadNoteMap() {
    /* Phase 1: push the resolved active-track map to DSP for audio-thread
     * inbound. DSP only ever indexes pad_note_map[inst->active_track], so
     * pushing the one active track's map on every recompute is sufficient.
     * Dormant until the capability gate flips dsp_inbound_enabled in
     * piece 3. */
    /* PHASE-1: only push on patched Schwung. The DSP padmap handler doubles
     * as the capability signal — its presence sets inst->dsp_inbound_enabled,
     * gating on_midi dispatch. On stock Schwung S.dspInboundEnabled stays
     * false, the push is skipped, on_midi (which isn't called on stock anyway)
     * stays dormant, and the JS pendingLiveNotes path keeps working unchanged.
     * Remove this gate when patches upstreamed. */
    applyPadNoteMap(S, {
        PAD_MODE_DRUM,
        DRUM_LANES,
        DRUM_BASE_NOTE,
        host_module_set_param: (typeof host_module_set_param === 'function') ? host_module_set_param : null,
        padDispatchMuted: _padDispatchMutedNow
    });
}

/* Drum helpers --------------------------------------------------------------- */

/** Sync one drum lane's step data and length from DSP. */
function syncDrumLaneSteps(t, l) {
    return syncDrumLaneStepsImpl(S, createDrumClipSyncDeps(), t, l);
}

/** Sync lane notes and hit-presence for all lanes of track t (active clip). */
function syncDrumLanesMeta(t) {
    return syncDrumLanesMetaImpl(S, createDrumClipSyncDeps(), t);
}


/** Convert a padIdx (0-31) to drum lane index for the current lane page, or -1 if right half. */
function drumPadToLane(padIdx) {
    return padSurfaceDrumPadToLane(padIdx, S.drumLanePage[S.activeTrack]);
}

function optionalHostModuleSetParam() {
    return (typeof host_module_set_param === 'function') ? host_module_set_param : null;
}

function createDrumClipSyncDeps() {
    return {
        getParam: typeof host_module_get_param === 'function' ? host_module_get_param : null
    };
}

function createClipStateSyncDeps() {
    return {
        getParam: typeof host_module_get_param === 'function' ? host_module_get_param : null,
        setParam: typeof host_module_set_param === 'function' ? host_module_set_param : null,
        readFile: typeof host_read_file === 'function' ? host_read_file : null,
        fileExists: typeof host_file_exists === 'function' ? host_file_exists : null,
        setActiveDrumLane,
        syncDrumClipContent,
        syncDrumLanesMeta,
        syncDrumLaneSteps,
        clipHasContent,
        readTrackConfig,
        readBankParams,
        readTarpStepVel,
        readDrumRepeatRates,
        refreshPerClipBankParams,
        refreshDrumLaneBankParams
    };
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

/* Bundle 2A: single setter for S.activeDrumLane that also pushes the
 * value to DSP via tN_active_drum_lane so on_midi.drum_pad_event can
 * fire vel-pad preview at the active lane's note. Replaces every direct
 * S.activeDrumLane[t] = X write site. PHASE-1: remove the set_param push
 * (and revert to direct writes) when patches are upstreamed and the JS
 * input path is deleted. */
function setActiveDrumLane(t, lane) {
    if (S.activeDrumLane[t] === lane) return;
    /* NB: written via array-ref alias so a future `replace_all` on the
     * pattern `S.activeDrumLane[t] = lane;` can't accidentally turn this
     * line into a recursive call to setActiveDrumLane (which is what
     * happened on the first 2A deploy — stack overflow on init). */
    const arr = S.activeDrumLane;
    arr[t] = lane;
    if (typeof host_module_set_param === 'function')
        host_module_set_param('t' + t + '_active_drum_lane', String(lane));
}

/* Bundle 2A: single setter for S.drumPerformMode that also pushes the
 * value to DSP via tN_drum_perform_mode so on_midi.drum_pad_event can
 * gate the vel-zone preview branch correctly (Rpt modes skip the
 * preview; only NORMAL fires it). Same array-ref-alias pattern as
 * setActiveDrumLane to avoid replace_all self-recursion. */
function setDrumPerformMode(t, mode) {
    if (S.drumPerformMode[t] === mode) return;
    const arrPm = S.drumPerformMode;
    arrPm[t] = mode;
    if (typeof host_module_set_param === 'function')
        host_module_set_param('t' + t + '_drum_perform_mode', String(mode));
}

/* Bundle 2C-Rpt2: single setter for S.drumLanePage that also pushes the
 * value to DSP via tN_drum_lane_page so on_midi.drum_pad_event can
 * translate left-half padIdx → absolute drum lane index (Rpt2 lane-pad
 * classification + Rpt1 lane-swap-while-holding). Same array-ref-alias
 * pattern as setActiveDrumLane to avoid replace_all self-recursion. */
function setDrumLanePage(t, page) {
    if (S.drumLanePage[t] === page) return;
    const arrLp = S.drumLanePage;
    arrLp[t] = page;
    if (typeof host_module_set_param === 'function')
        host_module_set_param('t' + t + '_drum_lane_page', String(page));
}

/** Sync S.drumClipNonEmpty[t] for all clips — called on track switch and state load. */
function syncDrumClipContent(t) {
    return syncDrumClipContentImpl(S, createDrumClipSyncDeps(), t);
}

/** MIDI note number → display string e.g. "C3 / 60" */
function drumNoteLabel(midiNote) {
    const oct  = Math.floor(midiNote / 12) - 2;
    const name = NOTE_KEYS[midiNote % 12];
    return name + oct + '/' + midiNote;
}

/* --------------------------------------------------------------------------- */

/* Root note in pad layout closest to octave 4 — guaranteed in-scale and on a pad. */
function defaultStepNote() {
    const target = S.padKey + 60;  /* root pitch class in MIDI octave 4 */
    let best = -1, bestDist = 999;
    for (let i = 0; i < 32; i++) {
        if (S.padNoteMap[i] === 0xFF) continue;  /* OOB pad — no melodic note */
        const p = S.padNoteMap[i] + S.trackOctave[S.activeTrack] * 12;
        if (p < 0 || p > 127) continue;
        if (S.padNoteMap[i] % 12 !== S.padKey) continue;  /* root notes only */
        const d = Math.abs(p - target);
        if (d < bestDist) { bestDist = d; best = p; }
    }
    if (best >= 0) return best;
    /* Fallback: first valid (non-0xFF) entry; if every pad is OOB (shouldn't
     * happen at any sane octave), return middle C. */
    for (let i = 0; i < 32; i++) {
        if (S.padNoteMap[i] === 0xFF) continue;
        return Math.max(0, Math.min(127, S.padNoteMap[i] + S.trackOctave[S.activeTrack] * 12));
    }
    return 60;
}


/* Synchronously zero every LED that SEQ8 owns — call before host_hide_module(). */
function clearAllLEDs() {
    let n, c;
    for (n = 68; n <= 99; n++) setLED(n, LED_OFF);
    for (n = 16; n <= 31; n++) setLED(n, LED_OFF);
    for (c = 16; c <= 31; c++) setButtonLED(c, LED_OFF);
    for (c = 40; c <= 43; c++) setButtonLED(c, LED_OFF);
    for (const cc of [49, 50, 51, 52, 54, 55, 56, 58, 60, 62, 63])
        setButtonLED(cc, LED_OFF);
    for (c = 71; c <= 78; c++) setButtonLED(c, LED_OFF);
    for (const cc of [85, 86, 88, 118, 119]) setButtonLED(cc, LED_OFF);
}

function installFlagsWrap() {
    if (typeof shadow_get_ui_flags !== 'function') return;
    if (globalThis.shadow_get_ui_flags._seq8) {
        globalThis.shadow_get_ui_flags._active = true;
        return;
    }
    const orig = globalThis.shadow_get_ui_flags;
    const wrap = function () {
        const f = orig();
        const hit = f & SEQ8_NAV_FLAGS;
        if (hit && wrap._active) {
            S.ledInitComplete = false;
            invalidateLEDCache();
            clearAllLEDs();
            if (typeof shadow_clear_ui_flags === 'function') shadow_clear_ui_flags(hit);
            return f & ~SEQ8_NAV_FLAGS;
        }
        return f;
    };
    wrap._seq8   = true;
    wrap._orig   = orig;
    wrap._active = true;
    globalThis.shadow_get_ui_flags = wrap;
}

function removeFlagsWrap() {
    const cur = globalThis.shadow_get_ui_flags;
    if (typeof cur === 'function' && cur._seq8) {
        cur._active = false;
        globalThis.shadow_get_ui_flags = cur._orig;
    }
}

function buildLedInitQueue() {
    const q = [];
    for (let n = 68; n <= 99; n++) q.push({ kind: 'note', id: n });
    for (let n = 16; n <= 31; n++) q.push({ kind: 'note', id: n });
    for (let c = 16; c <= 31; c++) q.push({ kind: 'cc', id: c });
    for (let c = 40; c <= 43; c++) q.push({ kind: 'cc', id: c });
    for (const c of [49, 50, 51, 52, 54, 55, 56, 58, 60, 62, 63])
        q.push({ kind: 'cc', id: c });
    for (let c = 71; c <= 78; c++) q.push({ kind: 'cc', id: c });
    for (const c of [85, 86, 88, 118, 119]) q.push({ kind: 'cc', id: c });
    return q;
}

function drainLedInit() {
    const end = Math.min(S.ledInitIndex + LEDS_PER_FRAME, S.ledInitQueue.length);
    for (let i = S.ledInitIndex; i < end; i++) {
        const led = S.ledInitQueue[i];
        if (led.kind === 'cc') setButtonLED(led.id, LED_OFF);
        else setLED(led.id, LED_OFF);
    }
    S.ledInitIndex = end;
    if (S.ledInitIndex >= S.ledInitQueue.length) {
        S.ledInitComplete = true;
        /* Custom scratch palette entry for the Loop button's ambient LED —
         * Loop's LED renders palette colors brighter than peers (Delete/Copy
         * idx 16 = dim grey; same idx 16 is invisible on Loop, and 124/DarkGrey
         * on Loop reads as fully bright). Push a low-RGB entry before
         * reapplyPalette so the LED hardware picks up index 60 on the refresh. */
        setPaletteEntryRGB(60, 32, 32, 32);
        reapplyPalette();
    }
}

/* Read per-clip bank params from DSP into S.bankParams for track t.
 * Reads from clip[active_clip].pfx_params directly — immune to pfx_sync timing. */
function refreshDrumLaneBankParams(t, lane) {
    refreshDrumLaneBankParamsFromDsp(S, {
        host_module_get_param: typeof host_module_get_param === 'function' ? host_module_get_param : undefined,
        TPS_VALUES
    }, t, lane);
}

/* Full drum-track resync after track switches. Side-button selection,
 * Shift+pad, and Shift+jog all need the same lane metadata, active-lane
 * steps, clip-content dots, and bank params. */
function resyncDrumTrack(t) {
    syncDrumLanesMeta(t);
    syncDrumLaneSteps(t, S.activeDrumLane[t]);
    syncDrumClipContent(t);
    refreshDrumLaneBankParams(t, S.activeDrumLane[t]);
}

function refreshPerClipBankParams(t) {
    refreshPerClipBankParamsFromDsp(S, {
        host_module_get_param: typeof host_module_get_param === 'function' ? host_module_get_param : undefined,
        PAD_MODE_DRUM,
        TPS_VALUES
    }, t);
}

/* Read TRACK ARP step_vel[8] from DSP for track t. Called on init and track switch. */
function readTarpStepVel(t) {
    readTrackArpStepConfigFromDsp(S, {
        host_module_get_param: typeof host_module_get_param === 'function' ? host_module_get_param : undefined
    }, t);
}

/* Read Rpt2 per-lane rate idx[32] from DSP for track t. Called after state
 * load so the rate-pad LED highlight matches the persisted DSP state.
 * (Rpt1's per-track last-rate lives only in DSP — JS has no mirror for it.) */
function readDrumRepeatRates(t) {
    readDrumRepeatRatesFromDsp(S, {
        host_module_get_param: typeof host_module_get_param === 'function' ? host_module_get_param : undefined
    }, t);
}

/* Deps for the param-bank read/write/reset cluster (ui_bank_params.mjs).
 * Host get/set params null-guarded; helpers close over module-global S. */
function createBankParamsDeps() {
    return {
        getParam: typeof host_module_get_param === 'function' ? host_module_get_param : null,
        setParam: typeof host_module_set_param === 'function' ? host_module_set_param : null,
        hasShadowSetParam: typeof shadow_set_param === 'function',
        refreshDrumLaneBankParams,
        routeCheckWarnForTrack,
        syncDrumLanesMeta,
        syncDrumLaneSteps,
        syncDrumClipContent,
        computePadNoteMap,
        forceRedraw
    };
}

/* Reset per-clip S.bankParams to defaults for track t (no DSP call needed —
 * DSP already reset them; this just keeps JS mirrors in sync). */
function resetPerClipBankParamsToDefault(t) {
    return resetPerClipBankParamsToDefaultImpl(S, createBankParamsDeps(), t);
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
        getParam: typeof host_module_get_param === 'function' ? host_module_get_param : null,
        setParam: typeof host_module_set_param === 'function' ? host_module_set_param : null,
        writeFile: typeof host_write_file === 'function' ? host_write_file : null,
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

/* Fixed-order DSP reconcile pipeline. NOT a dispatch ladder — the extracted
 * steps in ui_polldsp_workflow.mjs run unconditionally in this exact sequence
 * (see that module's header for the ordering/coalescing rationale). This thin
 * orchestrator keeps the three early-return guards (no get_param, no snapshot,
 * short snapshot) and threads the two cross-block locals: the parsed snapshot
 * array `v` and countInDspActive. */
function pollDSP() {
    const deps = createPollDspWorkflowDeps();
    /* Block A runs BEFORE the get_param guard (uses shadow_corun_state, not get_param). */
    pollCoRunReconcile(S, deps);
    if (typeof host_module_get_param !== 'function') return;
    pollAutomationAtIndicator(S, deps);
    const snap = host_module_get_param('state_snapshot');
    if (!snap) return;
    const v = snap.split(' ');
    if (v.length < 53) return;
    pollSnapshotTracks(S, deps, v);
    const countInDspActive = pollSnapshotClipStates(S, deps, v);
    pollMergeStateMachine(S, deps, v);
    pollDeferredBankRefresh(S, deps);
    pollPlayheadPads(S, deps);
    pollSeqFollowPage(S, deps);
    pollRecordPendingPage(S, deps);
    pollCountInEnd(S, deps, countInDspActive);
    pollTransportTransitions(S, deps);
    pollStepLedRefresh(S, deps);
    pollSeqActiveNotes(S, deps);
    pollDeferredSave(S, deps);
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
    return resetFxBanksImpl(S, createBankParamsDeps(), t);
}

/* Reset ARP IN (TARP, bank 5) for a melodic track to DSP defaults.
 * Issues a single tN_tarp_reset which the DSP handler resolves via
 * arp_init_defaults + held-buffer clear + silence. JS mirrors are
 * zeroed in parallel so the bank overview reflects defaults immediately. */
function resetTarp(t) {
    if (typeof host_module_set_param !== 'function') return;
    S.undoAvailable = true; S.redoAvailable = false;
    S.pendingDefaultSetParams.push({ key: 't' + t + '_tarp_reset', val: '1' });
    for (let k = 0; k < 8; k++) {
        const pm = BANKS[5].knobs[k];
        if (pm) S.bankParams[t][5][k] = pm.def;
    }
    for (let s = 0; s < 8; s++) {
        S.tarpStepVel[t][s] = 4;
        S.tarpStepInt[t][s] = 0;
    }
    S.tarpStepLoopLen[t] = 8;
    S.tarpHeldNotes[t].clear();
    S.screenDirty = true;
}

function resetSingleFxBank(t, bankIdx) {
    return resetSingleFxBankImpl(S, createBankParamsDeps(), t, bankIdx);
}

/* ------------------------------------------------------------------ */
/* Parameter bank: read from DSP and write to DSP                      */
/* ------------------------------------------------------------------ */

/* Read all wired params for bankIdx on track t from DSP into S.bankParams. */
function readBankParams(t, bankIdx) {
    return readBankParamsImpl(S, createBankParamsDeps(), t, bankIdx);
}

function readTrackConfig(t) {
    readTrackConfigFromDsp(S, {
        host_module_get_param: typeof host_module_get_param === 'function' ? host_module_get_param : undefined
    }, t);
}

function applyTrackConfig(t, key, val) {
    return applyTrackConfigImpl(S, createBankParamsDeps(), t, key, val);
}

/* Convert a track between melodic and drum, translating note content so the
 * music follows the track. The DSP handler (tN_convert_to_drum/_to_melodic)
 * does the data move AND flips pad_mode atomically in a single set_param, so
 * there is no coalescing drop. We then resync JS from DSP — syncClipsFromDsp()'s
 * get_param round-trips double as the audio-thread sync barrier. */
function trackHasAnyData(t) {
    for (let c = 0; c < NUM_CLIPS; c++)
        if (S.clipNonEmpty[t][c] || S.drumClipNonEmpty[t][c]) return true;
    return false;
}

function convertTrackType(t, toDrum) {
    if (typeof host_module_set_param !== 'function') return;
    host_module_set_param('t' + t + (toDrum ? '_convert_to_drum' : '_convert_to_melodic'), '1');
    S.trackPadMode[t] = toDrum ? PAD_MODE_DRUM : PAD_MODE_MELODIC_SCALE;
    /* Resync inline (this runs in tick(), so get_param works): the first get
     * in syncClipsFromDsp flushes the queued convert, then reads post-convert
     * state — it also runs the drum-side syncs when the result is a drum track.
     * Empty tracks skip the heavy all-track resync but still need a get_param
     * barrier so the convert set_param drains before computePadNoteMap pushes
     * tN_padmap (without the barrier, same-buffer coalescing drops the convert). */
    if (trackHasAnyData(t)) syncClipsFromDsp();
    else host_module_get_param('t' + t + '_pad_mode');
    if (toDrum) {
        if (t === S.activeTrack && (S.activeBank === 2 || S.activeBank === 4)) S.activeBank = 0;
    } else {
        if (t === S.activeTrack && S.activeBank === 7) S.activeBank = 0;
        /* DSP zeroed active_drum_lane/drum_perform_mode inside the convert
         * handler; only JS-side mirror state needs clearing here. */
        S.drumVelZoneArmed[t] = false;
        S.drumLastVelZone[t]  = 0;
    }
    computePadNoteMap();   /* get_param-free — rebuild pad LEDs immediately */
    invalidateLEDCache();
    forceRedraw();
}

/* Tear down the Keys->Drums confirm dialog and the menu's edit state so a
 * lingering enum edit doesn't replay. Call on Yes, No, and Back-cancel. */
function closeConvertConfirm() {
    S.confirmConvertToDrum = false;
    if (S.globalMenuState) S.globalMenuState.editing = false;
    if (S.globalMenuState) S.globalMenuState.editValue = null;
    S.lastSentMenuEditValue = null;
    S.bpmWasEditing = false;
}

/* Rewrite the cable-2 channel remap table for the active track.
 * When the active track is ROUTE_MOVE, incoming external MIDI is remapped to the
 * track's channel so Move's firmware routes it to the correct track instrument.
 * Called from tick() on any change to activeTrack/route/channel/midiInChannel,
 * and directly from init() on first load / resume after full exit. */
function applyExtMidiRemap() {
    const t = S.activeTrack;
    const isMove = S.trackRoute[t] === 1;
    const hasRemap = typeof host_ext_midi_remap_enable === 'function';
    if (!hasRemap) return;
    if (!isMove) {
        host_ext_midi_remap_clear();
        for (var _i = 0; _i < 16; _i++) {
            host_ext_midi_remap_set(_i, 254);  /* EXT_MIDI_REMAP_BLOCK */
        }
        host_ext_midi_remap_enable(1);
        S.extMidiRemapActive = false;
        return;
    }
    const outCh = S.trackChannel[t] - 1;  /* 0-indexed */
    host_ext_midi_remap_clear();
    if (S.midiInChannel === 0) {
        for (var _i = 0; _i < 16; _i++) {
            if (_i !== outCh) host_ext_midi_remap_set(_i, outCh);
        }
    } else {
        const inCh = S.midiInChannel - 1;  /* 0-indexed */
        if (inCh !== outCh) host_ext_midi_remap_set(inCh, outCh);
    }
    host_ext_midi_remap_enable(1);
    S.extMidiRemapActive = true;
}

/* True when (track-type, bank) exposes alt params reachable via S.altMode.
 * Melodic: CLIP(0), DELAY(3), AUTO/CC(6 — CC-assign). Drum: DRUM LANE(0),
 * REPEAT GROOVE(5), ALL LANES(7). The CC bank is melodic-only (its knob handler
 * returns early for drum), so bank 6 is NOT an alt bank on drum tracks. Keep in
 * sync with the shiftHeld→altMode migration sites. */
function bankHasAltParams(t, bank) {
    if (S.trackPadMode[t] === PAD_MODE_DRUM) return bank === 0 || bank === 5 || bank === 7;
    /* Melodic CLIP(0), NOTE FX(1), DELAY(3), SEQ ARP(4), ARP IN(5), AUTO/CC(6).
     * Banks 4/5 use stepIntervalMode (Arp Steps overlay) rather than altMode —
     * the arrow still shows their toggle-availability, and altIndicatorActive()
     * reflects which underlying flag is on. */
    return bank === 0 || bank === 1 || bank === 3 || bank === 4 || bank === 5 || bank === 6;
}

/* Returns true when the current bank's alt indicator should flash. For melodic
 * SEQ ARP / ARP IN this is the Arp Steps overlay flag; for every other alt-param
 * bank it is altMode. */
function altIndicatorActive(t, bank) {
    if (S.trackPadMode[t] !== PAD_MODE_DRUM && (bank === 4 || bank === 5)) {
        return S.stepIntervalMode;
    }
    return S.altMode;
}

/* Send a single param change to DSP and apply any JS-side side-effects. */
function applyBankParam(t, bankIdx, knobIdx, val) {
    return applyBankParamImpl(S, createBankParamsDeps(), t, bankIdx, knobIdx, val);
}


/* Tick-batched live-note dispatch. Multiple set_param calls within a single
 * audio buffer coalesce to the last write — regardless of key — so a 3-pad
 * chord that fires 3 separate tN_live_notes microtasks within one buffer
 * loses two of them. We previously batched via a Promise microtask which
 * runs once per JS turn, but the host dispatches each onMidiMessage as its
 * own turn — so multiple pad CCs in one buffer still produced multiple
 * coalescing set_params. Drain on tick instead: events queue synchronously
 * from any number of onMidiMessage calls; tick() drains once per audio
 * buffer into one set_param per track. Cost: up to ~10 ms (one tick) of
 * live-monitor latency. Benefit: chord-press survives intact. */
function liveSendNote(t, type, pitch, vel, rawVel) {
    const ch    = (S.trackChannel[t] - 1) & 0x0F;
    const route = S.trackRoute[t];
    const status = type | ch;
    /* PHASE-1: dead on patched Schwung (Bundle 1 gate skips note dispatch
     * for liveSendNote; Bundle 2B applies VelIn in DSP on_midi via
     * effective_vel before live_note_on). Stock Schwung still needs this
     * — runs when dspInboundEnabled is false. Remove with the final
     * cleanup pass once shim patches land upstream. */
    if (!rawVel && type === 0x90 && vel > 0) {
        const tvo = S.trackVelOverride[t];
        if (tvo > 0) vel = tvo;
    }
    if (route === 2) {
        /* ROUTE_EXTERNAL. Note events queue through tN_live_notes so the pfx
         * chain applies (consistent with sequencer playback, which already
         * routes ROUTE_EXTERNAL through pfx_emit). DSP-side gate suppresses
         * when on_midi already handled it. CC/AT/PB pass through raw for the
         * external-MIDI-in forwarding path. */
        if (type === 0x90 || type === 0x80) {
            const isOff = (type === 0x80) || (type === 0x90 && vel === 0);
            if (isOff) {
                queueLiveNoteOff(pendingLiveNotes, t, pitch);
            } else {
                queueLiveNoteOn(pendingLiveNotes, t, pitch, vel);
            }
        } else {
            const cin = (status >> 4) & 0x0F;
            if (typeof move_midi_external_send === 'function')
                move_midi_external_send([cin, status, pitch, vel]);
        }
    } else if (route === 1) {
        /* ROUTE_MOVE. Queue note events for microtask-batched drain into one
         * tN_live_notes payload at end of the current JS turn. Recording
         * suppression: melodic record_note_on inline-monitors via DSP; drum
         * recording handled by press-handler direct-fire (also routes through
         * queueLiveNoteOn). Suppress here to avoid double-monitoring.
         *
         * Always queued regardless of dspInboundEnabled — the DSP-side
         * tN_live_notes handler gates on dsp_inbound_enabled instead, so
         * the JS path serves as a fallback when the padmap push didn't
         * reach DSP (stock Schwung v0.9.16 exposes the sentinel but
         * on_midi delivery may not produce sound). */
        if (type === 0x90 || type === 0x80) {
            const activelyRecording = S.recordArmed && !S.recordCountingIn && S.recordArmedTrack === t;
            const isOff = (type === 0x80) || (type === 0x90 && vel === 0);
            if (isOff) {
                queueLiveNoteOff(pendingLiveNotes, t, pitch);
            } else if (!activelyRecording) {
                queueLiveNoteOn(pendingLiveNotes, t, pitch, vel);
            }
        }
    } else {
        /* ROUTE_SCHWUNG: route note events through live_note_on so pfx chain
         * (TARP, NOTE FX, HARMZ, MIDI DLY) applies. No activelyRecording filter
         * — record_note_on DSP handler does not call live_note_on() inline for
         * ROUTE_SCHWUNG, so no double-monitoring risk. Non-note events (CC, AT,
         * PB) pass through raw — only note on/off go through the live-notes
         * payload parser.
         *
         * Always queued regardless of dspInboundEnabled — DSP-side gate. */
        if (type === 0x90 || type === 0x80) {
            const isOff = type === 0x80 || vel === 0;
            if (isOff) {
                queueLiveNoteOff(pendingLiveNotes, t, pitch);
            } else {
                queueLiveNoteOn(pendingLiveNotes, t, pitch, vel);
            }
        } else {
            if (typeof shadow_send_midi_to_dsp === 'function') shadow_send_midi_to_dsp([status, pitch, vel]);
        }
    }
}

function extNoteOffAll() {
    if (extHeldNotes.size === 0) return;
    for (const [pitch, info] of extHeldNotes) {
        liveSendNote(info.track, 0x80, pitch, 0);
        if (info.recording) recordNoteOff(pitch);
    }
    extHeldNotes.clear();
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
    if (typeof host_module_set_param === 'function')
        host_module_set_param('perf_mods', String(S.perfModsToggled | S.perfModsHeld));
}

/* Draw the full 4-row pad grid for Performance Mode.
 * R0 (68-75): rate pads 1-6 (pulse at capture rate), triplet toggle, latch.
 * R1 (76-83): PITCH modifier pads (HotMagenta family).
 * R2 (84-91): VEL/GATE modifier pads (VividYellow family).
 * R3 (92-99): WILD modifier pads (Cyan family).
 * Also clears step buttons (16-31) — not used in Perf Mode. */
function updatePerfModeLEDs() {
    if (!S.ledInitComplete) return;
    const activeMods = S.perfModsToggled | S.perfModsHeld;
    /* Step buttons: preset slots. */
    for (let i = 0; i < 16; i++) {
        if (i === S.perfRecalledSlot)         setLED(16 + i, White);
        else if (S.perfSnapshots[i] !== 0)    setLED(16 + i, PurpleBlue);
        else                                setLED(16 + i, LightGrey);
    }

    /* R0 (68-75): rate pads 0-4 (1/32..1/2), hold (5), sync (6), latch (7).
     * Static colors only — no flashing. */
    for (let i = 0; i < 5; i++) {
        const rateActive = S.perfStickyLengths.has(i) ||
                           S.perfStack.some(function(e) { return e.idx === i; });
        setLED(68 + i, rateActive ? White : DarkGrey);
    }
    /* Hold pad (73): bright Red when engaged, dim Red when off. */
    setLED(73, S.perfHoldPadHeld ? Red : DeepRed);
    /* Sync (pad 74): bright Green when on, dim Green when off. */
    setLED(74, S.perfSync ? Green : DeepGreen);
    /* Latch (pad 75): track-3 bright/dim pair (BrightGreen / DarkOlive). */
    setLED(75, S.perfLatchMode ? TRACK_COLORS[2] : TRACK_DIM_COLORS[2]);

    /* R1 (76-83): PITCH mods — active = White, inactive = dim Magenta */
    for (let i = 0; i < 8; i++) {
        const note = 76 + i;
        const modIdx = PERF_MOD_PAD_MAP[note];
        if (modIdx !== undefined)
            setLED(note, (activeMods >> modIdx) & 1 ? White : DeepMagenta);
        else
            setLED(note, LED_OFF);
    }

    /* R2 (84-91): VEL/GATE mods — active = White, inactive = dim Yellow */
    for (let i = 0; i < 8; i++) {
        const note = 84 + i;
        const modIdx = PERF_MOD_PAD_MAP[note];
        if (modIdx !== undefined)
            setLED(note, (activeMods >> modIdx) & 1 ? White : Mustard);
        else
            setLED(note, LED_OFF);
    }

    /* R3 (92-99): WILD mods — active = White, inactive = dim Blue */
    for (let i = 0; i < 8; i++) {
        const note = 92 + i;
        const modIdx = PERF_MOD_PAD_MAP[note];
        if (modIdx !== undefined)
            setLED(note, (activeMods >> modIdx) & 1 ? White : DarkBlue);
        else
            setLED(note, LED_OFF);
    }
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

function createBankRenderDeps() {
    return {
        print,
        fill_rect,
        drawBankHeading,
        drawBankHeadingInverted,
        drawAltArrow,
        altIndicatorActive,
        bankHasAltParams,
        midiNoteName
    };
}

function createBankChromeRenderDeps() {
    return {
        print,
        fill_rect,
        altIndicatorActive,
        bankHasAltParams
    };
}

function createMetroIndicatorRenderDeps() {
    return {
        pixelPrint,
        fill_rect
    };
}

function createSplashRenderDeps() {
    return {
        clear_screen,
        fill_rect
    };
}

function createTrackIdleRenderDeps() {
    return {
        pixelPrint,
        fill_rect,
        drawBankHeading,
        drawBankHeadingInverted,
        drawMetroIndicator,
        drawPositionBar,
    };
}

function createSessionIdleRenderDeps() {
    return {
        print,
        pixelPrint,
        fill_rect,
        drawMetroIndicator
    };
}

function createSessionOverviewRenderDeps() {
    return {
        fill_rect
    };
}

function createPerfModeRenderDeps() {
    return {
        clear_screen,
        print,
        pixelPrint,
        fill_rect
    };
}

function createMotionIdleRenderDeps() {
    return {
        print,
        fill_rect,
        drawBankHeadingInverted,
        host_module_get_param
    };
}

function createPopupRenderDeps() {
    return {
        print,
        fill_rect
    };
}

function createPromptRenderDeps() {
    return {
        clear_screen,
        fill_rect,
        print
    };
}

function createModalRenderDeps() {
    return {
        clear_screen,
        fill_rect,
        print,
        drawMenuHeader
    };
}

function createLoopRenderDeps() {
    return {
        print,
        pixelPrint,
        fill_rect
    };
}

function createStepEditRenderDeps() {
    return {
        print,
        pixelPrint,
        fill_rect
    };
}

function createCcStepEditRenderDeps() {
    return {
        print,
        pixelPrint,
        fill_rect,
        host_module_get_param
    };
}

function createStepIntervalRenderDeps() {
    return {
        print,
        fill_rect,
        drawBankHeading
    };
}

function drawUI() {
    /* CO-RUN: shadow_ui's chain editor owns the OLED while this is active.
     * Skip every Overture draw path so it doesn't fight the chain editor's
     * frame. shadow_ui still calls clear_screen + redraw each tick. */
    if (S.schwungCoRunSlot >= 0) return;
    /* Move-native co-run: Move firmware owns the OLED (preset browser /
     * device-edit pages). The shim's display_mode bypass keeps Move's
     * framebuffer visible while the MIDI filter stays active; we just
     * stay out of the way. Pad/step LEDs freeze at entry-time state —
     * verified harmless in real use (nothing the user does during co-run
     * depends on live LED feedback). */
    if (S.moveCoRunTrack >= 0) {
        /* Side clip buttons: the button paired to the Move track this Overture
         * track routes to blinks; the rest stay dark grey. Move's track numbering
         * is reversed (Track 1 = CC 43 = top .. Track 4 = CC 40 = bottom), so a
         * channel ch (1-4) maps to top-to-bottom bit (ch-1). Forced every
         * POLL_INTERVAL to re-assert over Move firmware's pass-through writes. */
        const _coRunCh = (S.trackChannel[S.moveCoRunTrack] | 0);
        const _litMask = (_coRunCh >= 1 && _coRunCh <= 4) ? (1 << (_coRunCh - 1)) : 0;
        paintCoRunSideButtons(_litMask, (S.tickCount % POLL_INTERVAL) === 0);
        return;
    }
    /* Alt-param mode is transient: any bank change, track change, or entering
     * Session View drops back to primary params. Diff-guard catches every
     * S.activeBank / S.activeTrack reassignment regardless of source. */
    if (S.altMode && (S.sessionView ||              /* session view can be entered via a button after altMode was set */
            S.activeBank !== S._altPrevBank ||
            S.activeTrack !== S._altPrevTrack)) {
        S.altMode = false;
    }
    S._altPrevBank  = S.activeBank;
    S._altPrevTrack = S.activeTrack;
    if (S.sessionOverlayHeld) { renderSessionOverview(createSessionOverviewRenderDeps()); return; }
    if (S.pendingInheritPicker) { drawInheritPicker(); return; }
    if (S.snapshotPicker) { drawSnapshotPicker(); return; }
    if (S.clearAutoMenu) { drawClearAutoMenu(); return; }
    if (S.pendingSceneBakePicker) {
        renderSceneBakePickerPrompt(createPromptRenderDeps());
        return;
    }
    if (S.pendingMergePlacement) {
        renderMergePlacementPrompt(createPromptRenderDeps());
        return;
    }
    if (S.confirmStateWipe) { drawStateWipeConfirm(); return; }
    if (S.recordBlockedDialog) { drawRecordBlockedDialog(); return; }
    if (S.confirmLgto)         { drawLgtoConfirm();         return; }
    if (S.confirmXpose) { drawXposeConfirm(); return; }
    if (S.confirmBakeScene) { drawBakeSceneConfirm(); return; }
    if (S.confirmBake) { drawBakeConfirm(); return; }
    if (S.globalMenuOpen || S.tapTempoOpen) { ensureGlobalMenuFresh(); drawGlobalMenu(); return; }
    /* Perf Mode OLED takeover (Session View + Loop held or locked) */
    if (S.sessionView && (S.loopHeld || S.perfViewLocked)) { renderPerfModeOled(createPerfModeRenderDeps()); return; }
    if (S.stateLoading || S.bootSplashTicks > 0) {
        renderSplashScreen(S, createSplashRenderDeps());
        return;
    }
    /* Not in splash mode — clear the entry-edge flag so the next splash rerolls. */
    if (S.splashWasVisible) S.splashWasVisible = false;

    clear_screen();
    if (S.sessionView) {
        if (S.actionPopupEndTick >= 0) {
            renderSessionActionPopup(createPopupRenderDeps());
            return;
        }
        renderSessionIdleView(createSessionIdleRenderDeps());
        return;
    }

    /* Track View — priority display state machine */
    const bank      = S.activeBank;
    const inTimeout = S.bankSelectTick >= 0 || S.jogTouched;

    /* Compress-limit override: highest priority for ~1500ms after a blocked compress */
    if (S.stretchBlockedEndTick >= 0) {
        renderCompressLimitNotice(createPopupRenderDeps());
        return;
    }

    /* Action confirmation pop-up: ~500ms; defers to step edit and active-knob bank overview */
    if (S.actionPopupEndTick >= 0 && S.heldStep < 0 && S.knobTouched < 0) {
        renderTrackActionPopup(createPopupRenderDeps());
        return;
    }

    /* No-note flash: ~600ms after pressing an empty step with no prior pad */
    if (S.noNoteFlashEndTick >= 0 && S.activeBank !== 6) {
        renderNoNoteFlashNotice(createPopupRenderDeps());
        return;
    }

    if (S.shiftHeld && !S.sessionView && S.heldStep < 0 && S.knobTouched < 0 &&
            !S.deleteHeld && !S.copyHeld && !S.muteHeld && !S.loopHeld) {
        renderShiftStepHelp(createPromptRenderDeps());
        return;
    }

    /* Step edit: show assigned notes and step identity */
    if (S.heldStep >= 0) {
        if (S.activeBank === 6 && S.trackPadMode[S.activeTrack] !== PAD_MODE_DRUM) {
            renderCcStepEditView(createCcStepEditRenderDeps());
            return;
        } else {
        if (renderTrackStepEditView(createStepEditRenderDeps())) return;
        /* Non-empty melodic step, notes still loading at hold threshold: fall through to bank/header. */
    } /* end else (non-bank-6 step edit) */
    }

    /* Loop view: own priority state so screen is fully cleared first */
    if (S.loopHeld) {
        renderLoopView(createLoopRenderDeps());
        return;
    }

    /* Arp Steps interval overlay: persistent bank overview while jog-clicked into
     * step-interval mode on SEQ ARP (4) or TARP (5). K1-K8 = per-step scale-degree
     * offsets (±24); pad grid is the persistent step-vel level editor handled in
     * updateTrackLEDs. Renders REGARDLESS of knob-touch / inTimeout (persistent). */
    if (bank >= 0 && S.stepIntervalMode && !S.sessionView && (bank === 4 || bank === 5)) {
        renderStepIntervalOverlay(createStepIntervalRenderDeps(), bank);
        return;
    }

    /* Auto bank idle display: lane info + automation graph + progress bar */
    if (bank === 6 && S.trackPadMode[S.activeTrack] !== PAD_MODE_DRUM &&
            !S.loopHeld && S.knobTouched < 0 && !inTimeout) {
        renderMotionIdleView(createMotionIdleRenderDeps());
        return;
    }

    if (bank >= 0 && (S.knobTouched >= 0 || inTimeout ||
            (S.altMode && bankHasAltParams(S.activeTrack, bank)) ||
            (S.shiftHeld && bank === 1 && S.trackPadMode[S.activeTrack] !== PAD_MODE_DRUM))) {
        if (S.knobTouched >= 0 && !S.stepIntervalMode) {
            renderParamPeek(createPopupRenderDeps());
            return;
        }
        const bankRenderDeps = createBankRenderDeps();
        if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM && bank === 5) {
            const t    = S.activeTrack;
            const lane = S.activeDrumLane[t];
            syncDrumRepeatState(t, lane);
        }
        renderTrackBankOverview(bankRenderDeps, bank);

    } else if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM) {
        renderDrumTrackIdleView(createTrackIdleRenderDeps());
    } else {
        renderMelodicTrackIdleView(createTrackIdleRenderDeps());
    }
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
    if (!uuid || !name) return 'blank';
    if (typeof host_file_exists !== 'function') return 'blank';
    if (host_file_exists(uuidToStatePath(uuid))) return 'blank';
    const idx = S.nameIndexCache || (S.nameIndexCache = loadNameIndex());
    const candidates = findInheritCandidates(name, idx);
    if (candidates.length === 0) return 'blank';
    if (candidates.length === 1) {
        copyStateFiles(candidates[0].uuid, uuid);
        return 'auto';
    }
    S.pendingInheritPicker = {
        dstUuid: uuid,
        dstName: name,
        candidates: candidates,
        selectedIndex: 0
    };
    S.screenDirty = true;
    return 'picker';
}

/* Resolve the inherit picker: action is either the candidates index to
 * inherit from, or -1 for "Start blank". Always trigger pendingSetLoad
 * so DSP runs its state_load handler — which both resets the internal
 * state (clip_init, drum_track_init, etc.) and reads the canonical file.
 * For "Start blank" the file is missing on purpose; the reset alone gives
 * a clean slate. For inherit, we copy the source's state files first so
 * the load reads the seeded content. */
function resolveInheritPicker(action) {
    const p = S.pendingInheritPicker;
    if (!p) return;
    if (action >= 0 && action < p.candidates.length) {
        copyStateFiles(p.candidates[action].uuid, p.dstUuid);
    }
    S.pendingSetLoad = true;
    S.pendingInheritPicker = null;
    S.screenDirty = true;
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
    S.pendingSnapshotCopy = { id: id, label: snapshotLabel() };
    saveState();
}

/* Save state action. Under the cap → new timestamped snapshot. At the cap →
 * open the overwrite picker to choose which existing one to replace. */
function openSaveSnapshot() {
    if (S.pendingSuspendSave || S.pendingSnapshotCopy) return;  /* save already in flight */
    const snaps = loadSnapshotManifest(S.currentSetUuid);
    if (snaps.length >= SNAPSHOT_CAP) {
        S.snapshotPicker = { mode: 'overwrite', snaps: snaps, sel: 0, confirm: null };
        S.globalMenuOpen = false;
        S.screenDirty = true;
        return;
    }
    beginSnapshotSave(String(Date.now()));
    S.globalMenuOpen = false;
    showActionPopup('STATE', 'SAVED');
}

/* Load state action. Empty → popup. If any snapshots predate the current
 * state version, offer to wipe them before showing the list. */
function openLoadSnapshot() {
    const snaps = loadSnapshotManifest(S.currentSetUuid);
    if (snaps.length === 0) {
        S.globalMenuOpen = false;
        showActionPopup('NO', 'SNAPSHOTS');
        return;
    }
    const stale = [];
    for (let i = 0; i < snaps.length; i++)
        if (snaps[i].sv !== STATE_VERSION) stale.push(snaps[i].id);
    S.snapshotPicker = { mode: 'load', snaps: snaps, sel: 0, confirm: null };
    if (stale.length > 0)
        S.snapshotPicker.confirm = { kind: 'wipe', sel: 1, wipeIds: stale };
    S.globalMenuOpen = false;
    S.screenDirty = true;
}

function closeSnapshotPicker() {
    S.snapshotPicker = null;
    S.screenDirty = true;
}

/* Jog rotation inside the picker: toggle a confirm's Yes/No, else move
 * the list selection. */
function snapshotPickerRotate(delta) {
    const p = S.snapshotPicker;
    if (!p || delta === 0) return;
    if (p.confirm) {
        p.confirm.sel = p.confirm.sel === 0 ? 1 : 0;
    } else {
        const n = p.snaps.length;
        if (n > 0) p.sel = (p.sel + (delta > 0 ? 1 : n - 1)) % n;
    }
    S.screenDirty = true;
}

/* Jog click inside the picker: resolve a confirm, or arm one for the
 * selected entry. */
function snapshotPickerClick() {
    const p = S.snapshotPicker;
    if (!p) return;
    if (p.confirm) {
        const yes = p.confirm.sel === 0;
        const kind = p.confirm.kind;
        if (kind === 'wipe') {
            if (yes) { p.snaps = dropSnapshots(S.currentSetUuid, p.confirm.wipeIds); p.sel = 0; }
            p.confirm = null;
            if (p.snaps.length === 0) closeSnapshotPicker();
            else S.screenDirty = true;
            return;
        }
        const id = p.confirm.targetId;
        closeSnapshotPicker();
        if (kind === 'load' && yes) {
            applySnapshotToLive(S.currentSetUuid, id);
            S.pendingSetLoad = true;          /* reuse the normal state_load reload path */
            showActionPopup('STATE', 'LOADED');
        } else if (kind === 'overwrite' && yes) {
            beginSnapshotSave(id);            /* reuse id → overwrite in place */
            showActionPopup('STATE', 'SAVED');
        }
        return;
    }
    const snap = p.snaps[p.sel];
    if (!snap) return;
    if (p.mode === 'load') {
        if (snap.sv !== STATE_VERSION) return;   /* incompatible: ignore press */
        p.confirm = { kind: 'load', sel: 1, targetId: snap.id };
    } else {
        p.confirm = { kind: 'overwrite', sel: 1, targetId: snap.id };
    }
    S.screenDirty = true;
}

/* ---- CLEAR AUTOMATION menu (Delete-tap on the AUTO bank) ---- */
function openClearAutoMenu() {
    S.clearAutoMenu = { sel: 0, at: false, cc: false };
    S.screenDirty = true;
}
function closeClearAutoMenu() {
    S.clearAutoMenu = null;
    S.screenDirty = true;
}
function clearAutoMenuRotate(delta) {
    const m = S.clearAutoMenu;
    if (!m || delta === 0) return;
    m.sel = (m.sel + (delta > 0 ? 1 : 4)) % 5;   /* 0=AT 1=PB 2=CC 3=CLEAR 4=Cancel */
    S.screenDirty = true;
}
function clearAutoMenuClick() {
    const m = S.clearAutoMenu;
    if (!m) return;
    if (m.sel === 0) { m.at = !m.at; }              /* Aftertouch (AT) */
    else if (m.sel === 1) { /* Pitch bend (PB) — placeholder, not selectable */ }
    else if (m.sel === 2) { m.cc = !m.cc; }         /* Control Change (CC) — all CC data */
    else if (m.sel === 4) { closeClearAutoMenu(); return; }   /* Cancel */
    else {                                           /* CLEAR — execute */
        const t = S.activeTrack, c = effectiveClip(t);
        if (m.cc) {
            S.trackCCAutoBits[t][c] = 0;
            S.trackCCLiveVal[t] = new Array(8).fill(-1);
            S.clipCCVal[t][c] = new Array(8).fill(-1);
            S.pendingDefaultSetParams.push({ key: 't' + t + '_cc_auto_clear', val: String(c) });
        }
        if (m.at) {
            S.clipAtHas[t][c] = false;
            S.pendingDefaultSetParams.push({ key: 't' + t + '_c' + c + '_at_clear', val: '1' });
        }
        const done = [];
        if (m.at) done.push('AT');
        if (m.cc) done.push('CC');
        if (done.length) {
            S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
        }
        closeClearAutoMenu();
        invalidateLEDCache();
        showActionPopup('CLEARED', done.length ? done.join(' ') : 'NOTHING');
        return;
    }
    S.screenDirty = true;
}

/* Enter co-run for slot N on track t. Persists the track's slot choice,
 * suppresses Overture's OLED drawing + track-button LEDs (handled where each
 * is written), and tells Schwung's shadow_ui to also tick the chain editor. */
function enterSchwungCoRun(t, slot) {
    S.schwungCoRunSlot = slot;
    if (typeof shadow_corun_begin === 'function')
        shadow_corun_begin(CORUN_TARGET_CHAIN_EDIT, slot, OVERTURE_CORUN_KEEP_MASK);
    S.screenDirty = true;
}

/* Exit co-run. Called on programmatic Overture state changes (track switch,
 * global-menu open, etc.) or by the pollDSP reconcile when the shim's
 * framework Back-handler has ended the session. Calling shadow_corun_end()
 * after the shim already ended is a no-op. */
function exitSchwungCoRun() {
    if (S.schwungCoRunSlot < 0) return;
    S.schwungCoRunSlot = -1;
    S._coRunChanSlots = 0;
    if (typeof shadow_corun_end === 'function')
        shadow_corun_end();
    /* Modifier-key release CCs the user pressed inside the co-run may have
     * been routed to Schwung and never reached us — clear defensively so a
     * stuck Shift/Mute/etc. can't silence pad dispatch on return. Mirrors
     * the resume-from-suspend clear. */
    S.shiftHeld = false; S.deleteHeld = false; S.muteHeld = false;
    S.copyHeld  = false; S.loopHeld  = false; S.loopJogActive = false;
    S.captureHeld = false; S.shiftTrackLEDActive = false;
    /* Schwung's chain editor may have rewritten palette scratch entries while
     * we were ceded. Reapply our palette before invalidating the LED cache
     * so forceRedraw below repaints with the right colors. */
    reapplyPalette();
    invalidateLEDCache();
    forceRedraw();
}

/* Enter Move-native co-run for Overture track t. Asks the shim to (a) yield
 * the OLED to Move firmware and (b) flip its sh_midi filter / shadow_ui
 * forward so the nav-CC + touch-note set routes to Move firmware instead
 * of Overture. Fires one cable-0 track-button tap so Move firmware lands
 * on the preset browser for the relevant track without the user touching
 * the front panel. Move's track-button CC mapping is REVERSED
 * (CC 43 = Track 1 ... CC 40 = Track 4), and Overture tracks 5-8 with
 * ROUTE_MOVE rely on the user's trackChannel to address one of Move's
 * 4 tracks — if trackChannel is outside 1-4 we just enter co-run without
 * an auto-tap and let the user pick the Move track manually. */
function enterMoveNativeCoRun(t) {
    if (typeof shadow_corun_begin !== 'function') return;
    if (typeof move_midi_inject_to_move !== 'function') return;
    const ch = S.trackChannel[t] | 0;
    if (ch < 1 || ch > 4) showActionPopup('MOVE CH>4', 'CH ' + ch);
    S.moveCoRunTrack = t;
    computePadNoteMap();
    S.pendingPadNoteMapRecompute = true;
    shadow_corun_begin(CORUN_TARGET_MOVE_NATIVE, t, OVERTURE_CORUN_KEEP_MASK);
    /* Let Move firmware's own LED writes (track buttons, knob rings, transport)
     * reach hardware while it drives the device-edit UI. skip_led_clear makes the
     * shim's overtake LED-strip loop early-return, so Move's LEDs pass through live.
     * Toggled back off in exitMoveNativeCoRun(). This is a mid-overtake toggle — it
     * does NOT hit the entry/exit snapshot path, so the suspend/exit native LED
     * restore is unaffected. */
    if (typeof shadow_set_skip_led_clear === 'function') shadow_set_skip_led_clear(1);
    /* Defer the track-button "press" that lands Move on the device-edit page and
     * makes it repaint its track + knob LEDs. Injecting it immediately fails: Move's
     * repaint lands before the shim's co-run LED passthrough + OLED bypass go live
     * (corun_move_native_track hasn't propagated to the shim yet), so the repaint is
     * stripped and the LEDs don't show until a manual press. Fire it from tick() a
     * few ticks later, once co-run is fully active. */
    S.pendingMoveCoRunInject = 12;
    S.globalMenuOpen = false;
    S.lastSentMenuEditValue = null;
    S.screenDirty = true;
}

/* Exit Move-native co-run. The shim drops its input split + display
 * bypass the next time it reads corun_move_native_track from SHM, so
 * Move firmware's framebuffer stops reaching the OLED and the nav CCs
 * start flowing to Overture again. We force a full redraw so any LEDs
 * Move firmware was driving (knob rings, track buttons, Shift, Back)
 * get repainted from Overture state right away. */
function exitMoveNativeCoRun() {
    if (S.moveCoRunTrack < 0) return;
    S.moveCoRunTrack = -1;
    S.pendingMoveCoRunInject = 0;  /* cancel any pending entry inject */
    S.moveCoRunPressQueue = null;  /* cancel any in-flight track-row press sequence */
    computePadNoteMap();
    S.pendingPadNoteMapRecompute = true;
    if (typeof shadow_corun_end === 'function')
        shadow_corun_end();
    /* Resume the shim's overtake LED-strip loop so Overture owns the LEDs again
     * (mirror of the skip_led_clear(1) in enterMoveNativeCoRun). */
    if (typeof shadow_set_skip_led_clear === 'function') shadow_set_skip_led_clear(0);
    /* If a drum pad hold inject was in flight, send the note-off before the
     * co-run session ends so Move doesn't get a stuck note. */
    if (S.moveCoRunDrumHeld >= 0 && typeof move_midi_inject_to_move === 'function') {
        move_midi_inject_to_move([0x08, 0x80, S.moveCoRunDrumHeld, 0]);  /* plain pad off */
    }
    S.moveCoRunDrumHeld = -1;
    /* Modifier-key release CCs the user pressed inside Move firmware never
     * reach us during co-run — clear defensively so a stuck Shift/Mute/etc.
     * can't silence pad dispatch on return. Mirrors resume-from-suspend. */
    S.shiftHeld = false; S.deleteHeld = false; S.muteHeld = false;
    S.copyHeld  = false; S.loopHeld  = false; S.loopJogActive = false;
    S.captureHeld = false; S.shiftTrackLEDActive = false;
    /* Move firmware may have rewritten palette scratch entries (knob rings,
     * Shift/Back, etc.) while we were ceded. Reapply our palette before
     * invalidating the LED cache so forceRedraw below repaints with the
     * right colors, not stale ones left by Move firmware. */
    reapplyPalette();
    invalidateLEDCache();
    /* Force the knob-ring LEDs (CC 71-78) to repaint over Move's native colors on
     * the next draw. invalidateLEDCache clears the JS LED cache, but reapplyPalette
     * leaves the hardware buttonCache stale so the normal (non-forced)
     * cachedSetButtonLED knob writes get dropped — Move's knob colors then persist
     * until the user happens to change a knob value. One-shot force in updateTrackLEDs
     * (mirrors the force=true the track-button reclaim already uses). */
    S._forceKnobReemit = true;
    forceRedraw();
}

function restoreUiSidecar(applyDefaultsNow) {
    return restoreUiSidecarImpl(S, createClipStateSyncDeps(), applyDefaultsNow);
}

function syncClipsFromDsp() {
    return syncClipsFromDspImpl(S, createClipStateSyncDeps());
}

/* Targeted re-sync after undo/redo: re-read only the affected clips rather than all 64.
 * infoStr format: "d t c" (drum) or "m t0 c0 t1 c1 ..." (melodic, 1-16 pairs).
 * Falls back to full syncClipsFromDsp() if infoStr is missing or unparseable. */
function syncClipsTargeted(infoStr) {
    return syncClipsTargetedImpl(S, createClipStateSyncDeps(), infoStr);
}

function syncMuteSoloFromDsp() {
    return syncMuteSoloFromDspImpl(S, createClipStateSyncDeps());
}

/* --- DIAGNOSTIC (2026-05-23 crash investigation) ---------------------------
 * QuickJS swallows unhandled exceptions thrown inside entry-point callbacks:
 * the module silently stops (presents as a hang/freeze; orphaned audio thread
 * then spins → RT throttle). Wrap the top-level entry points so the NEXT
 * failure writes its error to a file we can pull over ssh instead of vanishing.
 * Deduped by (where|message) → a persistent error writes once (no I/O storm).
 * Errors are swallowed so the module survives. REMOVE once the crash is pinned. */
let _jsErrSeen = {};
let _jsErrBuf = '';
function captureError(where, e) {
    try {
        const msg = (e && e.message) ? e.message : String(e);
        const key = where + '|' + msg;
        if (_jsErrSeen[key]) return;
        _jsErrSeen[key] = 1;
        const stack = (e && e.stack) ? ('\n' + e.stack) : '';
        _jsErrBuf += '[tick=' + (S.tickCount | 0)
                   + ' sv=' + (S.sessionView ? 1 : 0)
                   + ' loop=' + (S.loopHeld ? 1 : 0)
                   + ' lock=' + (S.perfViewLocked ? 1 : 0)
                   + ' susp=' + (S.pendingSuspendSave ? 1 : 0)
                   + '] ' + where + ': ' + msg + stack + '\n\n';
        if (typeof host_write_file === 'function')
            host_write_file('/data/UserData/schwung/seq8-jserr.log', _jsErrBuf);
    } catch (_e) { /* the logger must never throw */ }
}

globalThis.init = function () {
    installConsoleOverride('SEQ8');
    /* Emulator / headless-test hook: expose the live UI state object so the
     * browser emulator + vitest harness can assert UI-mode behaviour (active
     * track / bank / clip, view toggles) that has no DSP get_param read-back.
     * Read-only inspection; a harmless extra global on device. */
    if (typeof globalThis !== 'undefined') globalThis.overtureUiState = S;
    /* Clear any lingering co-run flag from a prior session — shim's SHM
     * may still hold target/id if we were warm-restarted (Shift+Back +
     * relaunch does not reset shadow_control). */
    S.schwungCoRunSlot = -1;
    S.moveCoRunTrack = -1;
    if (typeof shadow_corun_end === 'function') shadow_corun_end();
    if (S.bankParams === null)
        S.bankParams = Array.from({length: NUM_TRACKS}, function() {
            return BANKS.map(function(bank) { return bank.knobs.map(function(k) { return k.def; }); });
        });

    const p = (typeof host_module_get_param === 'function')
        ? host_module_get_param('playing') : null;
    const dspSurvived = (p !== null && p !== undefined);

    console.log('SEQ8 init: ' + (p === '1' ? 'RESUMED playing' : 'FRESH/stopped'));

    /* Detect set mismatch: compare active_set.txt UUID with what the DSP currently has loaded.
     * Works regardless of JS context lifetime — no cross-init state needed.
     * If they differ, DSP has old set's data: save it, then load the active set. */
    {
        const _as = readActiveSet();
        S.currentSetUuid = _as.uuid;
        S.currentSetName = _as.name;
    }
    /* Inherit-picker decision tree for a freshly-pasted Move duplicate.
     * 'auto'   — single family candidate, silently inherited; force pendingSetLoad.
     * 'picker' — multiple candidates; dialog open, state_load is deferred.
     * 'blank'  — no candidates; fall through to normal mismatch/exists checks.
     * Force pendingSetLoad on success: create_instance already called
     * seq8_load_state with the (then-empty) duplicate path; DSP needs to
     * reload from the now-seeded file. */
    const inheritResult = maybeShowInheritPicker(S.currentSetUuid, S.currentSetName);
    const currentDspNonce = (typeof host_module_get_param === 'function')
        ? host_module_get_param('instance_id') : null;
    const dspUuid = (typeof host_module_get_param === 'function')
        ? (host_module_get_param('state_uuid') || '') : '';
    if (currentDspNonce) S.lastDspInstanceId = currentDspNonce;
    /* Check if DSP flagged a state version mismatch during create_instance.
     * If so, show the confirm dialog and suppress any pendingSetLoad — the
     * dialog's "Yes" handler will trigger state_load after the user confirms. */
    const _svMismatch = (typeof host_module_get_param === 'function')
        ? host_module_get_param('state_version_mismatch') : null;
    if (_svMismatch && parseInt(_svMismatch, 10) === 1) {
        S.confirmStateWipe = true;
        S.confirmStateWipeSel = 1;
        S.pendingSetLoad = false;
        S.screenDirty = true;
    } else if (inheritResult === 'auto') {
        S.pendingSetLoad = true;
    } else if (inheritResult === 'picker') {
        /* state_load deferred until resolveInheritPicker fires */
    } else if (S.currentSetUuid && dspUuid !== S.currentSetUuid) {
        S.pendingSetLoad = true;
    } else if (S.currentSetUuid && typeof host_file_exists === 'function') {
        const sp = '/data/UserData/schwung/set_state/' + S.currentSetUuid + '/seq8-state.json';
        if (!host_file_exists(sp)) S.pendingSetLoad = true;
    }
    /* Schedule orphan prune for the next quiet tick (after state_load settles). */
    S.pendingPruneOrphans = true;

    if (typeof host_module_get_param === 'function') {
        S.playing = dspSurvived;

        for (let t = 0; t < NUM_TRACKS; t++) {
            const ac = host_module_get_param('t' + t + '_active_clip');
            if (ac !== null && ac !== undefined) S.trackActiveClip[t] = parseInt(ac, 10) | 0;
            const cs = host_module_get_param('t' + t + '_current_step');
            const csVal = (cs !== null && cs !== undefined) ? (parseInt(cs, 10) | 0) : -1;
            S.trackCurrentStep[t] = csVal;
            S.trackCurrentPage[t] = csVal >= 0 ? Math.floor(csVal / 16) : 0;
            const qc = host_module_get_param('t' + t + '_queued_clip');
            S.trackQueuedClip[t] = (qc !== null && qc !== undefined) ? (parseInt(qc, 10) | 0) : -1;
        }

        syncClipsFromDsp();
        syncMuteSoloFromDsp();
    }

    extHeldNotes.clear();

    if (!S.hasInitedOnce) { S.sessionView = true; S.hasInitedOnce = true; }

    /* Restore UI state (active track, clip focus, view) from sidecar.
     * Deferred if pendingSetLoad: DSP hasn't loaded the new set yet, restoreUiSidecar
     * will be called again from the pendingDspSync completion path after the full resync. */
    restoreUiSidecar(!S.pendingSetLoad);

    /* PHASE-1: capability gate for DSP-owned input. On patched Schwung the
     * shim delivers pad MIDI to overtake DSP's on_midi on the audio thread,
     * removing the slow-brain JS hop. We detect via shadow_inbound_pad_midi_active
     * (added in legsmechanical/schwung phase-1-inbound). When active, we suppress
     * queueLiveNoteOn/Off in liveSendNote AND push tN_padmap to DSP — which
     * doubles as the DSP-side capability signal (its padmap handler sets
     * inst->dsp_inbound_enabled). The push happens on every computePadNoteMap
     * recompute, so it survives DSP instance recreate (state_load path).
     * Stock Schwung: function undefined, flag stays false, padmap never pushed,
     * existing JS path keeps working. Remove the gate when patches upstreamed. */
    S.dspInboundEnabled = (typeof shadow_inbound_pad_midi_active === 'function');

    /* PHASE-2: capability gate for shim-side async ROUTE_EXTERNAL send.
     * On patched Schwung (legsmechanical/schwung phase-2-ext-worker) the
     * shim runs a low-priority worker thread that drains a 64-packet SPSC
     * ring fed by g_host->midi_send_external — pulls the SPI ioctl off the
     * audio thread, removing the JS-tick floor on ROUTE_EXTERNAL latency.
     * When the sentinel is present we (a) skip the JS ext_queue drain in
     * tick(), and (b) tell DSP to call midi_send_external directly via the
     * 33rd token in the tN_padmap payload (see computePadNoteMap).
     * Stock Schwung: function undefined, flag stays false, DSP keeps
     * pushing to ext_queue and JS drains it as before.
     * Remove when patches upstreamed. */
    S.extSendAsyncEnabled = (typeof shadow_overtake_send_external_async_active === 'function');

    computePadNoteMap();

    /* Apply cable-2 channel remap for the current active track immediately
     * (tick() change-detect also covers this, but fires one tick later). */
    S._lastRemapTrack = -1;
    applyExtMidiRemap();

    S.ledInitComplete = false;
    invalidateLEDCache();
    S.ledInitQueue    = buildLedInitQueue();
    S.ledInitIndex    = 0;

    installFlagsWrap();

    S._origClearScreen = clear_screen;
    S._wasSuspended    = false;
};

globalThis.tick = function () { try { _tickImpl(); } catch (e) { captureError('tick', e); } };
function _tickImpl() {
    S.tickCount++;
    if (S.bootSplashTicks > 0) S.bootSplashTicks--;

    /* Ableton .ablbundle export runs here (tick context) so get_param('bpm')
     * resolves — it returns null on the on_midi path where the menu action
     * fires. host_system_cmd blocks for the python packager; transport is
     * stopped (guarded in exportSession) so the brief tick stall is benign. */
    pollPendingExport();

    runPendingTrackConvert(S, { convertTrackType });

    /* Recompute must stay BEFORE runDefaultSetParamDrain — its queue-empty gate
     * avoids same-track set_param interference with a drained tN_* push. */
    runPendingPadNoteMapRecompute(S, { computePadNoteMap });

    /* PHASE-1: edge-detect modal pad-dispatch mute changes that aren't
     * caught by explicit hooks (dialogs, ARP-step-edit, knob-touch state).
     * Cheap check — boolean compare. Tick is ~10.6 ms, more than fast
     * enough for non-button-CC modal transitions (dialog open / knob touch). */
    /* Self-heal: every 5 ticks (~50ms), read back DSP's pad_dispatch_muted
     * and pad_note_map_0 via get_param and re-push the padmap if either
     * diverges from JS truth. */
    runPadMapSelfHealTask(S, {
        PAD_MODE_DRUM,
        host_module_get_param: (typeof host_module_get_param === 'function') ? host_module_get_param : null,
        padDispatchMuted: _padDispatchMutedNow,
        computePadNoteMap
    });

    runExtMidiRemapReapply(S, { applyExtMidiRemap });

    runSessionViewEdgeTasks(S, {
        host_module_set_param: (typeof host_module_set_param === 'function') ? host_module_set_param : null,
        computePadNoteMap
    });

    /* isSuspended is the one cross-block tick local — threaded to the terminal
     * drawUI gate at the bottom of the orchestrator. */
    const isSuspended = runSuspendDetection(S, {
        clearScreen: clear_screen,
        saveState,
        removeFlagsWrap,
        host_ext_midi_remap_enable: (typeof host_ext_midi_remap_enable === 'function') ? host_ext_midi_remap_enable : null,
        installFlagsWrap,
        applyExtMidiRemap,
        readActiveSet,
        host_module_get_param: (typeof host_module_get_param === 'function') ? host_module_get_param : null,
        maybeShowInheritPicker,
        invalidateLEDCache,
        buildLedInitQueue,
        forceRedraw
    });

    runMetroNoteOffTask(S, {
        move_midi_inject_to_move: (typeof move_midi_inject_to_move === 'function') ? move_midi_inject_to_move : null
    });

    /* Flush live note batches; one set_param per track so no coalescing.
     * Defer for 1 tick after any step button event so the step set_param clears its audio
     * block before live_notes fires — otherwise live_notes can overwrite step toggles.
     *
     * Collision-aware ordering: a pitch with both an off and an on in this drain
     * emits its events in arrival order so a same-tick press+release (on then off)
     * doesn't get inverted into off→on. DSP's pfx_note_off_imm is a silent no-op
     * on inactive notes, so an inverted off→on activates the note and never gets
     * a follow-up off — the note hangs on Move. Pitches with only offs or only
     * ons keep the legacy offs-first sort, which still protects release-before-
     * retrigger semantics across different pitches. */
    runLiveNoteDrain(S, {
        NUM_TRACKS,
        host_module_set_param: (typeof host_module_set_param === 'function') ? host_module_set_param : null,
        pendingLiveNotes
    });

    runDeferredDrumNoteOffDrain({
        NUM_TRACKS,
        pendingDrumNoteOffs,
        liveSendNote
    });

    /* Drain ROUTE_EXTERNAL queue: DSP enqueues sequenced notes; JS sends via USB-A.
     * PHASE-2: skipped on patched Schwung — DSP calls g_host->midi_send_external
     * directly and the shim's ovext_worker thread drains its own ring off the
     * audio thread, so ext_queue stays empty. Remove the gate (and the whole
     * block) when patches upstreamed. */
    runExternalRouteQueueDrain(S, {
        host_module_get_param: (typeof host_module_get_param === 'function') ? host_module_get_param : null,
        move_midi_external_send: (typeof move_midi_external_send === 'function') ? move_midi_external_send : null
    });

    runDeferredCcBitsRefresh(S, {
        host_module_get_param: (typeof host_module_get_param === 'function') ? host_module_get_param : null,
        invalidateLEDCache
    });

    runCcLiveValPoll(S, { host_module_get_param });

    runSchLabelFetch(S, {
        shadow_get_param: (typeof shadow_get_param === 'function') ? shadow_get_param : null,
        schSlotForTrack
    });

    runCcGradientPalette(S, {
        PAD_MODE_DRUM, CC_GRADIENT_LEVELS, CC_GRADIENT_SCALARS, CC_GRADIENT_BASE,
        MovePlay, MoveRec, MoveSample, Green, Red, LED_OFF,
        setPaletteEntryRGB, reapplyPalette, setButtonLED, invalidateLEDCache
    });

    /* Phase 1 / Bundle 2C-Rpt1: pendingRepeatLane queue removed. Lane swap
     * while holding a rate pad is now fired immediately on press from the
     * lane-pad branch in _onPadPress (different set_param key from the
     * other lane-pad pushes — no coalescing). */

    /* Must stay BEFORE runDefaultSetParamDrain (gates on !pendingSetLoad) and
     * runDspMirrorResyncTasks (decrements the pendingDspSync=5 set here). */
    runPendingSetLoad(S, {
        host_module_set_param: (typeof host_module_set_param === 'function') ? host_module_set_param : null,
        disarmRecord
    });

    runDefaultSetParamDrain(S, {
        host_module_set_param: (typeof host_module_set_param === 'function') ? host_module_set_param : null
    });

    runDspMirrorResyncTasks(S, {
        host_module_get_param: (typeof host_module_get_param === 'function') ? host_module_get_param : null,
        host_module_set_param: (typeof host_module_set_param === 'function') ? host_module_set_param : null,
        pollDSP,
        syncClipsFromDsp,
        syncMuteSoloFromDsp,
        restoreUiSidecar,
        computePadNoteMap,
        invalidateLEDCache,
        forceRedraw
    });

    runMoveCoRunTickTasks(S, {
        move_midi_inject_to_move: (typeof move_midi_inject_to_move === 'function') ? move_midi_inject_to_move : null
    });

    runPendingUndoSyncTask(S, {
        host_module_get_param,
        host_module_set_param,
        syncClipsTargeted,
        clearRecordingNoteBuffers: function () {
            _recordingNoteTrack.clear();
            S._recNoteOns.length   = 0;
            S._recNoteOffs.length  = 0;
            _drumRecNoteOns.length  = 0;
            _drumRecNoteOffs.length = 0;
        },
        invalidateLEDCache,
        forceRedraw
    });

    runDeferredLaneEditReadbackTasks(S, {
        host_module_get_param,
        showActionPopup
    });

    runDeferredContentResyncTasks(S, {
        NUM_TRACKS,
        NUM_STEPS,
        PAD_MODE_DRUM,
        TPS_VALUES,
        host_module_get_param,
        syncDrumClipContent,
        syncDrumLanesMeta,
        syncDrumLaneSteps,
        refreshDrumLaneBankParams,
        refreshPerClipBankParams,
        clipHasContent,
        forceRedraw
    });

    /* pendingClearLength drain removed (Group B): Clip Clear now preserves
     * length and loop window so the deferred length=16 reset is no longer
     * needed. The pendingClearLengthTrack/Clip fields are kept in ui_state
     * defaults (-1) but no setter remains. */

    runRepeatRecordingLaneRefreshTask(S, {
        PAD_MODE_DRUM,
        syncDrumLaneSteps,
        forceRedraw
    });

    runGlobalMenuParamPreview(S);

    runTransposePreviewSelfHeal(S, { xposeCancelPreview });


    if (!S.ledInitComplete) {
        drainLedInit();
    } else {
        runOverlayTimerExpiries(S, {
            BANK_DISPLAY_TICKS, KNOB_TURN_HIGHLIGHT_TICKS, PARAM_PEEK_DETAIL_TICKS
        });

        runSessionStepHoldToSave(S, {
            STEP_SAVE_HOLD_TICKS, NUM_TRACKS, DRUM_LANES, STEP_SAVE_FLASH_TICKS,
            host_module_set_param: (typeof host_module_set_param === 'function') ? host_module_set_param : null,
            showActionPopup, forceRedraw
        });

        if ((S.tickCount % POLL_INTERVAL) === 0) { pollDSP(); S.screenDirty = true; }

        /* Schwung co-run: refresh the channel-matched slot bitmask for the
         * side-button blink (shadow_get_slots is a cheap shared-memory read;
         * gate to the poll cadence to match the LED force cadence). */
        if (S.schwungCoRunSlot >= 0 && (S.tickCount % POLL_INTERVAL) === 0) {
            refreshSchwungCoRunSlotMask(S.activeTrack);
        }

        runPendingEditSoundAdvance(S, {
            advancePendingEditSoundEntry, enterMoveNativeCoRun, enterSchwungCoRun
        });

        runMetroBeatDetect(S, { host_module_get_param, playMetronomeClick });

        runSideButtonHoldThreshold(S, { STEP_HOLD_TICKS, forceRedraw });

        /* Step hold threshold: once elapsed, close the tap window so release won't toggle.
         * Also auto-assign empty step now so knobs work immediately in step edit. */
        handleTrackViewStepHoldThreshold(S, createTrackViewStepWorkflowDeps());

        handleTrackViewChordFirstStepTick(S, createTrackViewStepWorkflowDeps());

        runSceneCacheRefresh(S, { sceneAllPlaying, sceneAllQueued, sceneAnyPlaying });

        runTransportButtonLEDs(S, {
            setButtonLED, flashAtRate, host_module_get_param, POLL_INTERVAL,
            Green, LED_OFF, Red, DarkGrey, White, VividYellow, TRACK_COLORS,
            MovePlay, MoveRec, MoveSample, MoveLoop, MoveCapture, MoveMute,
            MoveShift, MoveNoteSession, MoveUndo, MoveDelete, MoveCopy,
            MoveUp, MoveDown, MoveLeft, MoveRight
        });

        runViewLEDsAndBlinks(S, {
            updateSessionLEDs, updatePerfModeLEDs, updateSceneMapLEDs,
            updateStepLEDs, updateTrackLEDs, setLED,
            PAD_MODE_DRUM, White, LED_OFF
        });
    }
    runRecordingEventFlush(S, {
        host_module_set_param: (typeof host_module_set_param === 'function') ? host_module_set_param : null,
        host_module_get_param,
        drumRecNoteOns: _drumRecNoteOns,
        drumRecNoteOffs: _drumRecNoteOffs,
        PAD_MODE_DRUM,
        disarmRecord,
        invalidateLEDCache,
        forceRedraw
    });

    runEndOfTickPersistenceTasks(S, {
        host_module_set_param: (typeof host_module_set_param === 'function') ? host_module_set_param : null,
        host_exit_module: (typeof host_exit_module === 'function') ? host_exit_module : null,
        host_hide_module: (typeof host_hide_module === 'function') ? host_hide_module : null,
        updateNameIndex,
        removeFlagsWrap,
        invalidateLEDCache,
        clearAllLEDs,
        setButtonLED,
        commitSnapshot,
        LED_OFF
    });

    runOrphanPrune(S, {
        host_module_set_param: (typeof host_module_set_param === 'function') ? host_module_set_param : null,
        host_file_exists: (typeof host_file_exists === 'function') ? host_file_exists : null,
        loadNameIndex,
        uuidToStatePath,
        saveNameIndex
    });

    runAltModeFlash(S, { altIndicatorActive });

    if (S.screenDirty && !isSuspended) { S.screenDirty = false; drawUI(); }

};

/* ------------------------------------------------------------------ */
/* MIDI input                                                           */
/* ------------------------------------------------------------------ */

function _onCC_jog(d1, d2) {
    if (S.shiftTrackLEDActive) { S.shiftTrackLEDActive = false; S.screenDirty = true; }
    /* Jog wheel: physical CLICK (CC 3 = 127) + relative ROTATE (CC 14). The
     * click/rotate dispatch ladder is extracted into ui_jog_cc_workflow.mjs;
     * each handler returns true when it consumes the event (mirrors the
     * original `return;`). Order matches the original click ladder (LGTO before
     * STATE-WIPE / REC-BLOCKED — those dialogs are mutually exclusive). The
     * Arp-Steps interval overlay EXITS on rotate first / TOGGLES on click last,
     * so it is split across two dispatch slots. */
    const deps = createJogCcWorkflowDeps();
    if (handleUiJogStepIntervalExit(S, deps, d1, d2)) return;
    if (handleUiJogInheritPicker(S, deps, d1, d2)) return;
    if (handleUiJogSnapshotPicker(S, deps, d1, d2)) return;
    if (handleUiJogClearAutoMenu(S, deps, d1, d2)) return;
    if (handleUiJogBakeScene(S, deps, d1, d2)) return;
    if (handleUiJogConfirmLgto(S, deps, d1, d2)) return;
    if (handleUiJogStateWipe(S, deps, d1, d2)) return;
    if (handleUiJogRecordBlocked(S, deps, d1, d2)) return;
    if (handleUiJogBakeConfirm(S, deps, d1, d2)) return;
    if (handleUiJogTapTempo(S, deps, d1, d2)) return;
    if (handleUiJogGlobalMenu(S, deps, d1, d2)) return;
    if (handleUiJogShiftDeleteReset(S, deps, d1, d2)) return;
    if (handleUiJogDeleteReset(S, deps, d1, d2)) return;
    if (handleUiJogStepIntervalToggle(S, deps, d1, d2)) return;
    if (handleUiJogAltToggle(S, deps, d1, d2)) return;
    if (handleUiJogMovement(S, deps, d1, d2)) return;
}

function _onCC_buttons(d1, d2) {
    handleUiShiftButton(S, createButtonCcWorkflowDeps(), d1, d2);

    /* Any non-Shift CC button press while Shift overlay is active clears the overlay */
    if (d1 !== MoveShift && d2 === 127 && S.shiftTrackLEDActive) {
        S.shiftTrackLEDActive = false;
    }

    if (handleUiDeleteButton(S, createButtonCcWorkflowDeps(), d1, d2)) return;

    /* Copy: modifier-state tracking (held + copy source). */
    handleUiCopyButton(S, createButtonCcWorkflowDeps(), d1, d2);

    /* Mute: modifier-state tracking. The action half lives in handleUiMuteButton
     * on the transport handler; both fire for the same CC. */
    handleUiMuteModifierButton(S, createButtonCcWorkflowDeps(), d1, d2);

    /* Capture: press tracks held + cancels dialogs/pickers/merge; bare-tap
     * release opens the scene-bake picker (Session) or clip-bake confirm (Track). */
    handleUiCaptureButton(S, createButtonCcWorkflowDeps(), d1, d2);
    if (d1 === MoveCapture) return;

    /* Move's Menu button (CC 50) is in CORUN_KEEP_DEFAULT so the shim routes
     * it to us during co-run. Charles's framework reserves Back as the
     * canonical exit, but Menu-as-second-exit is a Overture convenience for
     * existing muscle memory — outside co-run Overture ignores Menu (no other
     * handler exists), so this branch is dormant unless a session is active. */
    if (handleUiMenuCoRunExitButton(S, createButtonCcWorkflowDeps(), d1, d2)) return;

    /* Note/Session view toggle: Shift+press = open global menu (Track View only);
     * tap = switch view; hold = session overview. Also the universal dialog "out". */
    if (handleUiNoteSessionButton(S, createButtonCcWorkflowDeps(), d1, d2)) return;

    /* Loop button (CC 58, Session View): enter/exit Performance Mode. */
    if (handleUiLoopPerfModeButton(S, createButtonCcWorkflowDeps(), d1, d2)) return;

    /* Loop button (CC 58, Track View): hold + step buttons sets clip length */
    if (handleUiLoopTrackViewButton(S, createButtonCcWorkflowDeps(), d1, d2)) return;

}

function _onCC_transport(d1, d2) {
    /* Back: close the topmost dialog/menu, else Shift+Back suspends+hides. */
    handleUiBackButton(S, createTransportCcWorkflowDeps(), d1, d2);

    /* Undo button: press = undo; Shift+Undo = redo */
    handleUiUndoButton(S, createTransportCcWorkflowDeps(), d1, d2);

    /* Play: toggle transport; Shift+Play = restart transport; Delete+Play = deactivate_all; Mute+Play = toggle metro */
    handleUiPlayButton(S, createTransportCcWorkflowDeps(), d1, d2);

    /* Record button (CC 86): toggle arm/disarm */
    handleUiRecordButton(S, createTransportCcWorkflowDeps(), d1, d2);

    /* Sample press (no modifier): track held state; cancel dialogs/merge immediately on press */
    handleUiSampleButton(S, createTransportCcWorkflowDeps(), d1, d2);

    /* Mute button: Delete+Mute = clear all (both views); toggle mute/solo on active track (Track View only).
     * Press: handle Delete+Mute immediately. Release: toggle mute/solo, but only if Mute was not used as
     * a modifier key (e.g. Mute+Play = metro toggle). */
    handleUiMuteButton(S, createTransportCcWorkflowDeps(), d1, d2);

    /* Left/Right page nav (Track View) + Up/Down scene/zoom/octave nav. */
    handleUiPageNavButton(S, createNavigationCcWorkflowDeps(), d1, d2);
    handleUiSceneNavButton(S, createNavigationCcWorkflowDeps(), d1, d2);

}

function _onCC_side(d1, d2) {
    handleUiSideButton(S, createSideButtonWorkflowDeps(), d1, d2);
}

/* CC-knob acceleration. The Move knobs fire ~2-4 ±1 detent messages per
 * physical click at ~8-35ms apart, so timing can't tell slow from fast. We use
 * a fractional accumulator: each message adds `gain` (1 at the start) to an
 * accumulator and emits whole units of BASE. BASE=3 makes the slow/fine rate
 * ~1 value per 3 messages; `gain` grows only
 * after sustained continuous turning, so big sweeps accelerate. A direction
 * change or a pause (>180ms) resets. Returns a signed integer step (0 if the
 * accumulator hasn't reached a whole unit yet). */
function ccKnobDelta(d2, k) {
    const sign = (d2 >= 1 && d2 <= 63) ? 1 : (d2 >= 65 && d2 <= 127) ? -1 : 0;
    if (!sign) return 0;
    const now = Date.now();
    const gap = now - (S.knobAccelLast[k] || 0);
    S.knobAccelLast[k] = now;
    if (sign !== S.knobAccelDir[k] || gap > 180) { S.knobAccelRun[k] = 0; S.knobAccelAcc[k] = 0; }
    S.knobAccelDir[k] = sign;
    S.knobAccelRun[k]++;
    const run  = S.knobAccelRun[k];
    const gain = run <= 12 ? 1 : run <= 24 ? 2 : run <= 36 ? 4 : 6;
    const BASE = 3;
    S.knobAccelAcc[k] += gain;
    const units = Math.floor(S.knobAccelAcc[k] / BASE);
    if (units === 0) return 0;
    S.knobAccelAcc[k] -= units * BASE;
    return sign * units;
}

function _onCC_stepedit(d1, d2) {
    handleTrackViewStepEditKnob(S, createTrackViewStepWorkflowDeps(), d1, d2);
}

function _onCC_knobs(d1, d2) {
    /* Knob CCs 71-78: apply delta to active bank parameter.
     * Relative encoder: d2 1-63 = CW (+1), d2 64-127 = CCW (-1).
     * pm.sens > 1 = accumulate that many ticks before firing one unit change.
     * pm.lock = true: fire once then block until touch release (S.knobLocked).
     *
     * Dispatch table extracted into ui_knob_cc_workflow.mjs. The shared preamble
     * (overlay-swallow + knobTouched bookkeeping) stays here; each handler
     * returns true when it consumes the CC (mirrors the original `return;`). The
     * drum-CLIP handler falls through for knob 5 (no drum-clip binding) → the
     * generic handler, exactly as before. */
    if (d1 >= 71 && d1 <= 78) {
        if (handleUiKnobOverlaySwallow(S, createKnobCcWorkflowDeps(), d1, d2)) return;
        const knobIdx = d1 - 71;
        S.knobTouched          = knobIdx;
        S.knobTurnedTick[knobIdx] = S.tickCount;
        S.screenDirty = true;
        if (handleUiKnobStepInterval(S, createKnobCcWorkflowDeps(), d1, d2)) return;
        if (handleUiKnobDrumClip(S, createKnobCcWorkflowDeps(), d1, d2)) return;
        if (handleUiKnobDrumAllLanes(S, createKnobCcWorkflowDeps(), d1, d2)) return;
        if (handleUiKnobDrumNoteFX(S, createKnobCcWorkflowDeps(), d1, d2)) return;
        if (handleUiKnobDrumRepeatGroove(S, createKnobCcWorkflowDeps(), d1, d2)) return;
        if (handleUiKnobCcParam(S, createKnobCcWorkflowDeps(), d1, d2)) return;
        if (handleUiKnobAltRandomMode(S, createKnobCcWorkflowDeps(), d1, d2)) return;
        if (handleUiKnobAltDelayClockFb(S, createKnobCcWorkflowDeps(), d1, d2)) return;
        if (handleUiKnobMelodicInQ(S, createKnobCcWorkflowDeps(), d1, d2)) return;
        handleUiKnobGeneric(S, createKnobCcWorkflowDeps(), d1, d2);
        return;
    }
}

function _switchViewCleanup() {
    S.heldStepBtn        = -1;
    S.heldStep           = -1;
    S.heldStepNotes      = [];
    S.stepWasEmpty       = false;
    S.stepWasHeld        = false;
    S.stepBtnPressedTick.fill(-1);
    S.sessionStepHeld    = -1;
    S.sessionStepHeldCtx = 0;
    /* Leaving Session View stops any active loop; mods/latch persist. */
    if (!S.sessionView && (S.perfViewLocked || S.perfStack.length > 0)) {
        const _hadLoop = S.perfStack.length > 0;
        S.perfStack         = [];
        S.perfStickyLengths = new Set();
        S.perfHoldPadHeld   = false;
        S.perfViewLocked    = false;
        S.loopHeld          = false;
        S.loopJogActive     = false;
        S.perfModsHeld      = 0;
        sendPerfMods();
        if (_hadLoop && typeof host_module_set_param === 'function')
            host_module_set_param('looper_stop', '1');
    }
    if (S.sessionView) {
        for (let i = 0; i < 16; i++) setLED(16 + i, LED_OFF);
        for (let t = 0; t < 8; t++) setLED(TRACK_PAD_BASE + t, LED_OFF);
    } else {
        for (let row = 0; row < 4; row++)
            for (let t = 0; t < 8; t++) setLED(92 - row * 8 + t, LED_OFF);
    }
}

function _onCCMsg(d1, d2) {
    handleUiCcMessage({
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
        /* constants */
        padModeDrum: PAD_MODE_DRUM,
        trackPadBase: TRACK_PAD_BASE,
        drumLanes: DRUM_LANES,
        numTracks: NUM_TRACKS,
        banks: BANKS,
        looperRatesStraight: LOOPER_RATES_STRAIGHT,
        perfModPadMap: PERF_MOD_PAD_MAP,
        perfModFullNames: PERF_MOD_FULL_NAMES,
        perfModPopupTicks: PERF_MOD_POPUP_TICKS,
        drumTapTicks: DRUM_TAP_TICKS,
        /* host */
        setParam: typeof host_module_set_param === 'function' ? host_module_set_param : null,
        injectToMove: typeof move_midi_inject_to_move === 'function' ? move_midi_inject_to_move : null,
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
    const deps = createPadWorkflowDeps();
    if (handleUiPadTrackViewDrumLaneReset(S, deps, d1)) return;
    if (handleUiPadTrackViewDrumLaneClear(S, deps, d1)) return;
    if (handleUiPadTrackViewDrumRepeat(S, deps, d1, d2)) return;
    if (handleUiPadTrackViewCaptureDrumLane(S, deps, d1)) return;
    handleUiPadTrackViewDrumOrMelodic(S, deps, d1, d2);
}

function _onPadPress(status, d1, d2) {
        const deps = createPadWorkflowDeps();
        handleUiPadCoRunDrumInject(S, deps, status, d1, d2);
        if (handleUiPadTapTempo(S, deps, d1)) return;
        if (handleUiPadArpStepIntervalSeq(S, deps, d1)) return;
        if (handleUiPadArpStepIntervalTarp(S, deps, d1)) return;
        if (handleUiPadPerfMode(S, deps, d1)) return;
        if (handleSessionViewClipPadPress(S, createSessionViewWorkflowDeps(), d1)) {
            return;
        } else {
            _onPadPressTrackView(status, d1, d2);
        }
}

function _jumpToMenuLabel(label) {
    openGlobalMenu();
    if (!S.globalMenuItems || !S.globalMenuState) return;
    for (let i = 0; i < S.globalMenuItems.length; i++) {
        const it = S.globalMenuItems[i];
        if (it && it.label === label) {
            S.globalMenuState.selectedIndex = i;
            return;
        }
    }
}

function _doShiftStepCommon(idx) {
    if      (idx === 1) _jumpToMenuLabel('Global');
    else if (idx === 2 && !S.sessionView) {
        /* Track View only — Session View Shift+Step3 is reserved for the
         * existing menu-shortcut set. Defer co-run entry until Shift releases
         * — otherwise the held Shift CC leaks into Move firmware / Schwung
         * chain editor (the shim starts forwarding Shift on co-run entry).
         * Dispatch happens in _onCC_buttons Shift-release branch. */
        S.pendingEditEntryTrack = S.activeTrack;
    }
    else if (idx === 4) openTapTempo();
    else if (idx === 5) {
        S.metronomeOn = (S.metronomeOn === 1) ? 3 : 1;
        if (typeof host_module_set_param === 'function')
            host_module_set_param('metro_on', String(S.metronomeOn));
        showActionPopup(['Off', 'Cnt-In', 'Play', 'Always'][S.metronomeOn]);
    }
    else if (idx === 6) _jumpToMenuLabel('Swing Amt');
    else if (idx === 8) _jumpToMenuLabel('Scale');
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
        setParam: typeof host_module_set_param === 'function' ? host_module_set_param : null,
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
        banks: BANKS,
        clearAllMuteSolo,
        closeConvertConfirm,
        closeTapTempo,
        disarmRecord,
        exitSchwungCoRun,
        focusedClipIsEmpty: _focusedClipIsEmpty,
        forceRedraw,
        getParam: typeof host_module_get_param === 'function' ? host_module_get_param : null,
        moveBack: MoveBack,
        movePlay: MovePlay,
        moveMute: MoveMute,
        moveRec: MoveRec,
        moveSample: MoveSample,
        moveUndo: MoveUndo,
        numTracks: NUM_TRACKS,
        padModeDrum: PAD_MODE_DRUM,
        red: Red,
        resolveInheritPicker,
        saveState,
        setButtonLED,
        setParam: typeof host_module_set_param === 'function' ? host_module_set_param : null,
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
        clearAllLEDs,
        closeConvertConfirm,
        closeSnapshotPicker,
        closeTapTempo,
        computePadNoteMap,
        editSoundForTrack,
        effectiveClip,
        exitModule: typeof host_exit_module === 'function' ? host_exit_module : null,
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
            return latchHeldDrumRepeatsOnLoopPress(S, { host_module_set_param }, track);
        },
        loopTapTicks: LOOP_TAP_TICKS,
        moveCapture: MoveCapture,
        moveCopy: MoveCopy,
        moveDelete: MoveDelete,
        moveLoop: MoveLoop,
        moveMenu: 50,
        moveMute: MoveMute,
        moveNoteSession: MoveNoteSession,
        moveShift: MoveShift,
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
        setParam: typeof host_module_set_param === 'function' ? host_module_set_param : null,
        showActionPopup,
        switchViewCleanup: _switchViewCleanup,
        padModeDrum: PAD_MODE_DRUM
    };
}

function createNavigationCcWorkflowDeps() {
    return {
        computePadNoteMap,
        effectiveClip,
        forceRedraw,
        moveDown: MoveDown,
        moveLeft: MoveLeft,
        moveRight: MoveRight,
        moveUp: MoveUp,
        numClips: NUM_CLIPS,
        padModeDrum: PAD_MODE_DRUM,
        queueLiveNoteOff: function (track, pitch) {
            return queueLiveNoteOff(pendingLiveNotes, track, pitch);
        },
        setDrumLanePage,
        setParam: typeof host_module_set_param === 'function' ? host_module_set_param : null,
        syncDrumLanesMeta,
        syncDrumLaneSteps
    };
}

function createLoopGestureWorkflowDeps() {
    return {
        effectiveClip,
        forceRedraw,
        padModeDrum: PAD_MODE_DRUM,
        setParam: typeof host_module_set_param === 'function' ? host_module_set_param : null
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
        getParam: typeof host_module_get_param === 'function' ? host_module_get_param : null,
        invalidateLEDCache,
        noNoteFlashTicks: NO_NOTE_FLASH_TICKS,
        padModeDrum: PAD_MODE_DRUM,
        refreshSeqNotesIfCurrent,
        scaleNudgeNote,
        setParam: typeof host_module_set_param === 'function' ? host_module_set_param : null,
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
        banks: BANKS,
        ccKnobDelta,
        computePadNoteMap,
        editDrumRepeatGrooveStep: function (track, lane, step, dir, editNudge) {
            return editDrumRepeatGrooveStep(S, { host_module_set_param }, track, lane, step, dir, editNudge);
        },
        effectiveClip,
        forceRedraw,
        getParam: typeof host_module_get_param === 'function' ? host_module_get_param : null,
        hasShadowSetParam: typeof shadow_set_param === 'function',
        invalidateLEDCache,
        padModeDrum: PAD_MODE_DRUM,
        refreshPerClipBankParams,
        setParam: typeof host_module_set_param === 'function' ? host_module_set_param : null,
        showActionPopup,
        stepEntryVelocity,
        stretchBlockedTicks: STRETCH_BLOCKED_TICKS,
        tpsValues: TPS_VALUES
    };
}

function createJogCcWorkflowDeps() {
    return {
        moveMainKnob: MoveMainKnob,
        padModeDrum: PAD_MODE_DRUM,
        numTracks: NUM_TRACKS,
        numClips: NUM_CLIPS,
        banks: BANKS,
        decodeDelta,
        setParam: typeof host_module_set_param === 'function' ? host_module_set_param : null,
        exitModule: typeof host_exit_module === 'function' ? host_exit_module : null,
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
        }
    };
}

function _onStepButtons(d1, d2) {
    /* Co-run (Schwung chain-edit or Move-native): the step grid is blanked down
     * to a single exit affordance (the blinking Step 3 button + lit icon).
     * Step 3 (idx 2) exits co-run; every other step press is swallowed so it
     * can't edit the clip hidden underneath. Mirrors the Menu (CC 50) exit. */
    if (S.schwungCoRunSlot >= 0 || S.moveCoRunTrack >= 0) {
        if (d1 - 16 === 2) {
            if (S.moveCoRunTrack >= 0) exitMoveNativeCoRun();
            else { exitSchwungCoRun(); forceRedraw(); }
        }
        return;
    }
    if (S.tapTempoOpen) return;
    if (d2 > 0 && S.shiftTrackLEDActive) { S.shiftTrackLEDActive = false; S.screenDirty = true; }
    S.stepOpTick = S.tickCount;
    const idx = d1 - 16;
    /* Change #1 hold-reveal overlay: while a side button is held, the steps show
     * the held track's 16 clips — a step press selects/launches that clip instead
     * of editing the pattern. Intercept before any other step semantics. */
    if (S.revealClipsTrack >= 0) {
        selectClipOnTrack(S.revealClipsTrack, idx);
        forceRedraw();
        return;
    }
    if (handleSessionViewStepPress(S, createSessionViewWorkflowDeps(), idx)) {
        return;
    } else if (handleLoopStepPress(S, createLoopGestureWorkflowDeps(), idx)) {
        return;
    } else if (handleTrackViewCopyStepPress(S, createTrackViewStepWorkflowDeps(), idx)) {
        return;
    } else if (handleTrackViewDeleteStepPress(S, createTrackViewStepWorkflowDeps(), idx)) {
        return;
    } else if (handleTrackViewMuteStepPress(S, createTrackViewStepWorkflowDeps(), idx)) {
        return;
    } else if (handleTrackViewShiftStepPress(S, createTrackViewStepWorkflowDeps(), idx)) {
        return;
    } else if (handleTrackViewDrumStepPress(S, createTrackViewStepWorkflowDeps(), idx)) {
        return;
    } else if (handleTrackViewMelodicStepPress(S, createTrackViewStepWorkflowDeps(), idx)) {
        return;
    }
}

function _onPadRelease(status, d1, d2) {
    const deps = createPadWorkflowDeps();
    if (handleUiPadReleaseTapTempo(S, deps, d1)) return;
    handleUiPadReleaseCoRunDrum(S, deps, d1);
    if (handleUiPadReleaseLoopStep(S, deps, d1)) return;
    if (handleUiPadReleaseSeqArpEditor(S, deps, d1)) return;
    if (handleUiPadReleaseTarpArpEditor(S, deps, d1)) return;
    if (handleUiPadReleasePerfMode(S, deps, d1)) return;
    if (handleUiPadReleaseStepButton(S, deps, d1)) return;
    handleUiPadReleasePadNote(S, deps, d1);
}

globalThis.onMidiMessageInternal = function (data) { try { _onMidiInternalImpl(data); } catch (e) { captureError('onMidiInternal', e); } };
function _onMidiInternalImpl(data) {
    handleUiMidiInternalMessage(S, createMidiInternalWorkflowDeps(), data);
}

function createMidiInternalWorkflowDeps() {
    return {
        closeClearAutoMenu,
        isNoiseMessage,
        moveDelete: MoveDelete,
        moveDown: MoveDown,
        moveMainKnob: MoveMainKnob,
        moveNoteSession: MoveNoteSession,
        moveUp: MoveUp,
        onCc: _onCCMsg,
        onKnobTouch: _onKnobTouch,
        onPadAftertouch: _onPadAftertouch,
        onPadPress: _onPadPress,
        onPadRelease: _onPadRelease,
        onStepButtons: _onStepButtons,
        trackPadBase: TRACK_PAD_BASE
    };
}

function _onKnobTouch(status, d1, d2) {
    /* Knob touch (notes 0-7). MoveKnob1-8Touch = notes 0-7.
     * Hardware: d2=127 = touch on; d2 in 0-63 (via 0x90 or 0x80) = touch off.
     * Note 9 (jog touch): shows bank overview while held, locked out in global menu. */
    if (d1 >= 0 && d1 <= 9) {
        if ((status & 0xF0) === 0x90) {
            if (d2 === 127) {
                if (d1 <= 7 && S.activeBank >= 0) {
                    S.knobTouched = d1; S.knobTouchStartTick = S.tickCount;
                    S.knobTurnedTick[d1] = -1; S.screenDirty = true;
                    /* CC bank: touching a knob makes it the active lane (persistent
                     * — drives the step-LED gradient and highlighted overview cell). */
                    if (S.activeBank === 6 && S.trackPadMode[S.activeTrack] !== PAD_MODE_DRUM) {
                        S.ccActiveLane[S.activeTrack] = d1;
                        invalidateLEDCache();
                    }
                    /* Perf view: touch knob k toggles looper for track k */
                    if (S.perfViewLocked) {
                        const _lt = d1;
                        const _newLooper = S.trackLooper[_lt] !== 0 ? 0 : 1;
                        S.trackLooper[_lt] = _newLooper;
                        applyTrackConfig(_lt, 'track_looper', _newLooper);
                        showActionPopup('LOOPER ' + (_newLooper ? 'ON' : 'OFF'), 'TRACK ' + (_lt + 1));
                        setButtonLED(71 + _lt, _newLooper ? TRACK_COLORS[_lt] : LED_OFF, true);
                    }
                    /* CC bank: Delete+touch clears this knob's automation + resting value → "—" */
                    if (S.activeBank === 6 && S.deleteHeld && !S.shiftHeld &&
                            S.trackPadMode[S.activeTrack] !== PAD_MODE_DRUM) {
                        const _dt = S.activeTrack, _dac = effectiveClip(_dt);
                        S.trackCCAutoBits[_dt][_dac] &= ~(1 << d1);
                        S.trackCCLiveVal[_dt][d1] = -1;
                        S.clipCCVal[_dt][_dac][d1] = -1;
                        if (typeof host_module_set_param === 'function')
                            host_module_set_param('t' + _dt + '_cc_auto_clear_k', _dac + ' ' + d1);
                        showActionPopup('CC', 'CLEAR');
                        invalidateLEDCache();
                    }
                    /* CC bank: touch-record — start overwriting automation while held.
                     * Initial value = current live/output value, else clip rest, else 0. */
                    if (S.activeBank === 6 && !S.deleteHeld && !S.sessionView &&
                            S.recordArmed && !S.recordCountingIn &&
                            S.trackPadMode[S.activeTrack] !== PAD_MODE_DRUM) {
                        const _dac = effectiveClip(S.activeTrack);
                        const _lv  = S.trackCCLiveVal[S.activeTrack][d1];
                        const _rv  = S.clipCCVal[S.activeTrack][_dac][d1];
                        const _tv  = _lv >= 0 ? _lv : (_rv >= 0 ? _rv : 0);
                        host_module_set_param('t' + S.activeTrack + '_cc_touch',
                            d1 + ' 1 ' + _tv);
                        S.trackCCAutoBits[S.activeTrack][_dac] |= (1 << d1);
                    }
                    /* SEQ ARP K5 / TRACK ARP K5 touch: switch pads to vel-slider editor immediately. */
                    if ((S.activeBank === 4 && d1 === 4) || (S.activeBank === 5 && d1 === 4)) forceRedraw();
                }
                if (d1 === MoveMainTouch && !S.globalMenuOpen && !S.shiftHeld) { S.jogTouched = true; forceRedraw(); }
            } else if (d2 < 64) {
                if (d1 <= 7) {
                    if (S.activeBank >= 0 && BANKS[S.activeBank].knobs[d1]) {
                        const relPm = BANKS[S.activeBank].knobs[d1];
                        if (relPm.dspKey === 'nudge') {
                            S.bankParams[S.activeTrack][S.activeBank][d1] = 0;
                            if (typeof host_module_set_param === 'function') {
                                const _isAllLanesNdg = S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM && S.activeBank === 7;
                                const _isDrumNdg = S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM && S.activeBank === 0;
                                if (_isAllLanesNdg)
                                    host_module_set_param('t' + S.activeTrack + '_all_lanes_nudge', '0');
                                else if (_isDrumNdg)
                                    host_module_set_param('t' + S.activeTrack + '_l' + S.activeDrumLane[S.activeTrack] + '_nudge', '0');
                                else
                                    host_module_set_param('t' + S.activeTrack + '_nudge', '0');
                            }
                        } else if (relPm.dspKey === 'clock_shift' || relPm.dspKey === 'beat_stretch') {
                            S.clockShiftTouchDelta = 0;
                            S.bankParams[S.activeTrack][S.activeBank][d1] = 0;
                            /* Shft knob doubles as Nudge under Shift held — reset DSP nudge
                             * accumulator on release in case the user finished a Shift+turn. */
                            if (relPm.dspKey === 'clock_shift' &&
                                    typeof host_module_set_param === 'function') {
                                const _isAllLanes = S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM && S.activeBank === 7;
                                const _isDrum     = S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM && S.activeBank === 0;
                                if (_isAllLanes)
                                    host_module_set_param('t' + S.activeTrack + '_all_lanes_nudge', '0');
                                else if (_isDrum)
                                    host_module_set_param('t' + S.activeTrack + '_l' + S.activeDrumLane[S.activeTrack] + '_nudge', '0');
                                else
                                    host_module_set_param('t' + S.activeTrack + '_nudge', '0');
                            }
                        }
                        /* ALL LANES: schedule display reset to '--' after ~500ms on touch release */
                        if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM && S.activeBank === 7) {
                            if (d1 === 0) { S.allLanesResResetTick = S.tickCount + 47; S.allLanesResResetTrack = S.activeTrack; }
                            if (d1 === 3) { S.allLanesQntResetTick = S.tickCount + 47; S.allLanesQntResetTrack = S.activeTrack; }
                            if (d1 === 6) { S.allLanesDirResetTick = S.tickCount + 47; S.allLanesDirResetTrack = S.activeTrack; }
                        }
                    }
                    /* CC bank: touch-record — stop overwriting automation on release */
                    if (S.activeBank === 6 && S.recordArmed && !S.recordCountingIn &&
                            S.trackPadMode[S.activeTrack] !== PAD_MODE_DRUM)
                        host_module_set_param('t' + S.activeTrack + '_cc_touch', d1 + ' 0 0');
                    /* SEQ ARP K5 / TRACK ARP K5 release: refresh pads (vel-slider editor → normal pads). */
                    if ((S.activeBank === 4 && d1 === 4) || (S.activeBank === 5 && d1 === 4)) forceRedraw();
                    S.knobTouched = -1;
                    S.knobTouchStartTick = -1;
                    S.knobLocked[d1] = false;
                    S.knobAccum[d1]  = 0;
                    S.screenDirty = true;
                }
                if (d1 === MoveMainTouch && S.jogTouched) { S.jogTouched = false; S.bankSelectTick = -1; forceRedraw(); }
            }
            return;
        }
        if ((status & 0xF0) === 0x80) {
            if (d1 <= 7) {
                if (S.activeBank >= 0 && BANKS[S.activeBank].knobs[d1]) {
                    const relPm = BANKS[S.activeBank].knobs[d1];
                    if (relPm.dspKey === 'nudge') {
                        S.bankParams[S.activeTrack][S.activeBank][d1] = 0;
                        if (typeof host_module_set_param === 'function') {
                            const _isAllLanesNdg = S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM && S.activeBank === 7;
                            const _isDrumNdg = S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM && S.activeBank === 0;
                            if (_isAllLanesNdg)
                                host_module_set_param('t' + S.activeTrack + '_all_lanes_nudge', '0');
                            else if (_isDrumNdg)
                                host_module_set_param('t' + S.activeTrack + '_l' + S.activeDrumLane[S.activeTrack] + '_nudge', '0');
                            else
                                host_module_set_param('t' + S.activeTrack + '_nudge', '0');
                        }
                    } else if (relPm.dspKey === 'clock_shift' || relPm.dspKey === 'beat_stretch') {
                        S.clockShiftTouchDelta = 0;
                        S.bankParams[S.activeTrack][S.activeBank][d1] = 0;
                    }
                    /* ALL LANES K4 (Qnt): schedule display reset to '--' after ~500ms */
                    if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM && S.activeBank === 7 && d1 === 3) {
                        S.allLanesQntResetTick  = S.tickCount + 47;
                        S.allLanesQntResetTrack = S.activeTrack;
                    }
                }
                if ((S.activeBank === 4 && d1 === 4) || (S.activeBank === 5 && d1 === 4)) forceRedraw();
                S.knobTouched = -1;
                S.knobTouchStartTick = -1;
                S.knobLocked[d1] = false;
                S.knobAccum[d1]  = 0;
                S.screenDirty = true;
            }
            if (d1 === MoveMainTouch && S.jogTouched) { S.jogTouched = false; S.bankSelectTick = -1; forceRedraw(); }
            return;
        }
    }

}

/* Pad pressure (poly aftertouch). On drum tracks: routes continuous pressure to
 * the held drum-repeat pad's velocity (Rpt1) or the held repeat lanes (Rpt2). On
 * melodic tracks: forwards pad pressure as aftertouch to the track output per the
 * track's AftTch mode (Off/Poly/Channel). Called from the top of
 * _onMidiInternalImpl, before isNoiseMessage would drop the 0xA0. */
function _onPadAftertouch(d1, d2) {
    const t      = S.activeTrack;
    const padIdx = d1 - TRACK_PAD_BASE;

    /* Melodic aftertouch send (Phase 1: live). DSP tN_live_at routes via pfx_send
     * for the track's route (Move inject / Schwung internal / External USB). Poly
     * carries the sounded pitch (padPitch[]); Channel is track-wide. Deduped per
     * pad so a steady press doesn't spam the set_param channel. */
    if (S.trackPadMode[t] !== PAD_MODE_DRUM) {
        let mode = S.trackAtMode[t] | 0;
        if (mode === 0) return;                       /* Off — send nothing */
        if (S.trackRoute[t] === 1 && mode === 2) mode = 1;  /* Move = poly only */
        if (padIdx < 0 || padIdx >= 32) return;
        const pitch = padPitch[padIdx];
        if (pitch < 0) return;                        /* no live note on this pad */
        if (S.atLastSent[padIdx] === d2) return;      /* unchanged — skip */
        S.atLastSent[padIdx] = d2;
        if (typeof host_module_set_param === 'function')
            host_module_set_param('t' + t + '_live_at', pitch + ' ' + d2 + ' ' + mode);
        return;
    }

    if (S.trackPadMode[t] === PAD_MODE_DRUM && S.drumPerformMode[t] === 1 &&
            S.drumRepeatHeldPad[t] === padIdx && d2 > 0) {
        handleDrumRepeatPadAftertouch(S, createDrumRepeatWorkflowDeps(), t, padIdx, d2);
    }
    if (S.trackPadMode[t] === PAD_MODE_DRUM && S.drumPerformMode[t] === 2 && d2 > 0) {
        const col2 = padIdx % 8;
        if (col2 < 4) {
            const lane = drumPadToLane(padIdx);
            if (lane >= 0 && S.drumRepeat2HeldLanes[t].has(lane)) {
                handleDrumRepeat2LaneAftertouch(S, createDrumRepeatWorkflowDeps(), t, lane, d2);
            }
        }
    }
}

globalThis.onMidiMessageExternal = function (data) { try { _onMidiExternalImpl(data); } catch (e) { captureError('onMidiExternal', e); } };
function _onMidiExternalImpl(data) {
    const status  = data[0] | 0;
    const d1      = (data[1] ?? 0) | 0;
    const d2      = (data[2] ?? 0) | 0;
    const msgType = status & 0xF0;
    const msgCh   = (status & 0x0F) + 1;  /* 1-indexed */

    /* Route to S.activeTrack in all views — S.activeTrack always reflects last Track View focus */
    const t = S.activeTrack;

    /* ROUTE_MOVE: Move receives external cable-2 MIDI natively in overtake mode.
     * Never inject — injecting causes an echo cascade (Move echoes cable-2 back
     * as cable-2, we re-inject, infinite loop → crash). */
    const routeIsMove = S.trackRoute[t] === 1;

    /* Channel filter. When the cable-2 remap is active for a ROUTE_MOVE track the
     * shim rewrites the channel byte before we see it — messages arrive on
     * trackChannel[t], not their original channel. Filter against the remapped
     * channel so we don't accidentally drop them. */
    if (S.extMidiRemapActive && routeIsMove) {
        if (msgCh !== S.trackChannel[t]) return;
    } else {
        if (S.midiInChannel !== 0 && msgCh !== S.midiInChannel) return;
    }

    /* Drum track: route by pitch to lanes; skip melodic step assignment */
    if (S.trackPadMode[t] === PAD_MODE_DRUM) {
        if (msgType === 0x90 && d2 > 0) {
            const vel = effectiveVelocity(d2);
            S.lastPadVelocity = vel;
            if (!routeIsMove) liveSendNote(t, 0x90, d1, vel);
            const isSeqEcho = routeIsMove && S.seqActiveNotes.has(d1);
            const isRec = !isSeqEcho && S.recordArmed && !S.recordCountingIn && t === S.recordArmedTrack;
            if (isRec) {
                _drumRecNoteOns.push({ track: t, laneNote: d1, vel: vel });
                const recLane = S.drumLaneNote[t].indexOf(d1);
                if (recLane >= 0) {
                    S.pendingDrumLaneResync      = 3;
                    S.pendingDrumLaneResyncTrack = t;
                    S.pendingDrumLaneResyncLane  = recLane;
                }
            }
            extHeldNotes.set(d1, { track: t, recording: isRec });
        } else if (msgType === 0x80 || (msgType === 0x90 && d2 === 0)) {
            const info = extHeldNotes.get(d1);
            const noteTrack = info ? info.track : t;
            if (S.trackRoute[noteTrack] !== 1) liveSendNote(noteTrack, 0x80, d1, 0);
            if (info && info.recording && S.recordArmed && !S.recordCountingIn)
                _drumRecNoteOffs.push({ track: noteTrack, laneNote: d1 });
            extHeldNotes.delete(d1);
        } else if (msgType === 0xB0 || msgType === 0xD0 || msgType === 0xA0 || msgType === 0xE0) {
            if (!routeIsMove) liveSendNote(t, msgType, d1, d2);
        }
        return;
    }

    if (msgType === 0x90 && d2 > 0) {
        const vel = effectiveVelocity(d2);
        S.lastPlayedNote  = d1;
        S.lastPadVelocity = vel;
        if (!routeIsMove) liveSendNote(t, 0x90, d1, vel);
        /* ROUTE_MOVE: sequencer inject echoes come back here on cable-2. Skip recording
         * for pitches the sequencer is already S.playing — those are echoes, not keyboard input.
         * Preserve any existing recording-active entry so the keyboard gate isn't overwritten. */
        const isSeqEcho = routeIsMove && S.seqActiveNotes.has(d1);
        const isRec = !isSeqEcho && S.recordArmed && !S.recordCountingIn && t === S.recordArmedTrack;
        if (isRec) recordNoteOn(d1, vel, t);
        const prevInfo = extHeldNotes.get(d1);
        if (!prevInfo || !prevInfo.recording || !isSeqEcho) {
            extHeldNotes.set(d1, { track: t, recording: isRec });
        }
        if (S.heldStep >= 0 && !S.shiftHeld && !S.sessionView) {
            handleTrackViewMelodicStepNoteAssignment(
                S,
                createTrackViewStepWorkflowDeps(),
                d1,
                vel,
                { replaceAutoAssigned: true }
            );
        }
    } else if (msgType === 0x80 || (msgType === 0x90 && d2 === 0)) {
        const info = extHeldNotes.get(d1);
        const noteTrack = info ? info.track : t;
        if (S.trackRoute[noteTrack] !== 1) liveSendNote(noteTrack, 0x80, d1, 0);
        if (info && info.recording) recordNoteOff(d1);
        extHeldNotes.delete(d1);
    } else if (msgType === 0xB0 || msgType === 0xD0 || msgType === 0xA0 || msgType === 0xE0) {
        if (!routeIsMove) liveSendNote(t, msgType, d1, d2);
    }
};
