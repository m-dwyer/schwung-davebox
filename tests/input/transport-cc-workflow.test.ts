import { describe, expect, test } from "vitest";
import {
  handleUiBackButton,
  handleUiMuteButton,
  handleUiPlayButton,
  handleUiRecordButton,
  handleUiSampleButton,
  handleUiUndoButton,
} from "@overture-ui/input/ui_transport_cc_workflow.mjs";
import { traceDspWrites } from "../helpers/dsp-queue-trace";

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    fn(name: string) {
      return (...args: unknown[]) => log.push([name, ...args]);
    },
  };
}

function state(overrides = {}) {
  return {
    deleteHeld: false,
    muteHeld: false,
    muteUsedAsModifier: false,
    loopHeld: false,
    shiftHeld: false,
    sessionView: false,
    playing: false,
    recordCountingIn: false,
    recordArmed: false,
    recordArmedTrack: -1,
    recordPendingPage: false,
    recordScheduledStop: false,
    recordScheduledStopTarget: -1,
    recordBlockedDialog: false,
    recordBlockedDialogSel: 1,
    recordBpm: 0,
    tickCount: 1000,
    activeTrack: 1,
    trackPadMode: [1, 0, 0, 0],
    drumStepPage: [2, 3, 0, 0],
    trackCurrentPage: [0, 4, 0, 0],
    activeDrumLane: [5, 6, 0, 0],
    trackClipPlaying: [false, false, false, false],
    trackWillRelaunch: [true, false, true, true],
    trackQueuedClip: [1, -1, 2, 3],
    trackActiveClip: [0, 7, 0, 0],
    trackCurrentStep: [0, 35, 0, 0],
    drumCurrentStep: [47, 0, 0, 0],
    clipPlaybackDir: [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ],
    drumLanePlaybackDir: [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ],
    clipAdaptiveMode: [
      [false, false, false, false, false, false, false, false],
      [false, false, false, false, false, false, false, false],
      [false, false, false, false, false, false, false, false],
      [false, false, false, false, false, false, false, false],
    ],
    clipNonEmpty: [
      [false, false, false, false, false, false, false, false],
      [false, false, false, false, false, false, false, false],
      [false, false, false, false, false, false, false, false],
      [false, false, false, false, false, false, false, false],
    ],
    drumClipNonEmpty: [
      [false, false, false, false, false, false, false, false],
      [false, false, false, false, false, false, false, false],
      [false, false, false, false, false, false, false, false],
      [false, false, false, false, false, false, false, false],
    ],
    clipLengthManuallySet: [
      [false, false, false, false, false, false, false, false],
      [false, false, false, false, false, false, false, false],
      [false, false, false, false, false, false, false, false],
      [false, false, false, false, false, false, false, false],
    ],
    drumLaneLengthManuallySet: [false, false, false, false],
    pendingPrerollNotes: [1],
    pendingPrerollToggleQueue: [2],
    undoAvailable: false,
    redoAvailable: true,
    undoSeqArpSnapshot: { old: true },
    sampleHeld: false,
    sampleUsedAsModifier: false,
    pendingInheritPicker: null,
    confirmBakeScene: false,
    confirmBake: false,
    confirmBakeDrumLoopOpen: false,
    confirmBakeWrapPhase: false,
    dspMergeState: 0,
    pendingDefaultSetParams: [],
    pendingMergeArm: false,
    actionPopupEndTick: -1,
    metronomeOn: 1,
    metronomeOnLast: 3,
    drumLaneMute: [3, 0, 0, 0],
    drumLaneSolo: [5, 0, 0, 0],
    trackMuted: [false, false, false, false],
    trackSoloed: [false, false, false, false],
    // Back button
    tapTempoOpen: false,
    globalMenuOpen: false,
    confirmClearSession: false,
    confirmSaveState: false,
    confirmConvertToDrum: false,
    exportDoneDialog: false,
    confirmExport: false,
    routeCheckOpen: false,
    lastSentMenuEditValue: 42,
    schwungCoRunSlot: -1,
    pendingHideAfterSave: false,
    // Undo button
    redoSeqArpSnapshot: null,
    pendingUndoSync: 0,
    screenDirty: false,
    bankParams: [
      [[], [], [], [], [10, 11, 12, 13, 14, 15, 16, 17], [], []],
      [[], [], [], [], [20, 21, 22, 23, 24, 25, 26, 27], [], []],
      [[], [], [], [], [30, 31, 32, 33, 34, 35, 36, 37], [], []],
      [[], [], [], [], [40, 41, 42, 43, 44, 45, 46, 47], [], []],
    ],
    ...overrides,
  };
}

