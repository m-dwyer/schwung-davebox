export function readDrumRepeatStateFromDsp(S, deps, track, lane) {
    if (typeof deps.host_module_get_param !== 'function') return;
    const raw = deps.host_module_get_param('t' + track + '_l' + lane + '_repeat_state');
    if (!raw) return;
    const values = raw.split(' ');
    if (values.length < 18) return;
    S.drumRepeatGate[track][lane] = parseInt(values[0], 10) & 0xFF;
    for (let step = 0; step < 8; step++) {
        S.drumRepeatVelScale[track][lane][step] = parseInt(values[1 + step], 10) | 0;
    }
    for (let step = 0; step < 8; step++) {
        S.drumRepeatNudge[track][lane][step] = parseInt(values[9 + step], 10) | 0;
    }
    if (values.length >= 19) S.drumRepeatGateLen[track][lane] = parseInt(values[18], 10) || 8;
}

export function refreshDrumLaneBankParamsFromDsp(S, deps, track, lane) {
    if (typeof deps.host_module_get_param !== 'function') return;
    const snap = deps.host_module_get_param('t' + track + '_l' + lane + '_pfx_snapshot');
    if (snap) {
        const values = snap.split(' ');
        if (values.length >= 9) {
            /* NOTE FX bank (1): gate_time, vel_offset, quantize */
            S.bankParams[track][1][0] = parseInt(values[0], 10) | 0;  /* Gate */
            S.bankParams[track][1][1] = parseInt(values[1], 10) | 0;  /* Vel  */
            S.bankParams[track][1][2] = parseInt(values[2], 10) | 0;  /* Qnt  */
            S.drumLaneQnt[track]      = S.bankParams[track][1][2];
            /* MIDI DLY bank (3): delay_time_idx, delay_level, repeat_times,
               fb_velocity, fb_gate_time, fb_clock at values[3..8]; delay_retrig at values[9]
               (K6 of the drum delay bank layout). */
            for (let knob = 0; knob < 6; knob++) S.bankParams[track][3][knob] = parseInt(values[3 + knob], 10) | 0;
            if (values.length >= 10) S.bankParams[track][3][6] = parseInt(values[9], 10) | 0;
            /* NOTE FX K5 Len mode (values[10]) — per-lane mirror. */
            if (values.length >= 11) S.drumLaneLenMode[track][lane] = parseInt(values[10], 10) | 0;
        }
    }
    /* DRUM LANE bank (0): Res (K1=idx0), Eucl (K5=idx4), Dir (K7=idx6),
     * SqFl (K8=idx7) per-lane meta. */
    const tpsIdx = deps.TPS_VALUES.indexOf(S.drumLaneTPS[track]);
    S.bankParams[track][0][0] = tpsIdx >= 0 ? tpsIdx : 1;
    S.bankParams[track][0][4] = S.drumLaneEuclidN[track][lane] | 0;
    {
        const rawDir = deps.host_module_get_param('t' + track + '_l' + lane + '_playback_dir');
        const parsedDir = parseInt(rawDir, 10);
        const dir = (isFinite(parsedDir) && parsedDir >= 0 && parsedDir <= 3) ? parsedDir : 0;
        S.drumLanePlaybackDir[track][lane] = dir;
        S.bankParams[track][0][6] = dir;
        const rawReverse = deps.host_module_get_param('t' + track + '_l' + lane + '_playback_audio_reverse');
        const parsedReverse = parseInt(rawReverse, 10);
        S.drumLanePlaybackAudioReverse[track][lane] = (isFinite(parsedReverse) && parsedReverse === 1) ? 1 : 0;
    }
    S.bankParams[track][0][7] = S.clipSeqFollow[track][S.trackActiveClip[track]] ? 1 : 0;
    /* Repeat Groove state for this lane */
    readDrumRepeatStateFromDsp(S, deps, track, lane);
    S.screenDirty = true;
}

