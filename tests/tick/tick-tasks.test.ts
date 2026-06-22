import { describe, expect, test } from "vitest";
import {
  runAltModeFlash,
  runCcGradientPalette,
  runCcLiveValPoll,
  runDefaultSetParamDrain,
  runDeferredCcBitsRefresh,
  runDeferredContentResyncTasks,
  runDeferredDrumNoteOffDrain,
  runDeferredLaneEditReadbackTasks,
  runDspMirrorResyncTasks,
  runEndOfTickPersistenceTasks,
  runExternalRouteQueueDrain,
  runExtMidiRemapReapply,
  runGlobalMenuParamPreview,
  runLiveNoteDrain,
  runMetroBeatDetect,
  runMetroNoteOffTask,
  runMoveCoRunTickTasks,
  runOrphanPrune,
  runOverlayTimerExpiries,
  runPadMapSelfHealTask,
  runPendingEditSoundAdvance,
  runPendingPadNoteMapRecompute,
  runPendingSetLoad,
  runPendingTrackConvert,
  runPendingUndoSyncTask,
  runRecordingEventFlush,
  runRepeatRecordingLaneRefreshTask,
  runSceneCacheRefresh,
  runSchLabelFetch,
  runSessionStepHoldToSave,
  runSessionViewEdgeTasks,
  runSideButtonHoldThreshold,
  runSuspendDetection,
  runTransportButtonLEDs,
  runTransposePreviewSelfHeal,
  runViewLEDsAndBlinks,
} from "@overture-ui/tick/ui_tick_tasks.mjs";

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    fn(name: string) {
      return (...args: unknown[]) => log.push([name, ...args]);
    },
  };
}

function dspMirrorDeps(
  c: ReturnType<typeof calls>,
  instanceId = "new-instance",
  stateUuid: string | null = null,
) {
  return {
    host_module_get_param: (key: string) => {
      c.log.push(["get", key]);
      if (key === "instance_id") return instanceId;
      if (key === "state_uuid") return stateUuid;
      return null;
    },
    host_module_set_param: c.fn("set"),
    pollDSP: c.fn("pollDSP"),
    syncClipsFromDsp: c.fn("syncClipsFromDsp"),
    syncMuteSoloFromDsp: c.fn("syncMuteSoloFromDsp"),
    restoreUiSidecar: c.fn("restoreUiSidecar"),
    computePadNoteMap: c.fn("computePadNoteMap"),
    invalidateLEDCache: c.fn("invalidateLEDCache"),
    forceRedraw: c.fn("forceRedraw"),
    move_midi_inject_to_move: c.fn("inject"),
    shadowSetParam: c.fn("shadowSetParam"),
  };
}

/* Auto-route writes S.trackRoute/S.trackChannel + the autoRoute* fields; a settle
 * test that exercises the restoreSidecar path must seed these so beginAutoRoute
 * has somewhere to write. */
function autoRouteStateFields() {
  return {
    trackRoute: new Array(8).fill(0),
    trackChannel: new Array(8).fill(0),
    autoRouteQueue: null as Array<{ emit: number[][]; gap: number }> | null,
    autoRouteGap: 0,
    autoRouteActive: false,
    autoRouteWatchdog: 0,
    autoRouteAppliedUuid: "",
  };
}

