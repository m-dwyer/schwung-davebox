import { describe, expect, test } from "vitest";
import {
  handleSessionViewClipPadPress,
  handleSessionViewSideRowPress,
  handleSessionViewStepPress,
  handleSessionViewStepRelease,
} from "@overture-ui/view/ui_session_view_workflow.mjs";
import { traceDspWrites } from "../helpers/dsp-queue-trace";

const NUM_TRACKS = 4;
const DRUM = 1;

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    fn(name: string) {
      return (...args: unknown[]) => log.push([name, ...args]);
    },
  };
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    sessionView: true,
    deleteHeld: false,
    loopHeld: false,
    perfViewLocked: false,
    muteHeld: false,
    shiftHeld: false,
    copyHeld: false,
    captureHeld: false,
    pendingSceneBakePicker: false,
    pendingMergePlacement: false,
    confirmBakeScene: false,
    confirmBakeSceneSel: 0,
    confirmBakeSceneClip: -1,
    confirmBakeSceneWrapPhase: false,
    pendingDefaultSetParams: [] as Array<{ key: string; val: string }>,
    perfSnapshots: [0, 0, 0, 0],
    perfRecalledSlot: -1,
    perfModsToggled: 0,
    snapshots: Array.from({ length: 16 }, () => null as null | {
      mute: boolean[];
      solo: boolean[];
      drumEffMute?: number[];
    }),
    stepBtnPressedTick: Array.from({ length: 16 }, () => -1),
    sessionStepHeld: -1,
    sessionStepHeldCtx: 0,
    tickCount: 42,
    screenDirty: false,
    sceneRow: 4,
    sceneBtnFlashTick: [0, 0, 0, 0],
    copySrc: null as null | Record<string, unknown>,
    trackPadMode: [0, DRUM, 0, 0],
    trackMuted: [false, false, false, false],
    trackSoloed: [false, false, false, false],
    drumLaneMute: [0, 0, 0, 0],
    drumLaneSolo: [0, 0, 0, 0],
    trackActiveClip: [0, 0, 0, 0],
    trackCurrentPage: [0, 0, 0, 0],
    trackClipPlaying: [false, false, false, false],
    trackWillRelaunch: [false, false, false, false],
    trackQueuedClip: [-1, -1, -1, -1],
    trackPendingPageStop: [false, false, false, false],
    clipLoopStart: Array.from({ length: NUM_TRACKS }, () => Array.from({ length: 16 }, () => 0)),
    playing: false,
    pendingDrumResync: 0,
    pendingDrumResyncTrack: -1,
    shiftTrackLEDActive: true,
    captureUsedAsModifier: false,
    ...overrides,
  };
}

function deps(c: ReturnType<typeof calls>, overrides: Record<string, unknown> = {}) {
  return {
    numTracks: NUM_TRACKS,
    padModeDrum: DRUM,
    setParam: c.fn("setParam"),
    forceRedraw: c.fn("redraw"),
    invalidateLEDCache: c.fn("invalidateLEDCache"),
    showActionPopup: c.fn("popup"),
    sendPerfMods: c.fn("sendPerfMods"),
    switchActiveTrack: c.fn("switchActiveTrack"),
    setTrackMute: c.fn("setTrackMute"),
    setTrackSolo: c.fn("setTrackSolo"),
    trackClipHasContent: (...args: unknown[]) => {
      c.log.push(["trackClipHasContent", ...args]);
      return true;
    },
    clipIsEmpty: (...args: unknown[]) => {
      c.log.push(["clipIsEmpty", ...args]);
      return false;
    },
    doShiftStepCommon: c.fn("doShiftStepCommon"),
    handoffRecordingToTrack: c.fn("handoffRecordingToTrack"),
    refreshPerClipBankParams: c.fn("refreshPerClipBankParams"),
    clearClip: c.fn("clearClip"),
    clearRow: c.fn("clearRow"),
    copyClip: c.fn("copyClip"),
    copyRow: c.fn("copyRow"),
    cutClip: c.fn("cutClip"),
    cutRow: c.fn("cutRow"),
    copyDrumClip: c.fn("copyDrumClip"),
    cutDrumClip: c.fn("cutDrumClip"),
    hardResetClip: c.fn("hardResetClip"),
    ...overrides,
  };
}

