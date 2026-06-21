import { describe, expect, test } from "vitest";
import {
  pollDspWorkflow,
  pollAutomationAtIndicator,
  pollCoRunReconcile,
  pollCountInEnd,
  pollDeferredBankRefresh,
  pollDeferredSave,
  pollMergeStateMachine,
  pollPlayheadPads,
  pollRecordPendingPage,
  pollSeqActiveNotes,
  pollSeqFollowPage,
  pollSnapshotClipStates,
  pollSnapshotTracks,
  pollStepLedRefresh,
  pollTransportTransitions,
} from "@overture-ui/sync/ui_polldsp_workflow.mjs";

// pollDSP is an ORDERED reconcile pipeline, not a dispatch ladder: each step
// runs unconditionally and mutates S. These tests pin the per-step S mutations,
// the get/set/write_file host calls, and branch coverage.

const DRUM = 1;
const NUM_TRACKS = 2; // 2 tracks (0 = drum, 1 = melodic) keeps fixtures small
const NUM_STEPS = 256;
const DRUM_LANES = 32;
const MOVE_SAMPLE = 118;
const LED_OFF = 0;
const CORUN_CHAIN_EDIT = 1;
const CORUN_MOVE_NATIVE = 2;

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    fn(name: string) {
      return (...args: unknown[]) => log.push([name, ...args]);
    },
    names() {
      return log.map((e) => e[0]);
    },
  };
}

function grid<T>(n: number, fill: () => T): T[] {
  return Array.from({ length: n }, fill);
}

// deps with a canned get_param map; all host fns logged via calls().
function makeDeps(
  c: ReturnType<typeof calls>,
  opts: {
    getParamMap?: Record<string, string | null>;
    corunState?: () => { target: number; id: number } | null;
    effectiveClip?: (t: number) => number;
    noWriteFile?: boolean;
    noSetParam?: boolean;
  } = {},
) {
  const map = opts.getParamMap ?? {};
  return {
    numTracks: NUM_TRACKS,
    numSteps: NUM_STEPS,
    drumLanes: DRUM_LANES,
    padModeDrum: DRUM,
    moveSample: MOVE_SAMPLE,
    ledOff: LED_OFF,
    corunChainEdit: CORUN_CHAIN_EDIT,
    corunMoveNative: CORUN_MOVE_NATIVE,
    getParam: (k: string) => {
      c.log.push(["getParam", k]);
      return k in map ? map[k] : null;
    },
    setParam: opts.noSetParam ? null : c.fn("setParam"),
    writeFile: opts.noWriteFile ? null : c.fn("writeFile"),
    corunState: opts.corunState ?? null,
    exitSchwungCoRun: c.fn("exitSchwungCoRun"),
    exitMoveNativeCoRun: c.fn("exitMoveNativeCoRun"),
    effectiveClip: opts.effectiveClip ?? ((t: number) => 0),
    refreshPerClipBankParams: c.fn("refreshPerClipBankParams"),
    syncDrumLanesMeta: c.fn("syncDrumLanesMeta"),
    syncDrumLaneSteps: c.fn("syncDrumLaneSteps"),
    setButtonLED: c.fn("setButtonLED"),
    showActionPopup: c.fn("showActionPopup"),
    syncClipsFromDsp: c.fn("syncClipsFromDsp"),
    clipHasContent: (t: number, ac: number) => {
      c.log.push(["clipHasContent", t, ac]);
      return true;
    },
    disarmRecord: c.fn("disarmRecord"),
    unlatchAllTracks: c.fn("unlatchAllTracks"),
    focusedClipIsEmpty: (t: number) => {
      c.log.push(["focusedClipIsEmpty", t]);
      return true;
    },
    uuidToStatePath: (u: string) => `/path/${u}.json`,
    updateNameIndex: c.fn("updateNameIndex"),
  };
}