describe("tick task drains", () => {
  test("live-note drain waits past step operations and preserves collision ordering", () => {
    const c = calls();
    const pendingLiveNotes = [
      [
        { isOff: false, pitch: 60, vel: 100 },
        { isOff: true, pitch: 60 },
        { isOff: false, pitch: 64, vel: 90 },
        { isOff: true, pitch: 67 },
      ],
      [],
    ];
    const S = { tickCount: 10, stepOpTick: 9 };
    const deps = {
      NUM_TRACKS: 2,
      host_module_set_param: c.fn("set"),
      pendingLiveNotes,
    };

    runLiveNoteDrain(S, deps);
    expect(pendingLiveNotes[0]).toHaveLength(4);
    expect(c.log).toEqual([]);

    S.tickCount = 11;
    runLiveNoteDrain(S, deps);

    expect(pendingLiveNotes[0]).toEqual([]);
    expect(c.log).toEqual([
      ["set", "t0_live_notes", "off 67 on 64 90 on 60 100 off 60"],
    ]);
  });

  test("deferred drum note-off drain flushes pitch queues through liveSendNote", () => {
    const c = calls();
    const pendingDrumNoteOffs = [[36, 37], [] as number[], [48]];

    runDeferredDrumNoteOffDrain({
      NUM_TRACKS: 3,
      pendingDrumNoteOffs,
      liveSendNote: c.fn("liveSendNote"),
    });

    expect(pendingDrumNoteOffs).toEqual([[], [], []]);
    expect(c.log).toEqual([
      ["liveSendNote", 0, 0x80, 36, 0],
      ["liveSendNote", 0, 0x80, 37, 0],
      ["liveSendNote", 2, 0x80, 48, 0],
    ]);
  });

  test("external route queue drain forwards valid queued MIDI messages unless async send is active", () => {
    const c = calls();
    const S = { extSendAsyncEnabled: true };
    const deps = {
      host_module_get_param: c.fn("get"),
      move_midi_external_send: c.fn("external"),
    };

    runExternalRouteQueueDrain(S, deps);
    expect(c.log).toEqual([]);

    S.extSendAsyncEnabled = false;
    runExternalRouteQueueDrain(S, {
      host_module_get_param: (key: string) =>
        key === "ext_queue" ? "144 60 100;invalid;128 60 0;176 7 96" : "",
      move_midi_external_send: c.fn("external"),
    });

    expect(c.log).toEqual([
      ["external", [9, 144, 60, 100]],
      ["external", [8, 128, 60, 0]],
      ["external", [11, 176, 7, 96]],
    ]);
  });

  test("metro note-off task injects once when the scheduled tick is reached", () => {
    const c = calls();
    const S = { metroNoteOffTick: 20, tickCount: 19 };
    const deps = { move_midi_inject_to_move: c.fn("inject") };

    runMetroNoteOffTask(S, deps);
    expect(S.metroNoteOffTick).toBe(20);
    expect(c.log).toEqual([]);

    S.tickCount = 20;
    runMetroNoteOffTask(S, deps);
    expect(S.metroNoteOffTick).toBe(-1);
    expect(c.log).toEqual([["inject", [0x09, 0x80, 108, 0]]]);

    S.tickCount = 21;
    runMetroNoteOffTask(S, deps);
    expect(c.log).toHaveLength(1);
  });

  test("padmap self-heal is inert unless DSP inbound pad handling is enabled", () => {
    const c = calls();
    const S = {
      dspInboundEnabled: false,
      tickCount: 10,
      lastPushedMuted: false,
      sessionView: false,
      padNoteMap: [60],
      trackPadMode: [0],
      trackOctave: [0],
      activeTrack: 0,
    };

    runPadMapSelfHealTask(S, {
      PAD_MODE_DRUM: 1,
      padDispatchMuted: () => true,
      host_module_get_param: c.fn("get"),
      computePadNoteMap: c.fn("compute"),
    });

    expect(c.log).toEqual([]);
  });

  test("padmap self-heal repushes immediately when JS mute state drifts from last push", () => {
    const c = calls();
    const S = {
      dspInboundEnabled: true,
      tickCount: 11,
      lastPushedMuted: false,
      sessionView: false,
      padNoteMap: [60],
      trackPadMode: [0],
      trackOctave: [0],
      activeTrack: 0,
    };

    runPadMapSelfHealTask(S, {
      PAD_MODE_DRUM: 1,
      padDispatchMuted: () => true,
      host_module_get_param: c.fn("get"),
      computePadNoteMap: c.fn("compute"),
    });

    expect(c.log).toEqual([["compute"]]);
  });

  test("padmap self-heal polls DSP every fifth tick and repushes on mute or pad-0 mismatch", () => {
    const c = calls();
    const S = {
      dspInboundEnabled: true,
      tickCount: 15,
      lastPushedMuted: false,
      sessionView: false,
      padNoteMap: [60],
      trackPadMode: [0],
      trackOctave: [1],
      activeTrack: 0,
    };

    runPadMapSelfHealTask(S, {
      PAD_MODE_DRUM: 1,
      padDispatchMuted: () => false,
      host_module_get_param: (key: string) =>
        key === "pad_dispatch_muted" ? "1" : key === "pad_note_map_0" ? "71" : null,
      computePadNoteMap: c.fn("compute"),
    });

    expect(c.log).toEqual([["compute"], ["compute"]]);

    c.log.length = 0;
    S.padNoteMap[0] = 0xff;
    runPadMapSelfHealTask(S, {
      PAD_MODE_DRUM: 1,
      padDispatchMuted: () => false,
      host_module_get_param: (key: string) =>
        key === "pad_dispatch_muted" ? "0" : key === "pad_note_map_0" ? "127" : null,
      computePadNoteMap: c.fn("compute"),
    });

    expect(c.log).toEqual([["compute"]]);
  });

  test("default set-param drain honors hold, load/sync gates, host availability, and FIFO order", () => {
    const c = calls();
    const deps = { host_module_set_param: c.fn("set") };
    const S = {
      clearDrainHold: 2,
      pendingDefaultSetParams: [
        { key: "first", val: "1" },
        { key: "second", val: "2" },
      ],
      pendingSetLoad: false,
      pendingDspSync: 0,
    };

    runDefaultSetParamDrain(S, deps);
    expect(S.clearDrainHold).toBe(1);
    expect(S.pendingDefaultSetParams).toEqual([
      { key: "first", val: "1" },
      { key: "second", val: "2" },
    ]);
    expect(c.log).toEqual([]);

    S.clearDrainHold = 0;
    S.pendingSetLoad = true;
    runDefaultSetParamDrain(S, deps);
    expect(S.pendingDefaultSetParams.map((p: { key: string }) => p.key)).toEqual(["first", "second"]);
    expect(c.log).toEqual([]);

    S.pendingSetLoad = false;
    S.pendingDspSync = 3;
    runDefaultSetParamDrain(S, deps);
    expect(S.pendingDefaultSetParams.map((p: { key: string }) => p.key)).toEqual(["first", "second"]);
    expect(c.log).toEqual([]);

    S.pendingDspSync = 0;
    runDefaultSetParamDrain(S, {});
    expect(S.pendingDefaultSetParams.map((p: { key: string }) => p.key)).toEqual(["first", "second"]);
    expect(c.log).toEqual([]);

    runDefaultSetParamDrain(S, deps);
    expect(S.pendingDefaultSetParams.map((p: { key: string }) => p.key)).toEqual(["second"]);
    expect(c.log).toEqual([["set", "first", "1"]]);

    runDefaultSetParamDrain(S, deps);
    expect(S.pendingDefaultSetParams).toEqual([]);
    expect(c.log).toEqual([
      ["set", "first", "1"],
      ["set", "second", "2"],
    ]);
  });

  test("DSP hot-reload resync is gated by cadence, host availability, and changed non-empty instance id", () => {
    const c = calls();
    const S = {
      tickCount: 99,
      lastDspInstanceId: "old-instance",
      pendingDspSync: 0,
      stateLoading: true,
      trackCurrentStep: [0, 31],
      trackCurrentPage: [9, 9],
    };

    runDspMirrorResyncTasks(S, dspMirrorDeps(c));
    expect(c.log).toEqual([]);
    expect(S.lastDspInstanceId).toBe("old-instance");

    S.tickCount = 100;
    runDspMirrorResyncTasks(S, { ...dspMirrorDeps(c), host_module_set_param: null });
    expect(c.log).toEqual([]);
    expect(S.lastDspInstanceId).toBe("old-instance");

    runDspMirrorResyncTasks(S, dspMirrorDeps(c, "old-instance"));
    expect(c.log).toEqual([["get", "instance_id"]]);
    expect(S.lastDspInstanceId).toBe("old-instance");

    c.log.length = 0;
    S.lastDspInstanceId = "";
    runDspMirrorResyncTasks(S, dspMirrorDeps(c, "first-instance"));
    expect(c.log).toEqual([["get", "instance_id"]]);
    expect(S.lastDspInstanceId).toBe("first-instance");
  });

  test("DSP hot-reload refreshes mirrors in order without sidecar restore or clearing state loading", () => {
    const c = calls();
    const S = {
      tickCount: 200,
      lastDspInstanceId: "old-instance",
      pendingDspSync: 0,
      stateLoading: true,
      trackCurrentStep: [-1, 0, 16, 31],
      trackCurrentPage: [7, 7, 7, 7],
    };

    runDspMirrorResyncTasks(S, dspMirrorDeps(c, "new-instance"));

    expect(S.lastDspInstanceId).toBe("new-instance");
    expect(S.trackCurrentPage).toEqual([0, 0, 1, 1]);
    expect(S.stateLoading).toBe(true);
    expect(c.log).toEqual([
      ["get", "instance_id"],
      ["pollDSP"],
      ["syncClipsFromDsp"],
      ["syncMuteSoloFromDsp"],
      ["computePadNoteMap"],
      ["invalidateLEDCache"],
      ["forceRedraw"],
    ]);
  });

  test("pending DSP sync decrements first and only refreshes mirrors on the zero tick", () => {
    const c = calls();
    const S = {
      tickCount: 201,
      lastDspInstanceId: "old-instance",
      pendingDspSync: 2,
      stateLoading: true,
      trackCurrentStep: [15, 47],
      trackCurrentPage: [8, 8],
      ...autoRouteStateFields(),
    };

    runDspMirrorResyncTasks(S, dspMirrorDeps(c, "new-instance", "set-A"));
    expect(S.pendingDspSync).toBe(1);
    expect(c.log).toEqual([]);

    runDspMirrorResyncTasks(S, dspMirrorDeps(c, "new-instance", "set-A"));
    expect(S.pendingDspSync).toBe(0);
    expect(S.trackCurrentPage).toEqual([0, 2]);
    expect(S.stateLoading).toBe(false);
    /* The settle (restoreSidecar) path reads state_uuid then arms auto-route:
     * beginAutoRoute re-seeds the 4 Schwung slots via shadowSetParam (ch 5-8)
     * between restoreUiSidecar and computePadNoteMap. */
    expect(c.log).toEqual([
      ["pollDSP"],
      ["syncClipsFromDsp"],
      ["syncMuteSoloFromDsp"],
      ["restoreUiSidecar", true],
      ["get", "state_uuid"],
      ["shadowSetParam", 0, "slot:receive_channel", "5"],
      ["shadowSetParam", 1, "slot:receive_channel", "6"],
      ["shadowSetParam", 2, "slot:receive_channel", "7"],
      ["shadowSetParam", 3, "slot:receive_channel", "8"],
      ["computePadNoteMap"],
      ["invalidateLEDCache"],
      ["forceRedraw"],
    ]);
    /* Auto-route fired once for set-A: overlay active, macro queued, uuid pinned. */
    expect(S.autoRouteActive).toBe(true);
    expect(S.autoRouteAppliedUuid).toBe("set-A");
    expect(S.autoRouteQueue && S.autoRouteQueue.length).toBeGreaterThan(0);
    expect(S.trackChannel).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    /* A second settle with the SAME uuid is a no-op for auto-route: the
     * once-per-uuid guard short-circuits, so no further shadowSetParam re-seed. */
    c.log.length = 0;
    S.autoRouteActive = false;
    S.autoRouteQueue = null;
    S.pendingDspSync = 1;
    runDspMirrorResyncTasks(S, dspMirrorDeps(c, "new-instance", "set-A"));
    expect(S.pendingDspSync).toBe(0);
    expect(S.autoRouteActive).toBe(false);
    expect(S.autoRouteQueue).toBeNull();
    expect(c.log.filter(([name]) => name === "shadowSetParam")).toEqual([]);
    expect(c.log).toContainEqual(["get", "state_uuid"]);
  });

  test("Move co-run inject arms the same track-button press queue and drains with defensive Shift-off", () => {
    const c = calls();
    const S = {
      pendingMoveCoRunInject: 1,
      moveCoRunTrack: 1,
      trackChannel: [1, 2, 3, 4],
      moveCoRunPressQueue: null,
      moveCoRunPressGap: 0,
    };

    runMoveCoRunTickTasks(S, { move_midi_inject_to_move: c.fn("inject") });

    expect(S.pendingMoveCoRunInject).toBe(0);
    expect(c.log).toEqual([
      ["inject", [0x0B, 0xB0, 49, 0]],
      ["inject", [0x0B, 0xB0, 43, 127]],
      ["inject", [0x0B, 0xB0, 43, 0]],
    ]);
    expect(S.moveCoRunPressQueue).toEqual([42, 43, 42]);
    expect(S.moveCoRunPressGap).toBe(5);

    runMoveCoRunTickTasks(S, { move_midi_inject_to_move: c.fn("inject") });
    expect(S.moveCoRunPressGap).toBe(4);
    expect(c.log).toHaveLength(3);
  });

  test("pending undo sync decrements first and waits until the zero tick", () => {
    const c = calls();
    const S = {
      pendingUndoSync: 2,
      recordArmed: false,
      recordCountingIn: false,
      recordArmedTrack: -1,
    };
    const deps = {
      host_module_get_param: c.fn("get"),
      host_module_set_param: c.fn("set"),
      syncClipsTargeted: c.fn("syncClipsTargeted"),
      clearRecordingNoteBuffers: c.fn("clearRecordingNoteBuffers"),
      invalidateLEDCache: c.fn("invalidateLEDCache"),
      forceRedraw: c.fn("forceRedraw"),
    };

    runPendingUndoSyncTask(S, deps);

    expect(S.pendingUndoSync).toBe(1);
    expect(c.log).toEqual([]);
  });

  test("pending undo sync reads last restore, syncs targeted clips, and redraws on the zero tick", () => {
    const c = calls();
    const S = {
      pendingUndoSync: 1,
      recordArmed: false,
      recordCountingIn: false,
      recordArmedTrack: -1,
    };

    runPendingUndoSyncTask(S, {
      host_module_get_param: (key: string) => {
        c.log.push(["get", key]);
        return "m 0 2";
      },
      host_module_set_param: c.fn("set"),
      syncClipsTargeted: c.fn("syncClipsTargeted"),
      clearRecordingNoteBuffers: c.fn("clearRecordingNoteBuffers"),
      invalidateLEDCache: c.fn("invalidateLEDCache"),
      forceRedraw: c.fn("forceRedraw"),
    });

    expect(S.pendingUndoSync).toBe(0);
    expect(c.log).toEqual([
      ["get", "last_restore"],
      ["syncClipsTargeted", "m 0 2"],
      ["invalidateLEDCache"],
      ["forceRedraw"],
    ]);
  });

  test("pending undo sync re-arms active recording after clearing stale note buffers", () => {
    const c = calls();
    const S = {
      pendingUndoSync: 1,
      recordArmed: true,
      recordCountingIn: false,
      recordArmedTrack: 3,
    };

    runPendingUndoSyncTask(S, {
      host_module_get_param: (key: string) => {
        c.log.push(["get", key]);
        return "d 3 4";
      },
      host_module_set_param: c.fn("set"),
      syncClipsTargeted: c.fn("syncClipsTargeted"),
      clearRecordingNoteBuffers: c.fn("clearRecordingNoteBuffers"),
      invalidateLEDCache: c.fn("invalidateLEDCache"),
      forceRedraw: c.fn("forceRedraw"),
    });

    expect(c.log).toEqual([
      ["get", "last_restore"],
      ["syncClipsTargeted", "d 3 4"],
      ["clearRecordingNoteBuffers"],
      ["set", "t3_recording", "1"],
      ["invalidateLEDCache"],
      ["forceRedraw"],
    ]);
  });

  test("deferred lane edit readback clears stretch check and rolls back on DSP no-room result", () => {
    const c = calls();
    const S = {
      tickCount: 20,
      pendingAllLanesStretchCheck: 2,
      allLanesQntResetTick: -1,
      allLanesQntResetTrack: -1,
      allLanesResResetTick: -1,
      allLanesResResetTrack: -1,
      allLanesDirResetTick: -1,
      allLanesDirResetTrack: -1,
      bankParams: Array.from({ length: 4 }, () => Array.from({ length: 8 }, () => new Array(8).fill(0))),
      knobLastDir: [0, -1],
      screenDirty: false,
    };
    S.bankParams[2][7][1] = 12;

    runDeferredLaneEditReadbackTasks(S, {
      host_module_get_param: (key: string) => {
        c.log.push(["get", key]);
        return "-1";
      },
      showActionPopup: c.fn("popup"),
    });

    expect(S.pendingAllLanesStretchCheck).toBe(-1);
    expect(S.bankParams[2][7][1]).toBe(13);
    expect(S.screenDirty).toBe(false);
    expect(c.log).toEqual([
      ["get", "t2_all_lanes_stretch_result"],
      ["popup", "NO ROOM"],
    ]);
  });

  test("deferred lane edit readback leaves stretch value alone on non-error result", () => {
    const c = calls();
    const S = {
      tickCount: 20,
      pendingAllLanesStretchCheck: 1,
      allLanesQntResetTick: -1,
      allLanesQntResetTrack: -1,
      allLanesResResetTick: -1,
      allLanesResResetTrack: -1,
      allLanesDirResetTick: -1,
      allLanesDirResetTrack: -1,
      bankParams: Array.from({ length: 2 }, () => Array.from({ length: 8 }, () => new Array(8).fill(0))),
      knobLastDir: [0, 1],
      screenDirty: false,
    };
    S.bankParams[1][7][1] = 12;

    runDeferredLaneEditReadbackTasks(S, {
      host_module_get_param: (key: string) => {
        c.log.push(["get", key]);
        return "0";
      },
      showActionPopup: c.fn("popup"),
    });

    expect(S.pendingAllLanesStretchCheck).toBe(-1);
    expect(S.bankParams[1][7][1]).toBe(12);
    expect(c.log).toEqual([["get", "t1_all_lanes_stretch_result"]]);
  });

  test("deferred lane edit readback resets due all-lane UI mirrors and marks screen dirty", () => {
    const c = calls();
    const S = {
      tickCount: 50,
      pendingAllLanesStretchCheck: -1,
      allLanesQntResetTick: 50,
      allLanesQntResetTrack: 0,
      allLanesResResetTick: 49,
      allLanesResResetTrack: 1,
      allLanesDirResetTick: 51,
      allLanesDirResetTrack: 2,
      bankParams: Array.from({ length: 3 }, () => Array.from({ length: 8 }, () => new Array(8).fill(0))),
      knobLastDir: [0, 1],
      screenDirty: false,
    };
    S.bankParams[0][7][3] = 24;
    S.bankParams[1][7][0] = 12;
    S.bankParams[2][7][6] = 1;

    runDeferredLaneEditReadbackTasks(S, {
      host_module_get_param: c.fn("get"),
      showActionPopup: c.fn("popup"),
    });

    expect(S.bankParams[0][7][3]).toBe(-1);
    expect(S.bankParams[1][7][0]).toBe(-1);
    expect(S.bankParams[2][7][6]).toBe(1);
    expect(S.allLanesQntResetTick).toBe(-1);
    expect(S.allLanesQntResetTrack).toBe(-1);
    expect(S.allLanesResResetTick).toBe(-1);
    expect(S.allLanesResResetTrack).toBe(-1);
    expect(S.allLanesDirResetTick).toBe(51);
    expect(S.allLanesDirResetTrack).toBe(2);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([]);
  });

  test("content resync drains decrement first and fire only on the zero tick", () => {
    const c = calls();
    const S = {
      pendingDrumResync: 2,
      pendingDrumResyncTrack: 3,
      pendingDrumLaneResync: 1,
      pendingDrumLaneResyncTrack: 4,
      pendingDrumLaneResyncLane: 7,
      pendingStepsReread: 1,
      pendingStepsRereadTrack: 0,
      pendingStepsRereadClip: 2,
      pendingSceneBakeResync: 1,
      pendingSceneBakeClip: 5,
      activeDrumLane: [0, 1, 2, 3, 4, 5, 6, 7],
      trackPadMode: [0, 1, 0, 1, 0, 1, 0, 1],
      trackActiveClip: [5, 5, 4, 5, 5, 1, 5, 5],
      clipSteps: Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(16).fill(0))),
      clipNonEmpty: Array.from({ length: 8 }, () => new Array(16).fill(false)),
      clipLength: Array.from({ length: 8 }, () => new Array(16).fill(16)),
      clipTPS: Array.from({ length: 8 }, () => new Array(16).fill(24)),
    };
    const params = new Map<string, string>([
      ["t0_c2_steps", "1000000000000000"],
      ["t0_c2_length", "32"],
      ["t0_c2_tps", "12"],
      ["t0_c5_steps", "2000000000000000"],
      ["t0_c5_length", "48"],
      ["t0_c5_tps", "6"],
      ["t2_c5_steps", "1000000000000000"],
      ["t2_c5_length", "64"],
      ["t2_c5_tps", "24"],
      ["t4_c5_steps", "0000000000000000"],
      ["t4_c5_length", "16"],
      ["t4_c5_tps", "99"],
      ["t6_c5_steps", "1000000000000000"],
      ["t6_c5_length", "8"],
      ["t6_c5_tps", "12"],
    ]);

    const deps = {
      NUM_TRACKS: 8,
      NUM_STEPS: 16,
      PAD_MODE_DRUM: 1,
      TPS_VALUES: [6, 12, 24],
      host_module_get_param: (key: string) => params.get(key) ?? null,
      syncDrumClipContent: c.fn("syncDrumClipContent"),
      syncDrumLanesMeta: c.fn("syncDrumLanesMeta"),
      syncDrumLaneSteps: c.fn("syncDrumLaneSteps"),
      refreshDrumLaneBankParams: c.fn("refreshDrumLaneBankParams"),
      refreshPerClipBankParams: c.fn("refreshPerClipBankParams"),
      clipHasContent: (t: number, clip: number) => S.clipSteps[t][clip].some((v: number) => v !== 0),
      forceRedraw: c.fn("forceRedraw"),
    };

    runDeferredContentResyncTasks(S, deps);

    expect(S.pendingDrumResync).toBe(1);
    expect(c.log).toEqual([
      ["syncDrumLaneSteps", 4, 7],
      ["refreshDrumLaneBankParams", 4, 7],
      ["forceRedraw"],
      ["forceRedraw"],
      ["refreshPerClipBankParams", 0],
      ["syncDrumClipContent", 1],
      ["syncDrumLanesMeta", 1],
      ["syncDrumLaneSteps", 1, 1],
      ["syncDrumClipContent", 3],
      ["syncDrumLanesMeta", 3],
      ["syncDrumLaneSteps", 3, 3],
      ["refreshPerClipBankParams", 4],
      ["refreshPerClipBankParams", 6],
      ["syncDrumClipContent", 7],
      ["syncDrumLanesMeta", 7],
      ["syncDrumLaneSteps", 7, 7],
      ["forceRedraw"],
    ]);
    expect(S.clipSteps[0][2][0]).toBe(1);
    expect(S.clipLength[0][2]).toBe(32);
    expect(S.clipTPS[4][5]).toBe(24);
  });

  test("content resync applies the same melodic clip readback for step reread and scene bake", () => {
    const c = calls();
    const S = {
      pendingDrumResync: 0,
      pendingDrumLaneResync: 0,
      pendingStepsReread: 1,
      pendingStepsRereadTrack: 0,
      pendingStepsRereadClip: 2,
      pendingSceneBakeResync: 1,
      pendingSceneBakeClip: 3,
      activeDrumLane: [0, 0, 0],
      trackPadMode: [0, 0, 1],
      trackActiveClip: [2, 4, 3],
      clipSteps: Array.from({ length: 3 }, () => Array.from({ length: 8 }, () => new Array(8).fill(0))),
      clipNonEmpty: Array.from({ length: 3 }, () => new Array(8).fill(false)),
      clipLength: Array.from({ length: 3 }, () => new Array(8).fill(16)),
      clipTPS: Array.from({ length: 3 }, () => new Array(8).fill(24)),
    };
    const params = new Map<string, string>([
      ["t0_c2_steps", "12000000"],
      ["t0_c2_length", "32"],
      ["t0_c2_tps", "12"],
      ["t0_c3_steps", "20000000"],
      ["t0_c3_length", "48"],
      ["t0_c3_tps", "99"],
      ["t1_c3_steps", "01000000"],
      ["t1_c3_length", "64"],
      ["t1_c3_tps", "6"],
    ]);

    runDeferredContentResyncTasks(S, {
      NUM_TRACKS: 3,
      NUM_STEPS: 8,
      PAD_MODE_DRUM: 1,
      TPS_VALUES: [6, 12, 24],
      host_module_get_param: (key: string) => {
        c.log.push(["get", key]);
        return params.get(key) ?? null;
      },
      syncDrumClipContent: c.fn("syncDrumClipContent"),
      syncDrumLanesMeta: c.fn("syncDrumLanesMeta"),
      syncDrumLaneSteps: c.fn("syncDrumLaneSteps"),
      refreshDrumLaneBankParams: c.fn("refreshDrumLaneBankParams"),
      refreshPerClipBankParams: c.fn("refreshPerClipBankParams"),
      clipHasContent: (t: number, clip: number) => S.clipSteps[t][clip].some((v: number) => v !== 0),
      forceRedraw: c.fn("forceRedraw"),
    });

    expect(S.clipSteps[0][2].slice(0, 3)).toEqual([1, 2, 0]);
    expect(S.clipNonEmpty[0][2]).toBe(true);
    expect(S.clipLength[0][2]).toBe(32);
    expect(S.clipTPS[0][2]).toBe(12);
    expect(S.clipSteps[0][3].slice(0, 2)).toEqual([2, 0]);
    expect(S.clipTPS[0][3]).toBe(24);
    expect(S.clipSteps[1][3].slice(0, 2)).toEqual([0, 1]);
    expect(S.clipLength[1][3]).toBe(64);
    expect(c.log).toEqual([
      ["get", "t0_c2_steps"],
      ["get", "t0_c2_length"],
      ["get", "t0_c2_tps"],
      ["refreshPerClipBankParams", 0],
      ["forceRedraw"],
      ["get", "t0_c3_steps"],
      ["get", "t0_c3_length"],
      ["get", "t0_c3_tps"],
      ["get", "t1_c3_steps"],
      ["get", "t1_c3_length"],
      ["get", "t1_c3_tps"],
      ["syncDrumClipContent", 2],
      ["syncDrumLanesMeta", 2],
      ["syncDrumLaneSteps", 2, 0],
      ["forceRedraw"],
    ]);
  });

  test("repeat recording lane refresh syncs the active drum lane after content resyncs", () => {
    const c = calls();
    const S = {
      recordArmed: true,
      playing: true,
      sessionView: false,
      activeTrack: 2,
      activeDrumLane: [0, 1, 6],
      trackPadMode: [0, 0, 1],
      drumRepeatHeldPad: [-1, -1, 60],
      drumRepeat2HeldLanes: [new Set(), new Set(), new Set()],
      drumRepeat2LatchedLanes: [new Set(), new Set(), new Set()],
    };

    const handled = runRepeatRecordingLaneRefreshTask(S, {
      PAD_MODE_DRUM: 1,
      syncDrumLaneSteps: c.fn("syncDrumLaneSteps"),
      forceRedraw: c.fn("forceRedraw"),
    });

    expect(handled).toBe(true);
    expect(c.log).toEqual([
      ["syncDrumLaneSteps", 2, 6],
      ["forceRedraw"],
    ]);
  });

  test("repeat recording lane refresh is gated to active drum repeat recording", () => {
    const c = calls();
    const base = {
      recordArmed: true,
      playing: true,
      sessionView: false,
      activeTrack: 0,
      activeDrumLane: [3],
      trackPadMode: [1],
      drumRepeatHeldPad: [-1],
      drumRepeat2HeldLanes: [new Set<number>()],
      drumRepeat2LatchedLanes: [new Set<number>()],
    };
    const deps = {
      PAD_MODE_DRUM: 1,
      syncDrumLaneSteps: c.fn("syncDrumLaneSteps"),
      forceRedraw: c.fn("forceRedraw"),
    };

    expect(runRepeatRecordingLaneRefreshTask(base, deps)).toBe(false);
    base.drumRepeat2HeldLanes[0].add(4);
    base.sessionView = true;
    expect(runRepeatRecordingLaneRefreshTask(base, deps)).toBe(false);
    base.sessionView = false;
    base.trackPadMode[0] = 0;
    expect(runRepeatRecordingLaneRefreshTask(base, deps)).toBe(false);
    base.trackPadMode[0] = 1;
    base.playing = false;
    expect(runRepeatRecordingLaneRefreshTask(base, deps)).toBe(false);

    expect(c.log).toEqual([]);
  });

  test("end-of-tick persistence preserves save, exit, hide, and snapshot priority", () => {
    const c = calls();
    const baseDeps = {
      updateNameIndex: c.fn("updateNameIndex"),
      host_module_set_param: c.fn("set"),
      removeFlagsWrap: c.fn("removeFlagsWrap"),
      invalidateLEDCache: c.fn("invalidateLEDCache"),
      clearAllLEDs: c.fn("clearAllLEDs"),
      setButtonLED: c.fn("setButtonLED"),
      host_exit_module: c.fn("exit"),
      host_hide_module: c.fn("hide"),
      commitSnapshot: c.fn("commitSnapshot"),
      LED_OFF: 0,
    };

    const saveState = { pendingSuspendSave: true, pendingExitAfterSave: true, pendingHideAfterSave: true, pendingSnapshotCopy: { id: 2, label: "A" } };
    runEndOfTickPersistenceTasks(saveState, baseDeps);
    expect(saveState.pendingSuspendSave).toBe(false);
    expect(saveState.pendingExitAfterSave).toBe(true);
    expect(c.log).toEqual([["updateNameIndex"], ["set", "save", "1"]]);

    c.log.length = 0;
    runEndOfTickPersistenceTasks(saveState, baseDeps);
    expect(saveState.pendingExitAfterSave).toBe(false);
    expect(c.log.at(-1)).toEqual(["exit"]);
    expect(c.log.filter(([name]) => name === "setButtonLED")).toHaveLength(4);

    c.log.length = 0;
    const hideState = { pendingHideAfterSave: true };
    runEndOfTickPersistenceTasks(hideState, baseDeps);
    expect(hideState.pendingHideAfterSave).toBe(false);
    expect(c.log.at(-1)).toEqual(["hide"]);

    c.log.length = 0;
    const snapState = { currentSetUuid: "uuid", pendingSnapshotCopy: { id: 7, label: "B" } };
    runEndOfTickPersistenceTasks(snapState, baseDeps);
    expect(snapState.pendingSnapshotCopy).toBeNull();
    expect(c.log).toEqual([["commitSnapshot", "uuid", 7, "B"]]);
  });
});

