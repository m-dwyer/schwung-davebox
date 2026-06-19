import { describe, expect, test } from "vitest";
import {
  buildGlobalMenuItemsImpl,
  doShiftStepCommonImpl,
  ensureGlobalMenuFreshImpl,
  jumpToMenuLabelImpl,
  openGlobalMenuImpl,
} from "@overture-ui/menu/ui_global_menu.mjs";

// buildGlobalMenuItems is a pure BUILDER: it returns the flat list of global
// menu-item descriptors whose get/set/onAction closures capture host state via
// `deps`. These tests pin the item set (route/track-mode conditionals), the
// deps wiring of representative closures, and the format helpers.

const DRUM = 1;
const MELODIC = 0;

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    fn(name: string) {
      return (...args: unknown[]) => log.push([name, ...args]);
    },
    names() {
      return log.map((e) => e[0]);
    },
  };
}

function makeDeps(c: ReturnType<typeof calls>, opts: { bpm?: string | null } = {}) {
  return {
    applyTrackConfig: c.fn("applyTrackConfig"),
    computePadNoteMap: c.fn("computePadNoteMap"),
    forceRedraw: c.fn("forceRedraw"),
    editSoundForTrack: c.fn("editSoundForTrack"),
    openTapTempo: c.fn("openTapTempo"),
    xposePreviewSet: c.fn("xposePreviewSet"),
    openLoadSnapshot: c.fn("openLoadSnapshot"),
    getParam: (k: string) => {
      c.log.push(["getParam", k]);
      return opts.bpm !== undefined ? opts.bpm : "128";
    },
    setParam: c.fn("setParam"),
  };
}

// Minimal S fixture. 1 active track; clipNonEmpty grid for the Mode convert check.
function makeState(overrides: Record<string, unknown> = {}) {
  const s: Record<string, unknown> = {
    activeTrack: 0,
    trackChannel: [3],
    trackRoute: [0], // 0 = Schwung
    trackPadMode: [MELODIC],
    padLayoutChromatic: [false],
    trackVelOverride: [0],
    trackLooper: [0],
    trackAtMode: [0],
    clipNonEmpty: [[false, false]],
    padKey: 2,
    padScale: 5,
    scaleAware: 1,
    launchQuant: 0,
    swingAmt: 0,
    swingRes: 0,
    midiInChannel: 0,
    metronomeOn: 0,
    metronomeVol: 100,
    beatMarkersEnabled: false,
    currentSetUuid: "",
    screenDirty: false,
    confirmConvertToDrum: false,
    pendingTrackConvert: null,
    globalMenuOpen: true,
    ...overrides,
  };
  return s;
}

function labels(items: Array<{ label: string }>) {
  return items.map((i) => i.label);
}
function byLabel(items: Array<{ label: string }>, label: string): any {
  return items.find((i) => i.label === label);
}

describe("buildGlobalMenuItems — item set conditionals", () => {
  test("melodic + Schwung route: AftTch shown, Edit Sound shown", () => {
    const c = calls();
    const items = buildGlobalMenuItemsImpl(makeState(), makeDeps(c)) as any[];
    const ls = labels(items);
    expect(ls).toContain("AftTch");
    expect(ls).toContain("Edit Sound...");
    // Full expected order.
    expect(ls).toEqual([
      "Channel", "Route", "Mode", "Layout", "VelIn", "Looper",
      "AftTch", "Edit Sound...", "Global",
      "BPM", "Tap Tempo", "Key", "Scale", "Scale Aware", "Launch",
      "Swing Amt", "Swing Res", "MIDI In", "Metro", "Metro Vol",
      "Beat Marks", "Route Check", "Export to Ableton", "Save state",
      "Load state", "Clear Sess", "Quit",
    ]);
  });

  test("drum track: AftTch hidden (drum owns pad pressure)", () => {
    const c = calls();
    const items = buildGlobalMenuItemsImpl(
      makeState({ trackPadMode: [DRUM] }), makeDeps(c)) as any[];
    expect(labels(items)).not.toContain("AftTch");
    expect(labels(items)).toContain("Edit Sound..."); // route 0 still editable
  });

  test("External route (2): Edit Sound hidden, AftTch still shown for melodic", () => {
    const c = calls();
    const items = buildGlobalMenuItemsImpl(
      makeState({ trackRoute: [2] }), makeDeps(c)) as any[];
    expect(labels(items)).not.toContain("Edit Sound...");
    expect(labels(items)).toContain("AftTch");
  });

  test("Move route (1): Edit Sound shown", () => {
    const c = calls();
    const items = buildGlobalMenuItemsImpl(
      makeState({ trackRoute: [1] }), makeDeps(c)) as any[];
    expect(labels(items)).toContain("Edit Sound...");
  });
});

