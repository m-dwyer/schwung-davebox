import { describe, expect, test } from "vitest";
import {
  clearClipImpl,
  clearRowImpl,
  copyClipImpl,
  copyRowImpl,
  copyStepImpl,
  cutClipImpl,
  cutRowImpl,
  doDoubleFillImpl,
  hardResetClipImpl,
  selectClipOnTrackImpl,
} from "@overture-ui/sync/ui_clip_edit_ops.mjs";
import { NUM_TRACKS } from "@overture-ui/core/ui_constants.mjs";

// Clip/row/step clipboard ops. COALESCING-SENSITIVE set_param emitters: these
// pin the exact pendingDefaultSetParams sequences (push vs unshift), the JS
// mirror mutations, and the selectClipOnTrack 4-branch state machine.

const DRUM = 1;
const MELODIC = 0;
const NUM_STEPS = 256;

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    fn(name: string) {
      return (...args: unknown[]) => log.push([name, ...args]);
    },
    names() {
      return log.map((e) => e[0]);
    },
  };
}

function grid<T>(dims: number[], fill: () => T): any {
  if (dims.length === 0) return fill();
  const [n, ...rest] = dims;
  return Array.from({ length: n }, () => grid(rest, fill));
}

function makeDeps(c: ReturnType<typeof calls>, opts: { noSet?: boolean; effClip?: number } = {}) {
  return {
    setParam: opts.noSet ? null : c.fn("setParam"),
    resetPerClipBankParamsToDefault: c.fn("resetPerClipBankParamsToDefault"),
    refreshPerClipBankParams: c.fn("refreshPerClipBankParams"),
    forceRedraw: c.fn("forceRedraw"),
    effectiveClip: (t: number) => opts.effClip ?? 0,
  };
}

// NUM_TRACKS tracks, 2 clips, 256 steps, 32 drum lanes, 8 cc lanes.
// Row ops loop all NUM_TRACKS, so every per-track grid is sized to it.
const NT = NUM_TRACKS;
function makeState(overrides: Record<string, unknown> = {}) {
  const s: Record<string, unknown> = {
    undoAvailable: false,
    redoAvailable: true,
    undoSeqArpSnapshot: { x: 1 },
    activeTrack: 0,
    activeBank: 0,
    playing: false,
    clearDrainHold: 0,
    trackPadMode: Array(NT).fill(MELODIC),
    trackActiveClip: Array(NT).fill(0),
    trackClipPlaying: Array(NT).fill(false),
    trackWillRelaunch: Array(NT).fill(false),
    trackQueuedClip: Array(NT).fill(-1),
    trackPendingPageStop: Array(NT).fill(false),
    trackCurrentPage: Array(NT).fill(0),
    activeDrumLane: Array(NT).fill(0),
    clipLength: grid([NT, 2], () => 16),
    clipLoopStart: grid([NT, 2], () => 0),
    clipSteps: grid([NT, 2, NUM_STEPS], () => 0),
    clipNonEmpty: grid([NT, 2], () => true),
    clipTPS: grid([NT, 2], () => 48),
    clipLengthManuallySet: grid([NT, 2], () => true),
    drumLaneLengthManuallySet: Array(NT).fill(true),
    drumLaneSteps: grid([NT, 32, NUM_STEPS], () => "9"),
    drumLaneHasNotes: grid([NT, 32], () => true),
    drumClipNonEmpty: grid([NT, 2], () => true),
    drumLaneLength: Array(NT).fill(16),
    drumLaneLoopStart: Array(NT).fill(4),
    drumLaneTPS: Array(NT).fill(48),
    drumStepPage: Array(NT).fill(1),
    trackCCAutoBits: grid([NT, 2], () => 7),
    clipCCVal: grid([NT, 2], () => [1, 2, 3, 4, 5, 6, 7, 8]),
    clipAtHas: grid([NT, 2], () => true),
    ccLaneLoopStart: grid([NT, 2, 8], () => 5),
    ccLaneLength: grid([NT, 2, 8], () => 9),
    ccLaneTps: grid([NT, 2, 8], () => 7),
    seqActiveNotes: new Set<number>([1, 2]),
    seqLastStep: 9,
    seqNoteOnClipTick: 9,
    pendingDefaultSetParams: [] as Array<{ key: string; val: string }>,
    pendingStepsReread: 0,
    pendingStepsRereadTrack: -1,
    pendingStepsRereadClip: -1,
    pendingDrumResync: 0,
    pendingDrumResyncTrack: -1,
    pendingDrumLaneResync: 0,
    pendingDrumLaneResyncTrack: -1,
    pendingDrumLaneResyncLane: -1,
    ...overrides,
  };
  return s;
}