describe("pre-LED reconcile tick steps (batch A1-A12)", () => {
  test("runPendingTrackConvert fires conversion and clears the pending field", () => {
    const c = calls();
    const deps = { convertTrackType: c.fn("convert") };

    const idle = { pendingTrackConvert: null };
    runPendingTrackConvert(idle, deps);
    expect(c.log).toEqual([]);

    const S = { pendingTrackConvert: { t: 2, toDrum: true } };
    runPendingTrackConvert(S, deps);
    expect(S.pendingTrackConvert).toBeNull();
    expect(c.log).toEqual([["convert", 2, true]]);
  });

  test("runPendingPadNoteMapRecompute only fires when the default-drain queue is empty", () => {
    const c = calls();
    const deps = { computePadNoteMap: c.fn("recompute") };

    // gated: queue non-empty
    runPendingPadNoteMapRecompute(
      { pendingPadNoteMapRecompute: true, pendingDefaultSetParams: [1], clearDrainHold: 0 },
      deps,
    );
    // gated: clearDrainHold active
    runPendingPadNoteMapRecompute(
      { pendingPadNoteMapRecompute: true, pendingDefaultSetParams: [], clearDrainHold: 1 },
      deps,
    );
    // gated: flag not set
    runPendingPadNoteMapRecompute(
      { pendingPadNoteMapRecompute: false, pendingDefaultSetParams: [], clearDrainHold: 0 },
      deps,
    );
    expect(c.log).toEqual([]);

    const S = { pendingPadNoteMapRecompute: true, pendingDefaultSetParams: [], clearDrainHold: 0 };
    runPendingPadNoteMapRecompute(S, deps);
    expect(S.pendingPadNoteMapRecompute).toBe(false);
    expect(c.log).toEqual([["recompute"]]);
  });

  test("runExtMidiRemapReapply re-applies only when the remap inputs change", () => {
    const c = calls();
    const deps = { applyExtMidiRemap: c.fn("remap") };
    const S = {
      activeTrack: 1,
      trackRoute: [0, 5, 0],
      trackChannel: [0, 3, 0],
      midiInChannel: 9,
      _lastRemapTrack: -1,
      _lastRemapRoute: -1,
      _lastRemapChannel: -1,
      _lastRemapMidiIn: -2,
    };
    runExtMidiRemapReapply(S, deps);
    expect(c.log).toEqual([["remap"]]);
    expect(S._lastRemapTrack).toBe(1);
    expect(S._lastRemapRoute).toBe(5);
    expect(S._lastRemapChannel).toBe(3);
    expect(S._lastRemapMidiIn).toBe(9);

    // unchanged → no re-apply
    c.log.length = 0;
    runExtMidiRemapReapply(S, deps);
    expect(c.log).toEqual([]);

    // a single input change re-triggers
    S.midiInChannel = 10;
    runExtMidiRemapReapply(S, deps);
    expect(c.log).toEqual([["remap"]]);
    expect(S._lastRemapMidiIn).toBe(10);
  });

  test("runSessionViewEdgeTasks resets TARP latch on entry and repushes padmap on the edge", () => {
    const c = calls();
    const deps = {
      host_module_set_param: c.fn("set"),
      computePadNoteMap: c.fn("recompute"),
    };
    const bankParams = [[[], [], [], [], [], [0, 0, 0, 0, 0, 0, 0, 1]]];
    const S = { sessionView: true, _lastSessionView: false, activeTrack: 0, bankParams };

    runSessionViewEdgeTasks(S, deps);
    expect(bankParams[0][5][7]).toBe(0);
    expect(c.log).toEqual([
      ["set", "t0_tarp_latch", "0"],
      ["recompute"],
    ]);
    expect(S._lastSessionView).toBe(true);

    // no edge → no recompute, no tarp reset
    c.log.length = 0;
    runSessionViewEdgeTasks(S, deps);
    expect(c.log).toEqual([]);

    // leaving session view is an edge → recompute (no tarp reset on exit)
    S.sessionView = false;
    runSessionViewEdgeTasks(S, deps);
    expect(c.log).toEqual([["recompute"]]);
    expect(S._lastSessionView).toBe(false);
  });

  test("runDeferredCcBitsRefresh clears step-edit flag and re-reads cc bits/rest", () => {
    const c = calls();
    const deps = {
      host_module_get_param: (key: string) => {
        c.log.push(["get", key]);
        if (key.endsWith("_cc_auto_bits")) return "5";
        if (key.endsWith("_cc_rest")) return "10 -1 200 64 0 0 0 0";
        return null;
      },
      invalidateLEDCache: c.fn("invalidate"),
    };
    const S = {
      ccStepEditActive: true,
      heldStep: -1,
      pendingCCBitsRefresh: 3,
      activeTrack: 1,
      trackCCAutoBits: [[], [0, 0, 0, 0]],
      clipCCVal: [[], [[], [], [], new Array(8).fill(0)]],
    };
    runDeferredCcBitsRefresh(S, deps);
    expect(S.ccStepEditActive).toBe(false);
    expect(S.pendingCCBitsRefresh).toBe(-1);
    expect(S.trackCCAutoBits[1][3]).toBe(5);
    // out-of-range (-1, 200) clamp to -1; in-range preserved
    expect(S.clipCCVal[1][3]).toEqual([10, -1, -1, 64, 0, 0, 0, 0]);
    expect(c.log.at(-1)).toEqual(["invalidate"]);

    // step-edit flag NOT cleared while a step is held; no refresh when idx < 0
    c.log.length = 0;
    const held = { ccStepEditActive: true, heldStep: 4, pendingCCBitsRefresh: -1 };
    runDeferredCcBitsRefresh(held, deps);
    expect(held.ccStepEditActive).toBe(true);
    expect(c.log).toEqual([]);
  });

  test("runCcLiveValPoll fills live CC values only on bank 6 while playing", () => {
    const c = calls();
    const deps = {
      host_module_get_param: (key: string) => {
        c.log.push(["get", key]);
        return "0 64 200 -1 127 0 0 0";
      },
    };
    const S = {
      activeBank: 6,
      playing: true,
      sessionView: false,
      ccStepEditActive: false,
      activeTrack: 2,
      trackCCLiveVal: [[], [], new Array(8).fill(99)],
    };
    runCcLiveValPoll(S, deps);
    expect(S.trackCCLiveVal[2]).toEqual([0, 64, -1, -1, 127, 0, 0, 0]);

    // gated off when not playing
    c.log.length = 0;
    runCcLiveValPoll({ ...S, playing: false }, deps);
    expect(c.log).toEqual([]);
  });

  test("runSchLabelFetch advances one lane per tick and fetches Sch labels", () => {
    const c = calls();
    const deps = {
      shadow_get_param: (slot: number, key: string) => {
        c.log.push(["shadow", slot, key]);
        return "Cutoff";
      },
      schSlotForTrack: () => 1,
    };
    const S = {
      schLabelFetchLane: 0,
      activeTrack: 0,
      trackCCType: [[2, 0, 0, 0, 0, 0, 0, 0]],
      trackCCAssign: [[12, 0, 0, 0, 0, 0, 0, 0]],
      schLabel: [new Array(8).fill(null)],
      screenDirty: false,
    };
    runSchLabelFetch(S, deps);
    expect(S.schLabelFetchLane).toBe(1);
    expect(S.schLabel[0][0]).toBe("Cutoff");
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([["shadow", 1, "knob_12_param"]]);

    // lane 7 → resets sentinel to -1
    S.schLabelFetchLane = 7;
    S.trackCCType[0][7] = 0;
    runSchLabelFetch(S, deps);
    expect(S.schLabelFetchLane).toBe(-1);

    // sentinel -1 → no-op
    c.log.length = 0;
    runSchLabelFetch(S, deps);
    expect(c.log).toEqual([]);
  });

  test("runCcGradientPalette writes palette + transport LEDs once per track on bank 6", () => {
    const c = calls();
    const deps = {
      PAD_MODE_DRUM: 1,
      CC_GRADIENT_LEVELS: 2,
      CC_GRADIENT_SCALARS: [0.5, 1.0],
      CC_GRADIENT_BASE: 60,
      MovePlay: 91,
      MoveRec: 93,
      MoveSample: 94,
      Green: 1,
      Red: 2,
      LED_OFF: 0,
      setPaletteEntryRGB: c.fn("palette"),
      reapplyPalette: c.fn("reapply"),
      setButtonLED: c.fn("led"),
      invalidateLEDCache: c.fn("invalidate"),
    };
    const S = {
      activeBank: 6,
      sessionView: false,
      trackPadMode: [0],
      activeTrack: 0,
      ccGradPaletteTrack: -1,
      playing: true,
      recordArmed: false,
      recordScheduledStop: false,
      dspMergeState: 0,
      _forceKnobReemit: false,
    };
    runCcGradientPalette(S, deps);
    expect(S.ccGradPaletteTrack).toBe(0);
    expect(S._forceKnobReemit).toBe(true);
    expect(c.log.filter(([n]) => n === "palette")).toHaveLength(2);
    expect(c.log).toContainEqual(["palette", 60, 128, 128, 128]);
    expect(c.log).toContainEqual(["led", 91, 1, true]); // play green, force
    expect(c.log).toContainEqual(["led", 93, 0, true]); // rec off, force

    // already painted for this track → no-op
    c.log.length = 0;
    runCcGradientPalette(S, deps);
    expect(c.log).toEqual([]);

    // drum track swallows it
    c.log.length = 0;
    runCcGradientPalette({ ...S, ccGradPaletteTrack: -1, trackPadMode: [1] }, deps);
    expect(c.log).toEqual([]);
  });

  test("runPendingSetLoad sends state_load and arms the dsp resync, gated by the inherit picker", () => {
    const c = calls();
    const deps = {
      host_module_set_param: c.fn("set"),
      disarmRecord: c.fn("disarm"),
    };
    const make = () => ({
      pendingSetLoad: true,
      pendingInheritPicker: false,
      stateLoading: false,
      heldStep: 4,
      heldStepBtn: 4,
      heldStepNotes: [1],
      stepWasEmpty: true,
      stepWasHeld: true,
      seqActiveNotes: new Set([1, 2]),
      seqLastStep: 5,
      seqLastClip: 1,
      pendingDspSync: 0,
      currentSetUuid: "abc",
    });

    const S = make();
    runPendingSetLoad(S, deps);
    expect(S.pendingSetLoad).toBe(false);
    expect(S.stateLoading).toBe(true);
    expect(S.heldStep).toBe(-1);
    expect(S.seqActiveNotes.size).toBe(0);
    expect(S.pendingDspSync).toBe(5);
    expect(c.log).toEqual([["disarm"], ["set", "state_load", "abc"]]);

    // suppressed while inherit picker is open
    c.log.length = 0;
    const picker = { ...make(), pendingInheritPicker: true };
    runPendingSetLoad(picker, deps);
    expect(picker.pendingSetLoad).toBe(true);
    expect(c.log).toEqual([]);
  });

  test("runGlobalMenuParamPreview previews on value change and re-commits on edit exit", () => {
    const setCalls: number[] = [];
    const item = { set: (v: number) => setCalls.push(v), get: () => 120 };
    const S: any = {
      globalMenuOpen: true,
      globalMenuItems: [item],
      globalMenuState: { selectedIndex: 0, editing: true, editValue: 100 },
      lastSentMenuEditValue: null,
      bpmWasEditing: false,
      screenDirty: false,
    };
    runGlobalMenuParamPreview(S);
    expect(setCalls).toEqual([100]);
    expect(S.lastSentMenuEditValue).toBe(100);
    expect(S.bpmWasEditing).toBe(true);
    expect(S.screenDirty).toBe(true);

    // same value → no duplicate set
    runGlobalMenuParamPreview(S);
    expect(setCalls).toEqual([100]);

    // editing stops → re-commit via get() and reset preview memo
    S.globalMenuState.editing = false;
    runGlobalMenuParamPreview(S);
    expect(setCalls).toEqual([100, 120]);
    expect(S.bpmWasEditing).toBe(false);
    expect(S.lastSentMenuEditValue).toBeNull();
  });

  test("runTransposePreviewSelfHeal cancels a stranded preview left off Key/Scale", () => {
    const c = calls();
    const deps = { xposeCancelPreview: c.fn("cancel") };

    // stranded preview, menu closed → cancel
    const closed = {
      xposePrevKey: 2,
      confirmXpose: false,
      globalMenuOpen: false,
      globalMenuState: null,
      globalMenuItems: null,
    };
    runTransposePreviewSelfHeal(closed, deps);
    expect(c.log).toEqual([["cancel"]]);

    // stranded confirm dialog off Key/Scale → cancel + clear flag
    c.log.length = 0;
    const confirm = {
      xposePrevKey: null,
      confirmXpose: true,
      globalMenuOpen: true,
      globalMenuState: { selectedIndex: 0, editing: true },
      globalMenuItems: [{ label: "Swing" }],
    };
    runTransposePreviewSelfHeal(confirm, deps);
    expect(confirm.confirmXpose).toBe(false);
    expect(c.log).toEqual([["cancel"]]);

    // still on Key edit → leave preview alone
    c.log.length = 0;
    const onKey = {
      xposePrevKey: 2,
      confirmXpose: false,
      globalMenuOpen: true,
      globalMenuState: { selectedIndex: 0, editing: true },
      globalMenuItems: [{ label: "Key" }],
    };
    runTransposePreviewSelfHeal(onKey, deps);
    expect(c.log).toEqual([]);
  });
});

