import { describe, expect, test } from "vitest";
import {
  handleUiPadArpStepIntervalSeq,
  handleUiPadArpStepIntervalTarp,
  handleUiPadCoRunDrumInject,
  handleUiPadPerfMode,
  handleUiPadReleaseCoRunDrum,
  handleUiPadReleaseLoopStep,
  handleUiPadReleasePadNote,
  handleUiPadReleasePerfMode,
  handleUiPadReleaseSeqArpEditor,
  handleUiPadReleaseStepButton,
  handleUiPadReleaseTapTempo,
  handleUiPadReleaseTarpArpEditor,
  handleUiPadTapTempo,
  handleUiPadTrackViewCaptureDrumLane,
  handleUiPadTrackViewDrumLaneClear,
  handleUiPadTrackViewDrumLaneReset,
  handleUiPadTrackViewDrumOrMelodic,
  handleUiPadTrackViewDrumRepeat,
} from "@overture-ui/pad/ui_pad_workflow.mjs";

const DRUM = 1;
const PAD_BASE = 68; // TRACK_PAD_BASE
const NOTE_FX = 0x90;

// Grid pads are MIDI notes 68-99; step buttons 16-31.
function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    fn(name: string) {
      return (...args: unknown[]) => log.push([name, ...args]);
    },
  };
}

function grid<T>(n: number, fill: () => T): T[] {
  return Array.from({ length: n }, fill);
}

// 2 tracks (0 = drum, 1 = melodic), 2 clips, 8 banks.
function state(overrides: Record<string, unknown> = {}) {
  return {
    activeTrack: 1,
    activeBank: 0,
    trackPadMode: [DRUM, 0], // track 0 drum, track 1 melodic
    trackActiveBank: [0, 0],
    drumLanePage: [0, 0],
    trackOctave: [0, 0],
    screenDirty: false,
    tickCount: 100,
    bankSelectTick: 0,
    allLanesConfirmed: false,
    schLabelFetchLane: -1,
    // modifiers
    shiftHeld: false,
    deleteHeld: false,
    captureHeld: false,
    copyHeld: false,
    muteHeld: false,
    sessionView: false,
    loopHeld: false,
    heldStep: -1,
    // overlays
    stepIntervalMode: false,
    knobTouched: -1,
    // co-run
    moveCoRunTrack: -1,
    moveCoRunDrumHeld: -1,
    // tap tempo
    tapTempoOpen: false,
    // perf mode
    perfViewLocked: false,
    perfLatchMode: false,
    perfLatchPressedTick: -1,
    perfSync: false,
    perfHoldPadHeld: false,
    perfStickyLengths: new Set<number>(),
    perfStack: [] as Array<{ idx: number; ticks: number }>,
    perfModsToggled: 0,
    perfModsHeld: 0,
    perfModPopupName: "",
    perfModPopupEndTick: 0,
    // loop gesture / step buttons
    loopGestureStart: -1,
    stepOpTick: 0,
    // live note / record
    padNoteMap: Array.from({ length: 32 }, (_v, i) => 36 + i),
    liveActiveNotes: new Set<number>(),
    atLastSent: Array(32).fill(0),
    lastPlayedNote: -1,
    lastPadVelocity: 0,
    recordArmed: false,
    recordArmedTrack: -1,
    // preroll
    pendingPrerollNote: null as null | { laneNote: number; releasedAtTick: number },
    pendingPrerollNotes: [] as Array<{ pitch: number; releasedAtTick: number }>,
    // arp step editors
    seqArpStepLoopLen: grid(2, () => [0, 0]),
    seqArpStepVel: grid(2, () => grid(2, () => Array(8).fill(0))),
    tarpStepLoopLen: [0, 0],
    tarpStepVel: grid(2, () => Array(8).fill(0)),
    // bank params: [t][bank][k]
    bankParams: grid(2, () => grid(8, () => Array(8).fill(0))),
    ...overrides,
  };
}

