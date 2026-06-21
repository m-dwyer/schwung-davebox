/* ------------------------------------------------------------------ */
/* Parameter bank: read from DSP and write to DSP                      */
/* ------------------------------------------------------------------ */
/* Lift-and-shift of the param-bank read/write/reset cluster from ui.js:
 * resetPerClipBankParamsToDefault, resetFxBanks, resetSingleFxBank,
 * readBankParams, applyTrackConfig, applyBankParam. Each is a thin
 * same-named wrapper in ui.js over the *Impl exported here.
 *
 * COALESCING-SENSITIVE: the resets/applies are set_param emitters. The
 * deferred queue ordering (backed by S.pendingDefaultSetParams, incl. the
 * delay_level=127 re-queue that lands a tick after the pfx reset) and the
 * direct setParam calls are preserved from the originals.
 *
 * Shared-module symbols are imported directly; only ui.js-local helpers +
 * host get/set params thread through `deps`. */

import {
    BANKS, PAD_MODE_DRUM, NUM_CLIPS, TPS_VALUES, parseActionRaw
} from '../core/ui_constants.mjs';
import { CC_ASSIGN_DEFAULTS } from '../core/ui_state.mjs';
import { writeSidecar } from '../persist/ui_persistence.mjs';
import {
    routeCheckExpectedLabel,
    routeCheckNeedsWarning
} from '../core/ui_routes.mjs';
import {
    altIndicatorActiveImpl,
    bankHasAltParamsImpl
} from './ui_bank_state.mjs';
import { enqueueDspOperation } from '../sync/ui_dsp_operation_queue.mjs';

/* Per-clip banks: NOTE FX (2), HARMZ (3), SEQ ARP (4), MIDI DLY (5) */
const PER_CLIP_BANKS = [1, 2, 3, 4];

/* Reset per-clip S.bankParams to defaults for track t (no DSP call needed —
 * DSP already reset them; this just keeps JS mirrors in sync). */
export function resetPerClipBankParamsToDefaultImpl(S, deps, t) {
    for (let bi = 0; bi < PER_CLIP_BANKS.length; bi++) {
        const b = PER_CLIP_BANKS[bi];
        for (let k = 0; k < 8; k++) {
            const pm = BANKS[b].knobs[k];
            if (pm) S.bankParams[t][b][k] = pm.def;
        }
    }
    /* DSP self-resets pfx params to 0 on clip clear; defer non-zero JS defaults
     * onto the pendingDefaultSetParams queue so they land on a later tick and
     * don't coalesce with the clear set_param fired by the caller. */
    const _ac = S.trackActiveClip[t];
    enqueueDspOperation(S, {
        key: 't' + t + '_c' + _ac + '_pfx_set',
        val: 'delay_level 127'
    });
    S.screenDirty = true;
}

/* Reset NOTE FX, HARMZ, and MIDI DLY banks to DSP defaults for track t.
 * The pfx_reset push itself is deferred via pendingDefaultSetParams — when
 * called from a MIDI handler (jog click), a synchronous push competes with
 * the same-buffer MIDI delivery and is silently coalesced away, leaving DSP
 * with no reset despite the OLED reporting success. The delay_level=127
 * override is queued after the reset so it lands on a later tick (DSP zeros
 * delay_level during the reset). */
export function resetFxBanksImpl(S, deps, t) {
    if (!deps.setParam) return;
    S.undoAvailable = true; S.redoAvailable = false;
    if (S.trackPadMode[t] === PAD_MODE_DRUM) {
        const lane = S.activeDrumLane[t];
        enqueueDspOperation(S, { key: 't' + t + '_l' + lane + '_pfx_reset', val: '1' });
        enqueueDspOperation(S, {
            key: 't' + t + '_l' + lane + '_pfx_set',
            val: 'delay_level 127'
        });
    } else {
        enqueueDspOperation(S, { key: 't' + t + '_pfx_reset', val: '1' });
        const _ac = S.trackActiveClip[t];
        enqueueDspOperation(S, {
            key: 't' + t + '_c' + _ac + '_pfx_set',
            val: 'delay_level 127'
        });
        /* Reset SEQ ARP step params (step vel levels, per-step intervals,
         * loop length) — DSP-side clip_pfx_params_init handles these on
         * pfx_reset; mirror in JS so the overlay reflects defaults. */
        for (let s = 0; s < 8; s++) {
            S.seqArpStepVel[t][_ac][s] = 4;
            S.seqArpStepInt[t][_ac][s] = 0;
        }
        S.seqArpStepLoopLen[t][_ac] = 8;
    }
    const targets = [1, 2, 3, 4];
    for (let bi = 0; bi < targets.length; bi++) {
        const b = targets[bi];
        for (let k = 0; k < 8; k++) {
            const pm = BANKS[b].knobs[k];
            if (!pm) continue;
            S.bankParams[t][b][k] = pm.def;
        }
    }
    S.screenDirty = true;
}

