import {
    resetDrumRepeatGrooveMirrorsForLane
} from './ui_drum_repeat_workflows.mjs';

export function handleDrumLaneFactoryReset(S, deps, track, lane) {
    if (lane < 0 || lane >= deps.DRUM_LANES) return false;

    S.undoAvailable = true;
    S.redoAvailable = false;
    S.undoSeqArpSnapshot = null;

    if (typeof deps.host_module_set_param === 'function')
        deps.host_module_set_param('t' + track + '_l' + lane + '_hard_reset', '1');

    deps.setActiveDrumLane(track, lane);

    S.drumLaneLength[track] = 16;
    for (let step = 0; step < 256; step++) S.drumLaneSteps[track][lane][step] = '0';
    S.drumLaneHasNotes[track][lane] = false;
    resetDrumRepeatGrooveMirrorsForLane(S, track, lane);

    const activeClip = S.trackActiveClip[track];
    S.drumClipNonEmpty[track][activeClip] = false;
    for (let otherLane = 0; otherLane < deps.DRUM_LANES; otherLane++) {
        if (S.drumLaneHasNotes[track][otherLane]) {
            S.drumClipNonEmpty[track][activeClip] = true;
            break;
        }
    }

    S.pendingDrumLaneResync = 2;
    S.pendingDrumLaneResyncTrack = track;
    S.pendingDrumLaneResyncLane = lane;

    deps.showActionPopup('LANE', 'RESET');
    deps.forceRedraw();
    return true;
}

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

export function handleDrumLaneMuteSolo(S, deps, track, lane) {
    if (lane < 0 || lane >= deps.DRUM_LANES) return false;

    S.muteUsedAsModifier = true;
    const bit = 1 << lane;

    if (S.shiftHeld) {
        const wasOn = !!(S.drumLaneSolo[track] & bit);
        if (wasOn) {
            S.drumLaneSolo[track] &= ~bit;
        } else {
            S.drumLaneSolo[track] |= bit;
            if (S.drumLaneMute[track] & bit) {
                S.drumLaneMute[track] &= ~bit;
                if (typeof deps.host_module_set_param === 'function')
                    deps.host_module_set_param('t' + track + '_l' + lane + '_mute', '0');
            }
        }
        if (typeof deps.host_module_set_param === 'function')
            deps.host_module_set_param('t' + track + '_l' + lane + '_solo', wasOn ? '0' : '1');
    } else {
        const wasOn = !!(S.drumLaneMute[track] & bit);
        if (wasOn) {
            S.drumLaneMute[track] &= ~bit;
        } else {
            S.drumLaneMute[track] |= bit;
            if (S.drumLaneSolo[track] & bit) {
                S.drumLaneSolo[track] &= ~bit;
                if (typeof deps.host_module_set_param === 'function')
                    deps.host_module_set_param('t' + track + '_l' + lane + '_solo', '0');
            }
        }
        if (typeof deps.host_module_set_param === 'function')
            deps.host_module_set_param('t' + track + '_l' + lane + '_mute', wasOn ? '0' : '1');
    }

    deps.forceRedraw();
    return true;
}

export function handleDrumLaneCopyPaste(S, deps, track, lane) {
    if (lane < 0 || lane >= deps.DRUM_LANES) return false;

    if (!S.copySrc) {
        S.copySrc = S.shiftHeld
            ? { kind: 'cut_drum_lane', track: track, lane: lane }
            : { kind: 'drum_lane',     track: track, lane: lane };
        deps.invalidateLEDCache();
        deps.showActionPopup(S.shiftHeld ? 'CUT' : 'COPIED');
        return true;
    }

    if (S.copySrc.kind === 'drum_lane' && S.copySrc.track === track) {
        deps.copyDrumLane(track, S.copySrc.lane, lane);
        deps.setActiveDrumLane(track, lane);
        deps.refreshDrumLaneBankParams(track, lane);
        deps.invalidateLEDCache();
        deps.forceRedraw();
        deps.showActionPopup('PASTED');
        return true;
    }

    if (S.copySrc.kind === 'cut_drum_lane' && S.copySrc.track === track) {
        deps.cutDrumLane(track, S.copySrc.lane, lane);
        S.copySrc = { kind: 'drum_lane', track: track, lane: lane };
        deps.setActiveDrumLane(track, lane);
        deps.refreshDrumLaneBankParams(track, lane);
        deps.invalidateLEDCache();
        deps.forceRedraw();
        deps.showActionPopup('PASTED');
        return true;
    }

    return true;
}
