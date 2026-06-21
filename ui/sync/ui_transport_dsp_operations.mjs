import { enqueueDspOperation } from './ui_dsp_operation_queue.mjs';

/**
 * @param {import('../types').State} S
 */
export function queueFocusedClipLaunchOperation(S, track, clip) {
    enqueueDspOperation(S, { key: 't' + track + '_launch_clip', val: String(clip) });
    S.trackQueuedClip[track] = clip;
}

/**
 * @param {import('../types').State} S
 */
export function queueMergeStopOperation(S) {
    enqueueDspOperation(S, { key: 'merge_stop', val: '1' });
}

/**
 * @param {import('../types').State} S
 * @param {{ moveSample: number, red: number, setButtonLED: Function, showActionPopup: Function }} deps
 */
export function queueMergeArmOperation(S, deps) {
    enqueueDspOperation(S, { key: 'merge_arm', val: '1' });
    S.pendingMergeArm = true;
    deps.setButtonLED(deps.moveSample, deps.red);
    deps.showActionPopup('LIVE MERGE', 'Capturing all 8', 'tracks. Tap Sample', 'again to stop.');
    S.actionPopupEndTick = S.tickCount + 280;
}

/**
 * @param {import('../types').State} S
 */
export function queueMergeCancelOperation(S) {
    S.pendingMergePlacement = false;
    enqueueDspOperation(S, { key: 'merge_cancel', val: '1' });
}
