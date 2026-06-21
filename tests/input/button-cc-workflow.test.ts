import { describe, expect, test } from "vitest";
import {
  handleUiCaptureButton,
  handleUiCopyButton,
  handleUiDeleteButton,
  handleUiLoopPerfModeButton,
  handleUiLoopTrackViewButton,
  handleUiMenuCoRunExitButton,
  handleUiMuteModifierButton,
  handleUiNoteSessionButton,
  handleUiShiftButton,
} from "@overture-ui/input/ui_button_cc_workflow.mjs";
import { traceDspWrites } from "../helpers/dsp-queue-trace";

const CAPTURE = 52;
const COPY = 60;
const DELETE = 119;
const LOOP = 58;
const LOOP_TAP_TICKS = 40;
const MENU = 50;
const MUTE = 88;
const NOTE_SESSION = 50;
const NOTE_SESSION_HOLD_TICKS = 40;
const SHIFT = 49;
const DRUM = 1;

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    fn(name: string) {
      return (...args: unknown[]) => log.push([name, ...args]);
    },
  };
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    captureHeld: false,
    captureUsedAsModifier: false,
    pendingSceneBakePicker: false,
    pendingMergePlacement: false,
    pendingDefaultSetParams: [] as Array<{ key: string; val: string }>,
    confirmBake: false,
    confirmBakeDrumLoopOpen: false,
    confirmBakeWrapPhase: false,
    confirmBakeScene: false,
    confirmBakeIsDrum: false,
    confirmBakeIsMultiLoop: false,
    confirmBakeSel: 0,
    confirmBakeTrack: -1,
    confirmBakeClip: -1,
    sessionView: false,
    screenDirty: false,
    activeTrack: 1,
    trackActiveClip: [0, 3, 0, 0],
    trackPadMode: [1, 0, 0, 0], // track 0 drum, track 1 melodic
    // Copy / Mute modifier trackers
    copyHeld: false,
    copySrc: null,
    muteHeld: false,
    muteUsedAsModifier: false,
    shiftHeld: false,
    shiftTrackLEDActive: false,
    jogTouched: false,
    pendingEditEntryTrack: -1,
    deleteHeld: false,
    deleteTapArmed: false,
    loopHeld: false,
    activeBank: 0,
    ccActiveLane: [0, 2, 0, 0],
    ccLaneLoopStart: [
      [[0, 0, 0]],
      [[0, 0, 0], [0, 0, 9], [0, 0, 0], [0, 0, 0]],
    ],
    ccLaneLength: [
      [[0, 0, 0]],
      [[0, 0, 0], [0, 0, 16], [0, 0, 0], [0, 0, 0]],
    ],
    ccLaneTps: [
      [[0, 0, 0]],
      [[0, 0, 0], [0, 0, 48], [0, 0, 0], [0, 0, 0]],
    ],
    ccLaneResTps: [
      [[0, 0, 0]],
      [[0, 0, 0], [0, 0, 24], [0, 0, 0], [0, 0, 0]],
    ],
    undoAvailable: false,
    redoAvailable: true,
    undoSeqArpSnapshot: { present: true },
    clearAutoMenu: null,
    schwungCoRunSlot: -1,
    // Loop perf-mode trackers
    tickCount: 0,
    loopPressTick: 0,
    perfLatchMode: false,
    perfViewLocked: false,
    loopJogActive: false,
    perfStack: [] as Array<{ idx: number; ticks: number }>,
    perfStickyLengths: new Set<number>(),
    perfHoldPadHeld: false,
    perfModsHeld: 0,
    // Loop track-view trackers
    stepIntervalMode: false,
    loopGestureStart: -1,
    loopTapUnlatchTrack: -1,
    liveActiveNotes: new Set<number>(),
    bankParams: Array.from({ length: 4 }, () =>
      Array.from({ length: 6 }, () => [0, 0, 0, 0, 0, 0, 0, 0]),
    ),
    tarpHeldNotes: Array.from({ length: 4 }, () => new Set<number>()),
    heldStepBtn: 5,
    heldStep: 5,
    heldStepNotes: [1] as number[],
    stepWasEmpty: true,
    stepWasHeld: true,
    stepBtnPressedTick: [0, 0, 0, 0, 0, 0, 0, 0],
    sessionStepHeld: 3,
    sessionStepHeldCtx: 2,
    // Note/Session view-toggle + dialog-dismissal trackers
    moveCoRunTrack: -1,
    snapshotPicker: null as { confirm: unknown } | null,
    routeCheckOpen: false,
    tapTempoOpen: false,
    confirmStateWipe: false,
    recordBlockedDialog: false,
    confirmLgto: false,
    confirmClearSession: false,
    confirmSaveState: false,
    confirmConvertToDrum: false,
    exportDoneDialog: false,
    confirmExport: false,
    globalMenuOpen: false,
    lastSentMenuEditValue: 42,
    noteSessionPressedTick: -1,
    sessionViewMomentary: false,
    ...overrides,
  };
}

