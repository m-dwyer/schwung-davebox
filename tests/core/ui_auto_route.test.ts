import { describe, expect, test } from "vitest";
import {
  ROUTE_MOVE,
  ROUTE_SCHWUNG,
  canonicalRoute,
  canonicalSlotChannel,
  buildAutoRouteMacro,
  midiInMacro,
  beginAutoRoute,
  runAutoRouteTickTasks,
  runAutoRouteRequest,
  readCurrentSongIndex,
} from "@overture-ui/core/ui_auto_route.mjs";

const JOG_CC = 14;
const CLICK_CC = 3;
const BACK_CC = 51;
const SHIFT_CC = 49;
// 0-based track t -> Move track-button CC (44 - (t+1)).
const trackCC = (t0: number) => 44 - (t0 + 1);

type Step = { emit: number[][]; gap: number };

function autoRouteState(overrides: Record<string, unknown> = {}) {
  return {
    trackRoute: new Array(8).fill(0),
    trackChannel: new Array(8).fill(1),
    autoRouteQueue: null as Step[] | null,
    autoRouteGap: 0,
    autoRouteActive: false,
    autoRouteWatchdog: 0,
    autoRouteAppliedUuid: "",
    pendingAutoRouteRequest: false,
    ...overrides,
  };
}

describe("canonicalRoute / canonicalSlotChannel", () => {
  test("T1-4 are Move ch 1-4", () => {
    for (let t = 0; t < 4; t++) {
      expect(canonicalRoute(t)).toEqual({ route: ROUTE_MOVE, channel: t + 1 });
    }
  });

  test("T5-8 are Schwung ch 5-8", () => {
    for (let t = 4; t < 8; t++) {
      expect(canonicalRoute(t)).toEqual({ route: ROUTE_SCHWUNG, channel: t + 1 });
    }
  });

  test("slot i maps to channel i+5", () => {
    expect(canonicalSlotChannel(0)).toBe(5);
    expect(canonicalSlotChannel(1)).toBe(6);
    expect(canonicalSlotChannel(2)).toBe(7);
    expect(canonicalSlotChannel(3)).toBe(8);
  });
});

describe("gesture builder", () => {
  test("a single track's macro is a plausible step list", () => {
    const steps: Step[] = midiInMacro(0, 1);

    // Flatten every emitted CC so we can assert the gesture's shape.
    const ccs = steps.flatMap((s) => s.emit.map((ev) => ev[2]));

    // shift hold-down then hold-up.
    expect(ccs).toContain(SHIFT_CC);
    // track-button press for track 0.
    expect(ccs).toContain(trackCC(0));
    // a jog-click to enter the selector / confirm.
    expect(ccs).toContain(CLICK_CC);
    // jog turns to navigate the menu.
    expect(ccs).toContain(JOG_CC);
    // a Back press to return to note view.
    expect(ccs).toContain(BACK_CC);

    // The first step holds shift DOWN; some later step releases it (val 0).
    const shiftHoldDown = steps.find(
      (s) => s.emit.length === 1 && s.emit[0][2] === SHIFT_CC && s.emit[0][3] === 127,
    );
    const shiftHoldUp = steps.find(
      (s) => s.emit.length === 1 && s.emit[0][2] === SHIFT_CC && s.emit[0][3] === 0,
    );
    expect(shiftHoldDown).toBeTruthy();
    expect(shiftHoldUp).toBeTruthy();
  });

  test("higher target channels produce more jog steps (step count grows)", () => {
    const jogSteps = (channel: number) =>
      midiInMacro(0, channel).filter(
        (s) => s.emit.length === 1 && s.emit[0][2] === JOG_CC,
      ).length;

    expect(jogSteps(2)).toBeGreaterThan(jogSteps(1));
    expect(jogSteps(4)).toBeGreaterThan(jogSteps(2));
    // Strictly monotonic by 1 down-detent per channel.
    expect(jogSteps(2) - jogSteps(1)).toBe(1);
  });

  test("buildAutoRouteMacro covers all four Move tracks", () => {
    const steps: Step[] = buildAutoRouteMacro([1, 2, 3, 4]);
    const ccs = steps.flatMap((s) => s.emit.map((ev) => ev[2]));
    for (let t = 0; t < 4; t++) expect(ccs).toContain(trackCC(t));
    // Every emitted CC value is a valid 7-bit MIDI CC, packet is cable-0 CC.
    for (const s of steps)
      for (const ev of s.emit) {
        expect(ev[0]).toBe(0x0b);
        expect(ev[1]).toBe(0xb0);
        expect(ev[2]).toBeGreaterThanOrEqual(0);
        expect(ev[2]).toBeLessThanOrEqual(0x7f);
        expect(ev[3]).toBeGreaterThanOrEqual(0);
        expect(ev[3]).toBeLessThanOrEqual(0x7f);
      }
  });
});

