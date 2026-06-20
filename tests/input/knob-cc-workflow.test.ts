import { describe, expect, test } from "vitest";
import {
  handleUiKnobAltDelayClockFb,
  handleUiKnobAltRandomMode,
  handleUiKnobCcParam,
  handleUiKnobDrumAllLanes,
  handleUiKnobDrumClip,
  handleUiKnobDrumNoteFX,
  handleUiKnobDrumRepeatGroove,
  handleUiKnobGeneric,
  handleUiKnobMelodicInQ,
  handleUiKnobOverlaySwallow,
  handleUiKnobSchwungSoundPage,
  handleUiKnobStepInterval,
} from "@overture-ui/input/ui_knob_cc_workflow.mjs";

const DRUM = 1;
const STRETCH_BLOCKED_TICKS = 294;
const TPS_VALUES = [12, 24, 48, 96, 192, 384];

// CC for knob N (0-7) is 71+N. d2 1-63 = CW (+1), 64-127 = CCW (-1).
const CW = 10;
const CCW = 100;
const cc = (knob: number) => 71 + knob;

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    fn(name: string) {
      return (...args: unknown[]) => log.push([name, ...args]);
    },
  };
}

// 2 tracks (0 = drum, 1 = melodic), 2 clips, 2 lanes, 8 knobs, 8 banks.
function grid(t: number, fill: () => unknown) {
  return Array.from({ length: t }, fill);
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    // overlay swallow
    heldStep: -1,
    globalMenuOpen: false,
    tapTempoOpen: false,
    confirmBake: false,
    confirmClearSession: false,
    confirmConvertToDrum: false,
    confirmExport: false,
    exportDoneDialog: false,
    recordBlockedDialog: false,
    confirmStateWipe: false,
    // bookkeeping
    knobTouched: -1,
    knobTurnedTick: [0, 0, 0, 0, 0, 0, 0, 0],
    tickCount: 100,
    screenDirty: false,
    activeBank: 0,
    activeTrack: 1,
    knobLastDir: [1, 1, 1, 1, 1, 1, 1, 1],
    knobAccum: [0, 0, 0, 0, 0, 0, 0, 0],
    knobLocked: [false, false, false, false, false, false, false, false],
    altMode: false,
    // track mode
    trackPadMode: [DRUM, 0], // track 0 drum, track 1 melodic
    activeDrumLane: [0, 0],
    // step interval
    stepIntervalMode: false,
    seqArpStepInt: grid(2, () => grid(2, () => [0, 0, 0, 0, 0, 0, 0, 0])),
    tarpStepInt: grid(2, () => [0, 0, 0, 0, 0, 0, 0, 0]),
    // bank params [t][bank][knob]
    bankParams: grid(2, () => grid(8, () => [0, 0, 0, 0, 0, 0, 0, 0])),
    // drum clip
    drumLaneTPS: [48, 48],
    drumLaneLength: [16, 16],
    drumStepPage: [0, 0],
    drumLaneEuclidN: grid(2, () => [0, 0]),
    drumLanePlaybackAudioReverse: grid(2, () => [0, 0]),
    drumLanePlaybackDir: grid(2, () => [0, 0]),
    clipSeqFollow: grid(2, () => [false, false]),
    stretchBlockedEndTick: 0,
    pendingDrumLaneResync: 0,
    pendingDrumLaneResyncTrack: -1,
    pendingDrumLaneResyncLane: -1,
    pendingDrumResync: 0,
    pendingDrumResyncTrack: -1,
    clockShiftTouchDelta: 0,
    confirmLgto: false,
    confirmLgtoSel: -1,
    confirmLgtoIsDrum: false,
    // all lanes
    allLanesConfirmed: true,
    pendingAllLanesStretchCheck: -1,
    drumLaneQnt: [0, 0],
    trackVelOverride: [100, 100],
    drumInpQuant: [0, 0],
    // drum note fx
    drumLaneNote: grid(2, () => [36, 38]),
    drumLaneLenMode: grid(2, () => [4, 4]),
    // cc param
    ccActiveLane: [0, 0],
    trackCCType: grid(2, () => [0, 0, 0, 0, 0, 0, 0, 0]),
    trackCCAssign: grid(2, () => [0, 0, 0, 0, 0, 0, 0, 0]),
    schLabel: grid(2, () => [null, null, null, null, null, null, null, null]),
    deleteHeld: false,
    trackCCAutoBits: grid(2, () => [0, 0]),
    trackCCLiveVal: grid(2, () => [-1, -1, -1, -1, -1, -1, -1, -1]),
    clipCCVal: grid(2, () => grid(2, () => [-1, -1, -1, -1, -1, -1, -1, -1])),
    recordArmed: false,
    recordCountingIn: false,
    recordArmedTrack: -1,
    playing: false,
    // alt random / delay
    midiDlyRandomMode: [0, 0],
    noteFXRandomMode: [0, 0],
    delayClockFb: [0, 0],
    // generic
    trackActiveClip: [0, 0],
    clipLength: grid(2, () => [16, 16]),
    clipSteps: grid(2, () => grid(2, () => Array(32).fill(0))),
    trackCurrentPage: [0, 0],
    clipTPS: grid(2, () => [48, 48]),
    clipPlaybackAudioReverse: grid(2, () => [0, 0]),
    lastTarpStyle: [0, 0],
    ...overrides,
  };
}

