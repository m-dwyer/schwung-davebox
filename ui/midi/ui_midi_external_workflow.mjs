import {
    enqueueDrumRecNoteOff,
    enqueueDrumRecNoteOn,
    isActivelyRecording,
    isActivelyRecordingTrack
} from '../perform/ui_recording_workflow.mjs';

export function onMidiExternalImpl(S, deps, data) {
    const status  = data[0] | 0;
    const d1      = (data[1] ?? 0) | 0;
    const d2      = (data[2] ?? 0) | 0;
    const msgType = status & 0xF0;
    const msgCh   = (status & 0x0F) + 1;  /* 1-indexed */

    /* Route to S.activeTrack in all views — S.activeTrack always reflects last Track View focus */
    const t = S.activeTrack;

    /* ROUTE_MOVE: Move receives external cable-2 MIDI natively in overtake mode.
     * Never inject — injecting causes an echo cascade (Move echoes cable-2 back
     * as cable-2, we re-inject, infinite loop → crash). */
    const routeIsMove = S.trackRoute[t] === 1;

    /* Channel filter. When the cable-2 remap is active for a ROUTE_MOVE track the
     * shim rewrites the channel byte before we see it — messages arrive on
     * trackChannel[t], not their original channel. Filter against the remapped
     * channel so we don't accidentally drop them. */
    if (S.extMidiRemapActive && routeIsMove) {
        if (msgCh !== S.trackChannel[t]) return;
    } else {
        if (S.midiInChannel !== 0 && msgCh !== S.midiInChannel) return;
    }

    /* Drum track: route by pitch to lanes; skip melodic step assignment */
    if (S.trackPadMode[t] === deps.padModeDrum) {
        if (msgType === 0x90 && d2 > 0) {
            const vel = deps.effectiveVelocity(d2);
            S.lastPadVelocity = vel;
            if (!routeIsMove) deps.liveSendNote(t, 0x90, d1, vel);
            const isSeqEcho = routeIsMove && S.seqActiveNotes.has(d1);
            const isRec = !isSeqEcho && isActivelyRecordingTrack(S, t);
            if (isRec) {
                const recLane = S.drumLaneNote[t].indexOf(d1);
                enqueueDrumRecNoteOn(S, deps.drumRecNoteOns, t, d1, vel, recLane);
            }
            deps.extHeldNotes.set(d1, { track: t, recording: isRec });
        } else if (msgType === 0x80 || (msgType === 0x90 && d2 === 0)) {
            const info = deps.extHeldNotes.get(d1);
            const noteTrack = info ? info.track : t;
            if (S.trackRoute[noteTrack] !== 1) deps.liveSendNote(noteTrack, 0x80, d1, 0);
            if (info && info.recording && isActivelyRecording(S))
                enqueueDrumRecNoteOff(deps.drumRecNoteOffs, noteTrack, d1);
            deps.extHeldNotes.delete(d1);
        } else if (msgType === 0xB0 || msgType === 0xD0 || msgType === 0xA0 || msgType === 0xE0) {
            if (!routeIsMove) deps.liveSendNote(t, msgType, d1, d2);
        }
        return;
    }

    if (msgType === 0x90 && d2 > 0) {
        const vel = deps.effectiveVelocity(d2);
        S.lastPlayedNote  = d1;
        S.lastPadVelocity = vel;
        if (!routeIsMove) deps.liveSendNote(t, 0x90, d1, vel);
        /* ROUTE_MOVE: sequencer inject echoes come back here on cable-2. Skip recording
         * for pitches the sequencer is already S.playing — those are echoes, not keyboard input.
         * Preserve any existing recording-active entry so the keyboard gate isn't overwritten. */
        const isSeqEcho = routeIsMove && S.seqActiveNotes.has(d1);
        const isRec = !isSeqEcho && isActivelyRecordingTrack(S, t);
        if (isRec) deps.recordNoteOn(d1, vel, t);
        const prevInfo = deps.extHeldNotes.get(d1);
        if (!prevInfo || !prevInfo.recording || !isSeqEcho) {
            deps.extHeldNotes.set(d1, { track: t, recording: isRec });
        }
        if (S.heldStep >= 0 && !S.shiftHeld && !S.sessionView) {
            deps.melodicStepNoteAssignment(
                d1,
                vel,
                { replaceAutoAssigned: true }
            );
        }
    } else if (msgType === 0x80 || (msgType === 0x90 && d2 === 0)) {
        const info = deps.extHeldNotes.get(d1);
        const noteTrack = info ? info.track : t;
        if (S.trackRoute[noteTrack] !== 1) deps.liveSendNote(noteTrack, 0x80, d1, 0);
        if (info && info.recording) deps.recordNoteOff(d1);
        deps.extHeldNotes.delete(d1);
    } else if (msgType === 0xB0 || msgType === 0xD0 || msgType === 0xA0 || msgType === 0xE0) {
        if (!routeIsMove) deps.liveSendNote(t, msgType, d1, d2);
    }
}
