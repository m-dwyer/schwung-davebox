import { describe, expect, test } from "vitest";
import {
  readDrumActiveLaneFromDsp,
  readDrumRepeatRatesFromDsp,
  readMelodicClipFromDsp,
  resyncDrumTrackImpl,
  readTrackArpStepConfigFromDsp,
  readTrackConfigFromDsp,
  refreshDrumLaneBankParamsFromDsp,
  refreshPerClipBankParamsFromDsp,
  readTargetedClipAutomationFromDsp,
  readTargetedClipRestorePairFromDsp,
} from "@overture-ui/sync/ui_clip_track_sync.mjs";

function createState() {
  return {
    trackActiveClip: [2, 0],
    activeDrumLane: [5, 6],
    clipSteps: Array.from({ length: 2 }, () => Array.from({ length: 4 }, () => new Array(8).fill(9))),
    clipNonEmpty: Array.from({ length: 2 }, () => new Array(4).fill(false)),
    clipLength: Array.from({ length: 2 }, () => new Array(4).fill(16)),
    clipTPS: Array.from({ length: 2 }, () => new Array(4).fill(24)),
    trackCCAutoBits: Array.from({ length: 2 }, () => new Array(4).fill(99)),
    clipCCVal: Array.from({ length: 2 }, () => Array.from({ length: 4 }, () => new Array(8).fill(99))),
    clipAtHas: Array.from({ length: 2 }, () => new Array(4).fill(false)),
  };
}

function createBankState() {
  return {
    trackPadMode: [0, 1],
    activeDrumLane: [0, 3],
    trackActiveClip: [2, 1],
    bankParams: Array.from({ length: 2 }, () => Array.from({ length: 8 }, () => new Array(8).fill(-9))),
    clipTPS: Array.from({ length: 2 }, () => new Array(4).fill(24)),
    clipSeqFollow: Array.from({ length: 2 }, () => new Array(4).fill(false)),
    clipPlaybackDir: Array.from({ length: 2 }, () => new Array(4).fill(9)),
    clipPlaybackAudioReverse: Array.from({ length: 2 }, () => new Array(4).fill(9)),
    noteFXRandomMode: [9, 9],
    midiDlyRandomMode: [9, 9],
    seqArpStepVel: Array.from({ length: 2 }, () => Array.from({ length: 4 }, () => new Array(8).fill(9))),
    seqArpStepInt: Array.from({ length: 2 }, () => Array.from({ length: 4 }, () => new Array(8).fill(9))),
    seqArpStepLoopLen: Array.from({ length: 2 }, () => new Array(4).fill(9)),
    drumLaneTPS: [24, 12],
    drumLaneEuclidN: Array.from({ length: 2 }, () => new Array(8).fill(0)),
    drumLaneQnt: [0, 0],
    drumLaneLenMode: Array.from({ length: 2 }, () => new Array(8).fill(0)),
    drumLanePlaybackDir: Array.from({ length: 2 }, () => new Array(8).fill(9)),
    drumLanePlaybackAudioReverse: Array.from({ length: 2 }, () => new Array(8).fill(9)),
    drumRepeatGate: Array.from({ length: 2 }, () => new Array(8).fill(0)),
    drumRepeatVelScale: Array.from({ length: 2 }, () => Array.from({ length: 8 }, () => new Array(8).fill(0))),
    drumRepeatNudge: Array.from({ length: 2 }, () => Array.from({ length: 8 }, () => new Array(8).fill(0))),
    drumRepeatGateLen: Array.from({ length: 2 }, () => new Array(8).fill(0)),
    screenDirty: false,
  };
}

function createTrackConfigState() {
  return {
    trackChannel: [9, 9],
    trackRoute: [9, 9],
    trackPadMode: [9, 9],
    trackVelOverride: [9, 9],
    trackLooper: [9, 9],
    drumInpQuant: [9, 9],
    bankParams: Array.from({ length: 2 }, () => Array.from({ length: 8 }, () => new Array(8).fill(99))),
  };
}

function createTrackArpState() {
  return {
    tarpStepVel: Array.from({ length: 2 }, () => new Array(8).fill(9)),
    tarpStepInt: Array.from({ length: 2 }, () => new Array(8).fill(9)),
    tarpStepLoopLen: [7, 7],
  };
}