export function refreshPerClipBankParamsFromDsp(S, deps, track) {
    if (typeof deps.host_module_get_param !== 'function') return;
    if (S.trackPadMode[track] === deps.PAD_MODE_DRUM) {
        refreshDrumLaneBankParamsFromDsp(S, deps, track, S.activeDrumLane[track]);
        return;
    }
    const activeClip = S.trackActiveClip[track];
    const snap = deps.host_module_get_param('t' + track + '_c' + activeClip + '_pfx_snapshot');
    if (!snap) return;
    const values = snap.split(' ');
    if (values.length < 17) return;
    /* NOTE FX bank (1): K1=Oct K2=Ofs K3=Vel K4=Qnt K5=Len K6=Gate K7=blocked K8=Rnd
     * (DSP snapshot still emits values[] in original order oct/ofs/gate/vel/qnt + rnd at values[31].) */
    S.bankParams[track][1][0] = parseInt(values[0], 10) | 0;  /* K1 = Oct */
    S.bankParams[track][1][1] = parseInt(values[1], 10) | 0;  /* K2 = Ofs */
    S.bankParams[track][1][2] = parseInt(values[3], 10) | 0;  /* K3 = Vel */
    S.bankParams[track][1][3] = parseInt(values[4], 10) | 0;  /* K4 = Qnt */
    /* K5 = Len mode at values[43] (appended after seq_arp_step_loop_len at values[42]) */
    S.bankParams[track][1][4] = values.length >= 44 ? (parseInt(values[43], 10) | 0) : 0;
    S.bankParams[track][1][5] = parseInt(values[2], 10) | 0;  /* K6 = Gate */
    /* K7 (idx 6) = blocked — leave at 0 */
    /* NOTE FX random + modes packed at values[31..33] (right after step_vel[0..7] = values[23..30]) */
    S.bankParams[track][1][7] = values.length >= 32 ? (parseInt(values[31], 10) | 0) : 0; /* K8 = Rnd */
    S.noteFXRandomMode[track]  = values.length >= 33 ? (parseInt(values[32], 10) | 0) : 2;
    S.midiDlyRandomMode[track] = values.length >= 34 ? (parseInt(values[33], 10) | 0) : 2;
    /* HARMZ bank (2): K0=oct K1=hrm1 K2=hrm2 K3=hrm3 (Unis retired in state v=33) */
    for (let knob = 0; knob < 4; knob++) S.bankParams[track][2][knob] = parseInt(values[5 + knob], 10) | 0;
    /* MIDI DLY bank (3): K0=dly K1=lvl K2=rep K3=vfb K4=pfb K5=gfb K6=retrg K7=rnd
     * (delay_clock_fb moved to Shift+K1 alt — read separately via tN_delay_clock_fb). */
    for (let knob = 0; knob < 8; knob++) S.bankParams[track][3][knob] = parseInt(values[9 + knob], 10) | 0;
    /* SEQ ARP bank (4): K0=style K1=rate K2=oct K3=gate K4=steps K5=retrigger (length-aware) */
    if (values.length >= 23) {
        for (let knob = 0; knob < 6; knob++) S.bankParams[track][4][knob] = parseInt(values[17 + knob], 10) | 0;
    }
    /* step_vel[0..7] when present (length-aware) */
    if (values.length >= 31) {
        for (let step = 0; step < 8; step++) S.seqArpStepVel[track][activeClip][step] = parseInt(values[23 + step], 10) | 0;
    }
    /* step_int[0..7] at values[34..41] (scale-degree offsets for Arp Steps interval mode) */
    if (values.length >= 42) {
        for (let step = 0; step < 8; step++) S.seqArpStepInt[track][activeClip][step] = parseInt(values[34 + step], 10) | 0;
    }
    /* step_loop_len at values[42] (1..8) */
    if (values.length >= 43) {
        const loopLen = parseInt(values[42], 10) | 0;
        S.seqArpStepLoopLen[track][activeClip] = (loopLen >= 1 && loopLen <= 8) ? loopLen : 8;
    }
    /* CLIP bank (0): Res (K1=idx0), Dir (K7=idx6), SqFl (K8=idx7) — all per-clip. */
    const tps = S.clipTPS[track][activeClip] || 24;
    const tpsIdx = deps.TPS_VALUES.indexOf(tps);
    S.bankParams[track][0][0] = tpsIdx >= 0 ? tpsIdx : 1;
    {
        const rawDir = deps.host_module_get_param('t' + track + '_clip_playback_dir');
        const parsedDir = parseInt(rawDir, 10);
        const dir = (isFinite(parsedDir) && parsedDir >= 0 && parsedDir <= 3) ? parsedDir : 0;
        S.clipPlaybackDir[track][activeClip] = dir;
        S.bankParams[track][0][6] = dir;
        const rawReverse = deps.host_module_get_param('t' + track + '_clip_playback_audio_reverse');
        const parsedReverse = parseInt(rawReverse, 10);
        S.clipPlaybackAudioReverse[track][activeClip] = (isFinite(parsedReverse) && parsedReverse === 1) ? 1 : 0;
    }
    S.bankParams[track][0][7] = S.clipSeqFollow[track][activeClip] ? 1 : 0;
    S.screenDirty = true;
}