function deps(c: ReturnType<typeof calls>, overrides: Record<string, unknown> = {}) {
  return {
    moveCapture: CAPTURE,
    moveCopy: COPY,
    moveDelete: DELETE,
    moveMenu: MENU,
    moveMute: MUTE,
    moveShift: SHIFT,
    padModeDrum: DRUM,
    computePadNoteMap: c.fn("padmap"),
    editSoundForTrack: c.fn("editSound"),
    effectiveClip: (track: number) => (track === 1 ? 1 : 0),
    exitSchwungCoRun: c.fn("exitCoRun"),
    forceRedraw: c.fn("redraw"),
    invalidateLEDCache: c.fn("ledInvalidate"),
    loopTapTicks: LOOP_TAP_TICKS,
    moveLoop: LOOP,
    openClearAutoMenu: c.fn("openClearAutoMenu"),
    prepareDrumRepeatLoopPress: c.fn("prepLoopPress"),
    handleDeleteLoopDrumRepeatStop: c.fn("delLoopStop"),
    latchHeldDrumRepeatsOnLoopPress: c.fn("latchHeld"),
    resolveLoopGesture: c.fn("resolveGesture"),
    handleDrumRepeatLoopTapRelease: c.fn("tapRelease"),
    sendPerfMods: c.fn("perfMods"),
    setParam: c.fn("setParam"),
    showActionPopup: c.fn("popup"),
    // Note/Session view-toggle + dialog-dismissal deps
    moveNoteSession: NOTE_SESSION,
    noteSessionHoldTicks: NOTE_SESSION_HOLD_TICKS,
    closeSchwungSoundBrowser: c.fn("closeSoundBrowser"),
    closeSchwungSoundPage: c.fn("closeSoundPage"),
    closeSnapshotPicker: c.fn("closeSnapshot"),
    openGlobalMenu: c.fn("openGlobalMenu"),
    closeTapTempo: c.fn("closeTapTempo"),
    removeFlagsWrap: c.fn("removeFlags"),
    clearAllLEDs: c.fn("clearLEDs"),
    exitModule: c.fn("exitModule"),
    closeConvertConfirm: c.fn("closeConvert"),
    switchViewCleanup: c.fn("switchViewCleanup"),
    ...overrides,
  };
}

describe("Button CC workflow - Sound Edit Menu", () => {
  test("Menu closes only the Sound Edit browser layer first", () => {
    const c = calls();
    const S = state({ schwungSoundPage: { browser: true } });
    expect(handleUiMenuCoRunExitButton(S, deps(c), MENU, 127)).toBe(true);
    expect(c.log).toEqual([["closeSoundBrowser"], ["redraw"]]);
  });

  test("Menu closes Sound Edit page when no browser is open", () => {
    const c = calls();
    const S = state({ schwungSoundPage: { browser: false } });
    expect(handleUiMenuCoRunExitButton(S, deps(c), MENU, 127)).toBe(true);
    expect(c.log).toEqual([["closeSoundPage"], ["redraw"]]);
  });
});

describe("Button CC workflow - Shift button", () => {
  test("ignores non-Shift CCs", () => {
    const c = calls();
    expect(handleUiShiftButton(state(), deps(c), 48, 127)).toBeUndefined();
    expect(c.log).toEqual([]);
  });

  test("Shift press sets held state, activates the track LED overlay, re-pushes pad map, and redraws Track View", () => {
    const c = calls();
    const S = state();

    handleUiShiftButton(S, deps(c), SHIFT, 127);

    expect(S.shiftHeld).toBe(true);
    expect(S.shiftTrackLEDActive).toBe(true);
    expect(c.log).toEqual([["padmap"], ["redraw"]]);
  });

  test("Shift release clears held state, clears jog touch, re-pushes pad map, and redraws Track View", () => {
    const c = calls();
    const S = state({ shiftHeld: true, shiftTrackLEDActive: true, jogTouched: true });

    handleUiShiftButton(S, deps(c), SHIFT, 0);

    expect(S.shiftHeld).toBe(false);
    expect(S.shiftTrackLEDActive).toBe(false);
    expect(S.jogTouched).toBe(false);
    expect(c.log).toEqual([["padmap"], ["redraw"]]);
  });

  test("Shift release dispatches deferred edit-entry and clears the pending track before redraw", () => {
    const c = calls();
    const S = state({ shiftHeld: true, pendingEditEntryTrack: 2 });

    handleUiShiftButton(S, deps(c), SHIFT, 0);

    expect(S.pendingEditEntryTrack).toBe(-1);
    expect(c.log).toEqual([["padmap"], ["editSound", 2], ["redraw"]]);
  });

  test("Shift transitions in Session View skip redraw but still re-push the pad map", () => {
    const c = calls();
    const S = state({ sessionView: true });

    handleUiShiftButton(S, deps(c), SHIFT, 127);

    expect(S.shiftHeld).toBe(true);
    expect(S.shiftTrackLEDActive).toBe(true);
    expect(c.log).toEqual([["padmap"]]);
  });
});