function deps(c: ReturnType<typeof calls>, overrides: Record<string, unknown> = {}) {
  return {
    // constants
    padModeDrum: DRUM,
    trackPadBase: PAD_BASE,
    drumLanes: 32,
    numTracks: 8,
    banks: Array.from({ length: 8 }, () => ({})),
    looperRatesStraight: [12, 24, 48, 96, 192],
    perfModPadMap: { 76: 0, 77: 1, 92: 16 } as Record<number, number>,
    perfModFullNames: ["Octave Up", "Octave Down"],
    perfModPopupTicks: 80,
    drumTapTicks: 10,
    // host
    setParam: c.fn("setParam"),
    injectToMove: c.fn("inject"),
    // module-global arrays (mutated by reference)
    padPitch: Array(32).fill(-1),
    padPressTick: Array(32).fill(-1),
    pendingDrumNoteOffs: grid(2, () => [] as number[]),
    drumRecNoteOffs: [] as Array<{ track: number; laneNote: number }>,
    // helpers
    drumPadToLane: (padIdx: number) => padIdx,
    resolveDrumPadTarget: (_p: number, _pg: number, _dl: number) =>
      ({ kind: "lane", lane: 2 }) as { kind: string; lane?: number; zone?: number },
    effectiveVelocity: (raw: number) => raw,
    stepEntryVelocity: (_t: number, vel: number, _z: boolean) => vel,
    effectiveClip: (_t: number) => 0,
    liveSendNote: c.fn("liveSend"),
    recordNoteOn: c.fn("recOn"),
    recordNoteOff: c.fn("recOff"),
    registerTapTempo: c.fn("tapTempo"),
    selectTrackGesture: c.fn("selectTrack"),
    readBankParams: c.fn("readBank"),
    writeSidecar: c.fn("writeSidecar"),
    sendPerfMods: c.fn("sendPerfMods"),
    forceRedraw: c.fn("redraw"),
    // sub-workflow thunks
    drumLaneFactoryReset: c.fn("factoryReset"),
    deleteDrumLaneClear: c.fn("laneClear"),
    drumRepeatPadPress: (..._a: unknown[]) => {
      c.fn("repeatPress")(..._a);
      return false;
    },
    captureDrumLanePress: (..._a: unknown[]) => {
      c.fn("capture")(..._a);
      return false;
    },
    drumVelocityPadPress: c.fn("velPress"),
    drumLaneCopyPaste: c.fn("copyPaste"),
    drumLaneMuteSolo: c.fn("muteSolo"),
    drumLanePadPress: c.fn("lanePress"),
    melodicStepNoteAssignment: c.fn("stepNote"),
    loopStepRelease: c.fn("loopStepRelease"),
    sessionViewStepRelease: (..._a: unknown[]) => {
      c.fn("sessStepRel")(..._a);
      return false;
    },
    trackViewStepRelease: c.fn("trackStepRel"),
    drumRepeatPadRelease: (..._a: unknown[]) => {
      c.fn("repeatRelease")(..._a);
      return false;
    },
    ...overrides,
  };
}

// ===========================================================================
// PRESS: co-run drum inject (side effect, no return)
// ===========================================================================
describe("Pad press - co-run drum inject", () => {
  test("does nothing when no co-run track active", () => {
    const c = calls();
    const S = state({ moveCoRunTrack: -1, activeTrack: 0 });
    handleUiPadCoRunDrumInject(S, deps(c), NOTE_FX, 68, 100);
    expect(c.log).toEqual([]);
    expect(S.moveCoRunDrumHeld).toBe(-1);
  });

  test("injects a plain pad-on + tracks hold for a co-run drum pad", () => {
    const c = calls();
    const S = state({ moveCoRunTrack: 0, activeTrack: 0 }); // track 0 = drum
    handleUiPadCoRunDrumInject(S, deps(c), NOTE_FX, 68, 100);
    expect(c.log).toEqual([["inject", [0x09, 0x90, 68, 100]]]);
    expect(S.moveCoRunDrumHeld).toBe(68);
  });

  test("ignores velocity-zone columns (pad col >= 4)", () => {
    const c = calls();
    const S = state({ moveCoRunTrack: 0, activeTrack: 0 });
    handleUiPadCoRunDrumInject(S, deps(c), NOTE_FX, 72, 100); // (72-68)%8 = 4
    expect(c.log).toEqual([]);
  });

  test("ignores when active track is not drum mode", () => {
    const c = calls();
    const S = state({ moveCoRunTrack: 0, activeTrack: 1 }); // track 1 melodic
    handleUiPadCoRunDrumInject(S, deps(c), NOTE_FX, 68, 100);
    expect(c.log).toEqual([]);
  });
});

// ===========================================================================
// PRESS: tap tempo
// ===========================================================================
describe("Pad press - tap tempo", () => {
  test("ignores when dialog closed", () => {
    const c = calls();
    expect(handleUiPadTapTempo(state(), deps(c), 70)).toBe(false);
    expect(c.log).toEqual([]);
  });

  test("registers a tap and consumes when dialog open", () => {
    const c = calls();
    expect(handleUiPadTapTempo(state({ tapTempoOpen: true }), deps(c), 70)).toBe(true);
    expect(c.log).toEqual([["tapTempo", 70]]);
  });

  test("ignores non-grid notes even when dialog open", () => {
    const c = calls();
    expect(handleUiPadTapTempo(state({ tapTempoOpen: true }), deps(c), 30)).toBe(false);
  });
});