// Minimal-but-complete S fixture. 2 tracks, 2 clips, 1 CC lane.
function makeState(overrides: Record<string, unknown> = {}) {
  const s: Record<string, unknown> = {
    playing: false,
    playingPrev: false,
    screenDirty: false,
    tickCount: 100,
    activeTrack: 1,
    activeBank: 0,
    sessionView: false,
    recordArmed: false,
    recordArmedTrack: -1,
    recordPendingPage: false,
    recordCountingIn: false,
    countInDspPrev: false,
    countInStartTick: 0,
    countInQuarterTicks: 1,
    transportStartTick: -1,
    heldStep: -1,
    masterPos: 0,
    dspLooperState: 0,
    dspMergeState: 0,
    flashEighth: false,
    flashSixteenth: false,
    pendingMergeArm: false,
    pendingMergePlacement: false,
    pendingBankRefresh: -1,
    currentSetUuid: "",
    schwungCoRunSlot: -1,
    moveCoRunTrack: -1,
    globalMenuOpen: true,
    lastSentMenuEditValue: "x",
    seqLastStep: -1,
    seqLastClip: -1,
    seqNoteOnClipTick: -1,
    seqNoteGateTicks: 0,
    pendingDefaultSetParams: [] as Array<{ key: string; val: string }>,
    seqActiveNotes: new Set<number>(),
    trackPadMode: [DRUM, 0], // track 0 drum, track 1 melodic
    trackCurrentStep: grid(NUM_TRACKS, () => -1),
    trackActiveClip: grid(NUM_TRACKS, () => 0),
    lastDspActiveClip: grid(NUM_TRACKS, () => 0),
    trackQueuedClip: grid(NUM_TRACKS, () => -1),
    trackClipPlaying: grid(NUM_TRACKS, () => false),
    trackWillRelaunch: grid(NUM_TRACKS, () => false),
    trackPendingPageStop: grid(NUM_TRACKS, () => false),
    trackCurrentPage: grid(NUM_TRACKS, () => 0),
    activeDrumLane: grid(NUM_TRACKS, () => 0),
    drumCurrentStep: grid(NUM_TRACKS, () => -1),
    drumStepPage: grid(NUM_TRACKS, () => 0),
    drumLaneMute: grid(NUM_TRACKS, () => false),
    drumLaneFlashTick: grid(NUM_TRACKS, () => grid(DRUM_LANES, () => 0)),
    drumLaneNote: grid(NUM_TRACKS, () => grid(DRUM_LANES, () => 36)),
    tarpHeldNotes: grid(NUM_TRACKS, () => new Set<number>()),
    bankParams: grid(NUM_TRACKS, () => grid(8, () => grid(8, () => 0))),
    clipSeqFollow: grid(NUM_TRACKS, () => grid(2, () => false)),
    clipSteps: grid(NUM_TRACKS, () => grid(2, () => grid(NUM_STEPS, () => 0))),
    clipNonEmpty: grid(NUM_TRACKS, () => grid(2, () => false)),
    clipLength: grid(NUM_TRACKS, () => grid(2, () => 16)),
    clipTPS: grid(NUM_TRACKS, () => grid(2, () => 24)),
    clipAtHas: grid(NUM_TRACKS, () => grid(2, () => false)),
    clipAdaptiveMode: grid(NUM_TRACKS, () => grid(2, () => false)),
    clipLengthManuallySet: grid(NUM_TRACKS, () => grid(2, () => false)),
    drumClipNonEmpty: grid(NUM_TRACKS, () => grid(2, () => false)),
    drumLaneLengthManuallySet: grid(NUM_TRACKS, () => false),
    ccActiveLane: grid(NUM_TRACKS, () => 0),
    ccLaneTps: grid(NUM_TRACKS, () => grid(2, () => grid(1, () => 0))),
    ccLaneResTps: grid(NUM_TRACKS, () => grid(2, () => grid(1, () => 0))),
    ccLaneLength: grid(NUM_TRACKS, () => grid(2, () => grid(1, () => 0))),
  };
  return { ...s, ...overrides };
}

// Build a 56-field snapshot array (joined later by the orchestrator; the steps
// take the already-split array directly). Defaults all-zero.
function snap(set: Record<number, string> = {}): string[] {
  const v = Array.from({ length: 56 }, () => "0");
  for (const [i, val] of Object.entries(set)) v[Number(i)] = val;
  return v;
}

