import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'vitest';
import { runTickWorkflow } from '@overture-ui/tick/ui_tick_workflow.mjs';

const NUM_TRACKS = 4;
const PAD_MODE_DRUM = 1;
const noop = () => {};

function matrix(rows, cols, value = 0) {
    return Array.from({ length: rows }, () => Array(cols).fill(value));
}

function cube(a, b, c, value = 0) {
    return Array.from({ length: a }, () => matrix(b, c, value));
}

function makeState(overrides = {}) {
    return {
        tickCount: 10,
        bootSplashTicks: 0,
        pendingTrackConvert: null,
        pendingPadNoteMapRecompute: false,
        pendingDefaultSetParams: [],
        clearDrainHold: 0,
        dspInboundEnabled: false,
        lastPushedMuted: false,
        padNoteMap: [0],
        activeTrack: 0,
        trackPadMode: Array(NUM_TRACKS).fill(0),
        trackOctave: Array(NUM_TRACKS).fill(0),
        trackRoute: Array(NUM_TRACKS).fill(0),
        trackChannel: Array(NUM_TRACKS).fill(1),
        trackMuted: Array(NUM_TRACKS).fill(false),
        trackSoloed: Array(NUM_TRACKS).fill(false),
        midiInChannel: 0,
        _lastRemapTrack: 0,
        _lastRemapRoute: 0,
        _lastRemapChannel: 1,
        _lastRemapMidiIn: 0,
        bankParams: Array.from({ length: NUM_TRACKS }, () => matrix(8, 8, 0)),
        sessionView: false,
        _lastSessionView: false,
        _origClearScreen: noop,
        _wasSuspended: false,
        metroNoteOffTick: -1,
        stepOpTick: 0,
        extSendAsyncEnabled: false,
        ccStepEditActive: false,
        heldStep: -1,
        pendingCCBitsRefresh: -1,
        trackCCAutoBits: matrix(NUM_TRACKS, 16, 0),
        clipCCVal: cube(NUM_TRACKS, 16, 8, -1),
        activeBank: 0,
        playing: false,
        schLabelFetchLane: -1,
        trackCCType: matrix(NUM_TRACKS, 8, 0),
        trackCCAssign: matrix(NUM_TRACKS, 8, 0),
        schLabel: matrix(NUM_TRACKS, 8, null),
        ccGradPaletteTrack: 0,
        pendingSetLoad: false,
        pendingInheritPicker: false,
        pendingDspSync: 0,
        stateLoading: false,
        trackCurrentPage: Array(NUM_TRACKS).fill(0),
        trackCurrentStep: Array(NUM_TRACKS).fill(0),
        lastDspInstanceId: '',
        pendingMoveCoRunInject: 0,
        moveCoRunTrack: -1,
        moveCoRunPressQueue: [],
        moveCoRunPressGap: 0,
        pendingUndoSync: 0,
        recordArmed: false,
        recordCountingIn: false,
        recordArmedTrack: -1,
        _recNoteOns: [],
        _recNoteOffs: [],
        pendingAllLanesStretchCheck: -1,
        allLanesQntResetTick: -1,
        allLanesResResetTick: -1,
        allLanesDirResetTick: -1,
        pendingDrumResync: 0,
        pendingDrumLaneResync: 0,
        pendingStepsReread: 0,
        pendingSceneBakeResync: 0,
        activeDrumLane: Array(NUM_TRACKS).fill(0),
        drumRepeatHeldPad: Array(NUM_TRACKS).fill(-1),
        drumRepeatLatched: Array(NUM_TRACKS).fill(false),
        drumRepeat2HeldLanes: Array.from({ length: NUM_TRACKS }, () => new Set()),
        drumRepeat2LatchedLanes: Array.from({ length: NUM_TRACKS }, () => new Set()),
        globalMenuOpen: false,
        globalMenuState: null,
        globalMenuItems: null,
        bpmWasEditing: false,
        xposePrevKey: null,
        confirmXpose: false,
        ledInitComplete: false,
        cachedSceneAllPlaying: Array(16).fill(false),
        cachedSceneAllQueued: Array(16).fill(false),
        cachedSceneAnyPlaying: Array(16).fill(false),
        screenDirty: false,
        pendingSuspendSave: false,
        pendingExitAfterSave: false,
        pendingHideAfterSave: false,
        pendingSnapshotCopy: null,
        pendingPruneOrphans: false,
        nameIndexCache: null,
        pendingScheduledDisarm: false,
        recordScheduledStop: false,
        recordScheduledStopTarget: -1,
        trackActiveClip: Array(NUM_TRACKS).fill(0),
        drumCurrentStep: Array(NUM_TRACKS).fill(0),
        drumLaneLength: Array(NUM_TRACKS).fill(16),
        clipLength: matrix(NUM_TRACKS, 16, 16),
        clipAdaptiveMode: matrix(NUM_TRACKS, 16, false),
        pendingPrerollGate: null,
        pendingPrerollToggleQueue: [],
        pendingPrerollNote: null,
        pendingPrerollNotes: [],
        pendingChordPhase2: null,
        pendingChordToStep: null,
        liveActiveNotes: new Set(),
        clipLoopStart: matrix(NUM_TRACKS, 16, 0),
        drumLaneLoopStart: Array(NUM_TRACKS).fill(0),
        drumLaneTPS: Array(NUM_TRACKS).fill(24),
        clipTPS: matrix(NUM_TRACKS, 16, 24),
        clipSteps: cube(NUM_TRACKS, 16, 256, 0),
        clipNonEmpty: matrix(NUM_TRACKS, 16, false),
        drumLaneSteps: Array.from({ length: NUM_TRACKS }, () =>
            Array.from({ length: 32 }, () => Array(256).fill('0'))),
        drumLaneHasNotes: matrix(NUM_TRACKS, 32, false),
        transportStartTick: 0,
        currentSetUuid: '',
        ...overrides
    };
}

