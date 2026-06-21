import { describe, expect, test } from "vitest";
import {
  anyMelodicClipHasContentImpl,
  xposeCancelPreviewImpl,
  xposeCommitImpl,
  xposePreviewSetImpl,
} from "@overture-ui/perform/ui_transpose_workflow.mjs";
import { traceDspWrites } from "../helpers/dsp-queue-trace";

const DRUM = 1;
const MELODIC = 0;

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
    trackPadMode: [MELODIC, DRUM, MELODIC],
    clipNonEmpty: [
      [false, false],
      [true, true],
      [false, false],
    ],
    padKey: 2,
    padScale: 5,
    xposePrevKey: null as null | number,
    xposePrevScale: null as null | number,
    pendingDefaultSetParams: [] as Array<{ key: string; val: string }>,
    screenDirty: false,
    ...overrides,
  };
}

function deps(c: ReturnType<typeof calls>, opts: { noSet?: boolean } = {}) {
  return {
    numTracks: 3,
    numClips: 2,
    padModeDrum: DRUM,
    setParam: opts.noSet ? null : c.fn("setParam"),
    computePadNoteMap: c.fn("computePadNoteMap"),
    forceRedraw: c.fn("forceRedraw"),
  };
}

describe("transpose workflow - melodic content detection", () => {
  test("detects content only in non-drum clips", () => {
    const c = calls();
    expect(anyMelodicClipHasContentImpl(state(), deps(c))).toBe(false);
    expect(anyMelodicClipHasContentImpl(
      state({ clipNonEmpty: [[false, false], [true, true], [false, true]] }),
      deps(c),
    )).toBe(true);
  });
});

describe("transpose workflow - preview", () => {
  test("candidate equal to committed cancels an existing preview", () => {
    const c = calls();
    const S = state({
      xposePrevKey: 7,
      xposePrevScale: 8,
      pendingDefaultSetParams: [{ key: "older", val: "1" }],
    });
    xposePreviewSetImpl(S, deps(c), 2, 5);
    expect(S.xposePrevKey).toBeNull();
    expect(S.xposePrevScale).toBeNull();
    expect(traceDspWrites(S, c.log)).toEqual({
      directSetParams: [],
      queuedOperations: [
        { key: "older", val: "1" },
        { key: "t0_xpose_apply", val: "2 5 2 5 0" },
      ],
    });
    expect(c.log).toEqual([["computePadNoteMap"]]);
    expect(S.screenDirty).toBe(true);
  });

  test("candidate equal to committed is a no-op when no preview exists", () => {
    const c = calls();
    const S = state();
    xposePreviewSetImpl(S, deps(c), 2, 5);
    expect(S.pendingDefaultSetParams).toEqual([]);
    expect(c.log).toEqual([]);
    expect(S.screenDirty).toBe(false);
  });

  test("preview sets candidate state, recomputes pad map, writes preview payload, and dirties screen", () => {
    const c = calls();
    const S = state();
    xposePreviewSetImpl(S, deps(c), 9, 3);
    expect(S.xposePrevKey).toBe(9);
    expect(S.xposePrevScale).toBe(3);
    expect(c.log).toEqual([
      ["computePadNoteMap"],
      ["setParam", "t0_xpose_prev", "2 5 9 3"],
    ]);
    expect(S.screenDirty).toBe(true);
  });

  test("preview still recomputes and dirties when direct setParam is unavailable", () => {
    const c = calls();
    const S = state();
    xposePreviewSetImpl(S, deps(c, { noSet: true }), 9, 3);
    expect(c.log).toEqual([["computePadNoteMap"]]);
    expect(S.screenDirty).toBe(true);
  });
});

describe("transpose workflow - cancel and commit", () => {
  test("cancel without a preview is a no-op", () => {
    const c = calls();
    const S = state();
    xposeCancelPreviewImpl(S, deps(c));
    expect(S.pendingDefaultSetParams).toEqual([]);
    expect(c.log).toEqual([]);
    expect(S.screenDirty).toBe(false);
  });

  test("cancel queues deferred apply-to-committed payload and recomputes pad map", () => {
    const c = calls();
    const S = state({
      xposePrevKey: 9,
      xposePrevScale: 3,
      pendingDefaultSetParams: [{ key: "older", val: "1" }],
    });
    xposeCancelPreviewImpl(S, deps(c));
    expect(S.xposePrevKey).toBeNull();
    expect(S.xposePrevScale).toBeNull();
    expect(traceDspWrites(S, c.log)).toEqual({
      directSetParams: [],
      queuedOperations: [
        { key: "older", val: "1" },
        { key: "t0_xpose_apply", val: "2 5 2 5 0" },
      ],
    });
    expect(c.log).toEqual([["computePadNoteMap"]]);
    expect(S.screenDirty).toBe(true);
  });

  test("commit queues deferred apply payload, adopts key/scale, recomputes, redraws, and dirties", () => {
    const c = calls();
    const S = state({
      xposePrevKey: 9,
      xposePrevScale: 3,
      pendingDefaultSetParams: [{ key: "older", val: "1" }],
    });
    xposeCommitImpl(S, deps(c), 9, 3);
    expect(traceDspWrites(S, c.log)).toEqual({
      directSetParams: [],
      queuedOperations: [
        { key: "older", val: "1" },
        { key: "t0_xpose_apply", val: "2 5 9 3 1" },
      ],
    });
    expect(S.padKey).toBe(9);
    expect(S.padScale).toBe(3);
    expect(S.xposePrevKey).toBeNull();
    expect(S.xposePrevScale).toBeNull();
    expect(c.log).toEqual([
      ["computePadNoteMap"],
      ["forceRedraw"],
    ]);
    expect(S.screenDirty).toBe(true);
  });
});
