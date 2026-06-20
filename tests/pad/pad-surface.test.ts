import { describe, expect, test } from "vitest";
import {
  buildDspPadMapPayload,
  computePadNoteMap,
  createLiveNoteQueues,
  createPadSurfaceRuntime,
  createPadRuntimeState,
  drumPadToLane,
  drumPadToVelZone,
  handleCaptureDrumLanePress,
  handleDrumLanePadPress,
  handleDrumVelocityPadPress,
  resolveDrumPadTarget,
  queueLiveNoteOff,
  queueLiveNoteOn,
  selectDrumLaneSurface,
  setActiveDrumLaneMirror,
  setDrumLanePageMirror,
  setDrumPerformModeMirror,
  padDispatchMutedNow,
  updatePadNoteMap,
} from "@overture-ui/pad/ui_pad_surface.mjs";
// drumVelZoneToVelocity moved to core/ui_constants (pure primitive; keeps core a leaf).
import { drumVelZoneToVelocity } from "@overture-ui/core/ui_constants.mjs";

function baseState() {
  return {
    activeTrack: 0,
    trackPadMode: [0],
    activeDrumLane: [0],
    drumPerformMode: [0],
    drumLanePage: [0],
    drumLaneNote: [Array.from({ length: 32 }, (_, i) => 36 + i)],
    moveCoRunTrack: -1,
    xposePrevKey: null,
    xposePrevScale: null,
    padKey: 0,
    padScale: 0,
    padOctave: [3],
    padLayoutChromatic: [false],
    padScaleSet: new Set<number>(),
    padNoteMap: new Array(32).fill(0),
    trackOctave: [0],
    sessionView: false,
    shiftHeld: false,
    deleteHeld: false,
    muteHeld: false,
    copyHeld: false,
    captureHeld: false,
    loopHeld: false,
    tapTempoOpen: false,
    activeBank: 0,
    knobTouched: -1,
    bankParams: [[[0, 0, 0, 0, 0, 0]]],
    stepIntervalMode: false,
    globalMenuOpen: false,
    extSendAsyncEnabled: false,
    dspInboundEnabled: false,
    lastPushedMuted: null,
  };
}

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    fn(name: string) {
      return (...args: unknown[]) => log.push([name, ...args]);
    },
  };
}

const deps = {
  PAD_MODE_DRUM: 1,
  DRUM_LANES: 32,
  DRUM_BASE_NOTE: 36,
};