describe("Button CC workflow - Delete button", () => {
  test("ignores non-Delete CCs", () => {
    const c = calls();
    expect(handleUiDeleteButton(state(), deps(c), 118, 127)).toBe(false);
    expect(c.log).toEqual([]);
  });

  test("Delete press tracks held state and re-pushes the pad map", () => {
    const c = calls();
    const S = state();

    expect(handleUiDeleteButton(S, deps(c), DELETE, 127)).toBe(false);

    expect(S.deleteHeld).toBe(true);
    expect(c.log).toEqual([["padmap"]]);
  });

  test("Delete release clears held state and re-pushes the pad map", () => {
    const c = calls();
    const S = state({ deleteHeld: true });

    expect(handleUiDeleteButton(S, deps(c), DELETE, 0)).toBe(false);

    expect(S.deleteHeld).toBe(false);
    expect(c.log).toEqual([["padmap"]]);
  });

  test("Loop+Delete on melodic AUTO bank resets the active automation lane and consumes the CC", () => {
    const c = calls();
    const S = state({
      loopHeld: true,
      activeBank: 6,
      activeTrack: 1,
      sessionView: false,
      pendingDefaultSetParams: [{ key: "older", val: "1" }],
    });

    expect(handleUiDeleteButton(S, deps(c), DELETE, 127)).toBe(true);

    expect(S.deleteHeld).toBe(true);
    expect(S.ccLaneLoopStart[1][1][2]).toBe(0);
    expect(S.ccLaneLength[1][1][2]).toBe(0);
    expect(S.ccLaneTps[1][1][2]).toBe(0);
    expect(S.ccLaneResTps[1][1][2]).toBe(0);
    expect(S.undoAvailable).toBe(true);
    expect(S.redoAvailable).toBe(false);
    expect(S.undoSeqArpSnapshot).toBeNull();
    expect(traceDspWrites(S, c.log).directSetParams).toEqual([]);
    expect(traceDspWrites(S, c.log).queuedOperations).toEqual([
      { key: "older", val: "1" },
      { key: "t1_c1_k2_cc_lane_reset", val: "1" },
    ]);
    expect(c.log).toEqual([["popup", "LANE LOOP", "RESET"], ["redraw"], ["padmap"]]);
  });

  test("Delete press on melodic AUTO bank arms the clear automation menu", () => {
    const c = calls();
    const S = state({ activeBank: 6, activeTrack: 1, sessionView: false });

    expect(handleUiDeleteButton(S, deps(c), DELETE, 127)).toBe(false);

    expect(S.deleteTapArmed).toBe(true);
    expect(c.log).toEqual([["padmap"]]);
  });

  test("Delete press does not arm the clear automation menu in Session View, drum tracks, or when already open", () => {
    const cases = [
      state({ activeBank: 6, activeTrack: 1, sessionView: true }),
      state({ activeBank: 6, activeTrack: 0, sessionView: false }),
      state({ activeBank: 6, activeTrack: 1, sessionView: false, clearAutoMenu: { sel: 0 } }),
    ];

    for (const S of cases) {
      const c = calls();
      expect(handleUiDeleteButton(S, deps(c), DELETE, 127)).toBe(false);
      expect(S.deleteTapArmed).toBe(false);
      expect(c.log).toEqual([["padmap"]]);
    }
  });

  test("Delete release after an armed tap opens the clear automation menu", () => {
    const c = calls();
    const S = state({ deleteHeld: true, deleteTapArmed: true });

    expect(handleUiDeleteButton(S, deps(c), DELETE, 0)).toBe(false);

    expect(S.deleteHeld).toBe(false);
    expect(S.deleteTapArmed).toBe(false);
    expect(c.log).toEqual([["openClearAutoMenu"], ["padmap"]]);
  });
});

describe("Button CC workflow - Capture button", () => {
  test("ignores non-Capture CCs", () => {
    const c = calls();
    const d = deps(c);

    expect(handleUiCaptureButton(state(), d, 51, 127)).toBeUndefined();
    expect(handleUiCaptureButton(state(), d, 51, 0)).toBeUndefined();

    expect(c.log).toEqual([]);
  });

  test("Capture press tracks held state and clears modifier use", () => {
    const c = calls();
    const S = state({ captureUsedAsModifier: true });

    handleUiCaptureButton(S, deps(c), CAPTURE, 127);

    expect(S.captureHeld).toBe(true);
    expect(S.captureUsedAsModifier).toBe(false);
    expect(c.log).toEqual([["padmap"], ["redraw"]]);
  });

  test("Capture press cancels the scene-bake picker as a modifier", () => {
    const c = calls();
    const S = state({ pendingSceneBakePicker: true });

    handleUiCaptureButton(S, deps(c), CAPTURE, 127);

    expect(S.pendingSceneBakePicker).toBe(false);
    expect(S.captureUsedAsModifier).toBe(true);
  });

  test("Capture press cancels pending merge placement and queues merge_cancel", () => {
    const c = calls();
    const S = state({
      pendingMergePlacement: true,
      pendingDefaultSetParams: [{ key: "older", val: "1" }],
    });

    handleUiCaptureButton(S, deps(c), CAPTURE, 127);

    expect(S.pendingMergePlacement).toBe(false);
    expect(S.captureUsedAsModifier).toBe(true);
    expect(traceDspWrites(S, c.log)).toEqual({
      directSetParams: [],
      queuedOperations: [
        { key: "older", val: "1" },
        { key: "merge_cancel", val: "1" },
      ],
    });
    expect(c.log).toEqual([["padmap"], ["redraw"]]);
  });

  test("Capture press cancels the clip-bake confirm and its sub-flags", () => {
    const c = calls();
    const S = state({
      confirmBake: true,
      confirmBakeDrumLoopOpen: true,
      confirmBakeWrapPhase: true,
    });

    handleUiCaptureButton(S, deps(c), CAPTURE, 127);

    expect(S.confirmBake).toBe(false);
    expect(S.confirmBakeDrumLoopOpen).toBe(false);
    expect(S.confirmBakeWrapPhase).toBe(false);
    expect(S.captureUsedAsModifier).toBe(true);
  });

  test("Capture press cancels the scene-bake confirm", () => {
    const c = calls();
    const S = state({ confirmBakeScene: true });

    handleUiCaptureButton(S, deps(c), CAPTURE, 127);

    expect(S.confirmBakeScene).toBe(false);
    expect(S.captureUsedAsModifier).toBe(true);
  });

  test("bare-tap release in Track View on a melodic track opens the multi-loop clip-bake confirm", () => {
    const c = calls();
    const S = state({ captureHeld: true, sessionView: false, activeTrack: 1 });

    handleUiCaptureButton(S, deps(c), CAPTURE, 0);

    expect(S.captureHeld).toBe(false);
    expect(S.confirmBake).toBe(true);
    expect(S.confirmBakeIsDrum).toBe(false);
    expect(S.confirmBakeIsMultiLoop).toBe(true);
    expect(S.confirmBakeSel).toBe(1);
    expect(S.confirmBakeTrack).toBe(1);
    expect(S.confirmBakeClip).toBe(3);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([["padmap"], ["redraw"]]);
  });

  test("bare-tap release in Track View on a drum track opens the drum clip-bake confirm", () => {
    const c = calls();
    const S = state({ captureHeld: true, sessionView: false, activeTrack: 0 });

    handleUiCaptureButton(S, deps(c), CAPTURE, 0);

    expect(S.confirmBake).toBe(true);
    expect(S.confirmBakeIsDrum).toBe(true);
    expect(S.confirmBakeIsMultiLoop).toBe(false);
    expect(S.confirmBakeSel).toBe(2);
    expect(S.confirmBakeTrack).toBe(0);
    expect(S.confirmBakeClip).toBe(0);
  });

  test("bare-tap release in Session View arms the scene-bake picker", () => {
    const c = calls();
    const S = state({ captureHeld: true, sessionView: true });

    handleUiCaptureButton(S, deps(c), CAPTURE, 0);

    expect(S.pendingSceneBakePicker).toBe(true);
    expect(S.confirmBake).toBe(false);
    expect(S.screenDirty).toBe(true);
  });

  test("release after modifier use opens nothing", () => {
    const c = calls();
    const S = state({ captureHeld: true, captureUsedAsModifier: true, sessionView: false });

    handleUiCaptureButton(S, deps(c), CAPTURE, 0);

    expect(S.captureHeld).toBe(false);
    expect(S.confirmBake).toBe(false);
    expect(S.pendingSceneBakePicker).toBe(false);
    expect(c.log).toEqual([["padmap"], ["redraw"]]);
  });
});

