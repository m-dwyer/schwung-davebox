import { enqueueDspOperation } from './ui_dsp_operation_queue.mjs';

export function clearAutomationImpl(S, track, clip, opts) {
    const done = [];

    if (opts.cc) {
        S.trackCCAutoBits[track][clip] = 0;
        S.trackCCLiveVal[track] = new Array(8).fill(-1);
        S.clipCCVal[track][clip] = new Array(8).fill(-1);
        enqueueDspOperation(S, { key: 't' + track + '_cc_auto_clear', val: String(clip) });
        done.push('CC');
    }

    if (opts.at) {
        S.clipAtHas[track][clip] = false;
        enqueueDspOperation(S, { key: 't' + track + '_c' + clip + '_at_clear', val: '1' });
        done.push('AT');
    }

    return done;
}

export function resetCcLaneImpl(S, track, clip, lane) {
    S.ccLaneLoopStart[track][clip][lane] = 0;
    S.ccLaneLength[track][clip][lane] = 0;
    S.ccLaneTps[track][clip][lane] = 0;
    S.ccLaneResTps[track][clip][lane] = 0;
    enqueueDspOperation(S, {
        key: 't' + track + '_c' + clip + '_k' + lane + '_cc_lane_reset',
        val: '1',
    });
}