function banks() {
  // All-stub by default; tests poke a specific knob with a real pm.
  return Array.from({ length: 8 }, () => ({
    knobs: Array.from({ length: 8 }, () => null as unknown),
  }));
}

function deps(c: ReturnType<typeof calls>, overrides: Record<string, unknown> = {}) {
  return {
    padModeDrum: DRUM,
    tpsValues: TPS_VALUES,
    stretchBlockedTicks: STRETCH_BLOCKED_TICKS,
    banks: banks(),
    setParam: c.fn("setParam"),
    getParam: (_k: string) => "0",
    hasShadowSetParam: false,
    effectiveClip: (_t: number) => 0,
    forceRedraw: c.fn("redraw"),
    showActionPopup: c.fn("popup"),
    invalidateLEDCache: c.fn("ledInvalidate"),
    computePadNoteMap: c.fn("padmap"),
    applyBankParam: c.fn("applyBankParam"),
    applyTrackConfig: c.fn("applyTrackConfig"),
    refreshPerClipBankParams: c.fn("refreshClipParams"),
    stepEntryVelocity: (_t: number, _v: number, _z: boolean) => 100,
    ccKnobDelta: (_d2: number, _k: number) => 1,
    decodeDelta: (d2: number) => (d2 >= 1 && d2 <= 63 ? d2 : d2 >= 65 && d2 <= 127 ? -(128 - d2) : 0),
    editDrumRepeatGrooveStep: c.fn("grooveStep"),
    adjustSchwungSoundVisibleParam: c.fn("adjustSoundParam"),
    ...overrides,
  };
}

describe("Knob CC workflow - Schwung Sound page", () => {
  test("K1-K8 adjust the active Sound detail encoder bank", () => {
    const c = calls();
    const S = state({ schwungSoundPage: { paramDetail: true } });
    expect(handleUiKnobSchwungSoundPage(S, deps(c), cc(7), CW)).toBe(true);
    expect(c.log).toEqual([["adjustSoundParam", 7, 10], ["redraw"]]);
  });

  test("K3 is routed as the third Sound detail encoder", () => {
    const c = calls();
    const S = state({ schwungSoundPage: { paramDetail: true } });
    expect(handleUiKnobSchwungSoundPage(S, deps(c), cc(2), 127)).toBe(true);
    expect(c.log).toEqual([["adjustSoundParam", 2, -1], ["redraw"]]);
  });

  test("uses Schwung relative encoder decoding for batched K3 turns", () => {
    const c = calls();
    const S = state({ schwungSoundPage: { paramDetail: true } });
    expect(handleUiKnobSchwungSoundPage(S, deps(c), cc(2), 100)).toBe(true);
    expect(c.log).toEqual([["adjustSoundParam", 2, -28], ["redraw"]]);
  });

  test("falls through outside Sound detail", () => {
    const c = calls();
    expect(handleUiKnobSchwungSoundPage(state(), deps(c), cc(3), CW)).toBe(false);
  });
});