function deps(c: ReturnType<typeof calls>, overrides = {}) {
  return {
    disarmRecord: c.fn("disarm"),
    focusedClipIsEmpty: (...args: unknown[]) => {
      c.log.push(["focusedClipIsEmpty", ...args]);
      return true;
    },
    forceRedraw: c.fn("redraw"),
    getParam: (...args: unknown[]) => {
      c.log.push(["getParam", ...args]);
      return "120";
    },
    movePlay: 85,
    moveRec: 86,
    moveSample: 118,
    moveMute: 88,
    moveBack: 51,
    moveUndo: 56,
    numTracks: 4,
    padModeDrum: 1,
    red: 5,
    setButtonLED: (...args: unknown[]) => c.log.push(["led", ...args]),
    setParam: (...args: unknown[]) => c.log.push(["setParam", ...args]),
    resolveInheritPicker: (...args: unknown[]) => c.log.push(["inherit", ...args]),
    showActionPopup: c.fn("popup"),
    unlatchAllTracks: c.fn("unlatch"),
    clearAllMuteSolo: c.fn("clearAllMuteSolo"),
    setTrackMute: (...args: unknown[]) => c.log.push(["setTrackMute", ...args]),
    setTrackSolo: (...args: unknown[]) => c.log.push(["setTrackSolo", ...args]),
    closeTapTempo: c.fn("closeTapTempo"),
    closeConvertConfirm: c.fn("closeConvertConfirm"),
    exitSchwungCoRun: c.fn("exitCoRun"),
    saveState: c.fn("saveState"),
    banks: [
      {}, {}, {}, {},
      { knobs: [1, 1, 1, 1, 1, 1, 1, 1] }, // bank 4: all knobs present
      {}, {},
    ],
    ...overrides,
  };
}

