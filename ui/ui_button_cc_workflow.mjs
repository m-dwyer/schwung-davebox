/* Modifier / mode buttons split out of _onCC_buttons.
 *
 * handleUiCaptureButton — Capture button (CC 52). Press tracks held state and
 *   cancels any in-flight dialog/picker/merge (symmetric with Sample's press);
 *   a bare-tap release opens the scene-bake picker (Session View) or the
 *   clip-bake confirm (Track View), unless Capture was used as a modifier
 *   (Capture+row scene capture, Capture+pad drum-lane select).
 *
 * Handlers take everything via deps so they can be unit-tested without the host. */

export function handleUiShiftButton(S, deps, d1, d2) {
    if (d1 !== deps.moveShift) return;

    S.shiftHeld = d2 === 127;
    S.shiftTrackLEDActive = d2 === 127;
    /* PHASE-1: re-push padmap on Shift transitions so DSP on_midi sees
     * all-0xFF while Shift is held (suppress pad-shortcut notes) and
     * the real map again on release. See computePadNoteMap mute logic. */
    deps.computePadNoteMap();
    if (!S.shiftHeld && S.jogTouched) S.jogTouched = false;
    /* Deferred Shift+Step3 dispatch: fire on Shift release so the Shift
     * held state doesn't leak into Move firmware / Schwung chain editor. */
    if (!S.shiftHeld && S.pendingEditEntryTrack >= 0) {
        const _t = S.pendingEditEntryTrack;
        S.pendingEditEntryTrack = -1;
        deps.editSoundForTrack(_t);
    }
    if (!S.sessionView) deps.forceRedraw();
}

export function handleUiDeleteButton(S, deps, d1, d2) {
    if (d1 !== deps.moveDelete) return false;

    S.deleteHeld = d2 === 127;
    /* Loop+Delete on auto bank: reset active lane's loop params */
    if (d2 === 127 && S.loopHeld && S.activeBank === 6 &&
            S.trackPadMode[S.activeTrack] !== deps.padModeDrum && !S.sessionView) {
        var _rdt = S.activeTrack, _rdac = deps.effectiveClip(_rdt), _rdl = S.ccActiveLane[_rdt];
        S.ccLaneLoopStart[_rdt][_rdac][_rdl] = 0;
        S.ccLaneLength[_rdt][_rdac][_rdl] = 0;
        S.ccLaneTps[_rdt][_rdac][_rdl] = 0;
        S.ccLaneResTps[_rdt][_rdac][_rdl] = 0;
        S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
        S.pendingDefaultSetParams.push({ key: 't' + _rdt + '_c' + _rdac + '_k' + _rdl + '_cc_lane_reset', val: '1' });
        deps.showActionPopup('LANE LOOP', 'RESET');
        deps.forceRedraw();
        deps.computePadNoteMap();
        return true;
    }
    /* AUTO-bank Delete-tap → CLEAR AUTOMATION menu. Arm on press (melodic
     * AUTO bank only); a clean release (nothing happened while held, see the
     * disqualify check at the top of this handler) opens the menu. */
    if (d2 === 127) {
        S.deleteTapArmed = (S.activeBank === 6 && !S.sessionView &&
                            S.trackPadMode[S.activeTrack] !== deps.padModeDrum &&
                            !S.clearAutoMenu);
    } else if (S.deleteTapArmed) {
        S.deleteTapArmed = false;
        deps.openClearAutoMenu();
    }
    /* delete_held now rides as the 35th token in the tN_padmap payload
     * (computePadNoteMap), so it shares the tick-based self-heal and
     * avoids the onMidiMessage coalescing risk the old separate
     * t0_delete_held push had. */
    deps.computePadNoteMap();
    return false;
}

export function handleUiCopyButton(S, deps, d1, d2) {
    if (d1 !== deps.moveCopy) return;

    S.copyHeld = d2 === 127;
    if (!S.copyHeld) {
        S.copySrc = null;
        deps.invalidateLEDCache();
    }
    deps.computePadNoteMap();
}

export function handleUiMuteModifierButton(S, deps, d1, d2) {
    if (d1 !== deps.moveMute) return;

    /* Modifier-state tracking for the Mute button. The action half (clear-all,
     * per-track mute/solo toggle) lives in handleUiMuteButton on the transport
     * handler; both fire for the same CC. */
    S.muteHeld = d2 === 127;
    if (d2 === 127) S.muteUsedAsModifier = false;
    if (S.sessionView) deps.invalidateLEDCache();
    deps.computePadNoteMap();
}

export function handleUiCaptureButton(S, deps, d1, d2) {
    if (d1 !== deps.moveCapture) return;

    if (d2 === 127) {
        S.captureHeld           = true;
        S.captureUsedAsModifier = false;
        /* Press also cancels in-flight dialogs/pickers/merge — symmetric with
         * Sample's press behavior. */
        if (S.pendingSceneBakePicker) { S.pendingSceneBakePicker = false; S.captureUsedAsModifier = true; }
        if (S.pendingMergePlacement)  {
            S.pendingMergePlacement = false;
            S.captureUsedAsModifier = true;
            S.pendingDefaultSetParams.push({ key: 'merge_cancel', val: '1' });
        }
        if (S.confirmBake)            { S.confirmBake            = false; S.captureUsedAsModifier = true;
                                        S.confirmBakeDrumLoopOpen = false; S.confirmBakeWrapPhase = false; }
        if (S.confirmBakeScene)       { S.confirmBakeScene       = false; S.captureUsedAsModifier = true; }
        deps.computePadNoteMap();
        deps.forceRedraw();
    } else {
        S.captureHeld = false;
        /* Bare-tap release: open clip-bake (Track View) or scene-bake picker
         * (Session View). Suppressed when Capture was used as a modifier
         * (scene capture via Capture+row, drum-lane select via Capture+pad). */
        if (!S.captureUsedAsModifier) {
            if (S.sessionView) {
                S.pendingSceneBakePicker = true;
                S.screenDirty = true;
            } else {
                const _bt = S.activeTrack, _bc = S.trackActiveClip[_bt];
                const _isDrum = S.trackPadMode[_bt] === deps.padModeDrum;
                S.confirmBake             = true;
                S.confirmBakeIsDrum       = _isDrum;
                S.confirmBakeIsMultiLoop  = !_isDrum;
                S.confirmBakeSel          = _isDrum ? 2 : 1;
                S.confirmBakeTrack        = _bt;
                S.confirmBakeClip         = _bc;
                S.confirmBakeDrumLoopOpen = false;
                S.confirmBakeWrapPhase    = false;
                S.screenDirty             = true;
            }
        }
        deps.computePadNoteMap();
        deps.forceRedraw();
    }
}

export function handleUiMenuCoRunExitButton(S, deps, d1, d2) {
    if (d1 !== deps.moveMenu || d2 !== 127) return false;

    /* Schwung co-run exits on Menu. Move co-run disables Menu entirely —
     * swallowed by the guard in the MoveNoteSession block. Outside co-run
     * Overture ignores Menu (no other handler), so this is dormant unless a
     * Schwung session is active. */
    if (S.schwungCoRunSlot >= 0) {
        deps.exitSchwungCoRun();
        deps.forceRedraw();
        return true;
    }

    return false;
}
