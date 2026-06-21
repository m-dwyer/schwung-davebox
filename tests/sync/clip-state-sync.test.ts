import { describe, expect, test } from "vitest";
import {
  refreshSeqNotesIfCurrentImpl,
  restoreUiSidecarImpl,
  syncClipsFromDspImpl,
  syncClipsTargetedImpl,
  syncMuteSoloFromDspImpl,
} from "@overture-ui/sync/ui_clip_state_sync.mjs";
import { DRUM_LANES, NUM_CLIPS, NUM_STEPS, NUM_TRACKS, PAD_MODE_DRUM } from "@overture-ui/core/ui_constants.mjs";
import { traceDspWrites } from "../helpers/dsp-queue-trace";

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return { log };
}

function grid<T>(dims: number[], fill: () => T): any {
  if (dims.length === 0) return fill();
  const [n, ...rest] = dims;
  return Array.from({ length: n }, () => grid(rest, fill));
}

function makeDeps(c: ReturnType<typeof calls>, map: Record<string, string | null>, noGet = false) {
  return {
    getParam: noGet
      ? null
      : (k: string) => {
          c.log.push(["getParam", k]);
          return k in map ? map[k] : null;
        },
  };
}

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    screenDirty: false,
    trackCurrentStep: [5],
    trackActiveClip: [1],
    clipSteps: grid([1, 2, 8], () => 0),
    seqActiveNotes: new Set<number>([99]),
    seqLastStep: 5,
    seqNoteOnClipTick: 10,
    trackMuted: Array.from({ length: NUM_TRACKS }, () => false),
    trackSoloed: Array.from({ length: NUM_TRACKS }, () => false),
    snapshots: Array.from({ length: 16 }, () => ({ mute: [], solo: [] })),
    scaleAware: 0,
    ...overrides,
  };
}

function makeRestoreState(overrides: Record<string, unknown> = {}) {
  return {
    currentSetUuid: "abc",
    activeTrack: 0,
    trackActiveClip: Array.from({ length: NUM_TRACKS }, () => 0),
    sessionView: false,
    activeDrumLane: Array.from({ length: NUM_TRACKS }, () => 0),
    drumLanePage: [0, 1, 2, 3, 0, 1, 2, 3],
    beatMarkersEnabled: false,
    perfModsToggled: 0,
    perfModsHeld: 4,
    perfLatchMode: false,
    perfRecalledSlot: -1,
    perfSnapshots: Array.from({ length: 16 }, () => 0),
    pendingDefaultSetParams: [] as Array<{ key: string; val: string }>,
    drumVelZoneArmed: Array.from({ length: NUM_TRACKS }, () => false),
    drumLaneEuclidN: grid([NUM_TRACKS, DRUM_LANES], () => 99),
    trackOctave: Array.from({ length: NUM_TRACKS }, () => 0),
    trackActiveBank: Array.from({ length: NUM_TRACKS }, () => 0),
    activeBank: 0,
    allLanesConfirmed: true,
    trackAtMode: Array.from({ length: NUM_TRACKS }, () => 0),
    padLayoutChromatic: Array.from({ length: NUM_TRACKS }, () => false),
    scaleAware: 0,
    metronomeVol: 0,
    trackPadMode: Array.from({ length: NUM_TRACKS }, () => 0),
    ...overrides,
  };
}

function makeRestoreDeps(c: ReturnType<typeof calls>, sidecar: unknown, opts: { exists?: boolean; noGet?: boolean; noSet?: boolean } = {}) {
  return {
    getParam: opts.noGet
      ? null
      : (k: string) => {
          c.log.push(["getParam", k]);
          return null;
        },
    setParam: opts.noSet ? null : (k: string, v: string) => c.log.push(["setParam", k, v]),
    readFile: (p: string) => {
      c.log.push(["readFile", p]);
      return typeof sidecar === "string" ? sidecar : JSON.stringify(sidecar);
    },
    fileExists: (p: string) => {
      c.log.push(["fileExists", p]);
      return opts.exists ?? true;
    },
    setActiveDrumLane: (t: number, l: number) => c.log.push(["setActiveDrumLane", t, l]),
    syncDrumClipContent: (t: number) => c.log.push(["syncDrumClipContent", t]),
    syncDrumLanesMeta: (t: number) => c.log.push(["syncDrumLanesMeta", t]),
    syncDrumLaneSteps: (t: number, l: number) => c.log.push(["syncDrumLaneSteps", t, l]),
  };
}