// ===========================================================================
// PRESS: SEQ arp step-interval editor (bank 4)
// ===========================================================================
describe("Pad press - SEQ arp step interval (bank 4)", () => {
  test("ignores when not in step-interval mode", () => {
    const c = calls();
    expect(handleUiPadArpStepIntervalSeq(state({ activeBank: 4 }), deps(c), 68)).toBe(false);
  });

  test("ignores in session view", () => {
    const c = calls();
    const S = state({ sessionView: true, stepIntervalMode: true, activeBank: 4 });
    expect(handleUiPadArpStepIntervalSeq(S, deps(c), 68)).toBe(false);
  });

  test("sets a step velocity level + pushes set_param", () => {
    const c = calls();
    const S = state({ stepIntervalMode: true, activeBank: 4, activeTrack: 1 });
    // pad 68 → idx 0, col 0, row 0; cur 0 → newLvl 1
    expect(handleUiPadArpStepIntervalSeq(S, deps(c), 68)).toBe(true);
    expect(S.seqArpStepVel[1][0][0]).toBe(1);
    expect(c.log).toEqual([
      ["setParam", "t1_seq_arp_step_vel", "0 1"],
      ["redraw"],
    ]);
  });

  test("bottom row at level 1 toggles step off (level 0)", () => {
    const c = calls();
    const S = state({ stepIntervalMode: true, activeBank: 4, activeTrack: 1 });
    S.seqArpStepVel[1][0][0] = 1;
    expect(handleUiPadArpStepIntervalSeq(S, deps(c), 68)).toBe(true);
    expect(S.seqArpStepVel[1][0][0]).toBe(0);
    expect(c.log).toEqual([["setParam", "t1_seq_arp_step_vel", "0 0"], ["redraw"]]);
  });

  test("no-op (no set_param) when level unchanged", () => {
    const c = calls();
    const S = state({ stepIntervalMode: true, activeBank: 4, activeTrack: 1 });
    S.seqArpStepVel[1][0][0] = 1; // pad 68 row 0 → newLvl 1 == cur
    // row 0 cur 1 → newLvl 0, so it WOULD change; use a different pad to keep equal.
    // pad 76 → idx 8, col 0, row 1 → newLvl 2; set cur 2.
    S.seqArpStepVel[1][0][0] = 2;
    expect(handleUiPadArpStepIntervalSeq(S, deps(c), 76)).toBe(true);
    expect(c.log).toEqual([]);
  });

  test("loop-held sets step loop length", () => {
    const c = calls();
    const S = state({ stepIntervalMode: true, activeBank: 4, activeTrack: 1, loopHeld: true });
    // pad 70 → idx 2, col 2 → newLen 3
    expect(handleUiPadArpStepIntervalSeq(S, deps(c), 70)).toBe(true);
    expect(S.seqArpStepLoopLen[1][0]).toBe(3);
    expect(c.log).toEqual([
      ["setParam", "t1_seq_arp_step_loop_len", "3"],
      ["redraw"],
    ]);
  });
});

// ===========================================================================
// PRESS: TRACK arp step-interval editor (bank 5 = TARP)
// ===========================================================================
describe("Pad press - TARP arp step interval (bank 5)", () => {
  test("ignores when not in step-interval mode", () => {
    const c = calls();
    expect(handleUiPadArpStepIntervalTarp(state({ activeBank: 5 }), deps(c), 68)).toBe(false);
  });

  test("sets a step velocity level", () => {
    const c = calls();
    const S = state({ stepIntervalMode: true, activeBank: 5, activeTrack: 1 });
    expect(handleUiPadArpStepIntervalTarp(S, deps(c), 68)).toBe(true);
    expect(S.tarpStepVel[1][0]).toBe(1);
    expect(c.log).toEqual([["setParam", "t1_tarp_step_vel", "0 1"], ["redraw"]]);
  });

  test("loop-held sets step loop length", () => {
    const c = calls();
    const S = state({ stepIntervalMode: true, activeBank: 5, activeTrack: 1, loopHeld: true });
    expect(handleUiPadArpStepIntervalTarp(S, deps(c), 71)).toBe(true); // col 3 → len 4
    expect(S.tarpStepLoopLen[1]).toBe(4);
    expect(c.log).toEqual([["setParam", "t1_tarp_step_loop_len", "4"], ["redraw"]]);
  });
});

