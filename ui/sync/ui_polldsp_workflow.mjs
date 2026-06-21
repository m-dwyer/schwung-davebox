/* DSP reconcile pipeline split out of pollDSP().
 *
 * UNLIKE every other ui_*_workflow.mjs (which decompose a CC/pad DISPATCH
 * ladder of independent, context-guarded, early-returning handlers), pollDSP is
 * a fixed-order RECONCILE PIPELINE: once per POLL_INTERVAL ticks it reads DSP
 * state (via get_param / shadow_corun_state) and writes the JS mirror `S`, in a
 * load-bearing sequence. Each function here is therefore an ORDERED STEP, not a
 * returning handler — there is no "return true to consume" semantics. Every step
 * runs unconditionally; correctness comes from preserving the call order. The
 * thin pollDSP() wrapper in ui.js delegates to the orchestrator here, which keeps the three early-return guards
 * (no get_param, no snapshot, short snapshot) and threads two cross-block locals:
 * the parsed snapshot array `v` (to the three snapshot steps) and
 * countInDspActive (pollSnapshotClipStates -> pollCountInEnd).
 *
 * TICK/RENDER CONTEXT ONLY: every get_param here returns null if called from
 * onMidiMessage; pollDSP is only ever invoked from the tick path. The single
 * set_param emitter is pollTransportTransitions (tN_launch_clip) — kept exactly
 * as the original (one direct call + one pendingDefaultSetParams push) so the
 * audio-buffer coalescing behavior is unchanged.
 *
 * The prev/pending state machines keep their capture-before-update ordering
 * intra-step: _prevMergeState is captured before S.dspMergeState is overwritten
 * (pollMergeStateMachine), S.countInDspPrev is set at the end of pollCountInEnd,
 * and S.playingPrev is set at the end of pollTransportTransitions.
 *
 * Steps take everything via deps so they can be unit-tested without the host. */

import { queueFocusedClipLaunchOperation } from './ui_transport_dsp_operations.mjs';

export function pollDspWorkflow(S, deps) {
    /* Block A runs BEFORE the get_param guard (uses shadow_corun_state, not get_param). */
    pollCoRunReconcile(S, deps);
    if (!deps.getParam) return;
    pollAutomationAtIndicator(S, deps);
    const snap = deps.getParam('state_snapshot');
    if (!snap) return;
    const v = snap.split(' ');
    if (v.length < 53) return;
    pollSnapshotTracks(S, deps, v);
    const countInDspActive = pollSnapshotClipStates(S, deps, v);
    pollMergeStateMachine(S, deps, v);
    pollDeferredBankRefresh(S, deps);
    pollPlayheadPads(S, deps);
    pollSeqFollowPage(S, deps);
    pollRecordPendingPage(S, deps);
    pollCountInEnd(S, deps, countInDspActive);
    pollTransportTransitions(S, deps);
    pollStepLedRefresh(S, deps);
    pollSeqActiveNotes(S, deps);
    pollDeferredSave(S, deps);
}

/* Block A — Co-run state reconcile against SHM. Runs BEFORE the get_param guard
 * in the orchestrator. The shim auto-clears co-run on user Back press (framework
 * exit gesture), so Overture may discover target=NONE here without having driven
 * the exit itself. The exit helpers are idempotent on the second SHM write and
 * carry the palette/LED-cache/modifier-clear work we need either way. */
export function pollCoRunReconcile(S, deps) {
    if (deps.corunState) {
        const _st = deps.corunState();
        const _slot  = (_st && _st.target === deps.corunChainEdit)  ? _st.id : -1;
        const _track = (_st && _st.target === deps.corunMoveNative) ? _st.id : -1;
        if (_slot < 0 && S.schwungCoRunSlot >= 0) {
            deps.exitSchwungCoRun();
            /* Framework exit also closes any global menu we opened to launch it. */
            S.globalMenuOpen = false;
            S.lastSentMenuEditValue = null;
        }
        if (_track < 0 && S.moveCoRunTrack >= 0) {
            deps.exitMoveNativeCoRun();
        }
    }
}

/* Block B — Keep the AUTOMATION-bank AT indicator live (it appears as you record). */
export function pollAutomationAtIndicator(S, deps) {
    if (S.activeBank === 6 && S.trackPadMode[S.activeTrack] !== deps.padModeDrum) {
        const _at = S.activeTrack, _ac = deps.effectiveClip(_at);
        const _ah = deps.getParam('t' + _at + '_c' + _ac + '_at_has');
        if (_ah !== null) S.clipAtHas[_at][_ac] = (parseInt(_ah, 10) === 1);
    }
}

