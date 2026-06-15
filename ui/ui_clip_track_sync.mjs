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
