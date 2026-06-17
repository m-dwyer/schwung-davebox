import { describe, expect, test } from "vitest";
import {
  enterMoveNativeCoRunImpl,
  enterSchwungCoRunImpl,
  exitMoveNativeCoRunImpl,
  exitSchwungCoRunImpl,
} from "@overture-ui/corun/ui_corun_workflow.mjs";

const CORUN_TARGET_CHAIN_EDIT = 1;
const CORUN_TARGET_MOVE_NATIVE = 2;
const OVERTURE_CORUN_KEEP_MASK = 0x860e;

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  const deps = {
    corunTargetChainEdit: CORUN_TARGET_CHAIN_EDIT,
    corunTargetMoveNative: CORUN_TARGET_MOVE_NATIVE,
    overtureCorunKeepMask: OVERTURE_CORUN_KEEP_MASK,
    shadowCorunBegin: (target: number, value: number, mask: number) => log.push(["begin", target, value, mask]),
    shadowCorunEnd: () => log.push(["end"]),
    shadowSetSkipLedClear: (value: number) => log.push(["skipLedClear", value]),
    moveMidiInjectToMove: (packet: number[]) => log.push(["inject", packet]),
    computePadNoteMap: () => log.push(["computePadNoteMap"]),
    showActionPopup: (a: string, b: string) => log.push(["popup", a, b]),
    reapplyPalette: () => log.push(["reapplyPalette"]),
    invalidateLEDCache: () => log.push(["invalidateLEDCache"]),
    forceRedraw: () => log.push(["forceRedraw"]),
  };
  return { log, deps };
}

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    schwungCoRunSlot: -1,
    moveCoRunTrack: -1,
    _coRunChanSlots: 7,
    trackChannel: [1, 2, 5, 4],
    pendingMoveCoRunInject: 9,
    moveCoRunPressQueue: [40],
    moveCoRunDrumHeld: -1,
    pendingPadNoteMapRecompute: false,
    globalMenuOpen: true,
    lastSentMenuEditValue: "x",
    screenDirty: false,
    shiftHeld: true,
    deleteHeld: true,
    muteHeld: true,
    copyHeld: true,
    loopHeld: true,
    loopJogActive: true,
    captureHeld: true,
    shiftTrackLEDActive: true,
    _forceKnobReemit: false,
    ...overrides,
  };
}

describe("Co-run workflow - Schwung", () => {
  test("enter records the slot, starts chain-edit co-run, and dirties the screen", () => {
    const c = calls();
    const S = baseState();

    enterSchwungCoRunImpl(S, c.deps, 2, 6);

    expect(S.schwungCoRunSlot).toBe(6);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([["begin", CORUN_TARGET_CHAIN_EDIT, 6, OVERTURE_CORUN_KEEP_MASK]]);
  });

  test("enter tolerates a missing host begin function", () => {
    const c = calls();
    const S = baseState();

    enterSchwungCoRunImpl(S, { ...c.deps, shadowCorunBegin: null }, 0, 3);

    expect(S.schwungCoRunSlot).toBe(3);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([]);
  });

  test("exit is a no-op when no Schwung co-run is active", () => {
    const c = calls();
    const S = baseState({ schwungCoRunSlot: -1 });

    exitSchwungCoRunImpl(S, c.deps);

    expect(c.log).toEqual([]);
    expect(S._coRunChanSlots).toBe(7);
  });

  test("exit clears co-run state, modifiers, palette/cache, and redraws", () => {
    const c = calls();
    const S = baseState({ schwungCoRunSlot: 4 });

    exitSchwungCoRunImpl(S, c.deps);

    expect(S.schwungCoRunSlot).toBe(-1);
    expect(S._coRunChanSlots).toBe(0);
    expect(S.shiftHeld).toBe(false);
    expect(S.deleteHeld).toBe(false);
    expect(S.muteHeld).toBe(false);
    expect(S.copyHeld).toBe(false);
    expect(S.loopHeld).toBe(false);
    expect(S.loopJogActive).toBe(false);
    expect(S.captureHeld).toBe(false);
    expect(S.shiftTrackLEDActive).toBe(false);
    expect(c.log).toEqual([
      ["end"],
      ["reapplyPalette"],
      ["invalidateLEDCache"],
      ["forceRedraw"],
    ]);
  });
});

