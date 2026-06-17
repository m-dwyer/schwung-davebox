import { beforeEach, describe, expect, test } from "vitest";
import { S } from "@overture-ui/core/ui_state.mjs";
import { renderLoopView } from "@overture-ui/render/ui_loop_render.mjs";

type DrawCall = [string, ...unknown[]];

function createDeps(calls: DrawCall[]) {
  return {
    print: (x: number, y: number, text: string, color: number) => calls.push(["print", x, y, text, color]),
    pixelPrint: (x: number, y: number, text: string, color: number) => calls.push(["pixel", x, y, text, color]),
    fill_rect: (x: number, y: number, w: number, h: number, color: number) => calls.push(["fill", x, y, w, h, color]),
  };
}

function printedTexts(calls: DrawCall[]) {
  return calls
    .filter((call) => call[0] === "print" || call[0] === "pixel")
    .map((call) => String(call[3]));
}

describe("Loop view presentation", () => {
  beforeEach(() => {
    S.activeTrack = 0;
    S.activeBank = 0;
    S.tickCount = 0;
    S.trackPadMode = [0];
    S.trackActiveClip = [1];
    S.trackQueuedClip = [-1];
    S.trackWillRelaunch = [false];
    S.drumLaneLength = [32];
    S.clipLength = [[16, 48]];
    S.clipTPS = [[24, 24]];
    S.ccActiveLane = [1];
    S.trackCCType = [[0, 0, 0, 0, 0, 0, 0, 0]];
    S.trackCCAssign = [[7, 74, 71, 73, 72, 91, 93, 10]];
    S.ccLaneLength = [[[0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]]];
    S.ccLaneTps = [[[0, 0, 0, 0, 0, 0, 0, 0], [0, 12, 0, 0, 0, 0, 0, 0]]];
    S.ccLaneResTps = [[[0, 0, 0, 0, 0, 0, 0, 0], [0, 48, 0, 0, 0, 0, 0, 0]]];
  });

  test("renders drum lane length loop view", () => {
    S.trackPadMode[0] = 1;
    S.activeBank = 0;
    const calls: DrawCall[] = [];
    renderLoopView(createDeps(calls));

    expect(printedTexts(calls)).toEqual(expect.arrayContaining([
      "Lane length", "STEP BTN=by page", "JOG TURN=by step", "Steps: ", "32/256",
    ]));
    expect(calls).toContainEqual(["fill", 0, 15, 128, 1, 1]);
    expect(calls).toContainEqual(["fill", 66, 50, 38, 14, 1]);
  });

  test("renders drum all-lanes loop view with blinking ALL label", () => {
    S.trackPadMode[0] = 1;
    S.activeBank = 7;
    S.tickCount = 0;
    const calls: DrawCall[] = [];
    renderLoopView(createDeps(calls));

    expect(printedTexts(calls)).toEqual(expect.arrayContaining([
      "Clip length-ALL lanes", "32/256",
    ]));
  });

  test("renders AUTO lane config loop view", () => {
    S.activeBank = 6;
    S.clipLength[0][1] = 64;
    const calls: DrawCall[] = [];
    renderLoopView(createDeps(calls));

    expect(printedTexts(calls)).toEqual(expect.arrayContaining([
      "Lane config: K2-L2 CC74",
      "STEP BTN=Leng by page",
      "JOG TURN=Leng by step",
      "Resolution: <",
      "1/8",
      ">",
      "Zoom: +",
      "1/32",
      "-",
      "64/256",
    ]));
    expect(calls).toContainEqual(["fill", 0, 15, 128, 1, 1]);
    expect(calls).toContainEqual(["fill", 78, 33, 20, 7, 1]);
    expect(calls).toContainEqual(["fill", 42, 40, 26, 7, 1]);
  });

  test("renders melodic clip length loop view", () => {
    const calls: DrawCall[] = [];
    renderLoopView(createDeps(calls));

    expect(printedTexts(calls)).toEqual(expect.arrayContaining([
      "Clip Length", "STEP BTN=by page", "JOG TURN=by step", "48/256",
    ]));
    expect(calls).toContainEqual(["fill", 0, 15, 128, 1, 1]);
  });
});
