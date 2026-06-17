import { beforeEach, describe, expect, test } from "vitest";
import { S } from "@overture-ui/core/ui_state.mjs";
import { renderCcStepEditView } from "@overture-ui/render/ui_cc_step_edit_render.mjs";

type DrawCall = [string, ...unknown[]];

function createDeps(calls: DrawCall[], values: Record<string, string | null> = {}) {
  const getCalls: string[] = [];
  return {
    deps: {
      print: (x: number, y: number, text: string, color: number) => calls.push(["print", x, y, text, color]),
      pixelPrint: (x: number, y: number, text: string, color: number) => calls.push(["pixel", x, y, text, color]),
      fill_rect: (x: number, y: number, w: number, h: number, color: number) => calls.push(["fill", x, y, w, h, color]),
      host_module_get_param: (key: string) => {
        getCalls.push(key);
        return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
      },
    },
    getCalls,
  };
}

function printedTexts(calls: DrawCall[]) {
  return calls
    .filter((call) => call[0] === "print" || call[0] === "pixel")
    .map((call) => String(call[3]));
}

describe("CC step edit presentation", () => {
  beforeEach(() => {
    S.activeTrack = 0;
    S.trackActiveClip = [1];
    S.trackQueuedClip = [-1];
    S.trackWillRelaunch = [false];
    S.heldStep = 3;
    S.tickCount = 1;
    S.knobTouched = -1;
    S.playing = false;
    S.masterPos = 0;
    S.trackCurrentPage = [1];
    S.clipLength = [[16, 20]];
    S.clipTPS = [[24, 24]];
    S.ccActiveLane = [2];
    S.ccLaneLength = [[[0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 20, 0, 0, 0, 0, 0]]];
    S.ccLaneTps = [[[0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 12, 0, 0, 0, 0, 0]]];
    S.trackCCType = [[1, 0, 2, 0, 0, 0, 0, 0]];
    S.trackCCAssign = [[7, 74, 5, -1, 72, 91, 93, 10]];
    S.schLabel = [[null, null, "Cutoff", null, null, null, null, null]];
    S.ccStepEditSet = [false, false, true, false, false, false, false, false];
    S.ccStepEditVal = [0, 0, 100, 0, 0, 0, 0, 0];
    S.ccStepEditComputed = [64, -1, 99, -1, 127, 0, 32, -1];
    S.ccGraphOvData = [];
    S.ccGraphOvKey = "";
  });

  test("renders graph, scheduler header, knob cells, and current page", () => {
    const calls: DrawCall[] = [];
    const { deps, getCalls } = createDeps(calls, {
      t0_c1_ccsv_2_0: "0 8 16 24 32 40 48 56 64 72 80 88 96 104 112 120",
      t0_c1_ccsv_2_1: "127 96 64 32",
    });

    renderCcStepEditView(deps);

    expect(getCalls).toEqual(["t0_c1_ccsv_2_0", "t0_c1_ccsv_2_1"]);
    expect(S.ccGraphOvKey).toBe("sg_0_1_2");
    expect(S.ccGraphOvData).toEqual([
      0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 120, 127, 96, 64, 32,
    ]);
    expect(printedTexts(calls)).toEqual(expect.arrayContaining([
      "Step 4",
      "Cutoff",
      "AT  ", "(64) ",
      "CC74", "--   ",
      "Sch5", "100  ",
      "--  ", "--   ",
      "CC10", "--   ",
    ]));
    expect(calls).toContainEqual(["fill", 0, 46, 128, 1, 1]);
    expect(calls).toContainEqual(["fill", 0, 57, 128, 1, 1]);
    expect(calls).toContainEqual(["fill", 19, 47, 1, 10, 1]);
    expect(calls).toContainEqual(["fill", 65, 10, 29, 18, 1]);
    expect(calls).toContainEqual(["fill", 64, 60, 59, 3, 1]);
  });

  test("reuses cached graph data between poll intervals", () => {
    S.ccGraphOvKey = "sg_0_1_2";
    S.ccGraphOvData = [0, 127, 64, 32];
    S.tickCount = 3;
    const calls: DrawCall[] = [];
    const { deps, getCalls } = createDeps(calls, {
      t0_c1_ccsv_2_0: "127 127 127 127",
    });

    renderCcStepEditView(deps);

    expect(getCalls).toEqual([]);
    expect(S.ccGraphOvData).toEqual([0, 127, 64, 32]);
    expect(calls).toContainEqual(["fill", 95, 47, 1, 10, 1]);
  });

  test("renders an empty graph fallback when DSP graph pages are missing", () => {
    S.heldStep = 4;
    S.ccLaneLength[0][1][2] = 8;
    const calls: DrawCall[] = [];
    const { deps, getCalls } = createDeps(calls);

    renderCcStepEditView(deps);

    expect(getCalls).toEqual(["t0_c1_ccsv_2_0"]);
    expect(S.ccGraphOvData).toEqual([]);
    expect(calls).toContainEqual(["fill", 126, 47, 1, 10, 1]);
    expect(printedTexts(calls)).toEqual(expect.arrayContaining(["Step 5", "Cutoff"]));
  });
});
