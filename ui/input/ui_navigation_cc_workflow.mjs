import { enqueueDspOperation } from '../sync/ui_dsp_operation_queue.mjs';

/* Track/Session navigation buttons split out of _onCC_transport.
 *
 * handleUiPageNavButton — Left/Right page navigation (and Loop+bank-6
 *   CC-lane resolution zoom) in Track View.
 * handleUiSceneNavButton — Up/Down scene-group navigation (Session View or
 *   overview-held), Loop+bank-6 CC-lane time-base zoom, and octave / drum-page
 *   shift in Track View.
 *
 * The original inline blocks used early `return`s to keep one gesture from
 * falling through to the next; here those returns are function-local and
 * preserve the same short-circuit behaviour. The two handlers are mutually
 * exclusive on d1, so the caller invokes both unconditionally. */

export function handleUiPageNavButton(S, deps, d1, d2) {
    /* Left/Right: page nav in Track View — clamp to the loop window so
     * step-edit nav never lands on a page that won't play. */
    if ((d1 === deps.moveLeft || d1 === deps.moveRight) && d2 === 127 && !S.sessionView) {
        var _t_lr = S.activeTrack;
        if (S.loopHeld && S.activeBank === 6 && S.trackPadMode[_t_lr] !== deps.padModeDrum) {
            var RES_TPS = [12, 24, 48, 96, 384];
            var _ac_lr = deps.effectiveClip(_t_lr);
            var _ccL_lr = S.ccActiveLane[_t_lr];
            var _dispTpsLr = S.ccLaneTps[_t_lr][_ac_lr][_ccL_lr] || (S.clipTPS[_t_lr][_ac_lr] || 24);
            var _curTps = S.ccLaneResTps[_t_lr][_ac_lr][_ccL_lr] || _dispTpsLr;
            var _ci = RES_TPS.indexOf(_curTps);
            if (_ci < 0) _ci = 1;
            if (d1 === deps.moveLeft && _ci > 0) _ci--;
            else if (d1 === deps.moveRight && _ci < RES_TPS.length - 1) _ci++;
            S.ccLaneResTps[_t_lr][_ac_lr][_ccL_lr] = RES_TPS[_ci];
            if (deps.setParam)
                deps.setParam('t' + _t_lr + '_c' + _ac_lr + '_k' + _ccL_lr + '_cc_lane_res_tps',
                              String(RES_TPS[_ci]));
            deps.forceRedraw();
            return;
        }
        if (S.trackPadMode[_t_lr] === deps.padModeDrum) {
            var lsBase = S.drumLaneLoopStart[_t_lr] | 0;
            var startPage = lsBase >> 4;
            var lastPage  = startPage + Math.max(1, Math.ceil(S.drumLaneLength[_t_lr] / 16)) - 1;
            if (d1 === deps.moveLeft)
                S.drumStepPage[_t_lr] = Math.max(startPage, S.drumStepPage[_t_lr] - 1);
            else
                S.drumStepPage[_t_lr] = Math.min(lastPage, S.drumStepPage[_t_lr] + 1);
        } else {
            var ac = deps.effectiveClip(_t_lr);
            var lsBase, startPage, lastPage;
            if (S.activeBank === 6) {
                var _ccL2 = S.ccActiveLane[_t_lr];
                var _llen = S.ccLaneLength[_t_lr][ac][_ccL2];
                if (_llen > 0) {
                    lsBase = S.ccLaneLoopStart[_t_lr][ac][_ccL2] | 0;
                    startPage = lsBase >> 4;
                    lastPage = startPage + Math.max(1, Math.ceil(_llen / 16)) - 1;
                }
            }
            if (lastPage === undefined) {
                lsBase = S.clipLoopStart[_t_lr][ac] | 0;
                startPage = lsBase >> 4;
                lastPage = startPage + Math.max(1, Math.ceil(S.clipLength[_t_lr][ac] / 16)) - 1;
            }
            if (d1 === deps.moveLeft)
                S.trackCurrentPage[_t_lr] = Math.max(startPage, S.trackCurrentPage[_t_lr] - 1);
            else
                S.trackCurrentPage[_t_lr] = Math.min(lastPage, S.trackCurrentPage[_t_lr] + 1);
        }
        /* Manual navigation disables SeqFollow so the view stays where the user navigated */
        const _sfAc = deps.effectiveClip(S.activeTrack);
        if (S.clipSeqFollow[S.activeTrack][_sfAc]) {
            S.clipSeqFollow[S.activeTrack][_sfAc] = false;
            S.bankParams[S.activeTrack][0][7] = 0;
        }
        S.screenDirty = true;
    }
}

