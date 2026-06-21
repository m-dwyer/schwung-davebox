/* Universal latch workflows shared by transport stop and Delete+Play. */

import {
    queueDrumRepeat2LaneOffOperation,
    queueDrumRepeatStopOperation,
    queueTarpLatchOperation
} from './ui_performance_dsp_operations.mjs';

export function unlatchAllTracks(S, trackCount) {
    for (let t = 0; t < trackCount; t++) {
        if (S.drumRepeatLatched[t]) {
            S.drumRepeatLatched[t] = false;
            S.drumRepeatHeldPad[t] = -1;
            S.drumRepeatHeldPadsStack[t].length = 0;
            queueDrumRepeatStopOperation(S, t);
        }
        if (S.drumRepeat2LatchedLanes[t].size > 0) {
            S.drumRepeat2LatchedLanes[t].forEach(function(lane) {
                queueDrumRepeat2LaneOffOperation(S, t, lane);
            });
            S.drumRepeat2LatchedLanes[t].clear();
        }
        if (S.bankParams[t] && S.bankParams[t][5] && S.bankParams[t][5][7]) {
            S.bankParams[t][5][7] = 0;
            queueTarpLatchOperation(S, t, false);
        }
    }
}
