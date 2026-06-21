/* ------------------------------------------------------------------ */
/* Clip / row / step clipboard + structural edit ops                   */
/* ------------------------------------------------------------------ */
/* Lift-and-shift of the clipboard-op cluster from ui.js: clearClip,
 * hardResetClip, copyClip, cutClip, copyRow, cutRow, copyStep, clearRow,
 * selectClipOnTrack, doDoubleFill. Each is a thin same-named wrapper in
 * ui.js over the *Impl exported here.
 *
 * COALESCING-SENSITIVE: these emit set_params either deferred via
 * S.pendingDefaultSetParams.push/unshift (drained one-per-tick) or directly
 * (selectClipOnTrack / doDoubleFill). The push/unshift placement + the direct
 * setParam calls are preserved byte-for-byte from the originals.
 *
 * Shared-module symbols imported directly; ui.js-local helpers (setParam +
 * the per-clip bank refresh/reset wrappers + forceRedraw) thread via deps. */

import {
    PAD_MODE_DRUM, DRUM_LANES, NUM_STEPS, NUM_TRACKS
} from '../core/ui_constants.mjs';
import { invalidateLEDCache } from '../render/ui_leds.mjs';
import { showActionPopup } from '../persist/ui_persistence.mjs';
import { scheduleDrumLaneResync } from '../core/ui_state.mjs';
import {
    enqueueDspOperation,
    enqueuePriorityDspOperation,
    holdDspOperationDrain
} from './ui_dsp_operation_queue.mjs';

/* deps: setParam, resetPerClipBankParamsToDefault, refreshPerClipBankParams,
 * forceRedraw, effectiveClip */

export function clearClipImpl(S, deps, t, ac, keepPlaying) {
    if (!deps.setParam) return;
    S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
    /* Clip CLEAR semantics (matches drum lane Clear, Group I): wipe step
     * note data only. Preserve length, loop window, ticks_per_step, the
     * destructive CLIP-bank params (stretch_exp / clock_shift_pos /
     * nudge_pos), and per-clip pfx (NOTE FX / HARMONY / DELAY / SEQUENCE
     * ARP). Hard Reset (Shift+Delete) is the gesture that wipes structure. */
    if (S.trackPadMode[t] === PAD_MODE_DRUM) {
        const keep = (keepPlaying && S.trackClipPlaying[t] && ac === S.trackActiveClip[t]) ? '1' : '0';
        enqueuePriorityDspOperation(S, { key: 't' + t + '_c' + ac + '_drum_clear', val: keep });
        holdDspOperationDrain(S, 1);
        for (let l = 0; l < DRUM_LANES; l++) {
            for (let s = 0; s < 256; s++) S.drumLaneSteps[t][l][s] = '0';
            S.drumLaneHasNotes[t][l] = false;
        }
        S.drumClipNonEmpty[t][ac] = false;
        if (ac === S.trackActiveClip[t]) {
            S.seqActiveNotes.clear();
        }
        return;
    }
    const cmd = (keepPlaying && S.trackClipPlaying[t] && ac === S.trackActiveClip[t])
        ? 't' + t + '_c' + ac + '_clear_keep'
        : 't' + t + '_c' + ac + '_clear';
    enqueuePriorityDspOperation(S, { key: cmd, val: '1' });
    /* Defer drain 1 tick to keep _clear out of the same audio buffer as any
     * sync set_param fan-out that might still be in flight. */
    holdDspOperationDrain(S, 1);
    const len = S.clipLength[t][ac];
    for (let s = 0; s < len; s++) S.clipSteps[t][ac][s] = 0;
    S.clipNonEmpty[t][ac] = false;
    /* Clip clear now also wipes all automation DSP-side — mirror it so the
     * AUTOMATION-bank indicators + CC values reflect the clear immediately. */
    S.trackCCAutoBits[t][ac] = 0;
    S.clipCCVal[t][ac] = new Array(8).fill(-1);
    S.clipAtHas[t][ac] = false;
    invalidateLEDCache();
    /* Re-read steps from DSP 2 ticks later so step LEDs catch up after _clear
     * has drained. Belt-and-suspenders against any state that still reads from
     * DSP after the synchronous JS mirror wipe. */
    S.pendingStepsReread      = 2;
    S.pendingStepsRereadTrack = t;
    S.pendingStepsRereadClip  = ac;
    if (ac === S.trackActiveClip[t]) {
        S.seqActiveNotes.clear(); S.seqLastStep = -1; S.seqNoteOnClipTick = -1;
        /* Focused-clip-by-default: after clearing the focused clip, ensure it
         * stays playing so the track doesn't go silent. If trackClipPlaying
         * was true we used _clear_keep (DSP preserves playback). If it was
         * false (e.g. clip hadn't auto-launched yet), re-launch now while
         * transport is playing so the cleared clip ticks through empty steps. */
        if (S.playing && !S.trackClipPlaying[t]
                && !S.trackWillRelaunch[t]
                && S.trackQueuedClip[t] === -1) {
            enqueueDspOperation(S, { key: 't' + t + '_launch_clip', val: String(ac) });
            S.trackQueuedClip[t] = ac;
        }
    }
}

