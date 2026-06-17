import { describe, expect, test } from "vitest";
import {
  syncDrumClipContentImpl,
  syncDrumLaneStepsImpl,
  syncDrumLanesMetaImpl,
} from "@overture-ui/drum/ui_drum_clip_sync.mjs";
import { DRUM_BASE_NOTE, DRUM_LANES, NUM_CLIPS } from "@overture-ui/core/ui_constants.mjs";

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    fn(name: string) {
      return (...args: unknown[]) => log.push([name, ...args]);
    },
  };
}

function grid<T>(dims: number[], fill: () => T): any {
  if (dims.length === 0) return fill();
  const [n, ...rest] = dims;
  return Array.from({ length: n }, () => grid(rest, fill));
}

function makeDeps(c: ReturnType<typeof calls>, map: Record<string, string | null>, noGet = false) {
  return {
    getParam: noGet
      ? null
      : (k: string) => {
          c.log.push(["getParam", k]);
          return k in map ? map[k] : null;
        },
  };
}

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    activeDrumLane: [2],
    drumLaneSteps: grid([1, DRUM_LANES, 256], () => "x"),
    drumLaneHasNotes: grid([1, DRUM_LANES], () => false),
    drumLaneLength: [16],
    drumLaneLoopStart: [0],
    drumStepPage: [0],
    drumLaneTPS: [24],
    drumLaneNote: grid([1, DRUM_LANES], () => 0),
    drumLaneMute: [0],
    drumLaneSolo: [0],
    drumClipNonEmpty: grid([1, NUM_CLIPS], () => false),
    ...overrides,
  };
}

describe("syncDrumLaneStepsImpl", () => {
  test("no getParam -> no-op", () => {
    const c = calls();
    const S = makeState();
    syncDrumLaneStepsImpl(S, makeDeps(c, {}, true), 0, 2);
    expect(c.log).toEqual([]);
    expect((S.drumLaneSteps as any)[0][2][0]).toBe("x");
  });

  test("active lane reads steps, length, loop start, and tps in order", () => {
    const c = calls();
    const raw = "01".padEnd(256, "0");
    const S = makeState({ drumStepPage: [9] });
    syncDrumLaneStepsImpl(
      S,
      makeDeps(c, {
        t0_l2_steps: raw,
        t0_l2_length: "32",
        t0_l2_loop_start: "48",
        t0_l2_tps: "96",
      }),
      0,
      2,
    );
    expect(c.log).toEqual([
      ["getParam", "t0_l2_steps"],
      ["getParam", "t0_l2_length"],
      ["getParam", "t0_l2_loop_start"],
      ["getParam", "t0_l2_tps"],
    ]);
    expect((S.drumLaneSteps as any)[0][2][0]).toBe("0");
    expect((S.drumLaneSteps as any)[0][2][1]).toBe("1");
    expect((S.drumLaneHasNotes as any)[0][2]).toBe(true);
    expect((S.drumLaneLength as any)[0]).toBe(32);
    expect((S.drumLaneLoopStart as any)[0]).toBe(48);
    expect((S.drumStepPage as any)[0]).toBe(4);
    expect((S.drumLaneTPS as any)[0]).toBe(96);
  });

  test("inactive lane reads only steps", () => {
    const c = calls();
    const S = makeState();
    syncDrumLaneStepsImpl(S, makeDeps(c, { t0_l3_steps: "0".repeat(256) }), 0, 3);
    expect(c.log).toEqual([["getParam", "t0_l3_steps"]]);
    expect((S.drumLaneHasNotes as any)[0][3]).toBe(false);
  });
});

describe("syncDrumLanesMetaImpl", () => {
  test("reads all lane meta, mute, and solo in order", () => {
    const c = calls();
    const map: Record<string, string | null> = {
      t0_l0_lane_note: "40",
      t0_l0_note_count: "2",
      t0_l1_lane_note: "0",
      t0_l1_note_count: "0",
      t0_drum_lane_mute: "5",
      t0_drum_lane_solo: "2",
    };
    const S = makeState();
    syncDrumLanesMetaImpl(S, makeDeps(c, map), 0);
    expect(c.log.slice(0, 4)).toEqual([
      ["getParam", "t0_l0_lane_note"],
      ["getParam", "t0_l0_note_count"],
      ["getParam", "t0_l1_lane_note"],
      ["getParam", "t0_l1_note_count"],
    ]);
    expect(c.log.at(-2)).toEqual(["getParam", "t0_drum_lane_mute"]);
    expect(c.log.at(-1)).toEqual(["getParam", "t0_drum_lane_solo"]);
    expect(c.log).toHaveLength(DRUM_LANES * 2 + 2);
    expect((S.drumLaneNote as any)[0][0]).toBe(40);
    expect((S.drumLaneNote as any)[0][1]).toBe(DRUM_BASE_NOTE + 1);
    expect((S.drumLaneHasNotes as any)[0][0]).toBe(true);
    expect((S.drumLaneHasNotes as any)[0][1]).toBe(false);
    expect((S.drumLaneMute as any)[0]).toBe(5);
    expect((S.drumLaneSolo as any)[0]).toBe(2);
  });
});

describe("syncDrumClipContentImpl", () => {
  test("reads all clip content flags in order", () => {
    const c = calls();
    const map = {
      t0_c0_drum_has_content: "1",
      t0_c1_drum_has_content: "0",
      t0_c2_drum_has_content: "1",
    };
    const S = makeState();
    syncDrumClipContentImpl(S, makeDeps(c, map), 0);
    expect(c.log.slice(0, 4)).toEqual([
      ["getParam", "t0_c0_drum_has_content"],
      ["getParam", "t0_c1_drum_has_content"],
      ["getParam", "t0_c2_drum_has_content"],
      ["getParam", "t0_c3_drum_has_content"],
    ]);
    expect(c.log).toHaveLength(NUM_CLIPS);
    expect((S.drumClipNonEmpty as any)[0].slice(0, 4)).toEqual([true, false, true, false]);
  });
});
