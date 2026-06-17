import { describe, expect, test } from "vitest";
import { runInitWorkflowImpl } from "@overture-ui/lifecycle/ui_init_workflow.mjs";

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    fn(name: string, result?: unknown) {
      return (...args: unknown[]) => {
        log.push([name, ...args]);
        return result;
      };
    },
  };
}

function baseState(): any {
  return {
    schwungCoRunSlot: 2,
    moveCoRunTrack: 1,
    bankParams: null,
    currentSetUuid: "",
    currentSetName: "",
    pendingSetLoad: false,
    confirmStateWipe: false,
    confirmStateWipeSel: 0,
    screenDirty: false,
    pendingPruneOrphans: false,
    playing: false,
    trackActiveClip: new Array(8).fill(0),
    trackCurrentStep: new Array(8).fill(-1),
    trackCurrentPage: new Array(8).fill(0),
    trackQueuedClip: new Array(8).fill(-1),
    hasInitedOnce: false,
    sessionView: false,
    dspInboundEnabled: false,
    extSendAsyncEnabled: false,
    _lastRemapTrack: 9,
    ledInitComplete: true,
    ledInitQueue: [],
    ledInitIndex: 4,
    _origClearScreen: null,
    _wasSuspended: true,
  };
}

function deps(overrides: any = {}) {
  const c = calls();
  const paramValues = new Map<string, string | null | undefined>([
    ["playing", "1"],
    ["instance_id", "nonce-1"],
    ["state_uuid", "set-a"],
    ["state_version_mismatch", "0"],
  ]);
  for (let t = 0; t < 8; t++) {
    paramValues.set(`t${t}_active_clip`, String((t + 1) % 16));
    paramValues.set(`t${t}_current_step`, String(t * 16 + 3));
    paramValues.set(`t${t}_queued_clip`, String(t));
  }

  const d = {
    calls: c.log,
    installConsoleOverride: c.fn("installConsoleOverride"),
    exposeState: c.fn("exposeState"),
    shadowCorunEnd: c.fn("shadowCorunEnd"),
    banks: [
      { knobs: [{ def: 10 }, { def: 20 }] },
      { knobs: [{ def: 30 }, { def: 40 }] },
    ],
    getParam: (key: string) => {
      c.log.push(["getParam", key]);
      return paramValues.has(key) ? paramValues.get(key) : null;
    },
    log: c.fn("log"),
    readActiveSet: c.fn("readActiveSet", { uuid: "set-a", name: "Set A" }),
    maybeShowInheritPicker: c.fn("maybeShowInheritPicker", "blank"),
    fileExists: c.fn("fileExists", 1),
    syncClipsFromDsp: c.fn("syncClipsFromDsp"),
    syncMuteSoloFromDsp: c.fn("syncMuteSoloFromDsp"),
    extHeldNotes: { clear: c.fn("extHeldNotes.clear") },
    restoreUiSidecar: c.fn("restoreUiSidecar"),
    shadowInboundPadMidiActive: c.fn("shadowInboundPadMidiActive"),
    shadowOvertakeSendExternalAsyncActive: c.fn("shadowOvertakeSendExternalAsyncActive"),
    computePadNoteMap: c.fn("computePadNoteMap"),
    applyExtMidiRemap: c.fn("applyExtMidiRemap"),
    invalidateLEDCache: c.fn("invalidateLEDCache"),
    buildLedInitQueue: c.fn("buildLedInitQueue", [{ kind: "note", id: 68 }]),
    installFlagsWrap: c.fn("installFlagsWrap"),
    clearScreen: c.fn("clearScreen"),
    paramValues,
    ...overrides,
  };
  return d;
}