function makeClipSyncState(overrides: Record<string, unknown> = {}) {
  return {
    screenDirty: false,
    clipSteps: grid([NUM_TRACKS, NUM_CLIPS, NUM_STEPS], () => 0),
    clipNonEmpty: grid([NUM_TRACKS, NUM_CLIPS], () => false),
    clipLength: grid([NUM_TRACKS, NUM_CLIPS], () => 16),
    clipLoopStart: grid([NUM_TRACKS, NUM_CLIPS], () => 0),
    clipTPS: grid([NUM_TRACKS, NUM_CLIPS], () => 24),
    ccLaneLoopStart: grid([NUM_TRACKS, NUM_CLIPS, 8], () => 0),
    ccLaneLength: grid([NUM_TRACKS, NUM_CLIPS, 8], () => 0),
    ccLaneTps: grid([NUM_TRACKS, NUM_CLIPS, 8], () => 0),
    ccLaneResTps: grid([NUM_TRACKS, NUM_CLIPS, 8], () => 0),
    trackActiveClip: Array.from({ length: NUM_TRACKS }, () => 0),
    lastDspActiveClip: Array.from({ length: NUM_TRACKS }, () => -1),
    padOctave: Array.from({ length: NUM_TRACKS }, () => 0),
    trackPadMode: Array.from({ length: NUM_TRACKS }, () => 0),
    activeDrumLane: Array.from({ length: NUM_TRACKS }, () => 0),
    drumLaneLoopStart: Array.from({ length: NUM_TRACKS }, () => 0),
    drumLaneLength: Array.from({ length: NUM_TRACKS }, () => 16),
    trackCurrentPage: Array.from({ length: NUM_TRACKS }, () => 0),
    padKey: 0,
    padScale: 0,
    launchQuant: 0,
    inpQuant: false,
    midiInChannel: 0,
    metronomeOn: 0,
    metronomeOnLast: 0,
    metronomeVol: 0,
    swingAmt: 0,
    swingRes: 0,
    trackCCAutoBits: grid([NUM_TRACKS, NUM_CLIPS], () => 0),
    clipCCVal: grid([NUM_TRACKS, NUM_CLIPS, 8], () => 0),
    clipAtHas: grid([NUM_TRACKS, NUM_CLIPS], () => false),
    ...overrides,
  };
}

function makeClipSyncDeps(c: ReturnType<typeof calls>, map: Record<string, string | null>, noGet = false) {
  return {
    getParam: noGet
      ? null
      : (k: string) => {
          c.log.push(["getParam", k]);
          return k in map ? map[k] : null;
        },
    clipHasContent: (t: number, clip: number) => {
      c.log.push(["clipHasContent", t, clip]);
      return true;
    },
    readTrackConfig: (t: number) => c.log.push(["readTrackConfig", t]),
    readBankParams: (t: number, b: number) => c.log.push(["readBankParams", t, b]),
    readTarpStepVel: (t: number) => c.log.push(["readTarpStepVel", t]),
    readDrumRepeatRates: (t: number) => c.log.push(["readDrumRepeatRates", t]),
    refreshPerClipBankParams: (t: number) => c.log.push(["refreshPerClipBankParams", t]),
    syncDrumClipContent: (t: number) => c.log.push(["syncDrumClipContent", t]),
    syncDrumLanesMeta: (t: number) => c.log.push(["syncDrumLanesMeta", t]),
    syncDrumLaneSteps: (t: number, l: number) => c.log.push(["syncDrumLaneSteps", t, l]),
    refreshDrumLaneBankParams: (t: number, l: number) => c.log.push(["refreshDrumLaneBankParams", t, l]),
  };
}

describe("refreshSeqNotesIfCurrentImpl", () => {
  test("non-current step leaves active notes untouched", () => {
    const c = calls();
    const S = makeState();
    refreshSeqNotesIfCurrentImpl(S, makeDeps(c, {}), 0, 1, 4);
    expect(c.log).toEqual([]);
    expect(Array.from((S.seqActiveNotes as Set<number>).values())).toEqual([99]);
    expect(S.seqLastStep).toBe(5);
  });

  test("current inactive step clears active notes without DSP read", () => {
    const c = calls();
    const S = makeState();
    refreshSeqNotesIfCurrentImpl(S, makeDeps(c, {}), 0, 1, 5);
    expect(c.log).toEqual([]);
    expect(Array.from((S.seqActiveNotes as Set<number>).values())).toEqual([]);
    expect(S.seqLastStep).toBe(-1);
    expect(S.seqNoteOnClipTick).toBe(-1);
  });

  test("current active step reads notes and filters invalid pitches", () => {
    const c = calls();
    const S = makeState();
    (S.clipSteps as any)[0][1][5] = 1;
    refreshSeqNotesIfCurrentImpl(
      S,
      makeDeps(c, { t0_c1_step_5_notes: "60 -1 127 128 xx 64" }),
      0,
      1,
      5,
    );
    expect(c.log).toEqual([["getParam", "t0_c1_step_5_notes"]]);
    expect(Array.from((S.seqActiveNotes as Set<number>).values())).toEqual([60, 127, 64]);
  });
});

