import {
    MoveShift,
    MoveBack,
    MovePlay,
    MoveLeft,
    MoveRight,
    MoveUp,
    MoveDown,
    MoveMute,
    MoveDelete
} from '/data/UserData/schwung/shared/constants.mjs';

import {
    MoveNoteSession,
    MoveUndo,
    MoveLoop,
    MoveCopy,
    MoveMainKnob,
    MoveRec,
    MoveCapture,
    MoveSample,
    TRACK_PAD_BASE
} from '../core/ui_constants.mjs';

export function optionalMoveMidiInjectToMove() {
    return typeof move_midi_inject_to_move === 'function' ? move_midi_inject_to_move : null;
}

export function optionalMoveMidiExternalSend() {
    return typeof move_midi_external_send === 'function' ? move_midi_external_send : null;
}

export function optionalShadowSendMidiToDsp() {
    return typeof shadow_send_midi_to_dsp === 'function' ? shadow_send_midi_to_dsp : null;
}

export function optionalShadowSetParam() {
    return typeof shadow_set_param === 'function' ? shadow_set_param : null;
}

export function optionalShadowSetParamTimeout() {
    return typeof shadow_set_param_timeout === 'function' ? shadow_set_param_timeout : null;
}

export function optionalHostExitModule() {
    return typeof host_exit_module === 'function' ? host_exit_module : null;
}

export function createExtMidiRemapHostAdapters() {
    return {
        clear: typeof host_ext_midi_remap_clear === 'function' ? host_ext_midi_remap_clear : null,
        set: typeof host_ext_midi_remap_set === 'function' ? host_ext_midi_remap_set : null,
        enable: typeof host_ext_midi_remap_enable === 'function' ? host_ext_midi_remap_enable : null
    };
}

export function createButtonCcHardwareAdapters() {
    return {
        moveCapture: MoveCapture,
        moveCopy: MoveCopy,
        moveDelete: MoveDelete,
        moveLoop: MoveLoop,
        moveMenu: MoveNoteSession,
        moveMute: MoveMute,
        moveNoteSession: MoveNoteSession,
        moveShift: MoveShift
    };
}

export function createTransportCcHardwareAdapters() {
    return {
        moveBack: MoveBack,
        movePlay: MovePlay,
        moveMute: MoveMute,
        moveRec: MoveRec,
        moveSample: MoveSample,
        moveUndo: MoveUndo
    };
}

export function createNavigationCcHardwareAdapters() {
    return {
        moveDown: MoveDown,
        moveLeft: MoveLeft,
        moveRight: MoveRight,
        moveUp: MoveUp
    };
}

export function createJogCcHardwareAdapters() {
    return {
        moveMainKnob: MoveMainKnob
    };
}

export function createPadHardwareAdapters() {
    return {
        trackPadBase: TRACK_PAD_BASE
    };
}

export function createInputDispatchHardwareAdapters() {
    return {
        moveCapture: MoveCapture,
        moveShift: MoveShift,
        trackPadBase: TRACK_PAD_BASE
    };
}

export function createMidiInternalHardwareAdapters() {
    return {
        moveDelete: MoveDelete,
        moveDown: MoveDown,
        moveMainKnob: MoveMainKnob,
        moveNoteSession: MoveNoteSession,
        moveUp: MoveUp,
        trackPadBase: TRACK_PAD_BASE
    };
}
