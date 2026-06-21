import { describe, expect, test } from "vitest";
import {
  applyBankParamImpl,
  applyTrackConfigImpl,
  createParameterBankRuntime,
  readBankParamsImpl,
  resetFxBanksImpl,
  resetPerClipBankParamsToDefaultImpl,
  resetSingleFxBankImpl,
  resetTarpImpl,
} from "@overture-ui/bank/ui_bank_params.mjs";
import { BANKS, TPS_VALUES } from "@overture-ui/core/ui_constants.mjs";
import { S as runtimeState } from "@overture-ui/core/ui_state.mjs";
import { traceDspWrites } from "../helpers/dsp-queue-trace";

// Param-bank read/write/reset cluster. The resets/applies are
// COALESCING-SENSITIVE set_param emitters: these tests pin the exact
// S.pendingDefaultSetParams sequences (incl. the delay_level=127 re-queue),
// the direct setParam calls, and the JS-mirror writes.

const DRUM = 1;
const MELODIC = 0;

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

function grid<T>(dims: number[], fill: () => T): any {
  if (dims.length === 0) return fill();
  const [n, ...rest] = dims;
  return Array.from({ length: n }, () => grid(rest, fill));
}

function makeDeps(
  c: ReturnType<typeof calls>,
  opts: {
    getParamMap?: Record<string, string | null>;
    hasShadowSetParam?: boolean;
    noGet?: boolean;
    noSet?: boolean;
  } = {},
) {
  const map = opts.getParamMap ?? {};
  return {
    getParam: opts.noGet
      ? null
      : (k: string) => {
          c.log.push(["getParam", k]);
          return k in map ? map[k] : null;
        },
    setParam: opts.noSet ? null : c.fn("setParam"),
    hasShadowSetParam: opts.hasShadowSetParam ?? false,
    refreshDrumLaneBankParams: c.fn("refreshDrumLaneBankParams"),
    routeCheckWarnForTrack: c.fn("routeCheckWarnForTrack"),
    syncDrumLanesMeta: c.fn("syncDrumLanesMeta"),
    syncDrumLaneSteps: c.fn("syncDrumLaneSteps"),
    syncDrumClipContent: c.fn("syncDrumClipContent"),
    computePadNoteMap: c.fn("computePadNoteMap"),
    forceRedraw: c.fn("forceRedraw"),
  };
}

function makeState(overrides: Record<string, unknown> = {}) {
  const s: Record<string, unknown> = {
    undoAvailable: false,
    redoAvailable: true,
    screenDirty: false,
    activeTrack: 0,
    activeBank: 0,
    trackPadMode: [MELODIC, MELODIC],
    activeDrumLane: [0, 0],
    trackActiveClip: [0, 0],
    pendingDefaultSetParams: [] as Array<{ key: string; val: string }>,
    pendingPadNoteMapRecompute: false,
    bankParams: grid([2, 8, 8], () => -999),
    seqArpStepVel: grid([2, 2, 8], () => 0),
    seqArpStepInt: grid([2, 2, 8], () => 9),
    seqArpStepLoopLen: grid([2, 2], () => 0),
    tarpStepVel: grid([2, 8], () => 0),
    tarpStepInt: grid([2, 8], () => 9),
    tarpStepLoopLen: [0, 0],
    tarpHeldNotes: [new Set([60]), new Set()],
    trackChannel: [1, 1],
    trackRoute: [0, 0],
    trackAtMode: [0, 0],
    trackVelOverride: [0, 0],
    trackLooper: [0, 0],
    drumVelZoneArmed: [false, false],
    drumLastVelZone: [0, 0],
    trackCCAssign: grid([2, 8], () => 0),
    trackCCType: grid([2, 8], () => 0),
    schLabel: grid([2, 8], () => "x"),
    trackCCAutoBits: grid([2, 2], () => -1),
    clipCCVal: grid([2, 2, 8], () => 0),
    clipAtHas: grid([2, 2], () => false),
    clipSeqFollow: grid([2, 2], () => false),
    clipTPS: grid([2, 2], () => 24),
    clipPlaybackDir: grid([2, 2], () => 0),
    delayClockFb: [0, 0],
    drumLaneQnt: [5, 5],
    recordArmed: false,
    recordCountingIn: false,
    recordArmedTrack: -1,
    padKey: 0,
    ...overrides,
  };
  return s;
}