describe("Button CC workflow - Copy button", () => {
  test("ignores non-Copy CCs", () => {
    const c = calls();
    expect(handleUiCopyButton(state(), deps(c), 59, 127)).toBeUndefined();
    expect(c.log).toEqual([]);
  });

  test("Copy press sets held state and re-pushes the pad map (no LED invalidate)", () => {
    const c = calls();
    const S = state();

    handleUiCopyButton(S, deps(c), COPY, 127);

    expect(S.copyHeld).toBe(true);
    expect(c.log).toEqual([["padmap"]]);
  });

  test("Copy release clears held state, drops the copy source, and invalidates LEDs", () => {
    const c = calls();
    const S = state({ copyHeld: true, copySrc: { track: 1, clip: 2 } });

    handleUiCopyButton(S, deps(c), COPY, 0);

    expect(S.copyHeld).toBe(false);
    expect(S.copySrc).toBeNull();
    expect(c.log).toEqual([["ledInvalidate"], ["padmap"]]);
  });
});

describe("Button CC workflow - Mute modifier tracker", () => {
  test("ignores non-Mute CCs", () => {
    const c = calls();
    expect(handleUiMuteModifierButton(state(), deps(c), 87, 127)).toBeUndefined();
    expect(c.log).toEqual([]);
  });

  test("Mute press sets held state and clears modifier-use", () => {
    const c = calls();
    const S = state({ muteUsedAsModifier: true });

    handleUiMuteModifierButton(S, deps(c), MUTE, 127);

    expect(S.muteHeld).toBe(true);
    expect(S.muteUsedAsModifier).toBe(false);
    expect(c.log).toEqual([["padmap"]]);
  });

  test("Mute release clears held state but leaves modifier-use untouched", () => {
    const c = calls();
    const S = state({ muteHeld: true, muteUsedAsModifier: true });

    handleUiMuteModifierButton(S, deps(c), MUTE, 0);

    expect(S.muteHeld).toBe(false);
    expect(S.muteUsedAsModifier).toBe(true); // only press resets it
    expect(c.log).toEqual([["padmap"]]);
  });

  test("Mute in Session View invalidates the LED cache before re-pushing the pad map", () => {
    const c = calls();
    const S = state({ sessionView: true });

    handleUiMuteModifierButton(S, deps(c), MUTE, 127);

    expect(c.log).toEqual([["ledInvalidate"], ["padmap"]]);
  });
});

describe("Button CC workflow - Menu co-run exit", () => {
  test("ignores non-Menu CCs", () => {
    const c = calls();
    const S = state({ schwungCoRunSlot: 2 });
    expect(handleUiMenuCoRunExitButton(S, deps(c), DELETE, 127)).toBe(false);
    expect(c.log).toEqual([]);
  });

  test("ignores Menu release", () => {
    const c = calls();
    const S = state({ schwungCoRunSlot: 2 });
    expect(handleUiMenuCoRunExitButton(S, deps(c), MENU, 0)).toBe(false);
    expect(c.log).toEqual([]);
  });

  test("Menu press with no Schwung co-run is a no-op", () => {
    const c = calls();
    const S = state({ schwungCoRunSlot: -1 });
    expect(handleUiMenuCoRunExitButton(S, deps(c), MENU, 127)).toBe(false);
    expect(c.log).toEqual([]);
  });

  test("Menu press during Schwung co-run exits and redraws", () => {
    const c = calls();
    const S = state({ schwungCoRunSlot: 0 });
    expect(handleUiMenuCoRunExitButton(S, deps(c), MENU, 127)).toBe(true);
    expect(c.log).toEqual([["exitCoRun"], ["redraw"]]);
  });
});

