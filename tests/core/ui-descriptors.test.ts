import { describe, beforeEach, test, expect } from "vitest";
import { S } from "@overture-ui/core/ui_state.mjs";
import { describeEditSoundForTrack, matchingSchwungSlotMask, routeScopeShortLabel } from "@overture-ui/core/ui_routes.mjs";
import { routeCheckStatus, routeCheckViewModel } from "@overture-ui/core/ui_route_check.mjs";
import { advancePendingEditSoundEntry, requestEditSoundForTrack } from "@overture-ui/core/ui_sound_edit.mjs";
import { PARAM_PEEK_DETAIL_TICKS, autoLaneLabel, motionIdleModel, motionOverviewModel, paramPeekInfo } from "@overture-ui/core/ui_motion.mjs";

describe("UI descriptor seams", () => {
  beforeEach(() => {
    S.activeTrack = 0;
    S.activeBank = 6;
    S.bankParams = Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => new Array(8).fill(0))
    );
    S.playing = false;
    S.tickCount = 100;
    S.knobTouched = 1;
    S.knobTouchStartTick = 100;
    S.altMode = false;
    S.pendingEditSoundEntry = null;
    S._coRunChanSlots = 0;
    S.trackRoute[0] = 1;
    S.trackChannel[0] = 1;
    S.trackRoute[4] = 0;
    S.trackChannel[4] = 5;
    for (let t = 1; t < 8; t++) {
      S.trackRoute[t] = t < 4 ? 1 : 0;
      S.trackChannel[t] = t + 1;
    }
    S.trackPadMode[0] = 0;
    S.trackActiveClip[0] = 0;
    S.activeDrumLane[0] = 2;
    S.drumLaneNote[0][2] = 48;
    S.drumLaneQnt[0] = 37;
    S.drumLaneLenMode[0][2] = 5;
    S.trackQueuedClip[0] = -1;
    S.ccActiveLane[0] = 1;
    S.trackCCType[0] = [1, 0, 2, 0, 0, 0, 0, 0];
    S.trackCCAssign[0] = [7, 74, 5, -1, 72, 91, 93, 10];
    S.schLabel[0] = [null, null, "Cutoff", null, null, null, null, null];
    S.trackCCAutoBits[0][0] = 0b00000101;
    S.clipAtHas[0][0] = true;
    S.clipCCVal[0][0][1] = 64;
    S.clipCCVal[0][0][2] = 99;
    S.clipLength[0][0] = 16;
    S.clipTPS[0][0] = 24;
    S.ccLaneLength[0][0][1] = 0;
    S.ccLaneTps[0][0][1] = 0;
    S.ccLaneResTps[0][0][1] = 0;
    Reflect.set(globalThis, "shadow_get_slots", () => [
      { channel: 5, name: "Slot1" },
      { channel: 6, name: "Slot2" },
      { channel: 0, name: "Layer" },
    ]);
  });

  test("Schwung slot masks include exact-channel and All-channel slots", () => {
    expect(matchingSchwungSlotMask(5, [
      { channel: 5 },
      { channel: 6 },
      { channel: 0 },
      { channel: 5 },
    ])).toBe(0b1101);
  });

  test("Edit Sound descriptor preserves Move and Schwung preflight cases", () => {
    expect(describeEditSoundForTrack(0, { hasCoRun: true, hasMoveInject: true })).toMatchObject({
      title: "EDIT SOUND",
      body: "T1 Move Ch1",
      queue: { track: 0, route: 1, slot: -1 },
    });

    S.trackChannel[0] = 5;
    expect(describeEditSoundForTrack(0, { hasCoRun: true, hasMoveInject: true })).toMatchObject({
      title: "MOVE CH>4",
      body: "Ch5",
      queue: { track: 0, route: 1, slot: -1 },
    });

    expect(describeEditSoundForTrack(4, { hasCoRun: true, hasMoveInject: true })).toMatchObject({
      title: "EDIT SOUND",
      body: "T5 Schwung Slot1",
      queue: { track: 4, route: 0, slot: 0 },
      slotMask: 0b0101,
    });

    Reflect.set(globalThis, "shadow_get_slots", () => [{ channel: 6, name: "Slot2" }]);
    expect(describeEditSoundForTrack(4, { hasCoRun: true, hasMoveInject: true })).toMatchObject({
      title: "NO SLOT",
      body: "Ch5",
      queue: { track: 4, route: 0, slot: 0 },
    });
  });

  test("sound edit lifecycle queues, cancels, and advances pending handoff", () => {
    expect(requestEditSoundForTrack(0, { hasCoRun: true, hasMoveInject: true })).toEqual({
      title: "EDIT SOUND",
      body: "T1 Move Ch1",
    });
    expect(S.pendingEditSoundEntry).toMatchObject({ track: 0, route: 1, slot: -1 });
    expect(advancePendingEditSoundEntry(1)).toBeNull();
    expect(S.pendingEditSoundEntry).toBeNull();

    requestEditSoundForTrack(0, { hasCoRun: true, hasMoveInject: true });
    let action = null;
    for (let i = 0; i < 24; i++) action = advancePendingEditSoundEntry(0);
    expect(action).toEqual({ kind: "move", track: 0 });
    expect(S.pendingEditSoundEntry).toBeNull();

    requestEditSoundForTrack(4, { hasCoRun: true, hasMoveInject: true });
    action = null;
    for (let i = 0; i < 24; i++) action = advancePendingEditSoundEntry(4);
    expect(action).toEqual({ kind: "schwung", track: 4, slot: 0 });
    expect(S._coRunChanSlots).toBe(0b0101);
  });

  test("route labels distinguish Move, External, Schwung slot, and Schwung channel fallback", () => {
    expect(routeScopeShortLabel(0)).toBe("Move Ch1");
    S.trackRoute[0] = 2;
    expect(routeScopeShortLabel(0)).toBe("Ext Ch1");
    S.trackRoute[0] = 0;
    S.trackChannel[0] = 5;
    expect(routeScopeShortLabel(0)).toBe("Schw S1");
    Reflect.set(globalThis, "shadow_get_slots", () => [{ channel: 8, name: "Slot4" }]);
    expect(routeScopeShortLabel(0)).toBe("Schw Ch5");
  });

  test("route check view model preserves windowing and row labels", () => {
    expect(routeCheckViewModel(0, globalThis.shadow_get_slots())).toEqual({
      title: "ROUTE CHECK",
      range: "1-4/8",
      footer: "Jog scroll  Back/Menu",
      rows: [
        { track: 0, text: "T1 Move Ch1", status: "MANUAL", active: true },
        { track: 1, text: "T2 Move Ch2", status: "MANUAL", active: false },
        { track: 2, text: "T3 Move Ch3", status: "MANUAL", active: false },
        { track: 3, text: "T4 Move Ch4", status: "MANUAL", active: false },
      ],
    });

    expect(routeCheckViewModel(5, globalThis.shadow_get_slots())).toMatchObject({
      range: "5-8/8",
      rows: [
        { track: 4, text: "T5 Schw Ch5", status: "OK S1", active: false },
        { track: 5, text: "T6 Schw Ch6", status: "OK S2", active: true },
        { track: 6, text: "T7 Schw Ch7", status: "OK S3", active: false },
        { track: 7, text: "T8 Schw Ch8", status: "OK S3", active: false },
      ],
    });
  });

  test("route check statuses preserve no-slot, thru, and mismatch warnings", () => {
    expect(routeCheckStatus(4, [{ channel: 6 }])).toBe("NO SLOT");
    expect(routeCheckStatus(4, [{ channel: -2, name: "Thru" }])).toBe("THRU!");

    S.trackRoute[0] = 0;
    expect(routeCheckStatus(0, [])).toBe("ROUTE!");

    S.trackRoute[0] = 1;
    S.trackChannel[0] = 9;
    expect(routeCheckStatus(0, [])).toBe("CH9!");

    S.trackChannel[5] = 16;
    expect(routeCheckStatus(5, [{ channel: 16 }])).toBe("OK S1");
  });

  test("motion descriptors preserve AUTO labels and Param Peek text", () => {
    expect(autoLaneLabel(0, 0, false)).toBe("AT");
    expect(autoLaneLabel(0, 1, true)).toBe("L2 CC74");
    expect(autoLaneLabel(0, 2, false)).toBe("Sch5");
    expect(autoLaneLabel(0, 3, false)).toBe("--");

    expect(paramPeekInfo()).toMatchObject({
      header: "AUTO T1 Clip A",
      target: "Move target",
      value: "Value 64",
      detail: "Clip A, Lane 2",
      route: "Route: Move Ch1",
    });

    S.ccLaneLength[0][0][1] = 32;
    S.ccLaneTps[0][0][1] = 12;
    S.ccLaneResTps[0][0][1] = 24;
    S.tickCount = PARAM_PEEK_DETAIL_TICKS;
    S.knobTouchStartTick = 0;
    expect(paramPeekInfo()).toMatchObject({
      header: "Move target",
      target: "Lane 2 / Clip A",
      value: "Route: Move Ch1",
      detail: "Loop 32 steps",
      route: "Res 1/16 Zoom 1/32",
    });
  });

  test("Param Peek describes drum NOTE FX controls from drum lane state", () => {
    S.trackPadMode[0] = 1;
    S.activeBank = 1;
    S.knobTouched = 0;
    S.bankParams[0][1][0] = 109;
    S.bankParams[0][1][1] = -7;

    expect(paramPeekInfo()).toMatchObject({
      header: "NOTE FX T1 Drum",
      target: "Lane Octave",
      value: "Value Note 48",
      detail: "Lane 3, octave jumps",
      route: "Route: Move Ch1",
    });

    S.knobTouched = 5;
    expect(paramPeekInfo()).toMatchObject({
      target: "Gate Time",
      value: "Value 109%",
      detail: "Lane 3",
    });
  });

  test("motion overview model preserves AUTO bank badges, lane cells, and footer", () => {
    expect(motionOverviewModel(0, 0)).toMatchObject({
      heading: "AUTO",
      badges: ["Sch", "AT", "CC"],
      footer: "",
    });
    expect(motionOverviewModel(0, 0).lanes.slice(0, 4)).toEqual([
      { lane: 0, label: "AT", value: "--", touched: false, labelInverted: false, valueInverted: false },
      { lane: 1, label: "CC74", value: "64", touched: true, labelInverted: true, valueInverted: true },
      { lane: 2, label: "Sch5", value: "99", touched: false, labelInverted: false, valueInverted: false },
      { lane: 3, label: "--", value: "--", touched: false, labelInverted: false, valueInverted: false },
    ]);
    S.knobTouched = 2;
    expect(motionOverviewModel(0, 0).footer).toBe("Cutoff");

    S.altMode = true;
    const assignModel = motionOverviewModel(0, 0);
    expect(assignModel.lanes[0]).toMatchObject({ labelInverted: true, valueInverted: false });
    expect(assignModel.lanes[1]).toMatchObject({ labelInverted: true, valueInverted: true });
  });

  test("motion idle model preserves active-lane summary text", () => {
    S.ccLaneLength[0][0][1] = 32;
    S.ccLaneTps[0][0][1] = 12;
    S.ccLaneResTps[0][0][1] = 24;

    expect(motionIdleModel(0, 0)).toEqual({
      heading: "AUTO",
      badges: ["Sch", "AT", "CC"],
      lane: 1,
      laneLabel: "L2 CC74",
      value: "64",
      valueUnderline: true,
      param: "",
      paramText: "",
      resText: "Res: 1/16",
      zoomText: "Zoom: 1/32",
      effectiveLength: 32,
      graphKey: "g_0_0_1",
      graphPages: 2,
    });

    S.ccActiveLane[0] = 2;
    expect(motionIdleModel(0, 0)).toMatchObject({
      laneLabel: "L3 Sch5",
      value: "99",
      param: "Cutoff",
      paramText: "Cutoff",
    });
  });
});
