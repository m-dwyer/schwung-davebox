import { describe, expect, test } from "vitest";
import { handleUiMidiInternalMessage } from "@overture-ui/midi/ui_midi_internal_workflow.mjs";

const MOVE_DELETE = 119;
const MOVE_DOWN = 85;
const MOVE_MAIN_KNOB = 14;
const MOVE_NOTE_SESSION = 50;
const MOVE_UP = 84;
const TRACK_PAD_BASE = 68;

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
    clearAutoMenu: null,
    deleteTapArmed: false,
    sessionOverlayHeld: false,
    snapshotPicker: null,
    ...overrides,
  };
}

function deps(c: ReturnType<typeof calls>, overrides: Record<string, unknown> = {}) {
  return {
    closeClearAutoMenu: c.fn("closeClearAutoMenu"),
    isNoiseMessage: () => false,
    moveDelete: MOVE_DELETE,
    moveDown: MOVE_DOWN,
    moveMainKnob: MOVE_MAIN_KNOB,
    moveNoteSession: MOVE_NOTE_SESSION,
    moveUp: MOVE_UP,
    onCc: c.fn("cc"),
    onKnobTouch: c.fn("knobTouch"),
    onPadAftertouch: c.fn("aftertouch"),
    onPadPress: c.fn("padPress"),
    onPadRelease: c.fn("padRelease"),
    onStepButtons: c.fn("step"),
    trackPadBase: TRACK_PAD_BASE,
    ...overrides,
  };
}

describe("Internal MIDI workflow", () => {
  test("routes pad aftertouch before the noise filter can drop 0xA0", () => {
    const c = calls();
    const S = state();

    handleUiMidiInternalMessage(S, deps(c, { isNoiseMessage: () => true }), [0xA0, 68, 99]);

    expect(c.log).toEqual([["aftertouch", 68, 99]]);
  });

  test("consumes non-pad aftertouch without calling handlers", () => {
    const c = calls();

    handleUiMidiInternalMessage(state(), deps(c), [0xA0, 40, 99]);

    expect(c.log).toEqual([]);
  });

  test("drops generic noise and Move-native volume traffic", () => {
    const c = calls();
    const d = deps(c, { isNoiseMessage: (data: number[]) => data[0] === 0 });

    handleUiMidiInternalMessage(state(), d, [0, 0, 0]);
    handleUiMidiInternalMessage(state(), d, [0xB0, 79, 12]);
    handleUiMidiInternalMessage(state(), d, [0x90, 8, 127]);
    handleUiMidiInternalMessage(state(), d, [0x80, 8, 0]);

    expect(c.log).toEqual([]);
  });

  test("disarms Delete tap on any real input except Delete CC itself", () => {
    const c = calls();
    const S = state({ deleteTapArmed: true });

    handleUiMidiInternalMessage(S, deps(c), [0xB0, MOVE_DELETE, 127]);
    expect(S.deleteTapArmed).toBe(true);

    handleUiMidiInternalMessage(S, deps(c), [0x90, 68, 100]);
    expect(S.deleteTapArmed).toBe(false);
  });

  test("snapshot picker swallows non-jog input but lets allowed CCs dispatch", () => {
    const c = calls();
    const S = state({ snapshotPicker: { confirm: true } });

    handleUiMidiInternalMessage(S, deps(c), [0x90, 68, 100]);
    handleUiMidiInternalMessage(S, deps(c), [0xB0, MOVE_MAIN_KNOB, 1]);

    expect(c.log).toEqual([["cc", MOVE_MAIN_KNOB, 1]]);
  });

  test("clear automation menu closes on Delete press and otherwise only allows jog CC", () => {
    const c = calls();
    const S = state({ clearAutoMenu: { selectedIndex: 0 } });

    handleUiMidiInternalMessage(S, deps(c), [0x90, 68, 100]);
    handleUiMidiInternalMessage(S, deps(c), [0xB0, MOVE_MAIN_KNOB, 65]);
    handleUiMidiInternalMessage(S, deps(c), [0xB0, MOVE_DELETE, 127]);

    expect(c.log).toEqual([
      ["cc", MOVE_MAIN_KNOB, 65],
      ["closeClearAutoMenu"],
    ]);
  });

  test("session overview only lets Note/Session release and Up/Down scroll through", () => {
    const c = calls();
    const S = state({ sessionOverlayHeld: true });

    handleUiMidiInternalMessage(S, deps(c), [0xB0, 71, 1]);
    handleUiMidiInternalMessage(S, deps(c), [0xB0, MOVE_UP, 127]);
    handleUiMidiInternalMessage(S, deps(c), [0xB0, MOVE_NOTE_SESSION, 0]);

    expect(c.log).toEqual([
      ["cc", MOVE_UP, 127],
      ["cc", MOVE_NOTE_SESSION, 0],
    ]);
  });

  test("dispatches knob touch, CC, steps, pad press, and pad release in priority order", () => {
    const c = calls();
    const d = deps(c);
    const S = state();

    handleUiMidiInternalMessage(S, d, [0x90, 0, 127]);
    handleUiMidiInternalMessage(S, d, [0xB0, 71, 1]);
    handleUiMidiInternalMessage(S, d, [0x90, 16, 100]);
    handleUiMidiInternalMessage(S, d, [0x90, 68, 100]);
    handleUiMidiInternalMessage(S, d, [0x80, 68, 0]);
    handleUiMidiInternalMessage(S, d, [0x90, 68, 0]);

    expect(c.log).toEqual([
      ["knobTouch", 0x90, 0, 127],
      ["cc", 71, 1],
      ["step", 16, 100],
      ["padPress", 0x90, 68, 100],
      ["padRelease", 0x80, 68, 0],
      ["padRelease", 0x90, 68, 0],
    ]);
  });
});
