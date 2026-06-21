import {
    queueMergePlaceRowOperation,
    queueQuantizedSceneLaunchOperation,
    queueSceneLaunchOperation,
    queueSnapshotDeleteOperation,
    queueSnapshotLoadOperation
} from '../sync/ui_session_dsp_operations.mjs';

/**
 * Host slice this module needs (Interface Segregation). The composition root in
 * ui.js structurally satisfies this; `State` is the shared contract (ui/types).
 *
 * @typedef {Object} SessionViewDeps
 * @property {number} numTracks
 * @property {number} padModeDrum
 * @property {(key: string, val: string) => void} setParam
 * @property {() => void} forceRedraw
 * @property {() => void} invalidateLEDCache
 * @property {(line1: string, line2?: string) => void} showActionPopup
 * @property {() => void} sendPerfMods
 * @property {(track: number) => void} switchActiveTrack
 * @property {(track: number, on: boolean) => void} setTrackMute
 * @property {(track: number, on: boolean) => void} setTrackSolo
 * @property {(track: number, clip: number) => boolean} trackClipHasContent
 * @property {(track: number, clip: number) => boolean} clipIsEmpty
 * @property {(idx: number) => void} doShiftStepCommon
 * @property {(track: number) => void} handoffRecordingToTrack
 * @property {(...args: any[]) => void} refreshPerClipBankParams
 * @property {(...args: any[]) => void} clearClip
 * @property {(...args: any[]) => void} clearRow
 * @property {(...args: any[]) => void} copyClip
 * @property {(...args: any[]) => void} copyRow
 * @property {(...args: any[]) => void} cutClip
 * @property {(...args: any[]) => void} cutRow
 * @property {(...args: any[]) => void} copyDrumClip
 * @property {(...args: any[]) => void} cutDrumClip
 * @property {(...args: any[]) => void} hardResetClip
 */

/**
 * @param {import('../types').State} S
 * @param {SessionViewDeps} deps
 * @param {number} idx
 * @returns {boolean}
 */
export function handleSessionViewStepPress(S, deps, idx) {
    if (!S.sessionView) return false;

    if (S.deleteHeld) {
        if (S.loopHeld || S.perfViewLocked) {
            S.perfSnapshots[idx] = 0;
            if (S.perfRecalledSlot === idx) {
                S.perfRecalledSlot = -1;
                S.perfModsToggled = 0;
                deps.sendPerfMods();
            }
            deps.showActionPopup('PERF PRESET', 'CLEARED');
        } else if (S.muteHeld) {
            S.snapshots[idx] = null;
            queueSnapshotDeleteOperation(S, idx);
            deps.showActionPopup('MUTE STATE', 'CLEARED');
        }
        deps.forceRedraw();
        return true;
    }

    if (S.loopHeld || S.perfViewLocked) {
        S.stepBtnPressedTick[idx] = S.tickCount;
        S.sessionStepHeld = idx;
        S.sessionStepHeldCtx = 1;
        return true;
    }

    if (S.pendingSceneBakePicker) {
        S.pendingSceneBakePicker = false;
        S.confirmBakeScene = true;
        S.confirmBakeSceneSel = 1;
        S.confirmBakeSceneClip = idx;
        S.screenDirty = true;
        return true;
    }

    if (S.pendingMergePlacement) {
        S.pendingMergePlacement = false;
        queueMergePlaceRowOperation(S, idx);
        S.screenDirty = true;
        return true;
    }

    if (S.muteHeld) {
        S.stepBtnPressedTick[idx] = S.tickCount;
        S.sessionStepHeld = idx;
        S.sessionStepHeldCtx = 2;
        return true;
    }

    if (S.shiftHeld) {
        deps.doShiftStepCommon(idx);
        deps.forceRedraw();
        return true;
    }

    if (!S.deleteHeld) {
        queueSceneLaunchOperation(S, idx);
    }
    return true;
}