describe("render-cadence tick steps (batch B1-B6)", () => {
  const TIMER_DEPS = {
    BANK_DISPLAY_TICKS: 94,
    KNOB_TURN_HIGHLIGHT_TICKS: 47,
    PARAM_PEEK_DETAIL_TICKS: 24,
  };

  test("runOverlayTimerExpiries clears each elapsed timer and marks the screen dirty", () => {
    const S: any = {
      tickCount: 200,
      bankSelectTick: 100, // 100 elapsed >= 94 -> expire
      stretchBlockedEndTick: 150, // <= 200 -> expire
      actionPopupEndTick: 250, // > 200 -> keep
      knobTouched: 2,
      knobTurnedTick: [0, 0, 100], // 100 elapsed >= 47 -> expire (clears knobTouched)
      knobTouchStartTick: 50,
      noNoteFlashEndTick: -1,
      stepSaveFlashEndTick: 199, // <= 200 -> clear flash pair
      stepSaveFlashStartTick: 50,
      screenDirty: false,
    };
    runOverlayTimerExpiries(S, TIMER_DEPS);
    expect(S.bankSelectTick).toBe(-1);
    expect(S.stretchBlockedEndTick).toBe(-1);
    expect(S.actionPopupEndTick).toBe(250); // unchanged
    expect(S.knobTouched).toBe(-1);
    expect(S.knobTouchStartTick).toBe(-1);
    expect(S.stepSaveFlashEndTick).toBe(-1);
    expect(S.stepSaveFlashStartTick).toBe(-1);
    expect(S.screenDirty).toBe(true);
  });

  test("runOverlayTimerExpiries marks dirty on the param-peek detail edge without clearing knobTouched", () => {
    // knob still within highlight window, but exactly at the detail threshold
    const S: any = {
      tickCount: 124,
      bankSelectTick: -1,
      stretchBlockedEndTick: -1,
      actionPopupEndTick: -1,
      knobTouched: 0,
      knobTurnedTick: [120], // 4 elapsed < 47 -> not expired
      knobTouchStartTick: 100, // 24 elapsed === PARAM_PEEK_DETAIL_TICKS
      noNoteFlashEndTick: -1,
      stepSaveFlashEndTick: -1,
      screenDirty: false,
    };
    runOverlayTimerExpiries(S, TIMER_DEPS);
    expect(S.knobTouched).toBe(0); // still touched
    expect(S.screenDirty).toBe(true);
  });

  function holdSaveDeps(c: ReturnType<typeof calls>) {
    return {
      STEP_SAVE_HOLD_TICKS: 47,
      NUM_TRACKS: 2,
      DRUM_LANES: 16,
      STEP_SAVE_FLASH_TICKS: 24,
      host_module_set_param: c.fn("set"),
      showActionPopup: c.fn("popup"),
      forceRedraw: c.fn("redraw"),
    };
  }

  test("runSessionStepHoldToSave saves a perf preset on the perf-context threshold", () => {
    const c = calls();
    const S: any = {
      tickCount: 100,
      sessionStepHeld: 3,
      sessionStepHeldCtx: 1,
      stepBtnPressedTick: [0, 0, 0, 50], // 50 elapsed >= 47
      perfSnapshots: new Array(16).fill(0),
      perfModsToggled: 0b0010,
      perfModsHeld: 0b0100,
    };
    runSessionStepHoldToSave(S, holdSaveDeps(c));
    expect(S.sessionStepHeld).toBe(-1);
    expect(S.perfSnapshots[3]).toBe(0b0110);
    expect(S.stepSaveFlashStartTick).toBe(100);
    expect(S.stepSaveFlashEndTick).toBe(124);
    expect(c.log).toContainEqual(["popup", "PERF PRESET", "SAVED"]);
    expect(c.log.filter(([n]) => n === "set")).toHaveLength(0);
  });

  test("runSessionStepHoldToSave saves mute state with the effective drum-solo mask", () => {
    const c = calls();
    const S: any = {
      tickCount: 100,
      sessionStepHeld: 0,
      sessionStepHeldCtx: 0,
      stepBtnPressedTick: [50],
      snapshots: new Array(16).fill(null),
      trackMuted: [false, true],
      trackSoloed: [false, false],
      // track0: lane0 muted; lane1 soloed -> all-but-lane1 become effectively muted
      drumLaneMute: [0b0001, 0],
      drumLaneSolo: [0b0010, 0],
    };
    runSessionStepHoldToSave(S, holdSaveDeps(c));
    expect(S.sessionStepHeld).toBe(-1);
    // effMask track0 = mute(0b0001) | not-soloed(all bits except bit1) ; track1 = 0
    const expectedEff0 = (0b0001 | (0xffff & ~0b0010)) >>> 0;
    expect(S.snapshots[0]).toEqual({
      mute: [false, true],
      solo: [false, false],
      drumEffMute: [expectedEff0, 0],
    });
    const setCall = c.log.find(([n]) => n === "set");
    expect(setCall).toEqual(["set", "snap_save", `0 0 1 0 0 ${expectedEff0} 0`]);
    expect(c.log).toContainEqual(["popup", "MUTE STATE", "SAVED"]);

    // gated: threshold not yet reached
    c.log.length = 0;
    const early = { ...S, sessionStepHeld: 0, tickCount: 80, stepBtnPressedTick: [50] };
    runSessionStepHoldToSave(early, holdSaveDeps(c));
    expect(early.sessionStepHeld).toBe(0);
    expect(c.log).toEqual([]);
  });

  test("runPendingEditSoundAdvance dispatches move vs schwung co-run entries", () => {
    const c = calls();
    const actions = [
      { kind: "move", track: 5 },
      { kind: "schwung", track: 6, slot: 2 },
      null,
    ];
    let i = 0;
    const deps = {
      advancePendingEditSoundEntry: (t: number) => {
        c.log.push(["advance", t]);
        return actions[i++];
      },
      enterMoveNativeCoRun: c.fn("move"),
      enterSchwungCoRun: c.fn("schwung"),
    };
    runPendingEditSoundAdvance({ activeTrack: 5 }, deps);
    expect(c.log).toContainEqual(["move", 5]);

    runPendingEditSoundAdvance({ activeTrack: 6 }, deps);
    expect(c.log).toContainEqual(["schwung", 6, 2]);

    // null action -> no co-run entry
    c.log.length = 0;
    runPendingEditSoundAdvance({ activeTrack: 0 }, deps);
    expect(c.log).toEqual([["advance", 0]]);
  });

  test("runMetroBeatDetect plays a click only on a beat-count change", () => {
    const c = calls();
    let beat = "4";
    const deps = {
      host_module_get_param: () => beat,
      playMetronomeClick: c.fn("click"),
    };
    const S: any = { metronomeOn: 1, metroPrevBeat: 3, recordCountingIn: true, tickCount: 99 };
    runMetroBeatDetect(S, deps);
    expect(S.metroPrevBeat).toBe(4);
    expect(S.countInBeatStartTick).toBe(99);
    expect(c.log).toEqual([["click"]]);

    // same beat -> no click
    c.log.length = 0;
    runMetroBeatDetect(S, deps);
    expect(c.log).toEqual([]);

    // metronome off -> no get_param/click
    c.log.length = 0;
    runMetroBeatDetect({ metronomeOn: 0 }, deps);
    expect(c.log).toEqual([]);
  });

  test("runSideButtonHoldThreshold promotes to clips-reveal past the hold window", () => {
    const c = calls();
    const deps = { STEP_HOLD_TICKS: 19, forceRedraw: c.fn("redraw") };
    const S: any = {
      sideHeldBtn: 2,
      revealClipsTrack: -1,
      sideBtnPressedTick: 50,
      tickCount: 70, // 20 elapsed >= 19
      activeTrack: 4,
    };
    runSideButtonHoldThreshold(S, deps);
    expect(S.revealClipsTrack).toBe(4);
    expect(c.log).toEqual([["redraw"]]);

    // already revealed -> no-op; not yet elapsed -> no-op
    c.log.length = 0;
    runSideButtonHoldThreshold(S, deps);
    runSideButtonHoldThreshold(
      { sideHeldBtn: 2, revealClipsTrack: -1, sideBtnPressedTick: 60, tickCount: 70, activeTrack: 4 },
      deps,
    );
    expect(c.log).toEqual([]);
  });

  test("runSceneCacheRefresh fills all 16 scene cache slots", () => {
    const deps = {
      sceneAllPlaying: (i: number) => i % 2 === 0,
      sceneAllQueued: (i: number) => i === 3,
      sceneAnyPlaying: (i: number) => i < 4,
    };
    const S: any = {
      cachedSceneAllPlaying: new Array(16).fill(null),
      cachedSceneAllQueued: new Array(16).fill(null),
      cachedSceneAnyPlaying: new Array(16).fill(null),
    };
    runSceneCacheRefresh(S, deps);
    expect(S.cachedSceneAllPlaying[0]).toBe(true);
    expect(S.cachedSceneAllPlaying[1]).toBe(false);
    expect(S.cachedSceneAllQueued[3]).toBe(true);
    expect(S.cachedSceneAnyPlaying[3]).toBe(true);
    expect(S.cachedSceneAnyPlaying[4]).toBe(false);
    expect(S.cachedSceneAllPlaying).toHaveLength(16);
  });
});

