import { describe, expect, test } from "vitest";
import {
  clipIsEmptyImpl,
  focusedClipIsEmptyImpl,
  selectTrackGestureImpl,
  switchActiveTrackImpl,
} from "@overture-ui/view/ui_track_selection_workflow.mjs";

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
    allLanesConfirmed: true,
    playing: false,
    sessionView: false,
    trackActiveBank: [0, 4, 7, 2],
    trackActiveClip: [0, 2, 3, 1],
    trackPadMode: [DRUM, 0, DRUM, 0],
    trackClipPlaying: [false, false, false, false],
    trackWillRelaunch: [false, false, false, false],
    trackQueuedClip: [-1, -1, -1, -1],
    drumClipNonEmpty: [
      [false, true, false, false],
      [false, false, false, false],
      [false, false, false, true],
      [false, false, false, false],
    ],
    clipNonEmpty: [
      [false, false, false, false],
      [false, false, true, false],
      [false, false, false, false],
      [false, true, false, false],
    ],
    seqActiveNotes: new Set([60, 64]),
    seqLastStep: 12,
    seqLastClip: 2,
    screenDirty: false,
    ...overrides,
  };
}

function deps(c: ReturnType<typeof calls>, overrides: Record<string, unknown> = {}) {
  return {
    numTracks: 4,
    padModeDrum: DRUM,
    setParam: (...args: unknown[]) => c.log.push(["setParam", ...args]),
    extNoteOffAll: c.fn("extOff"),
    handoffRecordingToTrack: c.fn("handoff"),
    resyncDrumTrack: c.fn("resyncDrum"),
    refreshPerClipBankParams: c.fn("refreshClipBanks"),
    computePadNoteMap: c.fn("padMap"),
    forceRedraw: c.fn("redraw"),
    ...overrides,
  };
}

describe("Track selection workflow", () => {
  test("clip empty checks use drum content for drum tracks and melodic content otherwise", () => {
    const S = state();

    expect(clipIsEmptyImpl(S, { padModeDrum: DRUM }, 0, 0)).toBe(true);
    expect(clipIsEmptyImpl(S, { padModeDrum: DRUM }, 0, 1)).toBe(false);
    expect(clipIsEmptyImpl(S, { padModeDrum: DRUM }, 1, 2)).toBe(false);
    expect(focusedClipIsEmptyImpl(S, { padModeDrum: DRUM }, 2)).toBe(false);
  });

  test("switching active track saves outgoing bank and restores incoming bank flags all-lanes confirmation", () => {
    const c = calls();
    const S = state({ activeTrack: 1, activeBank: 6 });

    switchActiveTrackImpl(S, deps(c), 2);

    expect(S.trackActiveBank).toEqual([0, 6, 7, 2]);
    expect(S.activeTrack).toBe(2);
    expect(S.activeBank).toBe(7);
    expect(S.allLanesConfirmed).toBe(false);
    expect(c.log).toEqual([]);
  });

  test("switching active track queues focused empty clip only while playing in Track View", () => {
    const c = calls();
    const S = state({
      activeTrack: 1,
      activeBank: 0,
      playing: true,
      trackClipPlaying: [false, false, false, false],
      trackQueuedClip: [-1, -1, -1, -1],
      trackWillRelaunch: [false, false, false, false],
      trackActiveClip: [0, 2, 0, 1],
    });

    switchActiveTrackImpl(S, deps(c), 2);

    expect(c.log).toEqual([["setParam", "t2_launch_clip", "0"]]);
    expect(S.trackQueuedClip[2]).toBe(0);
  });

  test("switching active track skips launch in Session View or when focused clip has data", () => {
    const c = calls();
    const session = state({ playing: true, sessionView: true });
    switchActiveTrackImpl(session, deps(c), 2);
    expect(c.log).toEqual([]);

    const content = state({ playing: true, sessionView: false });
    switchActiveTrackImpl(content, deps(c), 3);
    expect(c.log).toEqual([]);
  });

  test("select gesture clamps target, handles drum switch side effects, pad map, redraw, and sequencer LED invalidation", () => {
    const c = calls();
    const S = state({ activeTrack: 1, activeBank: 4 });

    selectTrackGestureImpl(S, deps(c), -99);

    expect(S.activeTrack).toBe(0);
    expect(S.activeBank).toBe(0);
    expect(S.trackActiveBank[1]).toBe(4);
    expect(S.seqActiveNotes.size).toBe(0);
    expect(S.seqLastStep).toBe(-1);
    expect(S.seqLastClip).toBe(-1);
    expect(c.log).toEqual([
      ["extOff"],
      ["handoff", 0],
      ["resyncDrum", 0],
      ["padMap"],
      ["redraw"],
    ]);
  });

  test("select gesture handles melodic switch side effects and drum-hidden bank fallback", () => {
    const c = calls();
    const S = state({ activeTrack: 2, activeBank: 7 });

    selectTrackGestureImpl(S, deps(c), 99);

    expect(S.activeTrack).toBe(3);
    expect(S.activeBank).toBe(2);
    expect(c.log).toEqual([
      ["extOff"],
      ["handoff", 3],
      ["refreshClipBanks", 3],
      ["padMap"],
      ["redraw"],
    ]);
  });

  test("select gesture returns early without dirtying state for the active track", () => {
    const c = calls();
    const S = state({ activeTrack: 1 });

    selectTrackGestureImpl(S, deps(c), 1);

    expect(c.log).toEqual([]);
    expect(S.seqActiveNotes.size).toBe(2);
    expect(S.seqLastStep).toBe(12);
    expect(S.seqLastClip).toBe(2);
  });
});
