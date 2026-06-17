import { describe, expect, test } from "vitest";
import {
  sendPerfModsImpl,
  updatePerfModeLEDsImpl,
} from "@overture-ui/render/ui_perf_leds.mjs";
import {
  Red,
  Green,
  DeepRed,
  DarkBlue,
  Mustard,
  DeepGreen,
  DarkGrey,
  LightGrey,
  DeepMagenta,
  PurpleBlue,
  White,
} from "/data/UserData/schwung/shared/constants.mjs";
import { TRACK_COLORS, TRACK_DIM_COLORS } from "@overture-ui/core/ui_constants.mjs";

type LedCall = ["setLED", number, number];

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    deps: {
      setLED: (note: number, color: number) => log.push(["setLED", note, color]),
      setParam: (key: string, value: string) => log.push(["setParam", key, value]),
    },
  };
}

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    ledInitComplete: true,
    perfModsToggled: 0,
    perfModsHeld: 0,
    perfRecalledSlot: -1,
    perfSnapshots: new Array(16).fill(0),
    perfStickyLengths: new Set<number>(),
    perfStack: [],
    perfHoldPadHeld: false,
    perfSync: true,
    perfLatchMode: true,
    ...overrides,
  };
}

function ledMap(log: Array<[string, ...unknown[]]>) {
  return new Map(
    log
      .filter((call): call is LedCall => call[0] === "setLED")
      .map(([, note, color]) => [note, color])
  );
}

describe("Performance Mode LEDs - DSP payload", () => {
  test("sendPerfMods sends the combined toggled and held bitmask", () => {
    const c = calls();
    sendPerfModsImpl(baseState({
      perfModsToggled: (1 << 2) | (1 << 9),
      perfModsHeld: (1 << 9) | (1 << 20),
    }), c.deps);

    expect(c.log).toEqual([["setParam", "perf_mods", String((1 << 2) | (1 << 9) | (1 << 20))]]);
  });

  test("sendPerfMods is a no-op when no set_param host is available", () => {
    const c = calls();
    sendPerfModsImpl(baseState({ perfModsToggled: 7 }), { setParam: null });
    expect(c.log).toEqual([]);
  });
});

describe("Performance Mode LEDs - grid rendering", () => {
  test("returns before LED init completion", () => {
    const c = calls();
    updatePerfModeLEDsImpl(baseState({ ledInitComplete: false }), c.deps);
    expect(c.log).toEqual([]);
  });

  test("renders preset slot LEDs with recalled, saved, and empty colors", () => {
    const c = calls();
    const perfSnapshots = new Array(16).fill(0);
    perfSnapshots[0] = 1;
    perfSnapshots[5] = 1 << 12;
    updatePerfModeLEDsImpl(baseState({ perfRecalledSlot: 5, perfSnapshots }), c.deps);

    const leds = ledMap(c.log);
    expect(leds.get(16)).toBe(PurpleBlue);
    expect(leds.get(21)).toBe(White);
    expect(leds.get(31)).toBe(LightGrey);
  });

  test("renders rate pads and hold sync latch pads", () => {
    const c = calls();
    updatePerfModeLEDsImpl(baseState({
      perfStickyLengths: new Set([1]),
      perfStack: [{ idx: 3, ticks: 96 }],
      perfHoldPadHeld: true,
      perfSync: false,
      perfLatchMode: false,
    }), c.deps);

    const leds = ledMap(c.log);
    expect(leds.get(68)).toBe(DarkGrey);
    expect(leds.get(69)).toBe(White);
    expect(leds.get(70)).toBe(DarkGrey);
    expect(leds.get(71)).toBe(White);
    expect(leds.get(72)).toBe(DarkGrey);
    expect(leds.get(73)).toBe(Red);
    expect(leds.get(74)).toBe(DeepGreen);
    expect(leds.get(75)).toBe(TRACK_DIM_COLORS[2]);
  });

  test("renders inactive hold sync latch pads with their dim or bright defaults", () => {
    const c = calls();
    updatePerfModeLEDsImpl(baseState(), c.deps);

    const leds = ledMap(c.log);
    expect(leds.get(73)).toBe(DeepRed);
    expect(leds.get(74)).toBe(Green);
    expect(leds.get(75)).toBe(TRACK_COLORS[2]);
  });

  test("renders pitch, velocity, and wild modifier rows from active mod bits", () => {
    const c = calls();
    updatePerfModeLEDsImpl(baseState({
      perfModsToggled: (1 << 0) | (1 << 10),
      perfModsHeld: (1 << 22),
    }), c.deps);

    const leds = ledMap(c.log);
    expect(leds.get(76)).toBe(White);
    expect(leds.get(77)).toBe(DeepMagenta);
    expect(leds.get(84)).toBe(Mustard);
    expect(leds.get(86)).toBe(White);
    expect(leds.get(92)).toBe(DarkBlue);
    expect(leds.get(98)).toBe(White);
    expect(leds.get(99)).toBe(DarkBlue);
  });

  test("emits all preset and pad LEDs in the original draw order", () => {
    const c = calls();
    updatePerfModeLEDsImpl(baseState(), c.deps);

    expect(c.log).toHaveLength(48);
    expect(c.log.slice(0, 3)).toEqual([
      ["setLED", 16, LightGrey],
      ["setLED", 17, LightGrey],
      ["setLED", 18, LightGrey],
    ]);
    expect(c.log[16]).toEqual(["setLED", 68, DarkGrey]);
    expect(c.log.at(-1)).toEqual(["setLED", 99, DarkBlue]);
  });
});
