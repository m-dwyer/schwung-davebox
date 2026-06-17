import { beforeEach, describe, expect, test } from "vitest";
import { S } from "@overture-ui/core/ui_state.mjs";
import {
  drawAltArrow,
  drawBankHeaderRight,
  drawBankHeading,
  drawBankHeadingInverted,
  drawBankStrip,
} from "@overture-ui/render/ui_bank_chrome_render.mjs";

type DrawCall = [string, ...unknown[]];

function createDeps(calls: DrawCall[], hasAlt = true, altActive = true) {
  return {
    print: (x: number, y: number, text: string, color: number) => calls.push(["print", x, y, text, color]),
    fill_rect: (x: number, y: number, w: number, h: number, color: number) => calls.push(["fill", x, y, w, h, color]),
    bankHasAltParams: () => hasAlt,
    altIndicatorActive: () => altActive,
  };
}

describe("Bank chrome render presentation", () => {
  beforeEach(() => {
    S.activeTrack = 1;
    S.activeBank = 3;
    S.trackPadMode = [0, 0, 0, 0, 0, 0, 0, 0];
    S.sessionView = false;
    S._altBlinkPhase = 0;
  });

  test("renders normal heading with track indicator and right-side alt arrow", () => {
    const calls: DrawCall[] = [];
    drawBankHeading(createDeps(calls), "DELAY");

    expect(calls).toEqual([
      ["fill", 0, 0, 128, 9, 1],
      ["print", 4, 1, "DELAY", 0],
      ["print", 106, 1, "Tr2", 0],
      ["fill", 98, 2, 5, 1, 0],
      ["fill", 99, 3, 3, 1, 0],
      ["fill", 100, 4, 1, 1, 0],
    ]);
  });

  test("renders inverted heading and suppresses track indicator for resting overview", () => {
    const calls: DrawCall[] = [];
    drawBankHeadingInverted(createDeps(calls), "AUTO", false);

    expect(calls).toEqual(expect.arrayContaining([
      ["fill", 0, 0, 128, 9, 0],
      ["fill", 0, 0, 128, 1, 1],
      ["fill", 0, 8, 128, 1, 1],
      ["print", 4, 1, "AUTO", 1],
    ]));
    expect(calls).not.toContainEqual(["print", 106, 1, "Tr2", 1]);
    expect(calls).toContainEqual(["fill", 89, 2, 5, 1, 1]);
    expect(calls).toContainEqual(["fill", 90, 3, 3, 1, 1]);
    expect(calls).toContainEqual(["fill", 91, 4, 1, 1, 1]);
  });

  test("renders melodic overview strip with active bank marker", () => {
    S.activeBank = 5;
    const calls: DrawCall[] = [];
    const startX = drawBankStrip(createDeps(calls), 124, true);

    expect(startX).toBe(97);
    expect(calls).toHaveLength(7);
    expect(calls).toContainEqual(["fill", 117, 1, 3, 6, 0]);
    expect(calls).toContainEqual(["fill", 97, 5, 3, 2, 0]);
    expect(calls).toContainEqual(["fill", 121, 5, 3, 2, 0]);
  });

  test("renders drum overview strip in drum bank cycle order", () => {
    S.trackPadMode[1] = 1;
    S.activeBank = 0;
    const calls: DrawCall[] = [];
    const startX = drawBankStrip(createDeps(calls), 124, false);

    expect(startX).toBe(101);
    expect(calls).toHaveLength(6);
    expect(calls).toContainEqual(["fill", 105, 1, 3, 6, 1]);
    expect(calls).toContainEqual(["fill", 101, 5, 3, 2, 1]);
  });

  test("suppresses right-side bank chrome in Session View", () => {
    S.sessionView = true;
    const calls: DrawCall[] = [];
    drawBankHeaderRight(createDeps(calls), false, true);
    drawBankHeading(createDeps(calls), "CLIP");

    expect(calls).toEqual([
      ["fill", 0, 0, 128, 9, 1],
      ["print", 4, 1, "CLIP", 0],
      ["print", 106, 1, "Tr2", 0],
    ]);
  });

  test("renders and hides alt arrow by blink phase", () => {
    const visibleCalls: DrawCall[] = [];
    drawAltArrow(createDeps(visibleCalls), 20, true, true);
    expect(visibleCalls).toEqual([
      ["fill", 20, 2, 5, 1, 0],
      ["fill", 21, 3, 3, 1, 0],
      ["fill", 22, 4, 1, 1, 0],
    ]);

    S._altBlinkPhase = 1;
    const hiddenCalls: DrawCall[] = [];
    drawAltArrow(createDeps(hiddenCalls), 20, true, true);
    expect(hiddenCalls).toEqual([]);

    const steadyCalls: DrawCall[] = [];
    drawAltArrow(createDeps(steadyCalls), 20, false, false);
    expect(steadyCalls).toEqual([
      ["fill", 20, 2, 5, 1, 1],
      ["fill", 21, 3, 3, 1, 1],
      ["fill", 22, 4, 1, 1, 1],
    ]);
  });
});
