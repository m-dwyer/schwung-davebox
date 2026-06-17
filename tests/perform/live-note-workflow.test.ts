import { describe, expect, test } from "vitest";
import {
  createLiveNoteRecordingState,
  extNoteOffAllImpl,
  liveSendNoteImpl,
  recordNoteOnImpl,
} from "@overture-ui/perform/ui_live_note_workflow.mjs";

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    deps(pendingLiveNotes: unknown[][]) {
      return {
        pendingLiveNotes,
        move_midi_external_send: (packet: number[]) => log.push(["external", packet]),
        shadow_send_midi_to_dsp: (packet: number[]) => log.push(["shadow", packet]),
      };
    },
  };
}

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    trackChannel: [1, 2, 3],
    trackRoute: [0, 1, 2],
    trackVelOverride: [0, 0, 0],
    recordArmed: false,
    recordCountingIn: false,
    recordArmedTrack: -1,
    _recNoteOns: [] as Array<Record<string, number>>,
    _recNoteOffs: [] as Array<Record<string, number>>,
    ...overrides,
  };
}

function queues() {
  return [[], [], []] as unknown[][];
}

describe("live note workflow", () => {
  test("Schwung route queues note on/off and forwards raw CC/AT/PB to DSP", () => {
    const c = calls();
    const pendingLiveNotes = queues();
    const S = baseState();

    liveSendNoteImpl(S, c.deps(pendingLiveNotes), 0, 0x90, 60, 100);
    liveSendNoteImpl(S, c.deps(pendingLiveNotes), 0, 0x80, 60, 0);
    liveSendNoteImpl(S, c.deps(pendingLiveNotes), 0, 0xb0, 74, 96);
    liveSendNoteImpl(S, c.deps(pendingLiveNotes), 0, 0xa0, 60, 70);
    liveSendNoteImpl(S, c.deps(pendingLiveNotes), 0, 0xe0, 0, 64);

    expect(pendingLiveNotes[0]).toEqual([
      { isOff: false, pitch: 60, vel: 100 },
      { isOff: true, pitch: 60 },
    ]);
    expect(c.log).toEqual([
      ["shadow", [0xb0, 74, 96]],
      ["shadow", [0xa0, 60, 70]],
      ["shadow", [0xe0, 0, 64]],
    ]);
  });

  test("Move route queues notes but suppresses recording note-on monitoring", () => {
    const c = calls();
    const pendingLiveNotes = queues();
    const S = baseState({
      recordArmed: true,
      recordCountingIn: false,
      recordArmedTrack: 1,
    });

    liveSendNoteImpl(S, c.deps(pendingLiveNotes), 1, 0x90, 61, 100);
    liveSendNoteImpl(S, c.deps(pendingLiveNotes), 1, 0x80, 61, 0);

    expect(pendingLiveNotes[1]).toEqual([{ isOff: true, pitch: 61 }]);
    expect(c.log).toEqual([]);
  });

  test("External route queues notes and forwards raw CC/AT/PB to USB output", () => {
    const c = calls();
    const pendingLiveNotes = queues();
    const S = baseState();

    liveSendNoteImpl(S, c.deps(pendingLiveNotes), 2, 0x90, 62, 101);
    liveSendNoteImpl(S, c.deps(pendingLiveNotes), 2, 0x80, 62, 0);
    liveSendNoteImpl(S, c.deps(pendingLiveNotes), 2, 0xb0, 71, 80);
    liveSendNoteImpl(S, c.deps(pendingLiveNotes), 2, 0xd0, 0, 55);
    liveSendNoteImpl(S, c.deps(pendingLiveNotes), 2, 0xe0, 0, 65);

    expect(pendingLiveNotes[2]).toEqual([
      { isOff: false, pitch: 62, vel: 101 },
      { isOff: true, pitch: 62 },
    ]);
    expect(c.log).toEqual([
      ["external", [0xb, 0xb2, 71, 80]],
      ["external", [0xd, 0xd2, 0, 55]],
      ["external", [0xe, 0xe2, 0, 65]],
    ]);
  });

  test("velocity override applies to generated note-on but raw velocity can bypass it", () => {
    const c = calls();
    const pendingLiveNotes = queues();
    const S = baseState({ trackVelOverride: [64, 0, 0] });

    liveSendNoteImpl(S, c.deps(pendingLiveNotes), 0, 0x90, 60, 100);
    liveSendNoteImpl(S, c.deps(pendingLiveNotes), 0, 0x90, 64, 100, true);

    expect(pendingLiveNotes[0]).toEqual([
      { isOff: false, pitch: 60, vel: 64 },
      { isOff: false, pitch: 64, vel: 100 },
    ]);
  });

  test("external held-note all-off sends offs and records matching note-offs", () => {
    const state = createLiveNoteRecordingState();
    const S = baseState();
    const log: Array<[string, ...unknown[]]> = [];

    recordNoteOnImpl(S, state, 60, 99, 2);
    state.extHeldNotes.set(60, { track: 2, recording: true });
    state.extHeldNotes.set(61, { track: 0, recording: false });

    extNoteOffAllImpl(S, state, {
      liveSendNote: (...args: unknown[]) => log.push(["liveSendNote", ...args]),
    });

    expect(log).toEqual([
      ["liveSendNote", 2, 0x80, 60, 0],
      ["liveSendNote", 0, 0x80, 61, 0],
    ]);
    expect(S._recNoteOffs).toEqual([{ pitch: 60, rt: 2 }]);
    expect(state.extHeldNotes.size).toBe(0);
    expect(state.recordingNoteTrack.size).toBe(0);
  });
});