describe("buildGlobalMenuItems — AftTch options by route", () => {
  test("Move route → [0,1] (Off/Poly only)", () => {
    const c = calls();
    const items = buildGlobalMenuItemsImpl(
      makeState({ trackRoute: [1] }), makeDeps(c)) as any[];
    expect(byLabel(items, "AftTch").options).toEqual([0, 1]);
  });
  test("Schwung route → [0,1,2] (adds Channel)", () => {
    const c = calls();
    const items = buildGlobalMenuItemsImpl(makeState(), makeDeps(c)) as any[];
    expect(byLabel(items, "AftTch").options).toEqual([0, 1, 2]);
  });
});

describe("buildGlobalMenuItems — deps wiring", () => {
  test("Channel/Route/VelIn/Looper set() → applyTrackConfig with right key", () => {
    const c = calls();
    const S = makeState();
    const items = buildGlobalMenuItemsImpl(S, makeDeps(c)) as any[];
    byLabel(items, "Channel").set(7);
    byLabel(items, "Route").set(2);
    byLabel(items, "VelIn").set(64);
    byLabel(items, "Looper").set(true);
    expect(c.log).toEqual([
      ["applyTrackConfig", 0, "channel", 7],
      ["applyTrackConfig", 0, "route", 2],
      ["applyTrackConfig", 0, "track_vel_override", 64],
      ["applyTrackConfig", 0, "track_looper", 1],
    ]);
  });

  test("BPM get() reads bpm param; set() writes rounded bpm", () => {
    const c = calls();
    const items = buildGlobalMenuItemsImpl(makeState(), makeDeps(c, { bpm: "140.6" })) as any[];
    expect(byLabel(items, "BPM").get()).toBe(141);
    byLabel(items, "BPM").set(123.4);
    expect(c.log).toContainEqual(["setParam", "bpm", "123"]);
  });

  test("BPM get() falls back to 120 when param invalid", () => {
    const c = calls();
    const items = buildGlobalMenuItemsImpl(makeState(), makeDeps(c, { bpm: null })) as any[];
    expect(byLabel(items, "BPM").get()).toBe(120);
  });

  test("Tap Tempo / Load state actions call their deps", () => {
    const c = calls();
    const items = buildGlobalMenuItemsImpl(makeState(), makeDeps(c)) as any[];
    byLabel(items, "Tap Tempo").onAction();
    byLabel(items, "Load state").onAction();
    expect(c.names()).toEqual(["openTapTempo", "openLoadSnapshot"]);
  });

  test("Key/Scale set() → xposePreviewSet(candidateKey, candidateScale)", () => {
    const c = calls();
    const S = makeState({ padKey: 2, padScale: 5 });
    const items = buildGlobalMenuItemsImpl(S, makeDeps(c)) as any[];
    byLabel(items, "Key").set(9); // changes key, keeps current scale
    byLabel(items, "Scale").set(3); // keeps current key, changes scale
    expect(c.log).toEqual([
      ["xposePreviewSet", 9, 5],
      ["xposePreviewSet", 2, 3],
    ]);
  });

  test("Scale Aware set() mirrors S + writes scale_aware param", () => {
    const c = calls();
    const S = makeState({ scaleAware: 1 });
    const items = buildGlobalMenuItemsImpl(S, makeDeps(c)) as any[];
    byLabel(items, "Scale Aware").set(false);
    expect(S.scaleAware).toBe(0);
    expect(c.log).toContainEqual(["setParam", "scale_aware", "0"]);
  });

  test("Swing/Launch/MIDI In/Metro set() mirror S and emit params", () => {
    const c = calls();
    const S = makeState();
    const items = buildGlobalMenuItemsImpl(S, makeDeps(c)) as any[];
    byLabel(items, "Swing Amt").set(40);
    byLabel(items, "Launch").set(3);
    byLabel(items, "MIDI In").set(5);
    byLabel(items, "Metro").set(2);
    byLabel(items, "Metro Vol").set(80);
    expect(S.swingAmt).toBe(40);
    expect(S.launchQuant).toBe(3);
    expect(S.midiInChannel).toBe(5);
    expect(S.metronomeOn).toBe(2);
    expect(S.metronomeVol).toBe(80);
    expect(c.log).toContainEqual(["setParam", "swing_amt", "40"]);
    expect(c.log).toContainEqual(["setParam", "launch_quant", "3"]);
    expect(c.log).toContainEqual(["setParam", "midi_in_channel", "5"]);
    expect(c.log).toContainEqual(["setParam", "metro_on", "2"]);
    expect(c.log).toContainEqual(["setParam", "metro_vol", "80"]);
  });
});