describe("pollCoRunReconcile (Block A)", () => {
  test("no-op when corunState dep is absent", () => {
    const c = calls();
    const S = makeState({ schwungCoRunSlot: 0, moveCoRunTrack: 0 });
    pollCoRunReconcile(S, makeDeps(c));
    expect(c.names()).toEqual([]);
    expect(S.schwungCoRunSlot).toBe(0);
  });

  test("framework-cleared schwung slot triggers exitSchwungCoRun + menu close", () => {
    const c = calls();
    const S = makeState({ schwungCoRunSlot: 3, globalMenuOpen: true, lastSentMenuEditValue: "x" });
    // corun reports no chain-edit target (id -1 path)
    pollCoRunReconcile(S, makeDeps(c, { corunState: () => ({ target: 99, id: 5 }) }));
    expect(c.names()).toContain("exitSchwungCoRun");
    expect(S.globalMenuOpen).toBe(false);
    expect(S.lastSentMenuEditValue).toBeNull();
  });

  test("framework-cleared move-native track triggers exitMoveNativeCoRun", () => {
    const c = calls();
    const S = makeState({ moveCoRunTrack: 1 });
    pollCoRunReconcile(S, makeDeps(c, { corunState: () => ({ target: 99, id: 5 }) }));
    expect(c.names()).toContain("exitMoveNativeCoRun");
  });

  test("active targets are left alone", () => {
    const c = calls();
    const S = makeState({ schwungCoRunSlot: 3, moveCoRunTrack: 1 });
    // chain-edit slot 3 still active, move-native track 1 still active
    const deps = makeDeps(c, { corunState: () => ({ target: CORUN_CHAIN_EDIT, id: 3 }) });
    pollCoRunReconcile(S, deps);
    expect(c.names()).not.toContain("exitSchwungCoRun");
    // move-native: target is chain-edit, so _track = -1 -> exit fires for track
    expect(c.names()).toContain("exitMoveNativeCoRun");
  });
});

describe("pollAutomationAtIndicator (Block B)", () => {
  test("bank 6 melodic: at_has=1 sets clipAtHas true", () => {
    const c = calls();
    const S = makeState({ activeBank: 6, activeTrack: 1 });
    pollAutomationAtIndicator(S, makeDeps(c, { getParamMap: { t1_c0_at_has: "1" } }));
    expect((S.clipAtHas as boolean[][])[1][0]).toBe(true);
  });

  test("bank 6 melodic: at_has=0 sets clipAtHas false", () => {
    const c = calls();
    const S = makeState({ activeBank: 6, activeTrack: 1 });
    (S.clipAtHas as boolean[][])[1][0] = true;
    pollAutomationAtIndicator(S, makeDeps(c, { getParamMap: { t1_c0_at_has: "0" } }));
    expect((S.clipAtHas as boolean[][])[1][0]).toBe(false);
  });

  test("null get_param leaves clipAtHas unchanged", () => {
    const c = calls();
    const S = makeState({ activeBank: 6, activeTrack: 1 });
    (S.clipAtHas as boolean[][])[1][0] = true;
    pollAutomationAtIndicator(S, makeDeps(c)); // map empty -> null
    expect((S.clipAtHas as boolean[][])[1][0]).toBe(true);
  });

  test("not bank 6: no get_param call", () => {
    const c = calls();
    const S = makeState({ activeBank: 0 });
    pollAutomationAtIndicator(S, makeDeps(c));
    expect(c.names()).not.toContain("getParam");
  });

  test("drum track on bank 6: skipped", () => {
    const c = calls();
    const S = makeState({ activeBank: 6, activeTrack: 0 }); // track 0 is drum
    pollAutomationAtIndicator(S, makeDeps(c));
    expect(c.names()).not.toContain("getParam");
  });
});

describe("pollSnapshotTracks (Block D)", () => {
  test("sets playing + per-track current step", () => {
    const c = calls();
    const S = makeState();
    pollSnapshotTracks(S, makeDeps(c), snap({ 0: "1", 1: "4", 2: "7" }));
    expect(S.playing).toBe(true);
    expect((S.trackCurrentStep as number[])[0]).toBe(4);
    expect((S.trackCurrentStep as number[])[1]).toBe(7);
  });

  test("clip change while playing refreshes bank params (+ drum sync for drum track)", () => {
    const c = calls();
    const S = makeState({ lastDspActiveClip: [0, 0] });
    // track 0 (drum) active clip -> 1, track 1 (melodic) active clip -> 1
    pollSnapshotTracks(S, makeDeps(c), snap({ 0: "1", 9: "1", 10: "1" }));
    expect((S.trackActiveClip as number[])[0]).toBe(1);
    expect((S.lastDspActiveClip as number[])[0]).toBe(1);
    // drum track 0 got the meta/steps resync; melodic track 1 only bank refresh
    expect(c.names()).toContain("syncDrumLanesMeta");
    expect(c.names()).toContain("syncDrumLaneSteps");
    expect(c.log.filter((e) => e[0] === "refreshPerClipBankParams").length).toBe(2);
  });

  test("queued clip change marks screenDirty", () => {
    const c = calls();
    const S = makeState({ trackQueuedClip: [-1, -1] });
    pollSnapshotTracks(S, makeDeps(c), snap({ 17: "2" }));
    expect((S.trackQueuedClip as number[])[0]).toBe(2);
    expect(S.screenDirty).toBe(true);
  });

  test("not playing: active clip not updated", () => {
    const c = calls();
    const S = makeState({ trackActiveClip: [0, 0] });
    pollSnapshotTracks(S, makeDeps(c), snap({ 0: "0", 9: "1" }));
    expect((S.trackActiveClip as number[])[0]).toBe(0);
    expect(c.names()).not.toContain("refreshPerClipBankParams");
  });
});

