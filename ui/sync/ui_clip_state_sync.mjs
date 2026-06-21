import { DRUM_LANES, NUM_CLIPS, NUM_STEPS, NUM_TRACKS, PAD_MODE_DRUM, TPS_VALUES } from '../core/ui_constants.mjs';
import {
    readDrumActiveLaneFromDsp,
    readTargetedClipRestorePairFromDsp
} from './ui_clip_track_sync.mjs';
import { queueRestoredPerfModsOperation } from './ui_restore_dsp_operations.mjs';
import { uuidToUiStatePath } from '../persist/ui_persistence.mjs';

/* Immediately refresh S.seqActiveNotes for the given step if it is the current
 * sequencer position on the active track -- call after any step state change. */
export function refreshSeqNotesIfCurrentImpl(S, deps, t, ac, absIdx) {
    if (absIdx !== S.trackCurrentStep[t] || ac !== S.trackActiveClip[t]) return;
    S.seqActiveNotes.clear();
    S.seqLastStep = -1;
    S.seqNoteOnClipTick = -1;
    if (S.clipSteps[t][ac][absIdx] && deps.getParam) {
        const r = deps.getParam('t' + t + '_c' + ac + '_step_' + absIdx + '_notes');
        if (r && r.trim().length > 0)
            r.trim().split(' ').forEach(function(sn) {
                const p = parseInt(sn, 10);
                if (p >= 0 && p <= 127) S.seqActiveNotes.add(p);
            });
    }
}

export function syncMuteSoloFromDspImpl(S, deps) {
    if (!deps.getParam) return;
    const muteStr = deps.getParam('mute_state');
    const soloStr = deps.getParam('solo_state');
    if (muteStr) for (let _t = 0; _t < NUM_TRACKS; _t++) S.trackMuted[_t]  = muteStr[_t]  === '1';
    if (soloStr) for (let _t = 0; _t < NUM_TRACKS; _t++) S.trackSoloed[_t] = soloStr[_t] === '1';
    for (let _n = 0; _n < 16; _n++) {
        const snap = deps.getParam('snap_' + _n);
        if (snap && snap.length >= 17) {
            S.snapshots[_n] = {
                mute: Array.from(snap.substring(0, 8)).map(function(c) { return c === '1'; }),
                solo: Array.from(snap.substring(9, 17)).map(function(c) { return c === '1'; })
            };
        } else {
            S.snapshots[_n] = null;
        }
    }
    const saRaw = deps.getParam('scale_aware');
    if (saRaw !== null && saRaw !== undefined) S.scaleAware = saRaw === '1' ? 1 : 0;
    S.screenDirty = true;
}