describe("buildGlobalMenuItems — Mode convert gating", () => {
  test("Keys→Drums with clip data → opens confirm dialog (no immediate convert)", () => {
    const c = calls();
    const S = makeState({ trackPadMode: [MELODIC], clipNonEmpty: [[true, false]] });
    const items = buildGlobalMenuItemsImpl(S, makeDeps(c)) as any[];
    byLabel(items, "Mode").set(DRUM);
    expect(S.confirmConvertToDrum).toBe(true);
    expect(S.confirmConvertToDrumSel).toBe(1);
    expect(S.confirmConvertTrack).toBe(0);
    expect(S.pendingTrackConvert).toBeNull();
  });

  test("Keys→Drums with empty track → defers convert, no dialog", () => {
    const c = calls();
    const S = makeState({ trackPadMode: [MELODIC], clipNonEmpty: [[false, false]] });
    const items = buildGlobalMenuItemsImpl(S, makeDeps(c)) as any[];
    byLabel(items, "Mode").set(DRUM);
    expect(S.confirmConvertToDrum).toBe(false);
    expect(S.pendingTrackConvert).toEqual({ t: 0, toDrum: true });
  });

  test("Drums→Keys → defers convert (no prompt)", () => {
    const c = calls();
    const S = makeState({ trackPadMode: [DRUM] });
    const items = buildGlobalMenuItemsImpl(S, makeDeps(c)) as any[];
    byLabel(items, "Mode").set(MELODIC);
    expect(S.pendingTrackConvert).toEqual({ t: 0, toDrum: false });
  });

  test("Mode set() to current value is a no-op", () => {
    const c = calls();
    const S = makeState({ trackPadMode: [MELODIC] });
    const items = buildGlobalMenuItemsImpl(S, makeDeps(c)) as any[];
    byLabel(items, "Mode").set(MELODIC);
    expect(S.pendingTrackConvert).toBeNull();
    expect(S.confirmConvertToDrum).toBe(false);
  });
});