describe("Knob CC workflow - overlay swallow", () => {
  test("ignores CCs outside 71-78", () => {
    const c = calls();
    expect(handleUiKnobOverlaySwallow(state(), deps(c), 70, CW)).toBe(false);
    expect(handleUiKnobOverlaySwallow(state(), deps(c), 79, CW)).toBe(false);
  });

  test("swallows knob turns while a step is held", () => {
    const c = calls();
    expect(handleUiKnobOverlaySwallow(state({ heldStep: 4 }), deps(c), cc(0), CW)).toBe(true);
  });

  test("swallows knob turns while an exclusive dialog is open", () => {
    const dialogs = [
      "globalMenuOpen",
      "tapTempoOpen",
      "confirmBake",
      "confirmClearSession",
      "confirmConvertToDrum",
      "confirmExport",
      "exportDoneDialog",
      "recordBlockedDialog",
      "confirmStateWipe",
    ];
    for (const flag of dialogs) {
      const c = calls();
      expect(handleUiKnobOverlaySwallow(state({ [flag]: true }), deps(c), cc(3), CW)).toBe(true);
    }
  });

  test("passes through when nothing is blocking", () => {
    const c = calls();
    expect(handleUiKnobOverlaySwallow(state(), deps(c), cc(0), CW)).toBe(false);
    expect(c.log).toEqual([]);
  });
});

describe("Knob CC workflow - step interval", () => {
  test("ignores when not in step-interval mode", () => {
    const c = calls();
    expect(
      handleUiKnobStepInterval(state({ activeBank: 4, stepIntervalMode: false }), deps(c), cc(0), CW),
    ).toBe(false);
  });

  test("ignores banks other than 4 and 5 even in step-interval mode", () => {
    const c = calls();
    expect(
      handleUiKnobStepInterval(state({ activeBank: 0, stepIntervalMode: true }), deps(c), cc(0), CW),
    ).toBe(false);
  });

  test("bank 4 (SEQ ARP) bumps the per-clip step interval and pushes seq_arp_step_int", () => {
    const c = calls();
    const S = state({ activeBank: 4, stepIntervalMode: true, activeTrack: 1, knobAccum: [1, 0, 0, 0, 0, 0, 0, 0] });

    expect(handleUiKnobStepInterval(S, deps(c), cc(0), CW)).toBe(true);

    expect(S.seqArpStepInt[1][0][0]).toBe(1);
    expect(S.knobAccum[0]).toBe(0);
    expect(c.log).toEqual([["setParam", "t1_seq_arp_step_int", "0 1"]]);
  });

  test("bank 5 (TARP) bumps the per-track step interval and pushes tarp_step_int", () => {
    const c = calls();
    const S = state({ activeBank: 5, stepIntervalMode: true, activeTrack: 1, knobAccum: [1, 0, 0, 0, 0, 0, 0, 0], knobLastDir: [-1, 1, 1, 1, 1, 1, 1, 1] });

    expect(handleUiKnobStepInterval(S, deps(c), cc(0), CCW)).toBe(true);

    expect(S.tarpStepInt[1][0]).toBe(-1);
    expect(c.log).toEqual([["setParam", "t1_tarp_step_int", "0 -1"]]);
  });

  test("accumulates below sens=2 without firing", () => {
    const c = calls();
    const S = state({ activeBank: 4, stepIntervalMode: true, knobAccum: [0, 0, 0, 0, 0, 0, 0, 0] });

    expect(handleUiKnobStepInterval(S, deps(c), cc(0), CW)).toBe(true);

    expect(S.knobAccum[0]).toBe(1);
    expect(c.log).toEqual([]);
  });

  test("a direction change resets the accumulator", () => {
    const c = calls();
    const S = state({ activeBank: 4, stepIntervalMode: true, knobAccum: [1, 0, 0, 0, 0, 0, 0, 0], knobLastDir: [1, 1, 1, 1, 1, 1, 1, 1] });

    // turning CCW while last dir was CW resets accum to 0 then ++ = 1 (no fire)
    expect(handleUiKnobStepInterval(S, deps(c), cc(0), CCW)).toBe(true);

    expect(S.knobAccum[0]).toBe(1);
    expect(S.knobLastDir[0]).toBe(-1);
    expect(c.log).toEqual([]);
  });
});