export function resetSingleFxBankImpl(S, deps, t, bankIdx) {
    if (!deps.setParam) return;
    const dspCmd = { 1: 'pfx_noteFx_reset', 2: 'pfx_harm_reset', 3: 'pfx_delay_reset' }[bankIdx];
    if (!dspCmd) return;
    S.undoAvailable = true; S.redoAvailable = false;
    if (S.trackPadMode[t] === PAD_MODE_DRUM) {
        const lane = S.activeDrumLane[t];
        /* Defer the reset push (same coalescing concern as resetFxBanks). */
        enqueueDspOperation(S, { key: 't' + t + '_l' + lane + '_pfx_set', val: dspCmd + ' 1' });
        if (bankIdx === 3) {
            enqueueDspOperation(S, {
                key: 't' + t + '_l' + lane + '_pfx_set',
                val: 'delay_level 127'
            });
        }
    } else {
        enqueueDspOperation(S, { key: 't' + t + '_' + dspCmd, val: '1' });
        if (bankIdx === 3) {
            const _ac = S.trackActiveClip[t];
            enqueueDspOperation(S, {
                key: 't' + t + '_c' + _ac + '_pfx_set',
                val: 'delay_level 127'
            });
        }
    }
    for (let k = 0; k < 8; k++) {
        const pm = BANKS[bankIdx].knobs[k];
        if (!pm) continue;
        S.bankParams[t][bankIdx][k] = pm.def;
    }
    S.screenDirty = true;
}

/* Reset ARP IN (TARP, bank 5) for a melodic track to DSP defaults.
 * Issues a single tN_tarp_reset which the DSP handler resolves via
 * arp_init_defaults + held-buffer clear + silence. JS mirrors are
 * zeroed in parallel so the bank overview reflects defaults immediately. */
export function resetTarpImpl(S, deps, t) {
    if (!deps.setParam) return;
    S.undoAvailable = true; S.redoAvailable = false;
    enqueueDspOperation(S, { key: 't' + t + '_tarp_reset', val: '1' });
    for (let k = 0; k < 8; k++) {
        const pm = BANKS[5].knobs[k];
        if (pm) S.bankParams[t][5][k] = pm.def;
    }
    for (let s = 0; s < 8; s++) {
        S.tarpStepVel[t][s] = 4;
        S.tarpStepInt[t][s] = 0;
    }
    S.tarpStepLoopLen[t] = 8;
    S.tarpHeldNotes[t].clear();
    S.screenDirty = true;
}

function routeCheckWarnForTrackImpl(deps, t) {
    if (routeCheckNeedsWarning(t))
        deps.showActionPopup('ROUTE CHECK', routeCheckExpectedLabel(t));
}

function createParameterBankDeps(deps) {
    return {
        ...deps.createHostParamAdapters(),
        hasShadowSetParam: deps.hasShadowSetParam(),
        refreshDrumLaneBankParams: deps.refreshDrumLaneBankParams,
        routeCheckWarnForTrack: function(t) { routeCheckWarnForTrackImpl(deps, t); },
        syncDrumLanesMeta: deps.syncDrumLanesMeta,
        syncDrumLaneSteps: deps.syncDrumLaneSteps,
        syncDrumClipContent: deps.syncDrumClipContent,
        computePadNoteMap: deps.computePadNoteMap,
        forceRedraw: deps.forceRedraw
    };
}

