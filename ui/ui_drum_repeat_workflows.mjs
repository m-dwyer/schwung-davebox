export function handleDrumRepeatGatePad(S, deps, track, lane, step) {
    if (step < 0 || step >= 8) return false;

    if (S.deleteHeld) {
        S.drumRepeatVelScale[track][lane][step] = 100;
        S.drumRepeatNudge[track][lane][step]    = 0;
        if (typeof deps.host_module_set_param === 'function')
            deps.host_module_set_param('t' + track + '_l' + lane + '_repeat_defaults', String(step));
    } else if (S.loopHeld) {
        const gLen = step + 1;
        const fillMask = (1 << gLen) - 1;
        S.drumRepeatGate[track][lane] = fillMask;
        S.drumRepeatGateLen[track][lane] = gLen;
        if (typeof deps.host_module_set_param === 'function')
            deps.host_module_set_param('t' + track + '_l' + lane + '_repeat_gate_and_len', fillMask + ' ' + gLen);
    } else {
        S.drumRepeatGate[track][lane] = (S.drumRepeatGate[track][lane] ^ (1 << step)) & 0xFF;
        if (typeof deps.host_module_set_param === 'function')
            deps.host_module_set_param('t' + track + '_l' + lane + '_repeat_gate_toggle', String(step));
    }

    deps.forceRedraw();
    return true;
}
