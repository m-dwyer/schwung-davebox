import { afterEach, describe, expect, test } from "vitest";
import {
  createHostParamAdapters,
  createUiFlagAdapters,
  optionalHostModuleGetParam,
  optionalHostModuleSetParam,
} from "@overture-ui/sync/ui_sync_adapters.mjs";
import {
  createButtonCcHardwareAdapters,
  createExtMidiRemapHostAdapters,
  createInputDispatchHardwareAdapters,
  createJogCcHardwareAdapters,
  createMidiInternalHardwareAdapters,
  createNavigationCcHardwareAdapters,
  createPadHardwareAdapters,
  createTransportCcHardwareAdapters,
  optionalHostExitModule,
  optionalMoveMidiInjectToMove,
} from "@overture-ui/input/ui_input_adapters.mjs";
import { createTickHostAdapters } from "@overture-ui/tick/ui_tick_adapters.mjs";

const globalNames = [
  "host_module_get_param",
  "host_module_set_param",
  "host_ext_midi_remap_enable",
  "host_ext_midi_remap_clear",
  "host_ext_midi_remap_set",
  "host_file_exists",
  "host_exit_module",
  "move_midi_inject_to_move",
  "move_midi_external_send",
  "shadow_get_param",
  "shadow_clear_ui_flags",
  "shadow_get_ui_flags",
];

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const name of globalNames) delete globals[name];
});

describe("dependency adapters", () => {
  test("late-binds host module param functions", () => {
    const getA = () => "a";
    const getB = () => "b";
    const setA = () => undefined;
    const setB = () => undefined;

    globals.host_module_get_param = getA;
    globals.host_module_set_param = setA;
    expect(optionalHostModuleGetParam()).toBe(getA);
    expect(optionalHostModuleSetParam()).toBe(setA);
    expect(createHostParamAdapters()).toEqual({ getParam: getA, setParam: setA });

    globals.host_module_get_param = getB;
    globals.host_module_set_param = setB;
    expect(optionalHostModuleGetParam()).toBe(getB);
    expect(optionalHostModuleSetParam()).toBe(setB);
    expect(createHostParamAdapters()).toEqual({ getParam: getB, setParam: setB });

    delete globals.host_module_get_param;
    delete globals.host_module_set_param;
    expect(createHostParamAdapters()).toEqual({ getParam: null, setParam: null });
  });

  test("late-binds input and tick host adapters", () => {
    const injectA = () => undefined;
    const injectB = () => undefined;
    const exitModule = () => undefined;
    const remapEnable = () => undefined;
    const fileExists = () => true;
    const shadowGetParam = () => "1";

    globals.move_midi_inject_to_move = injectA;
    expect(optionalMoveMidiInjectToMove()).toBe(injectA);
    globals.move_midi_inject_to_move = injectB;
    expect(optionalMoveMidiInjectToMove()).toBe(injectB);

    globals.host_exit_module = exitModule;
    expect(optionalHostExitModule()).toBe(exitModule);

    globals.host_ext_midi_remap_enable = remapEnable;
    expect(createExtMidiRemapHostAdapters().enable).toBe(remapEnable);

    globals.host_file_exists = fileExists;
    globals.shadow_get_param = shadowGetParam;
    expect(createTickHostAdapters()).toMatchObject({
      host_file_exists: fileExists,
      move_midi_inject_to_move: injectB,
      shadow_get_param: shadowGetParam,
    });
  });

  test("late-binds UI flag global getter and setter", () => {
    const clearFlags = () => undefined;
    const getFlags = () => 1;
    const nextGetFlags = () => 2;

    globals.shadow_clear_ui_flags = clearFlags;
    globals.shadow_get_ui_flags = getFlags;

    const adapters = createUiFlagAdapters();
    expect(adapters.clearFlags).toBe(clearFlags);
    expect(adapters.getFlagsFn()).toBe(getFlags);

    adapters.setFlagsFn(nextGetFlags);
    expect(adapters.getFlagsFn()).toBe(nextGetFlags);
  });

  test("groups input dispatch hardware constants by surface concept", () => {
    expect(createButtonCcHardwareAdapters()).toEqual({
      moveCapture: 52,
      moveCopy: 60,
      moveDelete: 119,
      moveLoop: 58,
      moveMenu: 50,
      moveMute: 88,
      moveNoteSession: 50,
      moveShift: 49,
    });
    expect(createTransportCcHardwareAdapters()).toEqual({
      moveBack: 51,
      movePlay: 85,
      moveMute: 88,
      moveRec: 86,
      moveSample: 118,
      moveUndo: 56,
    });
    expect(createNavigationCcHardwareAdapters()).toEqual({
      moveDown: 54,
      moveLeft: 62,
      moveRight: 63,
      moveUp: 55,
    });
    expect(createJogCcHardwareAdapters()).toEqual({ moveMainKnob: 14 });
    expect(createPadHardwareAdapters()).toEqual({ trackPadBase: 68 });
    expect(createInputDispatchHardwareAdapters()).toEqual({
      moveCapture: 52,
      moveShift: 49,
      trackPadBase: 68,
    });
    expect(createMidiInternalHardwareAdapters()).toEqual({
      moveDelete: 119,
      moveDown: 54,
      moveMainKnob: 14,
      moveNoteSession: 50,
      moveUp: 55,
      trackPadBase: 68,
    });
  });
});