export function createParameterBankRuntime(S, deps) {
    function bankDeps() {
        return createParameterBankDeps(deps);
    }
    return {
        resetPerClipBankParamsToDefault: function(t) {
            return resetPerClipBankParamsToDefaultImpl(S, bankDeps(), t);
        },
        resetFxBanks: function(t) {
            return resetFxBanksImpl(S, bankDeps(), t);
        },
        resetTarp: function(t) {
            return resetTarpImpl(S, bankDeps(), t);
        },
        resetSingleFxBank: function(t, bankIdx) {
            return resetSingleFxBankImpl(S, bankDeps(), t, bankIdx);
        },
        readBankParams: function(t, bankIdx) {
            return readBankParamsImpl(S, bankDeps(), t, bankIdx);
        },
        applyTrackConfig: function(t, key, val) {
            return applyTrackConfigImpl(S, bankDeps(), t, key, val);
        },
        applyBankParam: function(t, bankIdx, knobIdx, val) {
            return applyBankParamImpl(S, bankDeps(), t, bankIdx, knobIdx, val);
        },
        bankHasAltParams: function(t, bank) {
            return bankHasAltParamsImpl(S, t, bank);
        },
        altIndicatorActive: function(t, bank) {
            return altIndicatorActiveImpl(S, t, bank);
        }
    };
}

/* Read all wired params for bankIdx on track t from DSP into S.bankParams. */
export function readBankParamsImpl(S, deps, t, bankIdx) {
    if (!deps.getParam) return;
    /* Drum pfx banks (0, 1, 3): read via per-lane snapshot, not melodic keys */
    if (S.trackPadMode[t] === PAD_MODE_DRUM && (bankIdx === 0 || bankIdx === 1 || bankIdx === 3)) {
        deps.refreshDrumLaneBankParams(t, S.activeDrumLane[t]);
        return;
    }
    /* ARP OUT bank: seq_arp_* are set-only; read via per-clip pfx_snapshot */
    if (bankIdx === 4) {
        const ac   = S.trackActiveClip[t];
        const snap = deps.getParam('t' + t + '_c' + ac + '_pfx_snapshot');
        if (snap) {
            const v = snap.split(' ');
            if (v.length >= 24) {
                for (let k = 0; k < 7; k++) S.bankParams[t][4][k] = parseInt(v[17 + k], 10) | 0;
            }
        }
        return;
    }
    /* CC PARAM bank: read all 8 CC assignments + per-knob type from DSP */
    if (bankIdx === 6) {
        const raw = deps.getParam('t' + t + '_cc_assigns');
        if (raw) {
            const parts = raw.split(' ');
            for (let k = 0; k < 8; k++)
                S.trackCCAssign[t][k] = parseInt(parts[k], 10) || CC_ASSIGN_DEFAULTS[k];
        }
        const typs = deps.getParam('t' + t + '_cc_types');
        if (typs) {
            const tp = typs.split(' ');
            for (let k = 0; k < 8; k++) S.trackCCType[t][k] = parseInt(tp[k], 10) || 0;
        }
        /* Default Schwung-routed tracks to Sch1-8 when all lanes are at factory CC defaults.
         * Deferred one-per-tick via pendingDefaultSetParams to avoid coalescing. */
        if (S.trackRoute[t] === 0 && deps.hasShadowSetParam &&
                S.trackCCType[t].every(function(tp) { return tp === 0; })) {
            for (let k = 0; k < 8; k++) {
                S.trackCCType[t][k] = 2;
                S.trackCCAssign[t][k] = k + 1;
                S.schLabel[t][k] = null;
                enqueueDspOperation(S, {
                    key: 't' + t + '_cc_type_assign',
                    val: k + ' 2 ' + (k + 1)
                });
            }
        }
        for (let c = 0; c < NUM_CLIPS; c++) {
            const bits = deps.getParam('t' + t + '_c' + c + '_cc_auto_bits');
            S.trackCCAutoBits[t][c] = bits !== null ? (parseInt(bits, 10) || 0) : 0;
            /* Per-clip resting values ("—"=255 → -1). */
            const rest = deps.getParam('t' + t + '_c' + c + '_cc_rest');
            if (rest) {
                const rp = rest.split(' ');
                for (let k = 0; k < 8; k++) {
                    const rv = parseInt(rp[k], 10);
                    S.clipCCVal[t][c][k] = (rv >= 0 && rv <= 127) ? rv : -1;
                }
            }
            /* Aftertouch automation presence (for the AUTOMATION-bank indicator). */
            const ath = deps.getParam('t' + t + '_c' + c + '_at_has');
            S.clipAtHas[t][c] = (ath !== null && parseInt(ath, 10) === 1);
        }
        return;
    }
    const knobs = BANKS[bankIdx].knobs;
    for (let k = 0; k < 8; k++) {
        const pm = knobs[k];
        if (!pm || !pm.abbrev || pm.scope === 'stub') {
            S.bankParams[t][bankIdx][k] = pm ? pm.def : 0;
            continue;
        }
        if (pm.scope === 'seqfollow') {
            S.bankParams[t][bankIdx][k] = S.clipSeqFollow[t][S.trackActiveClip[t]] ? 1 : 0;
            continue;
        }
        if (pm.scope === 'clip') {
            const ac = S.trackActiveClip[t];
            if (pm.dspKey === 'clip_resolution') {
                const tps = S.clipTPS[t][ac] || 24;
                const idx = TPS_VALUES.indexOf(tps);
                S.bankParams[t][bankIdx][k] = idx >= 0 ? idx : 1;
            } else if (pm.dspKey === 'clip_playback_dir') {
                /* Mirror kept in sync by refreshPerClipBankParams +
                 * applyBankParam. Without this, every bank-jog onto CLIP
                 * resets the displayed Dir to Fwd until the next pollDSP. */
                S.bankParams[t][bankIdx][k] = S.clipPlaybackDir[t][ac] | 0;
            } else {
                S.bankParams[t][bankIdx][k] = pm.def;
            }
            continue;
        }
        if (pm.scope === 'action') {
            /* beat_stretch and clock_shift display per-touch labels (0 at rest) rather than absolute position */
            if (pm.dspKey === 'beat_stretch' || pm.dspKey === 'clock_shift') { S.bankParams[t][bankIdx][k] = 0; continue; }
            const stateKey = 't' + t + '_' + pm.dspKey + pm.actionSuffix;
            const raw = deps.getParam(stateKey);
            S.bankParams[t][bankIdx][k] = parseActionRaw(raw, pm.def);
            continue;
        }
        const key = pm.scope === 'global' ? pm.dspKey : 't' + t + '_' + pm.dspKey;
        const raw = deps.getParam(key);
        if (raw === null || raw === undefined) {
            S.bankParams[t][bankIdx][k] = pm.def;
            continue;
        }
        if (pm.dspKey === 'route') {
            S.bankParams[t][bankIdx][k] = raw === 'external' ? 2 : raw === 'move' ? 1 : 0;
        } else {
            S.bankParams[t][bankIdx][k] = parseInt(raw, 10) || 0;
        }
    }
    /* Drum NOTE/NOTEFX bank: quantize slot is managed via drumLaneQnt mirror, not get_param */
    if (bankIdx === 1 && S.trackPadMode[t] === PAD_MODE_DRUM)
        S.bankParams[t][1][2] = S.drumLaneQnt[t];
    /* DELAY bank (melodic): K7 is delay_retrig in the bank def now, so the
     * standard loop already reads it into bankParams[t][3][6]. delay_clock_fb
     * is no longer in the bank def — it lives on Shift+K1 with its own mirror
     * S.delayClockFb[t]. Read it explicitly here so the OLED value cell shows
     * the live value when Shift+K1 is touched. */
    if (bankIdx === 3 && S.trackPadMode[t] !== PAD_MODE_DRUM) {
        const _cf = deps.getParam('t' + t + '_delay_clock_fb');
        if (_cf !== null && _cf !== undefined)
            S.delayClockFb[t] = Math.max(-100, Math.min(100, parseInt(_cf, 10) | 0));
    }
}