function makeDeps(log, overrides = {}) {
    const pendingLiveNotes = Array.from({ length: NUM_TRACKS }, () => []);
    const pendingDrumNoteOffs = Array.from({ length: NUM_TRACKS }, () => []);
    const getParam = (key) => {
        log.push(['get', key]);
        if (key === 'ext_queue') return '144 60 100';
        if (key.endsWith('_tarp_on') || key.endsWith('_tarp_latch') || key.endsWith('_tarp_fc')) return '0';
        return '';
    };
    return {
        NUM_TRACKS,
        NUM_STEPS: 16,
        DRUM_LANES: 32,
        PAD_MODE_DRUM,
        TPS_VALUES: [12, 24, 48],
        POLL_INTERVAL: 24,
        BANK_DISPLAY_TICKS: 188,
        KNOB_TURN_HIGHLIGHT_TICKS: 20,
        PARAM_PEEK_DETAIL_TICKS: 30,
        STEP_SAVE_HOLD_TICKS: 80,
        STEP_SAVE_FLASH_TICKS: 20,
        STEP_HOLD_TICKS: 30,
        CC_GRADIENT_LEVELS: 6,
        CC_GRADIENT_SCALARS: [1, 0.8, 0.6, 0.45, 0.3, 0.18],
        CC_GRADIENT_BASE: 100,
        MovePlay: 1,
        MoveRec: 2,
        MoveSample: 3,
        MoveLoop: 4,
        MoveCapture: 5,
        MoveMute: 6,
        MoveShift: 7,
        MoveNoteSession: 8,
        MoveUndo: 9,
        MoveDelete: 10,
        MoveCopy: 11,
        MoveUp: 12,
        MoveDown: 13,
        MoveLeft: 14,
        MoveRight: 15,
        Green: 20,
        Red: 21,
        DarkGrey: 22,
        White: 23,
        VividYellow: 24,
        LED_OFF: 0,
        TRACK_COLORS: [30, 31, 32, 33],
        host_module_get_param: getParam,
        host_module_set_param: (key, val) => log.push(['set', key, val]),
        host_ext_midi_remap_enable: (on) => log.push(['remap_enable', on]),
        host_exit_module: () => log.push(['exit']),
        host_hide_module: () => log.push(['hide']),
        host_file_exists: () => true,
        move_midi_inject_to_move: (msg) => log.push(['inject', msg]),
        move_midi_external_send: (msg) => log.push(['external', msg]),
        shadow_get_param: null,
        clearScreen: noop,
        pendingLiveNotes,
        pendingDrumNoteOffs,
        drumRecNoteOns: [],
        drumRecNoteOffs: [],
        pollPendingExport: () => log.push(['task', 'export']),
        convertTrackType: (t, toDrum) => log.push(['convert', t, toDrum]),
        computePadNoteMap: () => log.push(['task', 'padmap']),
        padDispatchMuted: () => false,
        applyExtMidiRemap: () => log.push(['task', 'remap']),
        saveState: () => log.push(['task', 'saveState']),
        removeFlagsWrap: () => log.push(['task', 'removeFlags']),
        installFlagsWrap: () => log.push(['task', 'installFlags']),
        readActiveSet: () => ({}),
        maybeShowInheritPicker: () => null,
        invalidateLEDCache: () => log.push(['task', 'invalidateLED']),
        buildLedInitQueue: () => [],
        forceRedraw: () => log.push(['task', 'forceRedraw']),
        liveSendNote: (t, status, pitch, vel) => log.push(['liveSend', t, status, pitch, vel]),
        schSlotForTrack: () => -1,
        setPaletteEntryRGB: noop,
        reapplyPalette: noop,
        setButtonLED: noop,
        setLED: noop,
        disarmRecord: () => log.push(['task', 'disarm']),
        pollDSP: () => log.push(['task', 'pollDSP']),
        syncClipsFromDsp: noop,
        syncMuteSoloFromDsp: noop,
        restoreUiSidecar: noop,
        syncClipsTargeted: noop,
        clearRecordingNoteBuffers: noop,
        showActionPopup: noop,
        syncDrumClipContent: noop,
        syncDrumLanesMeta: noop,
        syncDrumLaneSteps: noop,
        refreshDrumLaneBankParams: noop,
        refreshPerClipBankParams: noop,
        clipHasContent: () => false,
        xposeCancelPreview: () => log.push(['task', 'xposeCancel']),
        drainLedInit: () => log.push(['task', 'drainLedInit']),
        refreshSchwungCoRunSlotMask: noop,
        advancePendingEditSoundEntry: () => null,
        enterMoveNativeCoRun: noop,
        enterSchwungCoRun: noop,
        playMetronomeClick: noop,
        createTrackViewStepWorkflowDeps: () => ({
            stepHeld: noop,
            stepChordFirst: noop
        }),
        sceneAllPlaying: () => false,
        sceneAllQueued: () => false,
        sceneAnyPlaying: () => false,
        flashAtRate: () => false,
        updateSessionLEDs: noop,
        updatePerfModeLEDs: noop,
        updateSceneMapLEDs: noop,
        updateStepLEDs: noop,
        updateTrackLEDs: noop,
        updateNameIndex: () => log.push(['task', 'updateNameIndex']),
        clearAllLEDs: noop,
        commitSnapshot: noop,
        loadNameIndex: () => ({}),
        uuidToStatePath: (u) => u,
        saveNameIndex: noop,
        altIndicatorActive: () => false,
        drawUI: () => log.push(['task', 'drawUI']),
        ...overrides
    };
}

