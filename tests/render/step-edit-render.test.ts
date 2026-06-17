import { beforeEach, describe, expect, test } from "vitest";
import { S } from "@overture-ui/core/ui_state.mjs";
import { PAD_MODE_DRUM } from "@overture-ui/core/ui_constants.mjs";
import { renderTrackStepEditView } from "@overture-ui/render/ui_step_edit_render.mjs";

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

describe("Step edit presentation", () => {
  beforeEach(() => {
    S.activeTrack = 0;
    S.trackPadMode = [0];
    S.trackActiveClip = [1];
    S.trackQueuedClip = [-1];
    S.trackWillRelaunch = [false];
    S.knobTouched = -1;
    S.heldStep = 4;
    S.heldStepNotes = [60];
    S.stepWasEmpty = false;
    S.stepEditGate = 36;
    S.stepEditVel = 91;
    S.stepEditNudge = -3;
    S.stepEditIter = (4 << 4) | 2;
    S.stepEditRand = 35;
    S.stepEditRatch = 3;
    S.clipTPS = [[24, 12]];
    S.drumLaneTPS = [24];
  });

  test("renders drum step edit grid", () => {
    S.trackPadMode[0] = PAD_MODE_DRUM;
    S.knobTouched = 2;
    const calls: DrawCall[] = [];

    expect(renderTrackStepEditView(createDeps(calls))).toBe(true);

    expect(printedTexts(calls)).toEqual([
      "STEP EDIT",
      "Leng", "1.50",
      "Vel", "91",
      "Nudg", "-3",
      "Iter", "2/4",
      "Prob", "35%",
      "Ratch", "x3",
    ]);
    expect(calls).toContainEqual(["fill", 0, 9, 128, 1, 1]);
    expect(calls).toContainEqual(["fill", 64, 10, 31, 22, 1]);
    expect(calls).toContainEqual(["print", 65, 13, "Nudg", 0]);
  });

  test("renders melodic step edit grid with merged octave and note cell", () => {
    S.heldStepNotes = [61, 64, 68];
    S.knobTouched = 1;
    const calls: DrawCall[] = [];

    expect(renderTrackStepEditView(createDeps(calls))).toBe(true);

    expect(printedTexts(calls)).toEqual([
      "STEP EDIT",
      "Oct",
      "Note",
      "C#4+2",
      "Leng", "3",
      "Vel", "91",
      "Nudg", "-3",
      "Iter", "2/4",
      "Prob", "35%",
      "Ratch", "x3",
    ]);
    expect(calls).toContainEqual(["fill", 0, 10, 63, 22, 1]);
    expect(calls).toContainEqual(["fill", 0, 20, 63, 1, 0]);
    expect(calls).toContainEqual(["print", 16, 23, "C#4+2", 0]);
  });

  test("renders held empty steps as empty", () => {
    S.heldStepNotes = [];
    S.stepWasEmpty = true;
    const calls: DrawCall[] = [];

    expect(renderTrackStepEditView(createDeps(calls))).toBe(true);

    expect(printedTexts(calls)).toEqual(["STEP EDIT", "(empty)"]);
  });

  test("falls through while non-empty melodic notes are still loading", () => {
    S.heldStepNotes = [];
    S.stepWasEmpty = false;
    const calls: DrawCall[] = [];

    expect(renderTrackStepEditView(createDeps(calls))).toBe(false);
    expect(printedTexts(calls)).toEqual(["STEP EDIT"]);
  });
});