describe("Button CC workflow - Loop perf mode (Session View)", () => {
  test("ignores non-Loop CCs", () => {
    const c = calls();
    const S = state({ sessionView: true });
    expect(handleUiLoopPerfModeButton(S, deps(c), MUTE, 127)).toBe(false);
    expect(c.log).toEqual([]);
  });

  test("ignores Loop in Track View (defers to the track-view sibling)", () => {
    const c = calls();
    const S = state({ sessionView: false });
    expect(handleUiLoopPerfModeButton(S, deps(c), LOOP, 127)).toBe(false);
    expect(c.log).toEqual([]);
  });

  test("Shift+Loop press toggles perf latch mode", () => {
    const c = calls();
    const S = state({ sessionView: true, shiftHeld: true, perfLatchMode: false });
    expect(handleUiLoopPerfModeButton(S, deps(c), LOOP, 127)).toBe(true);
    expect(S.perfLatchMode).toBe(true);
    expect(S.loopHeld).toBe(false); // shift branch returns before touching loopHeld
    expect(c.log).toEqual([["redraw"]]);
  });

  test("plain Loop press records press tick and held state", () => {
    const c = calls();
    const S = state({ sessionView: true, tickCount: 123, loopPressTick: -1 });
    expect(handleUiLoopPerfModeButton(S, deps(c), LOOP, 127)).toBe(true);
    expect(S.loopPressTick).toBe(123);
    expect(S.loopHeld).toBe(true);
    expect(c.log).toEqual([["redraw"]]);
  });

  test("locked + tap release unlocks and stops the looper", () => {
    const c = calls();
    const S = state({
      sessionView: true,
      perfViewLocked: true,
      loopHeld: true,
      loopJogActive: true,
      perfStack: [{ idx: 0, ticks: 48 }],
      perfStickyLengths: new Set([0]),
      perfHoldPadHeld: true,
      perfModsHeld: 2,
      tickCount: 10,
      loopPressTick: 0, // 10 < 40 => tap
    });
    expect(handleUiLoopPerfModeButton(S, deps(c), LOOP, 0)).toBe(true);
    expect(S.perfViewLocked).toBe(false);
    expect(S.loopHeld).toBe(false);
    expect(S.loopJogActive).toBe(false);
    expect(S.perfStack).toEqual([]);
    expect(S.perfStickyLengths.size).toBe(0);
    expect(S.perfHoldPadHeld).toBe(false);
    expect(S.perfModsHeld).toBe(0);
    expect(c.log).toEqual([
      ["perfMods"],
      ["setParam", "looper_stop", "1"],
      ["ledInvalidate"],
      ["redraw"],
    ]);
  });

  test("locked + hold release is a swallowed no-op", () => {
    const c = calls();
    const S = state({
      sessionView: true,
      perfViewLocked: true,
      tickCount: 100,
      loopPressTick: 0, // 100 >= 40 => hold, not a tap
    });
    expect(handleUiLoopPerfModeButton(S, deps(c), LOOP, 0)).toBe(true);
    expect(S.perfViewLocked).toBe(true); // unchanged
    expect(c.log).toEqual([]);
  });

  test("unlocked + tap release locks perf mode", () => {
    const c = calls();
    const S = state({
      sessionView: true,
      perfViewLocked: false,
      tickCount: 10,
      loopPressTick: 0, // tap
    });
    expect(handleUiLoopPerfModeButton(S, deps(c), LOOP, 0)).toBe(true);
    expect(S.perfViewLocked).toBe(true);
    expect(S.loopHeld).toBe(true);
    expect(c.log).toEqual([["redraw"]]);
  });

  test("unlocked + hold release with sticky lengths auto-locks and arms", () => {
    const c = calls();
    const S = state({
      sessionView: true,
      perfViewLocked: false,
      perfHoldPadHeld: false,
      perfStickyLengths: new Set([0, 2]),
      perfStack: [
        { idx: 0, ticks: 24 },
        { idx: 1, ticks: 48 }, // dropped: idx not sticky
        { idx: 2, ticks: 96 },
      ],
      tickCount: 100,
      loopPressTick: 0, // hold
    });
    expect(handleUiLoopPerfModeButton(S, deps(c), LOOP, 0)).toBe(true);
    expect(S.perfViewLocked).toBe(true);
    expect(S.perfStack).toEqual([
      { idx: 0, ticks: 24 },
      { idx: 2, ticks: 96 },
    ]);
    expect(c.log).toEqual([
      ["setParam", "looper_arm", "96"], // last surviving entry's ticks
      ["perfMods"],
      ["ledInvalidate"],
      ["redraw"],
    ]);
  });

  test("unlocked + hold release with hold pad keeps the full stack", () => {
    const c = calls();
    const S = state({
      sessionView: true,
      perfViewLocked: false,
      perfHoldPadHeld: true,
      perfStickyLengths: new Set<number>(),
      perfStack: [
        { idx: 0, ticks: 24 },
        { idx: 1, ticks: 48 },
      ],
      tickCount: 100,
      loopPressTick: 0, // hold
    });
    expect(handleUiLoopPerfModeButton(S, deps(c), LOOP, 0)).toBe(true);
    expect(S.perfViewLocked).toBe(true);
    expect(S.perfStack).toEqual([
      { idx: 0, ticks: 24 },
      { idx: 1, ticks: 48 },
    ]); // not filtered when a hold pad is down
    expect(c.log).toEqual([
      ["setParam", "looper_arm", "48"],
      ["perfMods"],
      ["ledInvalidate"],
      ["redraw"],
    ]);
  });

  test("unlocked + hold release with no sticky state stops and clears the stack", () => {
    const c = calls();
    const S = state({
      sessionView: true,
      perfViewLocked: false,
      perfHoldPadHeld: false,
      perfStickyLengths: new Set<number>(),
      perfStack: [{ idx: 0, ticks: 24 }],
      tickCount: 100,
      loopPressTick: 0, // hold
    });
    expect(handleUiLoopPerfModeButton(S, deps(c), LOOP, 0)).toBe(true);
    expect(S.perfViewLocked).toBe(false);
    expect(S.perfStack).toEqual([]);
    expect(c.log).toEqual([
      ["setParam", "looper_stop", "1"],
      ["perfMods"],
      ["ledInvalidate"],
      ["redraw"],
    ]);
  });
});