describe("Co-run workflow - Move native", () => {
  test("enter starts Move-native co-run and sets deferred inject state", () => {
    const c = calls();
    const S = baseState();

    enterMoveNativeCoRunImpl(S, c.deps, 1);

    expect(S.moveCoRunTrack).toBe(1);
    expect(S.pendingPadNoteMapRecompute).toBe(true);
    expect(S.pendingMoveCoRunInject).toBe(12);
    expect(S.globalMenuOpen).toBe(false);
    expect(S.lastSentMenuEditValue).toBe(null);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([
      ["computePadNoteMap"],
      ["begin", CORUN_TARGET_MOVE_NATIVE, 1, OVERTURE_CORUN_KEEP_MASK],
      ["skipLedClear", 1],
    ]);
  });

  test("enter warns but still enters when Move channel is outside 1-4", () => {
    const c = calls();
    const S = baseState();

    enterMoveNativeCoRunImpl(S, c.deps, 2);

    expect(S.moveCoRunTrack).toBe(2);
    expect(c.log.slice(0, 2)).toEqual([
      ["popup", "MOVE CH>4", "CH 5"],
      ["computePadNoteMap"],
    ]);
  });

  test("enter is a no-op when required host functions are missing", () => {
    const c = calls();
    const S = baseState();

    enterMoveNativeCoRunImpl(S, { ...c.deps, shadowCorunBegin: null }, 1);
    enterMoveNativeCoRunImpl(S, { ...c.deps, moveMidiInjectToMove: null }, 1);

    expect(S.moveCoRunTrack).toBe(-1);
    expect(S.pendingMoveCoRunInject).toBe(9);
    expect(c.log).toEqual([]);
  });

  test("exit is a no-op when no Move co-run is active", () => {
    const c = calls();
    const S = baseState({ moveCoRunTrack: -1 });

    exitMoveNativeCoRunImpl(S, c.deps);

    expect(c.log).toEqual([]);
    expect(S.pendingMoveCoRunInject).toBe(9);
  });

  test("exit cancels inject, releases stuck drum note, clears modifiers, and redraws", () => {
    const c = calls();
    const S = baseState({ moveCoRunTrack: 3, moveCoRunDrumHeld: 41 });

    exitMoveNativeCoRunImpl(S, c.deps);

    expect(S.moveCoRunTrack).toBe(-1);
    expect(S.pendingMoveCoRunInject).toBe(0);
    expect(S.moveCoRunPressQueue).toBe(null);
    expect(S.pendingPadNoteMapRecompute).toBe(true);
    expect(S.moveCoRunDrumHeld).toBe(-1);
    expect(S.shiftHeld).toBe(false);
    expect(S.deleteHeld).toBe(false);
    expect(S.muteHeld).toBe(false);
    expect(S.copyHeld).toBe(false);
    expect(S.loopHeld).toBe(false);
    expect(S.loopJogActive).toBe(false);
    expect(S.captureHeld).toBe(false);
    expect(S.shiftTrackLEDActive).toBe(false);
    expect(S._forceKnobReemit).toBe(true);
    expect(c.log).toEqual([
      ["computePadNoteMap"],
      ["end"],
      ["skipLedClear", 0],
      ["inject", [0x08, 0x80, 41, 0]],
      ["reapplyPalette"],
      ["invalidateLEDCache"],
      ["forceRedraw"],
    ]);
  });

  test("exit tolerates missing optional host functions", () => {
    const c = calls();
    const S = baseState({ moveCoRunTrack: 0, moveCoRunDrumHeld: 42 });

    exitMoveNativeCoRunImpl(S, {
      ...c.deps,
      shadowCorunEnd: null,
      shadowSetSkipLedClear: null,
      moveMidiInjectToMove: null,
    });

    expect(S.moveCoRunTrack).toBe(-1);
    expect(S.moveCoRunDrumHeld).toBe(-1);
    expect(c.log).toEqual([
      ["computePadNoteMap"],
      ["reapplyPalette"],
      ["invalidateLEDCache"],
      ["forceRedraw"],
    ]);
  });
});