describe("clearClip", () => {
  test("no setParam → no-op", () => {
    const c = calls();
    const S = makeState();
    clearClipImpl(S, makeDeps(c, { noSet: true }), 0, 0, false);
    expect(S.pendingDefaultSetParams).toEqual([]);
    expect(S.undoAvailable).toBe(false);
  });

  test("melodic: unshifts _clear, wipes steps + automation mirrors", () => {
    const c = calls();
    const S = makeState();
    (S.clipSteps as any)[0][0][0] = 5;
    clearClipImpl(S, makeDeps(c), 0, 0, false);
    expect(S.pendingDefaultSetParams[0]).toEqual({ key: "t0_c0_clear", val: "1" });
    expect(S.clearDrainHold).toBe(1);
    expect((S.clipSteps as any)[0][0][0]).toBe(0);
    expect((S.clipNonEmpty as any)[0][0]).toBe(false);
    expect((S.trackCCAutoBits as any)[0][0]).toBe(0);
    expect((S.clipCCVal as any)[0][0]).toEqual(new Array(8).fill(-1));
    expect((S.clipAtHas as any)[0][0]).toBe(false);
    expect(S.pendingStepsReread).toBe(2);
    expect(S.undoAvailable).toBe(true);
    expect(S.redoAvailable).toBe(false);
    expect(S.undoSeqArpSnapshot).toBeNull();
  });

  test("melodic keepPlaying on focused playing clip → _clear_keep", () => {
    const c = calls();
    const S = makeState({ trackClipPlaying: [true, false], trackActiveClip: [0, 0] });
    clearClipImpl(S, makeDeps(c), 0, 0, true);
    expect(S.pendingDefaultSetParams[0]).toEqual({ key: "t0_c0_clear_keep", val: "1" });
  });

  test("focused empty clip while playing → relaunch queued", () => {
    const c = calls();
    const S = makeState({
      playing: true,
      trackClipPlaying: [false, false],
      trackActiveClip: [0, 0],
      pendingDefaultSetParams: [{ key: "older", val: "1" }],
    });
    clearClipImpl(S, makeDeps(c), 0, 0, false);
    // _clear is priority-unshifted before older queued work; launch_clip is appended.
    expect(S.pendingDefaultSetParams).toEqual([
      { key: "t0_c0_clear", val: "1" },
      { key: "older", val: "1" },
      { key: "t0_launch_clip", val: "0" },
    ]);
    expect((S.trackQueuedClip as any)[0]).toBe(0);
  });

  test("drum: unshifts drum_clear, wipes all 32 lanes", () => {
    const c = calls();
    const S = makeState({ trackPadMode: [DRUM, MELODIC] });
    clearClipImpl(S, makeDeps(c), 0, 0, false);
    expect(S.pendingDefaultSetParams[0]).toEqual({ key: "t0_c0_drum_clear", val: "0" });
    expect((S.drumLaneSteps as any)[0][0][0]).toBe("0");
    expect((S.drumLaneHasNotes as any)[0][31]).toBe(false);
    expect((S.drumClipNonEmpty as any)[0][0]).toBe(false);
  });
});