/**
 * @param {import('../types').State} S
 * @param {SessionViewDeps} deps
 * @param {number} btn
 * @returns {boolean}
 */
export function handleSessionViewStepRelease(S, deps, btn) {
    if (S.sessionStepHeld !== btn) return false;

    const ctx = S.sessionStepHeldCtx;
    S.sessionStepHeld = -1;
    S.sessionStepHeldCtx = 0;
    S.stepBtnPressedTick[btn] = -1;

    if (ctx === 1) {
        if (S.perfRecalledSlot === btn) {
            S.perfRecalledSlot = -1;
            S.perfModsToggled = 0;
        } else {
            S.perfRecalledSlot = btn;
            S.perfModsToggled = S.perfSnapshots[btn];
        }
        deps.sendPerfMods();
    } else {
        const snap = S.snapshots[btn];
        if (snap !== null) {
            for (let t = 0; t < deps.numTracks; t++) {
                S.trackMuted[t] = snap.mute[t];
                S.trackSoloed[t] = snap.solo[t];
                if (snap.drumEffMute) {
                    S.drumLaneMute[t] = snap.drumEffMute[t];
                    S.drumLaneSolo[t] = 0;
                }
            }
            queueSnapshotLoadOperation(S, btn);
        }
    }

    deps.forceRedraw();
    return true;
}

/**
 * @param {import('../types').State} S
 * @param {SessionViewDeps} deps
 * @param {number} padNote
 * @returns {boolean}
 */