export function readMelodicClipFromDsp(S, deps, track, clip, opts) {
    const preserveInactiveSteps = !!(opts && opts.preserveInactiveSteps);
    const refreshActiveBankParams = !!(opts && opts.refreshActiveBankParams);

    const bulk = deps.host_module_get_param('t' + track + '_c' + clip + '_steps');
    if (bulk && bulk.length >= deps.NUM_STEPS) {
        for (let s = 0; s < deps.NUM_STEPS; s++) {
            S.clipSteps[track][clip][s] = bulk[s] === '1'
                ? 1
                : (preserveInactiveSteps && bulk[s] === '2' ? 2 : 0);
        }
        S.clipNonEmpty[track][clip] = deps.clipHasContent(track, clip);
    }

    const len = deps.host_module_get_param('t' + track + '_c' + clip + '_length');
    if (len !== null && len !== undefined) S.clipLength[track][clip] = parseInt(len, 10) || 16;

    const tpsRaw = deps.host_module_get_param('t' + track + '_c' + clip + '_tps');
    if (tpsRaw !== null && tpsRaw !== undefined) {
        const tpsVal = parseInt(tpsRaw, 10);
        S.clipTPS[track][clip] = deps.TPS_VALUES.indexOf(tpsVal) >= 0 ? tpsVal : 24;
    }

    if (refreshActiveBankParams && clip === S.trackActiveClip[track])
        deps.refreshPerClipBankParams(track);
}

export function readTargetedClipAutomationFromDsp(S, deps, track, clip) {
    const bits = deps.host_module_get_param('t' + track + '_c' + clip + '_cc_auto_bits');
    S.trackCCAutoBits[track][clip] = bits !== null ? (parseInt(bits, 10) || 0) : 0;

    const rest = deps.host_module_get_param('t' + track + '_c' + clip + '_cc_rest');
    if (rest) {
        const parts = rest.split(' ');
        for (let k = 0; k < 8; k++) {
            const rv = parseInt(parts[k], 10);
            S.clipCCVal[track][clip][k] = (rv >= 0 && rv <= 127) ? rv : -1;
        }
    }

    const atHas = deps.host_module_get_param('t' + track + '_c' + clip + '_at_has');
    S.clipAtHas[track][clip] = (atHas !== null && parseInt(atHas, 10) === 1);
}

export function readDrumActiveLaneFromDsp(S, deps, track) {
    const lane = S.activeDrumLane[track];
    deps.syncDrumClipContent(track);
    deps.syncDrumLanesMeta(track);
    deps.syncDrumLaneSteps(track, lane);
    deps.refreshDrumLaneBankParams(track, lane);
}