describe("syncMuteSoloFromDspImpl", () => {
  test("no getParam -> no-op", () => {
    const c = calls();
    const S = makeState();
    syncMuteSoloFromDspImpl(S, makeDeps(c, {}, true));
    expect(c.log).toEqual([]);
    expect(S.screenDirty).toBe(false);
  });

  test("reads mute, solo, snapshots, and scale-aware in order", () => {
    const c = calls();
    const snap0 = "10101010 01010101";
    const S = makeState();
    syncMuteSoloFromDspImpl(
      S,
      makeDeps(c, {
        mute_state: "10000001",
        solo_state: "01000010",
        snap_0: snap0,
        snap_1: "short",
        scale_aware: "1",
      }),
    );
    expect(c.log.slice(0, 4)).toEqual([
      ["getParam", "mute_state"],
      ["getParam", "solo_state"],
      ["getParam", "snap_0"],
      ["getParam", "snap_1"],
    ]);
    expect(c.log.at(-1)).toEqual(["getParam", "scale_aware"]);
    expect(c.log).toHaveLength(19);
    expect(S.trackMuted).toEqual([true, false, false, false, false, false, false, true]);
    expect(S.trackSoloed).toEqual([false, true, false, false, false, false, true, false]);
    expect((S.snapshots as any)[0]).toEqual({
      mute: [true, false, true, false, true, false, true, false],
      solo: [false, true, false, true, false, true, false, true],
    });
    expect((S.snapshots as any)[1]).toBeNull();
    expect(S.scaleAware).toBe(1);
    expect(S.screenDirty).toBe(true);
  });
});

