import { beforeEach, describe, expect, test } from "vitest";
import { S } from "@overture-ui/core/ui_state.mjs";
import {
  renderSessionIdleView,
  renderDrumTrackIdleView,
  renderMelodicTrackIdleView,
  renderMotionIdleView,
  renderDrumPositionBar,
} from "@overture-ui/render/ui_idle_render.mjs";
import { renderMetroIndicator, renderTrackRow } from "@overture-ui/render/ui_track_chrome_render.mjs";

type DrawCall = [string, ...unknown[]];

function createDeps(calls: DrawCall[], values: Record<string, string | null> = {}) {
  const getCalls: string[] = [];
  return {
    pixelPrint: (x: number, y: number, text: string, color: number) => calls.push(["pixel", x, y, text, color]),
    print: (x: number, y: number, text: string, color: number) => calls.push(["print", x, y, text, color]),
    fill_rect: (x: number, y: number, w: number, h: number, color: number) => calls.push(["fill", x, y, w, h, color]),
    drawBankHeading: (name: string, showTrack?: boolean) => calls.push(["heading", name, showTrack]),
    drawBankHeadingInverted: (name: string, showTrack?: boolean) => calls.push(["headingInv", name, showTrack]),
    drawMetroIndicator: () => calls.push(["metro"]),
    drawPositionBar: (track: number) => calls.push(["positionBar", track]),
    host_module_get_param: (key: string) => {
      getCalls.push(key);
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
    getCalls,
  };
}

function printTexts(calls: DrawCall[]) {
  return calls
    .filter((call) => call[0] === "print")
    .map((call) => String(call[3]));
}

// Compact, one-line-per-call serialization of the full draw sequence — keeps
// the pixel-level pin (every fill/print, in order) reviewable in a diff.
function fmtSeq(calls: DrawCall[]) {
  return calls
    .map((c) => c[0] + " " + c.slice(1).map((v) => (typeof v === "string" ? `'${v}'` : String(v))).join(","))
    .join("\n");
}

describe("Idle presentation", () => {
  beforeEach(() => {
    S.activeTrack = 0;
    S.activeBank = 0;
    S.tickCount = 100;
    S.sessionView = false;
    S.trackPadMode = [0, 1, 0, 0, 0, 0, 0, 0];
    S.trackActiveClip = [1, 2, 0, 0, 0, 0, 0, 0];
    S.trackClipPlaying = [true, true, false, false, false, false, false, false];
    S.trackWillRelaunch = [false, false, false, false, false, false, false, false];
    S.trackQueuedClip = [-1, -1, -1, -1, -1, -1, -1, -1];
    S.metronomeOn = 0;
    S.trackVelOverride = [96, 0, 0, 0, 0, 0, 0, 0];
    S.trackMuted = [false, false, false, false, false, false, false, false];
    S.trackSoloed = [false, false, false, false, false, false, false, false];
    S.clipNonEmpty = Array.from({ length: 8 }, () => new Array(16).fill(false));
    S.drumClipNonEmpty = Array.from({ length: 8 }, () => new Array(16).fill(false));
    S.clipNonEmpty[0][1] = true;
    S.drumClipNonEmpty[1][2] = true;
    S.clipLengthManuallySet = Array.from({ length: 8 }, () => new Array(16).fill(false));
    S.drumLaneLengthManuallySet = [false, false, false, false, false, false, false, false];
    S.bankParams = Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => new Array(8).fill(0))
    );
    S.recordArmed = false;
    S.playing = false;
    S.masterPos = 0;
    S.recordCountingIn = false;
    S.recordArmedTrack = -1;
    S.trackOctave = [1, 0, 0, 0, 0, 0, 0, 0];
    S.padKey = 0;
    S.padScale = 0;
    S.scaleAware = 1;
    S.activeDrumLane = [2, 0, 0, 0, 0, 0, 0, 0];
    S.drumLanePage = [1, 0, 0, 0, 0, 0, 0, 0];
    S.drumStepPage = [1, 0, 0, 0, 0, 0, 0, 0];
    S.drumCurrentStep = [22, 0, 0, 0, 0, 0, 0, 0];
    S.drumLaneLoopStart = [16, 0, 0, 0, 0, 0, 0, 0];
    S.drumLaneNote = Array.from({ length: 8 }, () => new Array(32).fill(36));
    S.drumLaneNote[0][2] = 48;
    S.drumLaneLength = [32, 16, 16, 16, 16, 16, 16, 16];
    S.drumLaneSteps = Array.from({ length: 8 }, () =>
      Array.from({ length: 32 }, () => "0".repeat(256))
    );
    S.drumLaneSteps[0][2] = `${"0".repeat(3)}1${"0".repeat(47)}1${"0".repeat(204)}`;
    S.drumLaneSolo = [0, 0, 0, 0, 0, 0, 0, 0];
    S.drumLaneMute = [0, 0, 0, 0, 0, 0, 0, 0];
    S.trackCurrentPage = [1, 0, 0, 0, 0, 0, 0, 0];
    S.ccActiveLane = [2, 0, 0, 0, 0, 0, 0, 0];
    S.clipLength = Array.from({ length: 8 }, () => new Array(16).fill(16));
    S.clipLength[0][1] = 20;
    S.clipTPS = Array.from({ length: 8 }, () => new Array(16).fill(24));
    S.ccLaneLength = Array.from({ length: 8 }, () =>
      Array.from({ length: 16 }, () => new Array(8).fill(0))
    );
    S.ccLaneLength[0][1][2] = 20;
    S.ccLaneTps = Array.from({ length: 8 }, () =>
      Array.from({ length: 16 }, () => new Array(8).fill(0))
    );
    S.ccLaneTps[0][1][2] = 12;
    S.ccLaneResTps = Array.from({ length: 8 }, () =>
      Array.from({ length: 16 }, () => new Array(8).fill(0))
    );
    S.ccLaneResTps[0][1][2] = 48;
    S.trackCCType = Array.from({ length: 8 }, () => new Array(8).fill(0));
    S.trackCCType[0][0] = 1;
    S.trackCCType[0][2] = 2;
    S.trackCCAssign = Array.from({ length: 8 }, () => [7, 74, 5, -1, 72, 91, 93, 10]);
    S.schLabel = Array.from({ length: 8 }, () => new Array(8).fill(null));
    S.schLabel[0][2] = "Cutoff";
    S.trackCCAutoBits = Array.from({ length: 8 }, () => new Array(16).fill(0));
    S.trackCCAutoBits[0][1] = 1 << 2;
    S.clipAtHas = Array.from({ length: 8 }, () => new Array(16).fill(false));
    S.clipAtHas[0][1] = true;
    S.clipCCVal = Array.from({ length: 8 }, () =>
      Array.from({ length: 16 }, () => new Array(8).fill(-1))
    );
    S.clipCCVal[0][1][2] = 90;
    S.trackCCLiveVal = Array.from({ length: 8 }, () => new Array(8).fill(-1));
    S.trackCCLiveVal[0][2] = 64;
    S.ccGraphOvData = [];
    S.ccGraphOvKey = "";
    S.heldStep = -1;
  });

  test("renders Session View idle banner, active clips, and track row", () => {
    S.playing = true;
    S.masterPos = 192;
    const calls: DrawCall[] = [];
    renderSessionIdleView(createDeps(calls));

    expect(calls[0]).toEqual(["fill", 0, 0, 128, 12, 1]);
    expect(calls).toContainEqual(["print", 40, 2, "overture", 0]);
    expect(calls).toContainEqual(["metro"]);
    expect(calls).toContainEqual(["print", 5, 34, "1", 1]);
    expect(calls).toContainEqual(["fill", 3, 32, 10, 1, 1]);
    expect(printTexts(calls)).toEqual(expect.arrayContaining(["B", "C"]));
    expect(calls).toContainEqual(["fill", 4, 45, 9, 9, 1]);
    expect(calls).toContainEqual(["fill", 20, 45, 9, 9, 1]);
  });

  test("renders melodic idle heading, arp/scale status, active clips, and position bar", () => {
    S.activeBank = 5;
    S.bankParams[0][5][0] = 1;
    S.bankParams[0][5][7] = 1;
    S.recordArmed = true;
    S.recordArmedTrack = 0;

    const calls: DrawCall[] = [];
    renderMelodicTrackIdleView(createDeps(calls));

    expect(calls[0]).toEqual(["headingInv", "ARP IN REC", false]);
    expect(printTexts(calls)).toEqual(expect.arrayContaining(["Oct:+1", "Arp", "C Major", "B", "C"]));
    expect(calls).toContainEqual(["fill", 51, 9, 19, 9, 1]);
    expect(calls).toContainEqual(["fill", 82, 15, 42, 1, 1]);
    expect(calls).toContainEqual(["metro"]);
    expect(calls).toContainEqual(["print", 5, 34, "1", 1]);
    expect(calls).toContainEqual(["fill", 3, 32, 10, 1, 1]);
    expect(calls).toContainEqual(["positionBar", 0]);
    expect(calls).toContainEqual(["fill", 4, 45, 9, 9, 1]);
    expect(calls).toContainEqual(["fill", 20, 45, 9, 9, 1]);
  });

  test("renders drum idle lane status, active clips, and drum position bar", () => {
    S.trackPadMode[0] = 1;
    S.activeBank = 6;
    S.drumLaneSolo[0] = 1 << 2;
    S.drumClipNonEmpty[0][1] = true;

    const calls: DrawCall[] = [];
    renderDrumTrackIdleView(createDeps(calls));

    expect(calls[0]).toEqual(["headingInv", "AUTO", false]);
    expect(printTexts(calls)).toEqual(expect.arrayContaining(["Bank: B  Pad: C2 (48)", "SOLOED", "B", "C"]));
    expect(calls).toContainEqual(["metro"]);
    expect(calls).toContainEqual(["print", 5, 34, "1", 1]);
    expect(calls).toContainEqual(["fill", 3, 32, 10, 1, 1]);
    expect(calls).toContainEqual(["fill", 4, 57, 59, 5, 1]);
    expect(calls).toContainEqual(["fill", 64, 61, 59, 1, 1]);
    expect(calls).toContainEqual(["fill", 2, 58, 1, 3, 1]);
    expect(calls).toContainEqual(["fill", 124, 58, 1, 3, 1]);
    expect(calls).toContainEqual(["fill", 4, 45, 9, 9, 1]);
    expect(calls).toContainEqual(["fill", 20, 45, 9, 9, 1]);
  });

  test("renders drum position bar pages, playhead, and extent markers", () => {
    S.playing = true;
    S.trackClipPlaying[0] = true;
    const calls: DrawCall[] = [];
    renderDrumPositionBar(createDeps(calls), 0);

    expect(calls).toContainEqual(["fill", 4, 57, 59, 5, 1]);
    expect(calls).toContainEqual(["fill", 64, 61, 59, 1, 1]);
    expect(calls).toContainEqual(["fill", 26, 57, 1, 5, 0]);
    expect(calls).toContainEqual(["fill", 2, 58, 1, 3, 1]);
    expect(calls).toContainEqual(["fill", 124, 58, 1, 3, 1]);
  });

  test("renders track row active, muted, and soloed states", () => {
    S.activeTrack = 2;
    S.trackMuted[1] = true;
    S.trackSoloed[3] = true;
    S.tickCount = 48;
    const calls: DrawCall[] = [];
    renderTrackRow(createDeps(calls), 34);

    expect(calls).toContainEqual(["print", 5, 34, "1", 1]);
    expect(calls).toContainEqual(["print", 21, 34, "2", 1]);
    expect(calls).toContainEqual(["print", 37, 34, "3", 1]);
    expect(calls).toContainEqual(["fill", 35, 32, 10, 1, 1]);
    expect(calls).toContainEqual(["fill", 51, 32, 10, 12, 1]);
    expect(calls).toContainEqual(["print", 53, 34, "4", 0]);
  });

  test("renders metro labels and Track View velocity/adaptive status", () => {
    S.metronomeOn = 1;
    S.activeTrack = 0;
    S.trackActiveClip[0] = 2;
    S.clipNonEmpty[0][2] = false;
    S.trackVelOverride[0] = 127;
    const calls: DrawCall[] = [];
    renderMetroIndicator(createDeps(calls));

    expect(calls).toContainEqual(["fill", 4, 22, 2, 2, 1]);
    expect(calls).toContainEqual(["print", 8, 21, "Count", 1]);
    expect(calls).toContainEqual(["fill", 40, 22, 2, 2, 1]);
    expect(calls).toContainEqual(["print", 67, 21, "127", 1]);
    expect(calls).toContainEqual(["print", 103, 21, "Adap", 1]);

    S.sessionView = true;
    S.metronomeOn = 2;
    const recCalls: DrawCall[] = [];
    renderMetroIndicator(createDeps(recCalls));
    expect(recCalls).toContainEqual(["print", 8, 21, "Rec", 1]);

    S.metronomeOn = 0;
    const offCalls: DrawCall[] = [];
    renderMetroIndicator(createDeps(offCalls));
    expect(offCalls).toEqual([]);
  });

  test("renders fixed status for manual melodic length and drum content", () => {
    S.activeTrack = 0;
    S.trackActiveClip[0] = 2;
    S.clipNonEmpty[0][2] = false;
    S.clipLengthManuallySet[0][2] = true;
    const melodicCalls: DrawCall[] = [];
    renderMetroIndicator(createDeps(melodicCalls));
    expect(melodicCalls).not.toContainEqual(["print", 103, 21, "Adap", 1]);
    expect(melodicCalls).toContainEqual(["print", 109, 21, "Fix", 1]);

    S.activeTrack = 1;
    S.trackPadMode[1] = 1;
    S.trackActiveClip[1] = 2;
    S.drumClipNonEmpty[1][2] = true;
    const drumCalls: DrawCall[] = [];
    renderMetroIndicator(createDeps(drumCalls));
    expect(drumCalls).toContainEqual(["print", 109, 21, "Fix", 1]);
  });

  test("suppresses Track View metro status in Session View", () => {
    S.sessionView = true;
    S.metronomeOn = 3;
    const calls: DrawCall[] = [];
    renderMetroIndicator(createDeps(calls));

    expect(calls).toContainEqual(["print", 8, 21, "Rec/Ply", 1]);
    expect(calls).not.toContainEqual(["print", 67, 21, "96  ", 1]);
    expect(calls).not.toContainEqual(["print", 103, 21, "Adap", 1]);
    expect(calls).not.toContainEqual(["print", 109, 21, "Fix", 1]);
  });

  test("renders AUTO idle lane info, badges, graph, and current page", () => {
    const calls: DrawCall[] = [];
    const deps = createDeps(calls, {
      t0_c1_ccsv_2_0: "0 8 16 24 32 40 48 56 64 72 80 88 96 104 112 120",
      t0_c1_ccsv_2_1: "127 96 64 32",
    });

    renderMotionIdleView(deps);

    expect(deps.getCalls).toEqual(["t0_c1_ccsv_2_0", "t0_c1_ccsv_2_1"]);
    expect(S.ccGraphOvKey).toBe("g_0_1_2");
    expect(S.ccGraphOvData).toEqual([
      0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 120, 127, 96, 64, 32,
    ]);
    expect(calls).toContainEqual(["headingInv", "AUTO", undefined]);
    expect(calls).toContainEqual(["print", 61, 1, "Sch", 0]);
    expect(calls).toContainEqual(["print", 101, 1, "CC", 0]);
    expect(calls).toContainEqual(["print", 4, 10, "K3 L3 Sch5:", 1]);
    expect(calls).toContainEqual(["print", 70, 10, "90", 1]);
    expect(calls).toContainEqual(["print", 91, 10, "Cutoff", 1]);
    expect(calls).toContainEqual(["print", 4, 21, "Res: 1/8", 1]);
    expect(calls).toContainEqual(["print", 64, 21, "Zoom: 1/32", 1]);
    expect(calls).toContainEqual(["fill", 0, 33, 128, 1, 1]);
    expect(calls).toContainEqual(["fill", 0, 56, 128, 1, 1]);
    expect(calls).toContainEqual(["fill", 64, 60, 59, 3, 1]);
  });

  test("reuses AUTO idle graph cache between poll intervals", () => {
    S.ccGraphOvKey = "g_0_1_2";
    S.ccGraphOvData = [0, 127, 64, 32];
    S.tickCount = 3;
    const calls: DrawCall[] = [];
    const deps = createDeps(calls, {
      t0_c1_ccsv_2_0: "127 127 127 127",
    });

    renderMotionIdleView(deps);

    expect(deps.getCalls).toEqual([]);
    expect(S.ccGraphOvData).toEqual([0, 127, 64, 32]);
    expect(calls).toContainEqual(["fill", 32, 35, 1, 20, 1]);
  });

  test("renders AUTO idle playing progress with lane zoom TPS", () => {
    S.playing = true;
    S.masterPos = 120;
    S.trackCurrentPage[0] = 0;
    const calls: DrawCall[] = [];
    const deps = createDeps(calls);

    renderMotionIdleView(deps);

    expect(deps.getCalls).toEqual(["t0_c1_ccsv_2_0", "t0_c1_ccsv_2_1"]);
    expect(calls).toContainEqual(["fill", 4, 60, 59, 3, 1]);
    expect(calls).toContainEqual(["fill", 64, 60, 59, 1, 1]);
    expect(calls).toContainEqual(["fill", 64, 62, 59, 1, 1]);
    expect(calls).toContainEqual(["fill", 63, 60, 1, 3, 1]);
  });

  // Full ordered draw-sequence pin for the shared CC-lane overlay extraction
  // (graph-data fetch loop, graph frame+line-plot, page-progress bar). Catches
  // an EXTRA / MISSING / REORDERED draw call the toContainEqual specs above
  // cannot. heldStep is set so the Idle view's conditional step marker
  // (heldStep>=0, color 0, full height) and the "g_"-prefixed graph key — the
  // variants kept at this call site — are both exercised; the playing
  // progress-dot variant is pinned by the toContainEqual specs above.
  test("full draw sequence: graph fetch + frame/plot + held-step marker + page bar", () => {
    S.heldStep = 5;
    const calls: DrawCall[] = [];
    const deps = createDeps(calls, {
      t0_c1_ccsv_2_0: "0 8 16 24 32 40 48 56 64 72 80 88 96 104 112 120",
      t0_c1_ccsv_2_1: "127 96 64 32",
    });

    renderMotionIdleView(deps);

    expect(fmtSeq(calls)).toMatchInlineSnapshot(`
      "headingInv 'AUTO',undefined
      fill 60,1,21,7,1
      print 61,1,'Sch',0
      fill 83,1,15,7,1
      print 84,1,'AT',0
      fill 100,1,15,7,1
      print 101,1,'CC',0
      print 4,10,'K3 L3 Sch5:',1
      print 70,10,'90',1
      fill 70,19,12,1,1
      print 91,10,'Cutoff',1
      print 4,21,'Res: 1/8',1
      print 64,21,'Zoom: 1/32',1
      fill 0,33,128,1,1
      fill 0,56,128,1,1
      fill 0,33,1,24,1
      fill 127,33,1,24,1
      fill 1,54,1,1,1
      fill 2,54,1,1,1
      fill 3,54,1,1,1
      fill 4,54,1,1,1
      fill 5,54,1,1,1
      fill 6,54,1,1,1
      fill 7,53,1,2,1
      fill 8,53,1,1,1
      fill 9,53,1,1,1
      fill 10,53,1,1,1
      fill 11,53,1,1,1
      fill 12,53,1,1,1
      fill 13,52,1,2,1
      fill 14,52,1,1,1
      fill 15,52,1,1,1
      fill 16,52,1,1,1
      fill 17,52,1,1,1
      fill 18,52,1,1,1
      fill 19,52,1,1,1
      fill 20,50,1,3,1
      fill 21,50,1,1,1
      fill 22,50,1,1,1
      fill 23,50,1,1,1
      fill 24,50,1,1,1
      fill 25,50,1,1,1
      fill 26,49,1,2,1
      fill 27,49,1,1,1
      fill 28,49,1,1,1
      fill 29,49,1,1,1
      fill 30,49,1,1,1
      fill 31,49,1,1,1
      fill 32,48,1,2,1
      fill 33,48,1,1,1
      fill 34,48,1,1,1
      fill 35,48,1,1,1
      fill 36,48,1,1,1
      fill 37,48,1,1,1
      fill 38,48,1,1,1
      fill 39,47,1,2,1
      fill 40,47,1,1,1
      fill 41,47,1,1,1
      fill 42,47,1,1,1
      fill 43,47,1,1,1
      fill 44,47,1,1,1
      fill 45,46,1,2,1
      fill 46,46,1,1,1
      fill 47,46,1,1,1
      fill 48,46,1,1,1
      fill 49,46,1,1,1
      fill 50,46,1,1,1
      fill 51,46,1,1,1
      fill 52,44,1,3,1
      fill 53,44,1,1,1
      fill 54,44,1,1,1
      fill 55,44,1,1,1
      fill 56,44,1,1,1
      fill 57,44,1,1,1
      fill 58,43,1,2,1
      fill 59,43,1,1,1
      fill 60,43,1,1,1
      fill 61,43,1,1,1
      fill 62,43,1,1,1
      fill 63,43,1,1,1
      fill 64,42,1,2,1
      fill 65,42,1,1,1
      fill 66,42,1,1,1
      fill 67,42,1,1,1
      fill 68,42,1,1,1
      fill 69,42,1,1,1
      fill 70,42,1,1,1
      fill 71,41,1,2,1
      fill 72,41,1,1,1
      fill 73,41,1,1,1
      fill 74,41,1,1,1
      fill 75,41,1,1,1
      fill 76,41,1,1,1
      fill 77,40,1,2,1
      fill 78,40,1,1,1
      fill 79,40,1,1,1
      fill 80,40,1,1,1
      fill 81,40,1,1,1
      fill 82,40,1,1,1
      fill 83,40,1,1,1
      fill 84,38,1,3,1
      fill 85,38,1,1,1
      fill 86,38,1,1,1
      fill 87,38,1,1,1
      fill 88,38,1,1,1
      fill 89,38,1,1,1
      fill 90,37,1,2,1
      fill 91,37,1,1,1
      fill 92,37,1,1,1
      fill 93,37,1,1,1
      fill 94,37,1,1,1
      fill 95,37,1,1,1
      fill 96,36,1,2,1
      fill 97,36,1,1,1
      fill 98,36,1,1,1
      fill 99,36,1,1,1
      fill 100,36,1,1,1
      fill 101,36,1,1,1
      fill 102,36,1,1,1
      fill 103,35,1,2,1
      fill 104,35,1,1,1
      fill 105,35,1,1,1
      fill 106,35,1,1,1
      fill 107,35,1,1,1
      fill 108,35,1,1,1
      fill 109,35,1,6,1
      fill 110,40,1,1,1
      fill 111,40,1,1,1
      fill 112,40,1,1,1
      fill 113,40,1,1,1
      fill 114,40,1,1,1
      fill 115,40,1,1,1
      fill 116,40,1,5,1
      fill 117,44,1,1,1
      fill 118,44,1,1,1
      fill 119,44,1,1,1
      fill 120,44,1,1,1
      fill 121,44,1,1,1
      fill 122,44,1,6,1
      fill 123,49,1,1,1
      fill 124,49,1,1,1
      fill 125,49,1,1,1
      fill 126,49,1,1,1
      fill 32,33,1,24,0
      fill 4,62,59,1,1
      fill 64,60,59,3,1"
    `);
  });
});
