import {
    optionalHostFileExists,
    optionalHostModuleGetParam,
    optionalHostModuleSetParam,
    optionalHostReadFile
} from '../sync/ui_sync_adapters.mjs';
import {
    optionalMoveMidiExternalSend,
    optionalMoveMidiInjectToMove,
    optionalShadowSetParam,
    optionalShadowSetParamTimeout
} from '../input/ui_input_adapters.mjs';

export function createTickHostAdapters() {
    return {
        host_module_get_param: optionalHostModuleGetParam(),
        host_module_set_param: optionalHostModuleSetParam(),
        host_ext_midi_remap_enable: typeof host_ext_midi_remap_enable === 'function' ? host_ext_midi_remap_enable : null,
        host_exit_module: typeof host_exit_module === 'function' ? host_exit_module : null,
        host_hide_module: typeof host_hide_module === 'function' ? host_hide_module : null,
        host_file_exists: optionalHostFileExists(),
        host_read_file: optionalHostReadFile(),
        move_midi_inject_to_move: optionalMoveMidiInjectToMove(),
        move_midi_external_send: optionalMoveMidiExternalSend(),
        shadow_get_param: typeof shadow_get_param === 'function' ? shadow_get_param : null,
        shadowSetParam: optionalShadowSetParam(),
        shadowSetParamTimeout: optionalShadowSetParamTimeout()
    };
}