// ===========================================================================
// PRESS: performance mode intercept
// ===========================================================================
describe("Pad press - perf mode intercept", () => {
  test("ignores when not session view / not loop-held-or-locked", () => {
    const c = calls();
    expect(handleUiPadPerfMode(state(), deps(c), 68)).toBe(false);
  });

  test("rate pad pushes onto stack + arms looper", () => {
    const c = calls();
    const S = state({ sessionView: true, loopHeld: true });
    expect(handleUiPadPerfMode(S, deps(c), 70)).toBe(true); // subIdx 2 → ticks 48
    expect(S.perfStack).toEqual([{ idx: 2, ticks: 48 }]);
    expect(c.log).toEqual([["setParam", "looper_arm", "48"], ["redraw"]]);
  });

  test("sync pad (subIdx 6) toggles perfSync", () => {
    const c = calls();
    const S = state({ sessionView: true, perfViewLocked: true });
    expect(handleUiPadPerfMode(S, deps(c), 74)).toBe(true);
    expect(S.perfSync).toBe(true);
    expect(c.log).toEqual([["setParam", "looper_sync", "1"], ["redraw"]]);
  });

  test("latch pad (subIdx 7) records press tick", () => {
    const c = calls();
    const S = state({ sessionView: true, loopHeld: true, tickCount: 500 });
    expect(handleUiPadPerfMode(S, deps(c), 75)).toBe(true);
    expect(S.perfLatchPressedTick).toBe(500);
    expect(c.log).toEqual([["redraw"]]);
  });

  test("hold pad (subIdx 5) sets momentary hold when no sticky", () => {
    const c = calls();
    const S = state({ sessionView: true, loopHeld: true });
    expect(handleUiPadPerfMode(S, deps(c), 73)).toBe(true);
    expect(S.perfHoldPadHeld).toBe(true);
    expect(c.log).toEqual([["redraw"]]);
  });

  test("hold pad cancels sticky + stops loop when sticky present", () => {
    const c = calls();
    const S = state({
      sessionView: true,
      loopHeld: false,
      perfViewLocked: true,
      perfStickyLengths: new Set([1]),
      perfStack: [{ idx: 1, ticks: 24 }],
    });
    expect(handleUiPadPerfMode(S, deps(c), 73)).toBe(true);
    expect(S.perfStickyLengths.size).toBe(0);
    expect(S.perfStack).toEqual([]);
    expect(S.perfViewLocked).toBe(false);
    expect(c.log).toEqual([["setParam", "looper_stop", "1"], ["redraw"]]);
  });

  test("shift+length adds sticky and locks view", () => {
    const c = calls();
    const S = state({ sessionView: true, loopHeld: true, shiftHeld: true });
    expect(handleUiPadPerfMode(S, deps(c), 70)).toBe(true); // subIdx 2, ticks 48
    expect(S.perfStickyLengths.has(2)).toBe(true);
    expect(S.perfStack).toEqual([{ idx: 2, ticks: 48 }]);
    expect(S.perfViewLocked).toBe(true);
    expect(c.log).toEqual([["setParam", "looper_arm", "48"], ["redraw"]]);
  });

  test("mod pad held bit set + popup when not latch mode", () => {
    const c = calls();
    const S = state({ sessionView: true, loopHeld: true, tickCount: 200 });
    expect(handleUiPadPerfMode(S, deps(c), 76)).toBe(true); // modIdx 0
    expect(S.perfModsHeld).toBe(1);
    expect(S.perfModPopupName).toBe("Octave Up");
    expect(S.perfModPopupEndTick).toBe(280);
    expect(c.log).toEqual([["sendPerfMods"], ["redraw"]]);
  });

  test("mod pad XORs toggled bit in latch mode", () => {
    const c = calls();
    const S = state({ sessionView: true, loopHeld: true, perfLatchMode: true });
    expect(handleUiPadPerfMode(S, deps(c), 77)).toBe(true); // modIdx 1
    expect(S.perfModsToggled).toBe(2);
    expect(c.log).toEqual([["sendPerfMods"], ["redraw"]]);
  });
});

// ===========================================================================
// TRACK VIEW: drum lane reset / clear / repeat / capture
// ===========================================================================
describe("Pad track-view - drum lane reset (Shift+Delete)", () => {
  test("ignores out-of-range note", () => {
    const c = calls();
    expect(handleUiPadTrackViewDrumLaneReset(state(), deps(c), 30)).toBe(false);
  });

  test("ignores when not Shift+Delete on a drum track", () => {
    const c = calls();
    const S = state({ activeTrack: 0, shiftHeld: true, deleteHeld: false });
    expect(handleUiPadTrackViewDrumLaneReset(S, deps(c), 68)).toBe(false);
  });

  test("factory-resets lane on Shift+Delete drum pad", () => {
    const c = calls();
    const S = state({ activeTrack: 0, shiftHeld: true, deleteHeld: true });
    expect(handleUiPadTrackViewDrumLaneReset(S, deps(c), 70)).toBe(true);
    expect(c.log).toEqual([["factoryReset", 0, 2]]); // drumPadToLane(2) = 2
  });
});

