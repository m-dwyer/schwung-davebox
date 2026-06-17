import { describe, expect, test } from "vitest";
import { onMidiExternalImpl } from "@overture-ui/midi/ui_midi_external_workflow.mjs";

const PAD_MODE_DRUM = 1;

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    deps(overrides: Record<string, unknown> = {}) {
      return {
        drumRecNoteOns: [] as Array<Record<string, number>>,
        drumRecNoteOffs: [] as Array<Record<string, number>>,
        effectiveVelocity: (vel: number) => vel + 1,
        extHeldNotes: new Map<number, { track: number; recording: boolean }>(),
        liveSendNote: (...args: unknown[]) => log.push(["liveSendNote", ...args]),
        melodicStepNoteAssignment: (...args: unknown[]) => log.push(["stepAssign", ...args]),
        padModeDrum: PAD_MODE_DRUM,
        recordNoteOn: (...args: unknown[]) => log.push(["recordNoteOn", ...args]),
        recordNoteOff: (...args: unknown[]) => log.push(["recordNoteOff", ...args]),
        ...overrides,
      };
    },
  };
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    activeTrack: 0,
    drumLaneNote: [
      [36, 37, 38],
      [40, 41, 42],
    ],
    extMidiRemapActive: false,
    heldStep: -1,
    lastPadVelocity: 0,
    lastPlayedNote: -1,
    midiInChannel: 0,
    pendingDrumLaneResync: 0,
    pendingDrumLaneResyncLane: -1,
    pendingDrumLaneResyncTrack: -1,
    recordArmed: false,
    recordArmedTrack: -1,
    recordCountingIn: false,
    seqActiveNotes: new Set<number>(),
    sessionView: false,
    shiftHeld: false,
    trackChannel: [1, 5],
    trackPadMode: [0, 0],
    trackRoute: [0, 1],
    ...overrides,
  };
}

describe("External MIDI workflow", () => {
  test("filters by configured MIDI input channel", () => {
    const c = calls();
    const S = state({ midiInChannel: 2 });
    const d = c.deps();

    onMidiExternalImpl(S, d, [0x90, 60, 100]);
    onMidiExternalImpl(S, d, [0x91, 61, 100]);

    expect(c.log).toEqual([["liveSendNote", 0, 0x90, 61, 101]]);
    expect(d.extHeldNotes.get(61)).toEqual({ track: 0, recording: false });
  });

  test("filters against remapped channel for Move routes", () => {
    const c = calls();
    const S = state({
      activeTrack: 1,
      extMidiRemapActive: true,
      midiInChannel: 2,
      recordArmed: true,
      recordArmedTrack: 1,
      trackRoute: [0, 1],
    });
    const d = c.deps();

    onMidiExternalImpl(S, d, [0x91, 60, 100]);
    onMidiExternalImpl(S, d, [0x94, 61, 100]);

    expect(c.log).toEqual([["recordNoteOn", 61, 101, 1]]);
    expect(d.extHeldNotes.has(60)).toBe(false);
    expect(d.extHeldNotes.get(61)).toEqual({ track: 1, recording: true });
  });

  test("handles drum note on/off, recording queues, resync, and held-note tracking", () => {
    const c = calls();
    const S = state({
      recordArmed: true,
      recordArmedTrack: 0,
      trackPadMode: [PAD_MODE_DRUM, 0],
    });
    const d = c.deps();

    onMidiExternalImpl(S, d, [0x90, 36, 100]);
    expect(S.lastPadVelocity).toBe(101);
    expect(d.drumRecNoteOns).toEqual([{ track: 0, laneNote: 36, vel: 101 }]);
    expect(S.pendingDrumLaneResync).toBe(3);
    expect(S.pendingDrumLaneResyncTrack).toBe(0);
    expect(S.pendingDrumLaneResyncLane).toBe(0);
    expect(d.extHeldNotes.get(36)).toEqual({ track: 0, recording: true });

    onMidiExternalImpl(S, d, [0x80, 36, 0]);

    expect(c.log).toEqual([
      ["liveSendNote", 0, 0x90, 36, 101],
      ["liveSendNote", 0, 0x80, 36, 0],
    ]);
    expect(d.drumRecNoteOffs).toEqual([{ track: 0, laneNote: 36 }]);
    expect(d.extHeldNotes.has(36)).toBe(false);
  });

  test("handles melodic note on/off, recording queues, held notes, and held-step assignment", () => {
    const c = calls();
    const S = state({
      heldStep: 4,
      recordArmed: true,
      recordArmedTrack: 0,
    });
    const d = c.deps();

    onMidiExternalImpl(S, d, [0x90, 64, 99]);
    onMidiExternalImpl(S, d, [0x90, 64, 0]);

    expect(S.lastPlayedNote).toBe(64);
    expect(S.lastPadVelocity).toBe(100);
    expect(c.log).toEqual([
      ["liveSendNote", 0, 0x90, 64, 100],
      ["recordNoteOn", 64, 100, 0],
      ["stepAssign", 64, 100, { replaceAutoAssigned: true }],
      ["liveSendNote", 0, 0x80, 64, 0],
      ["recordNoteOff", 64],
    ]);
    expect(d.extHeldNotes.has(64)).toBe(false);
  });

  test("suppresses Move sequencer echo recording and preserves existing recording gate", () => {
    const c = calls();
    const extHeldNotes = new Map([[60, { track: 1, recording: true }]]);
    const S = state({
      activeTrack: 1,
      recordArmed: true,
      recordArmedTrack: 1,
      seqActiveNotes: new Set([60]),
      trackRoute: [0, 1],
    });
    const d = c.deps({ extHeldNotes });

    onMidiExternalImpl(S, d, [0x94, 60, 100]);

    expect(c.log).toEqual([]);
    expect(extHeldNotes.get(60)).toEqual({ track: 1, recording: true });
  });

  test("forwards raw CC, channel pressure, poly aftertouch, and pitch bend outside Move routes", () => {
    const c = calls();
    const S = state();
    const d = c.deps();

    onMidiExternalImpl(S, d, [0xb0, 74, 96]);
    onMidiExternalImpl(S, d, [0xd0, 0, 55]);
    onMidiExternalImpl(S, d, [0xa0, 60, 70]);
    onMidiExternalImpl(S, d, [0xe0, 0, 64]);

    S.activeTrack = 1;
    onMidiExternalImpl(S, d, [0xb4, 74, 96]);

    expect(c.log).toEqual([
      ["liveSendNote", 0, 0xb0, 74, 96],
      ["liveSendNote", 0, 0xd0, 0, 55],
      ["liveSendNote", 0, 0xa0, 60, 70],
      ["liveSendNote", 0, 0xe0, 0, 64],
    ]);
  });
});
