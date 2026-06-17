import { describe, expect, test } from "vitest";
import {
  renderCompressLimitNotice,
  renderMergePlacementPrompt,
  renderNoNoteFlashNotice,
  renderSceneBakePickerPrompt,
  renderShiftStepHelp,
} from "@overture-ui/render/ui_prompt_render.mjs";

type DrawCall = [string, ...unknown[]];

function createDeps(calls: DrawCall[]) {
  return {
    clear_screen: () => calls.push(["clear"]),
    fill_rect: (x: number, y: number, w: number, h: number, color: number) => calls.push(["fill", x, y, w, h, color]),
    print: (x: number, y: number, text: string, color: number) => calls.push(["print", x, y, text, color]),
  };
}

describe("Static prompt presentation", () => {
  test("renders scene-bake picker prompt", () => {
    const calls: DrawCall[] = [];
    renderSceneBakePickerPrompt(createDeps(calls));

    expect(calls).toEqual([
      ["clear"],
      ["print", 4, 8, "BAKE SCENE", 1],
      ["print", 4, 22, "Tap row or scene step", 1],
      ["print", 4, 34, "to pick destination", 1],
      ["print", 4, 50, "Any other btn cancels", 1],
    ]);
  });

  test("renders merge-placement prompt", () => {
    const calls: DrawCall[] = [];
    renderMergePlacementPrompt(createDeps(calls));

    expect(calls).toEqual([
      ["clear"],
      ["print", 4, 8, "PLACE MERGED CLIPS", 1],
      ["print", 4, 22, "Tap row or scene step", 1],
      ["print", 4, 34, "to pick destination", 1],
      ["print", 4, 50, "Capture cancels", 1],
    ]);
  });

  test("renders Track View static notices", () => {
    const compress: DrawCall[] = [];
    renderCompressLimitNotice(createDeps(compress));
    expect(compress).toEqual([
      ["print", 4, 10, "[CLIP       ]", 1],
      ["print", 4, 22, "Beat Stretch", 1],
      ["print", 4, 34, "COMPRESS LIMIT", 1],
    ]);

    const noNote: DrawCall[] = [];
    renderNoNoteFlashNotice(createDeps(noNote));
    expect(noNote).toEqual([
      ["print", 4, 22, "NO NOTE", 1],
      ["print", 4, 34, "Play a pad first", 1],
    ]);
  });

  test("renders Shift step-help prompt", () => {
    const calls: DrawCall[] = [];
    renderShiftStepHelp(createDeps(calls));

    expect(calls).toEqual([
      ["fill", 0, 0, 128, 9, 1],
      ["print", 4, 1, "SHIFT SHORTCUTS", 0],
      ["print", 4, 12, "S2 Global  S3 Edit", 1],
      ["print", 4, 22, "S5 Tap     S6 Metro", 1],
      ["print", 4, 32, "S7 Swing   S9 Scale", 1],
      ["print", 4, 42, "S10 VelIn  S15 x2", 1],
      ["print", 4, 52, "S16 Quant  S8 Mode", 1],
    ]);
  });
});
