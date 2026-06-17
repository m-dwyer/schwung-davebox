import { beforeEach, describe, expect, test } from "vitest";
import { S } from "@overture-ui/core/ui_state.mjs";
import {
  renderSessionActionPopup,
  renderTrackActionPopup,
} from "@overture-ui/render/ui_popup_render.mjs";

type DrawCall = [string, ...unknown[]];

function createDeps(calls: DrawCall[]) {
  return {
    print: (x: number, y: number, text: string, color: number) => calls.push(["print", x, y, text, color]),
    fill_rect: (x: number, y: number, w: number, h: number, color: number) => calls.push(["fill", x, y, w, h, color]),
  };
}

describe("Action popup presentation", () => {
  beforeEach(() => {
    S.actionPopupLines = [];
    S.actionPopupHighlight = -1;
  });

  test("renders Session View popup vertical layouts by line count", () => {
    const one: DrawCall[] = [];
    S.actionPopupLines = ["ONE"];
    renderSessionActionPopup(createDeps(one));
    expect(one).toEqual([["print", 4, 28, "ONE", 1]]);

    const two: DrawCall[] = [];
    S.actionPopupLines = ["ONE", "TWO"];
    renderSessionActionPopup(createDeps(two));
    expect(two).toEqual([
      ["print", 4, 22, "ONE", 1],
      ["print", 4, 34, "TWO", 1],
    ]);

    const three: DrawCall[] = [];
    S.actionPopupLines = ["ONE", "TWO", "THREE"];
    renderSessionActionPopup(createDeps(three));
    expect(three).toEqual([
      ["print", 4, 17, "ONE", 1],
      ["print", 4, 29, "TWO", 1],
      ["print", 4, 41, "THREE", 1],
    ]);

    const four: DrawCall[] = [];
    S.actionPopupLines = ["ONE", "TWO", "THREE", "FOUR", "IGNORED"];
    renderSessionActionPopup(createDeps(four));
    expect(four).toEqual([
      ["print", 4, 14, "ONE", 1],
      ["print", 4, 25, "TWO", 1],
      ["print", 4, 36, "THREE", 1],
      ["print", 4, 47, "FOUR", 1],
    ]);
  });

  test("renders Track View popup basic one- and two-line layouts", () => {
    const one: DrawCall[] = [];
    S.actionPopupLines = ["DONE"];
    renderTrackActionPopup(createDeps(one));
    expect(one).toEqual([["print", 4, 28, "DONE", 1]]);

    const two: DrawCall[] = [];
    S.actionPopupLines = ["CLIP", "CLEARED"];
    renderTrackActionPopup(createDeps(two));
    expect(two).toEqual([
      ["print", 4, 22, "CLIP", 1],
      ["print", 4, 34, "CLEARED", 1],
    ]);
  });

  test("renders Track View highlighted multi-line popup", () => {
    S.actionPopupLines = ["EXPORT", "AUDIO", "MIDI", "CANCEL"];
    S.actionPopupHighlight = 2;
    const calls: DrawCall[] = [];
    renderTrackActionPopup(createDeps(calls));

    expect(calls).toEqual([
      ["print", 46, 4, "EXPORT", 1],
      ["fill", 46, 13, 36, 1, 1],
      ["print", 49, 26, "AUDIO", 1],
      ["fill", 0, 39, 128, 13, 1],
      ["print", 52, 40, "MIDI", 0],
      ["print", 46, 54, "CANCEL", 1],
    ]);
  });
});