/* Block D — per-track current step / active clip / queued clip from snapshot. */
export function pollSnapshotTracks(S, deps, v) {
    S.playing = (v[0] === '1');
    for (let t = 0; t < deps.numTracks; t++) {
        const newStep = parseInt(v[1 + t], 10) | 0;
        S.trackCurrentStep[t] = newStep;
        if (S.playing) {
            const newClip = parseInt(v[9 + t], 10) | 0;
            S.trackActiveClip[t] = newClip;
            if (newClip !== S.lastDspActiveClip[t]) {
                S.lastDspActiveClip[t] = newClip;
                deps.refreshPerClipBankParams(t);
                if (S.trackPadMode[t] === deps.padModeDrum) {
                    deps.syncDrumLanesMeta(t);
                    deps.syncDrumLaneSteps(t, S.activeDrumLane[t]);
                }
            }
        }
        const _newQ = parseInt(v[17 + t], 10) | 0;
        if (_newQ !== S.trackQueuedClip[t]) S.screenDirty = true;
        S.trackQueuedClip[t]  = _newQ;
    }
}

/* Block E — per-track clip playing / will-relaunch / pending-page-stop.
 * Returns countInDspActive (consumed later by pollCountInEnd). */
export function pollSnapshotClipStates(S, deps, v) {
    const countInDspActive = (v[25] === '1');
    for (let t = 0; t < deps.numTracks; t++) {
        const _newPlaying  = (v[26 + t] === '1');
        const _newWR       = (v[34 + t] === '1');
        if (_newPlaying !== S.trackClipPlaying[t] || _newWR !== S.trackWillRelaunch[t]) {
            S.screenDirty = true;
        }
        S.trackClipPlaying[t]     = _newPlaying;
        S.trackWillRelaunch[t]    = _newWR;
        S.trackPendingPageStop[t] = (v[42 + t] === '1');
    }
    return countInDspActive;
}

/* Block F — flash flags, master position, looper state, and the merge state
 * machine. Kept as one step so _prevMergeState is captured BEFORE S.dspMergeState
 * is overwritten (two-tick phase ordering). */
export function pollMergeStateMachine(S, deps, v) {
    S.flashEighth    = (v[50] === '1');
    S.flashSixteenth = (v[51] === '1');
    if (v.length >= 54) S.masterPos      = (parseInt(v[53], 10) | 0) >>> 0;
    if (v.length >= 55) S.dspLooperState  = parseInt(v[54], 10) | 0;
    const _prevMergeState = S.dspMergeState;
    if (v.length >= 56) S.dspMergeState   = parseInt(v[55], 10) | 0;
    /* Arm confirmation: no longer fails on "no empty slot" — placement is
     * deferred until the user picks a row, so arm always succeeds. */
    if (S.pendingMergeArm) S.pendingMergeArm = false;
    /* Capture-done transition: DSP went into CAPTURED (4) — show placement
     * dialog so the user can tap a row to commit. */
    if (_prevMergeState !== 4 && S.dspMergeState === 4) {
        S.pendingMergePlacement = true;
        S.screenDirty = true;
    }
    /* Placement complete: DSP transitioned CAPTURED→IDLE (merge_place_row
     * fired and committed clips). Re-read ALL clips from DSP — any of the 8
     * tracks may have just received fresh notes at the placement row. The
     * full re-read also rebuilds clipSteps/clipNonEmpty mirrors so the
     * Session-View overview lights the newly-populated clip pads. */
    if (_prevMergeState !== 0 && S.dspMergeState === 0) {
        deps.setButtonLED(deps.moveSample, deps.ledOff);
        if (_prevMergeState === 2) deps.showActionPopup('MAX LENGTH', 'REACHED');
        deps.syncClipsFromDsp();
        S.screenDirty = true;
    }
}

/* Block G — Deferred bank refresh after bake. */
export function pollDeferredBankRefresh(S, deps) {
    if (S.pendingBankRefresh >= 0) {
        deps.refreshPerClipBankParams(S.pendingBankRefresh);
        S.pendingBankRefresh = -1;
        S.screenDirty = true;
    }
}