describe("resetPerClipBankParamsToDefault", () => {
  test("mirrors banks 1-4 to defaults + queues delay_level re-set", () => {
    const c = calls();
    const S = makeState();
    S.pendingDefaultSetParams = [{ key: "older", val: "1" }];
    resetPerClipBankParamsToDefaultImpl(S, makeDeps(c), 0);
    for (const b of [1, 2, 3, 4]) {
      for (let k = 0; k < 8; k++) {
        const pm = BANKS[b].knobs[k];
        if (pm) expect((S.bankParams as any)[0][b][k]).toBe(pm.def);
      }
    }
    expect(S.pendingDefaultSetParams).toEqual([
      { key: "older", val: "1" },
      { key: "t0_c0_pfx_set", val: "delay_level 127" },
    ]);
    expect(S.screenDirty).toBe(true);
  });
});

describe("resetFxBanks", () => {
  test("no setParam → no-op", () => {
    const c = calls();
    const S = makeState();
    resetFxBanksImpl(S, makeDeps(c, { noSet: true }), 0);
    expect(S.pendingDefaultSetParams).toEqual([]);
    expect(S.undoAvailable).toBe(false);
  });

  test("melodic: pfx_reset then delay_level re-set; SEQ ARP mirrors reset", () => {
    const c = calls();
    const S = makeState({ trackActiveClip: [1, 0] });
    S.pendingDefaultSetParams = [{ key: "older", val: "1" }];
    resetFxBanksImpl(S, makeDeps(c), 0);
    expect(S.pendingDefaultSetParams).toEqual([
      { key: "older", val: "1" },
      { key: "t0_pfx_reset", val: "1" },
      { key: "t0_c1_pfx_set", val: "delay_level 127" },
    ]);
    for (let s = 0; s < 8; s++) {
      expect((S.seqArpStepVel as any)[0][1][s]).toBe(4);
      expect((S.seqArpStepInt as any)[0][1][s]).toBe(0);
    }
    expect((S.seqArpStepLoopLen as any)[0][1]).toBe(8);
    expect(S.undoAvailable).toBe(true);
    expect(S.redoAvailable).toBe(false);
  });

  test("drum: per-lane pfx_reset then delay_level re-set", () => {
    const c = calls();
    const S = makeState({ trackPadMode: [DRUM, MELODIC], activeDrumLane: [3, 0] });
    S.pendingDefaultSetParams = [{ key: "older", val: "1" }];
    resetFxBanksImpl(S, makeDeps(c), 0);
    expect(S.pendingDefaultSetParams).toEqual([
      { key: "older", val: "1" },
      { key: "t0_l3_pfx_reset", val: "1" },
      { key: "t0_l3_pfx_set", val: "delay_level 127" },
    ]);
  });
});

describe("resetSingleFxBank", () => {
  test("unknown bankIdx → no-op", () => {
    const c = calls();
    const S = makeState();
    resetSingleFxBankImpl(S, makeDeps(c), 0, 4);
    expect(S.pendingDefaultSetParams).toEqual([]);
    expect(S.undoAvailable).toBe(false);
  });

  test("melodic noteFx (bank 1) → tN_pfx_noteFx_reset only", () => {
    const c = calls();
    const S = makeState();
    S.pendingDefaultSetParams = [{ key: "older", val: "1" }];
    resetSingleFxBankImpl(S, makeDeps(c), 0, 1);
    expect(S.pendingDefaultSetParams).toEqual([
      { key: "older", val: "1" },
      { key: "t0_pfx_noteFx_reset", val: "1" },
    ]);
  });

  test("melodic delay (bank 3) → reset + delay_level re-set", () => {
    const c = calls();
    const S = makeState({ trackActiveClip: [1, 0] });
    S.pendingDefaultSetParams = [{ key: "older", val: "1" }];
    resetSingleFxBankImpl(S, makeDeps(c), 0, 3);
    expect(S.pendingDefaultSetParams).toEqual([
      { key: "older", val: "1" },
      { key: "t0_pfx_delay_reset", val: "1" },
      { key: "t0_c1_pfx_set", val: "delay_level 127" },
    ]);
  });

  test("drum delay (bank 3) → per-lane pfx_set cmd + delay_level re-set", () => {
    const c = calls();
    const S = makeState({ trackPadMode: [DRUM, MELODIC], activeDrumLane: [2, 0] });
    S.pendingDefaultSetParams = [{ key: "older", val: "1" }];
    resetSingleFxBankImpl(S, makeDeps(c), 0, 3);
    expect(S.pendingDefaultSetParams).toEqual([
      { key: "older", val: "1" },
      { key: "t0_l2_pfx_set", val: "pfx_delay_reset 1" },
      { key: "t0_l2_pfx_set", val: "delay_level 127" },
    ]);
  });
});