describe("Transport CC workflow - Play button", () => {
  test("ignores non-Play CCs and non-press Play values", () => {
    const c = calls();
    const S = state();
    const d = deps(c);

    expect(handleUiPlayButton(S, d, 84, 127)).toBeUndefined();
    expect(handleUiPlayButton(S, d, 85, 0)).toBeUndefined();

    expect(c.log).toEqual([]);
  });

  test("Delete+Play while stopped sends panic and clears queued relaunch mirrors", () => {
    const c = calls();
    const S = state({ deleteHeld: true, playing: false });

    handleUiPlayButton(S, deps(c), 85, 127);

    expect(c.log).toEqual([
      ["setParam", "transport", "panic"],
      ["unlatch"],
    ]);
    expect(S.trackWillRelaunch).toEqual([false, false, false, false]);
    expect(S.trackQueuedClip).toEqual([-1, -1, -1, -1]);
  });

  test("Delete+Play while playing deactivates all and unlatches tracks", () => {
    const c = calls();
    const S = state({ deleteHeld: true, playing: true });

    handleUiPlayButton(S, deps(c), 85, 127);

    expect(c.log).toEqual([
      ["setParam", "transport", "deactivate_all"],
      ["unlatch"],
    ]);
    expect(S.trackWillRelaunch).toEqual([true, false, true, true]);
    expect(S.trackQueuedClip).toEqual([1, -1, 2, 3]);
  });

  test("Mute+Play toggles the metronome and marks mute as a modifier", () => {
    const c = calls();
    const S = state({ muteHeld: true, metronomeOn: 2, metronomeOnLast: 3 });

    handleUiPlayButton(S, deps(c), 85, 127);

    expect(S.muteUsedAsModifier).toBe(true);
    expect(S.metronomeOnLast).toBe(2);
    expect(S.metronomeOn).toBe(0);
    expect(c.log).toEqual([
      ["setParam", "metro_on", "0"],
      ["popup", "METRO OFF"],
    ]);
  });

  test("Mute+Play restores the previous metronome mode when currently off", () => {
    const c = calls();
    const S = state({ muteHeld: true, metronomeOn: 0, metronomeOnLast: 3 });

    handleUiPlayButton(S, deps(c), 85, 127);

    expect(S.metronomeOn).toBe(3);
    expect(c.log).toEqual([
      ["setParam", "metro_on", "3"],
      ["popup", "METRO ON"],
    ]);
  });

  test("Loop+Play in Track View restarts at the visible melodic page", () => {
    const c = calls();
    const S = state({ loopHeld: true, activeTrack: 1, sessionView: false });

    handleUiPlayButton(S, deps(c), 85, 127);

    expect(c.log).toEqual([
      ["setParam", "transport", "restart_at:1:4:-1"],
    ]);
  });

  test("Loop+Play in Track View restarts at the visible drum page and lane", () => {
    const c = calls();
    const S = state({ loopHeld: true, activeTrack: 0, sessionView: false });

    handleUiPlayButton(S, deps(c), 85, 127);

    expect(c.log).toEqual([
      ["setParam", "transport", "restart_at:0:2:5"],
    ]);
  });

  test("Loop+Play in Session View falls through to normal play", () => {
    const c = calls();
    const S = state({ loopHeld: true, sessionView: true });

    handleUiPlayButton(S, deps(c), 85, 127);

    expect(c.log).toEqual([
      ["setParam", "transport", "play"],
    ]);
  });

  test("Shift+Play restarts while playing and plays while stopped", () => {
    const c = calls();

    handleUiPlayButton(state({ shiftHeld: true, playing: true }), deps(c), 85, 127);
    handleUiPlayButton(state({ shiftHeld: true, playing: false }), deps(c), 85, 127);

    expect(c.log).toEqual([
      ["setParam", "transport", "restart"],
      ["setParam", "transport", "play"],
    ]);
  });

  test("plain Play during count-in disarms recording instead of toggling transport", () => {
    const c = calls();
    const S = state({ recordCountingIn: true });

    handleUiPlayButton(S, deps(c), 85, 127);

    expect(c.log).toEqual([["disarm"]]);
  });

  test("plain Play from stopped Track View queues the empty focused clip atomically", () => {
    const c = calls();
    const S = state({ activeTrack: 1, playing: false, sessionView: false });

    handleUiPlayButton(S, deps(c), 85, 127);

    expect(c.log).toEqual([
      ["focusedClipIsEmpty", 1],
      ["setParam", "transport", "play_focus:1:7"],
    ]);
    expect(S.trackQueuedClip[1]).toBe(7);
  });

  test("plain Play toggles transport when focus-play preconditions are not met", () => {
    const c = calls();

    handleUiPlayButton(state({ playing: true }), deps(c), 85, 127);
    handleUiPlayButton(state({ playing: false, sessionView: true }), deps(c), 85, 127);
    handleUiPlayButton(
      state({ playing: false, trackClipPlaying: [false, true, false, false] }),
      deps(c),
      85,
      127
    );
    handleUiPlayButton(
      state({ playing: false }),
      deps(c, { focusedClipIsEmpty: () => false }),
      85,
      127
    );

    expect(c.log).toEqual([
      ["setParam", "transport", "stop"],
      ["setParam", "transport", "play"],
      ["setParam", "transport", "play"],
      ["setParam", "transport", "play"],
    ]);
  });
});

