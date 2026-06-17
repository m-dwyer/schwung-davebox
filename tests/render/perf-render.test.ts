import { beforeEach, describe, expect, test } from "vitest";
import { S } from "@overture-ui/core/ui_state.mjs";
import { renderPerfModeOled } from "@overture-ui/render/ui_perf_render.mjs";

type DrawCall = [string, ...unknown[]];

function createDeps(calls: DrawCall[]) {
  return {
    clear_screen: () => calls.push(["clear"]),
    print: (x: number, y: number, text: string, color: number) => calls.push(["print", x, y, text, color]),
    pixelPrint: (x: number, y: number, text: string, color: number) => calls.push(["pixel", x, y, text, color]),
    fill_rect: (x: number, y: number, w: number, h: number, color: number) => calls.push(["fill", x, y, w, h, color]),
  };
}

describe("Performance OLED presentation", () => {
  beforeEach(() => {
    S.tickCount = 100;
    S.perfRecalledSlot = -1;
    S.actionPopupEndTick = -1;
    S.actionPopupLines = [];
    S.perfModPopupEndTick = -1;
    S.perfModPopupName = "";
    S.perfModsToggled = 0;
    S.perfModsHeld = 0;
    S.perfHoldPadHeld = false;
    S.perfStickyLengths = new Set();
    S.perfSync = true;
    S.perfLatchMode = true;
    S.perfStack = [];
  });

  test("renders empty performance state with title and footer chips", () => {
    const calls: DrawCall[] = [];
    renderPerfModeOled(createDeps(calls));

    expect(calls[0]).toEqual(["clear"]);
    expect(calls).toContainEqual(["fill", 0, 0, 128, 12, 1]);
    expect(calls).toContainEqual(["print", 4, 3, "PERFORMANCE", 0]);
    expect(calls).toContainEqual(["pixel", 4, 24, "no mods active", 1]);
    expect(calls).toContainEqual(["pixel", 4, 34, "tap pad to engage", 1]);
    expect(calls).toContainEqual(["pixel", 4, 55, "Hold", 1]);
    expect(calls).toContainEqual(["pixel", 34, 55, "Sync", 0]);
    expect(calls).toContainEqual(["pixel", 64, 55, "Latch", 0]);
  });

  test("renders recalled preset title, action popup, active hold chip, and rate badge", () => {
    S.perfRecalledSlot = 2;
    S.actionPopupEndTick = 120;
    S.actionPopupLines = ["ONE", "TWO", "THREE", "FOUR"];
    S.perfHoldPadHeld = true;
    S.perfStack = [{ idx: 2, ticks: 48 }];
    const calls: DrawCall[] = [];
    renderPerfModeOled(createDeps(calls));

    expect(calls).toContainEqual(["print", 4, 3, "Heartbt", 0]);
    expect(calls).toContainEqual(["print", 4, 14, "ONE", 1]);
    expect(calls).toContainEqual(["print", 4, 47, "FOUR", 1]);
    expect(calls).toContainEqual(["pixel", 4, 55, "Hold", 0]);
    expect(calls).toContainEqual(["fill", 105, 53, 21, 9, 1]);
    expect(calls).toContainEqual(["pixel", 107, 55, "1/8", 0]);
  });

  test("renders centered mod popup before active mod list", () => {
    S.perfModPopupEndTick = 120;
    S.perfModPopupName = "Shuffle";
    S.perfModsToggled = (1 << 0) | (1 << 16);
    const calls: DrawCall[] = [];
    renderPerfModeOled(createDeps(calls));

    expect(calls).toContainEqual(["print", 43, 26, "Shuffle", 1]);
    expect(calls).not.toContainEqual(["pixel", 4, 16, "Oct+  Hftime", 1]);
  });

  test("renders wrapped ASCII mod names and expires stale mod popup", () => {
    S.perfModPopupEndTick = 50;
    S.perfModPopupName = "Old";
    S.perfModsToggled = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 16) | (1 << 20);
    const calls: DrawCall[] = [];
    renderPerfModeOled(createDeps(calls));

    expect(S.perfModPopupEndTick).toBe(-1);
    expect(calls).toContainEqual(["pixel", 4, 16, "Oct+  Oct-  Sc+", 1]);
    expect(calls).toContainEqual(["pixel", 4, 24, "Hftime  Gltch", 1]);
  });
});