describe("beginAutoRoute", () => {
  test("re-seeds Schwung slots ch5-8 via the BLOCKING setter and populates the macro queue", () => {
    // The blocking setter (shadow_set_param_timeout) round-trips per call, so all
    // four slot writes land — the non-blocking variant would coalesce to ch8 only.
    const calls: Array<[number, string, string, number]> = [];
    const nonBlocking: unknown[] = [];
    const deps = {
      shadowSetParamTimeout: (slot: number, key: string, val: string, ms: number) => {
        calls.push([slot, key, val, ms]);
        return true;
      },
      shadowSetParam: () => nonBlocking.push(1),
    };
    const S = autoRouteState();

    beginAutoRoute(S as never, deps as never, "uuid-A");

    // 4 blocking calls, slots 0-3, slot:receive_channel "5".."8", with a timeout.
    expect(calls).toEqual([
      [0, "slot:receive_channel", "5", 500],
      [1, "slot:receive_channel", "6", 500],
      [2, "slot:receive_channel", "7", 500],
      [3, "slot:receive_channel", "8", 500],
    ]);
    // When the blocking setter is present, the non-blocking one is NOT used.
    expect(nonBlocking.length).toBe(0);

    // Canonical Overture routing applied: T1-4 Move ch1-4, T5-8 Schwung ch5-8.
    expect(S.trackRoute).toEqual([
      ROUTE_MOVE, ROUTE_MOVE, ROUTE_MOVE, ROUTE_MOVE,
      ROUTE_SCHWUNG, ROUTE_SCHWUNG, ROUTE_SCHWUNG, ROUTE_SCHWUNG,
    ]);
    expect(S.trackChannel).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    // Macro queued + overlay/watchdog armed.
    expect(Array.isArray(S.autoRouteQueue)).toBe(true);
    expect((S.autoRouteQueue as Step[]).length).toBeGreaterThan(0);
    expect(S.autoRouteActive).toBe(true);
    expect(S.autoRouteWatchdog).toBeGreaterThan(0);
    expect(S.autoRouteAppliedUuid).toBe("uuid-A");
  });

  test("falls back to the non-blocking setter when the timeout variant is absent", () => {
    // Older host / stock Schwung: only shadow_set_param exists. The re-seed must
    // still fire all four slot writes through the fire-and-forget setter.
    const calls: Array<[number, string, string]> = [];
    const deps = {
      shadowSetParam: (slot: number, key: string, val: string) =>
        calls.push([slot, key, val]),
    };
    const S = autoRouteState();

    beginAutoRoute(S as never, deps as never, "uuid-fallback");

    expect(calls).toEqual([
      [0, "slot:receive_channel", "5"],
      [1, "slot:receive_channel", "6"],
      [2, "slot:receive_channel", "7"],
      [3, "slot:receive_channel", "8"],
    ]);
  });

  test("is a no-op on the second call with the same uuid", () => {
    const calls: unknown[] = [];
    const deps = { shadowSetParam: () => calls.push(1) };
    const S = autoRouteState();

    beginAutoRoute(S as never, deps as never, "uuid-A");
    expect(calls.length).toBe(4);

    // Drain the queue so we can prove the second call doesn't refill it.
    S.autoRouteQueue = null;
    beginAutoRoute(S as never, deps as never, "uuid-A");

    expect(calls.length).toBe(4); // no extra shadowSetParam calls
    expect(S.autoRouteQueue).toBe(null); // not re-populated
  });

  test("tolerates a missing shadowSetParam host function", () => {
    const S = autoRouteState();
    beginAutoRoute(S as never, {} as never, "uuid-B");
    expect(Array.isArray(S.autoRouteQueue)).toBe(true);
    expect(S.autoRouteActive).toBe(true);
  });

  test("force=true bypasses the once-per-uuid guard", () => {
    const calls: unknown[] = [];
    const deps = { shadowSetParam: () => calls.push(1) };
    // The auto-guard would normally short-circuit: same uuid already applied.
    const S = autoRouteState({ autoRouteAppliedUuid: "uuid-A" });

    beginAutoRoute(S as never, deps as never, "uuid-A", { force: true });

    expect(calls.length).toBe(4); // fired despite the matching applied uuid
    expect(Array.isArray(S.autoRouteQueue)).toBe(true);
    expect(S.autoRouteActive).toBe(true);
  });

  test("re-entry guard: a run already in flight makes any call a no-op", () => {
    const calls: unknown[] = [];
    const deps = { shadowSetParam: () => calls.push(1) };
    // autoRouteQueue already set → a macro is mid-drain.
    const S = autoRouteState({ autoRouteQueue: [] as Step[] });

    beginAutoRoute(S as never, deps as never, "uuid-Z");
    expect(calls.length).toBe(0);

    // Even forced, the re-entry guard wins.
    beginAutoRoute(S as never, deps as never, "uuid-Z", { force: true });
    expect(calls.length).toBe(0);
  });
});

