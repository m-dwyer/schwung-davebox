import { describe, expect, test } from "vitest";
import { createTrackClipSyncFacade } from "@overture-ui/sync/ui_track_clip_sync_facade.mjs";

function createFacadeState() {
  return {
    trackCurrentStep: [5],
    trackActiveClip: [1],
    clipSteps: [[[0, 0, 0, 0, 0, 1, 0, 0], [0, 0, 0, 0, 0, 1, 0, 0]]],
    seqActiveNotes: new Set<number>([99]),
    seqLastStep: 5,
    seqNoteOnClipTick: 10,
  };
}

function createFacadeDeps(params: Record<string, string | null>, calls: Array<[string, ...unknown[]]>) {
  return {
    TPS_VALUES: [6, 12, 24],
    createHostParamAdapters: () => ({
      getParam: (key: string) => {
        calls.push(["hostGetParam", key]);
        return params[key] ?? null;
      },
      setParam: (key: string, val: string) => calls.push(["hostSetParam", key, val]),
    }),
    optionalHostFileExists: () => (path: string) => {
      calls.push(["fileExists", path]);
      return false;
    },
    optionalHostModuleGetParam: () => (key: string) => {
      calls.push(["getParam", key]);
      return params[key] ?? null;
    },
    optionalHostModuleGetParamUndefined: () => (key: string) => {
      calls.push(["getParamUndefined", key]);
      return params[key] ?? undefined;
    },
    optionalHostReadFile: () => (path: string) => {
      calls.push(["readFile", path]);
      return "";
    },
    setActiveDrumLane: (track: number, lane: number) => calls.push(["setActiveDrumLane", track, lane]),
    clipHasContent: (track: number, clip: number) => {
      calls.push(["clipHasContent", track, clip]);
      return true;
    },
    readBankParams: (track: number, bank: number) => calls.push(["readBankParams", track, bank]),
  };
}

describe("Track / Clip Sync facade", () => {
  test("creates clip-state deps with host adapters and facade readback callbacks", () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const facade = createTrackClipSyncFacade(createFacadeState(), createFacadeDeps({}, calls));
    const deps = facade.createClipStateSyncDeps();

    expect(typeof deps.getParam).toBe("function");
    expect(typeof deps.setParam).toBe("function");
    expect(typeof deps.readFile).toBe("function");
    expect(typeof deps.fileExists).toBe("function");
    expect(deps.setActiveDrumLane).toBeTypeOf("function");
    expect(deps.clipHasContent).toBeTypeOf("function");
    expect(deps.readBankParams).toBeTypeOf("function");
    expect(deps.syncDrumClipContent).toBeTypeOf("function");
    expect(deps.syncDrumLanesMeta).toBeTypeOf("function");
    expect(deps.syncDrumLaneSteps).toBeTypeOf("function");
    expect(deps.refreshDrumLaneBankParams).toBeTypeOf("function");
    expect(deps.refreshPerClipBankParams).toBeTypeOf("function");
    expect(deps.readTrackConfig).toBeTypeOf("function");
    expect(deps.readTarpStepVel).toBeTypeOf("function");
    expect(deps.readDrumRepeatRates).toBeTypeOf("function");
  });

  test("refreshes current sequencer notes through the facade host getter", () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const S = createFacadeState();
    const facade = createTrackClipSyncFacade(
      S,
      createFacadeDeps({ t0_c1_step_5_notes: "60 -1 127 128 xx 64" }, calls),
    );

    facade.refreshSeqNotesIfCurrent(0, 1, 5);

    expect(calls).toEqual([["hostGetParam", "t0_c1_step_5_notes"]]);
    expect(Array.from(S.seqActiveNotes.values())).toEqual([60, 127, 64]);
    expect(S.seqLastStep).toBe(-1);
    expect(S.seqNoteOnClipTick).toBe(-1);
  });
});
