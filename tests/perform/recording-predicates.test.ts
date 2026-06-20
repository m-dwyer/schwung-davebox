import { describe, expect, test } from "vitest";
import {
  isActivelyRecording,
  isActivelyRecordingTrack,
  isArmedForTrack,
} from "@overture-ui/perform/ui_recording_workflow.mjs";

/**
 * Characterization of the three recording-gate predicates the Recording
 * Workflow now owns. These pin the truth table the handler modules
 * (midi-external, pad, tick-flush) previously open-coded — including the two
 * DELIBERATE variants that differ from the canonical "actively recording
 * track t" gate:
 *   - isArmedForTrack INCLUDES count-in (pad capture accumulates pre-roll).
 *   - isActivelyRecording omits the track check (flush / count-in-flash gate).
 */
function state(overrides: Record<string, unknown> = {}) {
  return {
    recordArmed: true,
    recordCountingIn: false,
    recordArmedTrack: 1,
    ...overrides,
  };
}

describe("recording-gate predicates", () => {
  test("not armed -> every predicate is false", () => {
    const S = state({ recordArmed: false });
    expect(isActivelyRecordingTrack(S, 1)).toBe(false);
    expect(isArmedForTrack(S, 1)).toBe(false);
    expect(isActivelyRecording(S)).toBe(false);
  });

  test("armed, past count-in, track matches -> all true", () => {
    const S = state();
    expect(isActivelyRecordingTrack(S, 1)).toBe(true);
    expect(isArmedForTrack(S, 1)).toBe(true);
    expect(isActivelyRecording(S)).toBe(true);
  });

  test("armed during count-in, track matches -> only isArmedForTrack is true", () => {
    const S = state({ recordCountingIn: true });
    // canonical gate excludes count-in...
    expect(isActivelyRecordingTrack(S, 1)).toBe(false);
    expect(isActivelyRecording(S)).toBe(false);
    // ...but pad capture still arms during count-in (the deliberate variant).
    expect(isArmedForTrack(S, 1)).toBe(true);
  });

  test("armed, past count-in, different track -> only the track-less gate is true", () => {
    const S = state({ recordArmedTrack: 2 });
    expect(isActivelyRecordingTrack(S, 1)).toBe(false);
    expect(isArmedForTrack(S, 1)).toBe(false);
    // flush / count-in-flash gate ignores which track is armed.
    expect(isActivelyRecording(S)).toBe(true);
  });

  test("armed during count-in, different track -> all false", () => {
    const S = state({ recordCountingIn: true, recordArmedTrack: 2 });
    expect(isActivelyRecordingTrack(S, 1)).toBe(false);
    expect(isArmedForTrack(S, 1)).toBe(false);
    expect(isActivelyRecording(S)).toBe(false);
  });
});