describe("runAutoRouteRequest", () => {
  test("fires once when pending, clears the flag, then is a no-op", () => {
    const calls: Array<[number, string, string]> = [];
    const injected: number[][] = [];
    const deps = {
      shadowSetParam: (slot: number, key: string, val: string) =>
        calls.push([slot, key, val]),
      host_module_get_param: (key: string) => (key === "state_uuid" ? "u" : ""),
      move_midi_inject_to_move: (packet: number[]) => injected.push(packet),
    };
    const S = autoRouteState({ pendingAutoRouteRequest: true });

    runAutoRouteRequest(S as never, deps as never);

    // Flag cleared, the route was applied (forced begin) once.
    expect(S.pendingAutoRouteRequest).toBe(false);
    expect(calls.length).toBe(4);
    expect(Array.isArray(S.autoRouteQueue)).toBe(true);
    expect(S.autoRouteAppliedUuid).toBe("u");

    // Second call with the flag now false: no further begin.
    S.autoRouteQueue = null;
    runAutoRouteRequest(S as never, deps as never);
    expect(calls.length).toBe(4);
    expect(S.autoRouteQueue).toBe(null);
  });

  test("is a no-op when no request is pending", () => {
    const calls: unknown[] = [];
    const deps = {
      shadowSetParam: () => calls.push(1),
      host_module_get_param: () => "u",
    };
    const S = autoRouteState({ pendingAutoRouteRequest: false });
    runAutoRouteRequest(S as never, deps as never);
    expect(calls.length).toBe(0);
    expect(S.autoRouteQueue).toBe(null);
  });
});