describe("buildGlobalMenuItems — Layout gating + format helpers", () => {
  test("Layout set() on melodic track recomputes pad map + redraws", () => {
    const c = calls();
    const S = makeState({ trackPadMode: [MELODIC] });
    const items = buildGlobalMenuItemsImpl(S, makeDeps(c)) as any[];
    byLabel(items, "Layout").set(1);
    expect(S.padLayoutChromatic).toEqual([true]);
    expect(c.names()).toEqual(["computePadNoteMap", "forceRedraw"]);
  });

  test("Layout set() on drum track is a no-op (melodic-only)", () => {
    const c = calls();
    const S = makeState({ trackPadMode: [DRUM], padLayoutChromatic: [false] });
    const items = buildGlobalMenuItemsImpl(S, makeDeps(c)) as any[];
    byLabel(items, "Layout").set(1);
    expect(S.padLayoutChromatic).toEqual([false]);
    expect(c.names()).toEqual([]);
  });

  test("Layout format → '-' on drum, Scale/Chrom on melodic", () => {
    const cDrum = calls();
    const drum = buildGlobalMenuItemsImpl(
      makeState({ trackPadMode: [DRUM] }), makeDeps(cDrum)) as any[];
    expect(byLabel(drum, "Layout").format(1)).toBe("-");
    const cMel = calls();
    const mel = buildGlobalMenuItemsImpl(makeState(), makeDeps(cMel)) as any[];
    expect(byLabel(mel, "Layout").format(0)).toBe("Scale");
    expect(byLabel(mel, "Layout").format(1)).toBe("Chrom");
  });

  test("Route/VelIn format helpers", () => {
    const c = calls();
    const items = buildGlobalMenuItemsImpl(makeState(), makeDeps(c)) as any[];
    expect(byLabel(items, "Route").format(0)).toBe("Swng");
    expect(byLabel(items, "Route").format(1)).toBe("Move");
    expect(byLabel(items, "Route").format(2)).toBe("Ext");
    expect(byLabel(items, "VelIn").format(0)).toBe("Live");
    expect(byLabel(items, "VelIn").format(64)).toBe("64");
  });
});

function workflowDeps(c: ReturnType<typeof calls>, opts: {
  items?: Array<{ label: string }>;
  nextItems?: Array<Array<{ label: string }>>;
  menuState?: Record<string, unknown>;
  stack?: unknown[];
  setParam?: ((key: string, val: string) => void) | null;
} = {}) {
  const queued = opts.nextItems ? [...opts.nextItems] : null;
  return {
    buildGlobalMenuItems: () => {
      c.log.push(["buildGlobalMenuItems"]);
      return queued && queued.length ? queued.shift() : (opts.items || []);
    },
    createMenuState: () => {
      c.log.push(["createMenuState"]);
      return opts.menuState || { selectedIndex: 0, editing: false, editValue: null };
    },
    createMenuStack: () => {
      c.log.push(["createMenuStack"]);
      return opts.stack || [];
    },
    exitMoveNativeCoRun: c.fn("exitMoveNativeCoRun"),
    exitSchwungCoRun: c.fn("exitSchwungCoRun"),
    closeTapTempo: c.fn("closeTapTempo"),
    openTapTempo: c.fn("openTapTempo"),
    setParam: opts.setParam === undefined ? c.fn("setParam") : opts.setParam,
    showActionPopup: c.fn("showActionPopup"),
  };
}