describe("Pad track-view - drum lane clear (Delete)", () => {
  test("ignores when shift held", () => {
    const c = calls();
    const S = state({ activeTrack: 0, shiftHeld: true, deleteHeld: true });
    expect(handleUiPadTrackViewDrumLaneClear(S, deps(c), 68)).toBe(false);
  });

  test("clears lane (markUndo) on Delete drum pad", () => {
    const c = calls();
    const S = state({ activeTrack: 0, deleteHeld: true });
    expect(handleUiPadTrackViewDrumLaneClear(S, deps(c), 68)).toBe(true);
    expect(c.log).toEqual([
      ["laneClear", 0, 0, { markUndo: true, popupArgs: ["LANE", "CLEARED"] }],
    ]);
  });
});

describe("Pad track-view - drum repeat pad", () => {
  test("falls through when repeat workflow does not consume", () => {
    const c = calls();
    expect(handleUiPadTrackViewDrumRepeat(state(), deps(c), 68, 100)).toBe(false);
    expect(c.log).toEqual([["repeatPress", 0, 100]]);
  });

  test("consumes when repeat workflow returns true", () => {
    const c = calls();
    const d = deps(c, { drumRepeatPadPress: () => true });
    expect(handleUiPadTrackViewDrumRepeat(state(), d, 68, 100)).toBe(true);
  });
});

describe("Pad track-view - capture drum lane", () => {
  test("ignores when not capture on a drum track", () => {
    const c = calls();
    const S = state({ activeTrack: 0, captureHeld: false });
    expect(handleUiPadTrackViewCaptureDrumLane(S, deps(c), 68)).toBe(false);
  });

  test("falls through when capture workflow does not consume", () => {
    const c = calls();
    const S = state({ activeTrack: 0, captureHeld: true });
    expect(handleUiPadTrackViewCaptureDrumLane(S, deps(c), 68)).toBe(false);
    expect(c.log).toEqual([["capture", 0, { kind: "lane", lane: 2 }]]);
  });

  test("consumes when capture workflow returns true", () => {
    const c = calls();
    const d = deps(c, { captureDrumLanePress: () => true });
    const S = state({ activeTrack: 0, captureHeld: true });
    expect(handleUiPadTrackViewCaptureDrumLane(S, d, 68)).toBe(true);
  });
});

