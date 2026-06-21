import { describe, expect, test } from "vitest";
import {
  handleUiPageNavButton,
  handleUiSceneNavButton,
} from "@overture-ui/input/ui_navigation_cc_workflow.mjs";
import { traceDspWrites } from "../helpers/dsp-queue-trace";

// Real Move CC values for the nav buttons (injected via deps, so only matter
// for readability here).
const LEFT = 62;
const RIGHT = 63;
const UP = 55;
const DOWN = 54;
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

const T = 4;
const C = 16;
const L = 8;

function dims3(fill: number) {
  return Array.from({ length: T }, () =>
    Array.from({ length: C }, () => Array.from({ length: L }, () => fill))
  );
}
function dims2(fill: number | boolean) {
  return Array.from({ length: T }, () =>
    Array.from({ length: C }, () => fill)
  );
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    activeTrack: 1,
    activeBank: 0,
    loopHeld: false,
    sessionView: false,
    sessionOverlayHeld: false,
    sceneRow: 4,
    heldStep: -1,
    screenDirty: false,
    // track 0 is a drum track, tracks 1-3 are melodic
    trackPadMode: [1, 0, 0, 0],
    ccActiveLane: [0, 2, 0, 0],
    activeDrumLane: [3, 0, 0, 0],
    trackCurrentPage: [0, 1, 0, 0],
    trackOctave: [0, 0, 0, 0],
    drumStepPage: [1, 0, 0, 0],
    drumLaneLoopStart: [16, 0, 0, 0],
    drumLaneLength: [64, 0, 0, 0],
    clipLoopStart: dims2(0),
    clipLength: dims2(16),
    clipTPS: dims2(24),
    ccLaneTps: dims3(0),
    ccLaneResTps: dims3(0),
    ccLaneLength: dims3(0),
    ccLaneLoopStart: dims3(0),
    clipSeqFollow: dims2(false),
    bankParams: Array.from({ length: T }, () =>
      Array.from({ length: 7 }, () => Array.from({ length: 8 }, () => 0))
    ),
    pendingDefaultSetParams: [] as Array<{ key: string; val: string }>,
    liveActiveNotes: new Set<number>(),
    ...overrides,
  };
}

function deps(c: ReturnType<typeof calls>, overrides: Record<string, unknown> = {}) {
  return {
    moveLeft: LEFT,
    moveRight: RIGHT,
    moveUp: UP,
    moveDown: DOWN,
    numClips: C,
    padModeDrum: DRUM,
    effectiveClip: (...args: unknown[]) => {
      c.log.push(["effectiveClip", ...args]);
      return 0;
    },
    forceRedraw: c.fn("redraw"),
    setParam: (...args: unknown[]) => c.log.push(["setParam", ...args]),
    setDrumLanePage: (...args: unknown[]) => c.log.push(["setDrumLanePage", ...args]),
    syncDrumLanesMeta: (...args: unknown[]) => c.log.push(["syncMeta", ...args]),
    syncDrumLaneSteps: (...args: unknown[]) => c.log.push(["syncSteps", ...args]),
    computePadNoteMap: c.fn("padmap"),
    queueLiveNoteOff: (...args: unknown[]) => c.log.push(["noteOff", ...args]),
    ...overrides,
  };
}