describe("Transport CC workflow - Sample button", () => {
  test("ignores non-Sample CCs and Shift+Sample", () => {
    const c = calls();
    const S = state();
    const d = deps(c);

    expect(handleUiSampleButton(S, d, 117, 127)).toBeUndefined();
    expect(handleUiSampleButton(state({ shiftHeld: true }), d, 118, 127)).toBeUndefined();

    expect(c.log).toEqual([]);
  });

  test("Sample press tracks held state and clears modifier use", () => {
    const c = calls();
    const S = state({ sampleUsedAsModifier: true });

    handleUiSampleButton(S, deps(c), 118, 127);

    expect(S.sampleHeld).toBe(true);
    expect(S.sampleUsedAsModifier).toBe(false);
    expect(c.log).toEqual([]);
  });

  test("Sample press cancels inherit picker as a modifier", () => {
    const c = calls();
    const S = state({ pendingInheritPicker: { selectedIndex: 0 } });

    handleUiSampleButton(S, deps(c), 118, 127);

    expect(S.sampleHeld).toBe(true);
    expect(S.sampleUsedAsModifier).toBe(true);
    expect(c.log).toEqual([["inherit", -1]]);
  });

  test("Sample press cancels scene bake confirm and redraws", () => {
    const c = calls();
    const S = state({ confirmBakeScene: true });

    handleUiSampleButton(S, deps(c), 118, 127);

    expect(S.confirmBakeScene).toBe(false);
    expect(S.sampleUsedAsModifier).toBe(true);
    expect(c.log).toEqual([["redraw"]]);
  });

  test("Sample press cancels clip bake confirm and redraws", () => {
    const c = calls();
    const S = state({
      confirmBake: true,
      confirmBakeDrumLoopOpen: true,
      confirmBakeWrapPhase: true,
    });

    handleUiSampleButton(S, deps(c), 118, 127);

    expect(S.confirmBake).toBe(false);
    expect(S.confirmBakeDrumLoopOpen).toBe(false);
    expect(S.confirmBakeWrapPhase).toBe(false);
    expect(S.sampleUsedAsModifier).toBe(true);
    expect(c.log).toEqual([["redraw"]]);
  });

  test("Sample press during merge queues merge stop", () => {
    const c = calls();
    const S = state({
      dspMergeState: 2,
      pendingDefaultSetParams: [{ key: "older", val: "1" }],
    });

    handleUiSampleButton(S, deps(c), 118, 127);

    expect(S.sampleUsedAsModifier).toBe(true);
    expect(traceDspWrites(S, c.log)).toEqual({
      directSetParams: [],
      queuedOperations: [
        { key: "older", val: "1" },
        { key: "merge_stop", val: "1" },
      ],
    });
    expect(c.log).toEqual([]);
  });

  test("Sample release clears held state", () => {
    const c = calls();
    const S = state({ sampleHeld: true, sessionView: false });

    handleUiSampleButton(S, deps(c), 118, 0);

    expect(S.sampleHeld).toBe(false);
    expect(S.pendingDefaultSetParams).toEqual([]);
  });

  test("Sample release in Track View remains a no-op beyond clearing held state", () => {
    const c = calls();
    const S = state({ sampleHeld: true, sessionView: false, sampleUsedAsModifier: false });

    handleUiSampleButton(S, deps(c), 118, 0);

    expect(S.sampleHeld).toBe(false);
    expect(S.pendingMergeArm).toBe(false);
    expect(S.pendingDefaultSetParams).toEqual([]);
    expect(c.log).toEqual([]);
  });

  test("Sample release in Session View arms live merge when unused", () => {
    const c = calls();
    const S = state({
      sampleHeld: true,
      sessionView: true,
      tickCount: 2000,
      pendingDefaultSetParams: [{ key: "older", val: "1" }],
    });

    handleUiSampleButton(S, deps(c), 118, 0);

    expect(S.sampleHeld).toBe(false);
    expect(S.pendingMergeArm).toBe(true);
    expect(S.actionPopupEndTick).toBe(2280);
    expect(traceDspWrites(S, c.log)).toEqual({
      directSetParams: [],
      queuedOperations: [
        { key: "older", val: "1" },
        { key: "merge_arm", val: "1" },
      ],
    });
    expect(c.log).toEqual([
      ["led", 118, 5],
      ["popup", "LIVE MERGE", "Capturing all 8", "tracks. Tap Sample", "again to stop."],
    ]);
  });

  test("Sample release in Session View stops active merge", () => {
    const c = calls();
    const S = state({
      sampleHeld: true,
      sessionView: true,
      dspMergeState: 1,
      pendingDefaultSetParams: [{ key: "older", val: "1" }],
    });

    handleUiSampleButton(S, deps(c), 118, 0);

    expect(S.sampleHeld).toBe(false);
    expect(S.pendingMergeArm).toBe(false);
    expect(traceDspWrites(S, c.log)).toEqual({
      directSetParams: [],
      queuedOperations: [
        { key: "older", val: "1" },
        { key: "merge_stop", val: "1" },
      ],
    });
    expect(c.log).toEqual([]);
  });

  test("Sample release after modifier use does not arm merge", () => {
    const c = calls();
    const S = state({ sampleHeld: true, sessionView: true, sampleUsedAsModifier: true });

    handleUiSampleButton(S, deps(c), 118, 0);

    expect(S.sampleHeld).toBe(false);
    expect(S.pendingDefaultSetParams).toEqual([]);
    expect(c.log).toEqual([]);
  });
});