describe("global menu open/freshen workflow", () => {
  test("open exits co-run, initializes menu state, and marks the menu dirty", () => {
    const c = calls();
    const S = makeState({
      schwungCoRunSlot: 2,
      moveCoRunTrack: 1,
      activeTrack: 3,
      lastSentMenuEditValue: 99,
      jogTouched: true,
      screenDirty: false,
    });
    const items = [{ label: "Global" }];
    const menuState = { selectedIndex: 4, editing: false, editValue: null };
    const stack = [{ page: 1 }];

    openGlobalMenuImpl(S, workflowDeps(c, { items, menuState, stack }));

    expect(c.log).toEqual([
      ["exitSchwungCoRun"],
      ["exitMoveNativeCoRun"],
      ["buildGlobalMenuItems"],
      ["createMenuState"],
      ["createMenuStack"],
    ]);
    expect(S.globalMenuItems).toBe(items);
    expect(S.globalMenuState).toBe(menuState);
    expect(S.globalMenuStack).toBe(stack);
    expect(S.globalMenuOpen).toBe(true);
    expect(S.globalMenuBuiltForTrack).toBe(3);
    expect(S.lastSentMenuEditValue).toBeNull();
    expect(S.screenDirty).toBe(true);
    expect(S.jogTouched).toBe(false);
  });

  test("freshen is a no-op when closed or already built for the active track", () => {
    const c = calls();
    const S = makeState({ globalMenuOpen: false, globalMenuBuiltForTrack: 0, activeTrack: 1 });
    ensureGlobalMenuFreshImpl(S, workflowDeps(c, { items: [{ label: "Global" }] }));
    expect(c.log).toEqual([]);

    S.globalMenuOpen = true;
    S.globalMenuBuiltForTrack = 1;
    ensureGlobalMenuFreshImpl(S, workflowDeps(c, { items: [{ label: "Global" }] }));
    expect(c.log).toEqual([]);
  });

  test("freshen rebuilds for active-track changes and restores cursor by label", () => {
    const c = calls();
    const S = makeState({
      activeTrack: 2,
      globalMenuOpen: true,
      globalMenuBuiltForTrack: 0,
      globalMenuItems: [{ label: "Channel" }, { label: "Edit Sound..." }, { label: "Global" }],
      globalMenuState: { selectedIndex: 1, editing: false, editValue: null },
    });

    ensureGlobalMenuFreshImpl(S, workflowDeps(c, {
      items: [{ label: "Channel" }, { label: "Global" }, { label: "Edit Sound..." }],
    }));

    expect(c.names()).toEqual(["buildGlobalMenuItems"]);
    expect((S.globalMenuState as { selectedIndex: number }).selectedIndex).toBe(2);
    expect(S.globalMenuBuiltForTrack).toBe(2);
  });

  test("freshen clamps cursor when the previous label disappears", () => {
    const c = calls();
    const S = makeState({
      activeTrack: 2,
      globalMenuOpen: true,
      globalMenuBuiltForTrack: 0,
      globalMenuItems: [{ label: "Channel" }, { label: "Edit Sound..." }, { label: "Global" }],
      globalMenuState: { selectedIndex: 2, editing: false, editValue: null },
    });

    ensureGlobalMenuFreshImpl(S, workflowDeps(c, {
      items: [{ label: "Channel" }, { label: "Route" }],
    }));

    expect((S.globalMenuState as { selectedIndex: number }).selectedIndex).toBe(1);
  });
});

