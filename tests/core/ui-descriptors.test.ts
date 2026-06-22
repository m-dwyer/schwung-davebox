import { describe, beforeEach, test, expect } from "vitest";
import { S } from "@overture-ui/core/ui_state.mjs";
import { describeEditSoundForTrack, matchingSchwungSlotMask, routeScopeShortLabel } from "@overture-ui/core/ui_routes.mjs";
import { routeCheckStatus, routeCheckViewModel } from "@overture-ui/core/ui_route_check.mjs";
import {
  advancePendingEditSoundEntry,
  adjustSchwungSoundVisibleParam,
  applySchwungSoundBrowserSelection,
  beginSaveSchwungSoundPreset,
  closeSchwungSoundPage,
  expireSchwungSoundParamPeek,
  expireSchwungSoundStatusFlash,
  openSchwungSoundBrowser,
  openSchwungSoundPresetBrowser,
  requestEditSoundForTrack,
  rotateSchwungSoundPage,
  selectSchwungSoundComponent,
  touchSchwungSoundVisibleParam,
  toggleSchwungSoundParamDetail,
} from "@overture-ui/core/ui_sound_edit.mjs";
import { renderSchwungSoundPage } from "@overture-ui/render/ui_sound_edit_render.mjs";
import { PARAM_PEEK_DETAIL_TICKS, autoLaneLabel, motionIdleModel, motionOverviewModel, paramPeekInfo } from "@overture-ui/core/ui_motion.mjs";
import { allLanesParameterPageGridModel, drumLaneParameterPageGridModel, drumMidiDelayParameterPageGridModel, genericParameterPageGridModel, labelValueParameterPageGridModel } from "@overture-ui/core/ui_parameter_page_model.mjs";
import { loadSchwungSoundPreset, saveSchwungSoundPreset } from "@overture-ui/core/ui_sound_preset_manager.mjs";
import { fmtArpRate } from "@overture-ui/core/ui_constants.mjs";