describe("Knob CC workflow - drum CLIP bank", () => {
  test("ignores melodic tracks", () => {
    const c = calls();
    expect(handleUiKnobDrumClip(state({ activeTrack: 1, activeBank: 0 }), deps(c), cc(0), CW)).toBe(false);
  });

  test("ignores non-clip banks", () => {
    const c = calls();
    expect(handleUiKnobDrumClip(state({ activeTrack: 0, activeBank: 1 }), deps(c), cc(0), CW)).toBe(false);
  });

  test("knob 5 (K6) falls through to the generic handler", () => {
    const c = calls();
    expect(handleUiKnobDrumClip(state({ activeTrack: 0, activeBank: 0 }), deps(c), cc(5), CW)).toBe(false);
    expect(c.log).toEqual([]);
  });

  test("K1 (Res) steps resolution up and pushes clip_resolution", () => {
    const c = calls();
    const S = state({ activeTrack: 0, activeBank: 0, knobAccum: [15, 0, 0, 0, 0, 0, 0, 0] });

    expect(handleUiKnobDrumClip(S, deps(c), cc(0), CW)).toBe(true);

    // drumLaneTPS 48 = index 2 → +1 = index 3 = 96
    expect(S.drumLaneTPS[0]).toBe(96);
    expect(S.bankParams[0][0][0]).toBe(3);
    expect(S.pendingDrumResync).toBe(2);
    expect(c.log).toEqual([["setParam", "t0_l0_clip_resolution", "3"]]);
  });

  test("K2 (Stch) is swallowed while the knob is locked", () => {
    const c = calls();
    const S = state({ activeTrack: 0, activeBank: 0, knobLocked: [false, true, false, false, false, false, false, false] });

    expect(handleUiKnobDrumClip(S, deps(c), cc(1), CW)).toBe(true);
    expect(c.log).toEqual([]);
  });

  test("K4 (Lgto) right-turn opens the destructive drum confirm and locks the knob", () => {
    const c = calls();
    const S = state({ activeTrack: 0, activeBank: 0, knobAccum: [0, 0, 0, 15, 0, 0, 0, 0] });

    expect(handleUiKnobDrumClip(S, deps(c), cc(3), CW)).toBe(true);

    expect(S.confirmLgto).toBe(true);
    expect(S.confirmLgtoIsDrum).toBe(true);
    expect(S.knobLocked[3]).toBe(true);
    expect(c.log).toEqual([["redraw"]]);
  });

  test("K4 (Lgto) left-turn is a swallowed no-op", () => {
    const c = calls();
    const S = state({ activeTrack: 0, activeBank: 0, knobAccum: [0, 0, 0, 15, 0, 0, 0, 0] });

    expect(handleUiKnobDrumClip(S, deps(c), cc(3), CCW)).toBe(true);
    expect(S.confirmLgto).toBe(false);
    expect(c.log).toEqual([]);
  });
});

describe("Knob CC workflow - drum ALL LANES bank", () => {
  test("ignores melodic tracks and non-7 banks", () => {
    const c = calls();
    expect(handleUiKnobDrumAllLanes(state({ activeTrack: 1, activeBank: 7 }), deps(c), cc(0), CW)).toBe(false);
    expect(handleUiKnobDrumAllLanes(state({ activeTrack: 0, activeBank: 0 }), deps(c), cc(0), CW)).toBe(false);
  });

  test("swallows knob turns until the ALL LANES action is confirmed", () => {
    const c = calls();
    const S = state({ activeTrack: 0, activeBank: 7, allLanesConfirmed: false });

    expect(handleUiKnobDrumAllLanes(S, deps(c), cc(0), CW)).toBe(true);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([]);
  });

  test("K1 (Res) sets the absolute resolution on all lanes", () => {
    const c = calls();
    const S = state({ activeTrack: 0, activeBank: 7, knobAccum: [15, 0, 0, 0, 0, 0, 0, 0] });
    S.bankParams[0][7][0] = -1;

    expect(handleUiKnobDrumAllLanes(S, deps(c), cc(0), CW)).toBe(true);

    expect(S.bankParams[0][7][0]).toBe(0);
    expect(c.log).toEqual([["setParam", "t0_all_lanes_clip_resolution", "0"]]);
  });

  test("K5 (VelIn) routes through applyTrackConfig", () => {
    const c = calls();
    const S = state({ activeTrack: 0, activeBank: 7 });

    expect(handleUiKnobDrumAllLanes(S, deps(c), cc(4), CW)).toBe(true);

    expect(c.log).toEqual([["applyTrackConfig", 0, "track_vel_override", 101]]);
  });
});

