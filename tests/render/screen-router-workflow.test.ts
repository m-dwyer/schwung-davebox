import { beforeEach, describe, expect, test } from "vitest";
import { drawUIImpl } from "@overture-ui/render/ui_screen_router_workflow.mjs";

type DrawCall = [string, ...unknown[]];

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    schwungCoRunSlot: -1,
    moveCoRunTrack: -1,
    trackChannel: [1, 2, 3, 4, 1, 1, 1, 1],
    tickCount: 8,
    altMode: false,
    sessionView: false,
    activeBank: 0,
    activeTrack: 0,
    _altPrevBank: 0,
    _altPrevTrack: 0,
    sessionOverlayHeld: false,
    pendingInheritPicker: null,
    snapshotPicker: null,
    clearAutoMenu: null,
    pendingSceneBakePicker: false,
    pendingMergePlacement: false,
    confirmStateWipe: false,
    recordBlockedDialog: false,
    confirmLgto: false,
    confirmXpose: false,
    confirmBakeScene: false,
    confirmBake: false,
    globalMenuOpen: false,
    tapTempoOpen: false,
    loopHeld: false,
    perfViewLocked: false,
    stateLoading: false,
    bootSplashTicks: 0,
    splashWasVisible: false,
    actionPopupEndTick: -1,
    bankSelectTick: -1,
    jogTouched: false,
    stretchBlockedEndTick: -1,
    heldStep: -1,
    knobTouched: -1,
    noNoteFlashEndTick: -1,
    shiftHeld: false,
    deleteHeld: false,
    copyHeld: false,
    muteHeld: false,
    trackPadMode: [0, 0, 0, 0, 0, 0, 0, 0],
    stepIntervalMode: false,
    activeDrumLane: [0, 0, 0, 0, 0, 0, 0, 0],
    ...overrides,
  };
}

function deps(calls: DrawCall[], stepEditResult = true) {
  const factory = (name: string) => () => {
    const value = { name };
    calls.push(["factory", name]);
    return value;
  };
  const render = (name: string) => (...args: unknown[]) => calls.push([name, ...args]);
  return {
    paintCoRunSideButtons: render("paintCoRunSideButtons"),
    renderSessionOverview: render("renderSessionOverview"),
    drawInheritPicker: render("drawInheritPicker"),
    drawSnapshotPicker: render("drawSnapshotPicker"),
    drawClearAutoMenu: render("drawClearAutoMenu"),
    renderSceneBakePickerPrompt: render("renderSceneBakePickerPrompt"),
    renderMergePlacementPrompt: render("renderMergePlacementPrompt"),
    drawStateWipeConfirm: render("drawStateWipeConfirm"),
    drawRecordBlockedDialog: render("drawRecordBlockedDialog"),
    drawLgtoConfirm: render("drawLgtoConfirm"),
    drawXposeConfirm: render("drawXposeConfirm"),
    drawBakeSceneConfirm: render("drawBakeSceneConfirm"),
    drawBakeConfirm: render("drawBakeConfirm"),
    ensureGlobalMenuFresh: render("ensureGlobalMenuFresh"),
    drawGlobalMenu: render("drawGlobalMenu"),
    renderPerfModeOled: render("renderPerfModeOled"),
    renderSplashScreen: render("renderSplashScreen"),
    clear_screen: render("clear_screen"),
    renderSessionActionPopup: render("renderSessionActionPopup"),
    renderSessionIdleView: render("renderSessionIdleView"),
    renderCompressLimitNotice: render("renderCompressLimitNotice"),
    renderTrackActionPopup: render("renderTrackActionPopup"),
    renderNoNoteFlashNotice: render("renderNoNoteFlashNotice"),
    renderShiftStepHelp: render("renderShiftStepHelp"),
    renderCcStepEditView: render("renderCcStepEditView"),
    renderTrackStepEditView: (...args: unknown[]) => {
      calls.push(["renderTrackStepEditView", ...args]);
      return stepEditResult;
    },
    renderLoopView: render("renderLoopView"),
    renderStepIntervalOverlay: render("renderStepIntervalOverlay"),
    renderMotionIdleView: render("renderMotionIdleView"),
    bankHasAltParams: (track: number, bank: number) => {
      calls.push(["bankHasAltParams", track, bank]);
      return true;
    },
    renderParamPeek: render("renderParamPeek"),
    syncDrumRepeatState: render("syncDrumRepeatState"),
    renderTrackBankOverview: render("renderTrackBankOverview"),
    renderDrumTrackIdleView: render("renderDrumTrackIdleView"),
    renderMelodicTrackIdleView: render("renderMelodicTrackIdleView"),
    // One Render Surface replaces the former 16 per-render deps factories; the
    // router calls deps.renderSurface() wherever it used to build a bespoke bag.
    renderSurface: factory("renderSurface"),
  };
}

