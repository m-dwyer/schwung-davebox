import { SCALE_INTERVALS, drumVelZoneToVelocity } from '../core/ui_constants.mjs';
import { enqueueDrumRecNoteOn, isActivelyRecordingTrack } from '../perform/ui_recording_workflow.mjs';

export function createLiveNoteQueues(numTracks) {
    return Array.from({length: numTracks}, () => []);
}

export function createPadRuntimeState() {
    return {
        padPitch: new Array(32).fill(-1),
        padPressTick: new Array(32).fill(-1)
    };
}

export function createPadSurfaceRuntime(S, deps) {
    function optionalSetParam() {
        return deps.optionalHostModuleSetParam();
    }

    function computePadNoteMapRuntime() {
        return computePadNoteMap(S, {
            PAD_MODE_DRUM: deps.PAD_MODE_DRUM,
            DRUM_LANES: deps.DRUM_LANES,
            DRUM_BASE_NOTE: deps.DRUM_BASE_NOTE,
            host_module_set_param: optionalSetParam()
        });
    }

    return {
        computePadNoteMap: computePadNoteMapRuntime,
        padDispatchMuted: function() {
            return padDispatchMutedNow(S);
        },
        setActiveDrumLane: function(t, lane) {
            return setActiveDrumLaneMirror(S, { host_module_set_param: optionalSetParam() }, t, lane);
        },
        setDrumPerformMode: function(t, mode) {
            return setDrumPerformModeMirror(S, { host_module_set_param: optionalSetParam() }, t, mode);
        },
        setDrumLanePage: function(t, page) {
            return setDrumLanePageMirror(S, { host_module_set_param: optionalSetParam() }, t, page);
        }
    };
}

export function setActiveDrumLaneMirror(S, deps, t, lane) {
    if (S.activeDrumLane[t] === lane) return;
    /* NB: written via array-ref alias so a future `replace_all` on the
     * pattern `S.activeDrumLane[t] = lane;` can't accidentally turn this
     * line into a recursive call to setActiveDrumLane (which is what
     * happened on the first 2A deploy — stack overflow on init). */
    const arr = S.activeDrumLane;
    arr[t] = lane;
    if (typeof deps.host_module_set_param === 'function')
        deps.host_module_set_param('t' + t + '_active_drum_lane', String(lane));
}

export function setDrumPerformModeMirror(S, deps, t, mode) {
    if (S.drumPerformMode[t] === mode) return;
    const arrPm = S.drumPerformMode;
    arrPm[t] = mode;
    if (typeof deps.host_module_set_param === 'function')
        deps.host_module_set_param('t' + t + '_drum_perform_mode', String(mode));
}

export function setDrumLanePageMirror(S, deps, t, page) {
    if (S.drumLanePage[t] === page) return;
    const arrLp = S.drumLanePage;
    arrLp[t] = page;
    if (typeof deps.host_module_set_param === 'function')
        deps.host_module_set_param('t' + t + '_drum_lane_page', String(page));
}

export function queueLiveNoteOn(queues, track, pitch, vel) {
    queues[track].push({ isOff: false, pitch, vel });
}

export function queueLiveNoteOff(queues, track, pitch) {
    queues[track].push({ isOff: true, pitch });
}

export function drumPadToLane(padIdx, lanePage) {
    const col = padIdx % 8;
    if (col >= 4) return -1;
    const row = Math.floor(padIdx / 8);
    return (lanePage | 0) * 16 + row * 4 + col;
}

export function drumPadToVelZone(padIdx) {
    const col = padIdx % 8;
    if (col < 4) return -1;
    const row = Math.floor(padIdx / 8);
    return row * 4 + (col - 4);
}

export function resolveDrumPadTarget(padIdx, lanePage, drumLanes) {
    const velZone = drumPadToVelZone(padIdx);
    if (velZone >= 0) {
        return {
            kind: 'velocity',
            zone: velZone,
            velocity: drumVelZoneToVelocity(velZone)
        };
    }
    const lane = drumPadToLane(padIdx, lanePage);
    if (lane >= 0 && lane < drumLanes) return { kind: 'lane', lane };
    return { kind: 'none' };
}

export function selectDrumLaneSurface(deps, track, lane) {
    deps.setActiveDrumLane(track, lane);
    deps.syncDrumLaneSteps(track, lane);
    deps.refreshDrumLaneBankParams(track, lane);
}