describe("Knob CC workflow - drum NOTE FX bank", () => {
  test("ignores melodic tracks and non-1 banks", () => {
    const c = calls();
    expect(handleUiKnobDrumNoteFX(state({ activeTrack: 1, activeBank: 1 }), deps(c), cc(0), CW)).toBe(false);
  });

  test("knobs K7/K8 (idx >= 6) are blocked but consume the CC", () => {
    const c = calls();
    expect(handleUiKnobDrumNoteFX(state({ activeTrack: 0, activeBank: 1 }), deps(c), cc(6), CW)).toBe(true);
    expect(c.log).toEqual([]);
  });

  test("K1 (LaneOct) shifts the lane note by an octave and re-pushes the pad map", () => {
    const c = calls();
    const S = state({ activeTrack: 0, activeBank: 1, knobAccum: [15, 0, 0, 0, 0, 0, 0, 0] });

    expect(handleUiKnobDrumNoteFX(S, deps(c), cc(0), CW)).toBe(true);

    expect(S.drumLaneNote[0][0]).toBe(48); // 36 + 12
    expect(c.log).toEqual([
      ["setParam", "t0_l0_lane_note", "48"],
      ["padmap"],
    ]);
  });
});

describe("Knob CC workflow - drum REPEAT GROOVE bank", () => {
  test("ignores melodic tracks and non-5 banks", () => {
    const c = calls();
    expect(handleUiKnobDrumRepeatGroove(state({ activeTrack: 1, activeBank: 5 }), deps(c), cc(0), CW)).toBe(false);
  });

  test("fires editDrumRepeatGrooveStep once per sens=2 accumulation", () => {
    const c = calls();
    const S = state({ activeTrack: 0, activeBank: 5, knobAccum: [1, 0, 0, 0, 0, 0, 0, 0] });

    expect(handleUiKnobDrumRepeatGroove(S, deps(c), cc(0), CW)).toBe(true);

    // (track, lane, step, dir, altMode)
    expect(c.log).toEqual([["grooveStep", 0, 0, 0, 1, false]]);
  });
});

