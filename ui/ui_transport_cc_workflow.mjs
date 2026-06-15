export function handleUiPlayButton(S, deps, d1, d2) {
    if (d1 !== deps.movePlay || d2 !== 127) return;

    if (S.deleteHeld) {
        if (deps.setParam) {
            if (!S.playing) {
                /* Stopped: panic clears will_relaunch + all clip state atomically for all tracks. */
                deps.setParam('transport', 'panic');
                for (let t = 0; t < deps.numTracks; t++) {
                    S.trackWillRelaunch[t] = false;
                    S.trackQueuedClip[t]   = -1;
                }
                /* Mirror the playing-branch sweep so LEDs/UI stay in sync with audio panic. */
                deps.unlatchAllTracks();
            } else {
                deps.setParam('transport', 'deactivate_all');
                /* Unlatch Rpt1/Rpt2/TARP across all tracks. */
                deps.unlatchAllTracks();
            }
        }
    } else if (S.muteHeld) {
        S.muteUsedAsModifier = true;
        if (S.metronomeOn !== 0) S.metronomeOnLast = S.metronomeOn;
        S.metronomeOn = S.metronomeOn === 0 ? S.metronomeOnLast : 0;
        if (deps.setParam)
            deps.setParam('metro_on', String(S.metronomeOn));
        deps.showActionPopup('METRO ' + (S.metronomeOn === 0 ? 'OFF' : 'ON'));
    } else if (S.loopHeld && !S.sessionView) {
        /* Loop+Play (Track View only): restart with active clip starting at
         * the first step of the visible page; other tracks land at the
         * musically-equivalent offset. Atomic single set_param. */
        const t      = S.activeTrack;
        const isDrum = S.trackPadMode[t] === deps.padModeDrum;
        const page   = isDrum ? (S.drumStepPage[t] | 0) : (S.trackCurrentPage[t] | 0);
        const lane   = isDrum ? (S.activeDrumLane[t] | 0) : -1;
        if (deps.setParam) {
            deps.setParam('transport', 'restart_at:' + t + ':' + page + ':' + lane);
        }
    } else if (S.shiftHeld) {
        /* Restart: atomic DSP-side stop+play. Single set_param avoids
         * coalescing flakiness when stop+play land in same audio block. */
        if (deps.setParam) {
            deps.setParam('transport', S.playing ? 'restart' : 'play');
        }
    } else {
        if (S.recordCountingIn) {
            deps.disarmRecord();
        } else if (deps.setParam) {
            /* Use the combined `transport=play_focus:T:C` set_param so the
             * DSP arms the focused track's clip + sets playing=1 in a
             * single buffer. Sending launch_clip + transport=play as two
             * separate set_params coalesces (same buffer same channel),
             * leaving clip_playing=0 on the first cycle after a clip clear. */
            if (!S.playing && !S.sessionView
                    && !S.trackClipPlaying[S.activeTrack]
                    && !S.trackWillRelaunch[S.activeTrack]
                    && deps.focusedClipIsEmpty(S.activeTrack)) {
                const t = S.activeTrack;
                const c = S.trackActiveClip[t];
                deps.setParam('transport', 'play_focus:' + t + ':' + c);
                S.trackQueuedClip[t] = c;
            } else {
                deps.setParam('transport', S.playing ? 'stop' : 'play');
            }
        }
    }
}