/* Block H — Drum/melodic playhead poll for the active track. */
export function pollPlayheadPads(S, deps) {
    /* Drum playhead: poll active lane's current step for active drum track */
    if (S.trackPadMode[S.activeTrack] === deps.padModeDrum) {
        const _dl = S.activeDrumLane[S.activeTrack];
        const _dcRaw = deps.getParam('t' + S.activeTrack + '_l' + _dl + '_current_step');
        if (_dcRaw !== null) {
            const _newDcs = parseInt(_dcRaw, 10) | 0;
            if (_newDcs !== S.drumCurrentStep[S.activeTrack]) {
                S.drumCurrentStep[S.activeTrack] = _newDcs;
                S.screenDirty = true;
            }
        }
        /* Drum SeqFollow: auto-page to follow playhead */
        if (S.playing && S.trackClipPlaying[S.activeTrack] && S.clipSeqFollow[S.activeTrack][deps.effectiveClip(S.activeTrack)]) {
            const _dcs = S.drumCurrentStep[S.activeTrack];
            if (_dcs >= 0) {
                const _newPage = Math.floor(_dcs / 16);
                if (_newPage !== S.drumStepPage[S.activeTrack]) {
                    S.drumStepPage[S.activeTrack] = _newPage;
                    S.screenDirty = true;
                }
            }
        }
        /* M blink: keep screen dirty while any lane is muted so blink animates */
        if (S.drumLaneMute[S.activeTrack]) S.screenDirty = true;
        /* Drum pad flash + S.seqActiveNotes: poll which lanes are hitting (single bitmask call) */
        if (S.playing && S.trackClipPlaying[S.activeTrack]) {
            const _maskRaw = deps.getParam('t' + S.activeTrack + '_drum_active_lanes');
            if (_maskRaw !== null) {
                const _mask = parseInt(_maskRaw, 10) | 0;
                S.seqActiveNotes.clear(); /* refresh per poll; stale entries block external recording */
                for (let _fl = 0; _fl < deps.drumLanes; _fl++) {
                    if (_mask & (1 << _fl)) {
                        S.drumLaneFlashTick[S.activeTrack][_fl] = S.tickCount;
                        S.seqActiveNotes.add(S.drumLaneNote[S.activeTrack][_fl]);
                        S.screenDirty = true;
                    }
                }
            }
        }
    } else {
        /* TARP held-buffer mirror: poll DSP buffer for active melodic track when
         * latch + style are both on so source pads light up. Cleared when either
         * is off (style=0 silences the engine — pad lighting follows suit). Drives
         * only pad LEDs (updateTrackLEDs reads .has() each tick) — no OLED
         * dependency so no screenDirty needed here. */
        const _tat = S.activeTrack;
        const _tLatch = (S.bankParams[_tat][5][7] | 0) !== 0 &&
                        (S.bankParams[_tat][5][0] | 0) !== 0;
        if (_tLatch) {
            const _hRaw = deps.getParam('t' + _tat + '_tarp_held');
            const _set = S.tarpHeldNotes[_tat];
            _set.clear();
            if (_hRaw) {
                const _parts = _hRaw.split(' ');
                for (let _i = 0; _i < _parts.length; _i++) {
                    const _p = parseInt(_parts[_i], 10);
                    if (_p >= 0 && _p <= 127) _set.add(_p);
                }
            }
        } else if (S.tarpHeldNotes[_tat].size > 0) {
            S.tarpHeldNotes[_tat].clear();
        }
    }
}

/* Block I — SeqFollow: auto-page S.activeTrack to follow playhead. */
export function pollSeqFollowPage(S, deps) {
    if (S.playing) {
        const _sft = S.activeTrack;
        const _sfac = deps.effectiveClip(_sft);
        if (S.clipSeqFollow[_sft][_sfac] && S.trackClipPlaying[_sft]) {
            var newPage;
            if (S.activeBank === 6 && S.trackPadMode[_sft] !== deps.padModeDrum) {
                var _ccLsf = S.ccActiveLane[_sft];
                var _dispTpsSf = S.ccLaneTps[_sft][_sfac][_ccLsf] || (S.clipTPS[_sft][_sfac] || 24);
                var _lTpsSf = S.ccLaneResTps[_sft][_sfac][_ccLsf] || _dispTpsSf;
                var _effLenSf = S.ccLaneLength[_sft][_sfac][_ccLsf] || S.clipLength[_sft][_sfac];
                var _lLenTicksSf = _effLenSf * _lTpsSf;
                var _progressSf = (S.masterPos % _lLenTicksSf) / _lLenTicksSf;
                var _laneStep = Math.floor(_progressSf * _effLenSf);
                newPage = Math.floor(_laneStep / 16);
            } else {
                var _cs = S.trackCurrentStep[_sft];
                if (_cs >= 0) newPage = Math.floor(_cs / 16);
            }
            if (newPage !== undefined && newPage !== S.trackCurrentPage[_sft]) {
                S.trackCurrentPage[_sft] = newPage;
                S.screenDirty = true;
            }
        }
    }
}

