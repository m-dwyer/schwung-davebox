export function optionalMoveMidiInjectToMove() {
    return typeof move_midi_inject_to_move === 'function' ? move_midi_inject_to_move : null;
}

export function optionalMoveMidiExternalSend() {
    return typeof move_midi_external_send === 'function' ? move_midi_external_send : null;
}

export function optionalShadowSendMidiToDsp() {
    return typeof shadow_send_midi_to_dsp === 'function' ? shadow_send_midi_to_dsp : null;
}

export function createExtMidiRemapHostAdapters() {
    return {
        clear: typeof host_ext_midi_remap_clear === 'function' ? host_ext_midi_remap_clear : null,
        set: typeof host_ext_midi_remap_set === 'function' ? host_ext_midi_remap_set : null,
        enable: typeof host_ext_midi_remap_enable === 'function' ? host_ext_midi_remap_enable : null
    };
}
