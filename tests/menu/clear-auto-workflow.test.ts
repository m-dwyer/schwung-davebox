import { describe, expect, test } from "vitest";
import {
  clearAutoMenuClickImpl,
  clearAutoMenuRotateImpl,
  closeClearAutoMenuImpl,
  openClearAutoMenuImpl,
} from "@overture-ui/menu/ui_clear_auto_workflow.mjs";
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

function state(overrides: Record<string, unknown> = {}) {
  return {
    clearAutoMenu: null as null | { sel: number; at: boolean; cc: boolean },
    screenDirty: false,
    activeTrack: 1,
    trackCCAutoBits: [
      [0, 0],
      [0, 7],
    ],
    trackCCLiveVal: [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [1, 2, 3, 4, 5, 6, 7, 8],
    ],
    clipCCVal: [
      [
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0],
      ],
      [
        [0, 0, 0, 0, 0, 0, 0, 0],
        [11, 12, 13, 14, 15, 16, 17, 18],
      ],
    ],
    clipAtHas: [
      [false, false],
      [false, true],
    ],
    pendingDefaultSetParams: [] as Array<{ key: string; val: string }>,
    undoAvailable: false,
    redoAvailable: true,
    undoSeqArpSnapshot: { present: true },
    ...overrides,
  };
}

function deps(c: ReturnType<typeof calls>, opts: { clip?: number } = {}) {
  return {
    effectiveClip: (_track: number) => opts.clip ?? 1,
    invalidateLEDCache: c.fn("invalidateLEDCache"),
    showActionPopup: c.fn("showActionPopup"),
  };
}

describe("clear automation workflow - open/close/rotate", () => {
  test("open initializes the menu and marks the screen dirty", () => {
    const S = state();
    openClearAutoMenuImpl(S);
    expect(S.clearAutoMenu).toEqual({ sel: 0, at: false, cc: false });
    expect(S.screenDirty).toBe(true);
  });

  test("close clears the menu and marks the screen dirty", () => {
    const S = state({ clearAutoMenu: { sel: 2, at: true, cc: false } });
    closeClearAutoMenuImpl(S);
    expect(S.clearAutoMenu).toBeNull();
    expect(S.screenDirty).toBe(true);
  });

  test("rotate wraps over the five rows and ignores zero delta", () => {
    const S = state({ clearAutoMenu: { sel: 4, at: false, cc: false } });
    clearAutoMenuRotateImpl(S, 1);
    expect(S.clearAutoMenu?.sel).toBe(0);
    expect(S.screenDirty).toBe(true);

    S.screenDirty = false;
    clearAutoMenuRotateImpl(S, -1);
    expect(S.clearAutoMenu?.sel).toBe(4);
    expect(S.screenDirty).toBe(true);

    S.screenDirty = false;
    clearAutoMenuRotateImpl(S, 0);
    expect(S.clearAutoMenu?.sel).toBe(4);
    expect(S.screenDirty).toBe(false);
  });
});