describe("pollSnapshotClipStates (Block E)", () => {
  test("returns countInDspActive from v[25]", () => {
    const c = calls();
    expect(pollSnapshotClipStates(makeState(), makeDeps(c), snap({ 25: "1" }))).toBe(true);
    expect(pollSnapshotClipStates(makeState(), makeDeps(c), snap({ 25: "0" }))).toBe(false);
  });

  test("sets per-track playing / will-relaunch / pending-page-stop", () => {
    const c = calls();
    const S = makeState();
    pollSnapshotClipStates(S, makeDeps(c), snap({ 26: "1", 34: "1", 42: "1" }));
    expect((S.trackClipPlaying as boolean[])[0]).toBe(true);
    expect((S.trackWillRelaunch as boolean[])[0]).toBe(true);
    expect((S.trackPendingPageStop as boolean[])[0]).toBe(true);
    expect(S.screenDirty).toBe(true);
  });

  test("no change -> screenDirty stays false", () => {
    const c = calls();
    const S = makeState();
    pollSnapshotClipStates(S, makeDeps(c), snap());
    expect(S.screenDirty).toBe(false);
  });
});

describe("pollMergeStateMachine (Block F)", () => {
  test("parses flash flags, master pos, looper + merge state", () => {
    const c = calls();
    const S = makeState();
    pollMergeStateMachine(S, makeDeps(c), snap({ 50: "1", 51: "1", 53: "120", 54: "3", 55: "1" }));
    expect(S.flashEighth).toBe(true);
    expect(S.flashSixteenth).toBe(true);
    expect(S.masterPos).toBe(120);
    expect(S.dspLooperState).toBe(3);
    expect(S.dspMergeState).toBe(1);
  });

  test("pendingMergeArm cleared", () => {
    const c = calls();
    const S = makeState({ pendingMergeArm: true });
    pollMergeStateMachine(S, makeDeps(c), snap());
    expect(S.pendingMergeArm).toBe(false);
  });

  test("merge arm write remains reconciled by DSP poll state", () => {
    const c = calls();
    const S = makeState({
      pendingMergeArm: true,
      pendingDefaultSetParams: [{ key: "merge_arm", val: "1" }],
    });

    pollMergeStateMachine(S, makeDeps(c), snap({ 55: "1" }));

    expect(S.pendingMergeArm).toBe(false);
    expect(S.dspMergeState).toBe(1);
    expect(S.pendingMergePlacement).toBe(false);
    expect(S.pendingDefaultSetParams).toEqual([{ key: "merge_arm", val: "1" }]);
    expect(c.log).toEqual([]);
  });

  test("transition into CAPTURED (4) shows placement dialog", () => {
    const c = calls();
    const S = makeState({ dspMergeState: 1 });
    pollMergeStateMachine(S, makeDeps(c), snap({ 55: "4" }));
    expect(S.pendingMergePlacement).toBe(true);
    expect(S.screenDirty).toBe(true);
  });

  test("transition to IDLE (0) from non-zero re-reads clips + clears Sample LED", () => {
    const c = calls();
    const S = makeState({ dspMergeState: 3 });
    pollMergeStateMachine(S, makeDeps(c), snap({ 55: "0" }));
    expect(c.log).toContainEqual(["setButtonLED", MOVE_SAMPLE, LED_OFF]);
    expect(c.names()).toContain("syncClipsFromDsp");
    expect(c.names()).not.toContain("showActionPopup");
  });

  test("transition to IDLE from MAX-LENGTH (2) pops the warning", () => {
    const c = calls();
    const S = makeState({ dspMergeState: 2 });
    pollMergeStateMachine(S, makeDeps(c), snap({ 55: "0" }));
    expect(c.log).toContainEqual(["showActionPopup", "MAX LENGTH", "REACHED"]);
  });
});