describe("hardResetClip", () => {
  test("melodic: unshifts hard_reset, resets length/tps + bank defaults", () => {
    const c = calls();
    const S = makeState({
      clipLength: grid([2, 2], () => 64),
      pendingDefaultSetParams: [{ key: "older", val: "1" }],
    });
    hardResetClipImpl(S, makeDeps(c), 0, 0);
    expect(S.pendingDefaultSetParams).toEqual([
      { key: "t0_c0_hard_reset", val: "1" },
      { key: "older", val: "1" },
    ]);
    expect((S.clipLength as any)[0][0]).toBe(16);
    expect((S.clipTPS as any)[0][0]).toBe(24);
    expect((S.clipLengthManuallySet as any)[0][0]).toBe(false);
    expect(c.names()).toContain("resetPerClipBankParamsToDefault");
  });

  test("drum: unshifts drum_reset, resets lane meta", () => {
    const c = calls();
    const S = makeState({ trackPadMode: [DRUM, MELODIC], drumLaneLength: [64, 16] });
    hardResetClipImpl(S, makeDeps(c), 0, 0);
    expect(S.pendingDefaultSetParams[0]).toEqual({ key: "t0_c0_drum_reset", val: "1" });
    expect((S.drumLaneLength as any)[0]).toBe(16);
    expect((S.drumLaneTPS as any)[0]).toBe(24);
    expect((S.drumStepPage as any)[0]).toBe(0);
    expect(c.names()).not.toContain("resetPerClipBankParamsToDefault");
  });
});

describe("copyClip / cutClip", () => {
  test("copyClip mirrors src→dst + pushes clip_copy", () => {
    const c = calls();
    const S = makeState({
      pendingDefaultSetParams: [{ key: "older", val: "1" }],
    });
    (S.clipSteps as any)[0][0][0] = 7;
    (S.clipLength as any)[0][0] = 32;
    copyClipImpl(S, makeDeps(c), 0, 0, 1, 1);
    expect(S.pendingDefaultSetParams).toEqual([
      { key: "older", val: "1" },
      { key: "clip_copy", val: "0 0 1 1" },
    ]);
    expect((S.clipSteps as any)[1][1][0]).toBe(7);
    expect((S.clipLength as any)[1][1]).toBe(32);
    // slice() → independent copy
    (S.clipSteps as any)[1][1][0] = 99;
    expect((S.clipSteps as any)[0][0][0]).toBe(7);
  });

  test("copyClip same src==dst → no-op", () => {
    const c = calls();
    const S = makeState();
    copyClipImpl(S, makeDeps(c), 0, 0, 0, 0);
    expect(S.pendingDefaultSetParams).toEqual([]);
  });

  test("cutClip mirrors dst then resets src", () => {
    const c = calls();
    const S = makeState({
      pendingDefaultSetParams: [{ key: "older", val: "1" }],
    });
    (S.clipSteps as any)[0][0][0] = 7;
    (S.clipLength as any)[0][0] = 32;
    cutClipImpl(S, makeDeps(c), 0, 0, 1, 1);
    expect(S.pendingDefaultSetParams).toEqual([
      { key: "older", val: "1" },
      { key: "clip_cut", val: "0 0 1 1" },
    ]);
    expect((S.clipSteps as any)[1][1][0]).toBe(7);
    expect((S.clipLength as any)[1][1]).toBe(32);
    // src reset
    expect((S.clipSteps as any)[0][0][0]).toBe(0);
    expect((S.clipLength as any)[0][0]).toBe(16);
    expect((S.clipNonEmpty as any)[0][0]).toBe(false);
  });

  test("copyClip / cutClip no setParam → no-op", () => {
    const c = calls();
    const copyState = makeState();
    const cutState = makeState();

    copyClipImpl(copyState, makeDeps(c, { noSet: true }), 0, 0, 1, 1);
    cutClipImpl(cutState, makeDeps(c, { noSet: true }), 0, 0, 1, 1);

    expect(copyState.pendingDefaultSetParams).toEqual([]);
    expect(copyState.undoAvailable).toBe(false);
    expect(cutState.pendingDefaultSetParams).toEqual([]);
    expect(cutState.undoAvailable).toBe(false);
  });
});