export function handleSessionViewClipPadPress(S, deps, padNote) {
    if (!S.sessionView) return false;

    for (let row = 0; row < 4; row++) {
        const rowBase = 92 - row * 8;
        if (padNote < rowBase || padNote >= rowBase + deps.numTracks) continue;

        const t = padNote - rowBase;
        const clipIdx = S.sceneRow + row;
        if (S.muteHeld) {
            if (S.shiftHeld) deps.setTrackSolo(t, !S.trackSoloed[t]);
            else deps.setTrackMute(t, !S.trackMuted[t]);
        } else if (S.copyHeld) {
            const isDrumT = S.trackPadMode[t] === deps.padModeDrum;
            if (S.copySrc && S.copySrc.kind === 'step') {
                /* Step copy in progress: swallow. */
            } else if (!S.copySrc) {
                if (isDrumT) {
                    S.copySrc = S.shiftHeld
                        ? { kind: 'cut_drum_clip', track: t, clip: clipIdx }
                        : { kind: 'drum_clip', track: t, clip: clipIdx };
                } else {
                    S.copySrc = S.shiftHeld
                        ? { kind: 'cut_clip', track: t, clip: clipIdx }
                        : { kind: 'clip', track: t, clip: clipIdx };
                }
                deps.invalidateLEDCache();
                deps.showActionPopup(S.shiftHeld ? 'CUT' : 'COPIED');
            } else if (S.copySrc.kind === 'clip') {
                deps.copyClip(S.copySrc.track, S.copySrc.clip, t, clipIdx);
                deps.invalidateLEDCache();
                deps.forceRedraw();
                deps.showActionPopup('PASTED');
            } else if (S.copySrc.kind === 'cut_clip') {
                deps.cutClip(S.copySrc.track, S.copySrc.clip, t, clipIdx);
                S.copySrc = { kind: 'clip', track: t, clip: clipIdx };
                deps.invalidateLEDCache();
                deps.forceRedraw();
                deps.showActionPopup('PASTED');
            } else if (S.copySrc.kind === 'drum_clip' && isDrumT) {
                deps.copyDrumClip(S.copySrc.track, S.copySrc.clip, t, clipIdx);
                deps.invalidateLEDCache();
                deps.forceRedraw();
                deps.showActionPopup('PASTED');
            } else if (S.copySrc.kind === 'cut_drum_clip' && isDrumT) {
                deps.cutDrumClip(S.copySrc.track, S.copySrc.clip, t, clipIdx);
                S.copySrc = { kind: 'drum_clip', track: t, clip: clipIdx };
                deps.invalidateLEDCache();
                deps.forceRedraw();
                deps.showActionPopup('PASTED');
            }
        } else if (S.shiftHeld && S.deleteHeld) {
            deps.hardResetClip(t, clipIdx);
            deps.forceRedraw();
            deps.showActionPopup('CLIP', 'CLEARED');
        } else if (S.deleteHeld) {
            deps.clearClip(t, clipIdx, true);
            deps.forceRedraw();
            deps.showActionPopup('SEQUENCE', 'CLEARED');
        } else {
            const isActiveClip = S.trackActiveClip[t] === clipIdx;
            if (S.shiftHeld) {
                const isPlaying = S.trackClipPlaying[t] && isActiveClip;
                const isWR = S.trackWillRelaunch[t] && isActiveClip;
                const isQueued = S.trackQueuedClip[t] === clipIdx;
                if (!isPlaying && !isWR && !isQueued) {
                    if (!S.playing) {
                        const prevClip = S.trackActiveClip[t];
                        S.trackActiveClip[t] = clipIdx;
                        S.trackCurrentPage[t] = S.trackPadMode[t] === deps.padModeDrum
                            ? 0
                            : Math.floor((S.clipLoopStart[t][clipIdx] | 0) / 16);
                        deps.refreshPerClipBankParams(t);
                        if (S.trackPadMode[t] === deps.padModeDrum && prevClip !== clipIdx) {
                            S.pendingDrumResync = 2;
                            S.pendingDrumResyncTrack = t;
                        }
                    }
                    if ((S.playing || deps.clipIsEmpty(t, clipIdx)) && deps.setParam)
                        deps.setParam('t' + t + '_launch_clip', String(clipIdx));
                }
                deps.handoffRecordingToTrack(t);
                deps.switchActiveTrack(t);
                deps.refreshPerClipBankParams(t);
                S.sessionView = false;
                S.shiftTrackLEDActive = false;
                deps.invalidateLEDCache();
                deps.forceRedraw();
            } else if (S.trackClipPlaying[t] && isActiveClip) {
                deps.handoffRecordingToTrack(t);
                deps.switchActiveTrack(t);
                deps.refreshPerClipBankParams(t);
                if (S.trackPendingPageStop[t]) {
                    if (deps.setParam) deps.setParam('t' + t + '_launch_clip', String(clipIdx));
                } else {
                    if (deps.setParam) deps.setParam('t' + t + '_stop_at_end', '1');
                }
            } else if (S.trackWillRelaunch[t] && isActiveClip) {
                deps.handoffRecordingToTrack(t);
                deps.switchActiveTrack(t);
                deps.refreshPerClipBankParams(t);
                if (deps.setParam) deps.setParam('t' + t + '_deactivate', '1');
            } else if (S.trackQueuedClip[t] === clipIdx) {
                deps.handoffRecordingToTrack(t);
                deps.switchActiveTrack(t);
                deps.refreshPerClipBankParams(t);
                if (deps.setParam) deps.setParam('t' + t + '_deactivate', '1');
            } else {
                deps.handoffRecordingToTrack(t);
                deps.switchActiveTrack(t);
                if (!S.playing) {
                    const prevClip = S.trackActiveClip[t];
                    S.trackActiveClip[t] = clipIdx;
                    S.trackCurrentPage[t] = 0;
                    if (S.trackPadMode[t] === deps.padModeDrum && prevClip !== clipIdx) {
                        S.pendingDrumResync = 2;
                        S.pendingDrumResyncTrack = t;
                    }
                }
                deps.refreshPerClipBankParams(t);
                if (deps.setParam) deps.setParam('t' + t + '_launch_clip', String(clipIdx));
            }
        }
        return true;
    }

    return true;
}

/**
 * @param {import('../types').State} S
 * @param {SessionViewDeps} deps
 * @param {number} rowIdx
 * @returns {boolean}
 */