function createDrumRepeatRatesState() {
  return {
    drumRepeat2RatePerLane: Array.from({ length: 2 }, () => new Array(32).fill(9)),
  };
}

describe("Track / Clip Sync melodic readback", () => {
  test("drum-track resync preserves meta, active-lane steps, content, then bank ordering", () => {
    const S = createState();
    const calls: Array<[string, ...unknown[]]> = [];

    resyncDrumTrackImpl(S, {
      syncDrumLanesMeta: (track: number) => calls.push(["syncDrumLanesMeta", track]),
      syncDrumLaneSteps: (track: number, lane: number) => calls.push(["syncDrumLaneSteps", track, lane]),
      syncDrumClipContent: (track: number) => calls.push(["syncDrumClipContent", track]),
      refreshDrumLaneBankParams: (track: number, lane: number) => calls.push(["refreshDrumLaneBankParams", track, lane]),
    }, 1);

    expect(calls).toEqual([
      ["syncDrumLanesMeta", 1],
      ["syncDrumLaneSteps", 1, 6],
      ["syncDrumClipContent", 1],
      ["refreshDrumLaneBankParams", 1, 6],
    ]);
  });

  test("updates steps, content, length, and TPS with deferred-readback inactive step mapping", () => {
    const S = createState();
    const reads: string[] = [];
    const params = new Map<string, string>([
      ["t0_c2_steps", "12000000"],
      ["t0_c2_length", "32"],
      ["t0_c2_tps", "12"],
    ]);

    readMelodicClipFromDsp(S, {
      NUM_STEPS: 8,
      TPS_VALUES: [6, 12, 24],
      host_module_get_param: (key: string) => {
        reads.push(key);
        return params.get(key) ?? null;
      },
      clipHasContent: (track: number, clip: number) => S.clipSteps[track][clip].some((v: number) => v !== 0),
      refreshPerClipBankParams: () => {
        throw new Error("inactive refresh should not run");
      },
    }, 0, 2, {
      preserveInactiveSteps: true,
      refreshActiveBankParams: false,
    });

    expect(S.clipSteps[0][2].slice(0, 4)).toEqual([1, 2, 0, 0]);
    expect(S.clipNonEmpty[0][2]).toBe(true);
    expect(S.clipLength[0][2]).toBe(32);
    expect(S.clipTPS[0][2]).toBe(12);
    expect(reads).toEqual(["t0_c2_steps", "t0_c2_length", "t0_c2_tps"]);
  });

  test("preserves targeted-sync mapping, TPS fallback, and active-clip bank refresh", () => {
    const S = createState();
    const calls: Array<[string, ...unknown[]]> = [];
    const params = new Map<string, string>([
      ["t0_c2_steps", "12000000"],
      ["t0_c2_length", "bad"],
      ["t0_c2_tps", "99"],
    ]);

    readMelodicClipFromDsp(S, {
      NUM_STEPS: 8,
      TPS_VALUES: [6, 12, 24],
      host_module_get_param: (key: string) => {
        calls.push(["get", key]);
        return params.get(key) ?? null;
      },
      clipHasContent: (track: number, clip: number) => S.clipSteps[track][clip].some((v: number) => v !== 0),
      refreshPerClipBankParams: (track: number) => calls.push(["refreshPerClipBankParams", track]),
    }, 0, 2, {
      preserveInactiveSteps: false,
      refreshActiveBankParams: true,
    });

    expect(S.clipSteps[0][2].slice(0, 4)).toEqual([1, 0, 0, 0]);
    expect(S.clipNonEmpty[0][2]).toBe(true);
    expect(S.clipLength[0][2]).toBe(16);
    expect(S.clipTPS[0][2]).toBe(24);
    expect(calls).toEqual([
      ["get", "t0_c2_steps"],
      ["get", "t0_c2_length"],
      ["get", "t0_c2_tps"],
      ["refreshPerClipBankParams", 0],
    ]);
  });

  test("targeted automation readback preserves CC and aftertouch read ordering", () => {
    const S = createState();
    const calls: Array<[string, string]> = [];
    const params = new Map<string, string>([
      ["t1_c3_cc_auto_bits", "5"],
      ["t1_c3_cc_rest", "0 64 127 128 255 -1 bad 7"],
      ["t1_c3_at_has", "1"],
    ]);

    readTargetedClipAutomationFromDsp(S, {
      host_module_get_param: (key: string) => {
        calls.push(["get", key]);
        return params.get(key) ?? null;
      },
    }, 1, 3);

    expect(S.trackCCAutoBits[1][3]).toBe(5);
    expect(S.clipCCVal[1][3]).toEqual([0, 64, 127, -1, -1, -1, -1, 7]);
    expect(S.clipAtHas[1][3]).toBe(true);
    expect(calls).toEqual([
      ["get", "t1_c3_cc_auto_bits"],
      ["get", "t1_c3_cc_rest"],
      ["get", "t1_c3_at_has"],
    ]);
  });

  test("targeted automation readback preserves null and missing-rest fallback behavior", () => {
    const S = createState();
    S.clipCCVal[0][1] = [1, 2, 3, 4, 5, 6, 7, 8];
    S.clipAtHas[0][1] = true;

    readTargetedClipAutomationFromDsp(S, {
      host_module_get_param: (key: string) =>
        key === "t0_c1_cc_auto_bits" ? null : key === "t0_c1_cc_rest" ? "" : null,
    }, 0, 1);

    expect(S.trackCCAutoBits[0][1]).toBe(0);
    expect(S.clipCCVal[0][1]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(S.clipAtHas[0][1]).toBe(false);
  });

  test("drum active-lane readback preserves content, lane meta, steps, then bank ordering", () => {
    const S = createState();
    const calls: Array<[string, ...unknown[]]> = [];

    readDrumActiveLaneFromDsp(S, {
      syncDrumClipContent: (track: number) => calls.push(["syncDrumClipContent", track]),
      syncDrumLanesMeta: (track: number) => calls.push(["syncDrumLanesMeta", track]),
      syncDrumLaneSteps: (track: number, lane: number) => calls.push(["syncDrumLaneSteps", track, lane]),
      refreshDrumLaneBankParams: (track: number, lane: number) => calls.push(["refreshDrumLaneBankParams", track, lane]),
    }, 1);

    expect(calls).toEqual([
      ["syncDrumClipContent", 1],
      ["syncDrumLanesMeta", 1],
      ["syncDrumLaneSteps", 1, 6],
      ["refreshDrumLaneBankParams", 1, 6],
    ]);
  });

  test("targeted restore pair preserves melodic clip then automation ordering", () => {
    const S = createState();
    const calls: Array<[string, ...unknown[]]> = [];
    const params = new Map<string, string>([
      ["t0_c2_steps", "10000000"],
      ["t0_c2_length", "48"],
      ["t0_c2_tps", "6"],
      ["t0_c2_cc_auto_bits", "3"],
      ["t0_c2_cc_rest", "1 2 3 4 5 6 7 8"],
      ["t0_c2_at_has", "1"],
    ]);

    readTargetedClipRestorePairFromDsp(S, {
      NUM_STEPS: 8,
      TPS_VALUES: [6, 12, 24],
      host_module_get_param: (key: string) => {
        calls.push(["get", key]);
        return params.get(key) ?? null;
      },
      clipHasContent: (track: number, clip: number) => S.clipSteps[track][clip].some((v: number) => v !== 0),
      refreshPerClipBankParams: (track: number) => calls.push(["refreshPerClipBankParams", track]),
    }, 0, 2, false);

    expect(S.clipSteps[0][2][0]).toBe(1);
    expect(S.clipLength[0][2]).toBe(48);
    expect(S.clipTPS[0][2]).toBe(6);
    expect(S.trackCCAutoBits[0][2]).toBe(3);
    expect(S.clipCCVal[0][2]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(S.clipAtHas[0][2]).toBe(true);
    expect(calls).toEqual([
      ["get", "t0_c2_steps"],
      ["get", "t0_c2_length"],
      ["get", "t0_c2_tps"],
      ["refreshPerClipBankParams", 0],
      ["get", "t0_c2_cc_auto_bits"],
      ["get", "t0_c2_cc_rest"],
      ["get", "t0_c2_at_has"],
    ]);
  });

  test("targeted restore pair preserves drum content, lane, bank, then automation ordering", () => {
    const S = createState();
    const calls: Array<[string, ...unknown[]]> = [];
    const params = new Map<string, string>([
      ["t1_c3_cc_auto_bits", "11"],
      ["t1_c3_cc_rest", "8 7 6 5 4 3 2 1"],
      ["t1_c3_at_has", "0"],
    ]);

    readTargetedClipRestorePairFromDsp(S, {
      host_module_get_param: (key: string) => {
        calls.push(["get", key]);
        return params.get(key) ?? null;
      },
      syncDrumClipContent: (track: number) => calls.push(["syncDrumClipContent", track]),
      syncDrumLanesMeta: (track: number) => calls.push(["syncDrumLanesMeta", track]),
      syncDrumLaneSteps: (track: number, lane: number) => calls.push(["syncDrumLaneSteps", track, lane]),
      refreshDrumLaneBankParams: (track: number, lane: number) => calls.push(["refreshDrumLaneBankParams", track, lane]),
    }, 1, 3, true);

    expect(S.trackCCAutoBits[1][3]).toBe(11);
    expect(S.clipCCVal[1][3]).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    expect(S.clipAtHas[1][3]).toBe(false);
    expect(calls).toEqual([
      ["syncDrumClipContent", 1],
      ["syncDrumLanesMeta", 1],
      ["syncDrumLaneSteps", 1, 6],
      ["refreshDrumLaneBankParams", 1, 6],
      ["get", "t1_c3_cc_auto_bits"],
      ["get", "t1_c3_cc_rest"],
      ["get", "t1_c3_at_has"],
    ]);
  });
});

describe("Track / Clip Sync bank snapshot readback", () => {
  test("melodic active-clip bank readback preserves DSP read order and snapshot fallbacks", () => {
    const S = createBankState();
    S.clipTPS[0][2] = 6;
    S.clipSeqFollow[0][2] = true;
    const calls: string[] = [];
    const values = Array.from({ length: 44 }, (_, idx) => String(idx + 1));
    values[42] = "99";
    values[43] = "44";
    const params = new Map<string, string>([
      ["t0_c2_pfx_snapshot", values.join(" ")],
      ["t0_clip_playback_dir", "bad"],
      ["t0_clip_playback_audio_reverse", "1"],
    ]);

    refreshPerClipBankParamsFromDsp(S, {
      PAD_MODE_DRUM: 1,
      TPS_VALUES: [6, 12, 24],
      host_module_get_param: (key: string) => {
        calls.push(key);
        return params.get(key) ?? null;
      },
    }, 0);

    expect(calls).toEqual([
      "t0_c2_pfx_snapshot",
      "t0_clip_playback_dir",
      "t0_clip_playback_audio_reverse",
    ]);
    expect(S.bankParams[0][1].slice(0, 8)).toEqual([1, 2, 4, 5, 44, 3, -9, 32]);
    expect(S.noteFXRandomMode[0]).toBe(33);
    expect(S.midiDlyRandomMode[0]).toBe(34);
    expect(S.bankParams[0][2].slice(0, 4)).toEqual([6, 7, 8, 9]);
    expect(S.bankParams[0][3]).toEqual([10, 11, 12, 13, 14, 15, 16, 17]);
    expect(S.bankParams[0][4].slice(0, 6)).toEqual([18, 19, 20, 21, 22, 23]);
    expect(S.seqArpStepVel[0][2]).toEqual([24, 25, 26, 27, 28, 29, 30, 31]);
    expect(S.seqArpStepInt[0][2]).toEqual([35, 36, 37, 38, 39, 40, 41, 42]);
    expect(S.seqArpStepLoopLen[0][2]).toBe(8);
    expect(S.bankParams[0][0][0]).toBe(0);
    expect(S.bankParams[0][0][6]).toBe(0);
    expect(S.clipPlaybackDir[0][2]).toBe(0);
    expect(S.clipPlaybackAudioReverse[0][2]).toBe(1);
    expect(S.bankParams[0][0][7]).toBe(1);
    expect(S.screenDirty).toBe(true);
  });

  test("melodic bank readback returns before playback-dir reads when snapshot is missing or short", () => {
    const S = createBankState();
    const calls: string[] = [];

    refreshPerClipBankParamsFromDsp(S, {
      PAD_MODE_DRUM: 1,
      TPS_VALUES: [6, 12, 24],
      host_module_get_param: (key: string) => {
        calls.push(key);
        return key === "t0_c2_pfx_snapshot" ? "1 2 3" : "unexpected";
      },
    }, 0);

    expect(calls).toEqual(["t0_c2_pfx_snapshot"]);
    expect(S.bankParams[0][1][0]).toBe(-9);
    expect(S.screenDirty).toBe(false);
  });

  test("drum lane bank readback preserves snapshot, playback, repeat-state ordering and fallbacks", () => {
    const S = createBankState();
    S.drumLaneEuclidN[1][3] = 5;
    S.clipSeqFollow[1][1] = true;
    const calls: string[] = [];
    const params = new Map<string, string>([
      ["t1_l3_pfx_snapshot", "10 11 12 20 21 22 23 24 25 26 7"],
      ["t1_l3_playback_dir", "4"],
      ["t1_l3_playback_audio_reverse", "bad"],
      ["t1_l3_repeat_state", "255 1 2 3 4 5 6 7 8 -1 -2 -3 -4 -5 -6 -7 -8 99 0"],
    ]);

    refreshDrumLaneBankParamsFromDsp(S, {
      TPS_VALUES: [6, 12, 24],
      host_module_get_param: (key: string) => {
        calls.push(key);
        return params.get(key) ?? null;
      },
    }, 1, 3);

    expect(calls).toEqual([
      "t1_l3_pfx_snapshot",
      "t1_l3_playback_dir",
      "t1_l3_playback_audio_reverse",
      "t1_l3_repeat_state",
    ]);
    expect(S.bankParams[1][1].slice(0, 3)).toEqual([10, 11, 12]);
    expect(S.drumLaneQnt[1]).toBe(12);
    expect(S.bankParams[1][3].slice(0, 7)).toEqual([20, 21, 22, 23, 24, 25, 26]);
    expect(S.drumLaneLenMode[1][3]).toBe(7);
    expect(S.bankParams[1][0][0]).toBe(1);
    expect(S.bankParams[1][0][4]).toBe(5);
    expect(S.bankParams[1][0][6]).toBe(0);
    expect(S.drumLanePlaybackDir[1][3]).toBe(0);
    expect(S.drumLanePlaybackAudioReverse[1][3]).toBe(0);
    expect(S.bankParams[1][0][7]).toBe(1);
    expect(S.drumRepeatGate[1][3]).toBe(255);
    expect(S.drumRepeatVelScale[1][3]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(S.drumRepeatNudge[1][3]).toEqual([-1, -2, -3, -4, -5, -6, -7, -8]);
    expect(S.drumRepeatGateLen[1][3]).toBe(8);
    expect(S.screenDirty).toBe(true);
  });

  test("per-clip bank readback delegates drum tracks to active-lane readback", () => {
    const S = createBankState();
    const calls: string[] = [];

    refreshPerClipBankParamsFromDsp(S, {
      PAD_MODE_DRUM: 1,
      TPS_VALUES: [6, 12, 24],
      host_module_get_param: (key: string) => {
        calls.push(key);
        return null;
      },
    }, 1);

    expect(calls).toEqual([
      "t1_l3_pfx_snapshot",
      "t1_l3_playback_dir",
      "t1_l3_playback_audio_reverse",
      "t1_l3_repeat_state",
    ]);
    expect(S.screenDirty).toBe(true);
  });
});

describe("Track / Clip Sync track config readback", () => {
  test("preserves track config DSP read order, parsing, and DIQ bank mirror", () => {
    const S = createTrackConfigState();
    const calls: string[] = [];
    const params = new Map<string, string>([
      ["t1_channel", "0"],
      ["t1_route", "external"],
      ["t1_pad_mode", "1"],
      ["t1_track_vel_override", "64"],
      ["t1_track_looper", "2"],
      ["t1_diq", "99"],
    ]);

    readTrackConfigFromDsp(S, {
      host_module_get_param: (key: string) => {
        calls.push(key);
        return params.get(key) ?? null;
      },
    }, 1);

    expect(calls).toEqual([
      "t1_channel",
      "t1_route",
      "t1_pad_mode",
      "t1_track_vel_override",
      "t1_track_looper",
      "t1_diq",
    ]);
    expect(S.trackChannel[1]).toBe(1);
    expect(S.trackRoute[1]).toBe(2);
    expect(S.trackPadMode[1]).toBe(1);
    expect(S.trackVelOverride[1]).toBe(64);
    expect(S.trackLooper[1]).toBe(2);
    expect(S.drumInpQuant[1]).toBe(8);
    expect(S.bankParams[1][7][5]).toBe(8);
  });

  test("preserves missing-value fallbacks and route mapping behavior", () => {
    const S = createTrackConfigState();
    S.trackChannel[0] = 4;
    S.trackRoute[0] = 2;
    S.trackPadMode[0] = 1;
    S.trackVelOverride[0] = 50;
    S.trackLooper[0] = 1;
    S.drumInpQuant[0] = 7;
    S.bankParams[0][7][5] = 7;
    const params = new Map<string, string | null>([
      ["t0_channel", null],
      ["t0_route", "move"],
      ["t0_pad_mode", ""],
      ["t0_track_vel_override", "bad"],
      ["t0_track_looper", null],
      ["t0_diq", "-4"],
    ]);

    readTrackConfigFromDsp(S, {
      host_module_get_param: (key: string) => params.get(key) ?? null,
    }, 0);

    expect(S.trackChannel[0]).toBe(4);
    expect(S.trackRoute[0]).toBe(1);
    expect(S.trackPadMode[0]).toBe(0);
    expect(S.trackVelOverride[0]).toBe(0);
    expect(S.trackLooper[0]).toBe(1);
    expect(S.drumInpQuant[0]).toBe(0);
    expect(S.bankParams[0][7][5]).toBe(0);
  });
});

describe("Track / Clip Sync track arp and repeat rate readback", () => {
  test("track arp step config preserves DSP read order and loop-length fallback", () => {
    const S = createTrackArpState();
    const calls: string[] = [];
    const params = new Map<string, string>([
      ["t1_tarp_sv", "1 2 bad 4 5 6 7 8"],
      ["t1_tarp_si", "8 7 6 5 4 3 2 1"],
      ["t1_tarp_sll", "99"],
    ]);

    readTrackArpStepConfigFromDsp(S, {
      host_module_get_param: (key: string) => {
        calls.push(key);
        return params.get(key) ?? null;
      },
    }, 1);

    expect(calls).toEqual(["t1_tarp_sv", "t1_tarp_si", "t1_tarp_sll"]);
    expect(S.tarpStepVel[1]).toEqual([1, 2, 0, 4, 5, 6, 7, 8]);
    expect(S.tarpStepInt[1]).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    expect(S.tarpStepLoopLen[1]).toBe(8);
  });

  test("track arp step config keeps existing mirrors when velocity read is missing", () => {
    const S = createTrackArpState();
    const calls: string[] = [];

    readTrackArpStepConfigFromDsp(S, {
      host_module_get_param: (key: string) => {
        calls.push(key);
        return key === "t0_tarp_sv" ? "" : "unexpected";
      },
    }, 0);

    expect(calls).toEqual(["t0_tarp_sv"]);
    expect(S.tarpStepVel[0]).toEqual([9, 9, 9, 9, 9, 9, 9, 9]);
    expect(S.tarpStepInt[0]).toEqual([9, 9, 9, 9, 9, 9, 9, 9]);
    expect(S.tarpStepLoopLen[0]).toBe(7);
  });

  test("drum repeat rates readback preserves partial updates and missing fallback", () => {
    const S = createDrumRepeatRatesState();
    const calls: string[] = [];

    readDrumRepeatRatesFromDsp(S, {
      host_module_get_param: (key: string) => {
        calls.push(key);
        return "0 1 2 bad";
      },
    }, 1);

    expect(calls).toEqual(["t1_drum_r2rt"]);
    expect(S.drumRepeat2RatePerLane[1].slice(0, 6)).toEqual([0, 1, 2, 0, 9, 9]);

    readDrumRepeatRatesFromDsp(S, {
      host_module_get_param: () => "",
    }, 1);

    expect(S.drumRepeat2RatePerLane[1].slice(0, 6)).toEqual([0, 1, 2, 0, 9, 9]);
  });
});
