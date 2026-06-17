import { describe, expect, test } from "vitest";
import {
  clearAllMuteSoloImpl,
  effectiveMuteImpl,
  setTrackMuteImpl,
  setTrackSoloImpl,
} from "@overture-ui/perform/ui_mute_solo_workflow.mjs";

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
    numTracks: 4,
    setParam: c.fn("set"),
    ...overrides,
  };
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    screenDirty: false,
    trackMuted: [false, false, false, false],
    trackSoloed: [false, false, false, false],
    ...overrides,
  };
}

describe("Mute/solo workflow", () => {
  test("computes effective mute from direct mutes and active solos", () => {
    expect(effectiveMuteImpl(state(), 0)).toBe(false);
    expect(effectiveMuteImpl(state({ trackMuted: [false, true, false, false] }), 1)).toBe(true);

    const S = state({ trackSoloed: [false, false, true, false] });
    expect(effectiveMuteImpl(S, 0)).toBe(true);
    expect(effectiveMuteImpl(S, 2)).toBe(false);
  });

  test("writes direct mute state, param payload, and redraw dirty flag", () => {
    const c = calls();
    const S = state();

    setTrackMuteImpl(S, deps(c), 1, true);
    setTrackMuteImpl(S, deps(c), 1, false);

    expect(S.trackMuted).toEqual([false, false, false, false]);
    expect(S.trackSoloed).toEqual([false, false, false, false]);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([
      ["set", "t1_mute", "1"],
      ["set", "t1_mute", "0"],
    ]);
  });

  test("muting a soloed track clears solo before writing mute", () => {
    const c = calls();
    const S = state({ trackSoloed: [false, true, false, false] });

    setTrackMuteImpl(S, deps(c), 1, true);

    expect(S.trackMuted[1]).toBe(true);
    expect(S.trackSoloed[1]).toBe(false);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([
      ["set", "t1_solo", "0"],
      ["set", "t1_mute", "1"],
    ]);
  });

  test("writes solo state, param payload, and redraw dirty flag", () => {
    const c = calls();
    const S = state();

    setTrackSoloImpl(S, deps(c), 2, true);
    setTrackSoloImpl(S, deps(c), 2, false);

    expect(S.trackMuted).toEqual([false, false, false, false]);
    expect(S.trackSoloed).toEqual([false, false, false, false]);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([
      ["set", "t2_solo", "1"],
      ["set", "t2_solo", "0"],
    ]);
  });

  test("soloing a muted track clears mute before writing solo", () => {
    const c = calls();
    const S = state({ trackMuted: [false, false, true, false] });

    setTrackSoloImpl(S, deps(c), 2, true);

    expect(S.trackMuted[2]).toBe(false);
    expect(S.trackSoloed[2]).toBe(true);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([
      ["set", "t2_mute", "0"],
      ["set", "t2_solo", "1"],
    ]);
  });

  test("clears all mute/solo state and writes clear payload", () => {
    const c = calls();
    const S = state({
      trackMuted: [true, false, true, false],
      trackSoloed: [false, true, false, true],
    });

    clearAllMuteSoloImpl(S, deps(c));

    expect(S.trackMuted).toEqual([false, false, false, false]);
    expect(S.trackSoloed).toEqual([false, false, false, false]);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([["set", "mute_all_clear", "1"]]);
  });

  test("updates JS state and redraw flag even when set_param is unavailable", () => {
    const c = calls();
    const S = state({ trackMuted: [false, true, false, false] });

    setTrackSoloImpl(S, deps(c, { setParam: null }), 1, true);
    clearAllMuteSoloImpl(S, deps(c, { setParam: null }));

    expect(S.trackMuted).toEqual([false, false, false, false]);
    expect(S.trackSoloed).toEqual([false, false, false, false]);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([]);
  });
});