// ===========================================================================
// TRACK VIEW: drum-or-melodic dispatch chain
// ===========================================================================
describe("Pad track-view - drum/melodic dispatch", () => {
  test("ignores out-of-range note", () => {
    const c = calls();
    expect(handleUiPadTrackViewDrumOrMelodic(state(), deps(c), 30, 100)).toBe(false);
  });

  test("drum velocity zone routes to velocity press", () => {
    const c = calls();
    const d = deps(c, {
      resolveDrumPadTarget: () => ({ kind: "velocity", zone: 1 }),
    });
    const S = state({ activeTrack: 0 });
    expect(handleUiPadTrackViewDrumOrMelodic(S, d, 68, 100)).toBe(true);
    expect(c.log).toEqual([["velPress", 0, { kind: "velocity", zone: 1 }]]);
  });

  test("drum lane copy when copy held", () => {
    const c = calls();
    const S = state({ activeTrack: 0, copyHeld: true });
    expect(handleUiPadTrackViewDrumOrMelodic(S, deps(c), 68, 100)).toBe(true);
    expect(c.log).toEqual([["copyPaste", 0, 2]]);
  });

  test("drum lane mute/solo when mute held", () => {
    const c = calls();
    const S = state({ activeTrack: 0, muteHeld: true });
    expect(handleUiPadTrackViewDrumOrMelodic(S, deps(c), 68, 100)).toBe(true);
    expect(c.log).toEqual([["muteSolo", 0, 2]]);
  });

  test("drum lane delete-clear (refreshBankParams) when delete held", () => {
    const c = calls();
    const S = state({ activeTrack: 0, deleteHeld: true });
    expect(handleUiPadTrackViewDrumOrMelodic(S, deps(c), 68, 100)).toBe(true);
    expect(c.log).toEqual([
      ["laneClear", 0, 2, { refreshBankParams: true, popupArgs: ["LANE CLEARED"] }],
    ]);
  });

  test("plain drum lane press otherwise", () => {
    const c = calls();
    const S = state({ activeTrack: 0 });
    expect(handleUiPadTrackViewDrumOrMelodic(S, deps(c), 68, 100)).toBe(true);
    expect(c.log).toEqual([["lanePress", 0, 100, { kind: "lane", lane: 2 }]]);
  });

  test("melodic step-edit assigns note for held step + previews", () => {
    const c = calls();
    const S = state({ activeTrack: 1, heldStep: 3 });
    // pad 68 → padIdx 0, padNoteMap[0] = 36, octave 0 → pitch 36
    expect(handleUiPadTrackViewDrumOrMelodic(S, deps(c), 68, 100)).toBe(true);
    expect(S.liveActiveNotes.has(36)).toBe(true);
    expect(c.log).toEqual([
      ["stepNote", 36, 100],
      ["liveSend", 1, 0x90, 36, 100],
    ]);
  });

  test("melodic step-edit skips OOB pad (0xFF)", () => {
    const c = calls();
    const S = state({ activeTrack: 1, heldStep: 3 });
    S.padNoteMap[0] = 0xff;
    expect(handleUiPadTrackViewDrumOrMelodic(S, deps(c), 68, 100)).toBe(true);
    expect(c.log).toEqual([]);
  });

  test("Shift + top pads (24-31) select a bank", () => {
    const c = calls();
    const S = state({ activeTrack: 1, shiftHeld: true });
    // padIdx 24 = note 92; melodic → bankIdx 0; activeBank already 0 → just clears bankSelectTick
    expect(handleUiPadTrackViewDrumOrMelodic(S, deps(c), 92, 100)).toBe(true);
    expect(S.bankSelectTick).toBe(-1);
    expect(S.screenDirty).toBe(true);
  });

  test("Shift + top pad switches to a new bank (melodic)", () => {
    const c = calls();
    const S = state({ activeTrack: 1, shiftHeld: true, tickCount: 300 });
    // padIdx 27 = note 95; melodic bankIdx 3
    expect(handleUiPadTrackViewDrumOrMelodic(S, deps(c), 95, 100)).toBe(true);
    expect(S.activeBank).toBe(3);
    expect(S.trackActiveBank[1]).toBe(3);
    expect(S.bankSelectTick).toBe(300);
    expect(c.log).toEqual([["readBank", 1, 3], ["writeSidecar"]]);
  });

  test("Shift + drum top pad uses DRUM_PAD_MAP (padOff 0 → bank 7)", () => {
    const c = calls();
    const S = state({ activeTrack: 0, shiftHeld: true, tickCount: 300 });
    // padIdx 24 = note 92; drum DRUM_PAD_MAP[0] = 7
    expect(handleUiPadTrackViewDrumOrMelodic(S, deps(c), 92, 100)).toBe(true);
    expect(S.activeBank).toBe(7);
    expect(S.allLanesConfirmed).toBe(false);
    expect(c.log).toEqual([["readBank", 0, 7], ["writeSidecar"]]);
  });

  test("Shift + bottom pad (< numTracks) selects track", () => {
    const c = calls();
    const S = state({ activeTrack: 1, shiftHeld: true });
    // padIdx 5 = note 73; < numTracks 8 → selectTrackGesture(5)
    expect(handleUiPadTrackViewDrumOrMelodic(S, deps(c), 73, 100)).toBe(true);
    expect(c.log).toEqual([["selectTrack", 5]]);
    expect(S.screenDirty).toBe(true);
  });

  test("live note (no shift) sends + records when armed", () => {
    const c = calls();
    const S = state({ activeTrack: 1, recordArmed: true, recordArmedTrack: 1 });
    // pad 68 → padIdx 0, note 36
    expect(handleUiPadTrackViewDrumOrMelodic(S, deps(c), 68, 100)).toBe(true);
    expect(S.lastPlayedNote).toBe(36);
    expect(S.lastPadVelocity).toBe(100);
    expect(S.liveActiveNotes.has(36)).toBe(true);
    expect(c.log).toEqual([
      ["liveSend", 1, 0x90, 36, 100],
      ["recOn", 36, 100, 1],
    ]);
  });

  test("live note skips OOB-after-octave pitch", () => {
    const c = calls();
    const S = state({ activeTrack: 1, trackOctave: [0, 11] }); // 36 + 11*12 = 168 > 127
    expect(handleUiPadTrackViewDrumOrMelodic(S, deps(c), 68, 100)).toBe(true);
    expect(c.log).toEqual([]);
  });
});

// ===========================================================================
// RELEASE handlers
// ===========================================================================
describe("Pad release - tap tempo swallow", () => {
  test("swallows grid release when dialog open", () => {
    const c = calls();
    expect(handleUiPadReleaseTapTempo(state({ tapTempoOpen: true }), deps(c), 70)).toBe(true);
  });
  test("ignores when dialog closed", () => {
    const c = calls();
    expect(handleUiPadReleaseTapTempo(state(), deps(c), 70)).toBe(false);
  });
});

