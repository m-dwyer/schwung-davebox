import {
    queueDrumRepeat2StopOperation,
    queueDrumRepeatGrooveResetOperation,
    queueDrumRepeatLatchedOperation,
    queueDrumRepeatStopOperation
} from '../perform/ui_performance_dsp_operations.mjs';

const REPEAT_GROOVE_DEFAULT_GATE = 0xFF;
const REPEAT_GROOVE_DEFAULT_GATE_LEN = 8;
const REPEAT_GROOVE_DEFAULT_VEL_SCALE = 100;
const REPEAT_GROOVE_DEFAULT_NUDGE = 0;
const REPEAT_GROOVE_DEFAULT_RPT2_RATE = 0;

function resetDrumRepeatGrooveShapeMirrorsForLane(S, track, lane) {
    S.drumRepeatGate[track][lane] = REPEAT_GROOVE_DEFAULT_GATE;
    S.drumRepeatGateLen[track][lane] = REPEAT_GROOVE_DEFAULT_GATE_LEN;
    for (let step = 0; step < 8; step++) {
        S.drumRepeatVelScale[track][lane][step] = REPEAT_GROOVE_DEFAULT_VEL_SCALE;
        S.drumRepeatNudge[track][lane][step] = REPEAT_GROOVE_DEFAULT_NUDGE;
    }
}

export function resetDrumRepeatGrooveMirrorsForLane(S, track, lane) {
    resetDrumRepeatGrooveShapeMirrorsForLane(S, track, lane);
    if (S.drumRepeat2RatePerLane) S.drumRepeat2RatePerLane[track][lane] = REPEAT_GROOVE_DEFAULT_RPT2_RATE;
}

export function resetDrumRepeatGrooveForLane(S, deps, track, lane) {
    resetDrumRepeatGrooveShapeMirrorsForLane(S, track, lane);
    queueDrumRepeatGrooveResetOperation(S, track, lane);
    deps.showActionPopup('RPT GROOVE', 'RESET');
}

export function copyDrumRepeatGrooveMirrors(S, track, srcLane, dstLane) {
    S.drumRepeatGate[track][dstLane] = S.drumRepeatGate[track][srcLane];
    S.drumRepeatGateLen[track][dstLane] = S.drumRepeatGateLen[track][srcLane];
    for (let step = 0; step < 8; step++) {
        S.drumRepeatVelScale[track][dstLane][step] = S.drumRepeatVelScale[track][srcLane][step];
        S.drumRepeatNudge[track][dstLane][step] = S.drumRepeatNudge[track][srcLane][step];
    }
}

export function moveDrumRepeatGrooveMirrors(S, track, srcLane, dstLane) {
    copyDrumRepeatGrooveMirrors(S, track, srcLane, dstLane);
    resetDrumRepeatGrooveMirrorsForLane(S, track, srcLane);
}

export function editDrumRepeatGrooveStep(S, deps, track, lane, step, dir, editNudge) {
    if (step < 0 || step >= 8) return false;

    if (editNudge) {
        const nv = Math.max(-50, Math.min(50, (S.drumRepeatNudge[track][lane][step] | 0) + dir));
        if (nv !== S.drumRepeatNudge[track][lane][step]) {
            S.drumRepeatNudge[track][lane][step] = nv;
            if (typeof deps.host_module_set_param === 'function')
                deps.host_module_set_param('t' + track + '_l' + lane + '_repeat_nudge', step + ' ' + nv);
        }
    } else {
        const nv = Math.max(0, Math.min(200, (S.drumRepeatVelScale[track][lane][step] | 0) + dir * 3));
        if (nv !== S.drumRepeatVelScale[track][lane][step]) {
            S.drumRepeatVelScale[track][lane][step] = nv;
            if (typeof deps.host_module_set_param === 'function')
                deps.host_module_set_param('t' + track + '_l' + lane + '_repeat_vel_scale', step + ' ' + nv);
        }
    }
    S.screenDirty = true;
    return true;
}

export function handleDrumRepeatPadPress(S, deps, track, padIdx, rawVelocity) {
    if (S.trackPadMode[track] !== deps.PAD_MODE_DRUM) return false;
    if (S.shiftHeld || S.copyHeld || S.muteHeld) return false;

    const mode = S.drumPerformMode[track] | 0;
    if (mode !== 1 && mode !== 2) return false;

    const col = padIdx % 8;
    const row = Math.floor(padIdx / 8);
    if (col >= 4 && row < 2) {
        const rateIdx = row * 4 + (col - 4);
        const lane = S.activeDrumLane[track];
        if (mode === 1)
            return handleDrumRepeatRatePadPress(S, deps, track, padIdx, rateIdx, lane, rawVelocity);
        return handleDrumRepeat2RatePadPress(S, deps, track, lane, rateIdx);
    }
    if (col >= 4 && row >= 2) {
        const lane = S.activeDrumLane[track];
        const step = (row - 2) * 4 + (col - 4);
        return handleDrumRepeatGatePad(S, deps, track, lane, step);
    }
    if (mode === 2 && col < 4 && !S.deleteHeld) {
        const lane = deps.drumPadToLane(padIdx);
        return handleDrumRepeat2LanePadPress(S, deps, track, lane, padIdx, rawVelocity);
    }
    return false;
}

export function handleDrumRepeatPadRelease(S, deps, track, padIdx) {
    if (S.trackPadMode[track] !== deps.PAD_MODE_DRUM) return false;

    const col = padIdx % 8;
    if (S.drumPerformMode[track] === 1 && col >= 4)
        return handleDrumRepeatRatePadRelease(S, deps, track, padIdx, S.activeDrumLane[track]);

    if (S.drumPerformMode[track] === 2 && col < 4) {
        const lane = deps.drumPadToLane(padIdx);
        handleDrumRepeat2LanePadRelease(S, deps, track, lane);
        return true;
    }

    if (S.drumPerformMode[track] === 2 && col >= 4)
        return handleDrumRepeat2RightGridPadRelease(S);

    return false;
}

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

