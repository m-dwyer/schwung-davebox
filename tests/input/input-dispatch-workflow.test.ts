import { describe, expect, test } from "vitest";
import {
  onCcJogImpl,
  onCcMsgImpl,
  onPadPressImpl,
  onStepButtonsImpl,
  switchViewCleanupImpl,
} from "@overture-ui/input/ui_input_dispatch_workflow.mjs";

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    fn(name: string, result?: unknown) {
      return (...args: unknown[]) => {
        log.push([name, ...args]);
        return result;
      };
    },
  };
}

describe("input dispatch workflow", () => {
  test("dispatches CC shell handlers in ui.js priority order without short-circuiting", () => {
    const c = calls();

    expect(onCcMsgImpl({
      onJog: c.fn("jog", true),
      onButtons: c.fn("buttons", true),
      onTransport: c.fn("transport", true),
      onSide: c.fn("side", true),
      onStepEdit: c.fn("stepEdit", true),
      onKnobs: c.fn("knobs", true),
    }, 71, 1)).toBeUndefined();

    expect(c.log).toEqual([
      ["jog", 71, 1],
      ["buttons", 71, 1],
      ["transport", 71, 1],
      ["side", 71, 1],
      ["stepEdit", 71, 1],
      ["knobs", 71, 1],
    ]);
  });

  test("jog dispatch clears the Shift track overlay before routing", () => {
    const S: any = {
      shiftTrackLEDActive: true,
      screenDirty: false,
      stepIntervalMode: false,
      pendingInheritPicker: null,
      snapshotPicker: null,
      clearAutoMenu: null,
      confirmBakeScene: false,
      confirmLgto: false,
      confirmClearSession: false,
      recordBlockedDialog: false,
      confirmBake: false,
      tapTempoOpen: false,
      globalMenuOpen: false,
      deleteHeld: false,
      shiftHeld: false,
    };

    onCcJogImpl(S, {
      createJogCcWorkflowDeps: () => ({
        moveMainKnob: 14,
        decodeDelta: () => 0,
      }),
    }, 99, 127);

    expect(S.shiftTrackLEDActive).toBe(false);
    expect(S.screenDirty).toBe(true);
  });

  test("pad press modal routing swallows tap-tempo pads before track-view dispatch", () => {
    const c = calls();
    const S: any = {
      moveCoRunTrack: -1,
      tapTempoOpen: true,
      sessionView: false,
      loopHeld: false,
      perfViewLocked: false,
      stepIntervalMode: false,
    };

    onPadPressImpl(S, {
      createPadWorkflowDeps: () => ({
        padModeDrum: 0,
        registerTapTempo: c.fn("tap"),
      }),
      createSessionViewWorkflowDeps: () => ({}),
      onPadPressTrackView: c.fn("trackView"),
    }, 0x90, 68, 100);

    expect(c.log).toEqual([["tap", 68]]);
  });

  test("step buttons swallow co-run edits and reserve Step 3 as the exit affordance", () => {
    const c = calls();
    const S: any = {
      schwungCoRunSlot: 1,
      moveCoRunTrack: -1,
    };
    const deps = {
      exitMoveNativeCoRun: c.fn("exitMove"),
      exitSchwungCoRun: c.fn("exitSchwung"),
      forceRedraw: c.fn("redraw"),
    };

    onStepButtonsImpl(S, deps, 16, 127);
    onStepButtonsImpl(S, deps, 18, 127);

    expect(c.log).toEqual([
      ["exitSchwung"],
      ["redraw"],
    ]);
  });

  test("step-button hold reveal selects a clip before normal step handlers", () => {
    const c = calls();
    const S: any = {
      schwungCoRunSlot: -1,
      moveCoRunTrack: -1,
      tapTempoOpen: false,
      shiftTrackLEDActive: true,
      screenDirty: false,
      tickCount: 44,
      stepOpTick: -1,
      revealClipsTrack: 3,
    };

    onStepButtonsImpl(S, {
      selectClipOnTrack: c.fn("selectClip"),
      forceRedraw: c.fn("redraw"),
    }, 21, 127);

    expect(S.shiftTrackLEDActive).toBe(false);
    expect(S.screenDirty).toBe(true);
    expect(S.stepOpTick).toBe(44);
    expect(c.log).toEqual([
      ["selectClip", 3, 5],
      ["redraw"],
    ]);
  });

  test("shift-step common shortcuts still dispatch while a shortcut surface is open", () => {
    const c = calls();
    const S: any = {
      schwungCoRunSlot: -1,
      moveCoRunTrack: -1,
      tapTempoOpen: true,
      globalMenuOpen: false,
      shiftHeld: true,
      sessionView: true,
      activeTrack: 0,
      trackPadMode: [0],
      shiftTrackLEDActive: false,
      tickCount: 12,
      stepOpTick: -1,
      revealClipsTrack: -1,
    };

    onStepButtonsImpl(S, {
      createTrackViewStepWorkflowDeps: () => ({
        padModeDrum: 1,
        doShiftStepCommon: c.fn("shortcut"),
        forceRedraw: c.fn("redraw"),
      }),
    }, 17, 127);

    expect(S.stepOpTick).toBe(12);
    expect(c.log).toEqual([
      ["shortcut", 1],
      ["redraw"],
    ]);
  });

  test("shift-step track-view shortcuts still dispatch while a shortcut surface is open", () => {
    const c = calls();
    const S: any = {
      schwungCoRunSlot: -1,
      moveCoRunTrack: -1,
      tapTempoOpen: false,
      globalMenuOpen: true,
      shiftHeld: true,
      sessionView: true,
      activeTrack: 2,
      trackPadMode: [0, 0, 0],
      activeBank: 0,
      bankParams: [
        [[], [0, 0, 0, 0]],
        [[], [0, 0, 0, 0]],
        [[], [0, 0, 0, 0]],
      ],
      shiftTrackLEDActive: false,
      tickCount: 12,
      stepOpTick: -1,
      revealClipsTrack: -1,
    };

    onStepButtonsImpl(S, {
      createTrackViewStepWorkflowDeps: () => ({
        padModeDrum: 1,
        doShiftStepCommon: c.fn("shortcut"),
        setParam: c.fn("setParam"),
        showActionPopup: c.fn("popup"),
        forceRedraw: c.fn("redraw"),
      }),
    }, 31, 127);

    expect(S.stepOpTick).toBe(12);
    expect(S.bankParams[2][1][3]).toBe(100);
    expect(c.log).toEqual([
      ["shortcut", 15],
      ["setParam", "t2_quantize", "100"],
      ["popup", "QUANT 100%"],
      ["redraw"],
    ]);
  });

  test("non-shift step buttons remain swallowed while a shortcut surface is open", () => {
    const c = calls();
    const S: any = {
      schwungCoRunSlot: -1,
      moveCoRunTrack: -1,
      tapTempoOpen: false,
      globalMenuOpen: true,
      shiftHeld: false,
      stepOpTick: -1,
    };

    onStepButtonsImpl(S, {
      createSessionViewWorkflowDeps: c.fn("sessionDeps"),
    }, 22, 127);

    expect(S.stepOpTick).toBe(-1);
    expect(c.log).toEqual([]);
  });

  test("switch-view cleanup clears held input state, stops active performance loop, and blanks the old view LEDs", () => {
    const c = calls();
    const S: any = {
      heldStepBtn: 3,
      heldStep: 4,
      heldStepNotes: [60],
      stepWasEmpty: true,
      stepWasHeld: true,
      stepBtnPressedTick: [1, 2, 3],
      sessionStepHeld: 2,
      sessionStepHeldCtx: 9,
      sessionView: false,
      perfViewLocked: true,
      perfStack: [{ idx: 1, ticks: 96 }],
      perfStickyLengths: new Set([1]),
      perfHoldPadHeld: true,
      loopHeld: true,
      loopJogActive: true,
      perfModsHeld: 3,
    };

    switchViewCleanupImpl(S, {
      ledOff: 0,
      trackPadBase: 100,
      sendPerfMods: c.fn("mods"),
      setLED: c.fn("led"),
      setParam: c.fn("set"),
    });

    expect(S.heldStepBtn).toBe(-1);
    expect(S.heldStep).toBe(-1);
    expect(S.heldStepNotes).toEqual([]);
    expect(S.stepWasEmpty).toBe(false);
    expect(S.stepWasHeld).toBe(false);
    expect(S.stepBtnPressedTick).toEqual([-1, -1, -1]);
    expect(S.sessionStepHeld).toBe(-1);
    expect(S.sessionStepHeldCtx).toBe(0);
    expect(S.perfStack).toEqual([]);
    expect(S.perfStickyLengths.size).toBe(0);
    expect(S.perfViewLocked).toBe(false);
    expect(S.loopHeld).toBe(false);
    expect(c.log[0]).toEqual(["mods"]);
    expect(c.log[1]).toEqual(["set", "looper_stop", "1"]);
    expect(c.log.filter(([name]) => name === "led")).toHaveLength(32);
  });
});
