import { describe, expect, test } from "vitest";
import {
  clearRecordingNoteBuffers,
  createRecordingWorkflowState,
  disarmRecordImpl,
  enqueueDrumRecNoteOff,
  enqueueDrumRecNoteOn,
  handoffRecordingToTrackImpl,
} from "@overture-ui/perform/ui_recording_workflow.mjs";

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    deps() {
      return {
        padModeDrum: 1,
        moveRec: 86,
        ledOff: 0,
        setParam: (key: string, val: string) => log.push(["set", key, val]),
        setButtonLED: (cc: number, val: number) => log.push(["led", cc, val]),
      };
    },
  };
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    recordArmed: true,
    recordPendingPage: true,
    recordCountingIn: false,
    recordArmedTrack: 1,
    countInStartTick: 100,
    countInQuarterTicks: 8,
    trackActiveClip: [0, 2, 0, 0],
    clipAdaptiveMode: [
      [false, false, false],
      [false, false, true],
      [false, false, false],
      [false, false, false],
    ],
    trackPadMode: [0, 1, 0, 0],
    pendingDrumResync: 0,
    pendingDrumResyncTrack: -1,
    recordScheduledStop: true,
    recordScheduledStopTarget: 64,
    pendingScheduledDisarm: true,
    pendingPrerollNote: { track: 1, lane: 2 },
    pendingPrerollNotes: [{ track: 1, pitch: 60 }],
    pendingPrerollToggleQueue: [{ track: 1, pitch: 61 }],
    pendingPrerollGate: { isDrum: false, track: 1, clip: 2, gate: 6 },
    _recNoteOns: [{ pitch: 60, vel: 100, rt: 1 }],
    _recNoteOffs: [{ pitch: 60, rt: 1 }],
    ...overrides,
  };
}