export function restoreUiSidecarImpl(S, deps, applyDefaultsNow) {
    const uiSp = uuidToUiStatePath(S.currentSetUuid);
    let us = null;
    if (deps.readFile && deps.fileExists && deps.fileExists(uiSp)) {
        try { us = JSON.parse(deps.readFile(uiSp)); } catch (e) {}
    }
    if (us && us.v >= 1) {
        if (typeof us.at === 'number' && us.at >= 0 && us.at < NUM_TRACKS)
            S.activeTrack = us.at;
        if (Array.isArray(us.ac)) {
            for (let _t = 0; _t < NUM_TRACKS; _t++) {
                const _c = us.ac[_t];
                if (typeof _c === 'number' && _c >= 0 && _c < NUM_CLIPS)
                    S.trackActiveClip[_t] = _c;
            }
        }
        S.sessionView = us.sv === 1;
        if (Array.isArray(us.dl)) {
            for (let _t = 0; _t < NUM_TRACKS; _t++) {
                const _l = us.dl[_t];
                if (typeof _l === 'number' && _l >= 0 && _l < DRUM_LANES)
                    deps.setActiveDrumLane(_t, _l);
            }
        }
        /* Bundle 2C-Rpt2: re-push drum_lane_page mirror after DSP
         * create_instance reset. Not sidecar-persisted, but JS state may
         * be non-zero if the user paged off-zero before the set-switch
         * that triggered this restore. Unconditional push (the setter
         * would early-return on matching values, missing the post-reset
         * DSP=0 case). */
        if (deps.setParam) {
            for (let _t = 0; _t < NUM_TRACKS; _t++)
                deps.setParam('t' + _t + '_drum_lane_page', String(S.drumLanePage[_t]));
        }
        if (typeof us.bm === 'number') S.beatMarkersEnabled = us.bm !== 0;
        if (us.v >= 2) {
            if (typeof us.pm === 'number') S.perfModsToggled = us.pm & 0xFFFFFF;
            S.perfLatchMode = us.lm === 1;
            if (typeof us.rs === 'number' && us.rs >= 0 && us.rs < 16) {
                S.perfRecalledSlot = us.rs;
                if (Array.isArray(us.us)) {
                    for (let _i = 0; _i < 8; _i++) {
                        if (typeof us.us[_i] === 'number')
                            S.perfSnapshots[8 + _i] = us.us[_i];
                    }
                }
            }
            const _pm = S.perfModsToggled | S.perfModsHeld;
            if (_pm) queueRestoredPerfModsOperation(S, _pm);
        }
        /* us.ss (per-track Schwung slot) is obsolete -- the co-run slot is now
         * derived from each slot's receive channel at entry time, so old sidecars'
         * ss is ignored and no longer written. */
        if (us.v >= 5 && Array.isArray(us.dva)) {
            for (let _t = 0; _t < NUM_TRACKS; _t++)
                S.drumVelZoneArmed[_t] = us.dva[_t] === true;
        }
        if (us.v >= 6 && Array.isArray(us.dleu)) {
            for (let _t = 0; _t < NUM_TRACKS; _t++) {
                const _row = us.dleu[_t];
                if (!Array.isArray(_row)) continue;
                for (let _l = 0; _l < DRUM_LANES; _l++) {
                    const _n = _row[_l];
                    S.drumLaneEuclidN[_t][_l] = (typeof _n === 'number' && _n >= 0) ? (_n | 0) : 0;
                }
            }
        }
        if (us.v >= 7 && Array.isArray(us.to)) {
            for (let _t = 0; _t < NUM_TRACKS; _t++) {
                const _o = us.to[_t];
                if (typeof _o === 'number')
                    S.trackOctave[_t] = Math.max(-4, Math.min(4, _o | 0));
            }
        }
        if (us.v >= 8 && Array.isArray(us.tab)) {
            for (let _t = 0; _t < NUM_TRACKS; _t++) {
                const _b = us.tab[_t];
                S.trackActiveBank[_t] = (typeof _b === 'number' && _b >= 0 && _b <= 7) ? (_b | 0) : 0;
            }
            /* Sync live mirror to the restored active track. Subsequent
             * post-restore validity checks (e.g. hide bank 7 on melodic) still
             * apply because activeBank is a regular live variable from here on. */
            S.activeBank = S.trackActiveBank[S.activeTrack] | 0;
            if (S.activeBank === 7) S.allLanesConfirmed = false;
        }
        if (us.v >= 9 && Array.isArray(us.am)) {
            for (let _t = 0; _t < NUM_TRACKS; _t++) {
                const _m = us.am[_t];
                S.trackAtMode[_t] = (typeof _m === 'number' && _m >= 0 && _m <= 2) ? (_m | 0) : 0;
            }
        }
        if (Array.isArray(us.pchr)) {
            for (let _t = 0; _t < NUM_TRACKS; _t++)
                S.padLayoutChromatic[_t] = !!us.pchr[_t];
        }
    } else {
        S.scaleAware   = 1;
        S.metronomeVol = 100;
        S.trackPadMode[0] = PAD_MODE_DRUM;
        /* Sync t0's drum lane data + drumClipNonEmpty from the freshly-reset
         * DSP. syncClipsFromDsp already ran earlier in the post-DSP-sync
         * drain, but its drum-sync block was gated on JS trackPadMode==DRUM,
         * which was MELODIC at the time (doClearSession reset it). Without
         * this catch-up, S.drumClipNonEmpty[0] + drum lane meta retain pre-
         * Clear values and t1's session/drum pad LEDs render stale. */
        if (applyDefaultsNow && deps.getParam) {
            deps.syncDrumClipContent(0);
            deps.syncDrumLanesMeta(0);
            deps.syncDrumLaneSteps(0, S.activeDrumLane[0] | 0);
        }
        if (applyDefaultsNow) {
            S.pendingDefaultSetParams = [
                { key: 'scale_aware', val: '1' },
                { key: 'metro_vol',   val: '100' },
                { key: 't0_pad_mode', val: String(PAD_MODE_DRUM) }
            ];
        }
    }
}