function routedName(calls: DrawCall[]) {
  return calls.find((call) => call[0] !== "factory")?.[0];
}

describe("Screen router workflow", () => {
  let calls: DrawCall[];

  beforeEach(() => {
    calls = [];
  });

  test("co-run states return before normal OLED routing", () => {
    drawUIImpl(baseState({ schwungCoRunSlot: 2 }) as any, deps(calls) as any);
    expect(calls).toEqual([]);

    drawUIImpl(baseState({ moveCoRunTrack: 1, trackChannel: [1, 3], tickCount: 8 }) as any, deps(calls) as any);
    expect(calls).toEqual([["paintCoRunSideButtons", 4, true]]);
  });

  test("modal priority is fixed before global menu and splash routes", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ sessionOverlayHeld: true, pendingInheritPicker: { id: 1 } }, "renderSessionOverview"],
      [{ pendingInheritPicker: { id: 1 }, snapshotPicker: { id: 2 } }, "drawInheritPicker"],
      [{ snapshotPicker: { id: 2 }, clearAutoMenu: { id: 3 } }, "drawSnapshotPicker"],
      [{ clearAutoMenu: { id: 3 }, pendingSceneBakePicker: true }, "drawClearAutoMenu"],
      [{ pendingSceneBakePicker: true, pendingMergePlacement: true }, "renderSceneBakePickerPrompt"],
      [{ pendingMergePlacement: true, confirmStateWipe: true }, "renderMergePlacementPrompt"],
      [{ confirmStateWipe: true, recordBlockedDialog: true }, "drawStateWipeConfirm"],
      [{ recordBlockedDialog: true, confirmLgto: true }, "drawRecordBlockedDialog"],
      [{ confirmLgto: true, confirmXpose: true }, "drawLgtoConfirm"],
      [{ confirmXpose: true, confirmBakeScene: true }, "drawXposeConfirm"],
      [{ confirmBakeScene: true, confirmBake: true }, "drawBakeSceneConfirm"],
      [{ confirmBake: true, globalMenuOpen: true }, "drawBakeConfirm"],
    ];

    for (const [state, expected] of cases) {
      calls = [];
      drawUIImpl(baseState(state) as any, deps(calls) as any);
      expect(routedName(calls)).toBe(expected);
    }
  });

  test("global menu and tap tempo precede perf, splash, and normal view routing", () => {
    drawUIImpl(baseState({ globalMenuOpen: true, sessionView: true, loopHeld: true }) as any, deps(calls) as any);
    expect(calls.map((call) => call[0])).toEqual(["ensureGlobalMenuFresh", "drawGlobalMenu"]);

    calls = [];
    drawUIImpl(baseState({ tapTempoOpen: true, stateLoading: true }) as any, deps(calls) as any);
    expect(calls.map((call) => call[0])).toEqual(["ensureGlobalMenuFresh", "drawGlobalMenu"]);
  });

  test("Session View routes popup before idle after clearing the frame", () => {
    drawUIImpl(baseState({ sessionView: true, actionPopupEndTick: 10 }) as any, deps(calls) as any);
    expect(calls.map((call) => call[0])).toEqual(["clear_screen", "factory", "renderSessionActionPopup"]);

    calls = [];
    drawUIImpl(baseState({ sessionView: true }) as any, deps(calls) as any);
    expect(calls.map((call) => call[0])).toEqual(["clear_screen", "factory", "renderSessionIdleView"]);
  });

  test("Track View popup, step, loop, bank, and idle priority remains ordered", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ stretchBlockedEndTick: 10, actionPopupEndTick: 10 }, "renderCompressLimitNotice"],
      [{ actionPopupEndTick: 10 }, "renderTrackActionPopup"],
      [{ noNoteFlashEndTick: 10 }, "renderNoNoteFlashNotice"],
      [{ shiftHeld: true }, "renderShiftStepHelp"],
      [{ heldStep: 3, activeBank: 6 }, "renderCcStepEditView"],
      [{ heldStep: 3 }, "renderTrackStepEditView"],
      [{ loopHeld: true }, "renderLoopView"],
      [{ activeBank: 4, stepIntervalMode: true, knobTouched: 1 }, "renderStepIntervalOverlay"],
      [{ activeBank: 6 }, "renderMotionIdleView"],
      [{ knobTouched: 2 }, "renderParamPeek"],
      [{ bankSelectTick: 4 }, "renderTrackBankOverview"],
      [{}, "renderMelodicTrackIdleView"],
      [{ trackPadMode: [1, 0, 0, 0, 0, 0, 0, 0] }, "renderDrumTrackIdleView"],
    ];

    for (const [state, expected] of cases) {
      calls = [];
      drawUIImpl(baseState(state) as any, deps(calls) as any);
      expect(routedName(calls.filter((call) => call[0] !== "clear_screen"))).toBe(expected);
    }
  });
});