describe("Transport CC workflow - Record button", () => {
  test("ignores non-Record CCs and non-press Record values", () => {
    const c = calls();
    const S = state();
    const d = deps(c);

    expect(handleUiRecordButton(S, d, 85, 127)).toBeUndefined();
    expect(handleUiRecordButton(S, d, 86, 0)).toBeUndefined();

    expect(c.log).toEqual([]);
  });

  test("armed count-in Record press disarms recording", () => {
    const c = calls();
    const S = state({ recordArmed: true, recordCountingIn: true });

    handleUiRecordButton(S, deps(c), 86, 127);

    expect(c.log).toEqual([["disarm"]]);
  });

  test("armed adaptive clip while playing schedules stop at the next page boundary", () => {
    const c = calls();
    const S = state({ recordArmed: true, recordArmedTrack: 1, playing: true });
    S.clipAdaptiveMode[1][7] = true;

    handleUiRecordButton(S, deps(c), 86, 127);

    expect(c.log).toEqual([]);
    expect(S.recordScheduledStop).toBe(true);
    expect(S.recordScheduledStopTarget).toBe(48);
  });

  test("armed adaptive drum clip schedules stop from the drum current step", () => {
    const c = calls();
    const S = state({ recordArmed: true, recordArmedTrack: 0, playing: true });
    S.clipAdaptiveMode[0][0] = true;

    handleUiRecordButton(S, deps(c), 86, 127);

    expect(S.recordScheduledStop).toBe(true);
    expect(S.recordScheduledStopTarget).toBe(48);
  });

  test("armed non-adaptive Record press disarms", () => {
    const c = calls();
    const S = state({ recordArmed: true, recordArmedTrack: 1, playing: true });

    handleUiRecordButton(S, deps(c), 86, 127);

    expect(c.log).toEqual([["disarm"]]);
  });

  test("reverse melodic playback direction opens the record-blocked dialog", () => {
    const c = calls();
    const S = state();
    S.clipPlaybackDir[1][7] = 2;

    handleUiRecordButton(S, deps(c), 86, 127);

    expect(S.recordBlockedDialog).toBe(true);
    expect(S.recordBlockedDialogSel).toBe(0);
    expect(c.log).toEqual([["redraw"]]);
  });

  test("reverse drum lane playback direction opens the record-blocked dialog", () => {
    const c = calls();
    const S = state({ activeTrack: 0 });
    S.drumLanePlaybackDir[0][5] = 1;

    handleUiRecordButton(S, deps(c), 86, 127);

    expect(S.recordBlockedDialog).toBe(true);
    expect(c.log).toEqual([["redraw"]]);
  });

  test("stopped unarmed Record starts count-in and uses the host BPM", () => {
    const c = calls();
    const S = state({ playing: false, tickCount: 222 });

    handleUiRecordButton(S, deps(c, { getParam: () => "98" }), 86, 127);

    expect(S.recordArmed).toBe(true);
    expect(S.recordCountingIn).toBe(true);
    expect(S.recordArmedTrack).toBe(1);
    expect(S.recordBpm).toBe(98);
    expect(S.countInStartTick).toBe(222);
    expect(S.countInBeatStartTick).toBe(222);
    expect(S.countInQuarterTicks).toBe(Math.round(196 * 60 / 98));
    expect(S.pendingPrerollNotes).toEqual([]);
    expect(S.pendingPrerollToggleQueue).toEqual([]);
    expect(S.undoAvailable).toBe(true);
    expect(S.redoAvailable).toBe(false);
    expect(S.undoSeqArpSnapshot).toBeNull();
    expect(c.log).toEqual([
      ["setParam", "record_count_in", "1"],
      ["led", 86, 5],
    ]);
  });

  test("stopped unarmed Record falls back to 120 BPM when host BPM is invalid", () => {
    const c = calls();
    const S = state({ playing: false });

    handleUiRecordButton(S, deps(c, { getParam: () => "bad" }), 86, 127);

    expect(S.recordBpm).toBe(120);
    expect(S.countInQuarterTicks).toBe(98);
  });

  test("playing unarmed adaptive melodic recording sends deferred recording mode", () => {
    const c = calls();
    const S = state({ playing: true, activeTrack: 1 });

    handleUiRecordButton(S, deps(c, { getParam: () => "110" }), 86, 127);

    expect(S.recordArmed).toBe(true);
    expect(S.recordCountingIn).toBe(false);
    expect(S.recordArmedTrack).toBe(1);
    expect(S.recordPendingPage).toBe(true);
    expect(S.recordBpm).toBe(110);
    expect(S.clipAdaptiveMode[1][7]).toBe(true);
    expect(c.log).toEqual([
      ["led", 86, 5],
      ["setParam", "t1_recording", "2"],
    ]);
  });

  test("playing unarmed fixed melodic recording sends immediate recording mode", () => {
    const c = calls();
    const S = state({ playing: true, activeTrack: 1 });
    S.clipNonEmpty[1][7] = true;

    handleUiRecordButton(S, deps(c), 86, 127);

    expect(S.recordPendingPage).toBe(false);
    expect(S.clipAdaptiveMode[1][7]).toBe(false);
    expect(c.log).toEqual([
      ["getParam", "bpm"],
      ["led", 86, 5],
      ["setParam", "t1_recording", "1"],
    ]);
  });

  test("playing unarmed adaptive drum recording checks drum content and lane length", () => {
    const c = calls();
    const S = state({ playing: true, activeTrack: 0 });

    handleUiRecordButton(S, deps(c), 86, 127);

    expect(S.recordPendingPage).toBe(true);
    expect(S.clipAdaptiveMode[0][0]).toBe(true);
    expect(c.log).toEqual([
      ["getParam", "bpm"],
      ["led", 86, 5],
      ["setParam", "t0_recording", "2"],
    ]);
  });

  test("playing unarmed fixed drum recording sends immediate recording mode", () => {
    const c = calls();
    const S = state({ playing: true, activeTrack: 0 });
    S.drumLaneLengthManuallySet[0] = true;

    handleUiRecordButton(S, deps(c), 86, 127);

    expect(S.recordPendingPage).toBe(false);
    expect(c.log).toEqual([
      ["getParam", "bpm"],
      ["led", 86, 5],
      ["setParam", "t0_recording", "1"],
    ]);
  });
});