describe("Navigation CC workflow - Left/Right page nav", () => {
  test("ignores non-Left/Right CCs, non-press values, and Session View", () => {
    const c = calls();
    const d = deps(c);

    handleUiPageNavButton(state(), d, 60, 127);
    handleUiPageNavButton(state(), d, LEFT, 0);
    handleUiPageNavButton(state({ sessionView: true }), d, LEFT, 127);

    expect(c.log).toEqual([]);
  });

  test("Loop+bank6 melodic Left lowers the CC-lane resolution and short-circuits page nav", () => {
    const c = calls();
    const S = state({ loopHeld: true, activeBank: 6, activeTrack: 1 });
    // current res tps = 48 (index 2) -> Left moves to 24 (index 1)
    S.ccLaneResTps[1][0][2] = 48;

    handleUiPageNavButton(S, deps(c), LEFT, 127);

    expect(S.ccLaneResTps[1][0][2]).toBe(24);
    // page is untouched (short-circuit return before page nav)
    expect(S.trackCurrentPage[1]).toBe(1);
    expect(c.log).toEqual([
      ["effectiveClip", 1],
      ["setParam", "t1_c0_k2_cc_lane_res_tps", "24"],
      ["redraw"],
    ]);
  });

  test("Loop+bank6 melodic Right raises the CC-lane resolution", () => {
    const c = calls();
    const S = state({ loopHeld: true, activeBank: 6, activeTrack: 1 });
    S.ccLaneResTps[1][0][2] = 48;

    handleUiPageNavButton(S, deps(c), RIGHT, 127);

    expect(S.ccLaneResTps[1][0][2]).toBe(96);
  });

  test("drum track Left/Right step within the loop window clamp", () => {
    const c = calls();
    // drum loop start 16 -> startPage 1; length 64 -> lastPage 1 + 4 - 1 = 4
    const left = state({ activeTrack: 0, drumStepPage: [3, 0, 0, 0] });
    handleUiPageNavButton(left, deps(c), LEFT, 127);
    expect(left.drumStepPage[0]).toBe(2);

    const clampLeft = state({ activeTrack: 0, drumStepPage: [1, 0, 0, 0] });
    handleUiPageNavButton(clampLeft, deps(c), LEFT, 127);
    expect(clampLeft.drumStepPage[0]).toBe(1); // clamped at startPage

    const right = state({ activeTrack: 0, drumStepPage: [4, 0, 0, 0] });
    handleUiPageNavButton(right, deps(c), RIGHT, 127);
    expect(right.drumStepPage[0]).toBe(4); // clamped at lastPage
  });

  test("melodic page nav uses the clip loop window when not in bank 6", () => {
    const c = calls();
    // clipLength 64 -> lastPage 0 + 4 - 1 = 3
    const S = state({ activeTrack: 1, trackCurrentPage: [0, 1, 0, 0] });
    S.clipLength[1][0] = 64;

    handleUiPageNavButton(S, deps(c), RIGHT, 127);

    expect(S.trackCurrentPage[1]).toBe(2);
  });

  test("melodic bank6 page nav uses the CC-lane loop window when the lane has length", () => {
    const c = calls();
    const S = state({ activeTrack: 1, activeBank: 6, trackCurrentPage: [0, 0, 0, 0] });
    // lane 2 length 48 -> lastPage 0 + 3 - 1 = 2
    S.ccLaneLength[1][0][2] = 48;

    handleUiPageNavButton(S, deps(c), RIGHT, 127);
    expect(S.trackCurrentPage[1]).toBe(1);

    const clamp = state({ activeTrack: 1, activeBank: 6, trackCurrentPage: [0, 2, 0, 0] });
    clamp.ccLaneLength[1][0][2] = 48;
    handleUiPageNavButton(clamp, deps(c), RIGHT, 127);
    expect(clamp.trackCurrentPage[1]).toBe(2); // clamped at lastPage
  });

  test("manual page nav disables SeqFollow for the active clip", () => {
    const c = calls();
    const S = state({ activeTrack: 1 });
    S.clipSeqFollow[1][0] = true;
    S.bankParams[1][0][7] = 1;

    handleUiPageNavButton(S, deps(c), LEFT, 127);

    expect(S.clipSeqFollow[1][0]).toBe(false);
    expect(S.bankParams[1][0][7]).toBe(0);
    expect(S.screenDirty).toBe(true);
  });
});