test('runTickWorkflow preserves drain ordering across live, deferred, default, record, and save drains', () => {
    const log = [];
    const S = makeState({
        pendingDefaultSetParams: [{ key: 'default_key', val: 'default_val' }],
        recordArmed: true,
        recordArmedTrack: 0,
        _recNoteOns: [{ rt: 0, pitch: 64, vel: 99 }],
        pendingSuspendSave: true
    });
    const deps = makeDeps(log);
    deps.pendingLiveNotes[0].push({ isOff: false, pitch: 60, vel: 100 });
    deps.pendingDrumNoteOffs[0].push(36);

    runTickWorkflow(S, deps);

    const events = log.map((entry) => entry[0] === 'set' ? `set:${entry[1]}` : entry[0]);
    assert(events.indexOf('set:t0_live_notes') < events.indexOf('liveSend'));
    assert(events.indexOf('liveSend') < events.indexOf('external'));
    assert(events.indexOf('external') < events.indexOf('set:default_key'));
    assert(events.indexOf('set:default_key') < events.indexOf('set:t0_record_note_on'));
    assert(events.indexOf('set:t0_record_note_on') < events.indexOf('set:save'));
});

test('runTickWorkflow preserves default-drain and count-in early exits', () => {
    const log = [];
    const S = makeState({
        clearDrainHold: 1,
        pendingDefaultSetParams: [{ key: 'held_default', val: '1' }],
        recordArmed: true,
        recordCountingIn: true,
        recordArmedTrack: 0,
        _recNoteOns: [{ rt: 0, pitch: 64, vel: 99 }]
    });

    runTickWorkflow(S, makeDeps(log));

    assert.equal(S.clearDrainHold, 0);
    assert.deepEqual(S.pendingDefaultSetParams, [{ key: 'held_default', val: '1' }]);
    assert(!log.some((entry) => entry[0] === 'set' && entry[1] === 'held_default'));
    assert(!log.some((entry) => entry[0] === 'set' && entry[1] === 't0_record_note_on'));
});

