/* Universal latch workflows shared by transport stop and Delete+Play. */

export function unlatchAllTracks(S, trackCount) {
    for (let t = 0; t < trackCount; t++) {
        if (S.drumRepeatLatched[t]) {
            S.drumRepeatLatched[t] = false;
            S.drumRepeatHeldPad[t] = -1;
            S.drumRepeatHeldPadsStack[t].length = 0;
            S.pendingDefaultSetParams.push({ key: 't' + t + '_drum_repeat_stop', val: '1' });
        }
        if (S.drumRepeat2LatchedLanes[t].size > 0) {
            S.drumRepeat2LatchedLanes[t].forEach(function(lane) {
                S.pendingDefaultSetParams.push({ key: 't' + t + '_drum_repeat2_lane_off', val: String(lane) });
            });
            S.drumRepeat2LatchedLanes[t].clear();
        }
        if (S.bankParams[t] && S.bankParams[t][5] && S.bankParams[t][5][7]) {
            S.bankParams[t][5][7] = 0;
            S.pendingDefaultSetParams.push({ key: 't' + t + '_tarp_latch', val: '0' });
        }
    }
}