describe("copyRow / cutRow / clearRow", () => {
  test("copyRow copies all tracks + pushes row_copy", () => {
    const c = calls();
    const S = makeState();
    (S.clipSteps as any)[0][0][0] = 3;
    (S.clipSteps as any)[1][0][0] = 4;
    copyRowImpl(S, makeDeps(c), 0, 1);
    expect(S.pendingDefaultSetParams).toEqual([{ key: "row_copy", val: "0 1" }]);
    expect((S.clipSteps as any)[0][1][0]).toBe(3);
    expect((S.clipSteps as any)[1][1][0]).toBe(4);
  });

  test("cutRow copies dst then clears src on every track", () => {
    const c = calls();
    const S = makeState();
    (S.clipSteps as any)[0][0][0] = 3;
    cutRowImpl(S, makeDeps(c), 0, 1);
    expect(S.pendingDefaultSetParams).toEqual([{ key: "row_cut", val: "0 1" }]);
    expect((S.clipSteps as any)[0][1][0]).toBe(3);
    expect((S.clipSteps as any)[0][0][0]).toBe(0); // src wiped
    expect((S.clipNonEmpty as any)[0][0]).toBe(false);
    expect((S.clipLength as any)[0][0]).toBe(16);
  });

  test("clearRow wipes every track's clip at rowIdx + pushes row_clear", () => {
    const c = calls();
    const S = makeState();
    (S.clipSteps as any)[0][1][0] = 5;
    clearRowImpl(S, makeDeps(c), 1);
    expect(S.pendingDefaultSetParams).toEqual([{ key: "row_clear", val: "1" }]);
    expect((S.clipSteps as any)[0][1][0]).toBe(0);
    expect((S.clipNonEmpty as any)[0][1]).toBe(false);
    expect((S.drumClipNonEmpty as any)[0][1]).toBe(false);
  });

  test("clearRow resets bank params for the active clip row", () => {
    const c = calls();
    const S = makeState(); // every track's active clip defaults to 0
    clearRowImpl(S, makeDeps(c), 0); // rowIdx === active clip on every track
    expect(c.names().filter((n) => n === "resetPerClipBankParamsToDefault").length).toBe(NT);
  });
});

describe("copyStep", () => {
  test("melodic: pushes step copy_to + mirrors clip step", () => {
    const c = calls();
    const S = makeState();
    (S.clipSteps as any)[0][0][3] = 6;
    copyStepImpl(S, makeDeps(c), 0, 0, 3, 7);
    expect(S.pendingDefaultSetParams).toEqual([
      { key: "t0_c0_step_3_copy_to", val: "7" },
    ]);
    expect((S.clipSteps as any)[0][0][7]).toBe(6);
    expect((S.clipNonEmpty as any)[0][0]).toBe(true);
    expect(S.pendingStepsReread).toBe(2);
  });

  test("drum: pushes lane step copy_to + mirrors lane step", () => {
    const c = calls();
    const S = makeState({ trackPadMode: [DRUM, MELODIC], activeDrumLane: [4, 0] });
    (S.drumLaneSteps as any)[0][4][3] = "7";
    copyStepImpl(S, makeDeps(c), 0, 0, 3, 9);
    expect(S.pendingDefaultSetParams).toEqual([
      { key: "t0_l4_step_3_copy_to", val: "9" },
    ]);
    expect((S.drumLaneSteps as any)[0][4][9]).toBe("7");
    expect(S.pendingDrumLaneResyncLane).toBe(4);
  });
});