test('runTickWorkflow draws dirty UI only when not suspended', () => {
    const activeLog = [];
    const active = makeState({ screenDirty: true });
    runTickWorkflow(active, makeDeps(activeLog));
    assert(activeLog.some((entry) => entry[0] === 'task' && entry[1] === 'drawUI'));
    assert.equal(active.screenDirty, false);

    const suspendedLog = [];
    const suspended = makeState({ screenDirty: true, _origClearScreen: () => {} });
    runTickWorkflow(suspended, makeDeps(suspendedLog, { clearScreen: noop }));
    assert(!suspendedLog.some((entry) => entry[0] === 'task' && entry[1] === 'drawUI'));
    assert.equal(suspended.screenDirty, true);
});

test('runTickWorkflow expires the Schwung Sound focused param peek before drawing', () => {
    const log = [];
    let expired = false;
    const S = makeState({
        ledInitComplete: true,
        screenDirty: false,
        knobTouched: -1,
        knobTouchStartTick: -1,
        bankSelectTick: -1,
        stretchBlockedEndTick: -1,
        actionPopupEndTick: -1,
        noNoteFlashEndTick: -1,
        stepSaveFlashEndTick: -1,
    });

    runTickWorkflow(S, makeDeps(log, {
        expireSchwungSoundParamPeek: () => {
            expired = true;
            S.screenDirty = true;
            return true;
        },
    }));

    assert.equal(expired, true);
    assert(log.some((entry) => entry[0] === 'task' && entry[1] === 'drawUI'));
    assert.equal(S.screenDirty, false);
});

test('ui.js keeps the public tick callback and error wrapper while delegating to _tickImpl', async () => {
    const source = await readFile(new URL('../../ui/ui.js', import.meta.url), 'utf8');
    assert.match(
        source,
        /globalThis\.tick = function \(\) \{ runEntrypoint\('tick', _tickImpl\); \};/
    );
    assert.match(source, /const _entrypointDiagnostics = createEntrypointErrorWrapper\(S\);/);
    assert.match(source, /function runEntrypoint\(where, fn\) \{\s*return _entrypointDiagnostics\.runEntrypoint\(where, fn\);\s*\}/);
    assert.match(source, /function _tickImpl\(\) \{\s*runTickWorkflow\(S, createTickWorkflowDeps\(\)\);\s*\}/);
});

test('runTickWorkflow source preserves load-bearing task order', async () => {
    const source = await readFile(new URL('../../ui/tick/ui_tick_workflow.mjs', import.meta.url), 'utf8');
    const ordered = [
        'runPendingTrackConvert',
        'runPendingPadNoteMapRecompute',
        'runPadMapSelfHealTask',
        'runSuspendDetection',
        'runLiveNoteDrain',
        'runDeferredDrumNoteOffDrain',
        'runExternalRouteQueueDrain',
        'runPendingSetLoad',
        'runDefaultSetParamDrain',
        'runDspMirrorResyncTasks',
        'runPendingUndoSyncTask',
        'runDeferredLaneEditReadbackTasks',
        'runDeferredContentResyncTasks',
        'runRecordingEventFlush',
        'runEndOfTickPersistenceTasks',
        'runOrphanPrune',
        'runAltModeFlash'
    ];
    const positions = ordered.map((name) => source.indexOf(`${name}(`));
    assert(positions.every((pos) => pos >= 0), 'all ordered calls should be present');
    for (let i = 1; i < positions.length; i++) {
        assert(positions[i - 1] < positions[i], `${ordered[i - 1]} should precede ${ordered[i]}`);
    }
});
