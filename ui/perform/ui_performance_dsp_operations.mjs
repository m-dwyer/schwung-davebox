import { enqueueDspOperation } from '../sync/ui_dsp_operation_queue.mjs';

/**
 * @param {import('../types').State} S
 */
export function queueDrumRepeatGrooveResetOperation(S, track, lane) {
    enqueueDspOperation(S, { key: 't' + track + '_l' + lane + '_repeat_groove_reset', val: '1' });
}

/**
 * @param {import('../types').State} S
 */
export function queueDrumRepeatLatchedOperation(S, track) {
    enqueueDspOperation(S, { key: 't' + track + '_drum_repeat_latched', val: '1' });
}

/**
 * @param {import('../types').State} S
 */
export function queueDrumRepeatStopOperation(S, track) {
    enqueueDspOperation(S, { key: 't' + track + '_drum_repeat_stop', val: '1' });
}

/**
 * @param {import('../types').State} S
 */
export function queueDrumRepeat2StopOperation(S, track) {
    enqueueDspOperation(S, { key: 't' + track + '_drum_repeat2_stop', val: '1' });
}

/**
 * @param {import('../types').State} S
 */
export function queueDrumRepeat2LaneOffOperation(S, track, lane) {
    enqueueDspOperation(S, { key: 't' + track + '_drum_repeat2_lane_off', val: String(lane) });
}

/**
 * @param {import('../types').State} S
 */
export function queueTarpLatchOperation(S, track, on) {
    enqueueDspOperation(S, { key: 't' + track + '_tarp_latch', val: on ? '1' : '0' });
}
