import { describe, expect, test } from "vitest";
import { onPadAftertouchImpl } from "@overture-ui/pad/ui_pad_aftertouch_workflow.mjs";

const PAD_MODE_DRUM = 1;
const TRACK_PAD_BASE = 36;

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    fn(name: string) {
      return (...args: unknown[]) => log.push([name, ...args]);
    },
  };
}

function deps(c: ReturnType<typeof calls>, overrides: Record<string, unknown> = {}) {
  return {
    PAD_MODE_DRUM,
    trackPadBase: TRACK_PAD_BASE,
    padPitch: new Array(32).fill(-1),
    drumPadToLane: (padIdx: number) => {
      const col = padIdx % 8;
      if (col >= 4) return -1;
      return Math.floor(padIdx / 8) * 4 + col;
    },
    drumRepeatDeps: { marker: "drum-repeat-deps" },
    handleDrumRepeatPadAftertouch: c.fn("rpt1At"),
    handleDrumRepeat2LaneAftertouch: c.fn("rpt2At"),
    setParam: c.fn("set"),
    ...overrides,
  };
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    activeTrack: 0,
    atLastSent: new Array(32).fill(-1),
    drumPerformMode: [0, 0],
    drumRepeatHeldPad: [-1, -1],
    drumRepeat2HeldLanes: [new Set<number>(), new Set<number>()],
    trackAtMode: [0, 0],
    trackPadMode: [0, 0],
    trackRoute: [0, 0],
    ...overrides,
  };
}

describe("Pad aftertouch workflow", () => {
  test("sends melodic poly aftertouch with pitch, pressure, mode, and dedupe", () => {
    const c = calls();
    const d = deps(c, { padPitch: [60, 62, ...new Array(30).fill(-1)] });
    const S = state({ trackAtMode: [1] });

    onPadAftertouchImpl(S, d, TRACK_PAD_BASE, 70);
    onPadAftertouchImpl(S, d, TRACK_PAD_BASE, 70);
    onPadAftertouchImpl(S, d, TRACK_PAD_BASE, 71);

    expect(S.atLastSent[0]).toBe(71);
    expect(c.log).toEqual([
      ["set", "t0_live_at", "60 70 1"],
      ["set", "t0_live_at", "60 71 1"],
    ]);
  });

  test("sends melodic channel aftertouch unless Move route downgrades it to poly", () => {
    const c = calls();
    const d = deps(c, { padPitch: [64, 65, ...new Array(30).fill(-1)] });
    const S = state({
      activeTrack: 1,
      trackAtMode: [0, 2],
      trackRoute: [0, 0],
    });

    onPadAftertouchImpl(S, d, TRACK_PAD_BASE + 1, 48);
    S.trackRoute[1] = 1;
    onPadAftertouchImpl(S, d, TRACK_PAD_BASE + 1, 49);

    expect(c.log).toEqual([
      ["set", "t1_live_at", "65 48 2"],
      ["set", "t1_live_at", "65 49 1"],
    ]);
  });

  test("does nothing for melodic off mode, invalid pads, unmapped pitch, or missing set_param", () => {
    const c = calls();
    const S = state({ trackAtMode: [0] });

    onPadAftertouchImpl(S, deps(c, { padPitch: [60, ...new Array(31).fill(-1)] }), TRACK_PAD_BASE, 64);
    S.trackAtMode[0] = 1;
    onPadAftertouchImpl(S, deps(c), TRACK_PAD_BASE - 1, 64);
    onPadAftertouchImpl(S, deps(c), TRACK_PAD_BASE + 32, 64);
    onPadAftertouchImpl(S, deps(c), TRACK_PAD_BASE, 64);
    onPadAftertouchImpl(S, deps(c, { padPitch: [60, ...new Array(31).fill(-1)], setParam: null }), TRACK_PAD_BASE, 64);

    expect(c.log).toEqual([]);
  });

  test("routes drum Rpt1 pressure for the held repeat pad", () => {
    const c = calls();
    const d = deps(c);
    const S = state({
      drumPerformMode: [1],
      drumRepeatHeldPad: [3],
      trackPadMode: [PAD_MODE_DRUM],
    });

    onPadAftertouchImpl(S, d, TRACK_PAD_BASE + 3, 88);
    onPadAftertouchImpl(S, d, TRACK_PAD_BASE + 3, 0);
    onPadAftertouchImpl(S, d, TRACK_PAD_BASE + 4, 90);

    expect(c.log).toEqual([
      ["rpt1At", S, { marker: "drum-repeat-deps" }, 0, 3, 88],
    ]);
  });

  test("routes drum Rpt2 pressure only for held left-half lanes", () => {
    const c = calls();
    const d = deps(c);
    const S = state({
      activeTrack: 1,
      drumPerformMode: [0, 2],
      drumRepeat2HeldLanes: [new Set<number>(), new Set<number>([8])],
      trackPadMode: [0, PAD_MODE_DRUM],
    });

    onPadAftertouchImpl(S, d, TRACK_PAD_BASE + 16, 91);
    onPadAftertouchImpl(S, d, TRACK_PAD_BASE + 20, 92);
    onPadAftertouchImpl(S, d, TRACK_PAD_BASE + 17, 93);
    onPadAftertouchImpl(S, d, TRACK_PAD_BASE + 16, 0);

    expect(c.log).toEqual([
      ["rpt2At", S, { marker: "drum-repeat-deps" }, 1, 8, 91],
    ]);
  });
});