describe("pad surface", () => {
  test("pad runtime state initializes pitch and press ticks as mutable 32-slot mirrors", () => {
    const runtime = createPadRuntimeState();

    expect(runtime.padPitch).toEqual(new Array(32).fill(-1));
    expect(runtime.padPressTick).toEqual(new Array(32).fill(-1));

    runtime.padPitch[4] = 60;
    runtime.padPressTick[4] = 123;

    expect(runtime.padPitch[4]).toBe(60);
    expect(runtime.padPressTick[4]).toBe(123);
  });

  test("drum pad geometry maps left-half pads to paged lanes", () => {
    expect(drumPadToLane(0, 0)).toBe(0);
    expect(drumPadToLane(3, 0)).toBe(3);
    expect(drumPadToLane(8, 0)).toBe(4);
    expect(drumPadToLane(24, 0)).toBe(12);
    expect(drumPadToLane(31, 0)).toBe(-1);

    expect(drumPadToLane(0, 1)).toBe(16);
    expect(drumPadToLane(10, 1)).toBe(22);
    expect(drumPadToLane(12, 1)).toBe(-1);
  });

  test("drum pad geometry maps right-half pads to velocity zones", () => {
    expect(drumPadToVelZone(0)).toBe(-1);
    expect(drumPadToVelZone(3)).toBe(-1);
    expect(drumPadToVelZone(4)).toBe(0);
    expect(drumPadToVelZone(7)).toBe(3);
    expect(drumPadToVelZone(12)).toBe(4);
    expect(drumPadToVelZone(31)).toBe(15);
  });

  test("drum velocity zones map evenly across MIDI velocity range", () => {
    expect(drumVelZoneToVelocity(0)).toBe(8);
    expect(drumVelZoneToVelocity(7)).toBe(64);
    expect(drumVelZoneToVelocity(8)).toBe(71);
    expect(drumVelZoneToVelocity(15)).toBe(127);
  });

  test("drum pad target classification combines lane validity and velocity-zone velocity", () => {
    expect(resolveDrumPadTarget(0, 0, 32)).toEqual({ kind: "lane", lane: 0 });
    expect(resolveDrumPadTarget(10, 1, 32)).toEqual({ kind: "lane", lane: 22 });
    expect(resolveDrumPadTarget(10, 2, 32)).toEqual({ kind: "none" });
    expect(resolveDrumPadTarget(4, 2, 32)).toEqual({ kind: "velocity", zone: 0, velocity: 8 });
    expect(resolveDrumPadTarget(31, 2, 32)).toEqual({ kind: "velocity", zone: 15, velocity: 127 });
  });

  test("drum lane surface selection syncs lane state in order", () => {
    const c = calls();

    selectDrumLaneSurface({
      setActiveDrumLane: c.fn("setActive"),
      syncDrumLaneSteps: c.fn("syncSteps"),
      refreshDrumLaneBankParams: c.fn("refreshBank"),
    }, 2, 9);

    expect(c.log).toEqual([
      ["setActive", 2, 9],
      ["syncSteps", 2, 9],
      ["refreshBank", 2, 9],
    ]);
  });

  test("capture drum lane press silently selects a lane and marks capture modifier use", () => {
    const c = calls();
    const S = { captureUsedAsModifier: false };
    const padPitch = new Array(32).fill(-1);

    expect(handleCaptureDrumLanePress(S, {
      setActiveDrumLane: c.fn("setActive"),
      syncDrumLaneSteps: c.fn("syncSteps"),
      refreshDrumLaneBankParams: c.fn("refreshBank"),
      forceRedraw: c.fn("redraw"),
      padPitch,
    }, 3, 10, { kind: "lane", lane: 6 })).toBe(true);

    expect(S.captureUsedAsModifier).toBe(true);
    expect(padPitch[10]).toBe(0xff);
    expect(c.log).toEqual([
      ["setActive", 3, 6],
      ["syncSteps", 3, 6],
      ["refreshBank", 3, 6],
      ["redraw"],
    ]);
  });

  test("capture drum lane press ignores non-lane targets", () => {
    const c = calls();
    const S = { captureUsedAsModifier: false };
    const padPitch = new Array(32).fill(-1);

    expect(handleCaptureDrumLanePress(S, {
      setActiveDrumLane: c.fn("setActive"),
      syncDrumLaneSteps: c.fn("syncSteps"),
      refreshDrumLaneBankParams: c.fn("refreshBank"),
      forceRedraw: c.fn("redraw"),
      padPitch,
    }, 3, 10, { kind: "velocity", zone: 3, velocity: 32 })).toBe(false);

    expect(S.captureUsedAsModifier).toBe(false);
    expect(padPitch[10]).toBe(-1);
    expect(c.log).toEqual([]);
  });

  test("drum velocity-pad press previews the active lane note and marks pad state", () => {
    const c = calls();
    const S = {
      activeDrumLane: [2],
      drumLaneNote: [[36, 37, 42]],
      drumLastVelZone: [0],
      drumVelZoneArmed: [false],
      tickCount: 123,
      liveActiveNotes: new Set<number>(),
      heldStep: -1,
      heldStepNotes: [],
      stepBtnPressedTick: new Array(16).fill(0),
      recordArmed: false,
      recordCountingIn: false,
      recordArmedTrack: -1,
      pendingDrumLaneResync: 0,
      pendingDrumLaneResyncTrack: -1,
      pendingDrumLaneResyncLane: -1,
      screenDirty: false,
    };
    const padPitch = new Array(32).fill(-1);
    const padPressTick = new Array(32).fill(-1);
    const drumRecNoteOns: Array<{ track: number; laneNote: number; vel: number }> = [];

    expect(handleDrumVelocityPadPress(S, {
      liveSendNote: c.fn("live"),
      stepEntryVelocity: c.fn("stepEntryVelocity"),
      host_module_set_param: c.fn("set"),
      padPitch,
      padPressTick,
      drumRecNoteOns,
    }, 0, 4, { kind: "velocity", zone: 7, velocity: 64 })).toBe(true);

    expect(S.drumLastVelZone[0]).toBe(7);
    expect(S.drumVelZoneArmed[0]).toBe(true);
    expect(S.liveActiveNotes.has(42)).toBe(true);
    expect(S.screenDirty).toBe(true);
    expect(padPitch[4]).toBe(42);
    expect(padPressTick[4]).toBe(123);
    expect(drumRecNoteOns).toEqual([]);
    expect(c.log).toEqual([["live", 0, 0x90, 42, 64, true]]);
  });

  test("drum velocity-pad press writes held-step velocity and queues armed recording resync", () => {
    const c = calls();
    const S = {
      activeDrumLane: [1],
      drumLaneNote: [[36, 45]],
      drumLastVelZone: [0],
      drumVelZoneArmed: [false],
      tickCount: 200,
      liveActiveNotes: new Set<number>(),
      heldStep: 9,
      heldStepBtn: 3,
      heldStepNotes: [45],
      stepEditVel: 0,
      stepBtnPressedTick: new Array(16).fill(12),
      recordArmed: true,
      recordCountingIn: false,
      recordArmedTrack: 0,
      pendingDrumLaneResync: 0,
      pendingDrumLaneResyncTrack: -1,
      pendingDrumLaneResyncLane: -1,
      screenDirty: false,
    };
    const padPitch = new Array(32).fill(-1);
    const padPressTick = new Array(32).fill(-1);
    const drumRecNoteOns: Array<{ track: number; laneNote: number; vel: number }> = [];

    handleDrumVelocityPadPress(S, {
      liveSendNote: c.fn("live"),
      stepEntryVelocity: () => 111,
      host_module_set_param: c.fn("set"),
      padPitch,
      padPressTick,
      drumRecNoteOns,
    }, 0, 31, { kind: "velocity", zone: 15, velocity: 127 });

    expect(S.stepEditVel).toBe(111);
    expect(S.stepBtnPressedTick[3]).toBe(-1);
    expect(S.pendingDrumLaneResync).toBe(3);
    expect(S.pendingDrumLaneResyncTrack).toBe(0);
    expect(S.pendingDrumLaneResyncLane).toBe(1);
    expect(drumRecNoteOns).toEqual([{ track: 0, laneNote: 45, vel: 15 }]);
    expect(c.log).toEqual([
      ["live", 0, 0x90, 45, 127, true],
      ["set", "t0_l1_step_9_vel", "111"],
    ]);
  });

  test("drum lane-pad press in Move co-run selects and syncs without live preview", () => {
    const c = calls();
    const S = {
      moveCoRunTrack: 0,
    };
    const padPitch = new Array(32).fill(-1);
    const padPressTick = new Array(32).fill(-1);
    const drumRecNoteOns: Array<{ track: number; laneNote: number; vel: number }> = [];

    expect(handleDrumLanePadPress(S, {
      setActiveDrumLane: c.fn("setActive"),
      syncDrumLaneSteps: c.fn("syncSteps"),
      refreshDrumLaneBankParams: c.fn("refreshBank"),
      effectiveVelocity: c.fn("effectiveVelocity"),
      liveSendNote: c.fn("live"),
      host_module_set_param: c.fn("set"),
      forceRedraw: c.fn("redraw"),
      padPitch,
      padPressTick,
      drumRecNoteOns,
    }, 0, 12, 90, { kind: "lane", lane: 4 })).toBe(true);

    expect(padPitch[12]).toBe(0xff);
    expect(padPressTick[12]).toBe(-1);
    expect(drumRecNoteOns).toEqual([]);
    expect(c.log).toEqual([
      ["setActive", 0, 4],
      ["syncSteps", 0, 4],
      ["refreshBank", 0, 4],
      ["redraw"],
    ]);
  });

  test("drum lane-pad press previews, records, and sends stock repeat-lane fallback", () => {
    const c = calls();
    const S = {
      moveCoRunTrack: -1,
      drumLaneNote: [[36, 47]],
      tickCount: 77,
      liveActiveNotes: new Set<number>(),
      recordArmed: true,
      recordCountingIn: false,
      recordArmedTrack: 0,
      trackVelOverride: [99],
      pendingDrumLaneResync: 0,
      pendingDrumLaneResyncTrack: -1,
      pendingDrumLaneResyncLane: -1,
      drumPerformMode: [1],
      drumRepeatHeldPad: [6],
      drumRepeatLatched: [false],
      dspInboundEnabled: false,
    };
    const padPitch = new Array(32).fill(-1);
    const padPressTick = new Array(32).fill(-1);
    const drumRecNoteOns: Array<{ track: number; laneNote: number; vel: number }> = [];

    handleDrumLanePadPress(S, {
      setActiveDrumLane: c.fn("setActive"),
      syncDrumLaneSteps: c.fn("syncSteps"),
      refreshDrumLaneBankParams: c.fn("refreshBank"),
      effectiveVelocity: () => 80,
      liveSendNote: c.fn("live"),
      host_module_set_param: c.fn("set"),
      forceRedraw: c.fn("redraw"),
      padPitch,
      padPressTick,
      drumRecNoteOns,
    }, 0, 8, 90, { kind: "lane", lane: 1 });

    expect(padPitch[8]).toBe(47);
    expect(padPressTick[8]).toBe(77);
    expect(S.liveActiveNotes.has(47)).toBe(true);
    expect(S.pendingDrumLaneResync).toBe(3);
    expect(S.pendingDrumLaneResyncTrack).toBe(0);
    expect(S.pendingDrumLaneResyncLane).toBe(1);
    expect(drumRecNoteOns).toEqual([{ track: 0, laneNote: 47, vel: 99 }]);
    expect(c.log).toEqual([
      ["setActive", 0, 1],
      ["syncSteps", 0, 1],
      ["refreshBank", 0, 1],
      ["live", 0, 0x90, 47, 80],
      ["set", "t0_drum_repeat_lane", "1"],
      ["redraw"],
    ]);
  });

  test("drum lane-pad press during count-in captures a pre-roll note", () => {
    const c = calls();
    const S = {
      moveCoRunTrack: -1,
      drumLaneNote: [[36]],
      tickCount: 30,
      countInStartTick: 20,
      liveActiveNotes: new Set<number>(),
      recordArmed: true,
      recordCountingIn: true,
      recordArmedTrack: 0,
      trackVelOverride: [0],
      pendingPrerollNote: null,
      drumPerformMode: [0],
      drumRepeatHeldPad: [-1],
      drumRepeatLatched: [false],
      dspInboundEnabled: false,
    };
    const padPitch = new Array(32).fill(-1);
    const padPressTick = new Array(32).fill(-1);
    const drumRecNoteOns: Array<{ track: number; laneNote: number; vel: number }> = [];

    handleDrumLanePadPress(S, {
      setActiveDrumLane: c.fn("setActive"),
      syncDrumLaneSteps: c.fn("syncSteps"),
      refreshDrumLaneBankParams: c.fn("refreshBank"),
      effectiveVelocity: () => 73,
      liveSendNote: c.fn("live"),
      host_module_set_param: c.fn("set"),
      forceRedraw: c.fn("redraw"),
      padPitch,
      padPressTick,
      drumRecNoteOns,
    }, 0, 0, 90, { kind: "lane", lane: 0 });

    expect(drumRecNoteOns).toEqual([]);
    expect(S.pendingPrerollNote).toEqual({
      track: 0,
      lane: 0,
      laneNote: 36,
      vel: 73,
      isDrum: true,
      pressedAtTick: 30,
      countInStart: 20,
    });
  });

  test("live note queues are track-scoped and preserve event shape", () => {
    const queues = createLiveNoteQueues(2);

    queueLiveNoteOn(queues, 1, 64, 99);
    queueLiveNoteOff(queues, 1, 64);
    queueLiveNoteOn(queues, 0, 36, 110);

    expect(queues[0]).toEqual([{ isOff: false, pitch: 36, vel: 110 }]);
    expect(queues[1]).toEqual([
      { isOff: false, pitch: 64, vel: 99 },
      { isOff: true, pitch: 64 },
    ]);
  });

  test("drum pad map uses lane notes on the left half and sentinels for velocity zones", () => {
    const S = baseState();
    S.trackPadMode[0] = 1;
    S.drumLaneNote[0][0] = 48;

    updatePadNoteMap(S, deps);

    expect(S.padNoteMap.slice(0, 8)).toEqual([48, 37, 38, 39, 0xff, 0xff, 0xff, 0xff]);
    expect(S.padNoteMap[8]).toBe(40);
  });

  test("drum pad map mutes lane pads during Move-native co-run", () => {
    const S = baseState();
    S.trackPadMode[0] = 1;
    S.moveCoRunTrack = 0;

    updatePadNoteMap(S, deps);

    expect(S.padNoteMap).toEqual(new Array(32).fill(0xff));
  });

  test("melodic scale map records scale pitch classes and marks out-of-range pads", () => {
    const S = baseState();
    S.padOctave[0] = 10;
    S.padKey = 0;
    S.padScale = 0;

    updatePadNoteMap(S, deps);

    expect(S.padScaleSet.has(0)).toBe(true);
    expect(S.padScaleSet.has(1)).toBe(false);
    expect(S.padNoteMap[0]).toBe(120);
    expect(S.padNoteMap[1]).toBe(122);
    expect(S.padNoteMap[24]).toBe(0xff);
  });

  test("DSP padmap payload bakes track octave and appends capability flags", () => {
    const S = baseState();
    S.padOctave[0] = 3;
    S.trackOctave[0] = 1;
    S.extSendAsyncEnabled = true;
    S.deleteHeld = true;
    updatePadNoteMap(S, deps);

    const payload = buildDspPadMapPayload(S, deps, false);
    const parts = payload.split(" ").map(Number);

    expect(parts[0]).toBe(48);
    expect(parts[1]).toBe(50);
    expect(parts).toHaveLength(35);
    expect(parts.slice(-3)).toEqual([1, 0, 1]);
  });

  test("DSP padmap payload mutes every pad in session view while modal dispatch is muted", () => {
    const S = baseState();
    S.sessionView = true;
    updatePadNoteMap(S, deps);

    const payload = buildDspPadMapPayload(S, deps, true);
    const parts = payload.split(" ").map(Number);

    expect(parts.slice(0, 32)).toEqual(new Array(32).fill(0xff));
    expect(parts.slice(-3)).toEqual([0, 1, 0]);
  });

  test("pad dispatch mute policy suppresses modal pad owners", () => {
    for (const key of ["sessionView", "shiftHeld", "deleteHeld", "muteHeld", "copyHeld", "captureHeld", "loopHeld", "tapTempoOpen"] as const) {
      const S = baseState();
      S[key] = true;
      expect(padDispatchMutedNow(S), key).toBe(true);
    }
  });

  test("pad dispatch mute policy suppresses Arp Steps pad editors", () => {
    const touched = baseState();
    touched.activeBank = 4;
    touched.knobTouched = 4;
    touched.bankParams[0][4] = [0, 0, 0, 0, 2, 0];

    const overlay = baseState();
    overlay.activeBank = 5;
    overlay.stepIntervalMode = true;

    expect(padDispatchMutedNow(touched)).toBe(true);
    expect(padDispatchMutedNow(overlay)).toBe(true);
  });

  test("pad dispatch mute policy leaves global menu playable in Track View", () => {
    const S = baseState();
    S.globalMenuOpen = true;

    expect(padDispatchMutedNow(S)).toBe(false);
  });

  test("compute pad note map is a stock Schwung no-op for DSP push", () => {
    const S = baseState();
    const c = calls();

    computePadNoteMap(S, {
      ...deps,
      host_module_set_param: c.fn("setParam"),
    });

    expect(S.padNoteMap[0]).toBe(36);
    expect(c.log).toEqual([]);
    expect(S.lastPushedMuted).toBe(null);
  });

  test("compute pad note map pushes patched Schwung payload with mute policy flag", () => {
    const S = baseState();
    const c = calls();
    S.dspInboundEnabled = true;
    S.sessionView = true;

    computePadNoteMap(S, {
      ...deps,
      host_module_set_param: c.fn("setParam"),
    });

    expect(c.log).toHaveLength(1);
    expect(c.log[0][0]).toBe("setParam");
    expect(c.log[0][1]).toBe("t0_padmap");
    expect(String(c.log[0][2]).split(" ").map(Number).slice(0, 32)).toEqual(new Array(32).fill(0xff));
    expect(String(c.log[0][2]).split(" ").map(Number).slice(-3)).toEqual([0, 1, 0]);
    expect(S.lastPushedMuted).toBe(true);
  });

  test("pad surface runtime computes pad map and reports dispatch mute through pad policy", () => {
    const S = baseState();
    const c = calls();
    S.dspInboundEnabled = true;
    S.sessionView = true;

    const runtime = createPadSurfaceRuntime(S, {
      ...deps,
      optionalHostModuleSetParam: () => c.fn("setParam"),
    });

    runtime.computePadNoteMap();

    expect(runtime.padDispatchMuted()).toBe(true);
    expect(c.log).toHaveLength(1);
    expect(c.log[0][0]).toBe("setParam");
    expect(c.log[0][1]).toBe("t0_padmap");
    expect(String(c.log[0][2]).split(" ").map(Number).slice(0, 32)).toEqual(new Array(32).fill(0xff));
    expect(S.lastPushedMuted).toBe(true);
  });

  test("active drum lane mirror setter updates JS mirror before DSP push", () => {
    const S = baseState();
    const c = calls();

    setActiveDrumLaneMirror(S, {
      host_module_set_param: (key: string, val: string) => c.log.push(["setParam", key, val, S.activeDrumLane[0]]),
    }, 0, 7);

    expect(S.activeDrumLane[0]).toBe(7);
    expect(c.log).toEqual([["setParam", "t0_active_drum_lane", "7", 7]]);
  });

  test("active drum lane mirror setter skips no-op writes and tolerates stock host", () => {
    const S = baseState();
    const c = calls();

    setActiveDrumLaneMirror(S, { host_module_set_param: c.fn("setParam") }, 0, 0);
    setActiveDrumLaneMirror(S, { host_module_set_param: null }, 0, 3);

    expect(S.activeDrumLane[0]).toBe(3);
    expect(c.log).toEqual([]);
  });

  test("drum perform mode mirror setter updates JS mirror before DSP push", () => {
    const S = baseState();
    const c = calls();

    setDrumPerformModeMirror(S, {
      host_module_set_param: (key: string, val: string) => c.log.push(["setParam", key, val, S.drumPerformMode[0]]),
    }, 0, 2);

    expect(S.drumPerformMode[0]).toBe(2);
    expect(c.log).toEqual([["setParam", "t0_drum_perform_mode", "2", 2]]);
  });

  test("drum lane page mirror setter updates JS mirror before DSP push", () => {
    const S = baseState();
    const c = calls();

    setDrumLanePageMirror(S, {
      host_module_set_param: (key: string, val: string) => c.log.push(["setParam", key, val, S.drumLanePage[0]]),
    }, 0, 1);

    expect(S.drumLanePage[0]).toBe(1);
    expect(c.log).toEqual([["setParam", "t0_drum_lane_page", "1", 1]]);
  });

  test("pad surface runtime exposes drum mirror setters through optional host setter", () => {
    const S = baseState();
    const c = calls();
    const runtime = createPadSurfaceRuntime(S, {
      ...deps,
      optionalHostModuleSetParam: () => c.fn("setParam"),
    });

    runtime.setActiveDrumLane(0, 5);
    runtime.setDrumPerformMode(0, 1);
    runtime.setDrumLanePage(0, 1);

    expect(S.activeDrumLane[0]).toBe(5);
    expect(S.drumPerformMode[0]).toBe(1);
    expect(S.drumLanePage[0]).toBe(1);
    expect(c.log).toEqual([
      ["setParam", "t0_active_drum_lane", "5"],
      ["setParam", "t0_drum_perform_mode", "1"],
      ["setParam", "t0_drum_lane_page", "1"],
    ]);
  });
});