describe("UI descriptor seams", () => {
  beforeEach(() => {
    S.activeTrack = 0;
    S.activeBank = 6;
    S.bankParams = Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => new Array(8).fill(0))
    );
    S.playing = false;
    S.tickCount = 100;
    S.knobTouched = 1;
    S.knobTouchStartTick = 100;
    S.altMode = false;
    S.pendingEditSoundEntry = null;
    S.schwungSoundPage = null;
    S.schwungSoundMemory = Array.from({ length: 8 }, () => ({ selectedIndex: 1, paramDetailIndex: 0, paramDetail: true }));
    S._coRunChanSlots = 0;
    S.trackRoute[0] = 1;
    S.trackChannel[0] = 1;
    S.trackRoute[4] = 0;
    S.trackChannel[4] = 5;
    for (let t = 1; t < 8; t++) {
      S.trackRoute[t] = t < 4 ? 1 : 0;
      S.trackChannel[t] = t + 1;
    }
    S.trackPadMode[0] = 0;
    S.trackActiveClip[0] = 0;
    S.activeDrumLane[0] = 2;
    S.drumLaneNote[0][2] = 48;
    S.drumLaneQnt[0] = 37;
    S.drumLaneLenMode[0][2] = 5;
    S.trackQueuedClip[0] = -1;
    S.ccActiveLane[0] = 1;
    S.trackCCType[0] = [1, 0, 2, 0, 0, 0, 0, 0];
    S.trackCCAssign[0] = [7, 74, 5, -1, 72, 91, 93, 10];
    S.schLabel[0] = [null, null, "Cutoff", null, null, null, null, null];
    S.trackCCAutoBits[0][0] = 0b00000101;
    S.clipAtHas[0][0] = true;
    S.clipCCVal[0][0][1] = 64;
    S.clipCCVal[0][0][2] = 99;
    S.clipLength[0][0] = 16;
    S.clipTPS[0][0] = 24;
    S.ccLaneLength[0][0][1] = 0;
    S.ccLaneTps[0][0][1] = 0;
    S.ccLaneResTps[0][0][1] = 0;
    Reflect.set(globalThis, "shadow_get_slots", () => [
      { channel: 5, name: "Slot1" },
      { channel: 6, name: "Slot2" },
      { channel: 0, name: "Layer" },
    ]);
    Reflect.deleteProperty(globalThis, "host_list_modules");
    Reflect.deleteProperty(globalThis, "shadow_get_param");
    Reflect.deleteProperty(globalThis, "shadow_set_param");
    Reflect.deleteProperty(globalThis, "shadow_list_modules_for_component");
    Reflect.deleteProperty(globalThis, "host_ensure_dir");
    Reflect.deleteProperty(globalThis, "host_pad_block");
    Reflect.deleteProperty(globalThis, "host_read_file");
    Reflect.deleteProperty(globalThis, "host_write_file");
  });

  test("Schwung slot masks include exact-channel and All-channel slots", () => {
    expect(matchingSchwungSlotMask(5, [
      { channel: 5 },
      { channel: 6 },
      { channel: 0 },
      { channel: 5 },
    ])).toBe(0b1101);
  });

  test("Edit Sound descriptor preserves Move and Schwung preflight cases", () => {
    expect(describeEditSoundForTrack(0, { hasCoRun: true, hasMoveInject: true })).toMatchObject({
      title: "EDIT SOUND",
      body: "T1 Move Ch1",
      queue: { track: 0, route: 1, slot: -1 },
    });

    S.trackChannel[0] = 5;
    expect(describeEditSoundForTrack(0, { hasCoRun: true, hasMoveInject: true })).toMatchObject({
      title: "MOVE CH>4",
      body: "Ch5",
      queue: { track: 0, route: 1, slot: -1 },
    });

    expect(describeEditSoundForTrack(4, { hasCoRun: true, hasMoveInject: true })).toMatchObject({
      title: "EDIT SOUND",
      body: "T5 Schwung Slot1",
      queue: { track: 4, route: 0, slot: 0 },
      slotMask: 0b0101,
    });

    Reflect.set(globalThis, "shadow_get_slots", () => [{ channel: 6, name: "Slot2" }]);
    expect(describeEditSoundForTrack(4, { hasCoRun: true, hasMoveInject: true })).toMatchObject({
      title: "NO SLOT",
      body: "Ch5",
      queue: { track: 4, route: 0, slot: -1 },
    });
  });

  test("sound edit lifecycle queues, cancels, and advances pending handoff", () => {
    expect(requestEditSoundForTrack(0, { hasCoRun: true, hasMoveInject: true })).toEqual({
      title: "EDIT SOUND",
      body: "T1 Move Ch1",
    });
    expect(S.pendingEditSoundEntry).toMatchObject({ track: 0, route: 1, slot: -1 });
    expect(advancePendingEditSoundEntry(1)).toBeNull();
    expect(S.pendingEditSoundEntry).toBeNull();

    requestEditSoundForTrack(0, { hasCoRun: true, hasMoveInject: true });
    let action = null;
    for (let i = 0; i < 24; i++) action = advancePendingEditSoundEntry(0);
    expect(action).toEqual({ kind: "move", track: 0 });
    expect(S.pendingEditSoundEntry).toBeNull();

    requestEditSoundForTrack(4, { hasCoRun: true, hasMoveInject: true });
    expect(S.pendingEditSoundEntry).toBeNull();
    expect(S.schwungSoundPage).toMatchObject({ track: 4, slot: 0, selectedIndex: 1 });
    expect(S._coRunChanSlots).toBe(0b0101);
  });

  test("Schwung Sound page stores normalized current modules and applies browser selection", () => {
    const reads: Record<string, string> = {
      midi_fx1_module: "arpy",
      synth_module: "dustline",
      fx1_module: "trail",
      fx2_module: "",
      "synth:chain_params": JSON.stringify([
        { key: "cutoff", name: "Cutoff" },
        { key: "resonance", label: "Resonance" },
      ]),
      knob_1_param: "Cutoff",
      knob_2_param: "Resonance",
    };
    const writes: Array<[number, string, string]> = [];
    Reflect.set(globalThis, "shadow_get_param", (_slot: number, key: string) => reads[key] ?? "");
    Reflect.set(globalThis, "host_list_modules", () => [
      { id: "dustline", name: "Dustline", component_type: "sound_generator" },
      { id: "westfold", name: "Westfold", component_type: "sound_generator" },
      { id: "trail", name: "Trail", component_type: "audio_fx" },
    ]);
    Reflect.set(globalThis, "shadow_set_param", (slot: number, key: string, value: string) => {
      writes.push([slot, key, value]);
      reads.synth_module = value;
    });

    requestEditSoundForTrack(4, { hasCoRun: true, hasMoveInject: true });
    expect(S.schwungSoundPage?.modules[1]).toMatchObject({
      id: "dustline",
      name: "dustline",
      componentType: "sound_generator",
    });
    expect(S.schwungSoundPage?.names).toEqual(["arpy", "dustline", "trail", ""]);
    expect(S.schwungSoundPage?.componentParams[1]).toMatchObject([
      { key: "cutoff", name: "Cutoff" },
      { key: "resonance", name: "Resonance" },
    ]);

    expect(openSchwungSoundBrowser()).toBe(true);
    expect(S.schwungSoundPage?.browserItems).toMatchObject([
      { id: "dustline", name: "Dustline", componentType: "sound_generator" },
      { id: "westfold", name: "Westfold", componentType: "sound_generator" },
    ]);
    expect(S.schwungSoundPage?.browserIndex).toBe(0);

    S.schwungSoundPage!.browserIndex = 1;
    expect(applySchwungSoundBrowserSelection()).toBe(true);
    expect(writes).toEqual([[0, "synth:module", "westfold"]]);
    expect(S.schwungSoundPage?.modules[1]).toMatchObject({ id: "westfold", name: "westfold" });
  });

  test("Schwung Sound preset browser lists and applies matching module presets", () => {
    const files = new Map<string, string>();
    files.set("/data/UserData/overture/sound_presets/manifest.json", JSON.stringify({
      v: 1,
      presets: [
        {
          id: "dust",
          name: "Dust Pad",
          ts: 20,
          scope: "synth/dustline",
          componentPrefix: "synth",
          moduleId: "dustline",
          file: "/data/UserData/overture/sound_presets/dust.json",
        },
        {
          id: "trail",
          name: "Trail FX",
          ts: 30,
          scope: "fx1/trail",
          componentPrefix: "fx1",
          moduleId: "trail",
          file: "/data/UserData/overture/sound_presets/trail.json",
        },
      ],
    }));
    files.set("/data/UserData/overture/sound_presets/dust.json", JSON.stringify({
      v: 1,
      id: "dust",
      name: "Dust Pad",
      componentPrefix: "synth",
      moduleId: "dustline",
      state: "{\"opaque\":true}",
      params: { macro: "0.75", tone: "1" },
    }));
    const writes: Array<[number, string, string]> = [];
    const padBlocks: number[] = [];
    Reflect.set(globalThis, "host_read_file", (path: string) => files.get(path) ?? null);
    Reflect.set(globalThis, "host_pad_block", (blocked: number) => {
      padBlocks.push(blocked);
      return true;
    });
    Reflect.set(globalThis, "shadow_get_param", (_slot: number, key: string) => ({
      synth_module: "dustline",
      "synth:chain_params": JSON.stringify([
        { key: "macro", name: "Macro" },
        { key: "tone", name: "Tone" },
      ]),
      "synth:macro": "0.5",
      "synth:tone": "0",
    } as Record<string, string>)[key] ?? "");
    Reflect.set(globalThis, "shadow_set_param", (slot: number, key: string, value: string) => {
      writes.push([slot, key, value]);
      return true;
    });

    requestEditSoundForTrack(4, { hasCoRun: true, hasMoveInject: true });
    expect(openSchwungSoundPresetBrowser()).toBe(true);
    expect(S.schwungSoundPage?.browserKind).toBe("preset");
    expect(S.schwungSoundPage?.browserItems).toMatchObject([{ name: "Dust Pad" }]);
    S.copyHeld = true;

    expect(applySchwungSoundBrowserSelection()).toBe(true);
    expect(writes).toEqual([
      [0, "synth:macro", "0.75"],
      [0, "synth:tone", "1"],
    ]);
    expect(S.schwungSoundPage?.browser).toBe(false);
    expect(S.schwungSoundPage?.browserMessage).toBe("");
    expect(S.schwungSoundPage?.statusFlash).toMatchObject({ text: "LOADED", endTick: 190 });
    expect(S.copyHeld).toBe(false);
    expect(S.pendingPadNoteMapRecompute).toBe(true);
    expect(padBlocks).toEqual([0]);
    S.tickCount = 191;
    expect(expireSchwungSoundStatusFlash()).toBe(true);
    expect(S.schwungSoundPage?.statusFlash).toBe(null);
  });

  test("Schwung Sound preset manager saves under Overture home with a manifest", () => {
    const files = new Map<string, string>();
    const ensured: string[] = [];
    const reads: Record<string, string> = {
      synth_module: "dustline",
      "synth:chain_params": JSON.stringify([
        { key: "macro", name: "Macro" },
        { key: "tone", name: "Tone" },
      ]),
      "synth:macro": "0.5",
      "synth:tone": "0",
      "synth:state": "{\"opaque\":true}",
    };
    Reflect.set(globalThis, "host_ensure_dir", (path: string) => {
      ensured.push(path);
      return true;
    });
    Reflect.set(globalThis, "host_read_file", (path: string) => files.get(path) ?? null);
    Reflect.set(globalThis, "host_write_file", (path: string, data: string) => {
      files.set(path, data);
      return true;
    });
    Reflect.set(globalThis, "shadow_get_param", (_slot: number, key: string) => reads[key] ?? "");

    requestEditSoundForTrack(4, { hasCoRun: true, hasMoveInject: true });
    const result = saveSchwungSoundPreset(
      [
        { label: "MIDI FX", param: "midi_fx1:module", read: "midi_fx1_module", list: "midi_fx" },
        { label: "Synth", param: "synth:module", read: "synth_module", list: "sound_generator" },
        { label: "FX 1", param: "fx1:module", read: "fx1_module", list: "audio_fx" },
        { label: "FX 2", param: "fx2:module", read: "fx2_module", list: "audio_fx" },
      ],
      S.schwungSoundPage,
      "Dust Pad"
    );

    expect(result.ok).toBe(true);
    expect(ensured).toContain("/data/UserData/overture");
    expect(ensured).toContain("/data/UserData/overture/sound_presets");
    const manifestRaw = files.get("/data/UserData/overture/sound_presets/manifest.json");
    expect(manifestRaw).toBeTruthy();
    const manifest = JSON.parse(manifestRaw!);
    expect(manifest.presets[0]).toMatchObject({
      name: "Dust Pad",
      scope: "synth/dustline",
      componentPrefix: "synth",
      moduleId: "dustline",
    });
    const preset = JSON.parse(files.get(manifest.presets[0].file)!);
    expect(preset).toMatchObject({
      name: "Dust Pad",
      componentPrefix: "synth",
      moduleId: "dustline",
      state: "{\"opaque\":true}",
      params: { macro: "0.5", tone: "0" },
    });
  });

  test("Schwung Sound preset round-trip reloads saved params as authoritative values", () => {
    const files = new Map<string, string>();
    const values: Record<string, string> = {
      synth_module: "helm",
      "synth:chain_params": JSON.stringify([
        { key: "cutoff", name: "Cutoff" },
        { key: "resonance", name: "Resonance" },
        { key: "fil_env_depth", name: "FED" },
        { key: "amp_attack", name: "AA" },
        { key: "amp_decay", name: "AD" },
        { key: "amp_sustain", name: "AS" },
        { key: "amp_release", name: "AR" },
        { key: "volume", name: "Vol" },
      ]),
      "synth:cutoff": "28",
      "synth:resonance": "0",
      "synth:fil_env_depth": "-128",
      "synth:amp_attack": "0",
      "synth:amp_decay": "0",
      "synth:amp_sustain": "0",
      "synth:amp_release": "0",
      "synth:volume": "0",
      "synth:state": JSON.stringify({
        cutoff: "101",
        resonance: "0.9",
        fil_env_depth: "64",
        amp_attack: "1",
        amp_decay: "1",
        amp_sustain: "1",
        amp_release: "1",
        volume: "0.92",
      }),
    };
    Reflect.set(globalThis, "host_ensure_dir", () => true);
    Reflect.set(globalThis, "host_read_file", (path: string) => files.get(path) ?? null);
    Reflect.set(globalThis, "host_write_file", (path: string, data: string) => {
      files.set(path, data);
      return true;
    });
    Reflect.set(globalThis, "shadow_get_param", (_slot: number, key: string) => values[key] ?? "");

    requestEditSoundForTrack(4, { hasCoRun: true, hasMoveInject: true });
    const components = [
      { label: "MIDI FX", param: "midi_fx1:module", read: "midi_fx1_module", list: "midi_fx" },
      { label: "Synth", param: "synth:module", read: "synth_module", list: "sound_generator" },
      { label: "FX 1", param: "fx1:module", read: "fx1_module", list: "audio_fx" },
      { label: "FX 2", param: "fx2:module", read: "fx2_module", list: "audio_fx" },
    ];
    const save = saveSchwungSoundPreset(components, S.schwungSoundPage, "Helm Zeroed");
    expect(save.ok).toBe(true);

    Object.assign(values, {
      "synth:cutoff": "77",
      "synth:resonance": "0.6",
      "synth:fil_env_depth": "42",
      "synth:amp_attack": "0.5",
      "synth:amp_decay": "0.5",
      "synth:amp_sustain": "0.5",
      "synth:amp_release": "0.5",
      "synth:volume": "0.5",
    });

    let delayedStateRestore: null | (() => void) = null;
    const writes: Array<[number, string, string]> = [];
    Reflect.set(globalThis, "shadow_set_param", (slot: number, key: string, value: string) => {
      writes.push([slot, key, value]);
      if (key === "synth:state") {
        delayedStateRestore = () => {
          values["synth:cutoff"] = "101";
          values["synth:resonance"] = "0.9";
          values["synth:fil_env_depth"] = "64";
          values["synth:amp_attack"] = "1";
          values["synth:amp_decay"] = "1";
          values["synth:amp_sustain"] = "1";
          values["synth:amp_release"] = "1";
          values["synth:volume"] = "0.92";
        };
      } else {
        values[key] = value;
      }
      return true;
    });

    const manifest = JSON.parse(files.get("/data/UserData/overture/sound_presets/manifest.json")!);
    const load = loadSchwungSoundPreset(components, S.schwungSoundPage, manifest.presets[0]);
    expect(load.ok).toBe(true);
    if (delayedStateRestore) delayedStateRestore();

    expect(writes).not.toContainEqual([0, "synth:module", "helm"]);
    expect(writes).not.toContainEqual([0, "synth:state", values["synth:state"]]);
    expect(values).toMatchObject({
      "synth:cutoff": "28",
      "synth:resonance": "0",
      "synth:fil_env_depth": "-128",
      "synth:amp_attack": "0",
      "synth:amp_decay": "0",
      "synth:amp_sustain": "0",
      "synth:amp_release": "0",
      "synth:volume": "0",
    });
  });

  test("Schwung Sound preset save opens manager list with overwrite and create-new paths", () => {
    let opened: any = null;
    const files = new Map<string, string>();
    files.set("/data/UserData/overture/sound_presets/manifest.json", JSON.stringify({
      v: 1,
      presets: [
        {
          id: "dust",
          name: "Dust Pad",
          ts: 20,
          scope: "synth/dustline",
          componentPrefix: "synth",
          moduleId: "dustline",
          file: "/data/UserData/overture/sound_presets/dust.json",
        },
      ],
    }));
    const padBlocks: number[] = [];
    Reflect.set(globalThis, "host_ensure_dir", () => true);
    Reflect.set(globalThis, "host_read_file", (path: string) => files.get(path) ?? null);
    Reflect.set(globalThis, "host_write_file", (path: string, data: string) => {
      files.set(path, data);
      return true;
    });
    Reflect.set(globalThis, "host_pad_block", (blocked: number) => {
      padBlocks.push(blocked);
      return true;
    });
    Reflect.set(globalThis, "shadow_get_param", (_slot: number, key: string) => ({
      synth_module: "dustline",
      "synth:chain_params": JSON.stringify([{ key: "macro", name: "Macro" }]),
      "synth:macro": "0.5",
    } as Record<string, string>)[key] ?? "");

    requestEditSoundForTrack(4, { hasCoRun: true, hasMoveInject: true });
    expect(beginSaveSchwungSoundPreset((opts: any) => { opened = opts; })).toBe(true);
    expect(opened).toBe(null);
    expect(S.schwungSoundPage).toMatchObject({
      browser: true,
      browserKind: "preset-save",
      browserIndex: 0,
      noList: false,
    });
    expect(S.schwungSoundPage?.browserItems).toMatchObject([
      { name: "Dust Pad" },
      { name: "Create new", createNew: true },
    ]);

    expect(applySchwungSoundBrowserSelection()).toBe(true);
    expect(S.schwungSoundPage?.overwriteConfirm).toMatchObject({
      title: "Overwrite?",
      message: "Dust Pad",
      selected: 0,
    });
    expect(files.get("/data/UserData/overture/sound_presets/dust.json")).toBe(undefined);
    expect(applySchwungSoundBrowserSelection()).toBe(true);
    expect(files.get("/data/UserData/overture/sound_presets/dust.json")).toBe(undefined);

    expect(beginSaveSchwungSoundPreset((opts: any) => { opened = opts; })).toBe(true);
    expect(applySchwungSoundBrowserSelection()).toBe(true);
    rotateSchwungSoundPage(1);
    expect(S.schwungSoundPage?.overwriteConfirm).toMatchObject({ selected: 1 });
    expect(applySchwungSoundBrowserSelection()).toBe(true);
    const overwritten = JSON.parse(files.get("/data/UserData/overture/sound_presets/dust.json")!);
    expect(overwritten).toMatchObject({ name: "Dust Pad", params: { macro: "0.5" } });
    expect(S.schwungSoundPage?.statusFlash).toMatchObject({ text: "SAVED" });
    expect(padBlocks).toEqual([0]);

    expect(beginSaveSchwungSoundPreset((opts: any) => { opened = opts; })).toBe(true);
    S.schwungSoundPage!.browserIndex = 1;
    expect(applySchwungSoundBrowserSelection((opts: any) => { opened = opts; })).toBe(true);
    expect(opened).toMatchObject({
      title: "Name",
      defaultText: "Preset 1",
    });
  });

  test("Schwung Sound page renders selected module detail and cached chain params", () => {
    Reflect.set(globalThis, "shadow_get_param", (_slot: number, key: string) => ({
      midi_fx1_module: "arpy",
      synth_module: "dustline",
      fx1_module: "trail",
      fx2_module: "wash",
      "synth:ui_hierarchy": JSON.stringify({
        levels: {
          root: {
            knobs: ["macro", { key: "tone", label: "Tone" }],
            params: [
              { key: "fil_env_dep", name: "fil_env_dep" },
              { key: "fil_env_depth", name: "fil_env_depth" },
              { key: "enabled", name: "Enabled" },
              { key: "sample_path", name: "Sample" },
            ],
          },
        },
      }),
      "synth:chain_params": JSON.stringify([
        { key: "macro", name: "Macro", type: "float", min: 0, max: 1, step: 0.1 },
        { key: "tone", name: "Tone", type: "enum", options: ["Dark", "Bright"] },
        { key: "fil_env_dep", name: "fil_env_dep", type: "float", min: -100, max: 100 },
        { key: "fil_env_depth", name: "fil_env_depth", type: "float", rangeMin: -100, rangeMax: 127 },
        { key: "enabled", name: "Enabled", type: "bool" },
        { key: "sample_path", name: "Sample", type: "filepath" },
        { key: "osc_shape", name: "OscShape" },
        { key: "filter_cutoff", name: "Cutoff" },
        { key: "resonance", name: "Resonance" },
        { key: "attack", name: "Attack" },
        { key: "decay", name: "Decay" },
      ]),
      "synth:macro": "0.5",
      "synth:tone": "0",
      "synth:fil_env_dep": "60",
      "synth:fil_env_depth": "101",
      "synth:enabled": "1",
      "synth:sample_path": "/tmp/kick.wav",
      "fx2:chain_params": JSON.stringify(Array.from({ length: 20 }, (_, i) => ({
        key: `step_${i + 1}`,
        name: `Step ${i + 1}`,
      }))),
      knob_1_param: "Cutoff",
      knob_3_param: "Drive",
    } as Record<string, string>)[key] ?? "");
    const writes: unknown[][] = [];
    Reflect.set(globalThis, "shadow_set_param", (slot: number, key: string, value: string) => {
      writes.push([slot, key, value]);
      return true;
    });

    requestEditSoundForTrack(4, { hasCoRun: true, hasMoveInject: true });
    expect(S.schwungSoundPage).toMatchObject({ selectedIndex: 1, paramDetail: true });
    const calls: unknown[][] = [];
    const surface = {
      clear_screen: () => calls.push(["clear"]),
      fill_rect: (x: number, y: number, w: number, h: number, color: number) =>
        calls.push(["fill", x, y, w, h, color]),
      print: (x: number, y: number, text: string, color: number) =>
        calls.push(["print", x, y, text, color]),
    };

    expect(renderSchwungSoundPage(surface)).toBe(true);
    expect(calls).toContainEqual(["print", 0, 0, "T5 SYNTH", 1]);
    expect(calls).toContainEqual(["print", 54, 1, "[dustline]", 0]);
    expect(calls).toContainEqual(["print", 4, 14, "mcr", 1]);
    expect(calls).toContainEqual(["print", 4, 22, "0.5", 1]);
    expect(calls).toContainEqual(["print", 34, 14, "Tone", 1]);
    expect(calls).toContainEqual(["print", 34, 22, "Dark", 1]);
    expect(calls).toContainEqual(["print", 64, 14, "FED", 1]);
    expect(calls).toContainEqual(["print", 64, 22, "60", 1]);
    expect(calls).toContainEqual(["print", 4, 36, "En", 1]);
    expect(calls).toContainEqual(["print", 4, 44, "On", 1]);
    expect(calls).toContainEqual(["print", 34, 36, "Smpl", 1]);
    expect(calls).toContainEqual(["print", 34, 44, "/tmp", 1]);

    expect(toggleSchwungSoundParamDetail()).toBe(true);
    calls.length = 0;
    renderSchwungSoundPage(surface);
    expect(calls).toContainEqual(["print", 54, 1, "[dustline]", 0]);
    expect(calls).toContainEqual(["print", 4, 14, "mcr", 1]);
    expect(calls).toContainEqual(["print", 4, 22, "0.5", 1]);
    expect(toggleSchwungSoundParamDetail()).toBe(true);

    expect(touchSchwungSoundVisibleParam(1)).toBe(true);
    calls.length = 0;
    renderSchwungSoundPage(surface);
    expect(calls).toContainEqual(["print", 110, 1, "K2", 0]);
    expect(calls).toContainEqual(["print", 0, 14, "Tone", 1]);
    expect(calls).toContainEqual(["print", 52, 38, "Dark", 0]);
    expect(calls).not.toContainEqual(["print", 0, 22, "K2 Tn Dark", 1]);

    expect(adjustSchwungSoundVisibleParam(0, 1)).toBe(true);
    expect(writes).toContainEqual([0, "synth:macro", "0.51"]);
    expect(adjustSchwungSoundVisibleParam(2, 1)).toBe(true);
    expect(writes).toContainEqual([0, "synth:fil_env_dep", "62"]);
    const staleParam = S.schwungSoundPage!.componentParams[1].find((p: any) => p.key === "fil_env_dep");
    staleParam.value = "60";
    expect(touchSchwungSoundVisibleParam(2)).toBe(true);
    calls.length = 0;
    renderSchwungSoundPage(surface);
    expect(calls).toContainEqual(["print", 110, 1, "K3", 0]);
    expect(calls).toContainEqual(["print", 0, 14, "fil env dep", 1]);
    expect(calls).toContainEqual(["print", 58, 38, "62", 0]);
    const transientMissingValue = S.schwungSoundPage!.componentParams[1].find((p: any) => p.key === "fil_env_depth");
    transientMissingValue.value = "-";
    delete S.schwungSoundPage!.paramValueOverrides["synth:fil_env_depth"];
    expect(adjustSchwungSoundVisibleParam(3, 1)).toBe(true);
    expect(writes).toContainEqual([0, "synth:fil_env_depth", "2"]);
    calls.length = 0;
    renderSchwungSoundPage(surface);
    expect(calls).toContainEqual(["print", 110, 1, "K4", 0]);
    expect(calls).toContainEqual(["print", 61, 38, "2", 0]);
    expect(calls).not.toContainEqual(["print", 0, 54, "Read only", 1]);
    expect(adjustSchwungSoundVisibleParam(4, 1)).toBe(true);
    expect(writes).toContainEqual([0, "synth:enabled", "0"]);
    calls.length = 0;
    renderSchwungSoundPage(surface);
    expect(calls).toContainEqual(["print", 110, 1, "K5", 0]);
    expect(calls).toContainEqual(["print", 0, 14, "Enabled", 1]);
    expect(calls).toContainEqual(["print", 55, 38, "Off", 0]);

    const beforeReadOnly = writes.length;
    expect(adjustSchwungSoundVisibleParam(5, 1)).toBe(true);
    expect(writes).toHaveLength(beforeReadOnly);
    calls.length = 0;
    renderSchwungSoundPage(surface);
    expect(calls).toContainEqual(["print", 110, 1, "K6", 0]);
    expect(calls).toContainEqual(["print", 0, 14, "Sample", 1]);
    expect(calls).toContainEqual(["print", 0, 54, "Read only", 1]);

    S.schwungSoundPage!.touchedParam.expireAtMs = Date.now() - 1;
    expect(expireSchwungSoundParamPeek()).toBe(true);
    calls.length = 0;
    renderSchwungSoundPage(surface);
    expect(calls).toContainEqual(["print", 34, 36, "Smpl", 1]);
    expect(calls).toContainEqual(["print", 34, 44, "/tmp", 1]);

    expect(selectSchwungSoundComponent(3)).toBe(true);
    expect(S.schwungSoundPage).toMatchObject({ selectedIndex: 3, paramDetail: true, paramDetailIndex: 0 });
    rotateSchwungSoundPage(100);
    expect(S.schwungSoundPage).toMatchObject({ selectedIndex: 3, paramDetail: true, paramDetailIndex: 16 });
    expect(closeSchwungSoundPage()).toBe(true);
    requestEditSoundForTrack(4, { hasCoRun: true, hasMoveInject: true });
    expect(S.schwungSoundPage).toMatchObject({ selectedIndex: 3, paramDetail: true, paramDetailIndex: 16 });

    expect(selectSchwungSoundComponent(1)).toBe(true);
    S.schwungSoundPage!.paramDetailIndex = 999;
    expect(adjustSchwungSoundVisibleParam(2, 1)).toBe(true);
    expect(writes).toContainEqual([0, "synth:fil_env_dep", "62"]);

    expect(toggleSchwungSoundParamDetail()).toBe(true);
    S.schwungSoundPage!.selectedIndex = 2;
    calls.length = 0;
    renderSchwungSoundPage(surface);
    expect(calls).toContainEqual(["print", 42, 1, "[trail]", 0]);
    expect(calls).toContainEqual(["print", 4, 14, "Cut", 1]);
    expect(calls).toContainEqual(["print", 4, 22, "--", 1]);
    expect(calls).toContainEqual(["print", 34, 14, "Drv", 1]);
    expect(calls).toContainEqual(["print", 34, 22, "--", 1]);

    S.schwungSoundPage!.selectedIndex = 3;
    expect(toggleSchwungSoundParamDetail()).toBe(true);
    rotateSchwungSoundPage(100);
    calls.length = 0;
    renderSchwungSoundPage(surface);
    expect(calls).toContainEqual(["fill", 124, 35, 3, 2, 1]);
    expect(calls).toContainEqual(["print", 4, 14, "S17", 1]);
    expect(calls).toContainEqual(["print", 4, 22, "--", 1]);
    expect(calls).toContainEqual(["print", 94, 14, "S20", 1]);
    expect(calls).toContainEqual(["print", 94, 22, "--", 1]);
    expect(toggleSchwungSoundParamDetail()).toBe(true);
  });

  test("route labels distinguish Move, External, Schwung slot, and Schwung channel fallback", () => {
    expect(routeScopeShortLabel(0)).toBe("Move Ch1");
    S.trackRoute[0] = 2;
    expect(routeScopeShortLabel(0)).toBe("Ext Ch1");
    S.trackRoute[0] = 0;
    S.trackChannel[0] = 5;
    expect(routeScopeShortLabel(0)).toBe("Schw S1");
    Reflect.set(globalThis, "shadow_get_slots", () => [{ channel: 8, name: "Slot4" }]);
    expect(routeScopeShortLabel(0)).toBe("Schw Ch5");
  });

  test("route check view model preserves windowing and row labels", () => {
    expect(routeCheckViewModel(0, globalThis.shadow_get_slots())).toEqual({
      title: "ROUTE CHECK",
      range: "1-4/8",
      footer: "Jog scroll  Back/Menu",
      rows: [
        { track: 0, text: "T1 Move Ch1", status: "MANUAL", active: true },
        { track: 1, text: "T2 Move Ch2", status: "MANUAL", active: false },
        { track: 2, text: "T3 Move Ch3", status: "MANUAL", active: false },
        { track: 3, text: "T4 Move Ch4", status: "MANUAL", active: false },
      ],
    });

    expect(routeCheckViewModel(5, globalThis.shadow_get_slots())).toMatchObject({
      range: "5-8/8",
      rows: [
        { track: 4, text: "T5 Schw Ch5", status: "OK S1", active: false },
        { track: 5, text: "T6 Schw Ch6", status: "OK S2", active: true },
        { track: 6, text: "T7 Schw Ch7", status: "OK S3", active: false },
        { track: 7, text: "T8 Schw Ch8", status: "OK S3", active: false },
      ],
    });
  });

  test("route check statuses preserve no-slot, thru, and mismatch warnings", () => {
    expect(routeCheckStatus(4, [{ channel: 6 }])).toBe("NO SLOT");
    expect(routeCheckStatus(4, [{ channel: -2, name: "Thru" }])).toBe("THRU!");

    S.trackRoute[0] = 0;
    expect(routeCheckStatus(0, [])).toBe("ROUTE!");

    S.trackRoute[0] = 1;
    S.trackChannel[0] = 9;
    expect(routeCheckStatus(0, [])).toBe("CH9!");

    S.trackChannel[5] = 16;
    expect(routeCheckStatus(5, [{ channel: 16 }])).toBe("OK S1");
  });

  test("motion descriptors preserve AUTO labels and Param Peek text", () => {
    expect(autoLaneLabel(0, 0, false)).toBe("AT");
    expect(autoLaneLabel(0, 1, true)).toBe("L2 CC74");
    expect(autoLaneLabel(0, 2, false)).toBe("Sch5");
    expect(autoLaneLabel(0, 3, false)).toBe("--");

    expect(paramPeekInfo()).toMatchObject({
      header: "AUTO T1 Clip A",
      target: "Move target",
      value: "Value 64",
      detail: "Clip A, Lane 2",
      route: "Route: Move Ch1",
    });

    S.ccLaneLength[0][0][1] = 32;
    S.ccLaneTps[0][0][1] = 12;
    S.ccLaneResTps[0][0][1] = 24;
    S.tickCount = PARAM_PEEK_DETAIL_TICKS;
    S.knobTouchStartTick = 0;
    expect(paramPeekInfo()).toMatchObject({
      header: "Move target",
      target: "Lane 2 / Clip A",
      value: "Route: Move Ch1",
      detail: "Loop 32 steps",
      route: "Res 1/16 Zoom 1/32",
    });
  });

  test("Param Peek describes drum NOTE FX controls from drum lane state", () => {
    S.trackPadMode[0] = 1;
    S.activeBank = 1;
    S.knobTouched = 0;
    S.bankParams[0][1][0] = 109;
    S.bankParams[0][1][1] = -7;

    expect(paramPeekInfo()).toMatchObject({
      header: "NOTE FX T1 Drum",
      target: "Lane Octave",
      value: "Value Note 48",
      detail: "Lane 3, octave jumps",
      route: "Route: Move Ch1",
    });

    S.knobTouched = 5;
    expect(paramPeekInfo()).toMatchObject({
      target: "Gate Time",
      value: "Value 109%",
      detail: "Lane 3",
    });
  });

  test("motion overview model preserves AUTO bank badges, lane cells, and footer", () => {
    expect(motionOverviewModel(0, 0)).toMatchObject({
      heading: "AUTO",
      badges: ["Sch", "AT", "CC"],
      footer: "",
    });
    expect(motionOverviewModel(0, 0).lanes.slice(0, 4)).toEqual([
      { lane: 0, label: "AT", value: "--", touched: false, labelInverted: false, valueInverted: false },
      { lane: 1, label: "CC74", value: "64", touched: true, labelInverted: true, valueInverted: true },
      { lane: 2, label: "Sch5", value: "99", touched: false, labelInverted: false, valueInverted: false },
      { lane: 3, label: "--", value: "--", touched: false, labelInverted: false, valueInverted: false },
    ]);
    S.knobTouched = 2;
    expect(motionOverviewModel(0, 0).footer).toBe("Cutoff");

    S.altMode = true;
    const assignModel = motionOverviewModel(0, 0);
    expect(assignModel.lanes[0]).toMatchObject({ labelInverted: true, valueInverted: false });
    expect(assignModel.lanes[1]).toMatchObject({ labelInverted: true, valueInverted: true });
  });

  test("motion idle model preserves active-lane summary text", () => {
    S.ccLaneLength[0][0][1] = 32;
    S.ccLaneTps[0][0][1] = 12;
    S.ccLaneResTps[0][0][1] = 24;

    expect(motionIdleModel(0, 0)).toEqual({
      heading: "AUTO",
      badges: ["Sch", "AT", "CC"],
      lane: 1,
      laneLabel: "L2 CC74",
      value: "64",
      valueUnderline: true,
      param: "",
      paramText: "",
      resText: "Res: 1/16",
      zoomText: "Zoom: 1/32",
      effectiveLength: 32,
      graphKey: "g_0_0_1",
      graphPages: 2,
    });

    S.ccActiveLane[0] = 2;
    expect(motionIdleModel(0, 0)).toMatchObject({
      laneLabel: "L3 Sch5",
      value: "99",
      param: "Cutoff",
      paramText: "Cutoff",
    });
  });

  test("generic Parameter Page model preserves cell formatting and slot assumptions", () => {
    const knobs = Array.from({ length: 8 }, (_, k) => ({
      abbrev: "K" + k,
      dspKey: "",
      fmt: (v: number) => "V" + v,
    }));
    knobs[1] = { abbrev: "Rate", dspKey: "", fmt: fmtArpRate };
    knobs[6] = { abbrev: "Dir", dspKey: "clip_playback_dir", fmt: (v: number) => "D" + v };
    knobs[7] = { abbrev: "Rnd", dspKey: "", fmt: (v: number) => "R" + v };

    const model = genericParameterPageGridModel({
      bank: 3,
      knobs,
      vals: [0, 2, 3, 4, 5, 6, 7, 8],
      altMode: true,
      isDrum: false,
      knobTouched: 6,
      midiDlyRandomMode: 1,
      noteFXRandomMode: 2,
      delayClockFb: -6,
      clipPlaybackAudioReverse: 1,
    });

    expect(model.grid).toMatchObject({
      preformatted: true,
      preserveSlots: true,
      startY: 12,
      valueYOffset: 12,
    });
    expect(model.cells[0]).toMatchObject({ label: "ClkF", value: "-6  ", highlighted: false });
    expect(model.cells[1]).toMatchObject({ label: "Rate", value: "1/16t", highlighted: false });
    expect(model.cells[6]).toMatchObject({ label: "Rvrs", value: "Audi", highlighted: true });
    expect(model.cells[7]).toMatchObject({ label: "Algo", value: "Gaus", highlighted: false });
  });

  test("label/value Parameter Page model preserves sparse slots and wide labels", () => {
    const model = labelValueParameterPageGridModel({
      labels: ["Res", "LongLabel", null, "Gate", "", "Dir", "SyncRpt", "-"],
      values: ["1/8", "96", "skip", 87, "skip", "Fwd", "ON", null],
      wideLabels: true,
      knobTouched: 6,
    });

    expect(model.grid).toMatchObject({
      preformatted: true,
      preserveSlots: true,
      startY: 12,
      valueYOffset: 12,
    });
    expect(model.cells).toHaveLength(8);
    expect(model.cells[0]).toMatchObject({ label: "Res ", value: "1/8 ", highlighted: false });
    expect(model.cells[1]).toMatchObject({ label: "LongLabel", value: "96  ", highlighted: false });
    expect(model.cells[2]).toBeNull();
    expect(model.cells[4]).toBeNull();
    expect(model.cells[6]).toMatchObject({ label: "SyncRpt", value: "ON  ", highlighted: true });
    expect(model.cells[7]).toMatchObject({ label: "-   ", value: "-   ", highlighted: false });
  });

  test("drum MIDI delay Parameter Page model preserves special-case cell labels", () => {
    const knobs = Array.from({ length: 8 }, (_, k) => ({
      abbrev: "K" + k,
      fmt: (v: number) => "V" + v,
    }));
    const model = drumMidiDelayParameterPageGridModel({
      knobs,
      vals: [2, 1, -3, 4, 5, -6, 1, 0],
      knobTouched: 5,
    });

    expect(model.grid).toMatchObject({
      preformatted: true,
      preserveSlots: true,
      startY: 12,
      valueYOffset: 12,
    });
    expect(model.cells[0]).toMatchObject({ label: "K0  ", value: "V2  ", highlighted: false });
    expect(model.cells[4]).toMatchObject({ label: "Gate", value: "1/8T", highlighted: false });
    expect(model.cells[5]).toMatchObject({ label: "Clk ", value: "-6  ", highlighted: true });
    expect(model.cells[6]).toMatchObject({ label: "Retr", value: "ON  ", highlighted: false });
    expect(model.cells[7]).toBeNull();
  });

  test("drum lane Parameter Page model preserves lane cell labels and alt values", () => {
    const model = drumLaneParameterPageGridModel({
      altMode: true,
      tpsIdx: 2,
      stretch: -1,
      shift: 5,
      euclidN: 12,
      playbackDir: 3,
      playbackAudioReverse: 1,
      seqFollow: true,
      knobTouched: 6,
    });

    expect(model.grid).toMatchObject({
      preformatted: true,
      preserveSlots: true,
      startY: 12,
      valueYOffset: 12,
    });
    expect(model.cells[0]).toMatchObject({ label: "Zoom", value: "1/8 ", highlighted: false });
    expect(model.cells[1]).toMatchObject({ label: "Stch", value: "/2  ", highlighted: false });
    expect(model.cells[2]).toMatchObject({ label: "Nudg", value: "+5  ", highlighted: false });
    expect(model.cells[4]).toMatchObject({ label: "Eucl", value: "12  ", highlighted: false });
    expect(model.cells[6]).toMatchObject({ label: "Rvrs", value: "Audi", highlighted: true });
    expect(model.cells[7]).toMatchObject({ label: "SqFl", value: "ON  ", highlighted: false });
  });

  test("all lanes Parameter Page model preserves wide labels and unavailable values", () => {
    const model = allLanesParameterPageGridModel({
      altMode: true,
      resolution: -1,
      stretch: 1,
      shift: -2,
      quantize: 0,
      velocityOverride: 96,
      inputQuantize: 3,
      playbackDir: -1,
      syncRepeat: 1,
      knobTouched: 7,
    });

    expect(model.grid).toMatchObject({
      preformatted: true,
      preserveSlots: true,
      startY: 12,
      valueYOffset: 12,
    });
    expect(model.cells[0]).toMatchObject({ label: "Res ", value: "--  ", highlighted: false });
    expect(model.cells[2]).toMatchObject({ label: "Nudg", value: "-2  ", highlighted: false });
    expect(model.cells[3]).toMatchObject({ label: "Qnt ", value: "--  ", highlighted: false });
    expect(model.cells[4]).toMatchObject({ label: "VelIn", value: "96  ", highlighted: false });
    expect(model.cells[5]).toMatchObject({ label: "InQ ", value: "1/16", highlighted: false });
    expect(model.cells[6]).toMatchObject({ label: "Rvrs", value: "--  ", highlighted: false });
    expect(model.cells[7]).toMatchObject({ label: "SyncRpt", value: "ON  ", highlighted: true });
  });
});
