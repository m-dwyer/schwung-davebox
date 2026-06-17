import { afterEach, describe, expect, test, vi } from "vitest";
import {
  altIndicatorActiveImpl,
  bankHasAltParamsImpl,
  ccKnobDeltaImpl,
} from "@overture-ui/bank/ui_bank_state.mjs";
import {
  defaultStepNoteImpl,
  drumNoteLabelImpl,
  scaleNudgeNoteImpl,
  stepEntryVelocityImpl,
} from "@overture-ui/core/ui_note_edit_helpers.mjs";

function state(overrides: Record<string, unknown> = {}) {
  return {
    activeTrack: 0,
    trackPadMode: [0, 1],
    activeBank: 0,
    altMode: false,
    stepIntervalMode: false,
    scaleAware: false,
    padKey: 0,
    padScale: 0,
    padNoteMap: new Array(32).fill(0xff),
    trackOctave: [0, 0],
    trackVelOverride: [0, 0],
    drumVelZoneArmed: [false, false],
    drumLastVelZone: [0, 0],
    knobAccelLast: new Array(8).fill(0),
    knobAccelDir: new Array(8).fill(0),
    knobAccelRun: new Array(8).fill(0),
    knobAccelAcc: new Array(8).fill(0),
    ...overrides,
  } as any;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("bank chrome state helpers", () => {
  test("reports melodic and drum alt-bank eligibility", () => {
    const S = state();
    for (const bank of [0, 1, 3, 4, 5, 6]) {
      expect(bankHasAltParamsImpl(S, 0, bank)).toBe(true);
    }
    expect(bankHasAltParamsImpl(S, 0, 2)).toBe(false);
    expect(bankHasAltParamsImpl(S, 0, 7)).toBe(false);

    for (const bank of [0, 5, 7]) {
      expect(bankHasAltParamsImpl(S, 1, bank)).toBe(true);
    }
    expect(bankHasAltParamsImpl(S, 1, 1)).toBe(false);
    expect(bankHasAltParamsImpl(S, 1, 6)).toBe(false);
  });

  test("uses step-interval mode for melodic arp banks and altMode otherwise", () => {
    const S = state({ altMode: true, stepIntervalMode: false });
    expect(altIndicatorActiveImpl(S, 0, 0)).toBe(true);
    expect(altIndicatorActiveImpl(S, 0, 4)).toBe(false);
    expect(altIndicatorActiveImpl({ ...S, stepIntervalMode: true }, 0, 5)).toBe(true);
    expect(altIndicatorActiveImpl({ ...S, altMode: false, stepIntervalMode: true }, 1, 5)).toBe(false);
  });

  test("cc knob acceleration resets on pause and direction change", () => {
    const S = state();
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);

    expect(ccKnobDeltaImpl(S, 1, 2)).toBe(0);
    now += 20;
    expect(ccKnobDeltaImpl(S, 1, 2)).toBe(0);
    now += 20;
    expect(ccKnobDeltaImpl(S, 1, 2)).toBe(1);
    expect(S.knobAccelRun[2]).toBe(3);

    now += 181;
    expect(ccKnobDeltaImpl(S, 1, 2)).toBe(0);
    expect(S.knobAccelRun[2]).toBe(1);
    expect(S.knobAccelAcc[2]).toBe(1);

    now += 20;
    expect(ccKnobDeltaImpl(S, 127, 2)).toBe(0);
    expect(S.knobAccelDir[2]).toBe(-1);
    expect(S.knobAccelRun[2]).toBe(1);

    expect(ccKnobDeltaImpl(S, 64, 2)).toBe(0);
  });

  test("cc knob acceleration increases gain after sustained turns", () => {
    const S = state();
    let now = 2_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);

    const outs: number[] = [];
    for (let i = 0; i < 14; i++) {
      outs.push(ccKnobDeltaImpl(S, 1, 0));
      now += 20;
    }

    expect(outs.slice(0, 12).reduce((sum, v) => sum + v, 0)).toBe(4);
    expect(outs[12]).toBe(0);
    expect(outs[13]).toBe(1);
    expect(S.knobAccelRun[0]).toBe(14);
  });
});

describe("note edit helpers", () => {
  test("nudges chromatically when scale-aware mode is off", () => {
    expect(scaleNudgeNoteImpl(state({ scaleAware: false }), 60, 1, 0, 0)).toBe(61);
    expect(scaleNudgeNoteImpl(state({ scaleAware: false }), 0, -1, 0, 0)).toBe(0);
    expect(scaleNudgeNoteImpl(state({ scaleAware: false }), 127, 1, 0, 0)).toBe(127);
  });

  test("nudges to the next in-scale pitch when scale-aware mode is on", () => {
    const S = state({ scaleAware: true });
    expect(scaleNudgeNoteImpl(S, 60, 1, 0, 0)).toBe(62);
    expect(scaleNudgeNoteImpl(S, 60, -1, 0, 0)).toBe(59);
    expect(scaleNudgeNoteImpl(S, 61, 1, 2, 0)).toBe(62);
  });

  test("selects the default step note from nearest root pad, then fallback, then middle C", () => {
    expect(defaultStepNoteImpl(state({
      padKey: 0,
      padNoteMap: [0xff, 12, 0, 24, ...new Array(28).fill(0xff)],
      trackOctave: [4],
    }))).toBe(60);

    expect(defaultStepNoteImpl(state({
      padKey: 7,
      padNoteMap: [1, 3, 5, ...new Array(29).fill(0xff)],
      trackOctave: [5],
    }))).toBe(61);

    expect(defaultStepNoteImpl(state())).toBe(60);
  });

  test("applies step-entry velocity precedence", () => {
    expect(stepEntryVelocityImpl(state(), 0, 88, true)).toBe(88);
    expect(stepEntryVelocityImpl(state({ drumVelZoneArmed: [true], drumLastVelZone: [15] }), 0, -1, true)).toBe(127);
    expect(stepEntryVelocityImpl(state({ trackVelOverride: [64] }), 0, -1, true)).toBe(64);
    expect(stepEntryVelocityImpl(state(), 0, -1, true)).toBe(100);

    expect(stepEntryVelocityImpl(state({ trackVelOverride: [70] }), 0, 88, false)).toBe(70);
    expect(stepEntryVelocityImpl(state(), 0, 88, false)).toBe(88);
    expect(stepEntryVelocityImpl(state(), 0, -1, false)).toBe(100);
  });

  test("formats drum note labels", () => {
    expect(drumNoteLabelImpl(60)).toBe("C3/60");
    expect(drumNoteLabelImpl(61)).toBe("C#3/61");
  });
});
