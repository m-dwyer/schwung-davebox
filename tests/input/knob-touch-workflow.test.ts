import { describe, expect, test } from "vitest";
import { handleUiKnobTouch } from "@overture-ui/input/ui_knob_touch_workflow.mjs";

const DRUM = 1;
const MOVE_MAIN_TOUCH = 9;
const LED_OFF = 0;
const TRACK_COLORS = [10, 20, 30, 40, 50, 60, 70, 80];

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    fn(name: string) {
      return (...args: unknown[]) => log.push([name, ...args]);
    },
  };
}

function grid(t: number, fill: () => unknown) {
  return Array.from({ length: t }, fill);
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    activeBank: 0,
    activeTrack: 1,
    tickCount: 123,
    knobTouched: -1,
    knobTouchStartTick: -1,
    knobTurnedTick: [0, 0, 0, 0, 0, 0, 0, 0],
    knobLocked: [false, false, false, false, false, false, false, false],
    knobAccum: [0, 0, 0, 0, 0, 0, 0, 0],
    screenDirty: false,
    trackPadMode: [DRUM, 0],
    activeDrumLane: [0, 1],
    bankParams: grid(2, () => grid(8, () => [0, 0, 5, 7, 0, 0, 0, 0])),
    ccActiveLane: [0, 0],
    deleteHeld: false,
    shiftHeld: false,
    trackCCAutoBits: grid(2, () => [0xff, 0xff]),
    trackCCLiveVal: grid(2, () => [-1, -1, -1, -1, -1, -1, -1, -1]),
    clipCCVal: grid(2, () => grid(2, () => [-1, -1, -1, -1, -1, -1, -1, -1])),
    sessionView: false,
    recordArmed: false,
    recordCountingIn: false,
    perfViewLocked: false,
    trackLooper: [0, 0, 0, 0, 0, 0, 0, 0],
    globalMenuOpen: false,
    jogTouched: false,
    bankSelectTick: 44,
    clockShiftTouchDelta: 9,
    allLanesResResetTick: -1,
    allLanesResResetTrack: -1,
    allLanesQntResetTick: -1,
    allLanesQntResetTrack: -1,
    allLanesDirResetTick: -1,
    allLanesDirResetTrack: -1,
    ...overrides,
  };
}

function banks(overrides: Record<number, Record<number, unknown>> = {}) {
  const result = Array.from({ length: 8 }, () => ({
    knobs: Array.from({ length: 8 }, () => null as unknown),
  }));
  for (const [bank, knobs] of Object.entries(overrides)) {
    for (const [knob, value] of Object.entries(knobs)) {
      result[Number(bank)].knobs[Number(knob)] = value;
    }
  }
  return result;
}

function deps(c: ReturnType<typeof calls>, overrides: Record<string, unknown> = {}) {
  return {
    applyTrackConfig: c.fn("applyTrackConfig"),
    banks: banks(),
    effectiveClip: (_track: number) => 1,
    forceRedraw: c.fn("redraw"),
    invalidateLEDCache: c.fn("ledInvalidate"),
    ledOff: LED_OFF,
    moveMainTouch: MOVE_MAIN_TOUCH,
    padModeDrum: DRUM,
    setButtonLED: c.fn("setButtonLED"),
    setParam: c.fn("setParam"),
    showActionPopup: c.fn("popup"),
    touchSchwungSoundVisibleParam: c.fn("touchSoundParam"),
    trackColors: TRACK_COLORS,
    ...overrides,
  };
}

