import { enqueueDspOperation } from './ui_dsp_operation_queue.mjs';

/**
 * @param {import('../types').State} S
 * @param {number} mods
 */
export function queueRestoredPerfModsOperation(S, mods) {
    enqueueDspOperation(S, { key: 'perf_mods', val: String(mods) });
}
