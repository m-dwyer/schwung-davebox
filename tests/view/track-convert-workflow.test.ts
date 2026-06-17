import { describe, expect, test } from "vitest";
import {
  closeConvertConfirmImpl,
  convertTrackTypeImpl,
  trackHasAnyDataImpl,
} from "@overture-ui/view/ui_track_convert_workflow.mjs";

const MELODIC = 0;
const DRUM = 1;

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
    activeTrack: 1,
    activeBank: 4,
    trackPadMode: [MELODIC, MELODIC, DRUM],
    clipNonEmpty: [
      [false, false, false, false],
      [false, true, false, false],
      [false, false, false, false],
    ],
    drumClipNonEmpty: [
      [false, false, false, false],
      [false, false, false, false],
      [true, false, false, false],
    ],
    drumVelZoneArmed: [false, true, true],
    drumLastVelZone: [0, 3, 5],
    confirmConvertToDrum: true,
    globalMenuState: { editing: true, editValue: 1 },
    lastSentMenuEditValue: 7,
    bpmWasEditing: true,
    screenDirty: false,
    ...overrides,
  };
}

function deps(c: ReturnType<typeof calls>, overrides: Record<string, unknown> = {}) {
  return {
    numClips: 4,
    padModeDrum: DRUM,
    padModeMelodicScale: MELODIC,
    setParam: (...args: unknown[]) => c.log.push(["setParam", ...args]),
    getParam: (...args: unknown[]) => {
      c.log.push(["getParam", ...args]);
      return "1";
    },
    syncClipsFromDsp: c.fn("syncClips"),
    computePadNoteMap: c.fn("padMap"),
    invalidateLEDCache: c.fn("invalidate"),
    forceRedraw: c.fn("redraw"),
    ...overrides,
  };
}

describe("Track convert workflow", () => {
  test("trackHasAnyData checks both melodic and drum clip mirrors", () => {
    const S = state();

    expect(trackHasAnyDataImpl(S, deps(calls()), 0)).toBe(false);
    expect(trackHasAnyDataImpl(S, deps(calls()), 1)).toBe(true);
    expect(trackHasAnyDataImpl(S, deps(calls()), 2)).toBe(true);
  });

  test("close convert confirm tears down dialog and menu edit state", () => {
    const S = state();

    closeConvertConfirmImpl(S);

    expect(S.confirmConvertToDrum).toBe(false);
    expect(S.globalMenuState.editing).toBe(false);
    expect(S.globalMenuState.editValue).toBeNull();
    expect(S.lastSentMenuEditValue).toBeNull();
    expect(S.bpmWasEditing).toBe(false);
  });

  test("close convert confirm tolerates missing menu state", () => {
    const S = state({ globalMenuState: null });

    closeConvertConfirmImpl(S);

    expect(S.confirmConvertToDrum).toBe(false);
    expect(S.lastSentMenuEditValue).toBeNull();
    expect(S.bpmWasEditing).toBe(false);
  });

  test("melodic-to-drum conversion queues DSP convert, syncs non-empty data, falls back hidden bank, and redraws", () => {
    const c = calls();
    const S = state({ activeTrack: 1, activeBank: 4 });

    convertTrackTypeImpl(S, deps(c), 1, true);

    expect(S.trackPadMode[1]).toBe(DRUM);
    expect(S.activeBank).toBe(0);
    expect(c.log).toEqual([
      ["setParam", "t1_convert_to_drum", "1"],
      ["syncClips"],
      ["padMap"],
      ["invalidate"],
      ["redraw"],
    ]);
  });

  test("empty conversion uses pad-mode get_param as barrier before pad-map recompute", () => {
    const c = calls();
    const S = state({ activeTrack: 0, activeBank: 0 });

    convertTrackTypeImpl(S, deps(c), 0, true);

    expect(S.trackPadMode[0]).toBe(DRUM);
    expect(c.log).toEqual([
      ["setParam", "t0_convert_to_drum", "1"],
      ["getParam", "t0_pad_mode"],
      ["padMap"],
      ["invalidate"],
      ["redraw"],
    ]);
  });

  test("drum-to-melodic conversion clears JS drum performance mirrors and active all-lanes bank", () => {
    const c = calls();
    const S = state({ activeTrack: 2, activeBank: 7 });

    convertTrackTypeImpl(S, deps(c), 2, false);

    expect(S.trackPadMode[2]).toBe(MELODIC);
    expect(S.activeBank).toBe(0);
    expect(S.drumVelZoneArmed[2]).toBe(false);
    expect(S.drumLastVelZone[2]).toBe(0);
    expect(c.log).toEqual([
      ["setParam", "t2_convert_to_melodic", "1"],
      ["syncClips"],
      ["padMap"],
      ["invalidate"],
      ["redraw"],
    ]);
  });

  test("conversion is skipped when set_param is unavailable", () => {
    const c = calls();
    const S = state();

    convertTrackTypeImpl(S, deps(c, { setParam: null }), 1, true);

    expect(S.trackPadMode[1]).toBe(MELODIC);
    expect(c.log).toEqual([]);
  });
});
