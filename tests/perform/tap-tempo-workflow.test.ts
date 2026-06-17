import { describe, expect, test } from "vitest";
import {
  closeTapTempoImpl,
  openTapTempoImpl,
  registerTapTempoImpl,
} from "@overture-ui/perform/ui_tap_tempo_workflow.mjs";

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
    tapTempoOpen: false,
    tapTempoTapTimes: [] as number[],
    tapTempoBpm: 120,
    tapTempoFlashTick: -1,
    tapTempoFlashPad: -1,
    tickCount: 100,
    screenDirty: false,
    ...overrides,
  };
}

function deps(c: ReturnType<typeof calls>, opts: { bpm?: string | null; times?: number[] } = {}) {
  const times = opts.times ? opts.times.slice() : [];
  return {
    getParam(key: string) {
      c.log.push(["getParam", key]);
      return opts.bpm === undefined ? "120" : opts.bpm;
    },
    setParam: c.fn("setParam"),
    computePadNoteMap: c.fn("computePadNoteMap"),
    invalidateLEDCache: c.fn("invalidateLEDCache"),
    nowMs() {
      const next = times.shift();
      if (next === undefined) throw new Error("test exhausted tap tempo clock");
      return next;
    },
  };
}

describe("tap tempo workflow - open/close", () => {
  test("open clamps host BPM, clears tap and flash state, recomputes pads/LEDs", () => {
    const c = calls();
    const S = state({ tapTempoTapTimes: [1, 2], tapTempoBpm: 99, tapTempoFlashTick: 5, tapTempoFlashPad: 70 });
    openTapTempoImpl(S, deps(c, { bpm: "300.4" }));
    expect(S).toMatchObject({
      tapTempoOpen: true,
      tapTempoTapTimes: [],
      tapTempoBpm: 250,
      tapTempoFlashTick: -1,
      tapTempoFlashPad: -1,
      screenDirty: true,
    });
    expect(c.log).toEqual([
      ["getParam", "bpm"],
      ["computePadNoteMap"],
      ["invalidateLEDCache"],
    ]);
  });

  test("open falls back to 120 then clamps low host BPM to 40", () => {
    const c = calls();
    const S = state();
    openTapTempoImpl(S, deps(c, { bpm: "12.3" }));
    expect(S.tapTempoBpm).toBe(40);

    const c2 = calls();
    const S2 = state();
    openTapTempoImpl(S2, deps(c2, { bpm: "not-a-number" }));
    expect(S2.tapTempoBpm).toBe(120);
  });

  test("close writes back current BPM and recomputes pads/LEDs", () => {
    const c = calls();
    const S = state({ tapTempoOpen: true, tapTempoBpm: 137 });
    closeTapTempoImpl(S, deps(c));
    expect(S.tapTempoOpen).toBe(false);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([
      ["setParam", "bpm", "137"],
      ["computePadNoteMap"],
      ["invalidateLEDCache"],
    ]);
  });
});

describe("tap tempo workflow - taps", () => {
  test("calculates BPM from average interval and flashes tapped pad", () => {
    const c = calls();
    const S = state({ tickCount: 42 });
    const d = deps(c, { times: [1000, 1500, 2000] });
    registerTapTempoImpl(S, d, 68);
    registerTapTempoImpl(S, d, 69);
    registerTapTempoImpl(S, d, 70);
    expect(S.tapTempoTapTimes).toEqual([1000, 1500, 2000]);
    expect(S.tapTempoBpm).toBe(120);
    expect(S.tapTempoFlashTick).toBe(42);
    expect(S.tapTempoFlashPad).toBe(70);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([
      ["setParam", "bpm", "120"],
      ["setParam", "bpm", "120"],
    ]);
  });

  test("inactivity reset starts a fresh tap window and does not write BPM", () => {
    const c = calls();
    const S = state({ tapTempoTapTimes: [1000, 1500], tapTempoBpm: 120 });
    registerTapTempoImpl(S, deps(c, { times: [4001] }), 71);
    expect(S.tapTempoTapTimes).toEqual([4001]);
    expect(S.tapTempoBpm).toBe(120);
    expect(c.log).toEqual([]);
  });

  test("deviation reset keeps the previous tap as anchor", () => {
    const c = calls();
    const S = state({ tapTempoTapTimes: [1000, 1500], tapTempoBpm: 120 });
    registerTapTempoImpl(S, deps(c, { times: [2600] }), 72);
    expect(S.tapTempoTapTimes).toEqual([1500, 2600]);
    expect(S.tapTempoBpm).toBe(55);
    expect(c.log).toEqual([["setParam", "bpm", "55"]]);
  });

  test("sliding window keeps the latest 9 taps", () => {
    const c = calls();
    const S = state({ tapTempoTapTimes: [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000] });
    registerTapTempoImpl(S, deps(c, { times: [4500] }), 73);
    expect(S.tapTempoTapTimes).toEqual([500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500]);
    expect(S.tapTempoBpm).toBe(120);
  });

  test("BPM calculation clamps to the 40..250 range", () => {
    const fast = calls();
    const fastS = state({ tapTempoTapTimes: [1000] });
    registerTapTempoImpl(fastS, deps(fast, { times: [1100] }), 74);
    expect(fastS.tapTempoBpm).toBe(250);
    expect(fast.log).toEqual([["setParam", "bpm", "250"]]);

    const slow = calls();
    const slowS = state({ tapTempoTapTimes: [1000] });
    registerTapTempoImpl(slowS, deps(slow, { times: [3000] }), 75);
    expect(slowS.tapTempoBpm).toBe(40);
    expect(slow.log).toEqual([["setParam", "bpm", "40"]]);
  });
});