describe("suspend + end-of-tick steps (batch A5, D)", () => {
  const ORIG = () => {};
  const NOOP = () => {};

  function suspendDeps(
    c: ReturnType<typeof calls>,
    dspUuid = "old",
    picker = false,
    opts: { songIndex?: number | null; activeUuid?: string } = {},
  ) {
    const songIndex = opts.songIndex === undefined ? null : opts.songIndex;
    const activeUuid = opts.activeUuid === undefined ? "new" : opts.activeUuid;
    return {
      clearScreen: ORIG,
      saveState: c.fn("saveState"),
      removeFlagsWrap: c.fn("removeFlags"),
      host_ext_midi_remap_enable: c.fn("remapEnable"),
      installFlagsWrap: c.fn("installFlags"),
      applyExtMidiRemap: c.fn("remap"),
      readActiveSet: () => ({ uuid: activeUuid, name: "Set B" }),
      host_module_get_param: () => dspUuid,
      maybeShowInheritPicker: (...a: unknown[]) => {
        c.log.push(["picker", ...a]);
        return picker ? "picker" : "auto";
      },
      invalidateLEDCache: c.fn("invalidate"),
      buildLedInitQueue: () => ["q"],
      forceRedraw: c.fn("redraw"),
      /* Settings.json reader for readCurrentSongIndex. songIndex=null -> no file
       * (reader absent), reader returns -1, no auto-route fire. */
      host_read_file:
        songIndex === null
          ? undefined
          : () => JSON.stringify({ currentSongIndex: songIndex }),
      /* Auto-route deps so beginAutoRoute can seed canonical channels. */
      shadowSetParam: c.fn("shadowSetParam"),
      move_midi_inject_to_move: c.fn("inject"),
    };
  }

  test("runSuspendDetection saves on the suspend edge and returns true", () => {
    const c = calls();
    const deps = suspendDeps(c);
    deps.clearScreen = NOOP; // differs from _origClearScreen -> suspended
    const S: any = { _origClearScreen: ORIG, _wasSuspended: false };
    const result = runSuspendDetection(S, deps);
    expect(result).toBeTruthy();
    expect(S._wasSuspended).toBe(true);
    expect(c.log).toEqual([
      ["saveState"],
      ["removeFlags"],
      ["remapEnable", 0],
    ]);
  });

  test("runSuspendDetection restores on the resume edge and loads a changed set", () => {
    const c = calls();
    const deps = suspendDeps(c, "old"); // dsp uuid "old" != active "new"
    deps.clearScreen = ORIG; // matches -> not suspended
    const S: any = {
      _origClearScreen: ORIG,
      _wasSuspended: true,
      shiftHeld: true,
      heldStep: 5,
      currentSetUuid: "old",
      pendingSetLoad: false,
    };
    const result = runSuspendDetection(S, deps);
    expect(result).toBeFalsy();
    expect(S._wasSuspended).toBe(false);
    expect(S.shiftHeld).toBe(false);
    expect(S.heldStep).toBe(-1);
    expect(S.currentSetUuid).toBe("new");
    expect(S.pendingSetLoad).toBe(true); // auto-inherit -> immediate load
    expect(S.ledInitComplete).toBe(false);
    expect(S.ledInitQueue).toEqual(["q"]);
    expect(c.log).toContainEqual(["installFlags"]);
    expect(c.log).toContainEqual(["redraw"]);
  });

  test("runSuspendDetection defers state_load when the inherit picker opens", () => {
    const c = calls();
    const deps = suspendDeps(c, "old", true); // picker path
    deps.clearScreen = ORIG;
    const S: any = { _origClearScreen: ORIG, _wasSuspended: true, pendingSetLoad: false };
    runSuspendDetection(S, deps);
    expect(S.currentSetUuid).toBe("new");
    expect(S.pendingSetLoad).toBe(false); // suppressed while picker decides
  });

  test("runSuspendDetection is a no-op in steady suspended state", () => {
    const c = calls();
    const deps = suspendDeps(c);
    deps.clearScreen = NOOP;
    const S: any = { _origClearScreen: ORIG, _wasSuspended: true };
    const result = runSuspendDetection(S, deps);
    expect(result).toBeTruthy();
    expect(c.log).toEqual([]); // no edge -> nothing fires
  });

  test("resume with a changed currentSongIndex + blank active uuid fires auto-route once", () => {
    const c = calls();
    // No uuid change (dspUuid === active uuid "") so the uuid path stays quiet;
    // the blank/unsaved case the uuid path can't see.
    const deps = suspendDeps(c, "", false, { songIndex: 4, activeUuid: "" });
    deps.clearScreen = ORIG; // resume edge
    const S: any = {
      _origClearScreen: ORIG,
      _wasSuspended: true,
      lastSongIndex: 2,
      pendingSetLoad: false,
      trackRoute: new Array(8).fill(0),
      trackChannel: new Array(8).fill(1),
    };
    runSuspendDetection(S, deps);
    expect(S.lastSongIndex).toBe(4); // index recorded
    expect(S.pendingSetLoad).toBe(false); // uuid path did NOT arm
    // beginAutoRoute(force) seeded canonical channels + queued the macro.
    expect(S.autoRouteQueue).not.toBe(null);
    expect(S.autoRouteActive).toBe(true);
    expect(S.trackChannel).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test("resume with an unchanged currentSongIndex does NOT fire auto-route", () => {
    const c = calls();
    const deps = suspendDeps(c, "", false, { songIndex: 3, activeUuid: "" });
    deps.clearScreen = ORIG;
    const S: any = {
      _origClearScreen: ORIG,
      _wasSuspended: true,
      lastSongIndex: 3, // same -> no fire
      pendingSetLoad: false,
      trackRoute: new Array(8).fill(0),
      trackChannel: new Array(8).fill(1),
    };
    runSuspendDetection(S, deps);
    expect(S.lastSongIndex).toBe(3);
    expect(S.autoRouteQueue == null).toBe(true); // no macro queued
  });

  test("resume with a changed uuid (saved set) records the index but does NOT double-fire here", () => {
    const c = calls();
    // dspUuid "old" != active "new" -> uuid path arms pendingSetLoad. The index
    // also changed, but armedByUuid suppresses a second fire (the state_load
    // downstream path runs beginAutoRoute).
    const deps = suspendDeps(c, "old", false, { songIndex: 9, activeUuid: "new" });
    deps.clearScreen = ORIG;
    const S: any = {
      _origClearScreen: ORIG,
      _wasSuspended: true,
      lastSongIndex: 1,
      pendingSetLoad: false,
      trackRoute: new Array(8).fill(0),
      trackChannel: new Array(8).fill(1),
    };
    runSuspendDetection(S, deps);
    expect(S.pendingSetLoad).toBe(true); // uuid path armed the load
    expect(S.lastSongIndex).toBe(9); // index still recorded
    expect(S.autoRouteQueue == null).toBe(true); // NOT armed here (no double-route)
  });

  test("runOrphanPrune sends the prune command and drops stale index entries", () => {
    const c = calls();
    const deps = {
      host_module_set_param: c.fn("set"),
      host_file_exists: (path: string) => path.includes("keep"),
      loadNameIndex: () => ({ A: "keep-uuid", B: "gone-uuid" }),
      uuidToStatePath: (u: string) => `/state/${u}`,
      saveNameIndex: c.fn("save"),
    };
    const S: any = {
      pendingPruneOrphans: true,
      pendingSetLoad: false,
      pendingDspSync: 0,
      nameIndexCache: null,
    };
    runOrphanPrune(S, deps);
    expect(S.pendingPruneOrphans).toBe(false);
    expect(c.log[0]).toEqual(["set", "prune_orphan_states", "1"]);
    expect(S.nameIndexCache).toEqual({ A: "keep-uuid" }); // B dropped (no state file)
    expect(c.log).toContainEqual(["save", { A: "keep-uuid" }]);

    // gated while a state_load is still pending
    c.log.length = 0;
    const blocked = { pendingPruneOrphans: true, pendingSetLoad: true, pendingDspSync: 0 };
    runOrphanPrune(blocked, deps);
    expect(blocked.pendingPruneOrphans).toBe(true);
    expect(c.log).toEqual([]);
  });

  test("runAltModeFlash repaints only on a blink-phase edge while the indicator is active", () => {
    const deps = { altIndicatorActive: () => true };
    const S: any = { activeTrack: 0, activeBank: 4, tickCount: 24, _altBlinkPhase: 0, screenDirty: false };
    runAltModeFlash(S, deps); // tickCount 24 -> phase 1, edge from 0
    expect(S._altBlinkPhase).toBe(1);
    expect(S.screenDirty).toBe(true);

    // same phase -> no repaint
    S.screenDirty = false;
    runAltModeFlash(S, deps);
    expect(S.screenDirty).toBe(false);

    // indicator inactive -> no-op
    const off = { activeTrack: 0, activeBank: 0, tickCount: 48, _altBlinkPhase: 0, screenDirty: false };
    runAltModeFlash(off, { altIndicatorActive: () => false });
    expect(off.screenDirty).toBe(false);
  });
});

describe("LED-paint tick steps (batch B7-B8)", () => {
  // B7: setButtonLED recorded as ["btn", cc, color, force?]; colors/CCs are
  // distinct string sentinels so each branch's paint is unambiguous.
  function ledDeps(c: ReturnType<typeof calls>, over: any = {}): any {
    return {
      setButtonLED: (...a: unknown[]) => c.log.push(["btn", ...a] as any),
      flashAtRate: () => true,
      host_module_get_param: () => null,
      POLL_INTERVAL: 8,
      Green: "GREEN", LED_OFF: "OFF", Red: "RED", DarkGrey: "DGREY",
      White: "WHITE", VividYellow: "VYELLOW",
      TRACK_COLORS: ["TC0", "TC1", "TC2", "TC3", "TC4", "TC5", "TC6", "TC7"],
      MovePlay: "PLAY", MoveRec: "REC", MoveSample: "SAMPLE", MoveLoop: "LOOP",
      MoveCapture: "CAP", MoveMute: "MUTE", MoveShift: "SHIFT", MoveNoteSession: "NOTE",
      MoveUndo: "UNDO", MoveDelete: "DEL", MoveCopy: "COPY",
      MoveUp: "UP", MoveDown: "DOWN", MoveLeft: "LEFT", MoveRight: "RIGHT",
      ...over,
    };
  }

  function b7State(over: any = {}): any {
    return {
      playing: false,
      schwungCoRunSlot: -1, moveCoRunTrack: -1,
      recordScheduledStop: false, recordPendingPage: false, recordArmed: false,
      tickCount: 0,
      dspMergeState: 0,
      activeTrack: 0,
      drumRepeatLatched: [false, false, false, false],
      drumRepeat2LatchedLanes: [new Set(), new Set(), new Set(), new Set()],
      sessionView: false, perfViewLocked: false, perfLatchMode: false,
      trackMuted: [false, false, false, false],
      trackSoloed: [false, false, false, false],
      globalMenuOpen: false, tapTempoOpen: false,
      shiftHeld: false,
      ...over,
    };
  }

  // Hardware honors the last paint per CC; return the final ["btn", cc, ...] entry.
  function lastBtn(c: ReturnType<typeof calls>, cc: string) {
    const hits = c.log.filter((e) => e[0] === "btn" && e[1] === cc);
    return hits.length ? hits[hits.length - 1] : undefined;
  }

  test("runTransportButtonLEDs paints Play and the idle contextual buttons", () => {
    const c = calls();
    runTransportButtonLEDs(b7State({ playing: true }), ledDeps(c));
    expect(lastBtn(c, "PLAY")).toEqual(["btn", "PLAY", "GREEN"]);
    expect(lastBtn(c, "CAP")).toEqual(["btn", "CAP", "DGREY"]);
    expect(lastBtn(c, "UNDO")).toEqual(["btn", "UNDO", 16]);
    expect(lastBtn(c, "DELETE" as any)).toBeUndefined();
    expect(lastBtn(c, "DEL")).toEqual(["btn", "DEL", 16]);
    // track view -> arrows lit; idle Loop falls to the dim idx-60 ambient
    expect(lastBtn(c, "LEFT")).toEqual(["btn", "LEFT", 16]);
    expect(lastBtn(c, "LOOP")).toEqual(["btn", "LOOP", 60]);

    const c2 = calls();
    runTransportButtonLEDs(b7State({ playing: false }), ledDeps(c2));
    expect(lastBtn(c2, "PLAY")).toEqual(["btn", "PLAY", "OFF"]);
  });

  test("runTransportButtonLEDs Rec is four-way and forwards the co-run force flag", () => {
    // co-run: OFF + force arg (tickCount 0 % POLL 8 === 0 -> true)
    const c = calls();
    runTransportButtonLEDs(b7State({ schwungCoRunSlot: 0, tickCount: 0 }), ledDeps(c));
    expect(lastBtn(c, "REC")).toEqual(["btn", "REC", "OFF", true]);

    // scheduled stop -> blink Red (floor(0/8)%2===0)
    const c2 = calls();
    runTransportButtonLEDs(b7State({ recordScheduledStop: true, tickCount: 0 }), ledDeps(c2));
    expect(lastBtn(c2, "REC")).toEqual(["btn", "REC", "RED"]);

    // armed -> Red; idle -> OFF
    const c3 = calls();
    runTransportButtonLEDs(b7State({ recordArmed: true }), ledDeps(c3));
    expect(lastBtn(c3, "REC")).toEqual(["btn", "REC", "RED"]);
    const c4 = calls();
    runTransportButtonLEDs(b7State(), ledDeps(c4));
    expect(lastBtn(c4, "REC")).toEqual(["btn", "REC", "OFF"]);
  });

  test("runTransportButtonLEDs Sample is tri-state on dspMergeState", () => {
    for (const [ms, color] of [[0, "DGREY"], [1, "RED"], [2, "GREEN"]] as const) {
      const c = calls();
      runTransportButtonLEDs(b7State({ dspMergeState: ms }), ledDeps(c));
      expect(lastBtn(c, "SAMPLE")).toEqual(["btn", "SAMPLE", color]);
    }
  });

  test("runTransportButtonLEDs Loop ladder covers each priority branch", () => {
    // perfViewLocked (session) -> flash White
    const c = calls();
    runTransportButtonLEDs(b7State({ sessionView: true, perfViewLocked: true }), ledDeps(c));
    expect(lastBtn(c, "LOOP")).toEqual(["btn", "LOOP", "WHITE"]);

    // drum-repeat latched -> flash White
    const c2 = calls();
    runTransportButtonLEDs(b7State({ drumRepeatLatched: [true, false, false, false] }), ledDeps(c2));
    expect(lastBtn(c2, "LOOP")).toEqual(["btn", "LOOP", "WHITE"]);

    // TARP latched (tarp_on=1, tarp_latch=1, fc=2 even -> on) -> track color
    const c3 = calls();
    const tarpGet = (key: string) =>
      key.endsWith("_tarp_fc") ? "2" : "1";
    runTransportButtonLEDs(
      b7State({ activeTrack: 3 }),
      ledDeps(c3, { host_module_get_param: tarpGet }),
    );
    expect(lastBtn(c3, "LOOP")).toEqual(["btn", "LOOP", "TC3"]);

    // perf latch mode (session, no higher branch) -> VividYellow
    const c4 = calls();
    runTransportButtonLEDs(b7State({ sessionView: true, perfLatchMode: true }), ledDeps(c4));
    expect(lastBtn(c4, "LOOP")).toEqual(["btn", "LOOP", "VYELLOW"]);
  });

  test("runTransportButtonLEDs Mute reflects mute / solo-blink / idle", () => {
    const c = calls();
    runTransportButtonLEDs(b7State({ trackMuted: [true, false, false, false] }), ledDeps(c));
    expect(lastBtn(c, "MUTE")).toEqual(["btn", "MUTE", 124]);
    // soloed, blink on (tick 24 -> floor/24%2 === 1)
    const c2 = calls();
    runTransportButtonLEDs(b7State({ trackSoloed: [true, false, false, false], tickCount: 24 }), ledDeps(c2));
    expect(lastBtn(c2, "MUTE")).toEqual(["btn", "MUTE", 124]);
    // soloed, blink off (tick 0)
    const c3 = calls();
    runTransportButtonLEDs(b7State({ trackSoloed: [true, false, false, false], tickCount: 0 }), ledDeps(c3));
    expect(lastBtn(c3, "MUTE")).toEqual(["btn", "MUTE", 0]);
    // idle
    const c4 = calls();
    runTransportButtonLEDs(b7State(), ledDeps(c4));
    expect(lastBtn(c4, "MUTE")).toEqual(["btn", "MUTE", 16]);
  });

  test("runTransportButtonLEDs NoteSession resolves co-run vs menu-exit overrides", () => {
    // Schwung co-run -> White + force
    const c = calls();
    runTransportButtonLEDs(b7State({ schwungCoRunSlot: 0, tickCount: 0 }), ledDeps(c));
    expect(lastBtn(c, "NOTE")).toEqual(["btn", "NOTE", "WHITE", true]);

    // Move co-run -> OFF + force
    const c2 = calls();
    runTransportButtonLEDs(b7State({ moveCoRunTrack: 1, tickCount: 0 }), ledDeps(c2));
    expect(lastBtn(c2, "NOTE")).toEqual(["btn", "NOTE", "OFF", true]);

    // Global menu open, blink off (tick 0) -> distinguishable OFF over default 16
    const c3 = calls();
    runTransportButtonLEDs(b7State({ globalMenuOpen: true, tickCount: 0 }), ledDeps(c3));
    expect(lastBtn(c3, "NOTE")).toEqual(["btn", "NOTE", "OFF"]);
  });

  test("runTransportButtonLEDs Shift-flash overrides Sample/Loop while Shift held", () => {
    // tick 24 -> flash phase 1; sessionView so Loop gets the shift-flash
    const c = calls();
    runTransportButtonLEDs(
      b7State({ shiftHeld: true, sessionView: true, tickCount: 24, dspMergeState: 2 }),
      ledDeps(c),
    );
    expect(lastBtn(c, "SAMPLE")).toEqual(["btn", "SAMPLE", "DGREY"]); // overrode Green
    expect(lastBtn(c, "LOOP")).toEqual(["btn", "LOOP", 16]); // overrode idle 60
    expect(lastBtn(c, "NOTE")).toEqual(["btn", "NOTE", 16]);
    expect(lastBtn(c, "UNDO")).toEqual(["btn", "UNDO", 16]);
  });

  // B8: LED-update fns + setLED recorded by name; colors/PAD_MODE are sentinels.
  function viewDeps(c: ReturnType<typeof calls>): any {
    return {
      updateSessionLEDs: () => c.log.push(["session"]),
      updatePerfModeLEDs: () => c.log.push(["perf"]),
      updateSceneMapLEDs: () => c.log.push(["scenemap"]),
      updateStepLEDs: () => c.log.push(["step"]),
      updateTrackLEDs: () => c.log.push(["track"]),
      setLED: (...a: unknown[]) => c.log.push(["led", ...a] as any),
      PAD_MODE_DRUM: 1,
      White: "WHITE", LED_OFF: "OFF",
    };
  }

  function b8State(over: any = {}): any {
    return {
      sessionView: false, loopHeld: false, perfViewLocked: false,
      recordArmed: false, recordCountingIn: false, countInQuarterTicks: 0,
      tickCount: 0, countInBeatStartTick: 0,
      sessionOverlayHeld: false, flashEighth: false, lastBlinkOn: null,
      trackSoloed: [false, false, false, false], lastSoloBlink: null,
      loopJogActive: false, loopJogLastTick: undefined, lastAllLanesBlink: null,
      activeBank: 0, activeTrack: 0, trackPadMode: [0, 0, 0, 0],
      screenDirty: false,
      ...over,
    };
  }

  test("runViewLEDsAndBlinks session view dispatches perf vs scene-map", () => {
    const c = calls();
    runViewLEDsAndBlinks(b8State({ sessionView: true, loopHeld: true }), viewDeps(c));
    expect(c.log).toContainEqual(["session"]);
    expect(c.log).toContainEqual(["perf"]);
    expect(c.log).not.toContainEqual(["scenemap"]);
    expect(c.log).toContainEqual(["track"]);

    const c2 = calls();
    runViewLEDsAndBlinks(b8State({ sessionView: true, loopHeld: false, perfViewLocked: false }), viewDeps(c2));
    expect(c2.log).toContainEqual(["scenemap"]);
    expect(c2.log).not.toContainEqual(["perf"]);
  });

  test("runViewLEDsAndBlinks track view paints steps + count-in flash", () => {
    const c = calls();
    runViewLEDsAndBlinks(
      b8State({ sessionView: false, recordArmed: true, recordCountingIn: true,
        countInQuarterTicks: 24, tickCount: 0, countInBeatStartTick: 0 }),
      viewDeps(c),
    );
    expect(c.log).toContainEqual(["step"]);
    const flashes = c.log.filter((e) => e[0] === "led");
    expect(flashes).toHaveLength(16);
    expect(flashes[0]).toEqual(["led", 16, "WHITE"]);
    expect(flashes[15]).toEqual(["led", 31, "WHITE"]);

    // not armed -> no count-in flash
    const c2 = calls();
    runViewLEDsAndBlinks(b8State({ sessionView: false }), viewDeps(c2));
    expect(c2.log.filter((e) => e[0] === "led")).toHaveLength(0);
  });

  test("runViewLEDsAndBlinks session-overlay blink dirties only on a phase edge", () => {
    const S = b8State({ sessionView: false, sessionOverlayHeld: true, flashEighth: true, lastBlinkOn: false });
    runViewLEDsAndBlinks(S, viewDeps(calls()));
    expect(S.lastBlinkOn).toBe(true);
    expect(S.screenDirty).toBe(true);
    // same phase -> no dirty
    S.screenDirty = false;
    runViewLEDsAndBlinks(S, viewDeps(calls()));
    expect(S.screenDirty).toBe(false);
    // not held -> reset to null
    const S2 = b8State({ sessionView: false, sessionOverlayHeld: false, lastBlinkOn: true });
    runViewLEDsAndBlinks(S2, viewDeps(calls()));
    expect(S2.lastBlinkOn).toBeNull();
  });

  test("runViewLEDsAndBlinks solo blink dirties on toggle, clears when none soloed", () => {
    const S = b8State({ sessionView: false, trackSoloed: [true, false, false, false], tickCount: 24, lastSoloBlink: 0 });
    runViewLEDsAndBlinks(S, viewDeps(calls()));
    expect(S.lastSoloBlink).toBe(1); // floor(24/24)%2
    expect(S.screenDirty).toBe(true);

    const S2 = b8State({ sessionView: false, trackSoloed: [false, false, false, false], lastSoloBlink: 1 });
    runViewLEDsAndBlinks(S2, viewDeps(calls()));
    expect(S2.lastSoloBlink).toBeNull();
  });

  test("runViewLEDsAndBlinks loopJog OOB reverts after >70 idle ticks", () => {
    const S = b8State({ sessionView: false, loopJogActive: true, loopHeld: true, loopJogLastTick: 0, tickCount: 71 });
    runViewLEDsAndBlinks(S, viewDeps(calls()));
    expect(S.loopJogActive).toBe(false);
    expect(S.screenDirty).toBe(true);

    const S2 = b8State({ sessionView: false, loopJogActive: true, loopHeld: true, loopJogLastTick: 0, tickCount: 50 });
    runViewLEDsAndBlinks(S2, viewDeps(calls()));
    expect(S2.loopJogActive).toBe(true);
  });

  test("runViewLEDsAndBlinks ALL-lanes blink dirties on bank-7 drum-mode toggle", () => {
    const S = b8State({ sessionView: false, activeBank: 7, activeTrack: 0, trackPadMode: [1, 1, 1, 1], tickCount: 24, lastAllLanesBlink: 0 });
    runViewLEDsAndBlinks(S, viewDeps(calls())); // PAD_MODE_DRUM === 1
    expect(S.lastAllLanesBlink).toBe(1);
    expect(S.screenDirty).toBe(true);

    const S2 = b8State({ sessionView: false, activeBank: 6, lastAllLanesBlink: 1 });
    runViewLEDsAndBlinks(S2, viewDeps(calls()));
    expect(S2.lastAllLanesBlink).toBeNull();
  });
});

describe("recording-event flush tick step (batch C1)", () => {
  // The flush is a mutually-exclusive priority ladder that emits AT MOST ONE
  // set_param family per tick (coalescing survival). set_param recorded as
  // ["set", key, val]; the drum-rec arrays are passed by reference via deps.
  function flushDeps(c: ReturnType<typeof calls>, over: any = {}): any {
    return {
      host_module_set_param: c.fn("set"),
      host_module_get_param: () => "0", // tarp off by default
      drumRecNoteOns: [],
      drumRecNoteOffs: [],
      PAD_MODE_DRUM: "DRUM",
      disarmRecord: c.fn("disarm"),
      invalidateLEDCache: c.fn("inval"),
      forceRedraw: c.fn("redraw"),
      ...over,
    };
  }

  function steps(val: string | number, n = 16): any[] {
    return Array.from({ length: n }, () => val);
  }

  function flushState(over: any = {}): any {
    return {
      recordArmed: true,
      recordCountingIn: false,
      _recNoteOns: [],
      _recNoteOffs: [],
      pendingPrerollGate: null,
      pendingPrerollToggleQueue: [],
      pendingPrerollNote: null,
      pendingPrerollNotes: [],
      playing: true,
      liveActiveNotes: new Set(),
      tickCount: 100,
      transportStartTick: 0,
      recordArmedTrack: 0,
      activeTrack: 0,
      trackActiveClip: [0],
      trackPadMode: ["MEL"],
      pendingScheduledDisarm: false,
      recordScheduledStop: false,
      recordScheduledStopTarget: -1,
      clipAdaptiveMode: [[false]],
      drumLaneLoopStart: [0],
      clipLoopStart: [[0]],
      drumLaneTPS: [24],
      clipTPS: [[24]],
      drumLaneSteps: [[steps("0")]],
      drumLaneHasNotes: [[false]],
      drumLaneLength: [16],
      clipSteps: [[steps(0)]],
      clipNonEmpty: [[false]],
      clipLength: [[16]],
      drumCurrentStep: [0],
      trackCurrentStep: [0],
      ...over,
    };
  }

  // --- guards ---
  test("no-op when not record-armed", () => {
    const c = calls();
    runRecordingEventFlush(flushState({ recordArmed: false, _recNoteOns: [{ rt: 0, pitch: 60, vel: 100 }] }), flushDeps(c));
    expect(c.log).toEqual([]);
  });

  test("no-op while counting in", () => {
    const c = calls();
    runRecordingEventFlush(flushState({ recordCountingIn: true, _recNoteOns: [{ rt: 0, pitch: 60, vel: 100 }] }), flushDeps(c));
    expect(c.log).toEqual([]);
  });

  test("no-op when host_module_set_param is unavailable", () => {
    const c = calls();
    const S = flushState({ _recNoteOns: [{ rt: 0, pitch: 60, vel: 100 }] });
    runRecordingEventFlush(S, flushDeps(c, { host_module_set_param: null }));
    expect(c.log).toEqual([]);
  });

  // --- branch 1: note-on (highest priority) ---
  test("note-on batches all queued pitches and wins over every lower branch", () => {
    const c = calls();
    const drumOns = [{ track: 1, laneNote: 36, vel: 90 }];
    const S = flushState({
      _recNoteOns: [{ rt: 2, pitch: 60, vel: 100 }, { rt: 2, pitch: 64, vel: 110 }],
      _recNoteOffs: [{ rt: 2, pitch: 67 }],
      pendingPrerollGate: { isDrum: false, track: 0, clip: 0, gate: 5 },
    });
    runRecordingEventFlush(S, flushDeps(c, { drumRecNoteOns: drumOns }));
    expect(c.log).toEqual([["set", "t2_record_note_on", "60 100 64 110"]]);
    expect(S._recNoteOns.length).toBe(0);
    expect(drumOns.length).toBe(1); // lower branches untouched
    expect(S._recNoteOffs.length).toBe(1);
    expect(S.pendingPrerollGate).not.toBeNull();
  });

  // --- branch 2: drum-on ---
  test("drum-on fires only after note-on queue drains, batched and cleared by reference", () => {
    const c = calls();
    const drumOns = [{ track: 3, laneNote: 36, vel: 90 }, { track: 3, laneNote: 38, vel: 95 }];
    const S = flushState({ _recNoteOffs: [{ rt: 3, pitch: 40 }] });
    runRecordingEventFlush(S, flushDeps(c, { drumRecNoteOns: drumOns }));
    expect(c.log).toEqual([["set", "t3_drum_record_note_on", "36 90 38 95"]]);
    expect(drumOns.length).toBe(0);
    expect(S._recNoteOffs.length).toBe(1); // still untouched
  });

  // --- branch 3: note-off ---
  test("note-off batches pitches and clears the queue", () => {
    const c = calls();
    const S = flushState({ _recNoteOffs: [{ rt: 1, pitch: 60 }, { rt: 1, pitch: 64 }] });
    runRecordingEventFlush(S, flushDeps(c));
    expect(c.log).toEqual([["set", "t1_record_note_off", "60 64"]]);
    expect(S._recNoteOffs.length).toBe(0);
  });

  // --- branch 4: drum-off ---
  test("drum-off batches lane notes and clears by reference", () => {
    const c = calls();
    const drumOffs = [{ track: 2, laneNote: 36 }, { track: 2, laneNote: 38 }];
    runRecordingEventFlush(flushState(), flushDeps(c, { drumRecNoteOffs: drumOffs }));
    expect(c.log).toEqual([["set", "t2_drum_record_note_off", "36 38"]]);
    expect(drumOffs.length).toBe(0);
  });

  // --- branch 5: preroll-gate ---
  test("preroll-gate writes the loop-start step gate (melodic) and clears the gate", () => {
    const c = calls();
    const S = flushState({ pendingPrerollGate: { isDrum: false, track: 0, clip: 0, gate: 7 }, clipLoopStart: [[3]] });
    runRecordingEventFlush(S, flushDeps(c));
    expect(c.log).toEqual([["set", "t0_c0_step_3_gate", "7"]]);
    expect(S.pendingPrerollGate).toBeNull();
  });

  test("preroll-gate writes the drum lane step gate", () => {
    const c = calls();
    const S = flushState({ pendingPrerollGate: { isDrum: true, track: 0, lane: 2, gate: 4 }, drumLaneLoopStart: [1] });
    runRecordingEventFlush(S, flushDeps(c));
    expect(c.log).toEqual([["set", "t0_l2_step_1_gate", "4"]]);
    expect(S.pendingPrerollGate).toBeNull();
  });

  // --- branch 6: preroll-toggle-queue ---
  test("preroll-toggle-queue shifts one entry; the last entry hands off a gate", () => {
    const c = calls();
    const S = flushState({
      pendingPrerollToggleQueue: [{ track: 0, clip: 0, pitch: 62, vel: 100, gate: 9, last: true }],
      clipLoopStart: [[0]],
    });
    runRecordingEventFlush(S, flushDeps(c));
    expect(c.log).toEqual([["set", "t0_c0_step_0_toggle", "62 100"]]);
    expect(S.pendingPrerollToggleQueue.length).toBe(0);
    expect(S.pendingPrerollGate).toEqual({ isDrum: false, track: 0, clip: 0, gate: 9 });
  });

  // --- branch 7: preroll-note (drum) ---
  test("preroll drum note captures step 0 once released and a step has elapsed", () => {
    const c = calls();
    const S = flushState({
      pendingPrerollNote: { isDrum: true, track: 0, lane: 0, laneNote: 36, vel: 100, countInStart: -96, pressedAtTick: 0, releasedAtTick: 50 },
      tickCount: 100, transportStartTick: 0,
    });
    runRecordingEventFlush(S, flushDeps(c));
    expect(S.pendingPrerollNote).toBeNull();
    const sets = c.log.filter((e) => e[0] === "set");
    expect(sets[0]).toEqual(["set", "t0_l0_step_0_toggle", "100"]);
    expect(S.pendingPrerollGate?.isDrum).toBe(true);
    expect(S.drumLaneSteps[0][0][0]).toBe("1");
    expect(S.drumLaneHasNotes[0][0]).toBe(true);
    expect(c.log).toContainEqual(["inval"]);
    expect(c.log).toContainEqual(["redraw"]);
  });

  test("preroll drum note waits while the pad is still held", () => {
    const c = calls();
    const S = flushState({
      pendingPrerollNote: { isDrum: true, track: 0, lane: 1, laneNote: 36, vel: 100, countInStart: -96, pressedAtTick: 0 },
      liveActiveNotes: new Set([36]),
    });
    runRecordingEventFlush(S, flushDeps(c));
    expect(S.pendingPrerollNote).not.toBeNull();
    expect(c.log).toEqual([]);
  });

  // --- branch 8: preroll-notes (TARP swallow + chord capture) ---
  // Reaching this branch requires pendingPrerollGate === null and an empty
  // toggle queue (both have higher priority); TARP then drops the chord queue.
  test("preroll-notes with tarp_on clears the queues without capturing", () => {
    const c = calls();
    const S = flushState({
      pendingPrerollNotes: [{ track: 0, clip: 0, pitch: 60, vel: 100, countInStart: -96, pressedAtTick: 0 }],
    });
    runRecordingEventFlush(S, flushDeps(c, { host_module_get_param: () => "1" }));
    expect(S.pendingPrerollNotes).toEqual([]);
    expect(S.pendingPrerollToggleQueue).toEqual([]);
    expect(S.pendingPrerollGate).toBeNull();
    expect(c.log.filter((e) => e[0] === "set")).toEqual([]);
  });

  test("preroll-notes single-note chord captures step 0 and hands off a gate", () => {
    const c = calls();
    const S = flushState({
      pendingPrerollNotes: [{ track: 0, clip: 0, pitch: 60, vel: 100, countInStart: -96, pressedAtTick: 0, releasedAtTick: 50 }],
    });
    runRecordingEventFlush(S, flushDeps(c));
    expect(c.log.filter((e) => e[0] === "set")).toEqual([["set", "t0_c0_step_0_toggle", "60 100"]]);
    expect(S.pendingPrerollGate?.isDrum).toBe(false);
    expect(S.clipSteps[0][0][0]).toBe(1);
    expect(S.clipNonEmpty[0][0]).toBe(true);
    expect(S.pendingPrerollNotes).toEqual([]);
  });

  test("preroll-notes multi-note chord queues the remaining notes for later toggles", () => {
    const c = calls();
    const S = flushState({
      pendingPrerollNotes: [
        { track: 0, clip: 0, pitch: 60, vel: 100, countInStart: -96, pressedAtTick: 0, releasedAtTick: 50 },
        { track: 0, clip: 0, pitch: 64, vel: 100, releasedAtTick: 50 },
        { track: 0, clip: 0, pitch: 67, vel: 100, releasedAtTick: 50 },
      ],
    });
    runRecordingEventFlush(S, flushDeps(c));
    expect(c.log.filter((e) => e[0] === "set")).toEqual([["set", "t0_c0_step_0_toggle", "60 100"]]);
    expect(S.pendingPrerollGate).toBeNull(); // not set when chord > 1
    expect(S.pendingPrerollToggleQueue.length).toBe(2);
    expect(S.pendingPrerollToggleQueue[1].last).toBe(true);
  });

  // --- branch 9: else ladder (scheduled-stop two-tick + adaptive-extend) ---
  test("scheduled-stop tick 1 locks clip length and arms the disarm for next tick", () => {
    const c = calls();
    const S = flushState({
      recordScheduledStop: true,
      recordScheduledStopTarget: 16,
      trackCurrentStep: [15],
      clipAdaptiveMode: [[true]],
    });
    runRecordingEventFlush(S, flushDeps(c));
    expect(c.log).toEqual([["set", "t0_c0_length", "16"]]);
    expect(S.clipLength[0][0]).toBe(16);
    expect(S.clipAdaptiveMode[0][0]).toBe(false);
    expect(S.recordScheduledStop).toBe(false);
    expect(S.recordScheduledStopTarget).toBe(-1);
    expect(S.pendingScheduledDisarm).toBe(true);
  });

  test("scheduled-stop tick 1 locks drum lane length when the armed track is a drum track", () => {
    const c = calls();
    const S = flushState({
      trackPadMode: ["DRUM"],
      recordScheduledStop: true,
      recordScheduledStopTarget: 32,
      drumCurrentStep: [31],
    });
    runRecordingEventFlush(S, flushDeps(c));
    expect(c.log).toEqual([["set", "t0_all_lanes_length", "32"]]);
    expect(S.drumLaneLength[0]).toBe(32);
    expect(S.pendingScheduledDisarm).toBe(true);
  });

  test("scheduled-disarm tick 2 calls disarmRecord alone", () => {
    const c = calls();
    const S = flushState({ pendingScheduledDisarm: true });
    runRecordingEventFlush(S, flushDeps(c));
    expect(S.pendingScheduledDisarm).toBe(false);
    expect(c.log).toEqual([["disarm"]]);
  });

  test("adaptive-extend grows the clip by one page near the boundary", () => {
    const c = calls();
    const S = flushState({ clipAdaptiveMode: [[true]], clipLength: [[16]], trackCurrentStep: [13] });
    runRecordingEventFlush(S, flushDeps(c));
    expect(c.log).toEqual([["set", "t0_c0_length", "32"]]);
    expect(S.clipLength[0][0]).toBe(32);
  });

  test("adaptive-extend grows the drum lane by one page near the boundary", () => {
    const c = calls();
    const S = flushState({
      trackPadMode: ["DRUM"],
      clipAdaptiveMode: [[true]],
      drumLaneLength: [16],
      drumCurrentStep: [13],
    });
    runRecordingEventFlush(S, flushDeps(c));
    expect(c.log).toEqual([["set", "t0_all_lanes_length", "32"]]);
    expect(S.drumLaneLength[0]).toBe(32);
  });

  test("scheduled-stop waits (no-op) until the current step reaches the target boundary", () => {
    const c = calls();
    const S = flushState({
      recordScheduledStop: true,
      recordScheduledStopTarget: 16,
      trackCurrentStep: [13], // 13 < target-1 (15) -> not yet at boundary
      clipAdaptiveMode: [[true]],
    });
    runRecordingEventFlush(S, flushDeps(c));
    expect(c.log).toEqual([]); // nothing locked
    expect(S.recordScheduledStop).toBe(true); // still armed, waiting
    expect(S.recordScheduledStopTarget).toBe(16);
    expect(S.pendingScheduledDisarm).toBe(false);
    expect(S.clipAdaptiveMode[0][0]).toBe(true);
  });

  test("adaptive-extend is a no-op until the current step is near the boundary", () => {
    const c = calls();
    const S = flushState({
      clipAdaptiveMode: [[true]],
      clipLength: [[16]],
      trackCurrentStep: [10], // 10 < len-4 (12) -> not near boundary
    });
    runRecordingEventFlush(S, flushDeps(c));
    expect(c.log).toEqual([]);
    expect(S.clipLength[0][0]).toBe(16); // unchanged
  });

  test("else ladder is a no-op when nothing is pending", () => {
    const c = calls();
    runRecordingEventFlush(flushState(), flushDeps(c));
    expect(c.log).toEqual([]);
  });
});