/* Full factory reset: clip_init on DSP + JS mirror cleared. Track View only. */
export function hardResetClipImpl(S, deps, t, ac) {
    if (!deps.setParam) return;
    S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
    if (S.trackPadMode[t] === PAD_MODE_DRUM) {
        /* Drum clip reset: clip_init all 32 lanes; midi_note preserved */
        enqueuePriorityDspOperation(S, { key: 't' + t + '_c' + ac + '_drum_reset', val: '1' });
        holdDspOperationDrain(S, 1);
        for (let l = 0; l < DRUM_LANES; l++) {
            for (let s = 0; s < 256; s++) S.drumLaneSteps[t][l][s] = '0';
            S.drumLaneHasNotes[t][l] = false;
        }
        S.drumClipNonEmpty[t][ac] = false;
        S.clipLengthManuallySet[t][ac] = false;
        S.drumLaneLengthManuallySet[t]  = false;
        if (ac === S.trackActiveClip[t]) {
            S.drumLaneLength[t] = 16;
            S.drumLaneLoopStart[t] = 0;
            S.drumLaneTPS[t]    = 24;
            S.drumStepPage[t]   = 0;
            S.trackCurrentPage[t] = 0;
            S.seqActiveNotes.clear();
        }
        return;
    }
    enqueuePriorityDspOperation(S, { key: 't' + t + '_c' + ac + '_hard_reset', val: '1' });
    holdDspOperationDrain(S, 1);
    const defaultLen = 16;
    for (let s = 0; s < NUM_STEPS; s++) S.clipSteps[t][ac][s] = 0;
    S.clipLength[t][ac] = defaultLen;
    S.clipLoopStart[t][ac] = 0;
    S.clipNonEmpty[t][ac] = false;
    S.clipTPS[t][ac] = 24;
    S.clipLengthManuallySet[t][ac] = false;
    for (var _k = 0; _k < 8; _k++) {
        S.ccLaneLoopStart[t][ac][_k] = 0;
        S.ccLaneLength[t][ac][_k]    = 0;
        S.ccLaneTps[t][ac][_k]       = 0;
    }
    if (ac === S.trackActiveClip[t]) {
        S.trackCurrentPage[t] = 0;
        S.seqActiveNotes.clear(); S.seqLastStep = -1; S.seqNoteOnClipTick = -1;
        deps.resetPerClipBankParamsToDefault(t);
    }
}

/* Copy clip src→dst (single atomic DSP write, JS mirror update). */
export function copyClipImpl(S, deps, srcT, srcC, dstT, dstC) {
    if (srcT === dstT && srcC === dstC) return;
    if (!deps.setParam) return;
    S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
    enqueueDspOperation(S, { key: 'clip_copy', val: `${srcT} ${srcC} ${dstT} ${dstC}` });
    S.clipSteps[dstT][dstC] = S.clipSteps[srcT][srcC].slice();
    S.clipLength[dstT][dstC] = S.clipLength[srcT][srcC];
    S.clipLoopStart[dstT][dstC] = S.clipLoopStart[srcT][srcC];
    S.clipNonEmpty[dstT][dstC] = S.clipNonEmpty[srcT][srcC];
    S.clipTPS[dstT][dstC] = S.clipTPS[srcT][srcC];
    for (var _k = 0; _k < 8; _k++) {
        S.ccLaneLoopStart[dstT][dstC][_k] = S.ccLaneLoopStart[srcT][srcC][_k];
        S.ccLaneLength[dstT][dstC][_k]    = S.ccLaneLength[srcT][srcC][_k];
        S.ccLaneTps[dstT][dstC][_k]       = S.ccLaneTps[srcT][srcC][_k];
    }
    if (dstC === S.trackActiveClip[dstT]) {
        S.seqActiveNotes.clear(); S.seqLastStep = -1;
        deps.refreshPerClipBankParams(dstT);
    }
}