describe("recording workflow", () => {
  test("disarm during count-in cancels count-in without sending track recording off", () => {
    const c = calls();
    const S = state({ recordCountingIn: true });
    const workflowState = createRecordingWorkflowState();
    workflowState.liveNoteRecordingState.recordingNoteTrack.set(60, 1);
    workflowState.drumRecNoteOns.push({ track: 1, laneNote: 36, vel: 100 });
    workflowState.drumRecNoteOffs.push({ track: 1, laneNote: 36 });

    disarmRecordImpl(S, workflowState, c.deps());

    expect(S.recordArmed).toBe(false);
    expect(S.recordPendingPage).toBe(false);
    expect(S.recordCountingIn).toBe(false);
    expect(S.recordArmedTrack).toBe(-1);
    expect(workflowState.liveNoteRecordingState.recordingNoteTrack.size).toBe(0);
    expect(S._recNoteOns).toEqual([]);
    expect(S._recNoteOffs).toEqual([]);
    expect(workflowState.drumRecNoteOns).toEqual([]);
    expect(workflowState.drumRecNoteOffs).toEqual([]);
    expect(c.log).toEqual([
      ["set", "record_count_in_cancel", "1"],
      ["led", 86, 0],
    ]);
  });

  test("disarm during active recording sends recording off and clears scheduled/preroll state", () => {
    const c = calls();
    const S = state();
    const workflowState = createRecordingWorkflowState();

    disarmRecordImpl(S, workflowState, c.deps());

    expect(S.recordScheduledStop).toBe(false);
    expect(S.recordScheduledStopTarget).toBe(-1);
    expect(S.pendingScheduledDisarm).toBe(false);
    expect(S.pendingPrerollNote).toBeNull();
    expect(S.pendingPrerollNotes).toEqual([]);
    expect(S.pendingPrerollToggleQueue).toEqual([]);
    expect(S.pendingPrerollGate).toBeNull();
    expect(S.clipAdaptiveMode[1][2]).toBe(false);
    expect(S.pendingDrumResync).toBe(2);
    expect(S.pendingDrumResyncTrack).toBe(1);
    expect(c.log).toEqual([
      ["set", "t1_recording", "0"],
      ["led", 86, 0],
    ]);
  });

  test("handoff writes old recording off, new recording on, and clears note matching", () => {
    const c = calls();
    const S = state({ recordArmedTrack: 1, recordCountingIn: false });
    const workflowState = createRecordingWorkflowState();
    workflowState.liveNoteRecordingState.recordingNoteTrack.set(64, 1);

    handoffRecordingToTrackImpl(S, workflowState, c.deps(), 3);

    expect(S.recordArmedTrack).toBe(3);
    expect(workflowState.liveNoteRecordingState.recordingNoteTrack.size).toBe(0);
    expect(c.log).toEqual([
      ["set", "t1_recording", "0"],
      ["set", "t3_recording", "1"],
    ]);
  });

  test("handoff is a no-op while count-in is active or target track is unchanged", () => {
    const c = calls();
    const S = state({ recordArmedTrack: 1, recordCountingIn: true });
    const workflowState = createRecordingWorkflowState();

    handoffRecordingToTrackImpl(S, workflowState, c.deps(), 3);
    S.recordCountingIn = false;
    handoffRecordingToTrackImpl(S, workflowState, c.deps(), 1);

    expect(S.recordArmedTrack).toBe(1);
    expect(c.log).toEqual([]);
  });

  test("enqueueDrumRecNoteOn pushes the descriptor and arms lane resync when lane >= 0", () => {
    const S = state({ pendingDrumLaneResync: 0, pendingDrumLaneResyncTrack: -1, pendingDrumLaneResyncLane: -1 });
    const q: Array<{ track: number; laneNote: number; vel: number }> = [];

    enqueueDrumRecNoteOn(S, q, 2, 38, 96, 1);

    expect(q).toEqual([{ track: 2, laneNote: 38, vel: 96 }]);
    expect(S.pendingDrumLaneResync).toBe(3);
    expect(S.pendingDrumLaneResyncTrack).toBe(2);
    expect(S.pendingDrumLaneResyncLane).toBe(1);
  });

  test("enqueueDrumRecNoteOn with lane < 0 pushes but does not arm resync", () => {
    const S = state({ pendingDrumLaneResync: 0, pendingDrumLaneResyncTrack: -1, pendingDrumLaneResyncLane: -1 });
    const q: Array<{ track: number; laneNote: number; vel: number }> = [];

    enqueueDrumRecNoteOn(S, q, 0, 41, 80, -1);

    expect(q).toEqual([{ track: 0, laneNote: 41, vel: 80 }]);
    expect(S.pendingDrumLaneResync).toBe(0);
    expect(S.pendingDrumLaneResyncTrack).toBe(-1);
    expect(S.pendingDrumLaneResyncLane).toBe(-1);
  });

  test("enqueueDrumRecNoteOff pushes the descriptor with no side effects", () => {
    const q: Array<{ track: number; laneNote: number }> = [];
    enqueueDrumRecNoteOff(q, 3, 36);
    expect(q).toEqual([{ track: 3, laneNote: 36 }]);
  });

  test("note matching cleanup clears melodic and drum recording queues", () => {
    const S = state();
    const workflowState = createRecordingWorkflowState();
    workflowState.liveNoteRecordingState.recordingNoteTrack.set(67, 2);
    workflowState.drumRecNoteOns.push({ track: 0, laneNote: 38, vel: 96 });
    workflowState.drumRecNoteOffs.push({ track: 0, laneNote: 38 });

    clearRecordingNoteBuffers(S, workflowState);

    expect(workflowState.liveNoteRecordingState.recordingNoteTrack.size).toBe(0);
    expect(S._recNoteOns).toEqual([]);
    expect(S._recNoteOffs).toEqual([]);
    expect(workflowState.drumRecNoteOns).toEqual([]);
    expect(workflowState.drumRecNoteOffs).toEqual([]);
  });
});
