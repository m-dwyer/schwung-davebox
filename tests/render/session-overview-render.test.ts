import { beforeEach, describe, expect, test } from "vitest";
import { S } from "@overture-ui/core/ui_state.mjs";
import { renderSessionOverview } from "@overture-ui/render/ui_session_overview_render.mjs";

type DrawCall = [string, ...unknown[]];

function createDeps(calls: DrawCall[]) {
  return {
    fill_rect: (x: number, y: number, w: number, h: number, color: number) => calls.push(["fill", x, y, w, h, color]),
  };
}

describe("Session overview presentation", () => {
  beforeEach(() => {
    S.sceneRow = 4;
    S.flashEighth = true;
    S.trackActiveClip = [4, 5, 6, 0, 0, 0, 0, 0];
    S.trackClipPlaying = [true, false, false, false, false, false, false, false];
    S.clipNonEmpty = Array.from({ length: 8 }, () => new Array(16).fill(false));
    S.clipNonEmpty[0][4] = true;
    S.clipNonEmpty[1][5] = true;
    S.overviewCache = Array.from({ length: 8 }, () => new Array(16).fill(false));
    S.overviewCache[2][6] = true;
    S.overviewCache[3][1] = true;
  });

  test("renders selected scene band, grid lines, active clips, and cached clips", () => {
    const calls: DrawCall[] = [];
    renderSessionOverview(createDeps(calls));

    expect(calls[0]).toEqual(["fill", 0, 0, 128, 64, 1]);
    expect(calls[1]).toEqual(["fill", 0, 16, 128, 16, 0]);
    expect(calls).toContainEqual(["fill", 0, 16, 128, 1, 1]);
    expect(calls).toContainEqual(["fill", 0, 32, 128, 1, 0]);
    expect(calls).toContainEqual(["fill", 0, 0, 1, 16, 0]);
    expect(calls).toContainEqual(["fill", 0, 16, 1, 16, 1]);
    expect(calls).toContainEqual(["fill", 0, 32, 1, 32, 0]);
    expect(calls).toContainEqual(["fill", 2, 18, 13, 1, 1]);
    expect(calls).toContainEqual(["fill", 18, 22, 13, 1, 1]);
    expect(calls).toContainEqual(["fill", 39, 26, 2, 1, 1]);
    expect(calls).toContainEqual(["fill", 55, 6, 2, 1, 0]);
  });

  test("suppresses playing active clip center bar on blink-off frame", () => {
    S.flashEighth = false;
    const calls: DrawCall[] = [];
    renderSessionOverview(createDeps(calls));

    expect(calls).not.toContainEqual(["fill", 2, 18, 13, 1, 1]);
    expect(calls).toContainEqual(["fill", 18, 22, 13, 1, 1]);
  });
});