/* Cut clip: copy src→dst then hard-reset src (single atomic DSP write, JS mirror update). */
export function cutClipImpl(S, deps, srcT, srcC, dstT, dstC) {
    if (srcT === dstT && srcC === dstC) return;
    if (!deps.setParam) return;
    S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
    enqueueDspOperation(S, { key: 'clip_cut', val: `${srcT} ${srcC} ${dstT} ${dstC}` });
    S.clipSteps[dstT][dstC] = S.clipSteps[srcT][srcC].slice();
    S.clipLength[dstT][dstC] = S.clipLength[srcT][srcC];
    S.clipLoopStart[dstT][dstC] = S.clipLoopStart[srcT][srcC];
    S.clipNonEmpty[dstT][dstC] = S.clipNonEmpty[srcT][srcC];
    S.clipTPS[dstT][dstC] = S.clipTPS[srcT][srcC];
    for (var _k = 0; _k < 8; _k++) {
        S.ccLaneLoopStart[dstT][dstC][_k] = S.ccLaneLoopStart[srcT][srcC][_k];
        S.ccLaneLength[dstT][dstC][_k]    = S.ccLaneLength[srcT][srcC][_k];
        S.ccLaneTps[dstT][dstC][_k]       = S.ccLaneTps[srcT][srcC][_k];
    }
    if (dstC === S.trackActiveClip[dstT]) {
        S.seqActiveNotes.clear(); S.seqLastStep = -1;
        deps.refreshPerClipBankParams(dstT);
    }
    for (let s = 0; s < NUM_STEPS; s++) S.clipSteps[srcT][srcC][s] = 0;
    S.clipLength[srcT][srcC] = 16;
    S.clipLoopStart[srcT][srcC] = 0;
    S.clipNonEmpty[srcT][srcC] = false;
    S.clipTPS[srcT][srcC] = 24;
    for (var _k2 = 0; _k2 < 8; _k2++) {
        S.ccLaneLoopStart[srcT][srcC][_k2] = 0;
        S.ccLaneLength[srcT][srcC][_k2]    = 0;
        S.ccLaneTps[srcT][srcC][_k2]       = 0;
    }
    if (srcC === S.trackActiveClip[srcT]) {
        S.seqActiveNotes.clear(); S.seqLastStep = -1; S.seqNoteOnClipTick = -1;
        deps.resetPerClipBankParamsToDefault(srcT);
    }
}

/* Copy all 8 tracks for a scene row (single atomic DSP write, JS mirror update). */
export function copyRowImpl(S, deps, srcRow, dstRow) {
    if (srcRow === dstRow) return;
    if (!deps.setParam) return;
    S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
    S.pendingDefaultSetParams.push({ key: 'row_copy', val: `${srcRow} ${dstRow}` });
    for (let t = 0; t < NUM_TRACKS; t++) {
        S.clipSteps[t][dstRow] = S.clipSteps[t][srcRow].slice();
        S.clipLength[t][dstRow] = S.clipLength[t][srcRow];
        S.clipLoopStart[t][dstRow] = S.clipLoopStart[t][srcRow];
        S.clipNonEmpty[t][dstRow] = S.clipNonEmpty[t][srcRow];
        S.clipTPS[t][dstRow] = S.clipTPS[t][srcRow];
        S.drumClipNonEmpty[t][dstRow] = S.drumClipNonEmpty[t][srcRow];
        for (var _k = 0; _k < 8; _k++) {
            S.ccLaneLoopStart[t][dstRow][_k] = S.ccLaneLoopStart[t][srcRow][_k];
            S.ccLaneLength[t][dstRow][_k]    = S.ccLaneLength[t][srcRow][_k];
            S.ccLaneTps[t][dstRow][_k]       = S.ccLaneTps[t][srcRow][_k];
        }
        if (dstRow === S.trackActiveClip[t]) {
            S.seqActiveNotes.clear(); S.seqLastStep = -1;
            deps.refreshPerClipBankParams(t);
            if (S.trackPadMode[t] === PAD_MODE_DRUM) {
                S.pendingDrumResync = 2; S.pendingDrumResyncTrack = t;
            }
        }
    }
}