describe("clear automation workflow - click", () => {
  test("AT row toggles aftertouch selection", () => {
    const c = calls();
    const S = state({ clearAutoMenu: { sel: 0, at: false, cc: false } });
    clearAutoMenuClickImpl(S, deps(c));
    expect(S.clearAutoMenu?.at).toBe(true);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([]);
  });

  test("PB row is a no-op except dirtying the screen", () => {
    const c = calls();
    const S = state({ clearAutoMenu: { sel: 1, at: false, cc: false } });
    clearAutoMenuClickImpl(S, deps(c));
    expect(S.clearAutoMenu).toEqual({ sel: 1, at: false, cc: false });
    expect(S.pendingDefaultSetParams).toEqual([]);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([]);
  });

  test("CC row toggles CC selection", () => {
    const c = calls();
    const S = state({ clearAutoMenu: { sel: 2, at: false, cc: false } });
    clearAutoMenuClickImpl(S, deps(c));
    expect(S.clearAutoMenu?.cc).toBe(true);
    expect(S.screenDirty).toBe(true);
  });

  test("Cancel closes the menu without popup or LED invalidation", () => {
    const c = calls();
    const S = state({ clearAutoMenu: { sel: 4, at: true, cc: true } });
    clearAutoMenuClickImpl(S, deps(c));
    expect(S.clearAutoMenu).toBeNull();
    expect(S.pendingDefaultSetParams).toEqual([]);
    expect(c.log).toEqual([]);
  });

  test("CLEAR with CC selected clears CC mirrors and queues cc clear", () => {
    const c = calls();
    const S = state({ clearAutoMenu: { sel: 3, at: false, cc: true } });
    clearAutoMenuClickImpl(S, deps(c));
    expect(S.trackCCAutoBits[1][1]).toBe(0);
    expect(S.trackCCLiveVal[1]).toEqual(new Array(8).fill(-1));
    expect(S.clipCCVal[1][1]).toEqual(new Array(8).fill(-1));
    expect(S.clipAtHas[1][1]).toBe(true);
    expect(S.pendingDefaultSetParams).toEqual([{ key: "t1_cc_auto_clear", val: "1" }]);
    expect(S.undoAvailable).toBe(true);
    expect(S.redoAvailable).toBe(false);
    expect(S.undoSeqArpSnapshot).toBeNull();
    expect(S.clearAutoMenu).toBeNull();
    expect(c.log).toEqual([
      ["invalidateLEDCache"],
      ["showActionPopup", "CLEARED", "CC"],
    ]);
  });

  test("CLEAR with AT selected clears AT and queues at clear", () => {
    const c = calls();
    const S = state({ clearAutoMenu: { sel: 3, at: true, cc: false } });
    clearAutoMenuClickImpl(S, deps(c));
    expect(S.clipAtHas[1][1]).toBe(false);
    expect(S.trackCCAutoBits[1][1]).toBe(7);
    expect(S.pendingDefaultSetParams).toEqual([{ key: "t1_c1_at_clear", val: "1" }]);
    expect(c.log).toEqual([
      ["invalidateLEDCache"],
      ["showActionPopup", "CLEARED", "AT"],
    ]);
  });

  test("CLEAR with both selected preserves CC-before-AT pending param order", () => {
    const c = calls();
    const S = state({
      clearAutoMenu: { sel: 3, at: true, cc: true },
      pendingDefaultSetParams: [{ key: "older", val: "1" }],
    });
    clearAutoMenuClickImpl(S, deps(c));
    expect(traceDspWrites(S, c.log).directSetParams).toEqual([]);
    expect(traceDspWrites(S, c.log).queuedOperations).toEqual([
      { key: "older", val: "1" },
      { key: "t1_cc_auto_clear", val: "1" },
      { key: "t1_c1_at_clear", val: "1" },
    ]);
    expect(S.trackCCAutoBits[1][1]).toBe(0);
    expect(S.trackCCLiveVal[1]).toEqual(new Array(8).fill(-1));
    expect(S.clipCCVal[1][1]).toEqual(new Array(8).fill(-1));
    expect(S.clipAtHas[1][1]).toBe(false);
    expect(c.log).toEqual([
      ["invalidateLEDCache"],
      ["showActionPopup", "CLEARED", "AT CC"],
    ]);
  });

  test("CLEAR with nothing selected closes and reports nothing without undo flags", () => {
    const c = calls();
    const S = state({ clearAutoMenu: { sel: 3, at: false, cc: false } });
    clearAutoMenuClickImpl(S, deps(c));
    expect(S.pendingDefaultSetParams).toEqual([]);
    expect(S.undoAvailable).toBe(false);
    expect(S.redoAvailable).toBe(true);
    expect(S.undoSeqArpSnapshot).toEqual({ present: true });
    expect(S.clearAutoMenu).toBeNull();
    expect(c.log).toEqual([
      ["invalidateLEDCache"],
      ["showActionPopup", "CLEARED", "NOTHING"],
    ]);
  });
});