describe("pollDeferredBankRefresh (Block G)", () => {
  test("refreshes the pending track then resets", () => {
    const c = calls();
    const S = makeState({ pendingBankRefresh: 1 });
    pollDeferredBankRefresh(S, makeDeps(c));
    expect(c.log).toContainEqual(["refreshPerClipBankParams", 1]);
    expect(S.pendingBankRefresh).toBe(-1);
    expect(S.screenDirty).toBe(true);
  });

  test("no pending: no-op", () => {
    const c = calls();
    const S = makeState({ pendingBankRefresh: -1 });
    pollDeferredBankRefresh(S, makeDeps(c));
    expect(c.names()).not.toContain("refreshPerClipBankParams");
  });
});

describe("pollPlayheadPads (Block H)", () => {
  test("drum: playhead step change updates drumCurrentStep + screenDirty", () => {
    const c = calls();
    const S = makeState({ activeTrack: 0 }); // drum
    pollPlayheadPads(S, makeDeps(c, { getParamMap: { t0_l0_current_step: "5" } }));
    expect((S.drumCurrentStep as number[])[0]).toBe(5);
    expect(S.screenDirty).toBe(true);
  });

  test("drum: active-lane bitmask populates seqActiveNotes + flash ticks", () => {
    const c = calls();
    const S = makeState({ activeTrack: 0, playing: true });
    (S.trackClipPlaying as boolean[])[0] = true;
    (S.drumLaneNote as number[][])[0][0] = 36;
    (S.drumLaneNote as number[][])[0][2] = 40;
    pollPlayheadPads(
      S,
      makeDeps(c, { getParamMap: { t0_l0_current_step: "0", t0_drum_active_lanes: "5" } }),
    ); // bit0 + bit2
    expect([...(S.seqActiveNotes as Set<number>)].sort((a, b) => a - b)).toEqual([36, 40]);
    expect((S.drumLaneFlashTick as number[][])[0][0]).toBe(S.tickCount);
    expect((S.drumLaneFlashTick as number[][])[0][2]).toBe(S.tickCount);
  });

  test("melodic + TARP latch on: held buffer mirrored into tarpHeldNotes", () => {
    const c = calls();
    const S = makeState({ activeTrack: 1 }); // melodic
    (S.bankParams as number[][][])[1][5][7] = 1; // latch
    (S.bankParams as number[][][])[1][5][0] = 1; // style
    pollPlayheadPads(S, makeDeps(c, { getParamMap: { t1_tarp_held: "60 64 67" } }));
    expect([...(S.tarpHeldNotes as Set<number>[])[1]].sort((a, b) => a - b)).toEqual([60, 64, 67]);
  });

  test("melodic + latch off: previously-held notes cleared", () => {
    const c = calls();
    const S = makeState({ activeTrack: 1 });
    (S.tarpHeldNotes as Set<number>[])[1] = new Set([60, 64]);
    pollPlayheadPads(S, makeDeps(c)); // latch flags 0 -> clear branch
    expect((S.tarpHeldNotes as Set<number>[])[1].size).toBe(0);
  });
});

describe("pollSeqFollowPage (Block I)", () => {
  test("normal bank: pages active track to follow current step", () => {
    const c = calls();
    const S = makeState({ activeTrack: 1, playing: true, activeBank: 0 });
    (S.clipSeqFollow as boolean[][])[1][0] = true;
    (S.trackClipPlaying as boolean[])[1] = true;
    (S.trackCurrentStep as number[])[1] = 20; // page 1
    pollSeqFollowPage(S, makeDeps(c));
    expect((S.trackCurrentPage as number[])[1]).toBe(1);
    expect(S.screenDirty).toBe(true);
  });

  test("CC bank 6 melodic: pages from masterPos lane math", () => {
    const c = calls();
    const S = makeState({ activeTrack: 1, playing: true, activeBank: 6, masterPos: 600 });
    (S.clipSeqFollow as boolean[][])[1][0] = true;
    (S.trackClipPlaying as boolean[])[1] = true;
    (S.ccLaneTps as number[][][])[1][0][0] = 24;
    (S.ccLaneResTps as number[][][])[1][0][0] = 24;
    (S.ccLaneLength as number[][][])[1][0][0] = 32; // 32 steps * 24 tps = 768 ticks/loop
    // progress = 600/768 = .781 -> laneStep = floor(.781*32)=25 -> page 1
    pollSeqFollowPage(S, makeDeps(c));
    expect((S.trackCurrentPage as number[])[1]).toBe(1);
  });

  test("not playing: no-op", () => {
    const c = calls();
    const S = makeState({ playing: false });
    (S.clipSeqFollow as boolean[][])[1][0] = true;
    pollSeqFollowPage(S, makeDeps(c));
    expect((S.trackCurrentPage as number[])[1]).toBe(0);
  });
});

