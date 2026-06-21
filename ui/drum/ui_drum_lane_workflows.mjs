import {
    copyDrumRepeatGrooveMirrors,
    moveDrumRepeatGrooveMirrors,
    resetDrumRepeatGrooveMirrorsForLane
} from './ui_drum_repeat_workflows.mjs';
import { scheduleDrumLaneResync } from '../core/ui_state.mjs';
import { enqueueDspOperation } from '../sync/ui_dsp_operation_queue.mjs';

/* Copy active clip's lane srcLane to dstLane (same track, preserves dst midi_note). */
export function copyDrumLaneImpl(S, deps, t, srcLane, dstLane) {
    if (srcLane === dstLane) return;
    if (typeof deps.host_module_set_param !== 'function') return;
    S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
    enqueueDspOperation(S, { key: 't' + t + '_l' + srcLane + '_copy_to', val: String(dstLane) });
    const steps = S.drumLaneSteps[t];
    for (let s = 0; s < 256; s++) steps[dstLane][s] = steps[srcLane][s];
    S.drumLaneHasNotes[t][dstLane] = S.drumLaneHasNotes[t][srcLane];
    if (S.drumLaneHasNotes[t][srcLane]) S.drumClipNonEmpty[t][S.trackActiveClip[t]] = true;
    copyDrumRepeatGrooveMirrors(S, t, srcLane, dstLane);
    scheduleDrumLaneResync(S, t, dstLane, 2);
}

/* Cut active clip's lane srcLane into dstLane (copy then clear src). */
export function cutDrumLaneImpl(S, deps, t, srcLane, dstLane) {
    if (srcLane === dstLane) return;
    if (typeof deps.host_module_set_param !== 'function') return;
    S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
    enqueueDspOperation(S, { key: 't' + t + '_l' + srcLane + '_cut_to', val: String(dstLane) });
    const steps = S.drumLaneSteps[t];
    for (let s = 0; s < 256; s++) { steps[dstLane][s] = steps[srcLane][s]; steps[srcLane][s] = '0'; }
    S.drumLaneHasNotes[t][dstLane] = S.drumLaneHasNotes[t][srcLane];
    S.drumLaneHasNotes[t][srcLane] = false;
    let anyHits = false;
    for (let l = 0; l < deps.DRUM_LANES; l++) if (S.drumLaneHasNotes[t][l]) { anyHits = true; break; }
    S.drumClipNonEmpty[t][S.trackActiveClip[t]] = anyHits;
    moveDrumRepeatGrooveMirrors(S, t, srcLane, dstLane);
    scheduleDrumLaneResync(S, t, dstLane, 2);
}

/* Copy all 32 lanes of drum_clips[srcC] on srcT to drum_clips[dstC] on dstT; preserve dst midi_notes. */
export function copyDrumClipImpl(S, deps, srcT, srcC, dstT, dstC) {
    if (srcT === dstT && srcC === dstC) return;
    if (typeof deps.host_module_set_param !== 'function') return;
    S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
    enqueueDspOperation(S, { key: 'drum_clip_copy', val: `${srcT} ${srcC} ${dstT} ${dstC}` });
    S.drumClipNonEmpty[dstT][dstC] = S.drumClipNonEmpty[srcT][srcC];
    if (dstC === S.trackActiveClip[dstT]) { S.pendingDrumResync = 2; S.pendingDrumResyncTrack = dstT; }
}

/* Cut all 32 lanes of drum_clips[srcC] on srcT into drum_clips[dstC] on dstT; undo dst only. */
export function cutDrumClipImpl(S, deps, srcT, srcC, dstT, dstC) {
    if (srcT === dstT && srcC === dstC) return;
    if (typeof deps.host_module_set_param !== 'function') return;
    S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
    enqueueDspOperation(S, { key: 'drum_clip_cut', val: `${srcT} ${srcC} ${dstT} ${dstC}` });
    S.drumClipNonEmpty[dstT][dstC] = S.drumClipNonEmpty[srcT][srcC];
    S.drumClipNonEmpty[srcT][srcC] = false;
    if (srcC === S.trackActiveClip[srcT]) {
        for (let l = 0; l < deps.DRUM_LANES; l++) {
            for (let s = 0; s < 256; s++) S.drumLaneSteps[srcT][l][s] = '0';
            S.drumLaneHasNotes[srcT][l] = false;
        }
        S.drumLaneLength[srcT] = 16;
        S.drumLaneTPS[srcT] = 24;
    }
    if (dstC === S.trackActiveClip[dstT]) { S.pendingDrumResync = 2; S.pendingDrumResyncTrack = dstT; }
}

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

    scheduleDrumLaneResync(S, track, lane, 2);

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