export function resyncDrumTrackImpl(S, deps, track) {
    deps.syncDrumLanesMeta(track);
    deps.syncDrumLaneSteps(track, S.activeDrumLane[track]);
    deps.syncDrumClipContent(track);
    deps.refreshDrumLaneBankParams(track, S.activeDrumLane[track]);
}

export function readTargetedClipRestorePairFromDsp(S, deps, track, clip, isDrum) {
    if (isDrum) {
        readDrumActiveLaneFromDsp(S, deps, track);
    } else {
        readMelodicClipFromDsp(S, deps, track, clip, {
            preserveInactiveSteps: false,
            refreshActiveBankParams: true
        });
    }
    readTargetedClipAutomationFromDsp(S, deps, track, clip);
}

export function readTrackConfigFromDsp(S, deps, track) {
    if (typeof deps.host_module_get_param !== 'function') return;
    const ch = deps.host_module_get_param('t' + track + '_channel');
    if (ch !== null && ch !== undefined) S.trackChannel[track] = parseInt(ch, 10) || 1;
    const rt = deps.host_module_get_param('t' + track + '_route');
    if (rt !== null && rt !== undefined) S.trackRoute[track] = rt === 'external' ? 2 : rt === 'move' ? 1 : 0;
    const pm = deps.host_module_get_param('t' + track + '_pad_mode');
    if (pm !== null && pm !== undefined) S.trackPadMode[track] = parseInt(pm, 10) | 0;
    const tvo = deps.host_module_get_param('t' + track + '_track_vel_override');
    if (tvo !== null && tvo !== undefined) S.trackVelOverride[track] = parseInt(tvo, 10) | 0;
    const lpr = deps.host_module_get_param('t' + track + '_track_looper');
    if (lpr !== null && lpr !== undefined) S.trackLooper[track] = parseInt(lpr, 10) | 0;
    const diq = deps.host_module_get_param('t' + track + '_diq');
    if (diq !== null && diq !== undefined) {
        S.drumInpQuant[track] = Math.max(0, Math.min(8, parseInt(diq, 10) | 0));
        S.bankParams[track][7][5] = S.drumInpQuant[track];
    }
}

export function readTrackArpStepConfigFromDsp(S, deps, track) {
    if (typeof deps.host_module_get_param !== 'function') return;
    const raw = deps.host_module_get_param('t' + track + '_tarp_sv');
    if (!raw) return;
    const values = raw.split(' ');
    for (let step = 0; step < 8; step++) {
        S.tarpStepVel[track][step] = parseInt(values[step], 10) | 0;
    }

    const rawIntervals = deps.host_module_get_param('t' + track + '_tarp_si');
    if (rawIntervals) {
        const intervalValues = rawIntervals.split(' ');
        for (let step = 0; step < 8; step++) {
            S.tarpStepInt[track][step] = parseInt(intervalValues[step], 10) | 0;
        }
    }

    const rawLoopLen = deps.host_module_get_param('t' + track + '_tarp_sll');
    if (rawLoopLen !== null && rawLoopLen !== undefined) {
        const loopLen = parseInt(rawLoopLen, 10) | 0;
        S.tarpStepLoopLen[track] = (loopLen >= 1 && loopLen <= 8) ? loopLen : 8;
    }
}

export function readDrumRepeatRatesFromDsp(S, deps, track) {
    if (typeof deps.host_module_get_param !== 'function') return;
    const r2 = deps.host_module_get_param('t' + track + '_drum_r2rt');
    if (r2) {
        const values = r2.split(' ');
        for (let lane = 0; lane < 32 && lane < values.length; lane++) {
            S.drumRepeat2RatePerLane[track][lane] = parseInt(values[lane], 10) | 0;
        }
    }
}
