/* Modifier / mode buttons split out of _onCC_buttons.
 *
 * handleUiCaptureButton — Capture button (CC 52). Press tracks held state and
 *   cancels any in-flight dialog/picker/merge (symmetric with Sample's press);
 *   a bare-tap release opens the scene-bake picker (Session View) or the
 *   clip-bake confirm (Track View), unless Capture was used as a modifier
 *   (Capture+row scene capture, Capture+pad drum-lane select).
 *
 * Handlers take everything via deps so they can be unit-tested without the host. */

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