describe("pollRecordPendingPage (Block J)", () => {
  test("clears recordPendingPage once DSP reports 0", () => {
    const c = calls();
    const S = makeState({ recordPendingPage: true, recordArmedTrack: 1 });
    pollRecordPendingPage(S, makeDeps(c, { getParamMap: { t1_recording_pending_page: "0" } }));
    expect(S.recordPendingPage).toBe(false);
  });

  test("stays pending while DSP still reports non-zero", () => {
    const c = calls();
    const S = makeState({ recordPendingPage: true, recordArmedTrack: 1 });
    pollRecordPendingPage(S, makeDeps(c, { getParamMap: { t1_recording_pending_page: "1" } }));
    expect(S.recordPendingPage).toBe(true);
  });

  test("no-op when not pending", () => {
    const c = calls();
    const S = makeState({ recordPendingPage: false });
    pollRecordPendingPage(S, makeDeps(c));
    expect(c.names()).not.toContain("getParam");
  });
});

describe("pollCountInEnd (Block K)", () => {
  test("count-in falling edge while playing resets count-in state", () => {
    const c = calls();
    const S = makeState({ countInDspPrev: true, playing: true, recordCountingIn: true });
    pollCountInEnd(S, makeDeps(c), /*countInDspActive*/ false);
    expect(S.recordCountingIn).toBe(false);
    expect(S.countInStartTick).toBe(-1);
    expect(S.countInQuarterTicks).toBe(0);
    expect(S.countInDspPrev).toBe(false); // mirrors current
  });

  test("updates countInDspPrev to current active even without an edge", () => {
    const c = calls();
    const S = makeState({ countInDspPrev: false, recordCountingIn: true });
    pollCountInEnd(S, makeDeps(c), true);
    expect(S.recordCountingIn).toBe(true); // unchanged
    expect(S.countInDspPrev).toBe(true);
  });
});

describe("pollTransportTransitions (Block L)", () => {
  test("transport start auto-launches focused empty clip via pendingDefaultSetParams", () => {
    const c = calls();
    const S = makeState({
      playingPrev: false,
      playing: true,
      activeTrack: 1,
      sessionView: false,
      pendingDefaultSetParams: [{ key: "older", val: "1" }],
    });
    (S.trackQueuedClip as number[])[1] = -1;
    (S.trackActiveClip as number[])[1] = 0;
    pollTransportTransitions(S, makeDeps(c));
    expect(S.transportStartTick).toBe(S.tickCount);
    expect(S.pendingDefaultSetParams).toEqual([
      { key: "older", val: "1" },
      { key: "t1_launch_clip", val: "0" },
    ]);
    expect((S.trackQueuedClip as number[])[1]).toBe(0);
    expect(c.log).toEqual([["focusedClipIsEmpty", 1]]);
    expect(S.playingPrev).toBe(true);
  });

  test("record-armed start launches the armed clip via direct set_param", () => {
    const c = calls();
    const S = makeState({
      playingPrev: false,
      playing: true,
      sessionView: true, // skip focused-clip path
      recordArmed: true,
      recordArmedTrack: 0,
    });
    (S.clipNonEmpty as boolean[][])[0][0] = true;
    (S.trackQueuedClip as number[])[0] = -1;
    pollTransportTransitions(S, makeDeps(c));
    expect(c.log).toContainEqual(["setParam", "t0_launch_clip", "0"]);
    expect(S.pendingDefaultSetParams).toEqual([]);
    expect((S.trackQueuedClip as number[])[0]).toBe(0);
  });

  test("transport stop disarms record and unlatches all tracks", () => {
    const c = calls();
    const S = makeState({ playingPrev: true, playing: false });
    pollTransportTransitions(S, makeDeps(c));
    expect(c.names()).toContain("disarmRecord");
    expect(c.names()).toContain("unlatchAllTracks");
    expect(S.playingPrev).toBe(false);
  });

  test("steady state: only playingPrev mirror, no launches", () => {
    const c = calls();
    const S = makeState({ playingPrev: true, playing: true });
    pollTransportTransitions(S, makeDeps(c));
    expect(c.names()).not.toContain("disarmRecord");
    expect((S.pendingDefaultSetParams as unknown[]).length).toBe(0);
    expect(S.playingPrev).toBe(true);
  });
});