describe("restoreUiSidecarImpl", () => {
  test("restores sidecar fields and re-pushes all drum lane pages in order", () => {
    const c = calls();
    const sidecar = {
      v: 9,
      at: 2,
      ac: [1, 2, 3, 4, 5, 6, 7, 8],
      sv: 1,
      dl: [0, 1, 2, 3, 4, 5, 6, 7],
      bm: 1,
      pm: 3,
      lm: 1,
      rs: 2,
      us: [10, 11, 12, 13, 14, 15, 16, 17],
      dva: [true, false, true, false, true, false, true, false],
      dleu: [Array.from({ length: DRUM_LANES }, (_, i) => i), [-1, 4]],
      to: [-9, -4, 0, 2, 9],
      tab: [0, 1, 7, 9],
      am: [0, 1, 2, 3],
      pchr: [true, false, true],
    };
    const S = makeRestoreState({
      pendingDefaultSetParams: [{ key: "older", val: "1" }],
    });
    restoreUiSidecarImpl(S, makeRestoreDeps(c, sidecar), true);
    expect(c.log.slice(0, 2)).toEqual([
      ["fileExists", "/data/UserData/schwung/set_state/abc/seq8-ui-state.json"],
      ["readFile", "/data/UserData/schwung/set_state/abc/seq8-ui-state.json"],
    ]);
    expect(c.log.slice(2, 10)).toEqual([
      ["setActiveDrumLane", 0, 0],
      ["setActiveDrumLane", 1, 1],
      ["setActiveDrumLane", 2, 2],
      ["setActiveDrumLane", 3, 3],
      ["setActiveDrumLane", 4, 4],
      ["setActiveDrumLane", 5, 5],
      ["setActiveDrumLane", 6, 6],
      ["setActiveDrumLane", 7, 7],
    ]);
    expect(c.log.slice(10, 18)).toEqual([
      ["setParam", "t0_drum_lane_page", "0"],
      ["setParam", "t1_drum_lane_page", "1"],
      ["setParam", "t2_drum_lane_page", "2"],
      ["setParam", "t3_drum_lane_page", "3"],
      ["setParam", "t4_drum_lane_page", "0"],
      ["setParam", "t5_drum_lane_page", "1"],
      ["setParam", "t6_drum_lane_page", "2"],
      ["setParam", "t7_drum_lane_page", "3"],
    ]);
    expect(S.activeTrack).toBe(2);
    expect(S.trackActiveClip).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(S.sessionView).toBe(true);
    expect(S.beatMarkersEnabled).toBe(true);
    expect(traceDspWrites(S, c.log).queuedOperations).toEqual([
      { key: "older", val: "1" },
      { key: "perf_mods", val: "7" },
    ]);
    expect((S.perfSnapshots as number[]).slice(8, 16)).toEqual([10, 11, 12, 13, 14, 15, 16, 17]);
    expect(S.drumVelZoneArmed).toEqual([true, false, true, false, true, false, true, false]);
    expect((S.drumLaneEuclidN as any)[0][3]).toBe(3);
    expect((S.drumLaneEuclidN as any)[1][0]).toBe(0);
    expect((S.drumLaneEuclidN as any)[1][1]).toBe(4);
    expect(S.trackOctave.slice(0, 5)).toEqual([-4, -4, 0, 2, 4]);
    expect(S.trackActiveBank.slice(0, 4)).toEqual([0, 1, 7, 0]);
    expect(S.activeBank).toBe(7);
    expect(S.allLanesConfirmed).toBe(false);
    expect(S.trackAtMode.slice(0, 4)).toEqual([0, 1, 2, 0]);
    expect(S.padLayoutChromatic.slice(0, 3)).toEqual([true, false, true]);
  });

  test("first-run default path syncs drums before replacing pending defaults", () => {
    const c = calls();
    const S = makeRestoreState({ currentSetUuid: "", activeDrumLane: [6, 0, 0, 0, 0, 0, 0, 0] });
    restoreUiSidecarImpl(S, makeRestoreDeps(c, null, { exists: false }), true);
    expect(c.log).toEqual([
      ["fileExists", "/data/UserData/schwung/seq8-ui-state.json"],
      ["syncDrumClipContent", 0],
      ["syncDrumLanesMeta", 0],
      ["syncDrumLaneSteps", 0, 6],
    ]);
    expect(S.scaleAware).toBe(1);
    expect(S.metronomeVol).toBe(100);
    expect(S.trackPadMode[0]).toBe(PAD_MODE_DRUM);
    expect(S.pendingDefaultSetParams).toEqual([
      { key: "scale_aware", val: "1" },
      { key: "metro_vol", val: "100" },
      { key: "t0_pad_mode", val: String(PAD_MODE_DRUM) },
    ]);
  });

  test("first-run default path skips drum sync without getParam", () => {
    const c = calls();
    const S = makeRestoreState({ currentSetUuid: "" });
    restoreUiSidecarImpl(S, makeRestoreDeps(c, null, { exists: false, noGet: true }), true);
    expect(c.log).toEqual([["fileExists", "/data/UserData/schwung/seq8-ui-state.json"]]);
    expect(S.pendingDefaultSetParams).toHaveLength(3);
  });
});

