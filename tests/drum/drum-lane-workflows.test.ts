import { describe, expect, test } from "vitest";
import {
  copyDrumClipImpl,
  copyDrumLaneImpl,
  cutDrumClipImpl,
  cutDrumLaneImpl,
  handleDeleteDrumLaneClear,
  handleDrumLaneFactoryReset,
  handleDrumLaneCopyPaste,
  handleDrumLaneMuteSolo,
} from "@overture-ui/drum/ui_drum_lane_workflows.mjs";

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
  const drumLaneSteps = [
    Array.from({ length: 32 }, () => new Array(256).fill("1")),
  ];
  return {
    undoAvailable: false,
    redoAvailable: true,
    undoSeqArpSnapshot: { before: true },
    trackActiveClip: [2],
    drumLaneSteps,
    drumLaneHasNotes: [
      Array.from({ length: 32 }, (_, lane) => lane === 3 || lane === 7),
    ],
    drumClipNonEmpty: [
      [false, false, true, false],
    ],
  };
}

function clipboardState() {
  const S = {
    ...baseState(),
    pendingDefaultSetParams: [] as Array<{ key: string; val: string }>,
    pendingDrumLaneResync: 0,
    pendingDrumLaneResyncTrack: -1,
    pendingDrumLaneResyncLane: -1,
    pendingDrumResync: 0,
    pendingDrumResyncTrack: -1,
    drumLaneLength: [48, 64],
    drumLaneTPS: [12, 36],
    drumRepeatGate: [Array.from({ length: 32 }, (_, lane) => lane)],
    drumRepeatGateLen: [Array.from({ length: 32 }, (_, lane) => lane + 1)],
    drumRepeatVelScale: [
      Array.from({ length: 32 }, (_, lane) => Array.from({ length: 8 }, (_, step) => lane * 10 + step)),
    ],
    drumRepeatNudge: [
      Array.from({ length: 32 }, (_, lane) => Array.from({ length: 8 }, (_, step) => -lane * 10 - step)),
    ],
    drumRepeat2RatePerLane: [Array.from({ length: 32 }, (_, lane) => lane + 3)],
  };
  S.drumLaneSteps[0][3][0] = "A";
  S.drumLaneSteps[0][3][1] = "B";
  S.drumLaneSteps[0][7][0] = "Z";
  return S;
}

