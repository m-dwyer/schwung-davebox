import { describe, expect, test } from "vitest";
import { unlatchAllTracks } from "@overture-ui/perform/ui_latch_workflows.mjs";

function latchState(trackCount = 3) {
  return {
    drumRepeatLatched: Array.from({ length: trackCount }, () => false),
    drumRepeatHeldPad: Array.from({ length: trackCount }, () => -1),
    drumRepeatHeldPadsStack: Array.from({ length: trackCount }, () => [] as Array<{ padIdx: number; rateIdx: number; vel: number }>),
    drumRepeat2LatchedLanes: Array.from({ length: trackCount }, () => new Set<number>()),
    bankParams: Array.from({ length: trackCount }, () => [
      Array(8).fill(0),
      Array(8).fill(0),
      Array(8).fill(0),
      Array(8).fill(0),
      Array(8).fill(0),
      Array(8).fill(0),
    ]),
    pendingDefaultSetParams: [] as Array<{ key: string; val: string }>,
  };
}

describe("latch workflows", () => {
  test("universal latch sweep clears Rpt1, Rpt2, and TARP mirrors across tracks", () => {
    const S = latchState();
    S.drumRepeatLatched[0] = true;
    S.drumRepeatHeldPad[0] = 9;
    S.drumRepeatHeldPadsStack[0].push({ padIdx: 8, rateIdx: 0, vel: 80 });
    S.drumRepeat2LatchedLanes[1].add(3);
    S.drumRepeat2LatchedLanes[1].add(4);
    S.bankParams[2][5][7] = 1;
    S.pendingDefaultSetParams.push({ key: "older", val: "1" });

    unlatchAllTracks(S, 3);

    expect(S.drumRepeatLatched[0]).toBe(false);
    expect(S.drumRepeatHeldPad[0]).toBe(-1);
    expect(S.drumRepeatHeldPadsStack[0]).toEqual([]);
    expect(S.drumRepeat2LatchedLanes[1].size).toBe(0);
    expect(S.bankParams[2][5][7]).toBe(0);
    expect(S.pendingDefaultSetParams).toEqual([
      { key: "older", val: "1" },
      { key: "t0_drum_repeat_stop", val: "1" },
      { key: "t1_drum_repeat2_lane_off", val: "3" },
      { key: "t1_drum_repeat2_lane_off", val: "4" },
      { key: "t2_tarp_latch", val: "0" },
    ]);
  });

  test("universal latch sweep preserves per-track queue ordering", () => {
    const S = latchState(2);
    S.drumRepeatLatched[0] = true;
    S.drumRepeatHeldPad[0] = 5;
    S.drumRepeat2LatchedLanes[0].add(6);
    S.bankParams[0][5][7] = 1;
    S.drumRepeatLatched[1] = true;
    S.drumRepeatHeldPad[1] = 7;
    S.drumRepeat2LatchedLanes[1].add(8);
    S.bankParams[1][5][7] = 1;
    S.pendingDefaultSetParams.push({ key: "older", val: "1" });

    unlatchAllTracks(S, 2);

    expect(S.pendingDefaultSetParams).toEqual([
      { key: "older", val: "1" },
      { key: "t0_drum_repeat_stop", val: "1" },
      { key: "t0_drum_repeat2_lane_off", val: "6" },
      { key: "t0_tarp_latch", val: "0" },
      { key: "t1_drum_repeat_stop", val: "1" },
      { key: "t1_drum_repeat2_lane_off", val: "8" },
      { key: "t1_tarp_latch", val: "0" },
    ]);
  });

  test("universal latch sweep tolerates missing TARP bank params", () => {
    const S = latchState(1);
    S.bankParams[0][5] = undefined as unknown as number[];

    unlatchAllTracks(S, 1);

    expect(S.pendingDefaultSetParams).toEqual([]);
  });
});
