export function handleDeleteDrumLaneClear(S, deps, track, lane, options = {}) {
    if (lane < 0 || lane >= deps.DRUM_LANES) return false;

    if (options.markUndo) {
        S.undoAvailable = true;
        S.redoAvailable = false;
        S.undoSeqArpSnapshot = null;
    }

    if (typeof deps.host_module_set_param === 'function')
        deps.host_module_set_param('t' + track + '_l' + lane + '_clear', '1');

    deps.setActiveDrumLane(track, lane);

    for (let s = 0; s < 256; s++) S.drumLaneSteps[track][lane][s] = '0';
    S.drumLaneHasNotes[track][lane] = false;

    const activeClip = S.trackActiveClip[track];
    S.drumClipNonEmpty[track][activeClip] = false;
    for (let otherLane = 0; otherLane < deps.DRUM_LANES; otherLane++) {
        if (S.drumLaneHasNotes[track][otherLane]) {
            S.drumClipNonEmpty[track][activeClip] = true;
            break;
        }
    }

    if (options.refreshBankParams)
        deps.refreshDrumLaneBankParams(track, lane);

    if (options.popupArgs && typeof deps.showActionPopup === 'function')
        deps.showActionPopup(...options.popupArgs);

    deps.forceRedraw();
    return true;
}