describe("Knob touch workflow", () => {
  test("touch-on records the active physical knob and marks the screen dirty", () => {
    const c = calls();
    const S = state({ activeBank: 2 });

    handleUiKnobTouch(S, deps(c), 0x90, 3, 127);

    expect(S.knobTouched).toBe(3);
    expect(S.knobTouchStartTick).toBe(123);
    expect(S.knobTurnedTick[3]).toBe(-1);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([]);
  });

  test("Sound detail touch shows param peek and does not run bank touch side effects", () => {
    const c = calls();
    const S = state({
      activeBank: 6,
      deleteHeld: true,
      schwungSoundPage: { paramDetail: true },
    });

    handleUiKnobTouch(S, deps(c), 0x90, 2, 127);

    expect(S.knobTouched).toBe(2);
    expect(S.knobTouchStartTick).toBe(123);
    expect(c.log).toEqual([["touchSoundParam", 2]]);
  });

  test("Sound detail touch release only clears transient touch state", () => {
    const c = calls();
    const S = state({
      activeBank: 7,
      knobTouched: 2,
      knobTouchStartTick: 100,
      knobAccum: [0, 0, 3, 0, 0, 0, 0, 0],
      schwungSoundPage: { paramDetail: true },
    });

    handleUiKnobTouch(S, deps(c, { banks: banks({ 7: { 2: { dspKey: "nudge" } } }) }), 0x80, 2, 0);

    expect(S.knobTouched).toBe(-1);
    expect(S.knobAccum[2]).toBe(0);
    expect(c.log).toEqual([]);
  });

  test("CC-bank touch selects the lane and Delete+touch clears automation/resting value", () => {
    const c = calls();
    const S = state({
      activeBank: 6,
      activeTrack: 1,
      deleteHeld: true,
      trackCCLiveVal: [
        [-1, -1, -1, -1, -1, -1, -1, -1],
        [1, 2, 3, 4, 5, 6, 7, 8],
      ],
      clipCCVal: [
        grid(2, () => [-1, -1, -1, -1, -1, -1, -1, -1]),
        grid(2, () => [10, 11, 12, 13, 14, 15, 16, 17]),
      ],
    });

    handleUiKnobTouch(S, deps(c), 0x90, 2, 127);

    expect(S.ccActiveLane[1]).toBe(2);
    expect(S.trackCCAutoBits[1][1] & (1 << 2)).toBe(0);
    expect(S.trackCCLiveVal[1][2]).toBe(-1);
    expect(S.clipCCVal[1][1][2]).toBe(-1);
    expect(c.log).toEqual([
      ["ledInvalidate"],
      ["setParam", "t1_cc_auto_clear_k", "1 2"],
      ["popup", "CC", "CLEAR"],
      ["ledInvalidate"],
    ]);
  });

  test("CC-bank touch-record starts with the live value and stops on release", () => {
    const c = calls();
    const S = state({
      activeBank: 6,
      recordArmed: true,
      trackCCLiveVal: [
        [-1, -1, -1, -1, -1, -1, -1, -1],
        [-1, -1, -1, -1, 83, -1, -1, -1],
      ],
    });

    const d = deps(c);
    handleUiKnobTouch(S, d, 0x90, 4, 127);
    handleUiKnobTouch(S, d, 0x90, 4, 0);

    expect(S.trackCCAutoBits[1][1] & (1 << 4)).toBe(1 << 4);
    expect(c.log).toEqual([
      ["ledInvalidate"],
      ["setParam", "t1_cc_touch", "4 1 83"],
      ["setParam", "t1_cc_touch", "4 0 0"],
    ]);
    expect(S.knobTouched).toBe(-1);
    expect(S.knobAccum[4]).toBe(0);
  });

  test("perf-view touch toggles the looper for the touched track and paints the ring", () => {
    const c = calls();
    const S = state({ activeBank: 2, perfViewLocked: true });

    handleUiKnobTouch(S, deps(c), 0x90, 3, 127);

    expect(S.trackLooper[3]).toBe(1);
    expect(c.log).toEqual([
      ["applyTrackConfig", 3, "track_looper", 1],
      ["popup", "LOOPER ON", "TRACK 4"],
      ["setButtonLED", 74, TRACK_COLORS[3], true],
    ]);
  });

  test("jog touch is gated by global menu and resets bank overview state on release", () => {
    const c = calls();
    const d = deps(c);
    const S = state({ activeBank: 2, globalMenuOpen: true });

    handleUiKnobTouch(S, d, 0x90, MOVE_MAIN_TOUCH, 127);
    expect(S.jogTouched).toBe(false);

    S.globalMenuOpen = false;
    handleUiKnobTouch(S, d, 0x90, MOVE_MAIN_TOUCH, 127);
    handleUiKnobTouch(S, d, 0x80, MOVE_MAIN_TOUCH, 0);

    expect(S.jogTouched).toBe(false);
    expect(S.bankSelectTick).toBe(-1);
    expect(c.log).toEqual([["redraw"], ["redraw"]]);
  });

  test("0x90 touch-off resets transient nudge state and all-lanes display timers", () => {
    const c = calls();
    const S = state({
      activeTrack: 0,
      activeBank: 7,
      knobTouched: 0,
      knobTouchStartTick: 100,
      knobLocked: [true, false, false, false, false, false, false, false],
      knobAccum: [5, 0, 0, 0, 0, 0, 0, 0],
    });

    handleUiKnobTouch(S, deps(c, { banks: banks({ 7: { 0: { dspKey: "nudge" } } }) }), 0x90, 0, 0);

    expect(S.bankParams[0][7][0]).toBe(0);
    expect(S.allLanesResResetTick).toBe(170);
    expect(S.allLanesResResetTrack).toBe(0);
    expect(S.knobTouched).toBe(-1);
    expect(S.knobLocked[0]).toBe(false);
    expect(S.knobAccum[0]).toBe(0);
    expect(c.log).toEqual([["setParam", "t0_all_lanes_nudge", "0"]]);
  });

  test("0x80 touch-off keeps note-off parity for clock shift and all-lanes K4", () => {
    const c = calls();
    const S = state({
      activeTrack: 0,
      activeBank: 7,
      clockShiftTouchDelta: 4,
      bankParams: grid(2, () => grid(8, () => [0, 0, 0, 12, 0, 0, 0, 0])),
    });

    handleUiKnobTouch(S, deps(c, { banks: banks({ 7: { 3: { dspKey: "clock_shift" } } }) }), 0x80, 3, 0);

    expect(S.clockShiftTouchDelta).toBe(0);
    expect(S.bankParams[0][7][3]).toBe(0);
    expect(S.allLanesQntResetTick).toBe(170);
    expect(S.allLanesQntResetTrack).toBe(0);
    expect(c.log).toEqual([]);
  });
});