/* Block J — Record-arm pending page boundary: DSP defers recording=1 to next bar.
 * Clear S.recordPendingPage once DSP has fired (recording_pending_page=0). */
export function pollRecordPendingPage(S, deps) {
    if (S.recordPendingPage && S.recordArmedTrack >= 0 && deps.getParam) {
        const _rpp = deps.getParam('t' + S.recordArmedTrack + '_recording_pending_page');
        if (_rpp === '0') S.recordPendingPage = false;
    }
}

/* Block K — Count-in end: DSP fired transport+recording — sync JS state. */
export function pollCountInEnd(S, deps, countInDspActive) {
    if (S.countInDspPrev && !countInDspActive && S.playing) {
        S.recordCountingIn    = false;
        S.countInStartTick    = -1;
        S.countInQuarterTicks = 0;
    }
    S.countInDspPrev = countInDspActive;
}

/* Block L — Transport transitions (start / stop). The ONLY set_param emitter in
 * the poll: tN_launch_clip via one direct call (record-arm path) plus one
 * pendingDefaultSetParams push (focused-clip path) — kept exactly as the original
 * so audio-buffer coalescing is unchanged. S.playingPrev is updated LAST. */
export function pollTransportTransitions(S, deps) {
    if (!S.playingPrev && S.playing) {
        S.transportStartTick = S.tickCount;
        /* Focused-clip-by-default on transport start: only the clip the user
         * is currently *viewing* in Track View auto-launches. Session View
         * launches whatever is already queued — explicit launch by the user.
         * The "focused" concept is single-clip: the one open for editing on
         * the active track in Track View; other tracks aren't focused and
         * shouldn't auto-launch (otherwise Session-View Delete+Play to
         * deactivate everything would be undone by the next transport start). */
        if (!S.sessionView) {
            const _at = S.activeTrack;
            if (!S.trackClipPlaying[_at]
                    && !S.trackWillRelaunch[_at]
                    && S.trackQueuedClip[_at] === -1
                    && deps.focusedClipIsEmpty(_at)) {
                const _tac = S.trackActiveClip[_at];
                queueFocusedClipLaunchOperation(S, _at, _tac);
            }
        }
        /* Auto-launch focused clip if record is armed and clip is inactive */
        if (S.recordArmed) {
            const _rT  = S.recordArmedTrack >= 0 ? S.recordArmedTrack : S.activeTrack;
            const _rAc = S.trackActiveClip[_rT];
            if (S.clipNonEmpty[_rT][_rAc] &&
                    !S.trackClipPlaying[_rT] &&
                    !S.trackWillRelaunch[_rT] &&
                    S.trackQueuedClip[_rT] !== _rAc) {
                if (deps.setParam)
                    deps.setParam('t' + _rT + '_launch_clip', String(_rAc));
                S.trackQueuedClip[_rT] = _rAc;
            }
            /* Adaptive mode for count-in path: enter if clip was empty with no manual length */
            if (!S.clipAdaptiveMode[_rT][_rAc]) {
                const _isDrumAdapt = S.trackPadMode[_rT] === deps.padModeDrum;
                if (_isDrumAdapt ? (!S.drumClipNonEmpty[_rT][_rAc] && !S.drumLaneLengthManuallySet[_rT])
                                 : (!S.clipNonEmpty[_rT][_rAc] && !S.clipLengthManuallySet[_rT][_rAc]))
                    S.clipAdaptiveMode[_rT][_rAc] = true;
            }
        }
    }
    if (S.playingPrev  && !S.playing) {
        deps.disarmRecord();
        /* Transport stop unlatches TARP + Rpt1 + Rpt2 on every track so
         * latched chords/lanes don't drone with transport dead. Shared
         * helper queues the per-track set_params one-per-tick via
         * pendingDefaultSetParams to avoid same-buffer coalescing. */
        deps.unlatchAllTracks(S, deps.numTracks);
    }
    S.playingPrev = S.playing;
}

/* Block M — Refresh step LEDs while recording or holding a step
 * (nudge may move note across boundary). */
export function pollStepLedRefresh(S, deps) {
    if ((S.recordArmed && S.playing) || S.heldStep >= 0) {
        const rt = S.activeTrack;
        const rac = deps.effectiveClip(rt);
        const bulk = deps.getParam('t' + rt + '_c' + rac + '_steps');
        if (bulk && bulk.length >= deps.numSteps) {
            for (let rs = 0; rs < deps.numSteps; rs++)
                S.clipSteps[rt][rac][rs] = bulk[rs] === '1' ? 1 : (bulk[rs] === '2' ? 2 : 0);
            S.clipNonEmpty[rt][rac] = deps.clipHasContent(rt, rac);
            S.screenDirty = true;
        }
    }
}