export function syncClipsFromDspImpl(S, deps) {
    if (!deps.getParam) return;
    for (let t = 0; t < NUM_TRACKS; t++) {
        for (let c = 0; c < NUM_CLIPS; c++) {
            const bulk = deps.getParam('t' + t + '_c' + c + '_steps');
            if (bulk && bulk.length >= NUM_STEPS) {
                for (let s = 0; s < NUM_STEPS; s++)
                    S.clipSteps[t][c][s] = bulk[s] === '1' ? 1 : 0;
                S.clipNonEmpty[t][c] = deps.clipHasContent(t, c);
            }
            const len = deps.getParam('t' + t + '_c' + c + '_length');
            if (len !== null && len !== undefined)
                S.clipLength[t][c] = parseInt(len, 10) || 16;
            const ls = deps.getParam('t' + t + '_c' + c + '_loop_start');
            if (ls !== null && ls !== undefined)
                S.clipLoopStart[t][c] = parseInt(ls, 10) | 0;
            const tpsRaw = deps.getParam('t' + t + '_c' + c + '_tps');
            if (tpsRaw !== null && tpsRaw !== undefined) {
                const tpsVal = parseInt(tpsRaw, 10);
                S.clipTPS[t][c] = TPS_VALUES.indexOf(tpsVal) >= 0 ? tpsVal : 24;
            }
            var ccll = deps.getParam('t' + t + '_c' + c + '_cc_lane_loops');
            if (ccll) {
                var _vals = ccll.split(' ');
                for (var _k = 0; _k < 8 && _k * 4 + 3 < _vals.length; _k++) {
                    S.ccLaneLoopStart[t][c][_k] = parseInt(_vals[_k * 4], 10) | 0;
                    S.ccLaneLength[t][c][_k]    = parseInt(_vals[_k * 4 + 1], 10) | 0;
                    S.ccLaneTps[t][c][_k]       = parseInt(_vals[_k * 4 + 2], 10) | 0;
                    S.ccLaneResTps[t][c][_k]    = parseInt(_vals[_k * 4 + 3], 10) | 0;
                }
            }
        }
        const ac2 = deps.getParam('t' + t + '_active_clip');
        if (ac2 !== null && ac2 !== undefined) {
            S.trackActiveClip[t] = parseInt(ac2, 10) | 0;
            S.lastDspActiveClip[t] = S.trackActiveClip[t];
        }
        const po = deps.getParam('t' + t + '_pad_octave');
        if (po !== null && po !== undefined) S.padOctave[t] = parseInt(po, 10) | 0;
        deps.readTrackConfig(t);
        for (let b = 0; b < 7; b++) deps.readBankParams(t, b);
        deps.readTarpStepVel(t);
        deps.readDrumRepeatRates(t);
        /* Drum track: sync clip content flags and active lane data */
        if (S.trackPadMode[t] === PAD_MODE_DRUM) {
            readDrumActiveLaneFromDsp(S, {
                syncDrumClipContent: deps.syncDrumClipContent,
                syncDrumLanesMeta: deps.syncDrumLanesMeta,
                syncDrumLaneSteps: deps.syncDrumLaneSteps,
                refreshDrumLaneBankParams: deps.refreshDrumLaneBankParams
            }, t);
        }
        /* Clamp the visible page into the (possibly non-zero) window so that
         * the step LEDs aren't stuck at absolute page 0 on session load when
         * the active clip has a loop_start > 0. */
        {
            const _ac = S.trackActiveClip[t];
            const _ls = (S.trackPadMode[t] === PAD_MODE_DRUM)
                ? (S.drumLaneLoopStart[t] | 0)
                : (S.clipLoopStart[t][_ac] | 0);
            const _ln = (S.trackPadMode[t] === PAD_MODE_DRUM)
                ? (S.drumLaneLength[t] | 0)
                : (S.clipLength[t][_ac] | 0);
            if (_ln > 0) {
                const _startPage = Math.floor(_ls / 16);
                const _lastPage  = Math.floor((_ls + _ln - 1) / 16);
                if (S.trackCurrentPage[t] < _startPage || S.trackCurrentPage[t] > _lastPage)
                    S.trackCurrentPage[t] = _startPage;
            }
        }
    }
    const kp = deps.getParam('key');
    if (kp !== null && kp !== undefined) S.padKey   = parseInt(kp, 10) | 0;
    const sp = deps.getParam('scale');
    if (sp !== null && sp !== undefined) S.padScale = parseInt(sp, 10) | 0;
    const lqp = deps.getParam('launch_quant');
    if (lqp !== null && lqp !== undefined) S.launchQuant = parseInt(lqp, 10) | 0;
    const iqp = deps.getParam('inp_quant');
    if (iqp !== null && iqp !== undefined) S.inpQuant = iqp === '1';
    const micp = deps.getParam('midi_in_channel');
    if (micp !== null && micp !== undefined) S.midiInChannel = parseInt(micp, 10) | 0;
    const monRaw = deps.getParam('metro_on');
    if (monRaw !== null && monRaw !== undefined) {
        S.metronomeOn = parseInt(monRaw, 10) | 0;
        if (S.metronomeOn !== 0) S.metronomeOnLast = S.metronomeOn;
    }
    const mvolRaw = deps.getParam('metro_vol');
    if (mvolRaw !== null && mvolRaw !== undefined) S.metronomeVol = parseInt(mvolRaw, 10) | 0;
    const swaRaw = deps.getParam('swing_amt');
    if (swaRaw !== null && swaRaw !== undefined) S.swingAmt = parseInt(swaRaw, 10) | 0;
    const swrRaw = deps.getParam('swing_res');
    if (swrRaw !== null && swrRaw !== undefined) S.swingRes = parseInt(swrRaw, 10) | 0;
}