export function handleCaptureDrumLanePress(S, deps, track, padIdx, target) {
    if (!target || target.kind !== 'lane') return false;
    S.captureUsedAsModifier = true;
    deps.padPitch[padIdx] = 0xFF;
    selectDrumLaneSurface(deps, track, target.lane);
    deps.forceRedraw();
    return true;
}

export function handleDrumVelocityPadPress(S, deps, track, padIdx, target) {
    if (!target || target.kind !== 'velocity') return false;

    const velZone = target.zone;
    S.drumLastVelZone[track] = velZone;
    S.drumVelZoneArmed[track] = true;

    const zoneVel = target.velocity;
    const lane = S.activeDrumLane[track];
    const laneNote = S.drumLaneNote[track][lane];
    deps.liveSendNote(track, 0x90, laneNote, zoneVel, true);
    deps.padPitch[padIdx] = laneNote;
    deps.padPressTick[padIdx] = S.tickCount;
    S.liveActiveNotes.add(laneNote);

    if (S.heldStep >= 0 && S.heldStepNotes.length > 0) {
        const writeVel = deps.stepEntryVelocity(track, zoneVel, true);
        S.stepEditVel = writeVel;
        if (typeof deps.host_module_set_param === 'function')
            deps.host_module_set_param('t' + track + '_l' + lane + '_step_' + S.heldStep + '_vel', String(writeVel));
        S.stepBtnPressedTick[S.heldStepBtn] = -1;
    }

    if (isActivelyRecordingTrack(S, track))
        enqueueDrumRecNoteOn(S, deps.drumRecNoteOns, track, laneNote, velZone, lane);

    S.screenDirty = true;
    return true;
}

export function handleDrumLanePadPress(S, deps, track, padIdx, rawVelocity, target) {
    if (!target || target.kind !== 'lane') return false;

    const lane = target.lane;
    selectDrumLaneSurface(deps, track, lane);

    if (S.moveCoRunTrack >= 0) {
        deps.padPitch[padIdx] = 0xFF;
        deps.forceRedraw();
        return true;
    }

    const vel = deps.effectiveVelocity(rawVelocity);
    const laneNote = S.drumLaneNote[track][lane];
    deps.liveSendNote(track, 0x90, laneNote, vel);
    deps.padPitch[padIdx] = laneNote;
    deps.padPressTick[padIdx] = S.tickCount;
    S.liveActiveNotes.add(laneNote);

    if (isActivelyRecordingTrack(S, track)) {
        const tvo = S.trackVelOverride[track];
        const recVel = tvo > 0 ? tvo : vel;
        enqueueDrumRecNoteOn(S, deps.drumRecNoteOns, track, laneNote, recVel, lane);
    }

    if (S.recordArmed && S.recordCountingIn && track === S.recordArmedTrack) {
        const tvo = S.trackVelOverride[track];
        const recVel = tvo > 0 ? tvo : vel;
        S.pendingPrerollNote = {
            track: track,
            lane: lane,
            laneNote: laneNote,
            vel: recVel,
            isDrum: true,
            pressedAtTick: S.tickCount,
            countInStart: S.countInStartTick
        };
    }

    if (S.drumPerformMode[track] === 1 && (S.drumRepeatHeldPad[track] >= 0 || S.drumRepeatLatched[track])) {
        if (typeof deps.host_module_set_param === 'function' && !S.dspInboundEnabled)
            deps.host_module_set_param('t' + track + '_drum_repeat_lane', String(lane));
    }

    deps.forceRedraw();
    return true;
}