export function handleUiSceneNavButton(S, deps, d1, d2) {
    /* Up/Down: scene group nav in Session View or while overview held; octave shift in Track View */
    if (d1 === deps.moveDown && d2 === 127 && (S.sessionView || S.sessionOverlayHeld) && S.sceneRow < deps.numClips - 4) { S.sceneRow = Math.min(deps.numClips - 4, S.sceneRow + 4); deps.forceRedraw(); }
    if (d1 === deps.moveUp   && d2 === 127 && (S.sessionView || S.sessionOverlayHeld) && S.sceneRow > 0)                  { S.sceneRow = Math.max(0, S.sceneRow - 4);                  deps.forceRedraw(); }
    if ((d1 === deps.moveUp || d1 === deps.moveDown) && d2 > 0 && !S.sessionView && !S.sessionOverlayHeld &&
            S.loopHeld && S.activeBank === 6 && S.trackPadMode[S.activeTrack] !== deps.padModeDrum) {
        var RES_TPS = [12, 24, 48, 96, 384];
        var _zt = S.activeTrack, _zac = deps.effectiveClip(_zt), _zL = S.ccActiveLane[_zt];
        var _zOldTps = S.ccLaneTps[_zt][_zac][_zL] || (S.clipTPS[_zt][_zac] || 24);
        var _zci = RES_TPS.indexOf(_zOldTps);
        if (_zci < 0) _zci = 1;
        if (d1 === deps.moveDown && _zci > 0) _zci--;
        else if (d1 === deps.moveUp && _zci < RES_TPS.length - 1) _zci++;
        var _zNewTps = RES_TPS[_zci];
        if (_zNewTps !== _zOldTps) {
            var _zOldLen = S.ccLaneLength[_zt][_zac][_zL] || S.clipLength[_zt][_zac];
            var _zOldTicks = _zOldLen * _zOldTps;
            var _zNewLen = Math.ceil(_zOldTicks / _zNewTps);
            if (_zNewLen <= 256) {
                S.ccLaneTps[_zt][_zac][_zL] = _zNewTps;
                S.ccLaneLength[_zt][_zac][_zL] = _zNewLen;
                var _zOldRes = S.ccLaneResTps[_zt][_zac][_zL];
                if (_zOldRes > 0) {
                    var _zNewRes = Math.round(_zOldRes * _zNewTps / _zOldTps);
                    var _zResValid = RES_TPS.indexOf(_zNewRes) >= 0;
                    S.ccLaneResTps[_zt][_zac][_zL] = _zResValid ? _zNewRes : 0;
                }
                var _zPre = 't' + _zt + '_c' + _zac + '_k' + _zL;
                enqueueDspOperation(S, { key: _zPre + '_cc_lane_tps', val: String(_zNewTps) });
                enqueueDspOperation(S, { key: _zPre + '_cc_loop_set',
                    val: String(((S.ccLaneLoopStart[_zt][_zac][_zL] | 0) << 16) | (_zNewLen & 0xFFFF)) });
                if (_zOldRes > 0)
                    enqueueDspOperation(S, { key: _zPre + '_cc_lane_res_tps',
                        val: String(S.ccLaneResTps[_zt][_zac][_zL]) });
                var _zMaxPage = Math.max(0, Math.ceil(_zNewLen / 16) - 1);
                if (S.trackCurrentPage[_zt] > _zMaxPage) S.trackCurrentPage[_zt] = _zMaxPage;
                deps.forceRedraw();
            }
        }
        return;
    }
    if (d1 === deps.moveUp   && d2 > 0 && !S.sessionView && !S.sessionOverlayHeld) {
        if (S.trackPadMode[S.activeTrack] === deps.padModeDrum) {
            deps.setDrumLanePage(S.activeTrack, 1);
            deps.syncDrumLanesMeta(S.activeTrack);
            deps.syncDrumLaneSteps(S.activeTrack, S.activeDrumLane[S.activeTrack]);
            deps.computePadNoteMap();  /* PHASE-1: drum page change shifts lane mapping; re-push */
            deps.forceRedraw();
        } else {
        for (const p of S.liveActiveNotes) deps.queueLiveNoteOff(S.activeTrack, p);
        S.liveActiveNotes.clear();
        S.trackOctave[S.activeTrack] = Math.min(4, S.trackOctave[S.activeTrack] + 1);
        deps.computePadNoteMap();  /* PHASE-1: re-bake octave offset into DSP padmap */
        S.screenDirty = true;
        if (S.heldStep >= 0) deps.forceRedraw();
        }
    }
    if (d1 === deps.moveDown && d2 > 0 && !S.sessionView && !S.sessionOverlayHeld) {
        if (S.trackPadMode[S.activeTrack] === deps.padModeDrum) {
            deps.setDrumLanePage(S.activeTrack, 0);
            deps.syncDrumLanesMeta(S.activeTrack);
            deps.syncDrumLaneSteps(S.activeTrack, S.activeDrumLane[S.activeTrack]);
            deps.computePadNoteMap();  /* PHASE-1: drum page change shifts lane mapping; re-push */
            deps.forceRedraw();
        } else {
        for (const p of S.liveActiveNotes) deps.queueLiveNoteOff(S.activeTrack, p);
        S.liveActiveNotes.clear();
        S.trackOctave[S.activeTrack] = Math.max(-4, S.trackOctave[S.activeTrack] - 1);
        deps.computePadNoteMap();  /* PHASE-1: re-bake octave offset into DSP padmap */
        S.screenDirty = true;
        if (S.heldStep >= 0) deps.forceRedraw();
        }
    }
}