describe("Button CC workflow - Loop track view", () => {
  test("ignores non-Loop CCs", () => {
    const c = calls();
    expect(handleUiLoopTrackViewButton(state(), deps(c), MUTE, 127)).toBe(false);
    expect(c.log).toEqual([]);
  });

  test("ignores Loop in Session View (defers to the perf-mode sibling)", () => {
    const c = calls();
    const S = state({ sessionView: true });
    expect(handleUiLoopTrackViewButton(S, deps(c), LOOP, 127)).toBe(false);
    expect(c.log).toEqual([]);
  });

  test("Arp Steps overlay press only tracks held + redraws", () => {
    const c = calls();
    const S = state({ stepIntervalMode: true, loopGestureStart: 4 });
    expect(handleUiLoopTrackViewButton(S, deps(c), LOOP, 127)).toBe(true);
    expect(S.loopHeld).toBe(true);
    expect(S.loopGestureStart).toBe(4); // press never clears the gesture
    expect(c.log).toEqual([["padmap"], ["redraw"]]);
  });

  test("Arp Steps overlay release clears an in-flight gesture", () => {
    const c = calls();
    const S = state({ stepIntervalMode: true, loopGestureStart: 4 });
    expect(handleUiLoopTrackViewButton(S, deps(c), LOOP, 0)).toBe(true);
    expect(S.loopHeld).toBe(false);
    expect(S.loopGestureStart).toBe(-1);
    expect(c.log).toEqual([["padmap"], ["redraw"]]);
  });

  test("Delete+Loop on the auto bank resets the active lane (melodic)", () => {
    const c = calls();
    const S = state({
      activeTrack: 1,
      deleteHeld: true,
      activeBank: 6,
      pendingDefaultSetParams: [{ key: "older", val: "1" }],
    });
    // effectiveClip(1) => 1, ccActiveLane[1] => 2: target [1][1][2]
    expect(handleUiLoopTrackViewButton(S, deps(c), LOOP, 127)).toBe(true);
    expect(S.ccLaneLoopStart[1][1][2]).toBe(0);
    expect(S.ccLaneLength[1][1][2]).toBe(0);
    expect(S.ccLaneTps[1][1][2]).toBe(0);
    expect(S.ccLaneResTps[1][1][2]).toBe(0);
    expect(S.undoAvailable).toBe(true);
    expect(S.redoAvailable).toBe(false);
    expect(S.undoSeqArpSnapshot).toBe(null);
    expect(traceDspWrites(S, c.log).directSetParams).toEqual([]);
    expect(traceDspWrites(S, c.log).queuedOperations).toEqual([
      { key: "older", val: "1" },
      { key: "t1_c1_k2_cc_lane_reset", val: "1" },
    ]);
    expect(c.log).toEqual([
      ["padmap"],
      ["prepLoopPress", 1, false, 0],
      ["popup", "LANE LOOP", "RESET"],
      ["redraw"],
    ]);
  });

  test("Delete+Loop on a drum track stops the drum repeat latch and returns early", () => {
    const c = calls();
    const S = state({ activeTrack: 0, deleteHeld: true }); // track 0 is drum
    expect(handleUiLoopTrackViewButton(S, deps(c), LOOP, 127)).toBe(true);
    expect(c.log).toEqual([
      ["padmap"],
      ["prepLoopPress", 0, true, 0],
      ["delLoopStop", 0],
    ]);
  });

  test("TARP latch shortcut turns latch off when a pad is held and latch is on", () => {
    const c = calls();
    const S = state({
      activeTrack: 1,
      liveActiveNotes: new Set([60]),
      pendingDefaultSetParams: [{ key: "older", val: "1" }],
    });
    S.bankParams[1][5][7] = 1; // latch currently on
    expect(handleUiLoopTrackViewButton(S, deps(c), LOOP, 127)).toBe(true);
    expect(S.bankParams[1][5][7]).toBe(0);
    expect(traceDspWrites(S, c.log).directSetParams).toEqual([]);
    expect(traceDspWrites(S, c.log).queuedOperations).toEqual([
      { key: "older", val: "1" },
      { key: "t1_tarp_latch", val: "0" },
    ]);
    expect(c.log).toEqual([
      ["padmap"],
      ["prepLoopPress", 1, false, 1],
      ["latchHeld", 1],
      ["redraw"],
    ]);
  });

  test("TARP latch shortcut turns latch on when off and a style is set", () => {
    const c = calls();
    const S = state({
      activeTrack: 1,
      liveActiveNotes: new Set([60]),
      pendingDefaultSetParams: [{ key: "older", val: "1" }],
    });
    S.bankParams[1][5][7] = 0; // latch off
    S.bankParams[1][5][0] = 1; // TARP style set
    expect(handleUiLoopTrackViewButton(S, deps(c), LOOP, 127)).toBe(true);
    expect(S.bankParams[1][5][7]).toBe(1);
    expect(traceDspWrites(S, c.log).directSetParams).toEqual([]);
    expect(traceDspWrites(S, c.log).queuedOperations).toEqual([
      { key: "older", val: "1" },
      { key: "t1_tarp_latch", val: "1" },
    ]);
  });

  test("TARP latch shortcut is a no-op when latch off and no style set", () => {
    const c = calls();
    const S = state({ activeTrack: 1, liveActiveNotes: new Set([60]) });
    S.bankParams[1][5][7] = 0;
    S.bankParams[1][5][0] = 0; // no style
    expect(handleUiLoopTrackViewButton(S, deps(c), LOOP, 127)).toBe(true);
    expect(S.bankParams[1][5][7]).toBe(0);
    expect(S.pendingDefaultSetParams).toEqual([]);
  });

  test("Loop press with no pads held clears the latched TARP buffer", () => {
    const c = calls();
    const S = state({ activeTrack: 1 }); // liveActiveNotes empty
    S.bankParams[1][5][7] = 1; // latch on
    S.tarpHeldNotes[1] = new Set([62, 64]);
    expect(handleUiLoopTrackViewButton(S, deps(c), LOOP, 127)).toBe(true);
    expect(S.tarpHeldNotes[1].size).toBe(0);
    expect(c.log).toEqual([
      ["padmap"],
      ["prepLoopPress", 1, false, 0],
      ["setParam", "t1_tarp_clear_latched", "1"],
      ["latchHeld", 1],
      ["redraw"],
    ]);
  });

  test("plain Loop press latches held repeats and clears step-hold trackers", () => {
    const c = calls();
    const S = state({ activeTrack: 1, tickCount: 77 });
    expect(handleUiLoopTrackViewButton(S, deps(c), LOOP, 127)).toBe(true);
    expect(S.loopPressTick).toBe(77);
    expect(S.heldStepBtn).toBe(-1);
    expect(S.heldStep).toBe(-1);
    expect(S.heldStepNotes).toEqual([]);
    expect(S.stepWasEmpty).toBe(false);
    expect(S.stepWasHeld).toBe(false);
    expect(S.stepBtnPressedTick).toEqual([-1, -1, -1, -1, -1, -1, -1, -1]);
    expect(S.sessionStepHeld).toBe(-1);
    expect(S.sessionStepHeldCtx).toBe(0);
    expect(c.log).toEqual([
      ["padmap"],
      ["prepLoopPress", 1, false, 0],
      ["latchHeld", 1],
      ["redraw"],
    ]);
  });

  test("Loop release with an in-flight gesture resolves it then runs tap-release", () => {
    const c = calls();
    const S = state({ activeTrack: 1, loopGestureStart: 2, loopTapUnlatchTrack: 1 });
    expect(handleUiLoopTrackViewButton(S, deps(c), LOOP, 0)).toBe(true);
    expect(S.loopJogActive).toBe(false);
    expect(S.loopTapUnlatchTrack).toBe(-1);
    expect(c.log).toEqual([
      ["padmap"],
      ["resolveGesture", true],
      ["tapRelease"],
      ["redraw"],
    ]);
  });

  test("Loop release with no gesture only runs tap-release", () => {
    const c = calls();
    const S = state({ activeTrack: 1, loopGestureStart: -1 });
    expect(handleUiLoopTrackViewButton(S, deps(c), LOOP, 0)).toBe(true);
    expect(c.log).toEqual([["padmap"], ["tapRelease"], ["redraw"]]);
  });
});

