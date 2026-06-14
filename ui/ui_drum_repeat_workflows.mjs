export function handleDrumRepeatRatePadPress(S, deps, track, padIdx, rateIdx, lane, velocity) {
    if (S.drumRepeatLatched[track] && S.drumRepeatHeldPad[track] === padIdx) {
        S.drumRepeatLatched[track]  = false;
        S.drumRepeatHeldPad[track]  = -1;
        S.drumRepeatHeldPadsStack[track].length = 0;
        if (typeof deps.host_module_set_param === 'function')
            deps.host_module_set_param('t' + track + '_drum_repeat_stop', '1');
    } else {
        if (S.drumRepeatHeldPad[track] >= 0 && !S.drumRepeatLatched[track]) {
            const prevPad = S.drumRepeatHeldPad[track];
            const prevRate = Math.floor(prevPad / 8) * 4 + (prevPad % 8) - 4;
            S.drumRepeatHeldPadsStack[track].push({
                padIdx: prevPad,
                rateIdx: prevRate,
                vel: S.drumRepeatHeldPadVel[track]
            });
        }
        S.drumRepeatHeldPad[track]    = padIdx;
        S.drumRepeatHeldPadVel[track] = velocity;
        S.drumRepeatLatched[track]    = S.loopHeld;
        if (typeof deps.host_module_set_param === 'function') {
            if (!S.dspInboundEnabled)
                deps.host_module_set_param('t' + track + '_drum_repeat_start', lane + ' ' + rateIdx + ' ' + velocity);
            deps.host_module_set_param('t' + track + '_drum_repeat_latched', S.loopHeld ? '1' : '0');
        }
    }
    S.screenDirty = true;
    return true;
}

export function handleDrumRepeatRatePadRelease(S, deps, track, padIdx, lane) {
    if (S.drumRepeatHeldPad[track] === padIdx && !S.drumRepeatLatched[track]) {
        const prev = S.drumRepeatHeldPadsStack[track].length > 0
            ? S.drumRepeatHeldPadsStack[track].pop() : null;
        if (prev) {
            S.drumRepeatHeldPad[track] = prev.padIdx;
            if (typeof deps.host_module_set_param === 'function')
                deps.host_module_set_param('t' + track + '_drum_repeat_start',
                    lane + ' ' + prev.rateIdx + ' ' + prev.vel);
        } else {
            S.drumRepeatHeldPad[track] = -1;
            if (typeof deps.host_module_set_param === 'function')
                deps.host_module_set_param('t' + track + '_drum_repeat_stop', '1');
        }
    } else if (S.drumRepeatHeldPad[track] !== padIdx) {
        const stackIdx = S.drumRepeatHeldPadsStack[track].findIndex(function(e) { return e.padIdx === padIdx; });
        if (stackIdx >= 0) S.drumRepeatHeldPadsStack[track].splice(stackIdx, 1);
    }
    S.screenDirty = true;
    return true;
}

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

export function handleDrumRepeat2RatePadPress(S, deps, track, lane, rateIdx) {
    S.drumRepeat2RatePerLane[track][lane] = rateIdx;
    if (typeof deps.host_module_set_param === 'function' && !S.dspInboundEnabled)
        deps.host_module_set_param('t' + track + '_drum_repeat2_rate', lane + ' ' + rateIdx);
    S.screenDirty = true;
    return true;
}

export function handleDrumRepeat2LanePadRelease(S, deps, track, lane) {
    if (lane < 0 || lane >= deps.DRUM_LANES) return false;
    if (!S.drumRepeat2HeldLanes[track].has(lane)) return false;

    S.drumRepeat2HeldLanes[track].delete(lane);
    if (!S.drumRepeat2LatchedLanes[track].has(lane)) {
        if (typeof deps.host_module_set_param === 'function')
            deps.host_module_set_param('t' + track + '_drum_repeat2_lane_off', String(lane));
    }
    S.screenDirty = true;
    return true;
}

export function handleDrumRepeat2RightGridPadRelease(S) {
    S.screenDirty = true;
    return true;
}
