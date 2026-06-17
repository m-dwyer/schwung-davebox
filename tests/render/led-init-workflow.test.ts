import { describe, expect, test } from "vitest";
import {
  buildLedInitQueueImpl,
  clearAllLEDsImpl,
  drainLedInitImpl,
  installFlagsWrapImpl,
  removeFlagsWrapImpl,
} from "@overture-ui/render/ui_led_init_workflow.mjs";
import { LEDS_PER_FRAME, SEQ8_NAV_FLAGS } from "@overture-ui/core/ui_constants.mjs";

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    fn(name: string) {
      return (...args: unknown[]) => log.push([name, ...args]);
    },
  };
}

function deps(c: ReturnType<typeof calls>, holder: { fn?: any } = {}) {
  return {
    setLED: c.fn("setLED"),
    setButtonLED: c.fn("setButtonLED"),
    setPaletteEntryRGB: c.fn("setPaletteEntryRGB"),
    reapplyPalette: c.fn("reapplyPalette"),
    invalidateLEDCache: c.fn("invalidateLEDCache"),
    clearFlags: c.fn("clearFlags"),
    getFlagsFn: () => holder.fn,
    setFlagsFn: (fn: any) => {
      c.log.push(["setFlagsFn", fn]);
      holder.fn = fn;
    },
  };
}

describe("LED init workflow - owned LED set", () => {
  test("buildLedInitQueue returns every owned LED in clear order", () => {
    const q = buildLedInitQueueImpl();
    expect(q).toHaveLength(92);
    expect(q.slice(0, 4)).toEqual([
      { kind: "note", id: 68 },
      { kind: "note", id: 69 },
      { kind: "note", id: 70 },
      { kind: "note", id: 71 },
    ]);
    expect(q.slice(32, 36)).toEqual([
      { kind: "note", id: 16 },
      { kind: "note", id: 17 },
      { kind: "note", id: 18 },
      { kind: "note", id: 19 },
    ]);
    expect(q.slice(48, 52)).toEqual([
      { kind: "cc", id: 16 },
      { kind: "cc", id: 17 },
      { kind: "cc", id: 18 },
      { kind: "cc", id: 19 },
    ]);
    expect(q.at(-5)).toEqual({ kind: "cc", id: 85 });
    expect(q.at(-1)).toEqual({ kind: "cc", id: 119 });
  });

  test("clearAllLEDs turns off the same note and CC groups", () => {
    const c = calls();
    clearAllLEDsImpl(deps(c));
    expect(c.log).toHaveLength(92);
    expect(c.log.slice(0, 3)).toEqual([
      ["setLED", 68, 0],
      ["setLED", 69, 0],
      ["setLED", 70, 0],
    ]);
    expect(c.log).toContainEqual(["setLED", 31, 0]);
    expect(c.log).toContainEqual(["setButtonLED", 16, 0]);
    expect(c.log).toContainEqual(["setButtonLED", 78, 0]);
    expect(c.log.at(-1)).toEqual(["setButtonLED", 119, 0]);
  });
});

describe("LED init workflow - drain", () => {
  test("drainLedInit clears one frame of LEDs without completing early", () => {
    const c = calls();
    const S = {
      ledInitQueue: buildLedInitQueueImpl(),
      ledInitIndex: 0,
      ledInitComplete: false,
    };
    drainLedInitImpl(S, deps(c));
    expect(S.ledInitIndex).toBe(LEDS_PER_FRAME);
    expect(S.ledInitComplete).toBe(false);
    expect(c.log).toHaveLength(LEDS_PER_FRAME);
    expect(c.log).not.toContainEqual(["reapplyPalette"]);
  });

  test("drainLedInit completes, sets custom palette entry, and reapplies palette", () => {
    const c = calls();
    const q = buildLedInitQueueImpl();
    const S = {
      ledInitQueue: q,
      ledInitIndex: q.length - 2,
      ledInitComplete: false,
    };
    drainLedInitImpl(S, deps(c));
    expect(S.ledInitIndex).toBe(q.length);
    expect(S.ledInitComplete).toBe(true);
    expect(c.log).toEqual([
      ["setButtonLED", 118, 0],
      ["setButtonLED", 119, 0],
      ["setPaletteEntryRGB", 60, 32, 32, 32],
      ["reapplyPalette"],
    ]);
  });
});

describe("LED init workflow - flags wrapper", () => {
  test("install wraps shadow_get_ui_flags and clears SEQ8 nav hits while active", () => {
    const c = calls();
    const holder = { fn: () => SEQ8_NAV_FLAGS | 0x4000 };
    const S = { ledInitComplete: true };
    installFlagsWrapImpl(S, deps(c, holder));
    const wrap = holder.fn;
    expect(wrap._seq8).toBe(true);
    expect(wrap._orig).toBeInstanceOf(Function);
    expect(wrap._active).toBe(true);

    c.log.length = 0;
    expect(wrap()).toBe(0x4000);
    expect(S.ledInitComplete).toBe(false);
    expect(c.log[0]).toEqual(["invalidateLEDCache"]);
    expect(c.log).toContainEqual(["clearFlags", SEQ8_NAV_FLAGS]);
    expect(c.log.filter(([name]) => name === "setLED" || name === "setButtonLED")).toHaveLength(92);
  });

  test("existing wrapper is reactivated without replacing identity", () => {
    const c = calls();
    const orig = () => 0;
    const holder = { fn: orig };
    const S = { ledInitComplete: true };
    installFlagsWrapImpl(S, deps(c, holder));
    const firstWrap = holder.fn;
    firstWrap._active = false;
    c.log.length = 0;

    installFlagsWrapImpl(S, deps(c, holder));
    expect(holder.fn).toBe(firstWrap);
    expect(firstWrap._active).toBe(true);
    expect(c.log).toEqual([]);
  });

  test("inactive wrapper returns flags without clearing or invalidating LEDs", () => {
    const c = calls();
    const holder = { fn: () => SEQ8_NAV_FLAGS | 0x20 };
    const S = { ledInitComplete: true };
    installFlagsWrapImpl(S, deps(c, holder));
    const wrap = holder.fn;
    wrap._active = false;
    c.log.length = 0;

    expect(wrap()).toBe(SEQ8_NAV_FLAGS | 0x20);
    expect(S.ledInitComplete).toBe(true);
    expect(c.log).toEqual([]);
  });

  test("remove restores original function and deactivates wrapper", () => {
    const c = calls();
    const orig = () => 0;
    const holder = { fn: orig };
    installFlagsWrapImpl({}, deps(c, holder));
    const wrap = holder.fn;
    c.log.length = 0;

    removeFlagsWrapImpl(deps(c, holder));
    expect(holder.fn).toBe(orig);
    expect(wrap._active).toBe(false);
    expect(c.log).toEqual([["setFlagsFn", orig]]);
  });
});