describe("Transport CC workflow - Back button", () => {
  test("ignores non-Back CCs and non-press Back values", () => {
    const c = calls();
    const d = deps(c);

    expect(handleUiBackButton(state(), d, 50, 127)).toBeUndefined();
    expect(handleUiBackButton(state(), d, 51, 0)).toBeUndefined();

    expect(c.log).toEqual([]);
  });

  test("Back closes the tap-tempo overlay first", () => {
    const c = calls();
    const S = state({ tapTempoOpen: true, globalMenuOpen: true });

    handleUiBackButton(S, deps(c), 51, 127);

    expect(S.globalMenuOpen).toBe(true); // not touched — tap tempo took priority
    expect(c.log).toEqual([["closeTapTempo"], ["redraw"]]);
  });

  test("Back cancels the bake confirm", () => {
    const c = calls();
    const S = state({ confirmBake: true, confirmBakeWrapPhase: true });

    handleUiBackButton(S, deps(c), 51, 127);

    expect(S.confirmBake).toBe(false);
    expect(S.confirmBakeWrapPhase).toBe(false);
    expect(c.log).toEqual([["redraw"]]);
  });

  test("Back steps back through menu sub-dialogs before closing the menu", () => {
    const c = calls();
    const S = state({ globalMenuOpen: true, confirmConvertToDrum: true });

    handleUiBackButton(S, deps(c), 51, 127);

    expect(S.globalMenuOpen).toBe(true); // dialog dismissed, menu still open
    expect(c.log).toEqual([["closeConvertConfirm"], ["redraw"]]);
  });

  test("Back from the export-done dialog closes both dialog and menu", () => {
    const c = calls();
    const S = state({ globalMenuOpen: true, exportDoneDialog: true });

    handleUiBackButton(S, deps(c), 51, 127);

    expect(S.exportDoneDialog).toBe(false);
    expect(S.globalMenuOpen).toBe(false);
    expect(c.log).toEqual([["redraw"]]);
  });

  test("Back closes a plain open menu and clears the cached menu edit value", () => {
    const c = calls();
    const S = state({ globalMenuOpen: true, lastSentMenuEditValue: 99 });

    handleUiBackButton(S, deps(c), 51, 127);

    expect(S.globalMenuOpen).toBe(false);
    expect(S.lastSentMenuEditValue).toBeNull();
    expect(c.log).toEqual([["redraw"]]);
  });

  test("Shift+Back with no open layer suspends and hides the module", () => {
    const c = calls();
    const S = state({ shiftHeld: true, schwungCoRunSlot: -1 });

    handleUiBackButton(S, deps(c), 51, 127);

    expect(S.pendingHideAfterSave).toBe(true);
    expect(c.log).toEqual([["saveState"]]);
  });

  test("Shift+Back exits co-run before saving when a slot is active", () => {
    const c = calls();
    const S = state({ shiftHeld: true, schwungCoRunSlot: 2 });

    handleUiBackButton(S, deps(c), 51, 127);

    expect(S.pendingHideAfterSave).toBe(true);
    expect(c.log).toEqual([["exitCoRun"], ["saveState"]]);
  });

  test("plain Back with nothing open is a no-op", () => {
    const c = calls();
    const S = state();

    handleUiBackButton(S, deps(c), 51, 127);

    expect(S.pendingHideAfterSave).toBe(false);
    expect(c.log).toEqual([]);
  });
});