describe("Navigation CC workflow - Up/Down scene/zoom/octave nav", () => {
  test("ignores non-Up/Down CCs", () => {
    const c = calls();
    handleUiSceneNavButton(state(), deps(c), 60, 127);
    expect(c.log).toEqual([]);
  });

  test("Down in Session View advances the scene row by four, clamped", () => {
    const c = calls();
    const S = state({ sessionView: true, sceneRow: 4 });

    handleUiSceneNavButton(S, deps(c), DOWN, 127);

    expect(S.sceneRow).toBe(8); // NUM_CLIPS(16) - 4 = 12 ceiling
    expect(c.log).toEqual([["redraw"]]);
  });

  test("Down clamps at NUM_CLIPS - 4 and is a no-op at the bottom", () => {
    const c = calls();
    const S = state({ sessionView: true, sceneRow: 12 });

    handleUiSceneNavButton(S, deps(c), DOWN, 127);

    expect(S.sceneRow).toBe(12);
    expect(c.log).toEqual([]);
  });

  test("Up in Session View retreats the scene row by four", () => {
    const c = calls();
    const S = state({ sessionView: true, sceneRow: 4 });

    handleUiSceneNavButton(S, deps(c), UP, 127);

    expect(S.sceneRow).toBe(0);
    expect(c.log).toEqual([["redraw"]]);
  });

  test("scene nav also fires while the session overlay is held", () => {
    const c = calls();
    const S = state({ sessionView: false, sessionOverlayHeld: true, sceneRow: 0 });

    handleUiSceneNavButton(S, deps(c), DOWN, 127);

    expect(S.sceneRow).toBe(4);
  });

  test("Loop+bank6 melodic Up raises the CC-lane time base and rewrites the loop", () => {
    const c = calls();
    const S = state({
      loopHeld: true,
      activeBank: 6,
      activeTrack: 1,
      sessionView: false,
    });
    // old tps 24 (index 1) -> Up to 48; lane length 16 -> ticks 384 -> newLen 8
    S.ccLaneTps[1][0][2] = 24;
    S.ccLaneLength[1][0][2] = 16;

    handleUiSceneNavButton(S, deps(c), UP, 127);

    expect(S.ccLaneTps[1][0][2]).toBe(48);
    expect(S.ccLaneLength[1][0][2]).toBe(8);
    expect(traceDspWrites(S, c.log)).toEqual({
      directSetParams: [],
      queuedOperations: [
      { key: "t1_c0_k2_cc_lane_tps", val: "48" },
      { key: "t1_c0_k2_cc_loop_set", val: String((0 << 16) | (8 & 0xffff)) },
      ],
    });
    expect(c.log).toContainEqual(["redraw"]);
  });

  test("Loop+bank6 melodic Down appends the exact three-write resize sequence after existing queued work", () => {
    const c = calls();
    const S = state({
      loopHeld: true,
      activeBank: 6,
      activeTrack: 1,
      trackCurrentPage: [0, 3, 0, 0],
      pendingDefaultSetParams: [{ key: "older", val: "0" }],
    });
    // old tps 96 (index 3) -> Down to 48; lane length 12 -> ticks 1152 -> newLen 24
    S.ccLaneTps[1][0][2] = 96;
    S.ccLaneLength[1][0][2] = 12;
    S.ccLaneLoopStart[1][0][2] = 4;
    S.ccLaneResTps[1][0][2] = 192;

    handleUiSceneNavButton(S, deps(c), DOWN, 127);

    expect(S.ccLaneTps[1][0][2]).toBe(48);
    expect(S.ccLaneLength[1][0][2]).toBe(24);
    expect(S.ccLaneLoopStart[1][0][2]).toBe(4);
    expect(S.ccLaneResTps[1][0][2]).toBe(96);
    expect(S.trackCurrentPage[1]).toBe(1);
    expect(traceDspWrites(S, c.log)).toEqual({
      directSetParams: [],
      queuedOperations: [
        { key: "older", val: "0" },
        { key: "t1_c0_k2_cc_lane_tps", val: "48" },
        { key: "t1_c0_k2_cc_loop_set", val: String((4 << 16) | (24 & 0xffff)) },
        { key: "t1_c0_k2_cc_lane_res_tps", val: "96" },
      ],
    });
    expect(c.log).toEqual([["effectiveClip", 1], ["redraw"]]);
  });

  test("Loop+bank6 melodic resize preserves invalid resolution fallback and writes reset res TPS", () => {
    const c = calls();
    const S = state({
      loopHeld: true,
      activeBank: 6,
      activeTrack: 1,
    });
    // old res scales to 192, which is not a supported RES_TPS value, so the
    // JS mirror resets to 0 and the optional third DSP write preserves that.
    S.ccLaneTps[1][0][2] = 24;
    S.ccLaneLength[1][0][2] = 16;
    S.ccLaneResTps[1][0][2] = 96;

    handleUiSceneNavButton(S, deps(c), UP, 127);

    expect(S.ccLaneTps[1][0][2]).toBe(48);
    expect(S.ccLaneLength[1][0][2]).toBe(8);
    expect(S.ccLaneResTps[1][0][2]).toBe(0);
    expect(traceDspWrites(S, c.log)).toEqual({
      directSetParams: [],
      queuedOperations: [
        { key: "t1_c0_k2_cc_lane_tps", val: "48" },
        { key: "t1_c0_k2_cc_loop_set", val: String((0 << 16) | (8 & 0xffff)) },
        { key: "t1_c0_k2_cc_lane_res_tps", val: "0" },
      ],
    });
  });

  test("Loop+bank6 melodic resize leaves unrelated page-nav resolution producer unchanged", () => {
    const c = calls();
    const S = state({ loopHeld: true, activeBank: 6, activeTrack: 1 });
    S.ccLaneResTps[1][0][2] = 48;

    handleUiPageNavButton(S, deps(c), LEFT, 127);

    expect(traceDspWrites(S, c.log)).toEqual({
      directSetParams: [{ key: "t1_c0_k2_cc_lane_res_tps", val: "24" }],
      queuedOperations: [],
    });
  });

  test("Loop+bank6 zoom short-circuits the octave handlers", () => {
    const c = calls();
    const S = state({
      loopHeld: true,
      activeBank: 6,
      activeTrack: 1,
      trackOctave: [0, 0, 0, 0],
    });
    S.ccLaneTps[1][0][2] = 24;
    S.ccLaneLength[1][0][2] = 16;

    handleUiSceneNavButton(S, deps(c), UP, 127);

    // octave must NOT have shifted (early return)
    expect(S.trackOctave[1]).toBe(0);
  });

  test("Up in melodic Track View shifts the octave up and re-bakes the pad map", () => {
    const c = calls();
    const S = state({ activeTrack: 1, trackOctave: [0, 2, 0, 0] });
    S.liveActiveNotes = new Set([60, 64]);

    handleUiSceneNavButton(S, deps(c), UP, 127);

    expect(S.trackOctave[1]).toBe(3);
    expect(S.liveActiveNotes.size).toBe(0);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([
      ["noteOff", 1, 60],
      ["noteOff", 1, 64],
      ["padmap"],
    ]);
  });

  test("octave shift clamps to +/-4", () => {
    const c = calls();
    const up = state({ activeTrack: 1, trackOctave: [0, 4, 0, 0] });
    handleUiSceneNavButton(up, deps(c), UP, 127);
    expect(up.trackOctave[1]).toBe(4);

    const down = state({ activeTrack: 1, trackOctave: [0, -4, 0, 0] });
    handleUiSceneNavButton(down, deps(c), DOWN, 127);
    expect(down.trackOctave[1]).toBe(-4);
  });

  test("Up/Down in a drum Track View flips the drum lane page and resyncs", () => {
    const c = calls();
    const up = state({ activeTrack: 0 });
    handleUiSceneNavButton(up, deps(c), UP, 127);
    expect(c.log).toEqual([
      ["setDrumLanePage", 0, 1],
      ["syncMeta", 0],
      ["syncSteps", 0, 3],
      ["padmap"],
      ["redraw"],
    ]);

    const c2 = calls();
    const down = state({ activeTrack: 0 });
    handleUiSceneNavButton(down, deps(c2), DOWN, 127);
    expect(c2.log).toEqual([
      ["setDrumLanePage", 0, 0],
      ["syncMeta", 0],
      ["syncSteps", 0, 3],
      ["padmap"],
      ["redraw"],
    ]);
  });

  test("octave/drum nav is ignored in Session View", () => {
    const c = calls();
    const S = state({ sessionView: true, activeTrack: 1, sceneRow: 0 });

    handleUiSceneNavButton(S, deps(c), UP, 127);

    expect(S.trackOctave[1]).toBe(0);
    // sceneRow was already 0, so Up scene nav is a no-op too
    expect(c.log).toEqual([]);
  });
});