/* Cut row: copy all tracks src→dst then hard-reset src (single atomic DSP write, JS mirror update). */
export function cutRowImpl(S, deps, srcRow, dstRow) {
    if (srcRow === dstRow) return;
    if (!deps.setParam) return;
    S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
    S.pendingDefaultSetParams.push({ key: 'row_cut', val: `${srcRow} ${dstRow}` });
    for (let t = 0; t < NUM_TRACKS; t++) {
        S.clipSteps[t][dstRow] = S.clipSteps[t][srcRow].slice();
        S.clipLength[t][dstRow] = S.clipLength[t][srcRow];
        S.clipLoopStart[t][dstRow] = S.clipLoopStart[t][srcRow];
        S.clipNonEmpty[t][dstRow] = S.clipNonEmpty[t][srcRow];
        S.clipTPS[t][dstRow] = S.clipTPS[t][srcRow];
        S.drumClipNonEmpty[t][dstRow] = S.drumClipNonEmpty[t][srcRow];
        for (var _k = 0; _k < 8; _k++) {
            S.ccLaneLoopStart[t][dstRow][_k] = S.ccLaneLoopStart[t][srcRow][_k];
            S.ccLaneLength[t][dstRow][_k]    = S.ccLaneLength[t][srcRow][_k];
            S.ccLaneTps[t][dstRow][_k]       = S.ccLaneTps[t][srcRow][_k];
        }
        if (dstRow === S.trackActiveClip[t]) {
            S.seqActiveNotes.clear(); S.seqLastStep = -1;
            deps.refreshPerClipBankParams(t);
            if (S.trackPadMode[t] === PAD_MODE_DRUM) {
                S.pendingDrumResync = 2; S.pendingDrumResyncTrack = t;
            }
        }
        for (let s = 0; s < NUM_STEPS; s++) S.clipSteps[t][srcRow][s] = 0;
        S.clipLength[t][srcRow] = 16;
        S.clipLoopStart[t][srcRow] = 0;
        S.clipNonEmpty[t][srcRow] = false;
        S.clipTPS[t][srcRow] = 24;
        S.drumClipNonEmpty[t][srcRow] = false;
        for (var _k2 = 0; _k2 < 8; _k2++) {
            S.ccLaneLoopStart[t][srcRow][_k2] = 0;
            S.ccLaneLength[t][srcRow][_k2]    = 0;
            S.ccLaneTps[t][srcRow][_k2]       = 0;
        }
        if (srcRow === S.trackActiveClip[t]) {
            S.seqActiveNotes.clear(); S.seqLastStep = -1; S.seqNoteOnClipTick = -1;
            deps.resetPerClipBankParamsToDefault(t);
            if (S.trackPadMode[t] === PAD_MODE_DRUM) {
                S.pendingDrumResync = 2; S.pendingDrumResyncTrack = t;
            }
        }
    }
}

/* Copy step src→dst within same clip (single atomic DSP write, JS mirror update). */
export function copyStepImpl(S, deps, t, ac, srcAbs, dstAbs) {
    if (!deps.setParam) return;
    S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
    if (S.trackPadMode[t] === PAD_MODE_DRUM) {
        const lane = S.activeDrumLane[t];
        S.pendingDefaultSetParams.push({ key: 't' + t + '_l' + lane + '_step_' + srcAbs + '_copy_to', val: String(dstAbs) });
        S.drumLaneSteps[t][lane][dstAbs] = S.drumLaneSteps[t][lane][srcAbs];
        if (S.drumLaneSteps[t][lane][srcAbs] !== '0') S.drumLaneHasNotes[t][lane] = true;
        scheduleDrumLaneResync(S, t, lane, 2);
    } else {
        S.pendingDefaultSetParams.push({ key: 't' + t + '_c' + ac + '_step_' + srcAbs + '_copy_to', val: String(dstAbs) });
        S.clipSteps[t][ac][dstAbs] = S.clipSteps[t][ac][srcAbs];
        if (S.clipSteps[t][ac][srcAbs] !== 0) S.clipNonEmpty[t][ac] = true;
        S.pendingStepsReread      = 2;
        S.pendingStepsRereadTrack = t;
        S.pendingStepsRereadClip  = ac;
    }
}

/* Clear all 8 tracks for a scene row (single atomic DSP write, JS mirror update). */
export function clearRowImpl(S, deps, rowIdx) {
    if (!deps.setParam) return;
    S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
    S.pendingDefaultSetParams.push({ key: 'row_clear', val: String(rowIdx) });
    for (let t = 0; t < NUM_TRACKS; t++) {
        const len = S.clipLength[t][rowIdx];
        for (let s = 0; s < len; s++) S.clipSteps[t][rowIdx][s] = 0;
        S.clipNonEmpty[t][rowIdx] = false;
        S.drumClipNonEmpty[t][rowIdx] = false;
        S.clipLoopStart[t][rowIdx] = 0;
        if (rowIdx === S.trackActiveClip[t]) {
            S.seqActiveNotes.clear(); S.seqLastStep = -1;
            S.trackCurrentPage[t] = 0;
            if (S.trackPadMode[t] === PAD_MODE_DRUM) S.drumLaneLoopStart[t] = 0;
            deps.resetPerClipBankParamsToDefault(t);
            if (S.trackPadMode[t] === PAD_MODE_DRUM) {
                S.pendingDrumResync = 2; S.pendingDrumResyncTrack = t;
            }
        }
    }
}

