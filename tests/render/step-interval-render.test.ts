import { beforeEach, describe, expect, test } from "vitest";
import { S } from "@overture-ui/core/ui_state.mjs";
import { renderStepIntervalOverlay } from "@overture-ui/render/ui_step_interval_render.mjs";

type DrawCall = [string, ...unknown[]];

function createDeps(calls: DrawCall[]) {
  return {
    print: (x: number, y: number, text: string, color: number) => calls.push(["print", x, y, text, color]),
    fill_rect: (x: number, y: number, w: number, h: number, color: number) => calls.push(["fill", x, y, w, h, color]),
    drawBankHeading: (name: string) => calls.push(["heading", name]),
  };
}

function printed(calls: DrawCall[]) {
  return calls
    .filter((call) => call[0] === "print")
    .map((call) => String(call[3]));
}

describe("Step interval overlay presentation", () => {
  beforeEach(() => {
    S.activeTrack = 0;
    S.trackActiveClip = [1];
    S.trackQueuedClip = [-1];
    S.trackWillRelaunch = [false];
    S.knobTouched = -1;
    S.seqArpStepInt = [[[0, 0, 0, 0, 0, 0, 0, 0], [-2, -1, 0, 1, 2, 12, -24, 24]]];
    S.tarpStepInt = [[5, 4, 3, 2, 1, 0, -1, -2]];
  });

  test("renders per-clip SEQ ARP step intervals", () => {
    S.knobTouched = 5;
    const calls: DrawCall[] = [];
    renderStepIntervalOverlay(createDeps(calls), 4);

    expect(calls[0]).toEqual(["heading", "SEQ ARP Steps"]);
    expect(printed(calls)).toEqual([
      "S1  ", "-2  ", "S2  ", "-1  ", "S3  ", " 0  ", "S4  ", "+1  ",
      "S5  ", "+2  ", "S6  ", "+12 ", "S7  ", "-24 ", "S8  ", "+24 ",
    ]);
    expect(calls).toContainEqual(["fill", 34, 36, 24, 24, 1]);
    expect(calls).toContainEqual(["print", 34, 36, "S6  ", 0]);
    expect(calls).toContainEqual(["print", 34, 48, "+12 ", 0]);
  });

  test("renders per-track ARP IN step intervals", () => {
    S.knobTouched = 0;
    const calls: DrawCall[] = [];
    renderStepIntervalOverlay(createDeps(calls), 5);

    expect(calls[0]).toEqual(["heading", "ARP IN Steps"]);
    expect(printed(calls)).toEqual([
      "S1  ", "+5  ", "S2  ", "+4  ", "S3  ", "+3  ", "S4  ", "+2  ",
      "S5  ", "+1  ", "S6  ", " 0  ", "S7  ", "-1  ", "S8  ", "-2  ",
    ]);
    expect(calls).toContainEqual(["fill", 4, 12, 24, 24, 1]);
  });
});
