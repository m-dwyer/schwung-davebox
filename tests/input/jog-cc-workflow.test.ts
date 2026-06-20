import { describe, expect, test } from "vitest";
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
  handleUiJogSchwungSoundPage,
  handleUiJogSnapshotPicker,
  handleUiJogStateWipe,
  handleUiJogStepIntervalExit,
  handleUiJogStepIntervalToggle,
  handleUiJogTapTempo,
} from "@overture-ui/input/ui_jog_cc_workflow.mjs";

const DRUM = 1;
const MAIN_KNOB = 14; // MoveMainKnob (jog rotate)

// Jog click = CC 3 d2 127. Rotate = CC 14, d2 decoded to a signed delta.
const CLICK: [number, number] = [3, 127];
const ROTATE_CW: [number, number] = [MAIN_KNOB, 10]; // delta +1
const ROTATE_CCW: [number, number] = [MAIN_KNOB, 100]; // delta -1
const ROTATE_ZERO: [number, number] = [MAIN_KNOB, 0]; // delta 0

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    fn(name: string) {
      return (...args: unknown[]) => log.push([name, ...args]);
    },
  };
}

function grid(t: number, fill: () => unknown) {
  return Array.from({ length: t }, fill);
}

// 2 tracks (0 = drum, 1 = melodic), 2 clips, 2 lanes, 8 knobs, 8 banks.
// All dialogs/overlays default OFF; tests flip the one they exercise.
function state(overrides: Record<string, unknown> = {}) {
  return {
    activeTrack: 1,
    activeBank: 0,
    activeDrumLane: [0, 0],
    trackPadMode: [DRUM, 0], // track 0 drum, track 1 melodic
    trackActiveClip: [0, 0],
    trackActiveBank: [0, 0],
    screenDirty: false,
    tickCount: 100,
    bankSelectTick: 0,
    schLabelFetchLane: -1,
    // modifiers
    shiftHeld: false,
    deleteHeld: false,
    copyHeld: false,
    muteHeld: false,
    altMode: false,
    sessionView: false,
    loopHeld: false,
    heldStep: -1,
    // overlays / pickers
    stepIntervalMode: false,
    pendingInheritPicker: null as unknown,
    snapshotPicker: false,
    clearAutoMenu: false,
    // scene bake
    confirmBakeScene: false,
    confirmBakeSceneWrapPhase: false,
    confirmBakeSceneWrapSel: 1,
    confirmBakeSceneSel: 0,
    confirmBakeSceneClip: 0,
    confirmBakeSceneLoops: 0,
    pendingSceneBakeResync: 0,
    pendingSceneBakeClip: -1,
    // lgto
    confirmLgto: false,
    confirmLgtoSel: 0,
    confirmLgtoIsDrum: false,
    // state wipe
    confirmStateWipe: false,
    confirmStateWipeSel: 0,
    pendingSetLoad: false,
    // rec blocked
    recordBlockedDialog: false,
    recordBlockedDialogSel: 0,
    // bake
    confirmBake: false,
    confirmBakeIsDrum: false,
    confirmBakeIsMultiLoop: false,
    confirmBakeSel: 0,
    confirmBakeTrack: 0,
    confirmBakeClip: 0,
    confirmBakeDrumLoopOpen: false,
    confirmBakeDrumLoopSel: 1,
    confirmBakeWrapPhase: false,
    confirmBakeWrapSel: 1,
    confirmBakeLoops: 0,
    confirmBakeDrumMode: 0,
    pendingBankRefresh: -1,
    // tap tempo
    tapTempoOpen: false,
    tapTempoBpm: 120,
    // global menu
    globalMenuOpen: false,
    routeCheckOpen: false,
    routeCheckSelected: 0,
    exportDoneDialog: false,
    confirmClearSession: false,
    confirmClearSel: 0,
    confirmSaveState: false,
    confirmSaveSel: 0,
    confirmConvertToDrum: false,
    confirmConvertTrack: -1,
    confirmConvertToDrumSel: 0,
    pendingTrackConvert: null as unknown,
    confirmExport: false,
    confirmExportSel: 0,
    confirmXpose: false,
    confirmXposeSel: 0,
    confirmXposeKey: -1,
    confirmXposeScale: -1,
    globalMenuState: { selectedIndex: 0, editing: false, editValue: null as unknown },
    globalMenuItems: [] as unknown[],
    globalMenuStack: [] as unknown[],
    lastSentMenuEditValue: 0,
    bpmWasEditing: false,
    padKey: 0,
    padScale: 0,
    // shared undo/resync
    undoAvailable: false,
    redoAvailable: false,
    undoSeqArpSnapshot: null as unknown,
    pendingDrumResync: 0,
    pendingDrumResyncTrack: -1,
    pendingStepsReread: 0,
    pendingStepsRereadTrack: -1,
    pendingStepsRereadClip: -1,
    pendingDefaultSetParams: [] as Array<{ key: string; val: string }>,
    // bank/clip param arrays
    bankParams: grid(2, () => grid(8, () => [0, 0, 0, 0, 0, 0, 0, 0])),
    clipSeqFollow: grid(2, () => [false, false]),
    trackCCAutoBits: grid(2, () => [0, 0]),
    trackCCLiveVal: grid(2, () => [-1, -1, -1, -1, -1, -1, -1, -1]),
    clipCCVal: grid(2, () => grid(2, () => [-1, -1, -1, -1, -1, -1, -1, -1])),
    clipAtHas: grid(2, () => [false, false]),
    clipPlaybackDir: grid(2, () => [0, 0]),
    clipPlaybackAudioReverse: grid(2, () => [0, 0]),
    drumLanePlaybackDir: grid(2, () => [0, 0]),
    drumLanePlaybackAudioReverse: grid(2, () => [0, 0]),
    drumPerformMode: [0, 0],
    // movement
    sceneRow: 0,
    drumLaneSteps: grid(2, () => grid(2, () => Array(16).fill("0"))),
    heldStepNotes: [] as unknown[],
    drumLaneTPS: [48, 48],
    clipTPS: grid(2, () => [48, 48]),
    stepEditGate: 48,
    allLanesConfirmed: false,
    seqActiveNotes: new Set<number>(),
    seqLastStep: 5,
    seqLastClip: 1,
    ...overrides,
  };
}

