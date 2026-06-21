import { enqueueDspOperation } from './ui_dsp_operation_queue.mjs';

/**
 * @param {import('../types').State} S
 * @param {number} slot
 */
export function queueSnapshotDeleteOperation(S, slot) {
    enqueueDspOperation(S, { key: 'snap_delete', val: String(slot) });
}

/**
 * @param {import('../types').State} S
 * @param {number} slot
 */
export function queueSnapshotLoadOperation(S, slot) {
    enqueueDspOperation(S, { key: 'snap_load', val: String(slot) });
}

/**
 * @param {import('../types').State} S
 * @param {number} scene
 */
export function queueSceneLaunchOperation(S, scene) {
    enqueueDspOperation(S, { key: 'launch_scene', val: String(scene) });
}

/**
 * @param {import('../types').State} S
 * @param {number} scene
 */
export function queueQuantizedSceneLaunchOperation(S, scene) {
    enqueueDspOperation(S, { key: 'launch_scene_quant', val: String(scene) });
}

/**
 * @param {import('../types').State} S
 * @param {number} row
 */
export function queueMergePlaceRowOperation(S, row) {
    enqueueDspOperation(S, { key: 'merge_place_row', val: String(row) });
}