describe("runAutoRouteTickTasks", () => {
  test("drains the queue and eventually clears autoRouteActive", () => {
    const injected: number[][] = [];
    const deps = {
      shadowSetParam: () => {},
      move_midi_inject_to_move: (packet: number[]) => injected.push(packet),
    };
    const S = autoRouteState();
    beginAutoRoute(S as never, deps as never, "uuid-C");

    const startSteps = (S.autoRouteQueue as Step[]).length;
    expect(startSteps).toBeGreaterThan(0);

    // Drive enough ticks to fully drain (steps + their gaps + finish tick).
    let guard = 100000;
    while (S.autoRouteActive && guard-- > 0) {
      runAutoRouteTickTasks(S as never, deps as never);
    }

    expect(S.autoRouteActive).toBe(false);
    expect(S.autoRouteQueue).toBe(null);
    expect(S.autoRouteWatchdog).toBe(0);
    expect(injected.length).toBeGreaterThan(0);
    // Every injected packet is a cable-0 CC.
    for (const p of injected) {
      expect(p[0]).toBe(0x0b);
      expect(p[1]).toBe(0xb0);
    }
  });

  test("is a no-op when no macro is queued", () => {
    const injected: unknown[] = [];
    const deps = { move_midi_inject_to_move: () => injected.push(1) };
    const S = autoRouteState({ autoRouteQueue: null });
    runAutoRouteTickTasks(S as never, deps as never);
    expect(injected.length).toBe(0);
  });

  test("aborts cleanly when the inject host function is missing", () => {
    const S = autoRouteState();
    beginAutoRoute(S as never, { shadowSetParam: () => {} } as never, "uuid-D");
    runAutoRouteTickTasks(S as never, {} as never);
    expect(S.autoRouteActive).toBe(false);
    expect(S.autoRouteQueue).toBe(null);
  });

  test("respects inter-step gaps (gap ticks emit nothing)", () => {
    const injected: number[][] = [];
    const deps = {
      shadowSetParam: () => {},
      move_midi_inject_to_move: (packet: number[]) => injected.push(packet),
    };
    const S = autoRouteState();
    beginAutoRoute(S as never, deps as never, "uuid-E");

    // First tick fires step 1 and sets a gap > 0.
    runAutoRouteTickTasks(S as never, deps as never);
    const afterFirst = injected.length;
    expect(afterFirst).toBeGreaterThan(0);
    expect(S.autoRouteGap).toBeGreaterThan(0);

    // The very next tick is a gap tick: nothing new injected.
    runAutoRouteTickTasks(S as never, deps as never);
    expect(injected.length).toBe(afterFirst);
  });

  test("watchdog hard-aborts a stuck macro", () => {
    const deps = {
      shadowSetParam: () => {},
      move_midi_inject_to_move: () => {},
    };
    const S = autoRouteState({
      autoRouteQueue: [{ emit: [[0x0b, 0xb0, 1, 1]], gap: 9999 }] as Step[],
      autoRouteActive: true,
      autoRouteWatchdog: 1, // expires on the next tick
    });

    runAutoRouteTickTasks(S as never, deps as never);

    expect(S.autoRouteActive).toBe(false);
    expect(S.autoRouteQueue).toBe(null);
  });
});

describe("readCurrentSongIndex", () => {
  const read = (raw: string | null) =>
    readCurrentSongIndex({ host_read_file: () => raw } as never);

  test("parses currentSongIndex from a valid JSON string", () => {
    expect(read(JSON.stringify({ currentSongIndex: 7, other: "x" }))).toBe(7);
    expect(read('{"currentSongIndex":0}')).toBe(0);
  });

  test("truncates a non-integer numeric index to an int", () => {
    expect(read('{"currentSongIndex":3.9}')).toBe(3);
  });

  test("returns -1 on malformed JSON", () => {
    expect(read("{ not json")).toBe(-1);
  });

  test("returns -1 when currentSongIndex key is missing", () => {
    expect(read(JSON.stringify({ somethingElse: 1 }))).toBe(-1);
  });

  test("returns -1 when the key is present but non-numeric", () => {
    expect(read('{"currentSongIndex":"5"}')).toBe(-1);
  });

  test("returns -1 when the file is missing/empty", () => {
    expect(read(null)).toBe(-1);
    expect(read("")).toBe(-1);
  });

  test("returns -1 when no host_read_file is available", () => {
    expect(readCurrentSongIndex({} as never)).toBe(-1);
  });
});