export function applyTrackConfigImpl(S, deps, t, key, val) {
    if (!deps.setParam) return;
    let strVal;
    if (key === 'route') strVal = val === 2 ? 'external' : val === 1 ? 'move' : 'schwung';
    else strVal = String(val);
    deps.setParam('t' + t + '_' + key, strVal);
    if (key === 'channel')              S.trackChannel[t] = val;
    else if (key === 'route') {
        S.trackRoute[t] = val;
        /* Move route offers only Off/Poly aftertouch — normalize a lingering
         * Channel selection so the AftTch menu + send stay in sync. */
        if (val === 1 && S.trackAtMode[t] === 2) { S.trackAtMode[t] = 1; writeSidecar(); }
    }
    if (key === 'channel' || key === 'route') deps.routeCheckWarnForTrack(t);
    else if (key === 'pad_mode') {
        S.trackPadMode[t] = val;
        if (val === PAD_MODE_DRUM) {
            if (t === S.activeTrack && (S.activeBank === 2 || S.activeBank === 4)) S.activeBank = 0;
            deps.syncDrumLanesMeta(t);
            deps.syncDrumLaneSteps(t, S.activeDrumLane[t]);
            deps.syncDrumClipContent(t);
        } else {
            if (t === S.activeTrack && S.activeBank === 7) S.activeBank = 0;
            /* Leaving DRUM mode: clear JS drum vel-zone state and defer all
             * downstream DSP pushes. When tN_pad_mode='0' is followed
             * synchronously by another tN_* push from the same JS callback,
             * the pad_mode push is silently dropped — verified empirically.
             * The entering-DRUM branch escapes this by running sync*
             * get_params between pad_mode and the tN_padmap push (the
             * get_param round-trips act as a sync barrier on the audio
             * thread). For leaving-DRUM we defer instead: adl/dpm via
             * the queue (one per tick), and computePadNoteMap via a
             * pending flag handled at the top of next tick. */
            S.drumVelZoneArmed[t] = false;
            S.drumLastVelZone[t]  = 0;
            enqueueDspOperation(S, { key: 't' + t + '_active_drum_lane',  val: '0' });
            enqueueDspOperation(S, { key: 't' + t + '_drum_perform_mode', val: '0' });
            if (t === S.activeTrack) { S.pendingPadNoteMapRecompute = true; deps.forceRedraw(); }
        }
        if (t === S.activeTrack && val === PAD_MODE_DRUM) { deps.computePadNoteMap(); deps.forceRedraw(); }
    }
    else if (key === 'track_vel_override') S.trackVelOverride[t] = val;
    else if (key === 'track_looper')    S.trackLooper[t] = val;
}

