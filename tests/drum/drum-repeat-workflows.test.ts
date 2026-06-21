import { describe, expect, test } from "vitest";
import {
  handleDrumRepeatRatePadPress,
  handleDrumRepeatRatePadRelease,
  handleDrumRepeatGatePad,
  handleDrumRepeat2LanePadPress,
  handleDrumRepeat2LanePadRelease,
  handleDrumRepeat2RatePadPress,
  handleDrumRepeatPadAftertouch,
  handleDrumRepeat2LaneAftertouch,
  prepareDrumRepeatLoopPress,
  latchHeldDrumRepeatsOnLoopPress,
  handleDrumRepeatLoopTapRelease,
  handleDeleteLoopDrumRepeatStop,
  cycleDrumRepeatPerformMode,
  resetDrumRepeatGrooveForLane,
  resetDrumRepeatGrooveMirrorsForLane,
  copyDrumRepeatGrooveMirrors,
  moveDrumRepeatGrooveMirrors,
  editDrumRepeatGrooveStep,
  handleDrumRepeatPadPress,
  handleDrumRepeatPadRelease,
} from "@overture-ui/drum/ui_drum_repeat_workflows.mjs";

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    fn(name: string) {
      return (...args: unknown[]) => log.push([name, ...args]);
    },
  };
}

function baseState() {
  return {
    deleteHeld: false,
    loopHeld: false,
    drumRepeatGate: [[0b0010_1101]],
    drumRepeatGateLen: [[6]],
    drumRepeatVelScale: [[[90, 91, 92, 93, 94, 95, 96, 97]]],
    drumRepeatNudge: [[[1, 2, 3, 4, 5, 6, 7, 8]]],
  };
}

function rpt2State() {
  return {
    loopHeld: false,
    dspInboundEnabled: false,
    rpt2LoopPadUsed: false,
    drumRepeat2RatePerLane: [[0, 1, 2, 3, 4, 5, 6, 7]],
    drumRepeat2HeldLanes: [new Set<number>()],
    drumRepeat2LatchedLanes: [new Set<number>()],
    trackPadMode: [1],
    drumPerformMode: [2],
    screenDirty: false,
  };
}

function rpt1State() {
  return {
    loopHeld: false,
    dspInboundEnabled: false,
    drumRepeatHeldPad: [-1],
    drumRepeatHeldPadVel: [100],
    drumRepeatHeldPadsStack: [[] as Array<{ padIdx: number; rateIdx: number; vel: number }>],
    drumRepeatLatched: [false],
    screenDirty: false,
  };
}

function loopState() {
  return {
    drumRepeatHeldPad: [-1],
    drumRepeatHeldPadsStack: [[] as Array<{ padIdx: number; rateIdx: number; vel: number }>],
    drumRepeatLatched: [false],
    drumRepeat2HeldLanes: [new Set<number>()],
    drumRepeat2LatchedLanes: [new Set<number>()],
    liveActiveNotes: new Set<number>(),
    loopTapUnlatchTrack: -1,
    loopPressTick: 0,
    tickCount: 0,
    pendingDefaultSetParams: [] as Array<{ key: string; val: string }>,
    rpt2LoopPadUsed: false,
  };
}

function deleteLoopState() {
  return {
    ...loopState(),
    drumPerformMode: [0],
  };
}

function performModeState() {
  return {
    activeBank: 0,
    drumPerformMode: [0],
    drumRepeatHeldPad: [-1],
    drumRepeatHeldPadsStack: [[] as Array<{ padIdx: number; rateIdx: number; vel: number }>],
    drumRepeatLatched: [false],
    drumRepeat2HeldLanes: [new Set<number>()],
    drumRepeat2LatchedLanes: [new Set<number>()],
  };
}

function repeatRouterDeps(c: ReturnType<typeof calls>, padPitch = new Array(32).fill(64)) {
  return {
    PAD_MODE_DRUM: 1,
    DRUM_LANES: 32,
    drumPadToLane: (padIdx: number) => {
      const col = padIdx % 8;
      if (col >= 4) return -1;
      return Math.floor(padIdx / 8) * 4 + col;
    },
    setActiveDrumLane: c.fn("setActive"),
    syncDrumLaneSteps: c.fn("syncSteps"),
    refreshDrumLaneBankParams: c.fn("refreshBank"),
    host_module_set_param: c.fn("set"),
    forceRedraw: c.fn("redraw"),
    padPitch,
  };
}