function deps(c: ReturnType<typeof calls>, overrides: Record<string, unknown> = {}) {
  return {
    moveMainKnob: MAIN_KNOB,
    padModeDrum: DRUM,
    numTracks: 8,
    numClips: 16,
    banks: Array.from({ length: 8 }, () => ({
      knobs: Array.from({ length: 8 }, () => ({ def: 0 })),
    })),
    decodeDelta: (d2: number) => (d2 === 0 ? 0 : d2 <= 63 ? 1 : -1),
    setParam: c.fn("setParam"),
    exitModule: c.fn("exitModule"),
    forceRedraw: c.fn("redraw"),
    computePadNoteMap: c.fn("padmap"),
    showActionPopup: c.fn("popup"),
    invalidateLEDCache: c.fn("ledInvalidate"),
    effectiveClip: (_t: number) => 0,
    resolveInheritPicker: c.fn("resolveInherit"),
    snapshotPickerClick: c.fn("snapClick"),
    snapshotPickerRotate: c.fn("snapRotate"),
    clearAutoMenuClick: c.fn("clearAutoClick"),
    clearAutoMenuRotate: c.fn("clearAutoRotate"),
    closeTapTempo: c.fn("closeTapTempo"),
    removeFlagsWrap: c.fn("removeFlags"),
    clearAllLEDs: c.fn("clearLEDs"),
    doClearSession: c.fn("doClearSession"),
    openSaveSnapshot: c.fn("openSaveSnapshot"),
    closeConvertConfirm: c.fn("closeConvert"),
    confirmExportStart: c.fn("confirmExportStart"),
    xposeCommit: c.fn("xposeCommit"),
    xposeCancelPreview: c.fn("xposeCancel"),
    anyMelodicClipHasContent: () => false,
    handleMenuInput: c.fn("menuInput"),
    ensureGlobalMenuFresh: c.fn("menuFresh"),
    resetFxBanks: c.fn("resetFxBanks"),
    resetSingleFxBank: c.fn("resetSingleFxBank"),
    resetTarp: c.fn("resetTarp"),
    resetDrumRepeatGrooveForLane: c.fn("resetGroove"),
    bankHasAltParams: () => false,
    extNoteOffAll: c.fn("extNoteOff"),
    handoffRecordingToTrack: c.fn("handoff"),
    switchActiveTrack: c.fn("switchTrack"),
    resyncDrumTrack: c.fn("resyncDrum"),
    refreshPerClipBankParams: c.fn("refreshClip"),
    readBankParams: c.fn("readBank"),
    writeSidecar: c.fn("writeSidecar"),
    handleLoopJog: c.fn("loopJog"),
    openSchwungSoundBrowser: c.fn("openSoundBrowser"),
    applySchwungSoundBrowserSelection: c.fn("applySoundBrowser"),
    closeSchwungSoundPage: c.fn("closeSoundPage"),
    enterSchwungCoRun: c.fn("enterSchwung"),
    rotateSchwungSoundPage: c.fn("rotateSoundPage"),
    toggleSchwungSoundParamDetail: c.fn("toggleSoundParams"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
describe("Jog CC workflow - step interval exit (rotate)", () => {
  test("ignores when not in step-interval mode", () => {
    const c = calls();
    expect(handleUiJogStepIntervalExit(state(), deps(c), ...ROTATE_CW)).toBe(false);
  });

  test("ignores a click even while in step-interval mode (toggle handles click)", () => {
    const c = calls();
    expect(handleUiJogStepIntervalExit(state({ stepIntervalMode: true }), deps(c), ...CLICK)).toBe(false);
  });

  test("a rotate exits the overlay and repushes the padmap", () => {
    const c = calls();
    const S = state({ stepIntervalMode: true });
    expect(handleUiJogStepIntervalExit(S, deps(c), ...ROTATE_CW)).toBe(true);
    expect(S.stepIntervalMode).toBe(false);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([["padmap"], ["redraw"]]);
  });

  test("a zero-delta rotate still swallows but does not exit", () => {
    const c = calls();
    const S = state({ stepIntervalMode: true });
    expect(handleUiJogStepIntervalExit(S, deps(c), ...ROTATE_ZERO)).toBe(true);
    expect(S.stepIntervalMode).toBe(true);
    expect(c.log).toEqual([]);
  });
});

describe("Jog CC workflow - inherit picker", () => {
  test("ignores when no picker is pending", () => {
    const c = calls();
    expect(handleUiJogInheritPicker(state(), deps(c), ...CLICK)).toBe(false);
  });

  test("click confirms the selected candidate", () => {
    const c = calls();
    const S = state({ pendingInheritPicker: { selectedIndex: 1, candidates: ["a", "b"] } });
    expect(handleUiJogInheritPicker(S, deps(c), ...CLICK)).toBe(true);
    expect(c.log).toEqual([["resolveInherit", 1]]);
  });

  test("click on the trailing 'Start blank' slot resolves -1", () => {
    const c = calls();
    const S = state({ pendingInheritPicker: { selectedIndex: 2, candidates: ["a", "b"] } });
    expect(handleUiJogInheritPicker(S, deps(c), ...CLICK)).toBe(true);
    expect(c.log).toEqual([["resolveInherit", -1]]);
  });

  test("rotate advances the index modulo candidates+1", () => {
    const c = calls();
    const S = state({ pendingInheritPicker: { selectedIndex: 2, candidates: ["a", "b"] } });
    expect(handleUiJogInheritPicker(S, deps(c), ...ROTATE_CW)).toBe(true);
    expect((S.pendingInheritPicker as { selectedIndex: number }).selectedIndex).toBe(0); // (2+1)%3
    expect(S.screenDirty).toBe(true);
  });

  test("a non-click, non-rotate event falls through", () => {
    const c = calls();
    const S = state({ pendingInheritPicker: { selectedIndex: 0, candidates: ["a"] } });
    expect(handleUiJogInheritPicker(S, deps(c), 3, 0)).toBe(false); // jog release (d2=0)
  });
});

describe("Jog CC workflow - snapshot picker", () => {
  test("ignores when picker closed", () => {
    const c = calls();
    expect(handleUiJogSnapshotPicker(state(), deps(c), ...CLICK)).toBe(false);
  });

  test("click delegates to snapshotPickerClick", () => {
    const c = calls();
    expect(handleUiJogSnapshotPicker(state({ snapshotPicker: true }), deps(c), ...CLICK)).toBe(true);
    expect(c.log).toEqual([["snapClick"]]);
  });

  test("rotate delegates to snapshotPickerRotate with the decoded delta", () => {
    const c = calls();
    expect(handleUiJogSnapshotPicker(state({ snapshotPicker: true }), deps(c), ...ROTATE_CCW)).toBe(true);
    expect(c.log).toEqual([["snapRotate", -1]]);
  });
});

describe("Jog CC workflow - clear automation menu", () => {
  test("ignores when menu closed", () => {
    const c = calls();
    expect(handleUiJogClearAutoMenu(state(), deps(c), ...CLICK)).toBe(false);
  });

  test("click delegates to clearAutoMenuClick", () => {
    const c = calls();
    expect(handleUiJogClearAutoMenu(state({ clearAutoMenu: true }), deps(c), ...CLICK)).toBe(true);
    expect(c.log).toEqual([["clearAutoClick"]]);
  });

  test("rotate delegates to clearAutoMenuRotate with the decoded delta", () => {
    const c = calls();
    expect(handleUiJogClearAutoMenu(state({ clearAutoMenu: true }), deps(c), ...ROTATE_CW)).toBe(true);
    expect(c.log).toEqual([["clearAutoRotate", 1]]);
  });
});

describe("Jog CC workflow - scene bake confirm", () => {
  test("ignores when no scene-bake confirm", () => {
    const c = calls();
    expect(handleUiJogBakeScene(state(), deps(c), ...CLICK)).toBe(false);
  });

  test("click with selection > 0 advances to the wrap phase", () => {
    const c = calls();
    const S = state({ confirmBakeScene: true, confirmBakeSceneSel: 2 });
    expect(handleUiJogBakeScene(S, deps(c), ...CLICK)).toBe(true);
    expect(S.confirmBakeSceneWrapPhase).toBe(true);
    expect(S.confirmBakeSceneLoops).toBe(2); // [1,2,4][1]
    expect(S.confirmBakeSceneWrapSel).toBe(1);
  });

  test("click with selection 0 cancels", () => {
    const c = calls();
    const S = state({ confirmBakeScene: true, confirmBakeSceneSel: 0 });
    expect(handleUiJogBakeScene(S, deps(c), ...CLICK)).toBe(true);
    expect(S.confirmBakeScene).toBe(false);
  });

  test("wrap-phase click YES queues a bake_scene param and pops the popup", () => {
    const c = calls();
    const S = state({
      confirmBakeScene: true,
      confirmBakeSceneWrapPhase: true,
      confirmBakeSceneWrapSel: 0,
      confirmBakeSceneClip: 3,
      confirmBakeSceneLoops: 4,
    });
    expect(handleUiJogBakeScene(S, deps(c), ...CLICK)).toBe(true);
    expect(S.pendingDefaultSetParams).toEqual([{ key: "bake_scene", val: "3 4 1" }]);
    expect(S.confirmBakeScene).toBe(false);
    expect(S.pendingSceneBakeResync).toBe(2);
    expect(c.log).toEqual([["popup", "SCENE", "BAKED"]]);
  });

  test("rotate cycles the selection 0..3", () => {
    const c = calls();
    const S = state({ confirmBakeScene: true, confirmBakeSceneSel: 3 });
    expect(handleUiJogBakeScene(S, deps(c), ...ROTATE_CW)).toBe(true);
    expect(S.confirmBakeSceneSel).toBe(0); // (3+1)%4
  });
});

describe("Jog CC workflow - lgto confirm", () => {
  test("ignores when no lgto confirm", () => {
    const c = calls();
    expect(handleUiJogConfirmLgto(state(), deps(c), ...CLICK)).toBe(false);
  });

  test("melodic OK click applies lgto + schedules a steps reread", () => {
    const c = calls();
    const S = state({ confirmLgto: true, confirmLgtoSel: 0, confirmLgtoIsDrum: false, activeTrack: 1 });
    expect(handleUiJogConfirmLgto(S, deps(c), ...CLICK)).toBe(true);
    expect(S.confirmLgto).toBe(false);
    expect(S.pendingStepsReread).toBe(2);
    expect(S.pendingStepsRereadTrack).toBe(1);
    expect(c.log).toContainEqual(["setParam", "t1_lgto_apply", "1"]);
    expect(c.log).toContainEqual(["popup", "LGTO", "APPLIED"]);
  });

  test("drum OK click applies the per-lane lgto + schedules a drum resync", () => {
    const c = calls();
    const S = state({ confirmLgto: true, confirmLgtoSel: 0, confirmLgtoIsDrum: true, activeTrack: 0, activeDrumLane: [1, 0] });
    expect(handleUiJogConfirmLgto(S, deps(c), ...CLICK)).toBe(true);
    expect(S.pendingDrumResync).toBe(2);
    expect(c.log).toContainEqual(["setParam", "t0_l1_lgto_apply", "1"]);
  });

  test("CANCEL click closes without applying", () => {
    const c = calls();
    const S = state({ confirmLgto: true, confirmLgtoSel: 1 });
    expect(handleUiJogConfirmLgto(S, deps(c), ...CLICK)).toBe(true);
    expect(S.confirmLgto).toBe(false);
    expect(c.log.some((e) => e[0] === "setParam")).toBe(false);
  });

  test("rotate flips the selection", () => {
    const c = calls();
    const S = state({ confirmLgto: true, confirmLgtoSel: 0 });
    expect(handleUiJogConfirmLgto(S, deps(c), ...ROTATE_CW)).toBe(true);
    expect(S.confirmLgtoSel).toBe(1);
  });
});

describe("Jog CC workflow - state wipe confirm", () => {
  test("ignores when no state-wipe confirm", () => {
    const c = calls();
    expect(handleUiJogStateWipe(state(), deps(c), ...CLICK)).toBe(false);
  });

  test("YES click arms pendingSetLoad", () => {
    const c = calls();
    const S = state({ confirmStateWipe: true, confirmStateWipeSel: 0 });
    expect(handleUiJogStateWipe(S, deps(c), ...CLICK)).toBe(true);
    expect(S.pendingSetLoad).toBe(true);
    expect(c.log).toEqual([["redraw"]]);
  });

  test("NO click exits the module after clearing LEDs", () => {
    const c = calls();
    const S = state({ confirmStateWipe: true, confirmStateWipeSel: 1 });
    expect(handleUiJogStateWipe(S, deps(c), ...CLICK)).toBe(true);
    expect(S.pendingSetLoad).toBe(false);
    expect(c.log).toEqual([["removeFlags"], ["clearLEDs"], ["exitModule"], ["redraw"]]);
  });

  test("rotate flips the selection", () => {
    const c = calls();
    const S = state({ confirmStateWipe: true, confirmStateWipeSel: 0 });
    expect(handleUiJogStateWipe(S, deps(c), ...ROTATE_CCW)).toBe(true);
    expect(S.confirmStateWipeSel).toBe(1);
  });
});

describe("Jog CC workflow - record blocked dialog", () => {
  test("ignores when dialog closed", () => {
    const c = calls();
    expect(handleUiJogRecordBlocked(state(), deps(c), ...CLICK)).toBe(false);
  });

  test("BAKE NOW click opens a melodic bake confirm at the active clip", () => {
    const c = calls();
    const S = state({ recordBlockedDialog: true, recordBlockedDialogSel: 1, activeTrack: 1, trackActiveClip: [0, 4] });
    expect(handleUiJogRecordBlocked(S, deps(c), ...CLICK)).toBe(true);
    expect(S.recordBlockedDialog).toBe(false);
    expect(S.confirmBake).toBe(true);
    expect(S.confirmBakeIsDrum).toBe(false);
    expect(S.confirmBakeIsMultiLoop).toBe(true);
    expect(S.confirmBakeClip).toBe(4);
    expect(S.confirmBakeSel).toBe(1);
  });

  test("OK click just dismisses", () => {
    const c = calls();
    const S = state({ recordBlockedDialog: true, recordBlockedDialogSel: 0 });
    expect(handleUiJogRecordBlocked(S, deps(c), ...CLICK)).toBe(true);
    expect(S.recordBlockedDialog).toBe(false);
    expect(S.confirmBake).toBe(false);
  });

  test("rotate flips the selection", () => {
    const c = calls();
    const S = state({ recordBlockedDialog: true, recordBlockedDialogSel: 0 });
    expect(handleUiJogRecordBlocked(S, deps(c), ...ROTATE_CW)).toBe(true);
    expect(S.recordBlockedDialogSel).toBe(1);
  });
});

describe("Jog CC workflow - bake confirm", () => {
  test("ignores when no bake confirm", () => {
    const c = calls();
    expect(handleUiJogBakeConfirm(state(), deps(c), ...CLICK)).toBe(false);
  });

  test("melodic single-loop OK click bakes immediately", () => {
    const c = calls();
    const S = state({ confirmBake: true, confirmBakeIsDrum: false, confirmBakeIsMultiLoop: false, confirmBakeSel: 0, confirmBakeTrack: 1, confirmBakeClip: 2 });
    expect(handleUiJogBakeConfirm(S, deps(c), ...CLICK)).toBe(true);
    expect(c.log).toContainEqual(["setParam", "bake", "1 2"]);
    expect(c.log).toContainEqual(["popup", "BAKED"]);
    expect(S.pendingStepsReread).toBe(2);
  });

  test("multi-loop OK click advances to the wrap phase", () => {
    const c = calls();
    const S = state({ confirmBake: true, confirmBakeIsMultiLoop: true, confirmBakeSel: 2 });
    expect(handleUiJogBakeConfirm(S, deps(c), ...CLICK)).toBe(true);
    expect(S.confirmBakeWrapPhase).toBe(true);
    expect(S.confirmBakeLoops).toBe(2);
  });

  test("drum step-1 LANE click opens the loop-count phase", () => {
    const c = calls();
    const S = state({ confirmBake: true, confirmBakeIsDrum: true, confirmBakeSel: 1 });
    expect(handleUiJogBakeConfirm(S, deps(c), ...CLICK)).toBe(true);
    expect(S.confirmBakeDrumMode).toBe(1);
    expect(S.confirmBakeDrumLoopOpen).toBe(true);
  });

  test("wrap-phase YES click (melodic) queues a bake param", () => {
    const c = calls();
    const S = state({ confirmBake: true, confirmBakeWrapPhase: true, confirmBakeWrapSel: 0, confirmBakeIsDrum: false, confirmBakeLoops: 4, confirmBakeTrack: 1, confirmBakeClip: 0 });
    expect(handleUiJogBakeConfirm(S, deps(c), ...CLICK)).toBe(true);
    expect(S.pendingDefaultSetParams).toEqual([{ key: "bake", val: "1 0 0 4 0 1" }]);
    expect(S.confirmBake).toBe(false);
    expect(c.log).toContainEqual(["popup", "BAKED", "4x"]);
  });

  test("rotate in the wrap phase cycles 0..2", () => {
    const c = calls();
    const S = state({ confirmBake: true, confirmBakeWrapPhase: true, confirmBakeWrapSel: 2 });
    expect(handleUiJogBakeConfirm(S, deps(c), ...ROTATE_CW)).toBe(true);
    expect(S.confirmBakeWrapSel).toBe(0); // (2+1)%3
  });

  test("rotate in the drum loop phase cycles 0..3", () => {
    const c = calls();
    const S = state({ confirmBake: true, confirmBakeIsDrum: true, confirmBakeDrumLoopOpen: true, confirmBakeDrumLoopSel: 3 });
    expect(handleUiJogBakeConfirm(S, deps(c), ...ROTATE_CW)).toBe(true);
    expect(S.confirmBakeDrumLoopSel).toBe(0); // (3+1)%4
  });

  test("rotate (melodic single) toggles the selection", () => {
    const c = calls();
    const S = state({ confirmBake: true, confirmBakeIsDrum: false, confirmBakeIsMultiLoop: false, confirmBakeSel: 0 });
    expect(handleUiJogBakeConfirm(S, deps(c), ...ROTATE_CW)).toBe(true);
    expect(S.confirmBakeSel).toBe(1);
  });
});

describe("Jog CC workflow - tap tempo", () => {
  test("ignores when tap tempo closed", () => {
    const c = calls();
    expect(handleUiJogTapTempo(state(), deps(c), ...ROTATE_CW)).toBe(false);
  });

  test("click closes the overlay", () => {
    const c = calls();
    const S = state({ tapTempoOpen: true });
    expect(handleUiJogTapTempo(S, deps(c), ...CLICK)).toBe(true);
    expect(c.log).toEqual([["closeTapTempo"]]);
  });

  test("unshifted rotate nudges BPM and pushes bpm", () => {
    const c = calls();
    const S = state({ tapTempoOpen: true, tapTempoBpm: 120 });
    expect(handleUiJogTapTempo(S, deps(c), ...ROTATE_CW)).toBe(true);
    expect(S.tapTempoBpm).toBe(121);
    expect(c.log).toEqual([["setParam", "bpm", "121"]]);
  });

  test("BPM clamps to the 40..250 range", () => {
    const c = calls();
    const S = state({ tapTempoOpen: true, tapTempoBpm: 250 });
    expect(handleUiJogTapTempo(S, deps(c), ...ROTATE_CW)).toBe(true);
    expect(S.tapTempoBpm).toBe(250);
  });

  test("a SHIFTED rotate is NOT consumed (falls through to movement)", () => {
    const c = calls();
    const S = state({ tapTempoOpen: true, shiftHeld: true });
    expect(handleUiJogTapTempo(S, deps(c), ...ROTATE_CW)).toBe(false);
  });
});

describe("Jog CC workflow - global menu", () => {
  test("ignores when menu closed", () => {
    const c = calls();
    expect(handleUiJogGlobalMenu(state(), deps(c), ...CLICK)).toBe(false);
  });

  test("route-check click closes the route view", () => {
    const c = calls();
    const S = state({ globalMenuOpen: true, routeCheckOpen: true });
    expect(handleUiJogGlobalMenu(S, deps(c), ...CLICK)).toBe(true);
    expect(S.routeCheckOpen).toBe(false);
  });

  test("clear-session YES click runs doClearSession", () => {
    const c = calls();
    const S = state({ globalMenuOpen: true, confirmClearSession: true, confirmClearSel: 0 });
    expect(handleUiJogGlobalMenu(S, deps(c), ...CLICK)).toBe(true);
    expect(c.log).toEqual([["doClearSession"]]);
  });

  test("convert-to-drum YES click arms pendingTrackConvert", () => {
    const c = calls();
    const S = state({ globalMenuOpen: true, confirmConvertToDrum: true, confirmConvertToDrumSel: 0, confirmConvertTrack: 3 });
    expect(handleUiJogGlobalMenu(S, deps(c), ...CLICK)).toBe(true);
    expect(S.pendingTrackConvert).toEqual({ t: 3, toDrum: true });
    expect(c.log).toEqual([["closeConvert"]]);
  });

  test("a generic menu click delegates to handleMenuInput with cc=3", () => {
    const c = calls();
    const S = state({ globalMenuOpen: true, globalMenuItems: [{ type: "value" }] });
    expect(handleUiJogGlobalMenu(S, deps(c), ...CLICK)).toBe(true);
    const call = c.log.find((e) => e[0] === "menuInput");
    expect((call?.[1] as { cc: number }).cc).toBe(3);
  });

  test("rotate refreshes the menu then edits a value item", () => {
    const c = calls();
    const S = state({
      globalMenuOpen: true,
      globalMenuState: { selectedIndex: 0, editing: true, editValue: 5 },
      globalMenuItems: [{ type: "value", min: 0, max: 10, get: () => 5 }],
    });
    expect(handleUiJogGlobalMenu(S, deps(c), ...ROTATE_CW)).toBe(true);
    expect(c.log[0]).toEqual(["menuFresh"]);
    expect((S.globalMenuState as { editValue: number }).editValue).toBe(6);
  });

  test("rotate delegates to handleMenuInput (cc=14) when not editing", () => {
    const c = calls();
    const S = state({ globalMenuOpen: true });
    expect(handleUiJogGlobalMenu(S, deps(c), ...ROTATE_CW)).toBe(true);
    const call = c.log.find((e) => e[0] === "menuInput");
    expect((call?.[1] as { cc: number }).cc).toBe(MAIN_KNOB);
  });
});

describe("Jog CC workflow - shift+delete reset", () => {
  test("ignores without both modifiers", () => {
    const c = calls();
    expect(handleUiJogShiftDeleteReset(state({ shiftHeld: true, deleteHeld: false }), deps(c), ...CLICK)).toBe(false);
  });

  test("ignores in session view", () => {
    const c = calls();
    expect(handleUiJogShiftDeleteReset(state({ shiftHeld: true, deleteHeld: true, sessionView: true }), deps(c), ...CLICK)).toBe(false);
  });

  test("drum track resets the lane params", () => {
    const c = calls();
    const S = state({ shiftHeld: true, deleteHeld: true, activeTrack: 0 }); // track 0 = drum
    expect(handleUiJogShiftDeleteReset(S, deps(c), ...CLICK)).toBe(true);
    expect(S.bankParams[0][0][7]).toBe(1);
    expect(c.log).toContainEqual(["resetFxBanks", 0]);
    expect(c.log).toContainEqual(["popup", "LANE PARAMS", "RESET"]);
  });

  test("melodic track resets clip params + automation", () => {
    const c = calls();
    const S = state({ shiftHeld: true, deleteHeld: true, activeTrack: 1 }); // track 1 = melodic
    expect(handleUiJogShiftDeleteReset(S, deps(c), ...CLICK)).toBe(true);
    expect(S.trackCCAutoBits[1][0]).toBe(0);
    expect(S.undoSeqArpSnapshot).toEqual({ track: 1, params: [0, 0, 0, 0, 0, 0, 0, 0] });
    expect(c.log).toContainEqual(["popup", "CLIP PARAMS", "RESET"]);
  });
});

describe("Jog CC workflow - delete reset", () => {
  test("ignores without delete held", () => {
    const c = calls();
    expect(handleUiJogDeleteReset(state(), deps(c), ...CLICK)).toBe(false);
  });

  test("CC PARAM bank clears all automation regardless of pad mode", () => {
    const c = calls();
    const S = state({ deleteHeld: true, activeBank: 6, activeTrack: 1 });
    expect(handleUiJogDeleteReset(S, deps(c), ...CLICK)).toBe(true);
    expect(S.trackCCAutoBits[1][0]).toBe(0);
    expect(S.pendingDefaultSetParams).toContainEqual({ key: "t1_cc_auto_clear", val: "0" });
    expect(c.log).toContainEqual(["popup", "AUTOMATION", "CLEAR"]);
    expect(c.log).toContainEqual(["ledInvalidate"]);
  });

  test("drum Rpt mode resets the lane groove", () => {
    const c = calls();
    const S = state({ deleteHeld: true, activeTrack: 0, activeBank: 5, drumPerformMode: [2, 0] });
    expect(handleUiJogDeleteReset(S, deps(c), ...CLICK)).toBe(true);
    expect(c.log).toContainEqual(["resetGroove", 0, 0]);
  });

  test("drum normal mode resets the active real-time FX bank", () => {
    const c = calls();
    const S = state({ deleteHeld: true, activeTrack: 0, activeBank: 2, drumPerformMode: [0, 0] });
    expect(handleUiJogDeleteReset(S, deps(c), ...CLICK)).toBe(true);
    expect(c.log).toContainEqual(["resetSingleFxBank", 0, 2]);
    expect(c.log).toContainEqual(["popup", "BANK RESET"]);
  });

  test("melodic ARP IN bank resets TARP", () => {
    const c = calls();
    const S = state({ deleteHeld: true, activeTrack: 1, activeBank: 5 });
    expect(handleUiJogDeleteReset(S, deps(c), ...CLICK)).toBe(true);
    expect(c.log).toContainEqual(["resetTarp", 1]);
    expect(c.log).toContainEqual(["popup", "ARP IN", "RESET"]);
  });

  test("melodic other bank resets FX banks", () => {
    const c = calls();
    const S = state({ deleteHeld: true, activeTrack: 1, activeBank: 0 });
    expect(handleUiJogDeleteReset(S, deps(c), ...CLICK)).toBe(true);
    expect(c.log).toContainEqual(["resetFxBanks", 1]);
    expect(S.undoSeqArpSnapshot).toBe(null);
  });
});

describe("Jog CC workflow - step interval toggle (click)", () => {
  test("ignores on a drum track", () => {
    const c = calls();
    expect(handleUiJogStepIntervalToggle(state({ activeTrack: 0, activeBank: 4 }), deps(c), ...CLICK)).toBe(false);
  });

  test("ignores on a non arp/tarp bank", () => {
    const c = calls();
    expect(handleUiJogStepIntervalToggle(state({ activeTrack: 1, activeBank: 0 }), deps(c), ...CLICK)).toBe(false);
  });

  test("ignores when a modifier is held", () => {
    const c = calls();
    expect(handleUiJogStepIntervalToggle(state({ activeTrack: 1, activeBank: 4, shiftHeld: true }), deps(c), ...CLICK)).toBe(false);
  });

  test("toggles the overlay on bank 4", () => {
    const c = calls();
    const S = state({ activeTrack: 1, activeBank: 4 });
    expect(handleUiJogStepIntervalToggle(S, deps(c), ...CLICK)).toBe(true);
    expect(S.stepIntervalMode).toBe(true);
    expect(c.log).toEqual([["padmap"], ["redraw"]]);
  });
});

describe("Jog CC workflow - alt toggle (click)", () => {
  test("ignores when the bank has no alt params", () => {
    const c = calls();
    expect(handleUiJogAltToggle(state({ activeBank: 0 }), deps(c, { bankHasAltParams: () => false }), ...CLICK)).toBe(false);
  });

  test("toggles altMode when the bank has alt params", () => {
    const c = calls();
    const S = state({ activeTrack: 1, activeBank: 3 });
    expect(handleUiJogAltToggle(S, deps(c, { bankHasAltParams: () => true }), ...CLICK)).toBe(true);
    expect(S.altMode).toBe(true);
    expect(c.log).toEqual([["redraw"]]);
  });

  test("first click on an unconfirmed drum ALL LANES bank confirms instead of toggling alt", () => {
    const c = calls();
    const S = state({ activeTrack: 0, activeBank: 7, allLanesConfirmed: false });
    expect(handleUiJogAltToggle(S, deps(c, { bankHasAltParams: () => true }), ...CLICK)).toBe(true);
    expect(S.allLanesConfirmed).toBe(true);
    expect(S.altMode).toBe(false);
  });
});

describe("Jog CC workflow - Schwung Sound page", () => {
  test("Shift+jog click enters Schwung deep edit", () => {
    const c = calls();
    const S = state({ shiftHeld: true, schwungSoundPage: { track: 4, slot: 0, paramDetail: true, browser: false } });
    expect(handleUiJogSchwungSoundPage(S, deps(c), ...CLICK)).toBe(true);
    expect(c.log).toEqual([["closeSoundPage"], ["enterSchwung", 4, 0], ["redraw"]]);
  });

  test("plain jog click still opens browser and rotate delegates to the Sound page", () => {
    const c = calls();
    const S = state({ schwungSoundPage: { paramDetail: true, browser: false } });
    expect(handleUiJogSchwungSoundPage(S, deps(c), ...CLICK)).toBe(true);
    expect(c.log).toEqual([["openSoundBrowser"], ["redraw"]]);

    c.log.length = 0;
    expect(handleUiJogSchwungSoundPage(S, deps(c), ...ROTATE_CW)).toBe(true);
    expect(c.log).toEqual([["rotateSoundPage", 1], ["redraw"]]);
  });
});

describe("Jog CC workflow - movement (rotate)", () => {
  test("ignores a click", () => {
    const c = calls();
    expect(handleUiJogMovement(state(), deps(c), ...CLICK)).toBe(false);
  });

  test("a zero-delta rotate still swallows", () => {
    const c = calls();
    expect(handleUiJogMovement(state(), deps(c), ...ROTATE_ZERO)).toBe(true);
  });

  test("shift+rotate steps the active track and resyncs", () => {
    const c = calls();
    const S = state({ shiftHeld: true, activeTrack: 1 });
    expect(handleUiJogMovement(S, deps(c), ...ROTATE_CW)).toBe(true);
    expect(c.log).toContainEqual(["switchTrack", 2]);
    expect(c.log).toContainEqual(["handoff", 2]);
    expect(S.seqLastStep).toBe(-1);
  });

  test("session-view rotate scrolls the scene row, clamped", () => {
    const c = calls();
    const S = state({ sessionView: true, sceneRow: 0 });
    expect(handleUiJogMovement(S, deps(c), ...ROTATE_CW)).toBe(true);
    expect(S.sceneRow).toBe(1);
  });

  test("loop-held rotate delegates to handleLoopJog", () => {
    const c = calls();
    const S = state({ loopHeld: true });
    expect(handleUiJogMovement(S, deps(c), ...ROTATE_CW)).toBe(true);
    expect(c.log).toEqual([["loopJog", 1]]);
  });

  test("held-step rotate with content edits the step gate", () => {
    const c = calls();
    const S = state({ activeTrack: 1, heldStep: 3, heldStepNotes: [60], stepEditGate: 48 });
    expect(handleUiJogMovement(S, deps(c), ...ROTATE_CW)).toBe(true);
    expect(c.log.some((e) => e[0] === "setParam" && String(e[1]).includes("step_3_gate"))).toBe(true);
  });

  test("held-step rotate on an empty step is inert (no bank cycle)", () => {
    const c = calls();
    const S = state({ activeTrack: 1, heldStep: 3, heldStepNotes: [], activeBank: 0 });
    expect(handleUiJogMovement(S, deps(c), ...ROTATE_CW)).toBe(true);
    expect(S.activeBank).toBe(0);
    expect(c.log).toEqual([]);
  });

  test("plain melodic rotate cycles banks up to 6", () => {
    const c = calls();
    const S = state({ activeTrack: 1, activeBank: 0 });
    expect(handleUiJogMovement(S, deps(c), ...ROTATE_CW)).toBe(true);
    expect(S.activeBank).toBe(1);
    expect(S.trackActiveBank[1]).toBe(1);
    expect(c.log).toContainEqual(["readBank", 1, 1]);
    expect(c.log).toContainEqual(["writeSidecar"]);
  });

  test("plain drum rotate follows the drum bank order", () => {
    const c = calls();
    // drum order [7,0,1,3,5,6]; from bank 0 (index 1), +1 -> index 2 -> bank 1
    const S = state({ activeTrack: 0, activeBank: 0 });
    expect(handleUiJogMovement(S, deps(c), ...ROTATE_CW)).toBe(true);
    expect(S.activeBank).toBe(1);
  });
});