export function handleDrumRepeatPadAftertouch(S, deps, track, padIdx, pressure) {
    if (S.drumRepeatHeldPad[track] !== padIdx || pressure <= 0) return false;

    S.drumRepeatHeldPadVel[track] = pressure;
    if (typeof deps.host_module_set_param === 'function')
        deps.host_module_set_param('t' + track + '_drum_repeat_vel', String(pressure));
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

export function handleDrumRepeat2LaneAftertouch(S, deps, track, lane, pressure) {
    if (pressure <= 0 || !S.drumRepeat2HeldLanes[track].has(lane)) return false;

    if (typeof deps.host_module_set_param === 'function')
        deps.host_module_set_param('t' + track + '_drum_repeat2_vel', lane + ' ' + pressure);
    return true;
}

export function handleDeleteLoopDrumRepeatStop(S, deps, track) {
    if (S.drumPerformMode[track] === 1 && S.drumRepeatLatched[track]) {
        S.drumRepeatLatched[track] = false;
        S.drumRepeatHeldPad[track] = -1;
        S.drumRepeatHeldPadsStack[track].length = 0;
        if (typeof deps.host_module_set_param === 'function')
            deps.host_module_set_param('t' + track + '_drum_repeat_stop', '1');
    } else if (S.drumPerformMode[track] === 2 && S.drumRepeat2LatchedLanes[track].size > 0) {
        if (typeof deps.host_module_set_param === 'function')
            deps.host_module_set_param('t' + track + '_drum_repeat2_stop', '1');
        S.drumRepeat2LatchedLanes[track].clear();
    }

    deps.forceRedraw();
    return true;
}

export function cycleDrumRepeatPerformMode(S, deps, track) {
    if (S.drumPerformMode[track] === 1) {
        if (typeof deps.host_module_set_param === 'function')
            deps.host_module_set_param('t' + track + '_drum_repeat_stop', '1');
        S.drumRepeatHeldPad[track] = -1;
        S.drumRepeatHeldPadsStack[track].length = 0;
    }
    if (S.drumPerformMode[track] === 2) {
        S.drumRepeat2HeldLanes[track].clear();
        S.drumRepeat2LatchedLanes[track].clear();
        if (typeof deps.host_module_set_param === 'function')
            deps.host_module_set_param('t' + track + '_drum_repeat2_stop', '1');
    }
    S.drumRepeatLatched[track] = false;

    deps.setDrumPerformMode(track, (S.drumPerformMode[track] + 1) % 3);
    if (S.drumPerformMode[track] > 0) S.activeBank = 5;
    deps.showModePopup('PERFORMANCE PADS',
        ['Velocity', 'Repeat Play (Rpt1)', 'Repeat Set (Rpt2)'],
        S.drumPerformMode[track]);
    return true;
}

function handleDrumRepeat2RightGridPadRelease(S) {
    S.screenDirty = true;
    return true;
}

export function prepareDrumRepeatLoopPress(S, track, isDrumTrack, liveActiveNoteCount) {
    S.loopTapUnlatchTrack = -1;

    const rpt1FreshHold = S.drumRepeatHeldPad[track] >= 0 && !S.drumRepeatLatched[track];
    const rpt2FreshHold = S.drumRepeat2HeldLanes[track].size > 0;
    if (isDrumTrack && !rpt1FreshHold && !rpt2FreshHold && liveActiveNoteCount === 0)
        S.loopTapUnlatchTrack = track;
}

export function latchHeldDrumRepeatsOnLoopPress(S, deps, track) {
    const mode = S.drumPerformMode ? S.drumPerformMode[track] : (S.drumRepeat2HeldLanes[track].size > 0 ? 2 : 1);

    if (mode === 2) {
        S.rpt2LoopPadUsed = false;
        if (S.drumRepeat2HeldLanes[track].size > 0) {
            for (const lane of S.drumRepeat2HeldLanes[track]) {
                S.drumRepeat2LatchedLanes[track].add(lane);
            }
            /* One atomic DSP push for all currently-held lanes. A per-lane loop
             * here would coalesce under one key; the DSP handler ORs active and
             * pending lanes into the latched bitmask. */
            if (typeof deps.host_module_set_param === 'function')
                deps.host_module_set_param('t' + track + '_drum_repeat2_latch_held', '1');
            S.rpt2LoopPadUsed = true;
        }
    } else if (S.drumRepeatHeldPad[track] >= 0) {
        S.drumRepeatLatched[track] = true;
        if (typeof deps.host_module_set_param === 'function')
            queueDrumRepeatLatchedOperation(S, track);
    }
}

export function handleDrumRepeatLoopTapRelease(S, loopTapTicks) {
    if (S.loopTapUnlatchTrack < 0) return false;

    const track = S.loopTapUnlatchTrack;
    const isTap = (S.tickCount - S.loopPressTick) < loopTapTicks;
    S.loopTapUnlatchTrack = -1;
    if (!isTap) return false;

    let handled = false;
    if (S.drumRepeatLatched[track]) {
        S.drumRepeatLatched[track] = false;
        S.drumRepeatHeldPad[track] = -1;
        S.drumRepeatHeldPadsStack[track].length = 0;
        queueDrumRepeatStopOperation(S, track);
        handled = true;
    }
    if (S.drumRepeat2LatchedLanes[track].size > 0) {
        S.drumRepeat2LatchedLanes[track].clear();
        queueDrumRepeat2StopOperation(S, track);
        handled = true;
    }
    return handled;
}
