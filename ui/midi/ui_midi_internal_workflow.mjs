/* Internal MIDI message gate/router.
 *
 * This module intentionally owns only dispatch ordering and swallow/consume
 * rules. Behavior-heavy handlers (knob touch, pads, CC workflows) stay behind
 * deps so ui.js can keep the existing thin wrapper names while tests lock down
 * return-sensitive MIDI routing. */

export function handleUiMidiInternalMessage(S, deps, data) {
    const status = data[0] | 0;
    const d1     = (data[1] ?? 0) | 0;
    const d2     = (data[2] ?? 0) | 0;
    const msg    = status & 0xF0;

    /* Pad pressure must run before the generic noise filter, which drops 0xA0. */
    if (msg === 0xA0) {
        if (d1 >= deps.trackPadBase && d1 < deps.trackPadBase + 32)
            deps.onPadAftertouch(d1, d2);
        return;
    }
    if (deps.isNoiseMessage(data)) return;

    /* Move-native master volume and its touch are passthrough-only. */
    if (msg === 0xB0 && d1 === 79) return;
    if ((msg === 0x90 || msg === 0x80) && d1 === 8) return;

    if (S.deleteTapArmed && (status & 0x80) &&
            !(msg === 0xB0 && d1 === deps.moveDelete))
        S.deleteTapArmed = false;

    if (S.snapshotPicker) {
        const ccPick = msg === 0xB0 &&
            (d1 === 3 || d1 === deps.moveMainKnob || d1 === deps.moveNoteSession);
        if (!ccPick) return;
    }

    if (S.clearAutoMenu) {
        if (msg === 0xB0 && d2 === 127 &&
                (d1 === deps.moveNoteSession || d1 === deps.moveDelete)) {
            deps.closeClearAutoMenu();
            return;
        }
        const ccMenu = msg === 0xB0 && (d1 === 3 || d1 === deps.moveMainKnob);
        if (!ccMenu) return;
    }

    if (S.sessionOverlayHeld) {
        const isRelease = status === 0xB0 && d1 === deps.moveNoteSession && d2 === 0;
        const isScroll  = status === 0xB0 &&
            (d1 === deps.moveUp || d1 === deps.moveDown) && d2 === 127;
        if (!isRelease && !isScroll) return;
    }

    if (d1 >= 0 && d1 <= 9 && (msg === 0x90 || msg === 0x80)) {
        deps.onKnobTouch(status, d1, d2);
        return;
    }

    if (status === 0xB0) {
        deps.onCc(d1, d2);
        return;
    }

    if (msg === 0x90 && d1 >= 16 && d1 <= 31 && d2 > 0) {
        deps.onStepButtons(d1, d2);
        return;
    }

    if (msg === 0x90 && d2 > 0) {
        deps.onPadPress(status, d1, d2);
        return;
    }

    if (msg === 0x80 || (msg === 0x90 && d2 === 0)) {
        deps.onPadRelease(status, d1, d2);
        return;
    }
}