describe("resetTarp", () => {
  test("no setParam → no-op", () => {
    const c = calls();
    const S = makeState();
    resetTarpImpl(S, makeDeps(c, { noSet: true }), 0);
    expect(S.pendingDefaultSetParams).toEqual([]);
    expect(S.undoAvailable).toBe(false);
  });

  test("queues tarp reset and mirrors ARP IN defaults", () => {
    const c = calls();
    const S = makeState();
    S.pendingDefaultSetParams = [{ key: "older", val: "1" }];
    resetTarpImpl(S, makeDeps(c), 0);
    expect(S.pendingDefaultSetParams).toEqual([
      { key: "older", val: "1" },
      { key: "t0_tarp_reset", val: "1" },
    ]);
    for (let k = 0; k < 8; k++) {
      const pm = BANKS[5].knobs[k];
      if (pm) expect((S.bankParams as any)[0][5][k]).toBe(pm.def);
    }
    expect((S.tarpStepVel as any)[0]).toEqual([4, 4, 4, 4, 4, 4, 4, 4]);
    expect((S.tarpStepInt as any)[0]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect((S.tarpStepLoopLen as any)[0]).toBe(8);
    expect((S.tarpHeldNotes as any)[0].size).toBe(0);
    expect(S.undoAvailable).toBe(true);
    expect(S.redoAvailable).toBe(false);
    expect(S.screenDirty).toBe(true);
  });
});

describe("readBankParams", () => {
  test("no getParam → no-op", () => {
    const c = calls();
    const S = makeState();
    readBankParamsImpl(S, makeDeps(c, { noGet: true }), 0, 0);
    expect(c.names()).toEqual([]);
  });

  test("drum pfx banks (0/1/3) redirect to refreshDrumLaneBankParams", () => {
    for (const bank of [0, 1, 3]) {
      const c = calls();
      const S = makeState({ trackPadMode: [DRUM, MELODIC], activeDrumLane: [4, 0] });
      readBankParamsImpl(S, makeDeps(c), 0, bank);
      expect(c.log).toEqual([["refreshDrumLaneBankParams", 0, 4]]);
    }
  });

  test("bank 4 (ARP OUT): parses pfx_snapshot fields 17..23 into bankParams[t][4][0..6]", () => {
    const c = calls();
    const S = makeState();
    const fields = Array.from({ length: 24 }, (_, i) => String(i));
    readBankParamsImpl(
      S,
      makeDeps(c, { getParamMap: { "t0_c0_pfx_snapshot": fields.join(" ") } }),
      0,
      4,
    );
    for (let k = 0; k < 7; k++) expect((S.bankParams as any)[0][4][k]).toBe(17 + k);
  });

  test("bank 6 (CC): parses assigns/types + per-clip auto bits / rest / at_has", () => {
    const c = calls();
    const S = makeState();
    readBankParamsImpl(
      S,
      makeDeps(c, {
        getParamMap: {
          "t0_cc_assigns": "10 11 12 13 14 15 16 17",
          "t0_cc_types": "1 1 1 1 1 1 1 1",
          "t0_c0_cc_auto_bits": "5",
          "t0_c0_cc_rest": "64 200 0 1 2 3 4 5",
          "t0_c0_at_has": "1",
          "t0_c1_cc_auto_bits": null,
        },
      }),
      0,
      6,
    );
    expect((S.trackCCAssign as any)[0]).toEqual([10, 11, 12, 13, 14, 15, 16, 17]);
    expect((S.trackCCType as any)[0]).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect((S.trackCCAutoBits as any)[0][0]).toBe(5);
    expect((S.trackCCAutoBits as any)[0][1]).toBe(0); // null → 0
    // rest: 64 valid; 200 out-of-range → -1
    expect((S.clipCCVal as any)[0][0][0]).toBe(64);
    expect((S.clipCCVal as any)[0][0][1]).toBe(-1);
    expect((S.clipAtHas as any)[0][0]).toBe(true);
  });

  test("bank 6 Schwung-default path: route 0 + shadow + all types 0 → Sch1-8 + cc_type_assign queue", () => {
    const c = calls();
    const S = makeState({ trackRoute: [0, 0] });
    S.pendingDefaultSetParams = [{ key: "older", val: "1" }];
    readBankParamsImpl(S, makeDeps(c, { hasShadowSetParam: true }), 0, 6);
    expect((S.trackCCType as any)[0]).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
    expect((S.trackCCAssign as any)[0]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect((S.schLabel as any)[0].every((x: unknown) => x === null)).toBe(true);
    expect(traceDspWrites(S, c.log)).toEqual({
      directSetParams: [],
      queuedOperations: [
        { key: "older", val: "1" },
        ...Array.from({ length: 8 }, (_, k) => ({
          key: "t0_cc_type_assign",
          val: `${k} 2 ${k + 1}`,
        })),
      ],
    });
  });

  test("bank 6 Schwung-default skipped when hasShadowSetParam is false", () => {
    const c = calls();
    const S = makeState({ trackRoute: [0, 0] });
    readBankParamsImpl(S, makeDeps(c, { hasShadowSetParam: false }), 0, 6);
    expect(S.pendingDefaultSetParams).toEqual([]);
  });

  test("generic melodic bank populates 8 numeric mirrors from getParam", () => {
    const c = calls();
    const S = makeState();
    // bank 1 (NOTE FX): track-scope knobs read 't0_<dspKey>'
    readBankParamsImpl(
      S,
      makeDeps(c, { getParamMap: { "t0_noteFX_octave": "3" } }),
      0,
      1,
    );
    expect((S.bankParams as any)[0][1][0]).toBe(3); // Oct from param
    // stub knob (index 6 = _X) → def 0
    expect((S.bankParams as any)[0][1][6]).toBe(0);
  });
});

describe("applyTrackConfig", () => {
  test("channel → setParam + mirror + route warn", () => {
    const c = calls();
    const S = makeState();
    applyTrackConfigImpl(S, makeDeps(c), 0, "channel", 7);
    expect(c.log).toEqual([
      ["setParam", "t0_channel", "7"],
      ["routeCheckWarnForTrack", 0],
    ]);
    expect((S.trackChannel as any)[0]).toBe(7);
  });

  test("route encodes external/move/schwung", () => {
    for (const [val, str] of [[2, "external"], [1, "move"], [0, "schwung"]] as const) {
      const c = calls();
      const S = makeState();
      applyTrackConfigImpl(S, makeDeps(c), 0, "route", val);
      expect(c.log[0]).toEqual(["setParam", "t0_route", str]);
      expect((S.trackRoute as any)[0]).toBe(val);
    }
  });

  test("route→Move normalizes lingering Channel aftertouch to Poly", () => {
    const c = calls();
    const S = makeState({ trackAtMode: [2, 0] });
    applyTrackConfigImpl(S, makeDeps(c), 0, "route", 1);
    expect((S.trackAtMode as any)[0]).toBe(1);
  });

  test("pad_mode→Drum syncs drum lanes (active track)", () => {
    const c = calls();
    const S = makeState({ activeTrack: 0, activeBank: 2 });
    applyTrackConfigImpl(S, makeDeps(c), 0, "pad_mode", DRUM);
    expect((S.trackPadMode as any)[0]).toBe(DRUM);
    expect(S.activeBank).toBe(0); // bank 2 hidden on drum
    // pad_mode is forwarded via the leading setParam like every other key.
    expect(c.log[0]).toEqual(["setParam", "t0_pad_mode", "1"]);
    expect(c.names()).toEqual([
      "setParam",
      "syncDrumLanesMeta",
      "syncDrumLaneSteps",
      "syncDrumClipContent",
      "computePadNoteMap",
      "forceRedraw",
    ]);
  });

  test("pad_mode→Keys defers lane resets + flags pad-map recompute", () => {
    const c = calls();
    const S = makeState({ trackPadMode: [DRUM, MELODIC], activeTrack: 0, activeBank: 7 });
    S.pendingDefaultSetParams = [{ key: "older", val: "1" }];
    applyTrackConfigImpl(S, makeDeps(c), 0, "pad_mode", MELODIC);
    expect(S.activeBank).toBe(0); // bank 7 hidden on melodic
    expect(traceDspWrites(S, c.log)).toEqual({
      directSetParams: [{ key: "t0_pad_mode", val: "0" }],
      queuedOperations: [
        { key: "older", val: "1" },
        { key: "t0_active_drum_lane", val: "0" },
        { key: "t0_drum_perform_mode", val: "0" },
      ],
    });
    expect(S.pendingPadNoteMapRecompute).toBe(true);
    expect(c.names()).toContain("forceRedraw");
  });

  test("pad_mode→Keys keeps pad-map recompute coupled to the active track only", () => {
    const c = calls();
    const S = makeState({ trackPadMode: [DRUM, DRUM], activeTrack: 0, activeBank: 0 });
    applyTrackConfigImpl(S, makeDeps(c), 1, "pad_mode", MELODIC);
    expect(traceDspWrites(S, c.log)).toEqual({
      directSetParams: [{ key: "t1_pad_mode", val: "0" }],
      queuedOperations: [
        { key: "t1_active_drum_lane", val: "0" },
        { key: "t1_drum_perform_mode", val: "0" },
      ],
    });
    expect(S.pendingDefaultSetParams).toEqual([
      { key: "t1_active_drum_lane", val: "0" },
      { key: "t1_drum_perform_mode", val: "0" },
    ]);
    expect(S.pendingPadNoteMapRecompute).toBe(false);
    expect(c.names()).not.toContain("forceRedraw");
  });
});

describe("Parameter Bank runtime", () => {
  test("applyTrackConfig keeps route-check popup linkage behind the runtime", () => {
    const c = calls();
    const oldRoute = [...runtimeState.trackRoute];
    const oldChannel = [...runtimeState.trackChannel];
    const oldAtMode = [...runtimeState.trackAtMode];
    try {
      runtimeState.trackRoute[0] = 1;
      runtimeState.trackChannel[0] = 1;
      runtimeState.trackAtMode[0] = 0;
      const runtime = createParameterBankRuntime(runtimeState, {
        createHostParamAdapters: () => ({
          getParam: c.fn("getParam"),
          setParam: c.fn("setParam"),
        }),
        hasShadowSetParam: () => false,
        refreshDrumLaneBankParams: c.fn("refreshDrumLaneBankParams"),
        syncDrumLanesMeta: c.fn("syncDrumLanesMeta"),
        syncDrumLaneSteps: c.fn("syncDrumLaneSteps"),
        syncDrumClipContent: c.fn("syncDrumClipContent"),
        computePadNoteMap: c.fn("computePadNoteMap"),
        forceRedraw: c.fn("forceRedraw"),
        showActionPopup: c.fn("showActionPopup"),
      });

      runtime.applyTrackConfig(0, "route", 0);

      expect(c.log).toEqual([
        ["setParam", "t0_route", "schwung"],
        ["showActionPopup", "ROUTE CHECK", "T1 Move Ch1"],
      ]);
    } finally {
      runtimeState.trackRoute.splice(0, runtimeState.trackRoute.length, ...oldRoute);
      runtimeState.trackChannel.splice(0, runtimeState.trackChannel.length, ...oldChannel);
      runtimeState.trackAtMode.splice(0, runtimeState.trackAtMode.length, ...oldAtMode);
    }
  });
});

describe("applyBankParam", () => {
  test("stub knob → no-op", () => {
    const c = calls();
    const S = makeState();
    applyBankParamImpl(S, makeDeps(c), 0, 1, 6, 50); // bank1 K7 = _X stub
    expect(c.names()).toEqual([]);
  });

  test("seqfollow knob → sets clipSeqFollow, no setParam", () => {
    const c = calls();
    const S = makeState();
    applyBankParamImpl(S, makeDeps(c), 0, 0, 7, 1); // CLIP K8 = SqFl
    expect((S.clipSeqFollow as any)[0][0]).toBe(true);
    expect(c.names()).toEqual([]);
  });

  test("melodic track-scope knob → setParam tN_<dspKey>", () => {
    const c = calls();
    const S = makeState();
    applyBankParamImpl(S, makeDeps(c), 0, 1, 0, 3); // NOTE FX Oct
    expect(c.log).toEqual([["setParam", "t0_noteFX_octave", "3"]]);
  });

  test("drum bank 1-3 → per-lane pfx_set", () => {
    const c = calls();
    const S = makeState({ trackPadMode: [DRUM, MELODIC], activeDrumLane: [2, 0] });
    applyBankParamImpl(S, makeDeps(c), 0, 1, 0, 3); // NOTE FX Oct on drum
    expect(c.log).toEqual([["setParam", "t0_l2_pfx_set", "noteFX_octave 3"]]);
  });

  test("drum delay bank: K6 remaps to delay_clock_fb, K8 blocked", () => {
    const cMap = calls();
    const Smap = makeState({ trackPadMode: [DRUM, MELODIC], activeDrumLane: [0, 0] });
    applyBankParamImpl(Smap, makeDeps(cMap), 0, 3, 5, 4); // K6 (idx 5)
    expect(cMap.log).toEqual([["setParam", "t0_l0_pfx_set", "delay_clock_fb 4"]]);

    const cBlk = calls();
    const Sblk = makeState({ trackPadMode: [DRUM, MELODIC] });
    applyBankParamImpl(Sblk, makeDeps(cBlk), 0, 3, 7, 4); // K8 (idx 7) blocked
    expect(cBlk.names()).toEqual([]);
  });

  test("deferred keys append FIFO through the DSP operation queue", () => {
    const c = calls();
    const S = makeState();
    S.pendingDefaultSetParams = [{ key: "older", val: "1" }];
    applyBankParamImpl(S, makeDeps(c), 0, 4, 4, 2); // SEQ ARP Stps
    applyBankParamImpl(S, makeDeps(c), 0, 5, 4, 1); // ARP IN Stps
    applyBankParamImpl(S, makeDeps(c), 0, 3, 6, 1); // DELAY Rtrg
    expect(c.names()).toEqual([]); // no direct setParam
    expect(S.pendingDefaultSetParams).toEqual([
      { key: "older", val: "1" },
      { key: "t0_seq_arp_steps_mode", val: "2" },
      { key: "t0_tarp_steps_mode", val: "1" },
      { key: "t0_delay_retrig", val: "1" },
    ]);
  });

  test("clip_resolution → mirror clipTPS + setParam idx; blocked while record-armed on track", () => {
    const c = calls();
    const S = makeState();
    applyBankParamImpl(S, makeDeps(c), 0, 0, 0, 3); // CLIP Res idx 3
    expect((S.clipTPS as any)[0][0]).toBe(TPS_VALUES[3]);
    expect(c.log).toEqual([["setParam", "t0_clip_resolution", "3"]]);

    const c2 = calls();
    const S2 = makeState({ recordArmed: true, recordCountingIn: false, recordArmedTrack: 0 });
    applyBankParamImpl(S2, makeDeps(c2), 0, 0, 0, 3);
    expect(c2.names()).toEqual([]); // blocked
  });

  test("clip_playback_dir → mirror + setParam clamped 0..3", () => {
    const c = calls();
    const S = makeState();
    applyBankParamImpl(S, makeDeps(c), 0, 0, 6, 2); // CLIP Dir
    expect((S.clipPlaybackDir as any)[0][0]).toBe(2);
    expect(c.log).toEqual([["setParam", "t0_clip_playback_dir", "2"]]);
  });
});