describe("drum repeat workflows", () => {
  test("Delete+jog repeat-groove reset updates mirrors and appends one deferred DSP reset", () => {
    const c = calls();
    const S = {
      ...baseState(),
      drumRepeat2RatePerLane: [[4]],
      pendingDefaultSetParams: [{ key: "existing", val: "1" }],
    };

    resetDrumRepeatGrooveForLane(S, {
      showActionPopup: c.fn("popup"),
    }, 0, 0);

    expect(S.drumRepeatGate[0][0]).toBe(0xff);
    expect(S.drumRepeatGateLen[0][0]).toBe(8);
    expect(S.drumRepeatVelScale[0][0]).toEqual([100, 100, 100, 100, 100, 100, 100, 100]);
    expect(S.drumRepeatNudge[0][0]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(S.drumRepeat2RatePerLane[0][0]).toBe(4);
    expect(S.pendingDefaultSetParams).toEqual([
      { key: "existing", val: "1" },
      { key: "t0_l0_repeat_groove_reset", val: "1" },
    ]);
    expect(c.log).toEqual([
      ["popup", "RPT GROOVE", "RESET"],
    ]);
  });

  test("mirror-only factory reset does not queue a DSP reset", () => {
    const S = {
      ...baseState(),
      drumRepeat2RatePerLane: [[7]],
      pendingDefaultSetParams: [{ key: "keep", val: "1" }],
    };

    resetDrumRepeatGrooveMirrorsForLane(S, 0, 0);

    expect(S.drumRepeatGate[0][0]).toBe(0xff);
    expect(S.drumRepeatGateLen[0][0]).toBe(8);
    expect(S.drumRepeatVelScale[0][0]).toEqual([100, 100, 100, 100, 100, 100, 100, 100]);
    expect(S.drumRepeatNudge[0][0]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(S.drumRepeat2RatePerLane[0][0]).toBe(0);
    expect(S.pendingDefaultSetParams).toEqual([{ key: "keep", val: "1" }]);
  });

  test("copy and move repeat-groove mirrors preserve lane semantics", () => {
    const S = {
      drumRepeatGate: [[0b0000_0011, 0b1111_0000, 0b0101_0101]],
      drumRepeatGateLen: [[2, 4, 6]],
      drumRepeatVelScale: [[
        [101, 102, 103, 104, 105, 106, 107, 108],
        [11, 12, 13, 14, 15, 16, 17, 18],
        [21, 22, 23, 24, 25, 26, 27, 28],
      ]],
      drumRepeatNudge: [[
        [-1, -2, -3, -4, -5, -6, -7, -8],
        [1, 2, 3, 4, 5, 6, 7, 8],
        [9, 10, 11, 12, 13, 14, 15, 16],
      ]],
      drumRepeat2RatePerLane: [[3, 4, 5]],
    };

    copyDrumRepeatGrooveMirrors(S, 0, 0, 1);
    expect(S.drumRepeatGate[0][1]).toBe(0b0000_0011);
    expect(S.drumRepeatGateLen[0][1]).toBe(2);
    expect(S.drumRepeatVelScale[0][1]).toEqual([101, 102, 103, 104, 105, 106, 107, 108]);
    expect(S.drumRepeatNudge[0][1]).toEqual([-1, -2, -3, -4, -5, -6, -7, -8]);
    expect(S.drumRepeat2RatePerLane[0][1]).toBe(4);

    moveDrumRepeatGrooveMirrors(S, 0, 1, 2);
    expect(S.drumRepeatGate[0][2]).toBe(0b0000_0011);
    expect(S.drumRepeatGateLen[0][2]).toBe(2);
    expect(S.drumRepeatVelScale[0][2]).toEqual([101, 102, 103, 104, 105, 106, 107, 108]);
    expect(S.drumRepeatNudge[0][2]).toEqual([-1, -2, -3, -4, -5, -6, -7, -8]);
    expect(S.drumRepeatGate[0][1]).toBe(0xff);
    expect(S.drumRepeatGateLen[0][1]).toBe(8);
    expect(S.drumRepeatVelScale[0][1]).toEqual([100, 100, 100, 100, 100, 100, 100, 100]);
    expect(S.drumRepeatNudge[0][1]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(S.drumRepeat2RatePerLane[0][1]).toBe(0);
  });

  test("repeat-groove knob edits clamp and write the same DSP payloads", () => {
    const c = calls();
    const S = {
      screenDirty: false,
      drumRepeatVelScale: [[[199, 1, 0, 200, 100, 100, 100, 100]]],
      drumRepeatNudge: [[[49, -49, -50, 50, 0, 0, 0, 0]]],
    };

    expect(editDrumRepeatGrooveStep(S, { host_module_set_param: c.fn("set") }, 0, 0, 0, 1, false)).toBe(true);
    expect(editDrumRepeatGrooveStep(S, { host_module_set_param: c.fn("set") }, 0, 0, 1, -1, false)).toBe(true);
    expect(editDrumRepeatGrooveStep(S, { host_module_set_param: c.fn("set") }, 0, 0, 2, -1, true)).toBe(true);
    expect(editDrumRepeatGrooveStep(S, { host_module_set_param: c.fn("set") }, 0, 0, 3, 1, true)).toBe(true);

    expect(S.drumRepeatVelScale[0][0][0]).toBe(200);
    expect(S.drumRepeatVelScale[0][0][1]).toBe(0);
    expect(S.drumRepeatNudge[0][0][2]).toBe(-50);
    expect(S.drumRepeatNudge[0][0][3]).toBe(50);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([
      ["set", "t0_l0_repeat_vel_scale", "0 200"],
      ["set", "t0_l0_repeat_vel_scale", "1 0"],
    ]);
  });

  test("repeat pad router dispatches Rpt1 rate pads and leaves left-grid pads alone", () => {
    const c = calls();
    const S = {
      ...rpt1State(),
      trackPadMode: [1],
      drumPerformMode: [1],
      activeDrumLane: [3],
      shiftHeld: false,
      copyHeld: false,
      muteHeld: false,
    };

    expect(handleDrumRepeatPadPress(S, repeatRouterDeps(c), 0, 5, 96)).toBe(true);
    expect(handleDrumRepeatPadPress(S, repeatRouterDeps(c), 0, 1, 96)).toBe(false);

    expect(S.drumRepeatHeldPad[0]).toBe(5);
    expect(c.log).toEqual([
      ["set", "t0_drum_repeat_start", "3 1 96"],
      ["set", "t0_drum_repeat_latched", "0"],
    ]);
  });

  test("repeat pad router dispatches Rpt1 gate pads and respects modifier exclusions", () => {
    const c = calls();
    const S = {
      ...baseState(),
      trackPadMode: [1],
      drumPerformMode: [1],
      activeDrumLane: [0],
      shiftHeld: false,
      copyHeld: false,
      muteHeld: false,
    };

    expect(handleDrumRepeatPadPress(S, repeatRouterDeps(c), 0, 21, 96)).toBe(true);
    S.copyHeld = true;
    expect(handleDrumRepeatPadPress(S, repeatRouterDeps(c), 0, 22, 96)).toBe(false);

    expect(S.drumRepeatGate[0][0]).toBe(0b0010_1111);
    expect(c.log).toEqual([
      ["set", "t0_l0_repeat_gate_toggle", "1"],
      ["redraw"],
    ]);
  });

  test("repeat pad router dispatches Rpt2 rate, gate, and lane pads but not Delete+lane", () => {
    const c = calls();
    const padPitch = new Array(32).fill(64);
    const S = {
      ...baseState(),
      ...rpt2State(),
      trackPadMode: [1],
      drumPerformMode: [2],
      activeDrumLane: [0],
      shiftHeld: false,
      copyHeld: false,
      muteHeld: false,
      deleteHeld: false,
    };

    expect(handleDrumRepeatPadPress(S, repeatRouterDeps(c, padPitch), 0, 6, 90)).toBe(true);
    expect(handleDrumRepeatPadPress(S, repeatRouterDeps(c, padPitch), 0, 22, 90)).toBe(true);
    expect(handleDrumRepeatPadPress(S, repeatRouterDeps(c, padPitch), 0, 9, 101)).toBe(true);
    S.deleteHeld = true;
    expect(handleDrumRepeatPadPress(S, repeatRouterDeps(c, padPitch), 0, 10, 101)).toBe(false);

    expect(S.drumRepeat2RatePerLane[0][0]).toBe(2);
    expect(S.drumRepeatGate[0][0]).toBe(0b0010_1001);
    expect(S.drumRepeat2HeldLanes[0].has(5)).toBe(true);
    expect(padPitch[9]).toBe(-1);
    expect(c.log).toEqual([
      ["set", "t0_drum_repeat2_rate", "0 2"],
      ["set", "t0_l0_repeat_gate_toggle", "2"],
      ["redraw"],
      ["setActive", 0, 5],
      ["syncSteps", 0, 5],
      ["refreshBank", 0, 5],
      ["set", "t0_drum_repeat2_lane_on", "5 101"],
      ["redraw"],
    ]);
  });

  test("repeat release router swallows Rpt1 and Rpt2 owned pad releases", () => {
    const c = calls();
    const S = {
      ...rpt1State(),
      ...rpt2State(),
      trackPadMode: [1],
      drumPerformMode: [1],
      activeDrumLane: [4],
      drumRepeatHeldPad: [5],
      drumRepeatHeldPadsStack: [[] as Array<{ padIdx: number; rateIdx: number; vel: number }>],
      drumRepeatLatched: [false],
    };

    expect(handleDrumRepeatPadRelease(S, repeatRouterDeps(c), 0, 5)).toBe(true);
    S.drumPerformMode[0] = 2;
    S.drumRepeat2HeldLanes[0].add(6);
    expect(handleDrumRepeatPadRelease(S, repeatRouterDeps(c), 0, 10)).toBe(true);
    expect(handleDrumRepeatPadRelease(S, repeatRouterDeps(c), 0, 23)).toBe(true);

    expect(S.drumRepeatHeldPad[0]).toBe(-1);
    expect(S.drumRepeat2HeldLanes[0].has(6)).toBe(false);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([
      ["set", "t0_drum_repeat_stop", "1"],
      ["set", "t0_drum_repeat2_lane_off", "6"],
    ]);
  });

  test("Rpt1 rate pad press stores the held pad and starts stock repeat", () => {
    const c = calls();
    const S = rpt1State();

    expect(handleDrumRepeatRatePadPress(S, {
      host_module_set_param: c.fn("set"),
    }, 0, 5, 1, 12, 96)).toBe(true);

    expect(S.drumRepeatHeldPad[0]).toBe(5);
    expect(S.drumRepeatHeldPadVel[0]).toBe(96);
    expect(S.drumRepeatLatched[0]).toBe(false);
    expect(S.drumRepeatHeldPadsStack[0]).toEqual([]);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([
      ["set", "t0_drum_repeat_start", "12 1 96"],
      ["set", "t0_drum_repeat_latched", "0"],
    ]);
  });

  test("Rpt1 patched Schwung skips drum_repeat_start on press but writes latch state", () => {
    const c = calls();
    const S = rpt1State();
    S.dspInboundEnabled = true;

    expect(handleDrumRepeatRatePadPress(S, {
      host_module_set_param: c.fn("set"),
    }, 0, 6, 2, 9, 80)).toBe(true);

    expect(S.drumRepeatHeldPad[0]).toBe(6);
    expect(S.drumRepeatHeldPadVel[0]).toBe(80);
    expect(S.drumRepeatLatched[0]).toBe(false);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([
      ["set", "t0_drum_repeat_latched", "0"],
    ]);
  });

  test("Rpt1 Loop-held rate press latches after starting repeat", () => {
    const c = calls();
    const S = rpt1State();
    S.loopHeld = true;

    expect(handleDrumRepeatRatePadPress(S, {
      host_module_set_param: c.fn("set"),
    }, 0, 12, 4, 3, 101)).toBe(true);

    expect(S.drumRepeatHeldPad[0]).toBe(12);
    expect(S.drumRepeatHeldPadVel[0]).toBe(101);
    expect(S.drumRepeatLatched[0]).toBe(true);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([
      ["set", "t0_drum_repeat_start", "3 4 101"],
      ["set", "t0_drum_repeat_latched", "1"],
    ]);
  });

  test("Rpt1 pressing the same latched pad again unlatches and stops", () => {
    const c = calls();
    const S = rpt1State();
    S.drumRepeatHeldPad[0] = 5;
    S.drumRepeatHeldPadVel[0] = 91;
    S.drumRepeatHeldPadsStack[0].push({ padIdx: 4, rateIdx: 0, vel: 70 });
    S.drumRepeatLatched[0] = true;

    expect(handleDrumRepeatRatePadPress(S, {
      host_module_set_param: c.fn("set"),
    }, 0, 5, 1, 2, 88)).toBe(true);

    expect(S.drumRepeatHeldPad[0]).toBe(-1);
    expect(S.drumRepeatHeldPadsStack[0]).toEqual([]);
    expect(S.drumRepeatLatched[0]).toBe(false);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([
      ["set", "t0_drum_repeat_stop", "1"],
    ]);
  });

  test("Rpt1 pressing another rate while one is held pushes the previous pad to the stack", () => {
    const c = calls();
    const S = rpt1State();
    S.drumRepeatHeldPad[0] = 4;
    S.drumRepeatHeldPadVel[0] = 77;

    expect(handleDrumRepeatRatePadPress(S, {
      host_module_set_param: c.fn("set"),
    }, 0, 13, 5, 6, 110)).toBe(true);

    expect(S.drumRepeatHeldPad[0]).toBe(13);
    expect(S.drumRepeatHeldPadVel[0]).toBe(110);
    expect(S.drumRepeatHeldPadsStack[0]).toEqual([{ padIdx: 4, rateIdx: 0, vel: 77 }]);
    expect(c.log).toEqual([
      ["set", "t0_drum_repeat_start", "6 5 110"],
      ["set", "t0_drum_repeat_latched", "0"],
    ]);
  });

  test("Rpt1 releasing the active unlatched pad resumes the previous stacked rate", () => {
    const c = calls();
    const S = rpt1State();
    S.dspInboundEnabled = true;
    S.drumRepeatHeldPad[0] = 13;
    S.drumRepeatHeldPadVel[0] = 110;
    S.drumRepeatHeldPadsStack[0].push({ padIdx: 4, rateIdx: 0, vel: 77 });

    expect(handleDrumRepeatRatePadRelease(S, {
      host_module_set_param: c.fn("set"),
    }, 0, 13, 6)).toBe(true);

    expect(S.drumRepeatHeldPad[0]).toBe(4);
    expect(S.drumRepeatHeldPadsStack[0]).toEqual([]);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([
      ["set", "t0_drum_repeat_start", "6 0 77"],
    ]);
  });

  test("Rpt1 releasing the active unlatched pad with no stack stops", () => {
    const c = calls();
    const S = rpt1State();
    S.drumRepeatHeldPad[0] = 5;

    expect(handleDrumRepeatRatePadRelease(S, {
      host_module_set_param: c.fn("set"),
    }, 0, 5, 2)).toBe(true);

    expect(S.drumRepeatHeldPad[0]).toBe(-1);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([
      ["set", "t0_drum_repeat_stop", "1"],
    ]);
  });

  test("Rpt1 releasing a queued inactive pad removes it from the stack", () => {
    const c = calls();
    const S = rpt1State();
    S.drumRepeatHeldPad[0] = 13;
    S.drumRepeatHeldPadsStack[0].push(
      { padIdx: 4, rateIdx: 0, vel: 77 },
      { padIdx: 5, rateIdx: 1, vel: 88 },
    );

    expect(handleDrumRepeatRatePadRelease(S, {
      host_module_set_param: c.fn("set"),
    }, 0, 4, 6)).toBe(true);

    expect(S.drumRepeatHeldPad[0]).toBe(13);
    expect(S.drumRepeatHeldPadsStack[0]).toEqual([{ padIdx: 5, rateIdx: 1, vel: 88 }]);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([]);
  });

  test("Rpt1 right-grid release always marks dirty and swallows inactive gate-pad release", () => {
    const c = calls();
    const S = rpt1State();

    expect(handleDrumRepeatRatePadRelease(S, {
      host_module_set_param: c.fn("set"),
    }, 0, 22, 6)).toBe(true);

    expect(S.drumRepeatHeldPad[0]).toBe(-1);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([]);
  });

  test("Rpt1 aftertouch on the held rate pad updates velocity and sends pressure", () => {
    const c = calls();
    const S = rpt1State();
    S.drumRepeatHeldPad[0] = 13;
    S.drumRepeatHeldPadVel[0] = 90;

    expect(handleDrumRepeatPadAftertouch(S, {
      host_module_set_param: c.fn("set"),
    }, 0, 13, 117)).toBe(true);

    expect(S.drumRepeatHeldPadVel[0]).toBe(117);
    expect(c.log).toEqual([
      ["set", "t0_drum_repeat_vel", "117"],
    ]);
  });

  test("Rpt1 aftertouch on another pad does nothing", () => {
    const c = calls();
    const S = rpt1State();
    S.drumRepeatHeldPad[0] = 13;
    S.drumRepeatHeldPadVel[0] = 90;

    expect(handleDrumRepeatPadAftertouch(S, {
      host_module_set_param: c.fn("set"),
    }, 0, 12, 117)).toBe(false);

    expect(S.drumRepeatHeldPadVel[0]).toBe(90);
    expect(c.log).toEqual([]);
  });

  test("tap gate pad toggles the repeat gate bit and redraws", () => {
    const c = calls();
    const S = baseState();

    expect(handleDrumRepeatGatePad(S, {
      host_module_set_param: c.fn("set"),
      forceRedraw: c.fn("redraw"),
    }, 0, 0, 2)).toBe(true);

    expect(S.drumRepeatGate[0][0]).toBe(0b0010_1001);
    expect(S.drumRepeatGateLen[0][0]).toBe(6);
    expect(c.log).toEqual([
      ["set", "t0_l0_repeat_gate_toggle", "2"],
      ["redraw"],
    ]);
  });

  test("Loop+gate pad sets the gate cycle length and fill mask", () => {
    const c = calls();
    const S = baseState();
    S.loopHeld = true;

    expect(handleDrumRepeatGatePad(S, {
      host_module_set_param: c.fn("set"),
      forceRedraw: c.fn("redraw"),
    }, 0, 0, 4)).toBe(true);

    expect(S.drumRepeatGate[0][0]).toBe(0b0001_1111);
    expect(S.drumRepeatGateLen[0][0]).toBe(5);
    expect(c.log).toEqual([
      ["set", "t0_l0_repeat_gate_and_len", "31 5"],
      ["redraw"],
    ]);
  });

  test("Delete+gate pad resets repeat defaults for that step", () => {
    const c = calls();
    const S = baseState();
    S.deleteHeld = true;

    expect(handleDrumRepeatGatePad(S, {
      host_module_set_param: c.fn("set"),
      forceRedraw: c.fn("redraw"),
    }, 0, 0, 5)).toBe(true);

    expect(S.drumRepeatVelScale[0][0][5]).toBe(100);
    expect(S.drumRepeatNudge[0][0][5]).toBe(0);
    expect(S.drumRepeatGate[0][0]).toBe(0b0010_1101);
    expect(c.log).toEqual([
      ["set", "t0_l0_repeat_defaults", "5"],
      ["redraw"],
    ]);
  });

  test("gate pad ignores invalid step targets", () => {
    const c = calls();
    const S = baseState();

    expect(handleDrumRepeatGatePad(S, {
      host_module_set_param: c.fn("set"),
      forceRedraw: c.fn("redraw"),
    }, 0, 0, -1)).toBe(false);
    expect(handleDrumRepeatGatePad(S, {
      host_module_set_param: c.fn("set"),
      forceRedraw: c.fn("redraw"),
    }, 0, 0, 8)).toBe(false);

    expect(S.drumRepeatGate[0][0]).toBe(0b0010_1101);
    expect(c.log).toEqual([]);
  });

  test("Rpt2 lane pad selects and engages an unlatched lane on stock Schwung", () => {
    const c = calls();
    const S = rpt2State();
    const padPitch = new Array(32).fill(64);

    expect(handleDrumRepeat2LanePadPress(S, {
      DRUM_LANES: 32,
      setActiveDrumLane: c.fn("setActive"),
      syncDrumLaneSteps: c.fn("syncSteps"),
      refreshDrumLaneBankParams: c.fn("refreshBank"),
      host_module_set_param: c.fn("set"),
      forceRedraw: c.fn("redraw"),
      padPitch,
    }, 0, 5, 9, 101)).toBe(true);

    expect(S.drumRepeat2HeldLanes[0].has(5)).toBe(true);
    expect(S.drumRepeat2LatchedLanes[0].has(5)).toBe(false);
    expect(S.rpt2LoopPadUsed).toBe(false);
    expect(padPitch[9]).toBe(-1);
    expect(c.log).toEqual([
      ["setActive", 0, 5],
      ["syncSteps", 0, 5],
      ["refreshBank", 0, 5],
      ["set", "t0_drum_repeat2_lane_on", "5 101"],
      ["redraw"],
    ]);
  });

  test("Rpt2 Loop+lane pad latches the lane and pushes latch-held after lane-on", () => {
    const c = calls();
    const S = rpt2State();
    S.loopHeld = true;
    const padPitch = new Array(32).fill(64);

    expect(handleDrumRepeat2LanePadPress(S, {
      DRUM_LANES: 32,
      setActiveDrumLane: c.fn("setActive"),
      syncDrumLaneSteps: c.fn("syncSteps"),
      refreshDrumLaneBankParams: c.fn("refreshBank"),
      host_module_set_param: c.fn("set"),
      forceRedraw: c.fn("redraw"),
      padPitch,
    }, 0, 6, 10, 88)).toBe(true);

    expect(S.drumRepeat2HeldLanes[0].has(6)).toBe(true);
    expect(S.drumRepeat2LatchedLanes[0].has(6)).toBe(true);
    expect(S.rpt2LoopPadUsed).toBe(true);
    expect(c.log).toEqual([
      ["setActive", 0, 6],
      ["syncSteps", 0, 6],
      ["refreshBank", 0, 6],
      ["set", "t0_drum_repeat2_lane_on", "6 88"],
      ["set", "t0_drum_repeat2_latch_held", "1"],
      ["redraw"],
    ]);
  });

  test("Rpt2 Loop+lane pad on patched Schwung skips lane-on but keeps latch-held", () => {
    const c = calls();
    const S = rpt2State();
    S.loopHeld = true;
    S.dspInboundEnabled = true;
    const padPitch = new Array(32).fill(64);

    expect(handleDrumRepeat2LanePadPress(S, {
      DRUM_LANES: 32,
      setActiveDrumLane: c.fn("setActive"),
      syncDrumLaneSteps: c.fn("syncSteps"),
      refreshDrumLaneBankParams: c.fn("refreshBank"),
      host_module_set_param: c.fn("set"),
      forceRedraw: c.fn("redraw"),
      padPitch,
    }, 0, 7, 11, 77)).toBe(true);

    expect(S.drumRepeat2HeldLanes[0].has(7)).toBe(true);
    expect(S.drumRepeat2LatchedLanes[0].has(7)).toBe(true);
    expect(c.log).toEqual([
      ["setActive", 0, 7],
      ["syncSteps", 0, 7],
      ["refreshBank", 0, 7],
      ["set", "t0_drum_repeat2_latch_held", "1"],
      ["redraw"],
    ]);
  });

  test("Rpt2 lane pad unlatches an existing lane and gates lane-off on patched Schwung", () => {
    const c = calls();
    const S = rpt2State();
    S.loopHeld = true;
    S.drumRepeat2LatchedLanes[0].add(8);
    const padPitch = new Array(32).fill(64);

    expect(handleDrumRepeat2LanePadPress(S, {
      DRUM_LANES: 32,
      setActiveDrumLane: c.fn("setActive"),
      syncDrumLaneSteps: c.fn("syncSteps"),
      refreshDrumLaneBankParams: c.fn("refreshBank"),
      host_module_set_param: c.fn("set"),
      forceRedraw: c.fn("redraw"),
      padPitch,
    }, 0, 8, 12, 90)).toBe(true);

    expect(S.drumRepeat2LatchedLanes[0].has(8)).toBe(false);
    expect(S.rpt2LoopPadUsed).toBe(true);
    expect(padPitch[12]).toBe(64);
    expect(c.log).toEqual([
      ["setActive", 0, 8],
      ["syncSteps", 0, 8],
      ["refreshBank", 0, 8],
      ["set", "t0_drum_repeat2_lane_off", "8"],
      ["redraw"],
    ]);

    c.log.length = 0;
    S.drumRepeat2LatchedLanes[0].add(8);
    S.dspInboundEnabled = true;
    expect(handleDrumRepeat2LanePadPress(S, {
      DRUM_LANES: 32,
      setActiveDrumLane: c.fn("setActive"),
      syncDrumLaneSteps: c.fn("syncSteps"),
      refreshDrumLaneBankParams: c.fn("refreshBank"),
      host_module_set_param: c.fn("set"),
      forceRedraw: c.fn("redraw"),
      padPitch,
    }, 0, 8, 12, 90)).toBe(true);

    expect(c.log).toEqual([
      ["setActive", 0, 8],
      ["syncSteps", 0, 8],
      ["refreshBank", 0, 8],
      ["redraw"],
    ]);
  });

  test("Rpt2 lane pad ignores invalid lane targets", () => {
    const c = calls();
    const S = rpt2State();
    const padPitch = new Array(32).fill(64);

    expect(handleDrumRepeat2LanePadPress(S, {
      DRUM_LANES: 32,
      setActiveDrumLane: c.fn("setActive"),
      syncDrumLaneSteps: c.fn("syncSteps"),
      refreshDrumLaneBankParams: c.fn("refreshBank"),
      host_module_set_param: c.fn("set"),
      forceRedraw: c.fn("redraw"),
      padPitch,
    }, 0, 32, 9, 101)).toBe(false);

    expect(S.drumRepeat2HeldLanes[0].size).toBe(0);
    expect(c.log).toEqual([]);
  });

  test("Rpt2 rate pad updates the active lane mirror and sends stock Schwung rate assignment", () => {
    const c = calls();
    const S = rpt2State();

    expect(handleDrumRepeat2RatePadPress(S, {
      host_module_set_param: c.fn("set"),
    }, 0, 5, 6)).toBe(true);

    expect(S.drumRepeat2RatePerLane[0][5]).toBe(6);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([
      ["set", "t0_drum_repeat2_rate", "5 6"],
    ]);
  });

  test("Rpt2 rate pad skips stock rate assignment on patched Schwung but still marks dirty", () => {
    const c = calls();
    const S = rpt2State();
    S.dspInboundEnabled = true;

    expect(handleDrumRepeat2RatePadPress(S, {
      host_module_set_param: c.fn("set"),
    }, 0, 4, 2)).toBe(true);

    expect(S.drumRepeat2RatePerLane[0][4]).toBe(2);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([]);
  });

  test("Rpt2 lane release stops an unlatched held lane", () => {
    const c = calls();
    const S = rpt2State();
    S.drumRepeat2HeldLanes[0].add(5);
    S.screenDirty = false;

    expect(handleDrumRepeat2LanePadRelease(S, {
      DRUM_LANES: 32,
      host_module_set_param: c.fn("set"),
    }, 0, 5)).toBe(true);

    expect(S.drumRepeat2HeldLanes[0].has(5)).toBe(false);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([
      ["set", "t0_drum_repeat2_lane_off", "5"],
    ]);
  });

  test("Rpt2 lane release keeps a latched held lane running", () => {
    const c = calls();
    const S = rpt2State();
    S.drumRepeat2HeldLanes[0].add(6);
    S.drumRepeat2LatchedLanes[0].add(6);
    S.screenDirty = false;

    expect(handleDrumRepeat2LanePadRelease(S, {
      DRUM_LANES: 32,
      host_module_set_param: c.fn("set"),
    }, 0, 6)).toBe(true);

    expect(S.drumRepeat2HeldLanes[0].has(6)).toBe(false);
    expect(S.drumRepeat2LatchedLanes[0].has(6)).toBe(true);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([]);
  });

  test("Rpt2 lane release ignores invalid or unheld lanes", () => {
    const c = calls();
    const S = rpt2State();
    S.drumRepeat2HeldLanes[0].add(7);
    S.screenDirty = false;

    expect(handleDrumRepeat2LanePadRelease(S, {
      DRUM_LANES: 32,
      host_module_set_param: c.fn("set"),
    }, 0, 32)).toBe(false);
    expect(handleDrumRepeat2LanePadRelease(S, {
      DRUM_LANES: 32,
      host_module_set_param: c.fn("set"),
    }, 0, 8)).toBe(false);

    expect(S.drumRepeat2HeldLanes[0].has(7)).toBe(true);
    expect(S.screenDirty).toBe(false);
    expect(c.log).toEqual([]);
  });

  test("Rpt2 right-grid release marks the screen dirty and swallows the pad release", () => {
    const S = rpt2State();
    S.screenDirty = false;

    expect(handleDrumRepeatPadRelease(S, {
      PAD_MODE_DRUM: 1,
      drumPadToLane: () => -1,
    }, 0, 12)).toBe(true);

    expect(S.screenDirty).toBe(true);
  });

  test("Rpt2 aftertouch on a held lane sends lane pressure", () => {
    const c = calls();
    const S = rpt2State();
    S.drumRepeat2HeldLanes[0].add(6);

    expect(handleDrumRepeat2LaneAftertouch(S, {
      host_module_set_param: c.fn("set"),
    }, 0, 6, 104)).toBe(true);

    expect(c.log).toEqual([
      ["set", "t0_drum_repeat2_vel", "6 104"],
    ]);
  });

  test("Rpt2 aftertouch on an unheld lane does nothing", () => {
    const c = calls();
    const S = rpt2State();
    S.drumRepeat2HeldLanes[0].add(6);

    expect(handleDrumRepeat2LaneAftertouch(S, {
      host_module_set_param: c.fn("set"),
    }, 0, 7, 104)).toBe(false);

    expect(c.log).toEqual([]);
  });

  test("Loop release with fresh Rpt2 held lanes promotes them to latched lanes through latch-held", () => {
    const c = calls();
    const S = loopState();
    S.drumRepeat2HeldLanes[0].add(4);
    S.drumRepeat2HeldLanes[0].add(7);

    latchHeldDrumRepeatsOnLoopPress(S, {
      host_module_set_param: c.fn("set"),
    }, 0);

    expect(S.drumRepeat2LatchedLanes[0].has(4)).toBe(true);
    expect(S.drumRepeat2LatchedLanes[0].has(7)).toBe(true);
    expect(S.rpt2LoopPadUsed).toBe(true);
    expect(S.pendingDefaultSetParams).toEqual([]);
    expect(c.log).toEqual([
      ["set", "t0_drum_repeat2_latch_held", "1"],
    ]);
  });

  test("Loop release with fresh Rpt1 held pad latches Rpt1 through pending defaults", () => {
    const c = calls();
    const S = loopState();
    S.drumRepeatHeldPad[0] = 12;
    S.pendingDefaultSetParams.push({ key: "older", val: "1" });

    latchHeldDrumRepeatsOnLoopPress(S, {
      host_module_set_param: c.fn("set"),
    }, 0);

    expect(S.drumRepeatLatched[0]).toBe(true);
    expect(S.pendingDefaultSetParams).toEqual([
      { key: "older", val: "1" },
      { key: "t0_drum_repeat_latched", val: "1" },
    ]);
    expect(c.log).toEqual([]);
  });

  test("Loop tap press snapshots Rpt1/Rpt2 unlatch eligibility only without fresh holds", () => {
    const S = loopState();

    prepareDrumRepeatLoopPress(S, 0, true, 0);
    expect(S.loopTapUnlatchTrack).toBe(0);

    S.loopTapUnlatchTrack = -1;
    S.drumRepeatHeldPad[0] = 5;
    prepareDrumRepeatLoopPress(S, 0, true, 0);
    expect(S.loopTapUnlatchTrack).toBe(-1);

    S.drumRepeatHeldPad[0] = 5;
    S.drumRepeatLatched[0] = true;
    prepareDrumRepeatLoopPress(S, 0, true, 0);
    expect(S.loopTapUnlatchTrack).toBe(0);

    S.loopTapUnlatchTrack = -1;
    S.drumRepeat2HeldLanes[0].add(2);
    prepareDrumRepeatLoopPress(S, 0, true, 0);
    expect(S.loopTapUnlatchTrack).toBe(-1);
  });

  test("Loop tap release unlatches already-latched Rpt1 and Rpt2 and preserves stop ordering", () => {
    const S = loopState();
    S.loopTapUnlatchTrack = 0;
    S.loopPressTick = 100;
    S.tickCount = 112;
    S.drumRepeatHeldPad[0] = 9;
    S.drumRepeatHeldPadsStack[0].push({ padIdx: 8, rateIdx: 0, vel: 80 });
    S.drumRepeatLatched[0] = true;
    S.drumRepeat2LatchedLanes[0].add(3);
    S.drumRepeat2LatchedLanes[0].add(4);
    S.pendingDefaultSetParams.push({ key: "older", val: "1" });

    expect(handleDrumRepeatLoopTapRelease(S, 32)).toBe(true);

    expect(S.drumRepeatLatched[0]).toBe(false);
    expect(S.drumRepeatHeldPad[0]).toBe(-1);
    expect(S.drumRepeatHeldPadsStack[0]).toEqual([]);
    expect(S.drumRepeat2LatchedLanes[0].size).toBe(0);
    expect(S.loopTapUnlatchTrack).toBe(-1);
    expect(S.pendingDefaultSetParams).toEqual([
      { key: "older", val: "1" },
      { key: "t0_drum_repeat_stop", val: "1" },
      { key: "t0_drum_repeat2_stop", val: "1" },
    ]);
  });

  test("Loop tap release ignores long holds but still clears unlatch eligibility", () => {
    const S = loopState();
    S.loopTapUnlatchTrack = 0;
    S.loopPressTick = 100;
    S.tickCount = 140;
    S.drumRepeatLatched[0] = true;

    expect(handleDrumRepeatLoopTapRelease(S, 32)).toBe(false);

    expect(S.drumRepeatLatched[0]).toBe(true);
    expect(S.loopTapUnlatchTrack).toBe(-1);
    expect(S.pendingDefaultSetParams).toEqual([]);
  });

  test("Delete+Loop stops active Rpt1 latch immediately and redraws", () => {
    const c = calls();
    const S = deleteLoopState();
    S.drumPerformMode[0] = 1;
    S.drumRepeatHeldPad[0] = 9;
    S.drumRepeatHeldPadsStack[0].push({ padIdx: 8, rateIdx: 0, vel: 80 });
    S.drumRepeatLatched[0] = true;

    expect(handleDeleteLoopDrumRepeatStop(S, {
      host_module_set_param: c.fn("set"),
      forceRedraw: c.fn("redraw"),
    }, 0)).toBe(true);

    expect(S.drumRepeatLatched[0]).toBe(false);
    expect(S.drumRepeatHeldPad[0]).toBe(-1);
    expect(S.drumRepeatHeldPadsStack[0]).toEqual([]);
    expect(c.log).toEqual([
      ["set", "t0_drum_repeat_stop", "1"],
      ["redraw"],
    ]);
  });

  test("Delete+Loop stops active Rpt2 latch immediately before clearing the mirror", () => {
    const c = calls();
    const S = deleteLoopState();
    S.drumPerformMode[0] = 2;
    S.drumRepeat2LatchedLanes[0].add(3);
    S.drumRepeat2LatchedLanes[0].add(4);

    expect(handleDeleteLoopDrumRepeatStop(S, {
      host_module_set_param: c.fn("set"),
      forceRedraw: c.fn("redraw"),
    }, 0)).toBe(true);

    expect(S.drumRepeat2LatchedLanes[0].size).toBe(0);
    expect(c.log).toEqual([
      ["set", "t0_drum_repeat2_stop", "1"],
      ["redraw"],
    ]);
  });

  test("Delete+Loop in a repeat mode with no latch keeps the unconditional redraw", () => {
    const c = calls();
    const S = deleteLoopState();
    S.drumPerformMode[0] = 1;

    expect(handleDeleteLoopDrumRepeatStop(S, {
      host_module_set_param: c.fn("set"),
      forceRedraw: c.fn("redraw"),
    }, 0)).toBe(true);

    expect(S.drumRepeatHeldPad[0]).toBe(-1);
    expect(S.drumRepeatLatched[0]).toBe(false);
    expect(c.log).toEqual([
      ["redraw"],
    ]);
  });

  test("cycling from Velocity to Rpt1 selects the repeat bank and shows the mode popup", () => {
    const c = calls();
    const S = performModeState();

    expect(cycleDrumRepeatPerformMode(S, {
      host_module_set_param: c.fn("set"),
      setDrumPerformMode: (track: number, mode: number) => {
        c.log.push(["mode", track, mode]);
        S.drumPerformMode[track] = mode;
      },
      showModePopup: c.fn("popup"),
    }, 0)).toBe(true);

    expect(S.drumPerformMode[0]).toBe(1);
    expect(S.activeBank).toBe(5);
    expect(S.drumRepeatLatched[0]).toBe(false);
    expect(c.log).toEqual([
      ["mode", 0, 1],
      ["popup", "PERFORMANCE PADS", ["Velocity", "Repeat Play (Rpt1)", "Repeat Set (Rpt2)"], 1],
    ]);
  });

  test("cycling out of Rpt1 stops repeat before mode change and clears held-pad mirrors", () => {
    const c = calls();
    const S = performModeState();
    S.activeBank = 5;
    S.drumPerformMode[0] = 1;
    S.drumRepeatHeldPad[0] = 9;
    S.drumRepeatHeldPadsStack[0].push({ padIdx: 8, rateIdx: 0, vel: 80 });
    S.drumRepeatLatched[0] = true;

    expect(cycleDrumRepeatPerformMode(S, {
      host_module_set_param: c.fn("set"),
      setDrumPerformMode: (track: number, mode: number) => {
        c.log.push(["mode", track, mode]);
        S.drumPerformMode[track] = mode;
      },
      showModePopup: c.fn("popup"),
    }, 0)).toBe(true);

    expect(S.drumPerformMode[0]).toBe(2);
    expect(S.activeBank).toBe(5);
    expect(S.drumRepeatHeldPad[0]).toBe(-1);
    expect(S.drumRepeatHeldPadsStack[0]).toEqual([]);
    expect(S.drumRepeatLatched[0]).toBe(false);
    expect(c.log).toEqual([
      ["set", "t0_drum_repeat_stop", "1"],
      ["mode", 0, 2],
      ["popup", "PERFORMANCE PADS", ["Velocity", "Repeat Play (Rpt1)", "Repeat Set (Rpt2)"], 2],
    ]);
  });

  test("cycling out of Rpt2 stops repeat before mode change and clears lane mirrors", () => {
    const c = calls();
    const S = performModeState();
    S.activeBank = 5;
    S.drumPerformMode[0] = 2;
    S.drumRepeat2HeldLanes[0].add(3);
    S.drumRepeat2LatchedLanes[0].add(4);
    S.drumRepeatLatched[0] = true;

    expect(cycleDrumRepeatPerformMode(S, {
      host_module_set_param: c.fn("set"),
      setDrumPerformMode: (track: number, mode: number) => {
        c.log.push(["mode", track, mode]);
        S.drumPerformMode[track] = mode;
      },
      showModePopup: c.fn("popup"),
    }, 0)).toBe(true);

    expect(S.drumPerformMode[0]).toBe(0);
    expect(S.activeBank).toBe(5);
    expect(S.drumRepeat2HeldLanes[0].size).toBe(0);
    expect(S.drumRepeat2LatchedLanes[0].size).toBe(0);
    expect(S.drumRepeatLatched[0]).toBe(false);
    expect(c.log).toEqual([
      ["set", "t0_drum_repeat2_stop", "1"],
      ["mode", 0, 0],
      ["popup", "PERFORMANCE PADS", ["Velocity", "Repeat Play (Rpt1)", "Repeat Set (Rpt2)"], 0],
    ]);
  });
});