describe("session view DSP operation boundaries", () => {
  test("Delete+Mute step deletes a snapshot as a queued session operation after mirror clear", () => {
    const c = calls();
    const S = state({
      deleteHeld: true,
      muteHeld: true,
      pendingDefaultSetParams: [{ key: "older", val: "1" }],
    });
    S.snapshots[3] = { mute: [true, false, false, false], solo: [false, false, false, false] };

    expect(handleSessionViewStepPress(S, deps(c), 3)).toBe(true);

    expect(S.snapshots[3]).toBeNull();
    expect(traceDspWrites(S, c.log)).toEqual({
      directSetParams: [],
      queuedOperations: [
        { key: "older", val: "1" },
        { key: "snap_delete", val: "3" },
      ],
    });
    expect(c.log).toEqual([
      ["popup", "MUTE STATE", "CLEARED"],
      ["redraw"],
    ]);
  });

  test("snapshot release restores mute/solo mirrors before queueing snap_load", () => {
    const c = calls();
    const S = state({
      sessionStepHeld: 2,
      sessionStepHeldCtx: 2,
      stepBtnPressedTick: Array.from({ length: 16 }, (_, i) => (i === 2 ? 40 : -1)),
      pendingDefaultSetParams: [{ key: "older", val: "1" }],
    });
    S.snapshots[2] = {
      mute: [true, false, true, false],
      solo: [false, true, false, true],
      drumEffMute: [7, 6, 5, 4],
    };

    expect(handleSessionViewStepRelease(S, deps(c), 2)).toBe(true);

    expect(S.sessionStepHeld).toBe(-1);
    expect(S.sessionStepHeldCtx).toBe(0);
    expect(S.stepBtnPressedTick[2]).toBe(-1);
    expect(S.trackMuted).toEqual([true, false, true, false]);
    expect(S.trackSoloed).toEqual([false, true, false, true]);
    expect(S.drumLaneMute).toEqual([7, 6, 5, 4]);
    expect(S.drumLaneSolo).toEqual([0, 0, 0, 0]);
    expect(traceDspWrites(S, c.log)).toEqual({
      directSetParams: [],
      queuedOperations: [
        { key: "older", val: "1" },
        { key: "snap_load", val: "2" },
      ],
    });
    expect(c.log).toEqual([["redraw"]]);
  });

  test("plain step queues launch_scene without direct writes or modal state churn", () => {
    const c = calls();
    const S = state({ pendingDefaultSetParams: [{ key: "older", val: "1" }] });

    expect(handleSessionViewStepPress(S, deps(c), 5)).toBe(true);

    expect(S.sessionView).toBe(true);
    expect(S.sessionStepHeld).toBe(-1);
    expect(traceDspWrites(S, c.log)).toEqual({
      directSetParams: [],
      queuedOperations: [
        { key: "older", val: "1" },
        { key: "launch_scene", val: "5" },
      ],
    });
    expect(c.log).toEqual([]);
  });

  test("Shift side row flashes the scene button then queues quantized scene launch", () => {
    const c = calls();
    const S = state({
      shiftHeld: true,
      sceneRow: 8,
      pendingDefaultSetParams: [{ key: "older", val: "1" }],
    });

    expect(handleSessionViewSideRowPress(S, deps(c), 1)).toBe(true);

    expect(S.sceneBtnFlashTick).toEqual([0, 0, 42, 0]);
    expect(traceDspWrites(S, c.log)).toEqual({
      directSetParams: [],
      queuedOperations: [
        { key: "older", val: "1" },
        { key: "launch_scene_quant", val: "9" },
      ],
    });
    expect(c.log).toEqual([]);
  });

  test("merge placement step closes placement modal and queues exact picked row", () => {
    const c = calls();
    const S = state({
      pendingMergePlacement: true,
      pendingDefaultSetParams: [{ key: "older", val: "1" }],
    });

    expect(handleSessionViewStepPress(S, deps(c), 6)).toBe(true);

    expect(S.pendingMergePlacement).toBe(false);
    expect(S.screenDirty).toBe(true);
    expect(traceDspWrites(S, c.log)).toEqual({
      directSetParams: [],
      queuedOperations: [
        { key: "older", val: "1" },
        { key: "merge_place_row", val: "6" },
      ],
    });
  });

  test("merge placement side row queues absolute scene row for DSP poll reconciliation", () => {
    const c = calls();
    const S = state({
      sceneRow: 12,
      pendingMergePlacement: true,
      pendingDefaultSetParams: [{ key: "older", val: "1" }],
    });

    expect(handleSessionViewSideRowPress(S, deps(c), 2)).toBe(true);

    expect(S.pendingMergePlacement).toBe(false);
    expect(S.screenDirty).toBe(true);
    expect(traceDspWrites(S, c.log)).toEqual({
      directSetParams: [],
      queuedOperations: [
        { key: "older", val: "1" },
        { key: "merge_place_row", val: "14" },
      ],
    });
  });

  test("clip copy path delegates to structural clip operation without local queue writes", () => {
    const c = calls();
    const S = state({
      copyHeld: true,
      copySrc: { kind: "clip", track: 0, clip: 1 },
      sceneRow: 4,
    });

    expect(handleSessionViewClipPadPress(S, deps(c), 92 + 2)).toBe(true);

    expect(S.pendingDefaultSetParams).toEqual([]);
    expect(c.log).toEqual([
      ["copyClip", 0, 1, 2, 4],
      ["invalidateLEDCache"],
      ["redraw"],
      ["popup", "PASTED"],
    ]);
  });

  test("row copy path delegates to structural row operation without local queue writes", () => {
    const c = calls();
    const S = state({
      copyHeld: true,
      copySrc: { kind: "row", row: 4 },
      sceneRow: 8,
    });

    expect(handleSessionViewSideRowPress(S, deps(c), 1)).toBe(true);

    expect(S.pendingDefaultSetParams).toEqual([]);
    expect(c.log).toEqual([
      ["copyRow", 4, 9],
      ["invalidateLEDCache"],
      ["redraw"],
      ["popup", "PASTED"],
    ]);
  });
});