describe("drum lane workflows", () => {
  test("copyDrumLane copies step and repeat-groove mirrors, marks undo, and schedules lane resync", () => {
    const S = clipboardState();
    S.pendingDefaultSetParams = [{ key: "older", val: "1" }];
    S.drumLaneHasNotes[0][3] = true;
    S.drumLaneHasNotes[0][7] = false;
    S.drumClipNonEmpty[0][2] = false;

    copyDrumLaneImpl(S, { DRUM_LANES: 32, host_module_set_param: () => {} }, 0, 3, 7);

    expect(S.undoAvailable).toBe(true);
    expect(S.redoAvailable).toBe(false);
    expect(S.undoSeqArpSnapshot).toBe(null);
    expect(S.pendingDefaultSetParams).toEqual([
      { key: "older", val: "1" },
      { key: "t0_l3_copy_to", val: "7" },
    ]);
    expect(S.drumLaneSteps[0][7][0]).toBe("A");
    expect(S.drumLaneSteps[0][7][1]).toBe("B");
    expect(S.drumLaneHasNotes[0][7]).toBe(true);
    expect(S.drumClipNonEmpty[0][2]).toBe(true);
    expect(S.drumRepeatGate[0][7]).toBe(3);
    expect(S.drumRepeatGateLen[0][7]).toBe(4);
    expect(S.drumRepeatVelScale[0][7]).toEqual([30, 31, 32, 33, 34, 35, 36, 37]);
    expect(S.drumRepeatNudge[0][7]).toEqual([-30, -31, -32, -33, -34, -35, -36, -37]);
    expect(S.drumRepeat2RatePerLane[0][7]).toBe(10);
    expect(S.pendingDrumLaneResync).toBe(2);
    expect(S.pendingDrumLaneResyncTrack).toBe(0);
    expect(S.pendingDrumLaneResyncLane).toBe(7);
  });

  test("copyDrumLane is a no-op for same lane or missing host set_param", () => {
    const sameLane = clipboardState();
    copyDrumLaneImpl(sameLane, { DRUM_LANES: 32, host_module_set_param: () => {} }, 0, 3, 3);
    expect(sameLane.pendingDefaultSetParams).toEqual([]);
    expect(sameLane.undoAvailable).toBe(false);

    const noHost = clipboardState();
    copyDrumLaneImpl(noHost, { DRUM_LANES: 32, host_module_set_param: null }, 0, 3, 7);
    expect(noHost.pendingDefaultSetParams).toEqual([]);
    expect(noHost.drumLaneSteps[0][7][0]).toBe("Z");
  });

  test("cutDrumLane moves step and repeat-groove mirrors, recomputes clip non-empty, and schedules lane resync", () => {
    const S = clipboardState();
    S.pendingDefaultSetParams = [{ key: "older", val: "1" }];
    S.drumLaneHasNotes[0][3] = true;
    S.drumLaneHasNotes[0][7] = false;

    cutDrumLaneImpl(S, { DRUM_LANES: 32, host_module_set_param: () => {} }, 0, 3, 7);

    expect(S.pendingDefaultSetParams).toEqual([
      { key: "older", val: "1" },
      { key: "t0_l3_cut_to", val: "7" },
    ]);
    expect(S.drumLaneSteps[0][7][0]).toBe("A");
    expect(S.drumLaneSteps[0][3]).toEqual(new Array(256).fill("0"));
    expect(S.drumLaneHasNotes[0][7]).toBe(true);
    expect(S.drumLaneHasNotes[0][3]).toBe(false);
    expect(S.drumClipNonEmpty[0][2]).toBe(true);
    expect(S.drumRepeatGate[0][7]).toBe(3);
    expect(S.drumRepeatGate[0][3]).toBe(0xff);
    expect(S.drumRepeatGateLen[0][3]).toBe(8);
    expect(S.drumRepeatVelScale[0][3]).toEqual([100, 100, 100, 100, 100, 100, 100, 100]);
    expect(S.drumRepeatNudge[0][3]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(S.drumRepeat2RatePerLane[0][3]).toBe(0);
    expect(S.pendingDrumLaneResyncTrack).toBe(0);
    expect(S.pendingDrumLaneResyncLane).toBe(7);
  });

  test("cutDrumLane recomputes active clip empty when an empty source overwrites the only hit lane", () => {
    const S = clipboardState();
    S.drumLaneHasNotes[0] = Array.from({ length: 32 }, (_, lane) => lane === 7);
    S.drumClipNonEmpty[0][2] = true;

    cutDrumLaneImpl(S, { DRUM_LANES: 32, host_module_set_param: () => {} }, 0, 3, 7);

    expect(S.drumLaneHasNotes[0][3]).toBe(false);
    expect(S.drumLaneHasNotes[0][7]).toBe(false);
    expect(S.drumClipNonEmpty[0][2]).toBe(false);
  });

  test("copyDrumClip mirrors clip content and schedules active destination resync", () => {
    const S = clipboardState();
    S.pendingDefaultSetParams = [{ key: "older", val: "1" }];
    S.trackActiveClip = [2, 1];
    S.drumClipNonEmpty = [
      [false, true, true, false],
      [false, false, false, false],
    ];

    copyDrumClipImpl(S, { DRUM_LANES: 32, host_module_set_param: () => {} }, 0, 2, 1, 1);

    expect(S.undoAvailable).toBe(true);
    expect(S.redoAvailable).toBe(false);
    expect(S.undoSeqArpSnapshot).toBe(null);
    expect(S.pendingDefaultSetParams).toEqual([
      { key: "older", val: "1" },
      { key: "drum_clip_copy", val: "0 2 1 1" },
    ]);
    expect(S.drumClipNonEmpty[1][1]).toBe(true);
    expect(S.pendingDrumResync).toBe(2);
    expect(S.pendingDrumResyncTrack).toBe(1);
  });

  test("copyDrumClip is a no-op for same clip or missing host set_param", () => {
    const sameClip = clipboardState();
    copyDrumClipImpl(sameClip, { DRUM_LANES: 32, host_module_set_param: () => {} }, 0, 2, 0, 2);
    expect(sameClip.pendingDefaultSetParams).toEqual([]);

    const noHost = clipboardState();
    copyDrumClipImpl(noHost, { DRUM_LANES: 32, host_module_set_param: null }, 0, 2, 0, 3);
    expect(noHost.pendingDefaultSetParams).toEqual([]);
    expect(noHost.drumClipNonEmpty[0][3]).toBe(false);
  });

  test("cutDrumClip mirrors destination, clears active source lane mirrors, and schedules destination resync", () => {
    const S = clipboardState();
    S.pendingDefaultSetParams = [{ key: "older", val: "1" }];
    S.trackActiveClip = [2, 1];
    S.drumClipNonEmpty = [
      [false, false, true, false],
      [false, false, false, false],
    ];

    cutDrumClipImpl(S, { DRUM_LANES: 32, host_module_set_param: () => {} }, 0, 2, 1, 1);

    expect(S.pendingDefaultSetParams).toEqual([
      { key: "older", val: "1" },
      { key: "drum_clip_cut", val: "0 2 1 1" },
    ]);
    expect(S.drumClipNonEmpty[1][1]).toBe(true);
    expect(S.drumClipNonEmpty[0][2]).toBe(false);
    expect(S.drumLaneSteps[0][3]).toEqual(new Array(256).fill("0"));
    expect(S.drumLaneHasNotes[0].every(Boolean)).toBe(false);
    expect(S.drumLaneLength[0]).toBe(16);
    expect(S.drumLaneTPS[0]).toBe(24);
    expect(S.pendingDrumResync).toBe(2);
    expect(S.pendingDrumResyncTrack).toBe(1);
  });

  test("cutDrumClip preserves active lane mirrors when cutting an inactive source clip", () => {
    const S = clipboardState();
    S.trackActiveClip = [1];

    cutDrumClipImpl(S, { DRUM_LANES: 32, host_module_set_param: () => {} }, 0, 2, 0, 3);

    expect(S.pendingDefaultSetParams).toEqual([{ key: "drum_clip_cut", val: "0 2 0 3" }]);
    expect(S.drumLaneSteps[0][3][0]).toBe("A");
    expect(S.drumLaneLength[0]).toBe(48);
    expect(S.drumLaneTPS[0]).toBe(12);
  });

  test("Shift+Delete+lane factory reset clears lane mirrors, repeat defaults, and schedules delayed resync", () => {
    const c = calls();
    const S = {
      ...baseState(),
      drumLaneLength: [48],
      drumRepeatGate: [[0xff, 0xaa, 0xff, 0xff, 0xff, 0xff, 0xff, 0x55]],
      drumRepeatGateLen: [[8, 5, 8, 8, 8, 8, 8, 3]],
      drumRepeatVelScale: [
        Array.from({ length: 32 }, () => [11, 12, 13, 14, 15, 16, 17, 18]),
      ],
      drumRepeatNudge: [
        Array.from({ length: 32 }, () => [-1, -2, -3, -4, -5, -6, -7, -8]),
      ],
      drumRepeat2RatePerLane: [
        Array.from({ length: 32 }, (_, lane) => lane + 1),
      ],
      pendingDrumLaneResync: 0,
      pendingDrumLaneResyncTrack: -1,
      pendingDrumLaneResyncLane: -1,
    };

    expect(handleDrumLaneFactoryReset(S, {
      DRUM_LANES: 32,
      host_module_set_param: c.fn("set"),
      setActiveDrumLane: c.fn("setActive"),
      showActionPopup: c.fn("popup"),
      forceRedraw: c.fn("redraw"),
    }, 0, 3)).toBe(true);

    expect(S.undoAvailable).toBe(true);
    expect(S.redoAvailable).toBe(false);
    expect(S.undoSeqArpSnapshot).toBe(null);
    expect(S.drumLaneLength[0]).toBe(16);
    expect(S.drumLaneSteps[0][3]).toEqual(new Array(256).fill("0"));
    expect(S.drumLaneHasNotes[0][3]).toBe(false);
    expect(S.drumLaneHasNotes[0][7]).toBe(true);
    expect(S.drumClipNonEmpty[0][2]).toBe(true);
    expect(S.drumRepeatGate[0][3]).toBe(0xff);
    expect(S.drumRepeatGateLen[0][3]).toBe(8);
    expect(S.drumRepeatVelScale[0][3]).toEqual([100, 100, 100, 100, 100, 100, 100, 100]);
    expect(S.drumRepeatNudge[0][3]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(S.drumRepeat2RatePerLane[0][3]).toBe(0);
    expect(S.pendingDrumLaneResync).toBe(2);
    expect(S.pendingDrumLaneResyncTrack).toBe(0);
    expect(S.pendingDrumLaneResyncLane).toBe(3);
    expect(c.log).toEqual([
      ["set", "t0_l3_hard_reset", "1"],
      ["setActive", 0, 3],
      ["popup", "LANE", "RESET"],
      ["redraw"],
    ]);
  });

  test("factory reset ignores invalid lane targets", () => {
    const c = calls();
    const S = {
      ...baseState(),
      drumLaneLength: [48],
      drumRepeatGate: [[0xff]],
      drumRepeatGateLen: [[8]],
      drumRepeatVelScale: [[new Array(8).fill(90)]],
      drumRepeatNudge: [[new Array(8).fill(1)]],
      drumRepeat2RatePerLane: [[3]],
      pendingDrumLaneResync: 0,
      pendingDrumLaneResyncTrack: -1,
      pendingDrumLaneResyncLane: -1,
    };

    expect(handleDrumLaneFactoryReset(S, {
      DRUM_LANES: 32,
      host_module_set_param: c.fn("set"),
      setActiveDrumLane: c.fn("setActive"),
      showActionPopup: c.fn("popup"),
      forceRedraw: c.fn("redraw"),
    }, 0, 32)).toBe(false);

    expect(S.undoAvailable).toBe(false);
    expect(S.drumLaneLength[0]).toBe(48);
    expect(S.pendingDrumLaneResync).toBe(0);
    expect(c.log).toEqual([]);
  });

  test("Delete+lane clear marks undo, clears only the lane mirror, and preserves non-empty clip state from other lanes", () => {
    const c = calls();
    const S = baseState();

    expect(handleDeleteDrumLaneClear(S, {
      DRUM_LANES: 32,
      host_module_set_param: c.fn("set"),
      setActiveDrumLane: c.fn("setActive"),
      refreshDrumLaneBankParams: c.fn("refresh"),
      showActionPopup: c.fn("popup"),
      forceRedraw: c.fn("redraw"),
    }, 0, 3, {
      markUndo: true,
      popupArgs: ["LANE", "CLEARED"],
    })).toBe(true);

    expect(S.undoAvailable).toBe(true);
    expect(S.redoAvailable).toBe(false);
    expect(S.undoSeqArpSnapshot).toBe(null);
    expect(S.drumLaneSteps[0][3]).toEqual(new Array(256).fill("0"));
    expect(S.drumLaneSteps[0][7][0]).toBe("1");
    expect(S.drumLaneHasNotes[0][3]).toBe(false);
    expect(S.drumClipNonEmpty[0][2]).toBe(true);
    expect(c.log).toEqual([
      ["set", "t0_l3_clear", "1"],
      ["setActive", 0, 3],
      ["popup", "LANE", "CLEARED"],
      ["redraw"],
    ]);
  });

  test("in-line drum-mode Delete clear refreshes lane bank params without changing undo state", () => {
    const c = calls();
    const S = baseState();
    S.drumLaneHasNotes[0][7] = false;

    expect(handleDeleteDrumLaneClear(S, {
      DRUM_LANES: 32,
      host_module_set_param: c.fn("set"),
      setActiveDrumLane: c.fn("setActive"),
      refreshDrumLaneBankParams: c.fn("refresh"),
      showActionPopup: c.fn("popup"),
      forceRedraw: c.fn("redraw"),
    }, 0, 3, {
      refreshBankParams: true,
      popupArgs: ["LANE CLEARED"],
    })).toBe(true);

    expect(S.undoAvailable).toBe(false);
    expect(S.redoAvailable).toBe(true);
    expect(S.undoSeqArpSnapshot).toEqual({ before: true });
    expect(S.drumClipNonEmpty[0][2]).toBe(false);
    expect(c.log).toEqual([
      ["set", "t0_l3_clear", "1"],
      ["setActive", 0, 3],
      ["refresh", 0, 3],
      ["popup", "LANE CLEARED"],
      ["redraw"],
    ]);
  });

  test("Delete+lane clear ignores invalid lane targets", () => {
    const c = calls();
    const S = baseState();

    expect(handleDeleteDrumLaneClear(S, {
      DRUM_LANES: 32,
      host_module_set_param: c.fn("set"),
      setActiveDrumLane: c.fn("setActive"),
      refreshDrumLaneBankParams: c.fn("refresh"),
      showActionPopup: c.fn("popup"),
      forceRedraw: c.fn("redraw"),
    }, 0, -1, {
      markUndo: true,
      refreshBankParams: true,
      popupArgs: ["LANE", "CLEARED"],
    })).toBe(false);

    expect(S.undoAvailable).toBe(false);
    expect(S.drumLaneSteps[0][3][0]).toBe("1");
    expect(c.log).toEqual([]);
  });

  test("Mute+lane toggles lane mute and marks Mute as a consumed modifier", () => {
    const c = calls();
    const S = {
      muteUsedAsModifier: false,
      shiftHeld: false,
      drumLaneMute: [0],
      drumLaneSolo: [0],
    };

    expect(handleDrumLaneMuteSolo(S, {
      DRUM_LANES: 32,
      host_module_set_param: c.fn("set"),
      forceRedraw: c.fn("redraw"),
    }, 0, 4)).toBe(true);

    expect(S.muteUsedAsModifier).toBe(true);
    expect(S.drumLaneMute[0]).toBe(1 << 4);
    expect(S.drumLaneSolo[0]).toBe(0);
    expect(c.log).toEqual([
      ["set", "t0_l4_mute", "1"],
      ["redraw"],
    ]);

    c.log.length = 0;
    expect(handleDrumLaneMuteSolo(S, {
      DRUM_LANES: 32,
      host_module_set_param: c.fn("set"),
      forceRedraw: c.fn("redraw"),
    }, 0, 4)).toBe(true);

    expect(S.drumLaneMute[0]).toBe(0);
    expect(c.log).toEqual([
      ["set", "t0_l4_mute", "0"],
      ["redraw"],
    ]);
  });

  test("Mute+lane clears an existing solo before muting the lane", () => {
    const c = calls();
    const S = {
      muteUsedAsModifier: false,
      shiftHeld: false,
      drumLaneMute: [0],
      drumLaneSolo: [1 << 5],
    };

    expect(handleDrumLaneMuteSolo(S, {
      DRUM_LANES: 32,
      host_module_set_param: c.fn("set"),
      forceRedraw: c.fn("redraw"),
    }, 0, 5)).toBe(true);

    expect(S.drumLaneMute[0]).toBe(1 << 5);
    expect(S.drumLaneSolo[0]).toBe(0);
    expect(c.log).toEqual([
      ["set", "t0_l5_solo", "0"],
      ["set", "t0_l5_mute", "1"],
      ["redraw"],
    ]);
  });

  test("Shift+Mute+lane toggles lane solo and clears an existing mute", () => {
    const c = calls();
    const S = {
      muteUsedAsModifier: false,
      shiftHeld: true,
      drumLaneMute: [1 << 6],
      drumLaneSolo: [0],
    };

    expect(handleDrumLaneMuteSolo(S, {
      DRUM_LANES: 32,
      host_module_set_param: c.fn("set"),
      forceRedraw: c.fn("redraw"),
    }, 0, 6)).toBe(true);

    expect(S.muteUsedAsModifier).toBe(true);
    expect(S.drumLaneMute[0]).toBe(0);
    expect(S.drumLaneSolo[0]).toBe(1 << 6);
    expect(c.log).toEqual([
      ["set", "t0_l6_mute", "0"],
      ["set", "t0_l6_solo", "1"],
      ["redraw"],
    ]);

    c.log.length = 0;
    expect(handleDrumLaneMuteSolo(S, {
      DRUM_LANES: 32,
      host_module_set_param: c.fn("set"),
      forceRedraw: c.fn("redraw"),
    }, 0, 6)).toBe(true);

    expect(S.drumLaneSolo[0]).toBe(0);
    expect(c.log).toEqual([
      ["set", "t0_l6_solo", "0"],
      ["redraw"],
    ]);
  });

  test("Mute/Solo lane workflow ignores invalid lane targets", () => {
    const c = calls();
    const S = {
      muteUsedAsModifier: false,
      shiftHeld: true,
      drumLaneMute: [0],
      drumLaneSolo: [0],
    };

    expect(handleDrumLaneMuteSolo(S, {
      DRUM_LANES: 32,
      host_module_set_param: c.fn("set"),
      forceRedraw: c.fn("redraw"),
    }, 0, 32)).toBe(false);

    expect(S.muteUsedAsModifier).toBe(false);
    expect(S.drumLaneMute[0]).toBe(0);
    expect(S.drumLaneSolo[0]).toBe(0);
    expect(c.log).toEqual([]);
  });

  test("Copy+lane arms a drum lane copy source", () => {
    const c = calls();
    const S = {
      copySrc: null,
      shiftHeld: false,
    };

    expect(handleDrumLaneCopyPaste(S, {
      DRUM_LANES: 32,
      copyDrumLane: c.fn("copy"),
      cutDrumLane: c.fn("cut"),
      setActiveDrumLane: c.fn("setActive"),
      refreshDrumLaneBankParams: c.fn("refresh"),
      invalidateLEDCache: c.fn("invalidate"),
      showActionPopup: c.fn("popup"),
      forceRedraw: c.fn("redraw"),
    }, 2, 9)).toBe(true);

    expect(S.copySrc).toEqual({ kind: "drum_lane", track: 2, lane: 9 });
    expect(c.log).toEqual([
      ["invalidate"],
      ["popup", "COPIED"],
    ]);
  });

  test("Shift+Copy+lane arms a drum lane cut source", () => {
    const c = calls();
    const S = {
      copySrc: null,
      shiftHeld: true,
    };

    expect(handleDrumLaneCopyPaste(S, {
      DRUM_LANES: 32,
      copyDrumLane: c.fn("copy"),
      cutDrumLane: c.fn("cut"),
      setActiveDrumLane: c.fn("setActive"),
      refreshDrumLaneBankParams: c.fn("refresh"),
      invalidateLEDCache: c.fn("invalidate"),
      showActionPopup: c.fn("popup"),
      forceRedraw: c.fn("redraw"),
    }, 2, 9)).toBe(true);

    expect(S.copySrc).toEqual({ kind: "cut_drum_lane", track: 2, lane: 9 });
    expect(c.log).toEqual([
      ["invalidate"],
      ["popup", "CUT"],
    ]);
  });

  test("Copy+lane paste copies within the same track and selects the destination lane", () => {
    const c = calls();
    const S = {
      copySrc: { kind: "drum_lane", track: 2, lane: 4 },
      shiftHeld: false,
    };

    expect(handleDrumLaneCopyPaste(S, {
      DRUM_LANES: 32,
      copyDrumLane: c.fn("copy"),
      cutDrumLane: c.fn("cut"),
      setActiveDrumLane: c.fn("setActive"),
      refreshDrumLaneBankParams: c.fn("refresh"),
      invalidateLEDCache: c.fn("invalidate"),
      showActionPopup: c.fn("popup"),
      forceRedraw: c.fn("redraw"),
    }, 2, 11)).toBe(true);

    expect(S.copySrc).toEqual({ kind: "drum_lane", track: 2, lane: 4 });
    expect(c.log).toEqual([
      ["copy", 2, 4, 11],
      ["setActive", 2, 11],
      ["refresh", 2, 11],
      ["invalidate"],
      ["redraw"],
      ["popup", "PASTED"],
    ]);
  });

  test("Cut+lane paste cuts within the same track and converts the source to copied destination", () => {
    const c = calls();
    const S = {
      copySrc: { kind: "cut_drum_lane", track: 2, lane: 4 },
      shiftHeld: true,
    };

    expect(handleDrumLaneCopyPaste(S, {
      DRUM_LANES: 32,
      copyDrumLane: c.fn("copy"),
      cutDrumLane: c.fn("cut"),
      setActiveDrumLane: c.fn("setActive"),
      refreshDrumLaneBankParams: c.fn("refresh"),
      invalidateLEDCache: c.fn("invalidate"),
      showActionPopup: c.fn("popup"),
      forceRedraw: c.fn("redraw"),
    }, 2, 11)).toBe(true);

    expect(S.copySrc).toEqual({ kind: "drum_lane", track: 2, lane: 11 });
    expect(c.log).toEqual([
      ["cut", 2, 4, 11],
      ["setActive", 2, 11],
      ["refresh", 2, 11],
      ["invalidate"],
      ["redraw"],
      ["popup", "PASTED"],
    ]);
  });

  test("Copy+lane swallows unrelated or cross-track copy sources", () => {
    const c = calls();
    const S: { copySrc: any; shiftHeld: boolean } = {
      copySrc: { kind: "drum_lane", track: 1, lane: 4 },
      shiftHeld: false,
    };

    expect(handleDrumLaneCopyPaste(S, {
      DRUM_LANES: 32,
      copyDrumLane: c.fn("copy"),
      cutDrumLane: c.fn("cut"),
      setActiveDrumLane: c.fn("setActive"),
      refreshDrumLaneBankParams: c.fn("refresh"),
      invalidateLEDCache: c.fn("invalidate"),
      showActionPopup: c.fn("popup"),
      forceRedraw: c.fn("redraw"),
    }, 2, 11)).toBe(true);

    expect(S.copySrc).toEqual({ kind: "drum_lane", track: 1, lane: 4 });
    expect(c.log).toEqual([]);

    S.copySrc = { kind: "step", absStep: 3 };
    expect(handleDrumLaneCopyPaste(S, {
      DRUM_LANES: 32,
      copyDrumLane: c.fn("copy"),
      cutDrumLane: c.fn("cut"),
      setActiveDrumLane: c.fn("setActive"),
      refreshDrumLaneBankParams: c.fn("refresh"),
      invalidateLEDCache: c.fn("invalidate"),
      showActionPopup: c.fn("popup"),
      forceRedraw: c.fn("redraw"),
    }, 2, 11)).toBe(true);

    expect(S.copySrc).toEqual({ kind: "step", absStep: 3 });
    expect(c.log).toEqual([]);
  });

  test("Copy+lane ignores invalid lane targets", () => {
    const c = calls();
    const S = {
      copySrc: null,
      shiftHeld: false,
    };

    expect(handleDrumLaneCopyPaste(S, {
      DRUM_LANES: 32,
      copyDrumLane: c.fn("copy"),
      cutDrumLane: c.fn("cut"),
      setActiveDrumLane: c.fn("setActive"),
      refreshDrumLaneBankParams: c.fn("refresh"),
      invalidateLEDCache: c.fn("invalidate"),
      showActionPopup: c.fn("popup"),
      forceRedraw: c.fn("redraw"),
    }, 2, -1)).toBe(false);

    expect(S.copySrc).toBe(null);
    expect(c.log).toEqual([]);
  });
});
