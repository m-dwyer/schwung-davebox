import {
    queueLiveNoteOff,
    queueLiveNoteOn
} from '../pad/ui_pad_surface.mjs';

/**
 * Live-note recording sub-state, owned by the Recording Workflow concept
 * (held on the dedicated workflowState, not on `S`).
 *
 * @typedef {Object} LiveNoteRecordingState
 * @property {Map<number, number>} recordingNoteTrack  pitch -> record realtime tick
 * @property {Map<number, { track: number, recording: boolean }>} extHeldNotes  external-MIDI held notes
 */

/** @returns {LiveNoteRecordingState} */
export function createLiveNoteRecordingState() {
    return {
        recordingNoteTrack: new Map(),
        extHeldNotes: new Map()
    };
}

export function recordNoteOnImpl(S, state, pitch, velocity, rt) {
    state.recordingNoteTrack.set(pitch, rt);
    S._recNoteOns.push({pitch, vel: velocity, rt});
}

export function recordNoteOffImpl(S, state, pitch) {
    const rt = state.recordingNoteTrack.get(pitch);
    if (rt === undefined) return;
    state.recordingNoteTrack.delete(pitch);
    S._recNoteOffs.push({pitch, rt});
}

/* Tick-batched live-note dispatch. Multiple set_param calls within a single
 * audio buffer coalesce to the last write — regardless of key — so a 3-pad
 * chord that fires 3 separate tN_live_notes microtasks within one buffer
 * loses two of them. We previously batched via a Promise microtask which
 * runs once per JS turn, but the host dispatches each onMidiMessage as its
 * own turn — so multiple pad CCs in one buffer still produced multiple
 * coalescing set_params. Drain on tick instead: events queue synchronously
 * from any number of onMidiMessage calls; tick() drains once per audio
 * buffer into one set_param per track. Cost: up to ~10 ms (one tick) of
 * live-monitor latency. Benefit: chord-press survives intact. */
export function liveSendNoteImpl(S, deps, t, type, pitch, vel, rawVel) {
    const ch    = (S.trackChannel[t] - 1) & 0x0F;
    const route = S.trackRoute[t];
    const status = type | ch;
    /* PHASE-1: dead on patched Schwung (Bundle 1 gate skips note dispatch
     * for liveSendNote; Bundle 2B applies VelIn in DSP on_midi via
     * effective_vel before live_note_on). Stock Schwung still needs this
     * — runs when dspInboundEnabled is false. Remove with the final
     * cleanup pass once shim patches land upstream. */
    if (!rawVel && type === 0x90 && vel > 0) {
        const tvo = S.trackVelOverride[t];
        if (tvo > 0) vel = tvo;
    }
    if (route === 2) {
        /* ROUTE_EXTERNAL. Note events queue through tN_live_notes so the pfx
         * chain applies (consistent with sequencer playback, which already
         * routes ROUTE_EXTERNAL through pfx_emit). DSP-side gate suppresses
         * when on_midi already handled it. CC/AT/PB pass through raw for the
         * external-MIDI-in forwarding path. */
        if (type === 0x90 || type === 0x80) {
            const isOff = (type === 0x80) || (type === 0x90 && vel === 0);
            if (isOff) {
                queueLiveNoteOff(deps.pendingLiveNotes, t, pitch);
            } else {
                queueLiveNoteOn(deps.pendingLiveNotes, t, pitch, vel);
            }
        } else {
            const cin = (status >> 4) & 0x0F;
            if (typeof deps.move_midi_external_send === 'function')
                deps.move_midi_external_send([cin, status, pitch, vel]);
        }
    } else if (route === 1) {
        /* ROUTE_MOVE. Queue note events for microtask-batched drain into one
         * tN_live_notes payload at end of the current JS turn. Recording
         * suppression: melodic record_note_on inline-monitors via DSP; drum
         * recording handled by press-handler direct-fire (also routes through
         * queueLiveNoteOn). Suppress here to avoid double-monitoring.
         *
         * Always queued regardless of dspInboundEnabled — the DSP-side
         * tN_live_notes handler gates on dsp_inbound_enabled instead, so
         * the JS path serves as a fallback when the padmap push didn't
         * reach DSP (stock Schwung v0.9.16 exposes the sentinel but
         * on_midi delivery may not produce sound). */
        if (type === 0x90 || type === 0x80) {
            const activelyRecording = S.recordArmed && !S.recordCountingIn && S.recordArmedTrack === t;
            const isOff = (type === 0x80) || (type === 0x90 && vel === 0);
            if (isOff) {
                queueLiveNoteOff(deps.pendingLiveNotes, t, pitch);
            } else if (!activelyRecording) {
                queueLiveNoteOn(deps.pendingLiveNotes, t, pitch, vel);
            }
        }
    } else {
        /* ROUTE_SCHWUNG: route note events through live_note_on so pfx chain
         * (TARP, NOTE FX, HARMZ, MIDI DLY) applies. No activelyRecording filter
         * — record_note_on DSP handler does not call live_note_on() inline for
         * ROUTE_SCHWUNG, so no double-monitoring risk. Non-note events (CC, AT,
         * PB) pass through raw — only note on/off go through the live-notes
         * payload parser.
         *
         * Always queued regardless of dspInboundEnabled — DSP-side gate. */
        if (type === 0x90 || type === 0x80) {
            const isOff = type === 0x80 || vel === 0;
            if (isOff) {
                queueLiveNoteOff(deps.pendingLiveNotes, t, pitch);
            } else {
                queueLiveNoteOn(deps.pendingLiveNotes, t, pitch, vel);
            }
        } else {
            if (typeof deps.shadow_send_midi_to_dsp === 'function') deps.shadow_send_midi_to_dsp([status, pitch, vel]);
        }
    }
}

export function extNoteOffAllImpl(S, state, deps) {
    if (state.extHeldNotes.size === 0) return;
    for (const [pitch, info] of state.extHeldNotes) {
        deps.liveSendNote(info.track, 0x80, pitch, 0);
        if (info.recording) recordNoteOffImpl(S, state, pitch);
    }
    state.extHeldNotes.clear();
}