/* Track-View clip select/launch/toggle for the Change #1 hold-reveal overlay.
 * This is the exact state machine that used to live inline in _onCC_side's
 * Track-View else-branch (before side buttons became track-select): re-launch a
 * pending-stop clip, arm stop-at-end on a playing active clip, cancel a queued/
 * relaunch clip, else focus + launch. Now reached by tapping a step while a side
 * button is held (S.revealClipsTrack). */
export function selectClipOnTrackImpl(S, deps, t, clipIdx) {
    const isActiveClip = S.trackActiveClip[t] === clipIdx;
    if (S.trackClipPlaying[t] && isActiveClip) {
        if (S.trackPendingPageStop[t]) {
            /* Pending stop → cancel by re-launching legato */
            if (deps.setParam)
                deps.setParam('t' + t + '_launch_clip', String(clipIdx));
        } else {
            /* Playing → arm stop at next page boundary */
            if (deps.setParam)
                deps.setParam('t' + t + '_stop_at_end', '1');
        }
    } else if (S.trackWillRelaunch[t] && isActiveClip) {
        /* Transport stopped, clip primed to restart → cancel */
        if (deps.setParam)
            deps.setParam('t' + t + '_deactivate', '1');
    } else if (S.trackQueuedClip[t] === clipIdx) {
        /* Queued to launch → cancel */
        if (deps.setParam)
            deps.setParam('t' + t + '_deactivate', '1');
    } else {
        /* Focus immediately so pads/OLED show the selected clip even while the
         * prior clip is still playing toward its legato switch boundary; pollDSP
         * keeps trackActiveClip in sync when DSP crosses the boundary. Page snaps
         * to the clip's loop_start page (drum: 0, refreshed by pendingDrumResync). */
        S.trackActiveClip[t]  = clipIdx;
        S.trackCurrentPage[t] = S.trackPadMode[t] === PAD_MODE_DRUM
            ? 0
            : Math.floor((S.clipLoopStart[t][clipIdx] | 0) / 16);
        deps.refreshPerClipBankParams(t);
        if (S.trackPadMode[t] === PAD_MODE_DRUM) {
            S.pendingDrumResync      = 2;
            S.pendingDrumResyncTrack = t;
        }
        if (deps.setParam)
            deps.setParam('t' + t + '_launch_clip', String(clipIdx));
    }
}

export function doDoubleFillImpl(S, deps) {
    const _t = S.activeTrack;
    if (S.trackPadMode[_t] === PAD_MODE_DRUM && S.activeBank === 7) {
        S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
        deps.setParam('t' + _t + '_all_lanes_double_fill', '1');
        S.pendingDrumResync = 2; S.pendingDrumResyncTrack = _t;
        showActionPopup('LOOP', 'DOUBLED');
        deps.forceRedraw();
    } else if (S.trackPadMode[_t] === PAD_MODE_DRUM) {
        const _l   = S.activeDrumLane[_t];
        const _len = S.drumLaneLength[_t];
        if (_len * 2 > 256) {
            showActionPopup('CLIP FULL');
        } else {
            S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
            deps.setParam('t' + _t + '_l' + _l + '_loop_double_fill', '1');
            S.drumLaneLength[_t] = _len * 2;
            S.pendingDrumResync      = 2;
            S.pendingDrumResyncTrack = _t;
            showActionPopup('LOOP', 'DOUBLED');
            deps.forceRedraw();
        }
    } else {
        const _ac  = deps.effectiveClip(_t);
        const _len = S.clipLength[_t][_ac];
        if (_len * 2 > 256) {
            showActionPopup('CLIP FULL');
        } else {
            S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
            if (deps.setParam)
                deps.setParam('t' + _t + '_loop_double_fill', '1');
            S.clipLength[_t][_ac] = _len * 2;
            S.pendingStepsReread      = 2;
            S.pendingStepsRereadTrack = _t;
            S.pendingStepsRereadClip  = _ac;
            deps.refreshPerClipBankParams(_t);
            showActionPopup('LOOP', 'DOUBLED');
            deps.forceRedraw();
        }
    }
}
