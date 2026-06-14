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

export function handleDrumRepeat2LanePadPress(S, deps, track, lane, padIdx, rawVelocity) {
    if (lane < 0 || lane >= deps.DRUM_LANES) return false;

    deps.setActiveDrumLane(track, lane);
    deps.syncDrumLaneSteps(track, lane);
    deps.refreshDrumLaneBankParams(track, lane);

    if (S.drumRepeat2LatchedLanes[track].has(lane)) {
        S.drumRepeat2LatchedLanes[track].delete(lane);
        if (typeof deps.host_module_set_param === 'function' && !S.dspInboundEnabled)
            deps.host_module_set_param('t' + track + '_drum_repeat2_lane_off', String(lane));
        if (S.loopHeld) S.rpt2LoopPadUsed = true;
    } else {
        S.drumRepeat2HeldLanes[track].add(lane);
        if (S.loopHeld) {
            S.drumRepeat2LatchedLanes[track].add(lane);
            S.rpt2LoopPadUsed = true;
        }
        deps.padPitch[padIdx] = -1;
        if (typeof deps.host_module_set_param === 'function') {
            if (!S.dspInboundEnabled)
                deps.host_module_set_param('t' + track + '_drum_repeat2_lane_on', lane + ' ' + rawVelocity);
            /* Loop-held latch uses one atomic set_param so simultaneous lane
             * presses do not coalesce different lane payloads under one key. */
            if (S.loopHeld)
                deps.host_module_set_param('t' + track + '_drum_repeat2_latch_held', '1');
        }
    }

    deps.forceRedraw();
    return true;
}
