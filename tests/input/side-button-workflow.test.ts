import { describe, expect, test } from "vitest";
import {
  handleUiSideButton,
  pressTrackViewSideButton,
  releaseUiSideButtonHoldReveal,
} from "@overture-ui/input/ui_side_button_workflow.mjs";

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    fn(name: string, result?: unknown) {
      return (...args: unknown[]) => {
        log.push([name, ...args]);
        return result;
      };
    },
  };
}

function state(overrides = {}) {
  return {
    shiftHeld: false,
    tickCount: 123,
    activeTrack: 0,
    sideHeldBtn: -1,
    sideBtnPressedTick: -1,
    revealClipsTrack: -1,
    ...overrides,
  };
}

function deps(c: ReturnType<typeof calls>, overrides = {}) {
  return {
    forceRedraw: c.fn("redraw"),
    handleSessionViewSideRowPress: c.fn("sessionSide", false),
    selectTrackGesture: c.fn("selectTrack"),
    ...overrides,
  };
}

describe("Side button workflow", () => {
  test("plain side buttons select tracks 1-4 with reversed mapping", () => {
    const c = calls();
    const S = state();
    const d = deps(c);

    handleUiSideButton(S, d, 43, 127);
    handleUiSideButton(S, d, 42, 127);
    handleUiSideButton(S, d, 41, 127);
    handleUiSideButton(S, d, 40, 127);

    expect(c.log).toEqual([
      ["sessionSide", 0],
      ["selectTrack", 0],
      ["sessionSide", 1],
      ["selectTrack", 1],
      ["sessionSide", 2],
      ["selectTrack", 2],
      ["sessionSide", 3],
      ["selectTrack", 3],
    ]);
    expect(S.sideHeldBtn).toBe(0);
    expect(S.sideBtnPressedTick).toBe(123);
  });

  test("Shift+side selects tracks 5-8 with reversed mapping", () => {
    const c = calls();
    const S = state({ shiftHeld: true });
    const d = deps(c);

    handleUiSideButton(S, d, 43, 127);
    handleUiSideButton(S, d, 40, 127);

    expect(c.log).toEqual([
      ["sessionSide", 0],
      ["selectTrack", 4],
      ["sessionSide", 3],
      ["selectTrack", 7],
    ]);
  });

  test("release clears hold state only for the held side button", () => {
    const c = calls();
    const S = state({ sideHeldBtn: 3, sideBtnPressedTick: 100, revealClipsTrack: 0 });
    const d = deps(c);

    expect(releaseUiSideButtonHoldReveal(S, d, 2)).toBe(false);
    expect(S.sideHeldBtn).toBe(3);
    expect(S.sideBtnPressedTick).toBe(100);
    expect(S.revealClipsTrack).toBe(0);
    expect(c.log).toEqual([]);

    expect(releaseUiSideButtonHoldReveal(S, d, 3)).toBe(true);
    expect(S.sideHeldBtn).toBe(-1);
    expect(S.sideBtnPressedTick).toBe(-1);
    expect(S.revealClipsTrack).toBe(-1);
    expect(c.log).toEqual([["redraw"]]);
  });

  test("release without reveal does not redraw", () => {
    const c = calls();
    const S = state({ sideHeldBtn: 1, sideBtnPressedTick: 100, revealClipsTrack: -1 });

    handleUiSideButton(S, deps(c), 41, 0);

    expect(S.sideHeldBtn).toBe(-1);
    expect(S.sideBtnPressedTick).toBe(-1);
    expect(c.log).toEqual([]);
  });

  test("Session View side row priority swallows Track View track selection", () => {
    const c = calls();
    const S = state();
    const d = deps(c, { handleSessionViewSideRowPress: c.fn("sessionSide", true) });

    handleUiSideButton(S, d, 40, 127);

    expect(c.log).toEqual([["sessionSide", 3]]);
    expect(S.sideHeldBtn).toBe(-1);
    expect(S.sideBtnPressedTick).toBe(-1);
  });

  test("non-side CCs and non-press values are ignored", () => {
    const c = calls();
    const S = state();
    const d = deps(c);

    expect(handleUiSideButton(S, d, 39, 127)).toBeUndefined();
    expect(handleUiSideButton(S, d, 44, 127)).toBeUndefined();
    expect(handleUiSideButton(S, d, 40, 1)).toBeUndefined();

    expect(c.log).toEqual([]);
    expect(S.sideHeldBtn).toBe(-1);
  });

  test("press helper arms hold tracking at the current tick", () => {
    const c = calls();
    const S = state({ tickCount: 456 });

    pressTrackViewSideButton(S, deps(c), 2);

    expect(c.log).toEqual([["selectTrack", 1]]);
    expect(S.sideHeldBtn).toBe(2);
    expect(S.sideBtnPressedTick).toBe(456);
  });
});