describe("Transport CC workflow - Undo button", () => {
  test("ignores non-Undo CCs and non-press Undo values", () => {
    const c = calls();
    const d = deps(c);

    expect(handleUiUndoButton(state(), d, 55, 127)).toBeUndefined();
    expect(handleUiUndoButton(state(), d, 56, 0)).toBeUndefined();

    expect(c.log).toEqual([]);
  });

  test("Undo restores DSP, flips availability, and arms the undo sync", () => {
    const c = calls();
    const S = state({ undoAvailable: true, undoSeqArpSnapshot: null });

    handleUiUndoButton(S, deps(c), 56, 127);

    expect(S.redoAvailable).toBe(true);
    expect(S.undoAvailable).toBe(false);
    expect(S.pendingUndoSync).toBe(5);
    expect(S.redoSeqArpSnapshot).toBeNull();
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([
      ["setParam", "undo_restore", "1"],
      ["popup", "UNDO"],
    ]);
  });

  test("Undo snapshots the SEQ ARP bank for redo and re-bakes the saved params", () => {
    const c = calls();
    const S = state({
      undoAvailable: true,
      undoSeqArpSnapshot: { track: 2, params: [90, 91, 92, 93, 94, 95, 96, 97] },
    });

    handleUiUndoButton(S, deps(c), 56, 127);

    // redo snapshot captures the pre-restore bank-4 params for track 2
    expect(S.redoSeqArpSnapshot).toEqual({ track: 2, params: [30, 31, 32, 33, 34, 35, 36, 37] });
    // and the undo snapshot params are baked back into bank 4 for track 2
    expect(S.bankParams[2][4]).toEqual([90, 91, 92, 93, 94, 95, 96, 97]);
    expect(c.log).toEqual([
      ["setParam", "undo_restore", "1"],
      ["popup", "UNDO"],
    ]);
  });

  test("Undo with nothing to undo reports it without touching DSP", () => {
    const c = calls();
    const S = state({ undoAvailable: false });

    handleUiUndoButton(S, deps(c), 56, 127);

    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([["popup", "NOTHING TO", "UNDO"]]);
  });

  test("Shift+Undo redoes, flips availability, and arms the undo sync", () => {
    const c = calls();
    const S = state({ shiftHeld: true, redoAvailable: true, redoSeqArpSnapshot: null });

    handleUiUndoButton(S, deps(c), 56, 127);

    expect(S.undoAvailable).toBe(true);
    expect(S.redoAvailable).toBe(false);
    expect(S.pendingUndoSync).toBe(5);
    expect(c.log).toEqual([
      ["setParam", "redo_restore", "1"],
      ["popup", "REDO"],
    ]);
  });

  test("Shift+Undo with nothing to redo reports it", () => {
    const c = calls();
    const S = state({ shiftHeld: true, redoAvailable: false });

    handleUiUndoButton(S, deps(c), 56, 127);

    expect(c.log).toEqual([["popup", "NOTHING TO", "REDO"]]);
  });
});