describe("Pad release - co-run drum hold release", () => {
  test("injects note-off + clears hold for the tracked pad", () => {
    const c = calls();
    const S = state({ moveCoRunTrack: 0, moveCoRunDrumHeld: 70 });
    handleUiPadReleaseCoRunDrum(S, deps(c), 70);
    expect(c.log).toEqual([["inject", [0x08, 0x80, 70, 0]]]);
    expect(S.moveCoRunDrumHeld).toBe(-1);
  });

  test("does nothing for a different pad", () => {
    const c = calls();
    const S = state({ moveCoRunTrack: 0, moveCoRunDrumHeld: 70 });
    handleUiPadReleaseCoRunDrum(S, deps(c), 71);
    expect(c.log).toEqual([]);
    expect(S.moveCoRunDrumHeld).toBe(70);
  });
});

describe("Pad release - loop+step gesture", () => {
  test("ignores when no gesture in flight", () => {
    const c = calls();
    expect(handleUiPadReleaseLoopStep(state(), deps(c), 16)).toBe(false);
  });
  test("resolves the gesture for the step button", () => {
    const c = calls();
    const S = state({ loopGestureStart: 0 });
    expect(handleUiPadReleaseLoopStep(S, deps(c), 18)).toBe(true);
    expect(c.log).toEqual([["loopStepRelease", 2]]);
  });
});

describe("Pad release - SEQ arp editor swallow (bank 4)", () => {
  test("swallows + sends note-off for an active preview pad", () => {
    const c = calls();
    const S = state({ activeBank: 4, knobTouched: 4 });
    S.bankParams[1][4][4] = 1;
    const d = deps(c);
    d.padPitch[0] = 55; // pad 68 → idx 0
    expect(handleUiPadReleaseSeqArpEditor(S, d, 68)).toBe(true);
    expect(c.log).toEqual([["liveSend", 1, 0x80, 55, 0]]);
    expect(d.padPitch[0]).toBe(-1);
    expect(S.liveActiveNotes.has(55)).toBe(false);
  });

  test("ignores when editor not open", () => {
    const c = calls();
    expect(handleUiPadReleaseSeqArpEditor(state({ activeBank: 4 }), deps(c), 68)).toBe(false);
  });
});

describe("Pad release - TARP arp editor swallow (bank 5)", () => {
  test("swallows for an active preview pad", () => {
    const c = calls();
    const S = state({ activeBank: 5, knobTouched: 4 });
    S.bankParams[1][5][4] = 1;
    const d = deps(c);
    d.padPitch[0] = 60;
    expect(handleUiPadReleaseTarpArpEditor(S, d, 68)).toBe(true);
    expect(c.log).toEqual([["liveSend", 1, 0x80, 60, 0]]);
  });
});

describe("Pad release - perf mode", () => {
  test("ignores when not in perf mode", () => {
    const c = calls();
    expect(handleUiPadReleasePerfMode(state(), deps(c), 68)).toBe(false);
  });

  test("latch pad release toggles latch mode", () => {
    const c = calls();
    const S = state({ sessionView: true, loopHeld: true, perfLatchMode: false });
    expect(handleUiPadReleasePerfMode(S, deps(c), 75)).toBe(true);
    expect(S.perfLatchMode).toBe(true);
    expect(c.log).toEqual([["redraw"]]);
  });

  test("rate pad release pops from stack + stops when empty", () => {
    const c = calls();
    const S = state({
      sessionView: true,
      loopHeld: true,
      perfStack: [{ idx: 2, ticks: 48 }],
    });
    expect(handleUiPadReleasePerfMode(S, deps(c), 70)).toBe(true); // subIdx 2
    expect(S.perfStack).toEqual([]);
    expect(c.log).toEqual([["setParam", "looper_stop", "1"], ["redraw"]]);
  });

  test("rate pad release keeps sticky-held loops", () => {
    const c = calls();
    const S = state({
      sessionView: true,
      loopHeld: true,
      perfStickyLengths: new Set([2]),
      perfStack: [{ idx: 2, ticks: 48 }],
    });
    expect(handleUiPadReleasePerfMode(S, deps(c), 70)).toBe(true);
    expect(S.perfStack).toEqual([{ idx: 2, ticks: 48 }]);
    expect(c.log).toEqual([["redraw"]]);
  });

  test("mod pad release clears held bit", () => {
    const c = calls();
    const S = state({ sessionView: true, loopHeld: true, perfModsHeld: 0b11 });
    expect(handleUiPadReleasePerfMode(S, deps(c), 77)).toBe(true); // modIdx 1 → clears bit 1
    expect(S.perfModsHeld).toBe(0b01);
    expect(c.log).toEqual([["sendPerfMods"], ["redraw"]]);
  });
});