describe("Knob CC workflow - CC PARAM bank", () => {
  test("ignores non-6 banks", () => {
    const c = calls();
    expect(handleUiKnobCcParam(state({ activeBank: 0 }), deps(c), cc(0), CW)).toBe(false);
  });

  test("drum tracks swallow the CC (melodic-only bank)", () => {
    const c = calls();
    const S = state({ activeBank: 6, activeTrack: 0 });

    expect(handleUiKnobCcParam(S, deps(c), cc(0), CW)).toBe(true);
    expect(c.log).toEqual([]);
  });

  test("alt-turn walks the CC-number ladder and pushes cc_type_assign", () => {
    const c = calls();
    const S = state({ activeBank: 6, activeTrack: 1, altMode: true, knobAccum: [3, 0, 0, 0, 0, 0, 0, 0] });

    expect(handleUiKnobCcParam(S, deps(c), cc(0), CW)).toBe(true);

    expect(S.trackCCAssign[1][0]).toBe(1);
    expect(S.trackCCType[1][0]).toBe(0);
    expect(c.log).toEqual([["setParam", "t1_cc_type_assign", "0 0 1"]]);
  });

  test("delete-turn clears the lane's automation and resting value", () => {
    const c = calls();
    const S = state({ activeBank: 6, activeTrack: 1, deleteHeld: true });
    S.trackCCAutoBits[1][0] = 1;

    expect(handleUiKnobCcParam(S, deps(c), cc(0), CW)).toBe(true);

    expect(S.trackCCAutoBits[1][0]).toBe(0);
    expect(S.trackCCLiveVal[1][0]).toBe(-1);
    expect(S.clipCCVal[1][0][0]).toBe(-1);
    expect(c.log).toEqual([
      ["setParam", "t1_cc_auto_clear_k", "0 0"],
      ["popup", "CC", "CLEAR"],
      ["ledInvalidate"],
    ]);
  });

  test("armed-turn records automation via cc_send and sets the auto bit", () => {
    const c = calls();
    const S = state({
      activeBank: 6,
      activeTrack: 1,
      recordArmed: true,
      recordCountingIn: false,
      recordArmedTrack: 1,
    });

    expect(handleUiKnobCcParam(S, deps(c, { ccKnobDelta: () => 5 }), cc(0), CW)).toBe(true);

    expect(S.trackCCLiveVal[1][0]).toBe(5);
    expect(S.trackCCAutoBits[1][0]).toBe(1);
    expect(c.log).toEqual([["setParam", "t1_cc_send", "0 5"]]);
  });

  test("stopped un-armed turn sets the clip resting value via cc_rest", () => {
    const c = calls();
    const S = state({ activeBank: 6, activeTrack: 1 });

    expect(handleUiKnobCcParam(S, deps(c, { ccKnobDelta: () => 3 }), cc(0), CW)).toBe(true);

    // from "—" (-1), first up-step lands on accel-1 = 2
    expect(S.clipCCVal[1][0][0]).toBe(2);
    expect(S.trackCCLiveVal[1][0]).toBe(2);
    expect(c.log).toEqual([["setParam", "t1_cc_rest", "0 0 2"]]);
  });

  test("a zero accel delta is swallowed without a push", () => {
    const c = calls();
    const S = state({ activeBank: 6, activeTrack: 1 });

    expect(handleUiKnobCcParam(S, deps(c, { ccKnobDelta: () => 0 }), cc(0), CW)).toBe(true);
    expect(c.log).toEqual([]);
  });
});

describe("Knob CC workflow - alt random mode (K8 on NOTE FX / DELAY)", () => {
  test("ignores when not alt, or on drum tracks, or on other knobs", () => {
    const c = calls();
    expect(handleUiKnobAltRandomMode(state({ activeBank: 1, altMode: false }), deps(c), cc(7), CW)).toBe(false);
    expect(handleUiKnobAltRandomMode(state({ activeBank: 1, altMode: true, activeTrack: 0 }), deps(c), cc(7), CW)).toBe(false);
    expect(handleUiKnobAltRandomMode(state({ activeBank: 1, altMode: true }), deps(c), cc(6), CW)).toBe(false);
  });

  test("bank 1 cycles the note FX random algorithm", () => {
    const c = calls();
    const S = state({ activeBank: 1, altMode: true, activeTrack: 1, knobAccum: [0, 0, 0, 0, 0, 0, 0, 15] });

    expect(handleUiKnobAltRandomMode(S, deps(c), cc(7), CW)).toBe(true);

    expect(S.noteFXRandomMode[1]).toBe(1);
    expect(c.log).toEqual([["setParam", "noteFX_random_mode", "1"]]);
  });

  test("bank 3 cycles the MIDI delay random algorithm", () => {
    const c = calls();
    const S = state({ activeBank: 3, altMode: true, activeTrack: 1, knobAccum: [0, 0, 0, 0, 0, 0, 0, 15] });

    expect(handleUiKnobAltRandomMode(S, deps(c), cc(7), CW)).toBe(true);

    expect(S.midiDlyRandomMode[1]).toBe(1);
    expect(c.log).toEqual([["setParam", "delay_pitch_random_mode", "1"]]);
  });
});

