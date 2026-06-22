import { beforeEach, describe, expect, test } from "vitest";
import { S } from "@overture-ui/core/ui_state.mjs";
import {
  renderAllLanesBankOverview,
  renderAllLanesConfirm,
  renderDrumLaneBankOverview,
  renderDrumMidiDelayBankOverview,
  renderDrumNoteFxBankOverview,
  renderDrumRepeatGrooveBankOverview,
  renderGenericParameterPageOverview,
  renderMelodicNoteFxBankOverview,
  renderMotionBankOverview,
  renderTrackBankOverview,
} from "@overture-ui/render/ui_parameter_page_render.mjs";

type DrawCall = [string, ...unknown[]];

function createDeps(calls: DrawCall[]) {
  return {
    print: (x: number, y: number, text: string, color: number) => calls.push(["print", x, y, text, color]),
    fill_rect: (x: number, y: number, w: number, h: number, color: number) => calls.push(["fill", x, y, w, h, color]),
    drawBankHeading: (name: string) => calls.push(["heading", name]),
    drawBankHeadingInverted: (name: string) => calls.push(["headingInv", name]),
    drawAltArrow: (x: number, hdrBgWhite: boolean, on: boolean) => calls.push(["arrow", x, hdrBgWhite, on]),
    altIndicatorActive: () => true,
    bankHasAltParams: () => true,
    midiNoteName: (n: number) => `N${n}`,
  };
}

function printed(calls: DrawCall[]) {
  return calls
    .filter((call) => call[0] === "print" || call[0] === "heading" || call[0] === "headingInv")
    .map((call) => String(call[1] === 4 || call[1] === 106 || typeof call[1] === "number" ? call[3] : call[1]));
}