describe("Pad release - step button", () => {
  test("ignores non-step note", () => {
    const c = calls();
    expect(handleUiPadReleaseStepButton(state(), deps(c), 68)).toBe(false);
  });

  test("falls to track-view step release when session view does not consume", () => {
    const c = calls();
    const S = state({ tickCount: 42 });
    expect(handleUiPadReleaseStepButton(S, deps(c), 20)).toBe(true);
    expect(S.stepOpTick).toBe(42);
    expect(c.log).toEqual([["sessStepRel", 4], ["trackStepRel", 4]]);
  });

  test("session-view step release consumes alone", () => {
    const c = calls();
    const d = deps(c, { sessionViewStepRelease: () => true });
    expect(handleUiPadReleaseStepButton(state(), d, 20)).toBe(true);
  });
});

describe("Pad release - grid pad note", () => {
  test("ignores out-of-range note", () => {
    const c = calls();
    expect(handleUiPadReleasePadNote(state(), deps(c), 30)).toBe(false);
  });

  test("drum-repeat release consumes first", () => {
    const c = calls();
    const d = deps(c, { drumRepeatPadRelease: () => true });
    expect(handleUiPadReleasePadNote(state(), d, 68)).toBe(true);
  });

  test("melodic release sends note-off + clears pad pitch", () => {
    const c = calls();
    const S = state({ activeTrack: 1 });
    const d = deps(c);
    d.padPitch[0] = 50; // pad 68 → padIdx 0
    expect(handleUiPadReleasePadNote(S, d, 68)).toBe(true);
    expect(c.log).toEqual([["repeatRelease", 1, 0], ["liveSend", 1, 0x80, 50, 0]]);
    expect(d.padPitch[0]).toBe(-1);
    expect(S.liveActiveNotes.has(50)).toBe(false);
  });

  test("drum tap within threshold defers note-off to queue", () => {
    const c = calls();
    const S = state({ activeTrack: 0, tickCount: 105 });
    const d = deps(c);
    d.padPitch[0] = 50;
    d.padPressTick[0] = 100; // 105 - 100 = 5 < drumTapTicks 10
    expect(handleUiPadReleasePadNote(S, d, 68)).toBe(true);
    expect(d.pendingDrumNoteOffs[0]).toEqual([50]);
    expect(c.log).toEqual([["repeatRelease", 0, 0]]); // no liveSend
    expect(d.padPressTick[0]).toBe(-1);
  });

  test("record-armed melodic queues recordNoteOff", () => {
    const c = calls();
    const S = state({ activeTrack: 1, recordArmed: true, recordArmedTrack: 1 });
    const d = deps(c);
    d.padPitch[0] = 50;
    expect(handleUiPadReleasePadNote(S, d, 68)).toBe(true);
    expect(c.log).toContainEqual(["recOff", 50]);
  });

  test("record-armed drum queues drumRecNoteOffs", () => {
    const c = calls();
    const S = state({
      activeTrack: 0,
      sessionView: true,
      recordArmed: true,
      recordArmedTrack: 0,
    });
    const d = deps(c);
    d.padPitch[0] = 50;
    expect(handleUiPadReleasePadNote(S, d, 68)).toBe(true);
    expect(d.drumRecNoteOffs).toEqual([{ track: 0, laneNote: 50 }]);
  });

  test("OOB pad (note map 0xFF, no pitch) is a no-op release", () => {
    const c = calls();
    const S = state({ activeTrack: 1 });
    S.padNoteMap[0] = 0xff;
    const d = deps(c); // padPitch[0] stays -1
    expect(handleUiPadReleasePadNote(S, d, 68)).toBe(true);
    expect(c.log).toEqual([["repeatRelease", 1, 0]]); // returns before any liveSend
  });

  test("preroll note release stamps releasedAtTick", () => {
    const c = calls();
    const S = state({
      activeTrack: 1,
      tickCount: 999,
      pendingPrerollNote: { laneNote: 50, releasedAtTick: -1 },
      pendingPrerollNotes: [{ pitch: 50, releasedAtTick: -1 }],
    });
    const d = deps(c);
    d.padPitch[0] = 50;
    expect(handleUiPadReleasePadNote(S, d, 68)).toBe(true);
    expect(S.pendingPrerollNote!.releasedAtTick).toBe(999);
    expect(S.pendingPrerollNotes[0].releasedAtTick).toBe(999);
  });
});