describe("pollStepLedRefresh (Block M)", () => {
  test("recording: bulk steps string mirrored into clipSteps", () => {
    const c = calls();
    const S = makeState({ recordArmed: true, playing: true, activeTrack: 1 });
    const bulk = "1" + "0".repeat(254) + "2"; // step0=note, last=tie
    pollStepLedRefresh(S, makeDeps(c, { getParamMap: { t1_c0_steps: bulk } }));
    expect((S.clipSteps as number[][][])[1][0][0]).toBe(1);
    expect((S.clipSteps as number[][][])[1][0][255]).toBe(2);
    expect((S.clipNonEmpty as boolean[][])[1][0]).toBe(true);
    expect(S.screenDirty).toBe(true);
  });

  test("idle (not recording, no held step): no-op", () => {
    const c = calls();
    const S = makeState({ recordArmed: false, playing: false, heldStep: -1 });
    pollStepLedRefresh(S, makeDeps(c));
    expect(c.names()).not.toContain("getParam");
  });
});

describe("pollSeqActiveNotes (Block N)", () => {
  test("not playing: clears tracking", () => {
    const c = calls();
    const S = makeState({ playing: false, seqLastStep: 4, seqLastClip: 0 });
    (S.seqActiveNotes as Set<number>).add(60);
    pollSeqActiveNotes(S, makeDeps(c));
    expect((S.seqActiveNotes as Set<number>).size).toBe(0);
    expect(S.seqLastStep).toBe(-1);
    expect(S.seqLastClip).toBe(-1);
  });

  test("step advance onto a note populates seqActiveNotes from DSP", () => {
    const c = calls();
    const S = makeState({ playing: true, activeTrack: 1, seqLastStep: 0, seqLastClip: 0 });
    (S.trackActiveClip as number[])[1] = 0;
    (S.trackCurrentStep as number[])[1] = 3;
    (S.clipSteps as number[][][])[1][0][3] = 1; // step 3 has a note
    pollSeqActiveNotes(
      S,
      makeDeps(c, {
        getParamMap: {
          t1_c0_step_3_notes: "60 67",
          t1_current_clip_tick: "10",
          t1_c0_step_3_gate: "12",
        },
      }),
    );
    expect([...(S.seqActiveNotes as Set<number>)].sort((a, b) => a - b)).toEqual([60, 67]);
    expect(S.seqLastStep).toBe(3);
    expect(S.seqNoteGateTicks).toBe(12);
  });

  test("same step, gate expired: clears sustaining notes", () => {
    const c = calls();
    const S = makeState({
      playing: true,
      activeTrack: 1,
      seqLastStep: 3,
      seqLastClip: 0,
      seqNoteOnClipTick: 0,
      seqNoteGateTicks: 5,
    });
    (S.trackActiveClip as number[])[1] = 0;
    (S.trackCurrentStep as number[])[1] = 3; // unchanged -> gate-tracking branch
    (S.seqActiveNotes as Set<number>).add(60);
    // current tick 20, gate 5 -> elapsed 20 >= 5 -> clear
    pollSeqActiveNotes(S, makeDeps(c, { getParamMap: { t1_current_clip_tick: "20" } }));
    expect((S.seqActiveNotes as Set<number>).size).toBe(0);
  });

  test("same step, gate still open: notes kept", () => {
    const c = calls();
    const S = makeState({
      playing: true,
      activeTrack: 1,
      seqLastStep: 3,
      seqLastClip: 0,
      seqNoteOnClipTick: 0,
      seqNoteGateTicks: 50,
    });
    (S.trackActiveClip as number[])[1] = 0;
    (S.trackCurrentStep as number[])[1] = 3;
    (S.seqActiveNotes as Set<number>).add(60);
    pollSeqActiveNotes(S, makeDeps(c, { getParamMap: { t1_current_clip_tick: "20" } }));
    expect((S.seqActiveNotes as Set<number>).has(60)).toBe(true);
  });
});