describe("Parameter Page render presentation", () => {
  beforeEach(() => {
    S.activeTrack = 0;
    S.activeBank = 0;
    S.trackActiveClip = [1];
    S.activeDrumLane = [2];
    S.drumLaneLength = [12];
    S.drumLaneTPS = [48];
    S.drumLaneEuclidN = [[0, 0, 20]];
    S.drumLanePlaybackDir = [[0, 0, 3]];
    S.drumLanePlaybackAudioReverse = [[0, 0, 1]];
    S.drumLaneNote = [[36, 37, 48]];
    S.drumLaneLenMode = [[0, 0, 5]];
    S.clipSeqFollow = [[false, true]];
    S.trackVelOverride = [96];
    S.drumInpQuant = [3];
    S.tickCount = 48;
    S.knobTouched = -1;
    S.altMode = false;
    S.sessionView = false;
    S.trackPadMode = [0];
    S.trackCCType = [[1, 0, 2, 0, 0, 0, 0, 0]];
    S.trackCCAssign = [[7, 74, 5, -1, 72, 91, 93, 10]];
    S.trackCCAutoBits = [[0, 0b00000101]];
    S.clipAtHas = [[false, true]];
    S.clipCCVal = [[
      [-1, -1, -1, -1, -1, -1, -1, -1],
      [10, 64, 99, -1, -1, -1, -1, -1],
    ]];
    S.trackCCLiveVal = [[-1, -1, -1, -1, -1, -1, -1, -1]];
    S.ccActiveLane = [1];
    S.schLabel = [[null, null, "Cutoff", null, null, null, null, null]];
    S.playing = false;
    S.bankParams = Array.from({ length: 1 }, () =>
      Array.from({ length: 8 }, () => new Array(8).fill(0))
    );
    S.bankParams[0][0] = [0, -1, 5, 0, 0, 0, 0, 0];
    S.bankParams[0][1] = [87, -4, 55, 0, 0, 0, 0, 0];
    S.bankParams[0][3] = [2, 1, -3, 4, 5, -6, 1, 0];
    S.bankParams[0][4] = [1, 2, 3, 100, 1, 0, 1, 0];
    S.bankParams[0][7] = [2, 1, -2, 75, 0, 0, 1, 1];
    S.noteFXRandomMode = [2];
    S.midiDlyRandomMode = [1];
    S.delayClockFb = [-6];
    S.clipPlaybackAudioReverse = [[1, 1]];
    S.drumRepeatGate = [[0, 0, 0b00000101]];
    S.drumRepeatGateLen = [[0, 0, 4]];
    S.drumRepeatVelScale = [[[], [], [80, 90, 100, 110, 120, 130, 140, 150]]];
    S.drumRepeatNudge = [[[], [], [-2, 0, 3, 4, 5, 6, 7, 8]]];
    S.allLanesConfirmed = true;
  });

  test("renders DRUM LANE overview labels and lane-level values", () => {
    const calls: DrawCall[] = [];
    renderDrumLaneBankOverview(createDeps(calls));

    expect(calls[0]).toEqual(["heading", "DRUM LANE"]);
    expect(printed(calls)).toEqual(expect.arrayContaining([
      "Res ", "1/8 ", "Stch", "/2  ", "Shft", "+5  ", "Lgto", "->  ",
      "Eucl", "12  ", "Dir ", "PPb ", "SqFl", "ON  ",
    ]));
  });

  test("renders ALL LANES confirmation and overview presentation", () => {
    const confirmCalls: DrawCall[] = [];
    renderAllLanesConfirm(createDeps(confirmCalls));
    expect(printed(confirmCalls)).toEqual(expect.arrayContaining([
      "ALL LANES", "Tr1", "Edits will affect", "all lanes.", "OK",
    ]));

    const overviewCalls: DrawCall[] = [];
    renderAllLanesBankOverview(createDeps(overviewCalls));
    expect(overviewCalls).toContainEqual(["arrow", 98, true, true]);
    expect(printed(overviewCalls)).toEqual(expect.arrayContaining([
      "ALL LANES", "Tr1", "Res ", "1/8 ", "Qnt ", "75% ", "VelIn", "96  ",
      "InQ ", "1/16", "Dir ", "Bwd ", "SyncRpt", "ON  ",
    ]));
  });

  test("renders drum NOTE FX, REPEAT GROOVE, and MIDI DLY overview cells", () => {
    const noteCalls: DrawCall[] = [];
    renderDrumNoteFxBankOverview(createDeps(noteCalls));
    expect(noteCalls[0]).toEqual(["heading", "NOTE FX"]);
    expect(printed(noteCalls)).toEqual(expect.arrayContaining([
      "Oct", "Note", "N48 48", "Vel ", "-4  ", "Qnt ", "55% ", "Len>", "2   ", ">Gate", "87% ",
    ]));

    S.activeBank = 5;
    S.altMode = true;
    const grooveCalls: DrawCall[] = [];
    renderDrumRepeatGrooveBankOverview(createDeps(grooveCalls));
    expect(grooveCalls).toContainEqual(["arrow", 98, false, true]);
    expect(printed(grooveCalls)).toEqual(expect.arrayContaining([
      "REPEAT GROOVE", "-2% ", " 0% ", "+3% ", "+4% ",
    ]));

    S.activeBank = 3;
    S.altMode = false;
    const dlyCalls: DrawCall[] = [];
    renderDrumMidiDelayBankOverview(createDeps(dlyCalls));
    expect(dlyCalls[0]).toEqual(["heading", "DELAY"]);
    expect(printed(dlyCalls)).toEqual(expect.arrayContaining([
      "Gate", "1/8T", "Clk ", "-6  ", "Retr", "ON  ",
    ]));
  });

  test("renders melodic AUTO overview from motion presentation model", () => {
    S.activeBank = 6;
    S.knobTouched = 2;
    const calls: DrawCall[] = [];
    renderMotionBankOverview(createDeps(calls));

    expect(calls[0]).toEqual(["headingInv", "AUTO"]);
    expect(printed(calls)).toEqual(expect.arrayContaining([
      "Sch", "AT", "CC", "AT  ", "10  ", "CC74", "64  ", "Sch5", "99  ", "--  ", "--  ", "Cutoff",
    ]));

    S.altMode = true;
    S.knobTouched = -1;
    const assignCalls: DrawCall[] = [];
    renderMotionBankOverview(createDeps(assignCalls));
    expect(assignCalls).toContainEqual(["headingInv", "ASSIGN"]);
    expect(assignCalls).toContainEqual(["fill", 4, 12, 24, 12, 1]);
  });

  test("renders melodic NOTE FX special-case cells", () => {
    S.activeBank = 1;
    S.trackPadMode[0] = 0;
    S.altMode = true;
    S.knobTouched = 7;
    const calls: DrawCall[] = [];
    renderMelodicNoteFxBankOverview(createDeps(calls));

    expect(calls[0]).toEqual(["heading", "NOTE FX"]);
    expect(calls).toContainEqual(["arrow", 98, true, true]);
    expect(printed(calls)).toEqual(expect.arrayContaining([
      "Oct ", "+87 ", "Len>", "--  ", ">Gate", "0%  ", "Algo", "Walk",
    ]));
    expect(printed(calls)).not.toContain("Rnd ");
  });

  test("renders generic bank overview alt labels and untruncated arp rates", () => {
    S.activeBank = 0;
    S.altMode = true;
    S.knobTouched = 6;
    const clipCalls: DrawCall[] = [];
    renderGenericParameterPageOverview(createDeps(clipCalls), 0);

    expect(clipCalls[0]).toEqual(["heading", "CLIP"]);
    expect(printed(clipCalls)).toEqual(expect.arrayContaining([
      "Zoom", "1/32", "Nudg", "+5  ", "Rvrs", "Audi",
    ]));

    S.activeBank = 4;
    S.altMode = false;
    S.knobTouched = 1;
    const arpCalls: DrawCall[] = [];
    renderGenericParameterPageOverview(createDeps(arpCalls), 4);
    expect(printed(arpCalls)).toEqual(expect.arrayContaining([
      "SEQUENCE ARP", "Rate", "1/16t",
    ]));
  });

  test("dispatches Track View bank overview presentation by track and bank state", () => {
    S.trackPadMode[0] = 1;
    S.activeBank = 7;
    S.allLanesConfirmed = false;
    const confirmCalls: DrawCall[] = [];
    renderTrackBankOverview(createDeps(confirmCalls), 7);
    expect(printed(confirmCalls)).toEqual(expect.arrayContaining(["ALL LANES", "Edits will affect", "OK"]));

    S.allLanesConfirmed = true;
    const allCalls: DrawCall[] = [];
    renderTrackBankOverview(createDeps(allCalls), 7);
    expect(printed(allCalls)).toEqual(expect.arrayContaining(["ALL LANES", "SyncRpt", "ON  "]));

    S.activeBank = 5;
    const grooveCalls: DrawCall[] = [];
    renderTrackBankOverview(createDeps(grooveCalls), 5);
    expect(printed(grooveCalls)).toEqual(expect.arrayContaining(["REPEAT GROOVE", "80% ", "90% "]));

    S.trackPadMode[0] = 0;
    S.activeBank = 1;
    const melodicCalls: DrawCall[] = [];
    renderTrackBankOverview(createDeps(melodicCalls), 1);
    expect(melodicCalls[0]).toEqual(["heading", "NOTE FX"]);
    expect(printed(melodicCalls)).toEqual(expect.arrayContaining(["Oct ", "+87 ", ">Gate"]));
  });
});