describe("Transport CC workflow - Mute button", () => {
  test("ignores non-Mute CCs", () => {
    const c = calls();
    const S = state();
    const d = deps(c);

    expect(handleUiMuteButton(S, d, 87, 127)).toBeUndefined();
    expect(handleUiMuteButton(S, d, 87, 0)).toBeUndefined();

    expect(c.log).toEqual([]);
  });

  test("Delete+Mute press in Track View drum clears the drum lane mute/solo", () => {
    const c = calls();
    const S = state({ deleteHeld: true, sessionView: false, activeTrack: 0 });

    handleUiMuteButton(S, deps(c), 88, 127);

    expect(S.drumLaneMute[0]).toBe(0);
    expect(S.drumLaneSolo[0]).toBe(0);
    expect(S.muteUsedAsModifier).toBe(true);
    expect(c.log).toEqual([
      ["setParam", "t0_drum_mute_all_clear", "1"],
      ["redraw"],
    ]);
  });

  test("Delete+Mute press outside a Track View drum clip clears all mute/solo", () => {
    const c = calls();
    // activeTrack 1 is melodic (trackPadMode[1] === 0).
    const S = state({ deleteHeld: true, sessionView: false, activeTrack: 1 });

    handleUiMuteButton(S, deps(c), 88, 127);

    expect(S.muteUsedAsModifier).toBe(false);
    expect(c.log).toEqual([["clearAllMuteSolo"]]);
  });

  test("Delete+Mute press in Session View drum track still clears all mute/solo", () => {
    const c = calls();
    const S = state({ deleteHeld: true, sessionView: true, activeTrack: 0 });

    handleUiMuteButton(S, deps(c), 88, 127);

    expect(c.log).toEqual([["clearAllMuteSolo"]]);
  });

  test("plain Mute press is a no-op without Delete", () => {
    const c = calls();
    const S = state({ deleteHeld: false });

    handleUiMuteButton(S, deps(c), 88, 127);

    expect(c.log).toEqual([]);
  });

  test("Mute release toggles the active track mute in Track View", () => {
    const c = calls();
    const S = state({ activeTrack: 1, sessionView: false });
    S.trackMuted[1] = false;

    handleUiMuteButton(S, deps(c), 88, 0);

    expect(c.log).toEqual([["setTrackMute", 1, true]]);
  });

  test("Mute release toggles the active track mute off when already muted", () => {
    const c = calls();
    const S = state({ activeTrack: 1, sessionView: false });
    S.trackMuted[1] = true;

    handleUiMuteButton(S, deps(c), 88, 0);

    expect(c.log).toEqual([["setTrackMute", 1, false]]);
  });

  test("Shift+Mute release toggles the active track solo", () => {
    const c = calls();
    const S = state({ activeTrack: 1, sessionView: false, shiftHeld: true });
    S.trackSoloed[1] = false;

    handleUiMuteButton(S, deps(c), 88, 0);

    expect(c.log).toEqual([["setTrackSolo", 1, true]]);
  });

  test("Mute release is ignored when Mute was used as a modifier", () => {
    const c = calls();
    const S = state({ activeTrack: 1, sessionView: false, muteUsedAsModifier: true });

    handleUiMuteButton(S, deps(c), 88, 0);

    expect(c.log).toEqual([]);
  });

  test("Mute release is ignored while Delete is held", () => {
    const c = calls();
    const S = state({ activeTrack: 1, sessionView: false, deleteHeld: true });

    handleUiMuteButton(S, deps(c), 88, 0);

    expect(c.log).toEqual([]);
  });

  test("Mute release is ignored in Session View", () => {
    const c = calls();
    const S = state({ activeTrack: 1, sessionView: true });

    handleUiMuteButton(S, deps(c), 88, 0);

    expect(c.log).toEqual([]);
  });
});