describe("global menu shift-step shortcuts", () => {
  test("jumpToMenuLabel opens the menu and selects the requested label", () => {
    const c = calls();
    const S = makeState({ globalMenuOpen: false, schwungCoRunSlot: -1, moveCoRunTrack: -1 });

    jumpToMenuLabelImpl(S, workflowDeps(c, {
      items: [{ label: "Global" }, { label: "Swing Amt" }, { label: "Scale" }],
    }), "Swing Amt");

    expect(S.globalMenuOpen).toBe(true);
    expect((S.globalMenuState as { selectedIndex: number }).selectedIndex).toBe(1);
  });

  test("shortcut steps jump to global, swing, and scale labels", () => {
    const c = calls();
    const S = makeState({ globalMenuOpen: false, schwungCoRunSlot: -1, moveCoRunTrack: -1 });
    const deps = workflowDeps(c, {
      nextItems: [
        [{ label: "Channel" }, { label: "Global" }, { label: "Scale" }],
        [{ label: "Global" }, { label: "Swing Amt" }, { label: "Scale" }],
        [{ label: "Global" }, { label: "Swing Amt" }, { label: "Scale" }],
      ],
    });

    doShiftStepCommonImpl(S, deps, 1);
    expect((S.globalMenuState as { selectedIndex: number }).selectedIndex).toBe(1);
    doShiftStepCommonImpl(S, deps, 6);
    expect((S.globalMenuState as { selectedIndex: number }).selectedIndex).toBe(1);
    doShiftStepCommonImpl(S, deps, 8);
    expect((S.globalMenuState as { selectedIndex: number }).selectedIndex).toBe(2);
  });

  test("shortcut step 3 queues edit entry only in Track View", () => {
    const c = calls();
    const S = makeState({ activeTrack: 2, sessionView: false });
    doShiftStepCommonImpl(S, workflowDeps(c), 2);
    expect(S.pendingEditEntryTrack).toBe(2);

    const S2 = makeState({ activeTrack: 1, sessionView: true });
    doShiftStepCommonImpl(S2, workflowDeps(c), 2);
    expect(S2.pendingEditEntryTrack).toBeUndefined();
  });

  test("shortcut step 3 closes tap tempo before queuing deferred edit entry", () => {
    const c = calls();
    const S = makeState({ activeTrack: 2, sessionView: false, tapTempoOpen: true });

    doShiftStepCommonImpl(S, workflowDeps(c), 2);

    expect(S.pendingEditEntryTrack).toBe(2);
    expect(c.log).toEqual([["closeTapTempo"]]);
  });

  test("shortcut step 5 toggles metronome and writes the host param", () => {
    const c = calls();
    const S = makeState({ metronomeOn: 1 });
    doShiftStepCommonImpl(S, workflowDeps(c), 5);
    expect(S.metronomeOn).toBe(3);
    expect(c.log).toEqual([
      ["setParam", "metro_on", "3"],
      ["showActionPopup", "Always"],
    ]);

    c.log.length = 0;
    doShiftStepCommonImpl(S, workflowDeps(c), 5);
    expect(S.metronomeOn).toBe(1);
    expect(c.log).toEqual([
      ["setParam", "metro_on", "1"],
      ["showActionPopup", "Cnt-In"],
    ]);
  });

  test("shortcut step 5 tolerates a missing host param writer", () => {
    const c = calls();
    const S = makeState({ metronomeOn: 1 });
    doShiftStepCommonImpl(S, workflowDeps(c, { setParam: null }), 5);
    expect(S.metronomeOn).toBe(3);
    expect(c.log).toEqual([["showActionPopup", "Always"]]);
  });

  test("shortcut step 4 opens tap tempo", () => {
    const c = calls();
    doShiftStepCommonImpl(makeState(), workflowDeps(c), 4);
    expect(c.log).toEqual([["openTapTempo"]]);
  });

  test("shortcut step 4 replaces an open global menu with tap tempo", () => {
    const c = calls();
    const S = makeState({ globalMenuOpen: true, lastSentMenuEditValue: 42 });

    doShiftStepCommonImpl(S, workflowDeps(c), 4);

    expect(S.globalMenuOpen).toBe(false);
    expect(S.lastSentMenuEditValue).toBeNull();
    expect(c.log).toEqual([["openTapTempo"]]);
  });

  test("menu-jump shortcuts close tap tempo before opening the target menu", () => {
    const c = calls();
    const S = makeState({ tapTempoOpen: true, globalMenuOpen: false });

    doShiftStepCommonImpl(S, workflowDeps(c, {
      items: [{ label: "Global" }, { label: "Swing Amt" }],
    }), 6);

    expect(c.log).toEqual([
      ["closeTapTempo"],
      ["buildGlobalMenuItems"],
      ["createMenuState"],
      ["createMenuStack"],
    ]);
    expect(S.globalMenuOpen).toBe(true);
    expect((S.globalMenuState as { selectedIndex: number }).selectedIndex).toBe(1);
  });
});