export function handleSessionViewSideRowPress(S, deps, rowIdx) {
    const clipIdx = S.sceneRow + rowIdx;

    if (S.pendingSceneBakePicker) {
        S.pendingSceneBakePicker = false;
        S.confirmBakeScene = true;
        S.confirmBakeSceneWrapPhase = false;
        S.confirmBakeSceneSel = 1;
        S.confirmBakeSceneClip = clipIdx;
        S.screenDirty = true;
        return true;
    }

    if (S.pendingMergePlacement) {
        S.pendingMergePlacement = false;
        queueMergePlaceRowOperation(S, clipIdx);
        S.screenDirty = true;
        return true;
    }

    if (S.copyHeld) {
        if (S.copySrc && S.copySrc.kind === 'step') {
            /* Step copy in progress: swallow side rows so copy types do not mix. */
        } else if (S.sessionView) {
            if (!S.copySrc) {
                S.copySrc = S.shiftHeld
                    ? { kind: 'cut_row', row: clipIdx }
                    : { kind: 'row', row: clipIdx };
                deps.invalidateLEDCache();
                deps.showActionPopup(S.shiftHeld ? 'CUT' : 'COPIED');
            } else if (S.copySrc.kind === 'row') {
                deps.copyRow(S.copySrc.row, clipIdx);
                deps.invalidateLEDCache();
                deps.forceRedraw();
                deps.showActionPopup('PASTED');
            } else if (S.copySrc.kind === 'cut_row') {
                deps.cutRow(S.copySrc.row, clipIdx);
                S.copySrc = { kind: 'row', row: clipIdx };
                deps.invalidateLEDCache();
                deps.forceRedraw();
                deps.showActionPopup('PASTED');
            }
            /* Clip/cut_clip kinds: swallow so copy types do not mix. */
        }
        return true;
    }

    if (S.shiftHeld && S.deleteHeld) {
        if (S.sessionView) {
            for (let t = 0; t < deps.numTracks; t++) deps.hardResetClip(t, clipIdx);
            deps.forceRedraw();
            deps.showActionPopup('CLIPS', 'CLEARED');
        }
        return true;
    }

    if (S.deleteHeld) {
        if (S.sessionView) {
            deps.clearRow(clipIdx);
            deps.forceRedraw();
            deps.showActionPopup('SEQUENCES', 'CLEARED');
        }
        return true;
    }

    if (S.captureHeld) {
        S.captureUsedAsModifier = true;
        let scooped = 0;
        for (let t = 0; t < deps.numTracks; t++) {
            const isLive = (S.trackClipPlaying[t] && S.trackActiveClip[t] !== clipIdx)
                        || (S.trackQueuedClip[t] >= 0 && S.trackQueuedClip[t] !== clipIdx);
            if (!isLive) continue;
            const srcC = S.trackQueuedClip[t] >= 0 ? S.trackQueuedClip[t] : S.trackActiveClip[t];
            if (srcC === clipIdx) continue;
            if (!deps.trackClipHasContent(t, srcC)) continue;
            if (S.trackPadMode[t] === deps.padModeDrum) {
                deps.copyDrumClip(t, srcC, t, clipIdx);
            } else {
                deps.copyClip(t, srcC, t, clipIdx);
            }
            scooped++;
        }
        deps.invalidateLEDCache();
        deps.forceRedraw();
        if (scooped > 0) deps.showActionPopup('CAPTURED', 'TO ROW ' + (clipIdx + 1));
        else             deps.showActionPopup('NOTHING', 'TO CAPTURE');
        return true;
    }

    if (!S.sessionView) return false;

    S.sceneBtnFlashTick[3 - rowIdx] = S.tickCount;
    if (S.shiftHeld) queueQuantizedSceneLaunchOperation(S, clipIdx);
    else queueSceneLaunchOperation(S, clipIdx);
    return true;
}