describe("pollDeferredSave (Block O)", () => {
  test("writes sidecar + updates name index when DSP serialized state", () => {
    const c = calls();
    const S = makeState({ currentSetUuid: "abc" });
    pollDeferredSave(S, makeDeps(c, { getParamMap: { state_full: "{...big...}" } }));
    expect(c.log).toContainEqual(["writeFile", "/path/abc.json", "{...big...}"]);
    expect(c.names()).toContain("updateNameIndex");
  });

  test("short/empty state_full skips the write", () => {
    const c = calls();
    const S = makeState({ currentSetUuid: "abc" });
    pollDeferredSave(S, makeDeps(c, { getParamMap: { state_full: "{}" } }));
    expect(c.names()).not.toContain("writeFile");
  });

  test("no currentSetUuid: no get_param, no write", () => {
    const c = calls();
    const S = makeState({ currentSetUuid: "" });
    pollDeferredSave(S, makeDeps(c));
    expect(c.names()).not.toContain("getParam");
    expect(c.names()).not.toContain("writeFile");
  });
});

describe("pollDspWorkflow orchestrator", () => {
  test("co-run reconcile runs before the get-param guard", () => {
    const c = calls();
    const S = makeState({ schwungCoRunSlot: 3, globalMenuOpen: true, lastSentMenuEditValue: "x" });
    const deps = {
      ...makeDeps(c, { corunState: () => ({ target: 99, id: 5 }) }),
      getParam: null,
    };

    pollDspWorkflow(S, deps);

    expect(c.names()).toEqual(["exitSchwungCoRun"]);
    expect(S.globalMenuOpen).toBe(false);
    expect(S.lastSentMenuEditValue).toBeNull();
  });

  test("missing snapshot returns after state_snapshot get_param", () => {
    const c = calls();
    const S = makeState();

    pollDspWorkflow(S, makeDeps(c));

    expect(c.log).toEqual([["getParam", "state_snapshot"]]);
    expect(S.playing).toBe(false);
  });

  test("short snapshot returns before snapshot mutation steps", () => {
    const c = calls();
    const S = makeState();

    pollDspWorkflow(S, makeDeps(c, { getParamMap: { state_snapshot: "1 2 3" } }));

    expect(c.log).toEqual([["getParam", "state_snapshot"]]);
    expect(S.playing).toBe(false);
    expect(S.masterPos).toBe(0);
  });

  test("runs the full reconcile shell in exact order", () => {
    const c = calls();
    const snapshot = snap({
      0: "1",
      1: "4",
      2: "20",
      17: "2",
      18: "-1",
      25: "0",
      53: "600",
    }).join(" ");
    const S = makeState({
      activeTrack: 1,
      activeBank: 6,
      playingPrev: false,
      pendingBankRefresh: 1,
      recordPendingPage: true,
      recordArmedTrack: 1,
      currentSetUuid: "abc",
    });
    (S.clipAtHas as boolean[][])[1][0] = false;
    (S.trackClipPlaying as boolean[])[1] = true;
    (S.clipSeqFollow as boolean[][])[1][0] = true;
    (S.ccLaneTps as number[][][])[1][0][0] = 24;
    (S.ccLaneResTps as number[][][])[1][0][0] = 24;
    (S.ccLaneLength as number[][][])[1][0][0] = 32;
    (S.bankParams as number[][][])[1][5][7] = 1;
    (S.bankParams as number[][][])[1][5][0] = 1;

    pollDspWorkflow(
      S,
      makeDeps(c, {
        getParamMap: {
          t1_c0_at_has: "1",
          state_snapshot: snapshot,
          t1_tarp_held: "60",
          t1_recording_pending_page: "0",
          state_full: "{state}",
        },
      }),
    );

    expect(c.log).toEqual([
      ["getParam", "t1_c0_at_has"],
      ["getParam", "state_snapshot"],
      ["refreshPerClipBankParams", 1],
      ["getParam", "t1_tarp_held"],
      ["getParam", "t1_recording_pending_page"],
      ["focusedClipIsEmpty", 1],
      ["getParam", "state_full"],
      ["writeFile", "/path/abc.json", "{state}"],
      ["updateNameIndex"],
    ]);
    expect(S.playing).toBe(true);
    expect((S.clipAtHas as boolean[][])[1][0]).toBe(true);
    expect(S.recordPendingPage).toBe(false);
    expect((S.tarpHeldNotes as Set<number>[])[1].has(60)).toBe(true);
  });
});