describe("syncClipsFromDspImpl", () => {
  test("no getParam -> no-op", () => {
    const c = calls();
    const S = makeClipSyncState();
    syncClipsFromDspImpl(S, makeClipSyncDeps(c, {}, true));
    expect(c.log).toEqual([]);
  });

  test("reads clip grid, per-track deps, and global params in order", () => {
    const c = calls();
    const steps = "10".padEnd(NUM_STEPS, "0");
    const S = makeClipSyncState({ trackCurrentPage: [9, 0, 0, 0, 0, 0, 0, 0] });
    syncClipsFromDspImpl(
      S,
      makeClipSyncDeps(c, {
        t0_c0_steps: steps,
        t0_c0_length: "24",
        t0_c0_loop_start: "8",
        t0_c0_tps: "48",
        t0_c0_cc_lane_loops: "1 2 3 4 5 6 7 8",
        t0_c3_length: "16",
        t0_c3_loop_start: "40",
        t0_active_clip: "3",
        t0_pad_octave: "-1",
        key: "5",
        scale: "2",
        launch_quant: "4",
        inp_quant: "1",
        midi_in_channel: "10",
        metro_on: "2",
        metro_vol: "77",
        swing_amt: "12",
        swing_res: "3",
      }),
    );
    expect(c.log.slice(0, 7)).toEqual([
      ["getParam", "t0_c0_steps"],
      ["clipHasContent", 0, 0],
      ["getParam", "t0_c0_length"],
      ["getParam", "t0_c0_loop_start"],
      ["getParam", "t0_c0_tps"],
      ["getParam", "t0_c0_cc_lane_loops"],
      ["getParam", "t0_c1_steps"],
    ]);
    expect(c.log).toContainEqual(["readTrackConfig", 0]);
    expect(c.log).toContainEqual(["readBankParams", 0, 6]);
    expect(c.log).toContainEqual(["readTarpStepVel", 0]);
    expect(c.log).toContainEqual(["readDrumRepeatRates", 0]);
    expect((S.clipSteps as any)[0][0][0]).toBe(1);
    expect((S.clipSteps as any)[0][0][1]).toBe(0);
    expect((S.clipNonEmpty as any)[0][0]).toBe(true);
    expect((S.clipLength as any)[0][0]).toBe(24);
    expect((S.clipLoopStart as any)[0][0]).toBe(8);
    expect((S.clipTPS as any)[0][0]).toBe(48);
    expect((S.ccLaneLoopStart as any)[0][0][1]).toBe(5);
    expect((S.ccLaneLength as any)[0][0][1]).toBe(6);
    expect((S.ccLaneTps as any)[0][0][1]).toBe(7);
    expect((S.ccLaneResTps as any)[0][0][1]).toBe(8);
    expect(S.trackActiveClip[0]).toBe(3);
    expect(S.lastDspActiveClip[0]).toBe(3);
    expect(S.padOctave[0]).toBe(-1);
    expect(S.trackCurrentPage[0]).toBe(2);
    expect(S.padKey).toBe(5);
    expect(S.padScale).toBe(2);
    expect(S.launchQuant).toBe(4);
    expect(S.inpQuant).toBe(true);
    expect(S.midiInChannel).toBe(10);
    expect(S.metronomeOn).toBe(2);
    expect(S.metronomeOnLast).toBe(2);
    expect(S.metronomeVol).toBe(77);
    expect(S.swingAmt).toBe(12);
    expect(S.swingRes).toBe(3);
  });
});

describe("syncClipsTargetedImpl", () => {
  test("fallback with missing info runs full sync path", () => {
    const c = calls();
    const S = makeClipSyncState();
    syncClipsTargetedImpl(S, makeClipSyncDeps(c, { key: "3" }), "");
    expect(c.log).toContainEqual(["getParam", "key"]);
    expect(S.padKey).toBe(3);
  });

  test("targeted melodic pair and DR row preserve read and sync ordering", () => {
    const c = calls();
    const S = makeClipSyncState({
      trackActiveClip: [1, 0, 1, 0, 0, 0, 0, 0],
      activeDrumLane: [4, 5, 6, 7, 0, 0, 0, 0],
    });
    syncClipsTargetedImpl(
      S,
      makeClipSyncDeps(c, {
        t0_c1_steps: "1".padEnd(NUM_STEPS, "0"),
        t0_c1_length: "32",
        t0_c1_tps: "96",
        t0_c1_cc_auto_bits: "5",
        t0_c1_cc_rest: "1 2 3 4 5 6 7 8",
        t0_c1_at_has: "1",
      }),
      "m 0 1 DR 1",
    );
    expect(c.log.slice(0, 8)).toEqual([
      ["getParam", "t0_c1_steps"],
      ["clipHasContent", 0, 1],
      ["getParam", "t0_c1_length"],
      ["getParam", "t0_c1_tps"],
      ["refreshPerClipBankParams", 0],
      ["getParam", "t0_c1_cc_auto_bits"],
      ["getParam", "t0_c1_cc_rest"],
      ["getParam", "t0_c1_at_has"],
    ]);
    expect(c.log.slice(8, 13)).toEqual([
      ["syncDrumClipContent", 0],
      ["syncDrumLanesMeta", 0],
      ["syncDrumLaneSteps", 0, 4],
      ["refreshDrumLaneBankParams", 0, 4],
      ["syncDrumClipContent", 1],
    ]);
    expect(c.log.slice(13, 17)).toEqual([
      ["syncDrumClipContent", 2],
      ["syncDrumLanesMeta", 2],
      ["syncDrumLaneSteps", 2, 6],
      ["refreshDrumLaneBankParams", 2, 6],
    ]);
    expect((S.clipSteps as any)[0][1][0]).toBe(1);
    expect((S.clipLength as any)[0][1]).toBe(32);
    expect((S.clipTPS as any)[0][1]).toBe(96);
    expect((S.trackCCAutoBits as any)[0][1]).toBe(5);
    expect((S.clipCCVal as any)[0][1]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect((S.clipAtHas as any)[0][1]).toBe(true);
    expect(S.screenDirty).toBe(true);
  });
});