describe("init workflow", () => {
  test("installs wrappers, restores sidecar defaults, initializes LEDs, and queues first draw side effects", () => {
    const S = baseState();
    const d = deps();

    runInitWorkflowImpl(S, d);

    expect(d.calls.slice(0, 4)).toEqual([
      ["installConsoleOverride", "SEQ8"],
      ["exposeState", S],
      ["shadowCorunEnd"],
      ["getParam", "playing"],
    ]);
    expect(S.schwungCoRunSlot).toBe(-1);
    expect(S.moveCoRunTrack).toBe(-1);
    expect(S.bankParams).toEqual([
      [
        [10, 20],
        [30, 40],
      ],
      [
        [10, 20],
        [30, 40],
      ],
      [
        [10, 20],
        [30, 40],
      ],
      [
        [10, 20],
        [30, 40],
      ],
      [
        [10, 20],
        [30, 40],
      ],
      [
        [10, 20],
        [30, 40],
      ],
      [
        [10, 20],
        [30, 40],
      ],
      [
        [10, 20],
        [30, 40],
      ],
    ]);
    expect(S.currentSetUuid).toBe("set-a");
    expect(S.currentSetName).toBe("Set A");
    expect(S.lastDspInstanceId).toBe("nonce-1");
    expect(S.pendingSetLoad).toBe(false);
    expect(S.pendingPruneOrphans).toBe(true);
    expect(S.playing).toBe(true);
    expect(S.trackActiveClip).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(S.trackCurrentStep).toEqual([3, 19, 35, 51, 67, 83, 99, 115]);
    expect(S.trackCurrentPage).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(S.trackQueuedClip).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(S.sessionView).toBe(true);
    expect(S.hasInitedOnce).toBe(true);
    expect(S.dspInboundEnabled).toBe(true);
    expect(S.extSendAsyncEnabled).toBe(true);
    expect(S._lastRemapTrack).toBe(-1);
    expect(S.ledInitComplete).toBe(false);
    expect(S.ledInitQueue).toEqual([{ kind: "note", id: 68 }]);
    expect(S.ledInitIndex).toBe(0);
    expect(S._origClearScreen).toBe(d.clearScreen);
    expect(S._wasSuspended).toBe(false);
    expect(d.calls).toContainEqual(["syncClipsFromDsp"]);
    expect(d.calls).toContainEqual(["syncMuteSoloFromDsp"]);
    expect(d.calls).toContainEqual(["extHeldNotes.clear"]);
    expect(d.calls).toContainEqual(["restoreUiSidecar", true]);
    expect(d.calls).toContainEqual(["computePadNoteMap"]);
    expect(d.calls).toContainEqual(["applyExtMidiRemap"]);
    expect(d.calls).toContainEqual(["invalidateLEDCache"]);
    expect(d.calls).toContainEqual(["installFlagsWrap"]);
  });

  test("falls back cleanly without host/global functions and defers sidecar restore when state load is pending", () => {
    const S = baseState();
    const d = deps({
      getParam: null,
      shadowCorunEnd: null,
      shadowInboundPadMidiActive: null,
      shadowOvertakeSendExternalAsyncActive: null,
      fileExists: () => 0,
      readActiveSet: () => ({ uuid: "set-b", name: "Set B" }),
      maybeShowInheritPicker: () => "blank",
    });

    runInitWorkflowImpl(S, d);

    expect(S.playing).toBe(false);
    expect(S.pendingSetLoad).toBe(true);
    expect(S.currentSetUuid).toBe("set-b");
    expect(S.dspInboundEnabled).toBe(false);
    expect(S.extSendAsyncEnabled).toBe(false);
    expect(S.trackActiveClip).toEqual(new Array(8).fill(0));
    expect(d.calls).not.toContainEqual(["syncClipsFromDsp"]);
    expect(d.calls).not.toContainEqual(["syncMuteSoloFromDsp"]);
    expect(d.calls).toContainEqual(["restoreUiSidecar", false]);
  });

  test("state version mismatch opens wipe confirmation and suppresses pending set load", () => {
    const S = baseState();
    const d = deps();
    d.paramValues.set("state_uuid", "old-set");
    d.paramValues.set("state_version_mismatch", "1");

    runInitWorkflowImpl(S, d);

    expect(S.confirmStateWipe).toBe(true);
    expect(S.confirmStateWipeSel).toBe(1);
    expect(S.pendingSetLoad).toBe(false);
    expect(S.screenDirty).toBe(true);
    expect(d.calls).toContainEqual(["restoreUiSidecar", true]);
  });

  test("inherit decisions control set-load and sidecar timing", () => {
    const autoState = baseState();
    const autoDeps = deps({ maybeShowInheritPicker: () => "auto" });
    autoDeps.paramValues.set("state_uuid", "set-a");
    runInitWorkflowImpl(autoState, autoDeps);
    expect(autoState.pendingSetLoad).toBe(true);
    expect(autoDeps.calls).toContainEqual(["restoreUiSidecar", false]);

    const pickerState = baseState();
    const pickerDeps = deps({ maybeShowInheritPicker: () => "picker" });
    pickerDeps.paramValues.set("state_uuid", "old-set");
    runInitWorkflowImpl(pickerState, pickerDeps);
    expect(pickerState.pendingSetLoad).toBe(false);
    expect(pickerDeps.calls).toContainEqual(["restoreUiSidecar", true]);
  });
});