describe("Button CC workflow - Note/Session button", () => {
  test("ignores non-matching CCs", () => {
    const c = calls();
    const S = state();
    expect(handleUiNoteSessionButton(S, deps(c), DELETE, 127)).toBe(false);
    expect(c.log).toEqual([]);
  });

  test("Move co-run swallows the press (no view toggle, no dialog change)", () => {
    const c = calls();
    const S = state({ moveCoRunTrack: 2, sessionView: false });
    expect(handleUiNoteSessionButton(S, deps(c), NOTE_SESSION, 127)).toBe(true);
    expect(S.sessionView).toBe(false);
    expect(c.log).toEqual([]);
  });

  test("Move co-run swallows the release too", () => {
    const c = calls();
    const S = state({ moveCoRunTrack: 0 });
    expect(handleUiNoteSessionButton(S, deps(c), NOTE_SESSION, 0)).toBe(true);
    expect(c.log).toEqual([]);
  });

  describe("press dialog dismissal", () => {
    test("snapshot picker confirm backs out to the list", () => {
      const c = calls();
      const S = state({ snapshotPicker: { confirm: { sel: 1 } } });
      expect(handleUiNoteSessionButton(S, deps(c), NOTE_SESSION, 127)).toBe(true);
      expect(S.snapshotPicker!.confirm).toBe(null);
      expect(c.log).toEqual([["redraw"]]);
    });

    test("snapshot picker without confirm closes the picker", () => {
      const c = calls();
      const S = state({ snapshotPicker: { confirm: null } });
      expect(handleUiNoteSessionButton(S, deps(c), NOTE_SESSION, 127)).toBe(true);
      expect(c.log).toEqual([["closeSnapshot"], ["redraw"]]);
    });

    test("Shift+press with global menu open closes it", () => {
      const c = calls();
      const S = state({ shiftHeld: true, globalMenuOpen: true });
      expect(handleUiNoteSessionButton(S, deps(c), NOTE_SESSION, 127)).toBe(true);
      expect(S.globalMenuOpen).toBe(false);
      expect(c.log).toEqual([["redraw"]]);
    });

    test("Shift+press with no menu opens the global menu", () => {
      const c = calls();
      const S = state({ shiftHeld: true, globalMenuOpen: false });
      expect(handleUiNoteSessionButton(S, deps(c), NOTE_SESSION, 127)).toBe(true);
      expect(c.log).toEqual([["openGlobalMenu"]]);
    });

    test("route check dialog closes", () => {
      const c = calls();
      const S = state({ routeCheckOpen: true });
      expect(handleUiNoteSessionButton(S, deps(c), NOTE_SESSION, 127)).toBe(true);
      expect(S.routeCheckOpen).toBe(false);
      expect(c.log).toEqual([["redraw"]]);
    });

    test("tap tempo overlay closes", () => {
      const c = calls();
      const S = state({ tapTempoOpen: true });
      expect(handleUiNoteSessionButton(S, deps(c), NOTE_SESSION, 127)).toBe(true);
      expect(c.log).toEqual([["closeTapTempo"], ["redraw"]]);
    });

    test("state-wipe confirm exits the module", () => {
      const c = calls();
      const S = state({ confirmStateWipe: true });
      expect(handleUiNoteSessionButton(S, deps(c), NOTE_SESSION, 127)).toBe(true);
      expect(S.confirmStateWipe).toBe(false);
      expect(c.log).toEqual([
        ["removeFlags"],
        ["clearLEDs"],
        ["exitModule"],
        ["redraw"],
      ]);
    });

    test("record-blocked dialog closes", () => {
      const c = calls();
      const S = state({ recordBlockedDialog: true });
      expect(handleUiNoteSessionButton(S, deps(c), NOTE_SESSION, 127)).toBe(true);
      expect(S.recordBlockedDialog).toBe(false);
      expect(c.log).toEqual([["redraw"]]);
    });

    test("legato confirm closes", () => {
      const c = calls();
      const S = state({ confirmLgto: true });
      expect(handleUiNoteSessionButton(S, deps(c), NOTE_SESSION, 127)).toBe(true);
      expect(S.confirmLgto).toBe(false);
      expect(c.log).toEqual([["redraw"]]);
    });

    test("bake confirm closes and clears the wrap-phase flag", () => {
      const c = calls();
      const S = state({ confirmBake: true, confirmBakeWrapPhase: true });
      expect(handleUiNoteSessionButton(S, deps(c), NOTE_SESSION, 127)).toBe(true);
      expect(S.confirmBake).toBe(false);
      expect(S.confirmBakeWrapPhase).toBe(false);
      expect(c.log).toEqual([["redraw"]]);
    });

    test("global menu + clear-session confirm closes", () => {
      const c = calls();
      const S = state({ globalMenuOpen: true, confirmClearSession: true });
      expect(handleUiNoteSessionButton(S, deps(c), NOTE_SESSION, 127)).toBe(true);
      expect(S.confirmClearSession).toBe(false);
      expect(S.globalMenuOpen).toBe(true); // menu stays open under the confirm
      expect(c.log).toEqual([["redraw"]]);
    });

    test("global menu + save-state confirm closes", () => {
      const c = calls();
      const S = state({ globalMenuOpen: true, confirmSaveState: true });
      expect(handleUiNoteSessionButton(S, deps(c), NOTE_SESSION, 127)).toBe(true);
      expect(S.confirmSaveState).toBe(false);
      expect(c.log).toEqual([["redraw"]]);
    });

    test("global menu + convert-to-drum confirm closes via helper", () => {
      const c = calls();
      const S = state({ globalMenuOpen: true, confirmConvertToDrum: true });
      expect(handleUiNoteSessionButton(S, deps(c), NOTE_SESSION, 127)).toBe(true);
      expect(c.log).toEqual([["closeConvert"], ["redraw"]]);
    });

    test("global menu + export-done dialog closes both dialog and menu", () => {
      const c = calls();
      const S = state({ globalMenuOpen: true, exportDoneDialog: true });
      expect(handleUiNoteSessionButton(S, deps(c), NOTE_SESSION, 127)).toBe(true);
      expect(S.exportDoneDialog).toBe(false);
      expect(S.globalMenuOpen).toBe(false);
      expect(c.log).toEqual([["redraw"]]);
    });

    test("global menu + export confirm closes", () => {
      const c = calls();
      const S = state({ globalMenuOpen: true, confirmExport: true });
      expect(handleUiNoteSessionButton(S, deps(c), NOTE_SESSION, 127)).toBe(true);
      expect(S.confirmExport).toBe(false);
      expect(c.log).toEqual([["redraw"]]);
    });

    test("plain global menu closes and clears the last-sent edit value", () => {
      const c = calls();
      const S = state({ globalMenuOpen: true, lastSentMenuEditValue: 42 });
      expect(handleUiNoteSessionButton(S, deps(c), NOTE_SESSION, 127)).toBe(true);
      expect(S.globalMenuOpen).toBe(false);
      expect(S.lastSentMenuEditValue).toBe(null);
      expect(c.log).toEqual([["redraw"]]);
    });

    test("arp-steps overlay exits without switching view", () => {
      const c = calls();
      const S = state({ stepIntervalMode: true, sessionView: false });
      expect(handleUiNoteSessionButton(S, deps(c), NOTE_SESSION, 127)).toBe(true);
      expect(S.stepIntervalMode).toBe(false);
      expect(S.sessionView).toBe(false);
      expect(c.log).toEqual([["padmap"], ["redraw"]]);
    });
  });

  test("plain press with no dialogs toggles the view momentarily", () => {
    const c = calls();
    const S = state({ sessionView: false, tickCount: 100, noteSessionPressedTick: -1 });
    expect(handleUiNoteSessionButton(S, deps(c), NOTE_SESSION, 127)).toBe(true);
    expect(S.noteSessionPressedTick).toBe(100);
    expect(S.sessionViewMomentary).toBe(true);
    expect(S.sessionView).toBe(true);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([["switchViewCleanup"], ["ledInvalidate"]]);
  });

  test("tap release makes the view switch permanent (no switch back)", () => {
    const c = calls();
    const S = state({
      sessionView: true,
      sessionViewMomentary: true,
      noteSessionPressedTick: 100,
      tickCount: 100 + NOTE_SESSION_HOLD_TICKS - 1,
    });
    expect(handleUiNoteSessionButton(S, deps(c), NOTE_SESSION, 0)).toBe(true);
    expect(S.sessionViewMomentary).toBe(false);
    expect(S.sessionView).toBe(true); // unchanged
    expect(S.noteSessionPressedTick).toBe(-1);
    expect(c.log).toEqual([]);
  });

  test("hold release switches back to the original view", () => {
    const c = calls();
    const S = state({
      sessionView: true,
      sessionViewMomentary: true,
      noteSessionPressedTick: 100,
      tickCount: 100 + NOTE_SESSION_HOLD_TICKS,
    });
    expect(handleUiNoteSessionButton(S, deps(c), NOTE_SESSION, 0)).toBe(true);
    expect(S.sessionViewMomentary).toBe(false);
    expect(S.sessionView).toBe(false); // switched back
    expect(S.noteSessionPressedTick).toBe(-1);
    expect(c.log).toEqual([["switchViewCleanup"], ["ledInvalidate"], ["redraw"]]);
  });

  test("release with nothing pending just resets the press tick", () => {
    const c = calls();
    const S = state({ sessionViewMomentary: false, noteSessionPressedTick: -1 });
    expect(handleUiNoteSessionButton(S, deps(c), NOTE_SESSION, 0)).toBe(true);
    expect(S.noteSessionPressedTick).toBe(-1);
    expect(c.log).toEqual([]);
  });
});