export function updatePadNoteMap(S, deps) {
    const t = S.activeTrack;
    if (S.trackPadMode[t] === deps.PAD_MODE_DRUM) {
        const page = S.drumLanePage[t] | 0;
        const coRunSilentLeft = (S.moveCoRunTrack >= 0);
        for (let i = 0; i < 32; i++) {
            const lane = drumPadToLane(i, page);
            if (lane < 0) { S.padNoteMap[i] = 0xFF; continue; }
            if (coRunSilentLeft) { S.padNoteMap[i] = 0xFF; continue; }
            const note = (lane >= 0 && lane < deps.DRUM_LANES)
                ? ((S.drumLaneNote[t][lane] | 0) || (deps.DRUM_BASE_NOTE + lane))
                : 0xFF;
            S.padNoteMap[i] = note & 0xFF;
        }
        return;
    }

    const effKey   = S.xposePrevKey   !== null ? S.xposePrevKey   : S.padKey;
    const effScale = S.xposePrevScale !== null ? S.xposePrevScale : S.padScale;
    const root = S.padOctave[t] * 12 + effKey;
    const intervals = SCALE_INTERVALS[effScale] || SCALE_INTERVALS[0];
    S.padScaleSet.clear();
    for (let i = 0; i < intervals.length; i++) S.padScaleSet.add(intervals[i]);
    if (S.padLayoutChromatic[t]) {
        for (let i = 0; i < 32; i++) {
            const col = i % 8;
            const row = Math.floor(i / 8);
            const p = root + col + row * 8;
            S.padNoteMap[i] = (p < 0 || p > 127) ? 0xFF : p;
        }
    } else {
        const n = intervals.length;
        for (let i = 0; i < 32; i++) {
            const col = i % 8;
            const row = Math.floor(i / 8);
            const deg = col + row * 3;
            const oct = Math.floor(deg / n);
            const semitone = oct * 12 + intervals[deg % n];
            const p = root + semitone;
            S.padNoteMap[i] = (p < 0 || p > 127) ? 0xFF : p;
        }
    }
}

export function buildDspPadMapPayload(S, deps, padDispatchMuted) {
    const t = S.activeTrack;
    const isDrum = S.trackPadMode[t] === deps.PAD_MODE_DRUM;
    const octShift = isDrum ? 0 : ((S.trackOctave[t] | 0) * 12);
    let payload = '';
    for (let i = 0; i < 32; i++) {
        let out;
        if (padDispatchMuted && S.sessionView) {
            out = 0xFF;
        } else {
            const p = S.padNoteMap[i];
            out = (p === 0xFF) ? 0xFF : Math.max(0, Math.min(127, p + octShift));
        }
        payload += (i ? ' ' : '') + out;
    }
    payload += ' ' + (S.extSendAsyncEnabled ? 1 : 0);
    payload += ' ' + (padDispatchMuted ? 1 : 0);
    payload += ' ' + (S.deleteHeld ? 1 : 0);
    return payload;
}

/* Modal pad owners:
 * - sessionView                 - pads launch clips
 * - button-helds (Shift/Delete/Copy/Mute/Capture/Loop) - pads are shortcuts
 * - tapTempoOpen                - pads are tap input
 * - ARP step-edit pad mode      - K5 held in SEQ ARP (bank 4) or TRACK ARP
 *                                  (bank 5) with steps mode != Off; pads edit
 *                                  step velocity, not play notes
 * globalMenuOpen is NOT in this list - pads should still play notes in
 * track view while the menu is open (user confirmed 2026-05-17). */
export function padDispatchMutedNow(S) {
    if (S.sessionView) return true;
    if (S.shiftHeld || S.deleteHeld || S.muteHeld || S.copyHeld
        || S.captureHeld || S.loopHeld || S.tapTempoOpen) return true;
    if ((S.activeBank === 4 || S.activeBank === 5)
        && S.knobTouched === 4
        && S.bankParams[S.activeTrack]
        && ((S.bankParams[S.activeTrack][S.activeBank] || [])[4] | 0) !== 0) return true;
    /* Arp Steps overlay: pads are the persistent vel-level editor, not playable. */
    if (S.stepIntervalMode && (S.activeBank === 4 || S.activeBank === 5)) return true;
    return false;
}

export function applyPadNoteMap(S, deps) {
    updatePadNoteMap(S, deps);
    if (S.dspInboundEnabled && typeof deps.host_module_set_param === 'function') {
        const padDispatchMuted = deps.padDispatchMuted();
        const payload = buildDspPadMapPayload(S, deps, padDispatchMuted);
        deps.host_module_set_param('t' + S.activeTrack + '_padmap', payload);
        S.lastPushedMuted = padDispatchMuted;
    }
}

export function computePadNoteMap(S, deps) {
    applyPadNoteMap(S, {
        ...deps,
        padDispatchMuted: () => padDispatchMutedNow(S)
    });
}