/* Block N — Track sequencer notes for active track pad highlighting. */
export function pollSeqActiveNotes(S, deps) {
    const t  = S.activeTrack;
    const ac = S.trackActiveClip[t];
    const cs = S.trackCurrentStep[t];
    if (!S.playing) {
        S.seqActiveNotes.clear();
        S.seqLastStep = -1;
        S.seqLastClip = -1;
        S.seqNoteOnClipTick = -1;
        S.seqNoteGateTicks  = 0;
    } else if (cs !== S.seqLastStep || ac !== S.seqLastClip) {
        const newHasNote = cs >= 0 && S.clipSteps[t][ac][cs] === 1;
        /* Check whether the previous note's gate is still sounding before clearing */
        let prevStillSounding = false;
        if (!newHasNote && S.seqActiveNotes.size > 0 &&
                S.seqNoteOnClipTick >= 0 && S.seqNoteGateTicks > 0 && ac === S.seqLastClip) {
            const ctChk = deps.getParam('t' + t + '_current_clip_tick');
            if (ctChk !== null && ctChk !== undefined) {
                const ctv      = parseInt(ctChk, 10) | 0;
                const clipTks  = S.clipLength[t][ac] * (S.clipTPS[t][ac] || 24);
                const elapsed  = ctv >= S.seqNoteOnClipTick
                    ? ctv - S.seqNoteOnClipTick
                    : clipTks - S.seqNoteOnClipTick + ctv;
                prevStillSounding = elapsed < S.seqNoteGateTicks;
            }
        }
        S.seqLastStep = cs;
        S.seqLastClip = ac;
        if (newHasNote) {
            /* New step has a note — show it, replacing any sustaining previous note */
            S.seqActiveNotes.clear();
            S.seqNoteOnClipTick = -1;
            S.seqNoteGateTicks  = 0;
            const raw = deps.getParam('t' + t + '_c' + ac + '_step_' + cs + '_notes');
            if (raw && raw.trim().length > 0) {
                raw.trim().split(' ').forEach(function(sn) {
                    const pitch = parseInt(sn, 10);
                    if (pitch >= 0 && pitch <= 127) S.seqActiveNotes.add(pitch);
                });
            }
            const ctStr = deps.getParam('t' + t + '_current_clip_tick');
            const gStr  = deps.getParam('t' + t + '_c' + ac + '_step_' + cs + '_gate');
            if (ctStr !== null && ctStr !== undefined) S.seqNoteOnClipTick = parseInt(ctStr, 10) | 0;
            if (gStr  !== null && gStr  !== undefined) S.seqNoteGateTicks  = parseInt(gStr,  10) | 0;
        } else if (!prevStillSounding) {
            /* New step empty, previous note expired — clear */
            S.seqActiveNotes.clear();
            S.seqNoteOnClipTick = -1;
            S.seqNoteGateTicks  = 0;
        }
        /* else: prevStillSounding — keep old notes + gate tracking across empty step */
    } else if (S.seqActiveNotes.size > 0 && S.seqNoteOnClipTick >= 0 && S.seqNoteGateTicks > 0) {
        const ctStr = deps.getParam('t' + t + '_current_clip_tick');
        if (ctStr !== null && ctStr !== undefined) {
            const ct = parseInt(ctStr, 10) | 0;
            const clipTicks = S.clipLength[t][ac] * (S.clipTPS[t][ac] || 24);
            const elapsed = ct >= S.seqNoteOnClipTick
                ? ct - S.seqNoteOnClipTick
                : clipTicks - S.seqNoteOnClipTick + ct;
            if (elapsed >= S.seqNoteGateTicks) {
                S.seqActiveNotes.clear();
                S.seqNoteOnClipTick = -1;
                S.seqNoteGateTicks  = 0;
            }
        }
    }
}

/* Block O — Deferred DSP state save: fetch state_full (DSP serializes only when
 * dirty) and write the sidecar. Must remain the LAST step. */
export function pollDeferredSave(S, deps) {
    if (deps.writeFile && S.currentSetUuid) {
        const _st = deps.getParam('state_full');
        if (_st && _st.length > 2) {
            deps.writeFile(deps.uuidToStatePath(S.currentSetUuid), _st);
            deps.updateNameIndex();
        }
    }
}