/* Send a single param change to DSP and apply any JS-side side-effects. */
export function applyBankParamImpl(S, deps, t, bankIdx, knobIdx, val) {
    const pm = BANKS[bankIdx].knobs[knobIdx];
    if (!pm || pm.scope === 'stub') return;
    if (pm.scope === 'seqfollow') {
        S.clipSeqFollow[t][S.trackActiveClip[t]] = val !== 0;
        return;
    }
    if (!pm.dspKey) return;
    if (!deps.setParam) return;

    if (pm.scope === 'global') {
        deps.setParam(pm.dspKey, String(val));
        if (pm.dspKey === 'key') { S.padKey = val; deps.computePadNoteMap(); }
    } else if (pm.scope === 'track') {
        let strVal;
        if      (pm.dspKey === 'route')              strVal = val === 2 ? 'external' : val === 1 ? 'move' : 'schwung';
        else                                         strVal = String(val);
        if ([1, 2, 3].indexOf(bankIdx) >= 0 && S.trackPadMode[t] === PAD_MODE_DRUM) {
            const lane = S.activeDrumLane[t];
            let dKey = pm.dspKey;
            if (bankIdx === 3) {
                /* Drum MIDI DLY: remap K5→delay_gate_fb, K6→delay_clock_fb. K7
                 * now hosts delay_retrig (was blocked) — pass through. K8
                 * (delay_pitch_random) stays blocked for drum. */
                if (knobIdx === 4) dKey = 'delay_gate_fb';
                else if (knobIdx === 5) dKey = 'delay_clock_fb';
                else if (knobIdx === 7) return;
            }
            deps.setParam('t' + t + '_l' + lane + '_pfx_set', dKey + ' ' + strVal);
            return;
        }
        if (pm.dspKey === 'seq_arp_steps_mode' || pm.dspKey === 'tarp_steps_mode'
                || pm.dspKey === 'delay_retrig') {
            /* Defer via pendingDefaultSetParams: same-track sync tN_* set_params
             * fired in the same audio block can coalesce and silently drop the
             * first one (see set-param-per-buffer-per-key memory). delay_retrig
             * + a clip pad press (launch_clip) in quick succession was losing
             * the retrig write. One-per-tick drain guarantees it lands alone. */
            enqueueDspOperation(S, { key: 't' + t + '_' + pm.dspKey, val: strVal });
            return;
        }
        deps.setParam('t' + t + '_' + pm.dspKey, strVal);
    } else if (pm.scope === 'clip') {
        const ac = S.trackActiveClip[t];
        if (pm.dspKey === 'clip_resolution') {
            if (S.recordArmed && !S.recordCountingIn && S.recordArmedTrack === t) return;
            const idx = Math.max(0, Math.min(5, val));
            S.clipTPS[t][ac] = TPS_VALUES[idx];
            deps.setParam('t' + t + '_clip_resolution', String(idx));
        } else if (pm.dspKey === 'clip_playback_dir') {
            const dv = Math.max(0, Math.min(3, val | 0));
            S.clipPlaybackDir[t][ac] = dv;
            deps.setParam('t' + t + '_clip_playback_dir', String(dv));
        }
    }
}