/* Targeted re-sync after undo/redo: re-read only the affected clips rather than all 64.
 * infoStr format: "d t c" (drum) or "m t0 c0 t1 c1 ..." (melodic, 1-16 pairs).
 * Falls back to full syncClipsFromDsp() if infoStr is missing or unparseable. */
export function syncClipsTargetedImpl(S, deps, infoStr) {
    if (!infoStr || !deps.getParam) { syncClipsFromDspImpl(S, deps); return; }
    const parts = infoStr.split(' ');
    if (parts.length < 3) { syncClipsFromDspImpl(S, deps); return; }
    const isDrum = parts[0] === 'd';
    let i = 1;
    /* Parse melodic/drum pairs, stopping at any 'DR' token */
    while (i + 1 < parts.length) {
        if (parts[i] === 'DR') break;
        const t = parseInt(parts[i], 10), c = parseInt(parts[i + 1], 10);
        i += 2;
        if (t < 0 || t >= NUM_TRACKS || c < 0 || c >= NUM_CLIPS) continue;
        readTargetedClipRestorePairFromDsp(S, {
            host_module_get_param: deps.getParam,
            NUM_STEPS,
            TPS_VALUES,
            clipHasContent: deps.clipHasContent,
            refreshPerClipBankParams: deps.refreshPerClipBankParams,
            syncDrumClipContent: deps.syncDrumClipContent,
            syncDrumLanesMeta: deps.syncDrumLanesMeta,
            syncDrumLaneSteps: deps.syncDrumLaneSteps,
            refreshDrumLaneBankParams: deps.refreshDrumLaneBankParams
        }, t, c, isDrum);
    }
    /* Parse 'DR rowN' tokens -- resync drum clip content for all tracks at those rows */
    while (i + 1 < parts.length) {
        if (parts[i] !== 'DR') { i += 2; continue; }
        const rowIdx = parseInt(parts[i + 1], 10);
        i += 2;
        if (rowIdx < 0 || rowIdx >= NUM_CLIPS) continue;
        for (let t2 = 0; t2 < NUM_TRACKS; t2++) {
            if (rowIdx === S.trackActiveClip[t2]) {
                readDrumActiveLaneFromDsp(S, {
                    syncDrumClipContent: deps.syncDrumClipContent,
                    syncDrumLanesMeta: deps.syncDrumLanesMeta,
                    syncDrumLaneSteps: deps.syncDrumLaneSteps,
                    refreshDrumLaneBankParams: deps.refreshDrumLaneBankParams
                }, t2);
            } else {
                deps.syncDrumClipContent(t2);
            }
        }
    }
    S.screenDirty = true;
}