describe("Knob CC workflow - alt delay clock feedback (K1 on DELAY)", () => {
  test("ignores when not alt, on drum tracks, or off bank 3 / knob 0", () => {
    const c = calls();
    expect(handleUiKnobAltDelayClockFb(state({ activeBank: 3, altMode: false }), deps(c), cc(0), CW)).toBe(false);
    expect(handleUiKnobAltDelayClockFb(state({ activeBank: 3, altMode: true, activeTrack: 0 }), deps(c), cc(0), CW)).toBe(false);
    expect(handleUiKnobAltDelayClockFb(state({ activeBank: 3, altMode: true }), deps(c), cc(1), CW)).toBe(false);
  });

  test("steps the clock-feedback mirror and pushes delay_clock_fb", () => {
    const c = calls();
    const S = state({ activeBank: 3, altMode: true, activeTrack: 1 });

    expect(handleUiKnobAltDelayClockFb(S, deps(c), cc(0), CW)).toBe(true);

    expect(S.delayClockFb[1]).toBe(1);
    expect(c.log).toEqual([["setParam", "t1_delay_clock_fb", "1"]]);
  });
});

describe("Knob CC workflow - melodic CLIP K6 (InQ)", () => {
  test("ignores drum tracks and other bank/knob combos", () => {
    const c = calls();
    expect(handleUiKnobMelodicInQ(state({ activeTrack: 0, activeBank: 0 }), deps(c), cc(4), CW)).toBe(false);
    expect(handleUiKnobMelodicInQ(state({ activeTrack: 1, activeBank: 1 }), deps(c), cc(4), CW)).toBe(false);
    expect(handleUiKnobMelodicInQ(state({ activeTrack: 1, activeBank: 0 }), deps(c), cc(0), CW)).toBe(false);
  });

  test("steps the per-track input quantize and pushes diq", () => {
    const c = calls();
    const S = state({ activeTrack: 1, activeBank: 0, knobAccum: [0, 0, 0, 0, 7, 0, 0, 0] });

    expect(handleUiKnobMelodicInQ(S, deps(c), cc(4), CW)).toBe(true);

    expect(S.drumInpQuant[1]).toBe(1);
    expect(S.bankParams[1][0][4]).toBe(1);
    expect(c.log).toEqual([["setParam", "t1_diq", "1"]]);
  });
});

describe("Knob CC workflow - generic bank param", () => {
  test("does nothing for a stub / absent pm", () => {
    const c = calls();
    const S = state({ activeTrack: 1, activeBank: 2 });
    handleUiKnobGeneric(S, deps(c), cc(0), CW);
    expect(c.log).toEqual([]);
  });

  test("applies a clamped delta via applyBankParam", () => {
    const c = calls();
    const b = banks();
    b[2].knobs[0] = { abbrev: "Cut", scope: "param", sens: 1, min: 0, max: 127, step: 1, dspKey: "cutoff" };
    const S = state({ activeTrack: 1, activeBank: 2 });

    handleUiKnobGeneric(S, deps(c, { banks: b }), cc(0), CW);

    expect(S.bankParams[1][2][0]).toBe(1);
    expect(c.log).toEqual([["applyBankParam", 1, 2, 0, 1]]);
  });

  test("an action-scope Lgto knob opens the melodic confirm on a right-turn", () => {
    const c = calls();
    const b = banks();
    b[2].knobs[7] = { abbrev: "Lgt", scope: "action", sens: 1, dspKey: "lgto_apply" };
    const S = state({ activeTrack: 1, activeBank: 2 });

    handleUiKnobGeneric(S, deps(c, { banks: b }), cc(7), CW);

    expect(S.confirmLgto).toBe(true);
    expect(S.confirmLgtoIsDrum).toBe(false);
    expect(S.knobLocked[7]).toBe(true);
    expect(c.log).toEqual([["redraw"]]);
  });

  test("a locked knob is ignored", () => {
    const c = calls();
    const b = banks();
    b[2].knobs[0] = { abbrev: "Cut", scope: "param", sens: 1, min: 0, max: 127, step: 1, dspKey: "cutoff" };
    const S = state({ activeTrack: 1, activeBank: 2, knobLocked: [true, false, false, false, false, false, false, false] });

    handleUiKnobGeneric(S, deps(c, { banks: b }), cc(0), CW);
    expect(c.log).toEqual([]);
  });
});
