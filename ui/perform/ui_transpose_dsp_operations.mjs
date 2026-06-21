import { enqueueDspOperation } from '../sync/ui_dsp_operation_queue.mjs';

/**
 * @param {import('../types').State} S
 */
export function queueTransposeApplyOperation(S, fromKey, fromScale, toKey, toScale, commit) {
    enqueueDspOperation(S, {
        key: 't0_xpose_apply',
        val: fromKey + ' ' + fromScale + ' ' + toKey + ' ' + toScale + ' ' + commit
    });
}
