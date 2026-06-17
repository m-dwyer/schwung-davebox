import { describe, expect, test } from "vitest";
import { applyExtMidiRemapImpl } from "@overture-ui/midi/ui_ext_midi_remap_workflow.mjs";

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    fn(name: string) {
      return (...args: unknown[]) => log.push([name, ...args]);
    },
  };
}

function deps(c: ReturnType<typeof calls>, overrides: Record<string, unknown> = {}) {
  return {
    routeMove: 1,
    blockValue: 254,
    clear: c.fn("clear"),
    set: c.fn("set"),
    enable: c.fn("enable"),
    ...overrides,
  };
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    activeTrack: 0,
    trackRoute: [1, 0, 2, 1],
    trackChannel: [3, 4, 5, 6],
    midiInChannel: 0,
    extMidiRemapActive: false,
    ...overrides,
  };
}

describe("external MIDI remap workflow", () => {
  test("missing host remap enable is a no-op", () => {
    const c = calls();
    const S = state({ extMidiRemapActive: true });

    applyExtMidiRemapImpl(S, deps(c, { enable: null }));

    expect(S.extMidiRemapActive).toBe(true);
    expect(c.log).toEqual([]);
  });

  test("non-Move routes block every input channel and mark remap inactive", () => {
    const c = calls();
    const S = state({ activeTrack: 1, extMidiRemapActive: true });

    applyExtMidiRemapImpl(S, deps(c));

    expect(S.extMidiRemapActive).toBe(false);
    expect(c.log).toEqual([
      ["clear"],
      ...Array.from({ length: 16 }, (_, i) => ["set", i, 254] as [string, number, number]),
      ["enable", 1],
    ]);
  });

  test("external routes also use the non-Move block table", () => {
    const c = calls();
    const S = state({ activeTrack: 2, extMidiRemapActive: true });

    applyExtMidiRemapImpl(S, deps(c));

    expect(S.extMidiRemapActive).toBe(false);
    expect(c.log).toEqual([
      ["clear"],
      ...Array.from({ length: 16 }, (_, i) => ["set", i, 254] as [string, number, number]),
      ["enable", 1],
    ]);
  });

  test("Move route all-channel input remaps every other channel to the track channel", () => {
    const c = calls();
    const S = state({ activeTrack: 0, trackChannel: [3] });

    applyExtMidiRemapImpl(S, deps(c));

    expect(S.extMidiRemapActive).toBe(true);
    expect(c.log).toEqual([
      ["clear"],
      ["set", 0, 2],
      ["set", 1, 2],
      ["set", 3, 2],
      ["set", 4, 2],
      ["set", 5, 2],
      ["set", 6, 2],
      ["set", 7, 2],
      ["set", 8, 2],
      ["set", 9, 2],
      ["set", 10, 2],
      ["set", 11, 2],
      ["set", 12, 2],
      ["set", 13, 2],
      ["set", 14, 2],
      ["set", 15, 2],
      ["enable", 1],
    ]);
  });

  test("Move route single input-channel remaps only that channel", () => {
    const c = calls();
    const S = state({ activeTrack: 3, midiInChannel: 2 });

    applyExtMidiRemapImpl(S, deps(c));

    expect(S.extMidiRemapActive).toBe(true);
    expect(c.log).toEqual([
      ["clear"],
      ["set", 1, 5],
      ["enable", 1],
    ]);
  });

  test("Move route single input-channel matching output channel only enables table", () => {
    const c = calls();
    const S = state({ activeTrack: 3, midiInChannel: 6 });

    applyExtMidiRemapImpl(S, deps(c));

    expect(S.extMidiRemapActive).toBe(true);
    expect(c.log).toEqual([
      ["clear"],
      ["enable", 1],
    ]);
  });
});