describe("selectClipOnTrack — 4-branch state machine", () => {
  test("playing active clip, pending stop → re-launch legato", () => {
    const c = calls();
    const S = makeState({ trackClipPlaying: [true, false], trackPendingPageStop: [true, false] });
    selectClipOnTrackImpl(S, makeDeps(c), 0, 0);
    expect(c.log).toEqual([["setParam", "t0_launch_clip", "0"]]);
  });

  test("playing active clip, no pending stop → arm stop_at_end", () => {
    const c = calls();
    const S = makeState({ trackClipPlaying: [true, false] });
    selectClipOnTrackImpl(S, makeDeps(c), 0, 0);
    expect(c.log).toEqual([["setParam", "t0_stop_at_end", "1"]]);
  });

  test("primed-to-restart active clip → deactivate", () => {
    const c = calls();
    const S = makeState({ trackWillRelaunch: [true, false] });
    selectClipOnTrackImpl(S, makeDeps(c), 0, 0);
    expect(c.log).toEqual([["setParam", "t0_deactivate", "1"]]);
  });

  test("queued clip → deactivate", () => {
    const c = calls();
    const S = makeState({ trackQueuedClip: [1, -1] });
    selectClipOnTrackImpl(S, makeDeps(c), 0, 1);
    expect(c.log).toEqual([["setParam", "t0_deactivate", "1"]]);
  });

  test("else → focus + launch, page snaps to loop_start page", () => {
    const c = calls();
    const S = makeState({ clipLoopStart: grid([2, 2], () => 0) });
    (S.clipLoopStart as any)[0][1] = 32; // page 2
    selectClipOnTrackImpl(S, makeDeps(c), 0, 1);
    expect((S.trackActiveClip as any)[0]).toBe(1);
    expect((S.trackCurrentPage as any)[0]).toBe(2);
    expect(c.names()).toEqual(["refreshPerClipBankParams", "setParam"]);
    expect(c.log).toContainEqual(["setParam", "t0_launch_clip", "1"]);
  });

  test("else on drum track → page 0 + drum resync", () => {
    const c = calls();
    const S = makeState({ trackPadMode: [DRUM, MELODIC] });
    selectClipOnTrackImpl(S, makeDeps(c), 0, 1);
    expect((S.trackCurrentPage as any)[0]).toBe(0);
    expect(S.pendingDrumResync).toBe(2);
  });
});

describe("doDoubleFill", () => {
  test("drum ALL LANES (bank 7) → all_lanes_double_fill", () => {
    const c = calls();
    const S = makeState({ trackPadMode: [DRUM, MELODIC], activeBank: 7 });
    doDoubleFillImpl(S, makeDeps(c));
    expect(c.log).toContainEqual(["setParam", "t0_all_lanes_double_fill", "1"]);
    expect(S.pendingDrumResync).toBe(2);
  });

  test("drum single lane → loop_double_fill, doubles drumLaneLength", () => {
    const c = calls();
    const S = makeState({ trackPadMode: [DRUM, MELODIC], activeDrumLane: [2, 0], drumLaneLength: [16, 16] });
    doDoubleFillImpl(S, makeDeps(c));
    expect(c.log).toContainEqual(["setParam", "t0_l2_loop_double_fill", "1"]);
    expect((S.drumLaneLength as any)[0]).toBe(32);
  });

  test("drum lane already too long → CLIP FULL, no setParam", () => {
    const c = calls();
    const S = makeState({ trackPadMode: [DRUM, MELODIC], drumLaneLength: [200, 16] });
    doDoubleFillImpl(S, makeDeps(c));
    expect(c.names()).not.toContain("setParam");
    expect((S.drumLaneLength as any)[0]).toBe(200);
  });

  test("melodic → loop_double_fill, doubles clipLength at effectiveClip", () => {
    const c = calls();
    const S = makeState({ clipLength: grid([2, 2], () => 16) });
    doDoubleFillImpl(S, makeDeps(c, { effClip: 0 }));
    expect(c.log).toContainEqual(["setParam", "t0_loop_double_fill", "1"]);
    expect((S.clipLength as any)[0][0]).toBe(32);
    expect(S.pendingStepsReread).toBe(2);
    expect(c.names()).toContain("refreshPerClipBankParams");
  });

  test("melodic clip too long → CLIP FULL, no setParam", () => {
    const c = calls();
    const S = makeState({ clipLength: grid([2, 2], () => 200) });
    doDoubleFillImpl(S, makeDeps(c, { effClip: 0 }));
    expect(c.names()).not.toContain("setParam");
    expect((S.clipLength as any)[0][0]).toBe(200);
  });
});
