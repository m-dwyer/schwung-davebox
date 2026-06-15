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
            S.pendingDefaultSetParams.push({ key: 'snap_delete', val: String(idx) });
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
        S.pendingDefaultSetParams.push({ key: 'merge_place_row', val: String(idx) });
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
        S.pendingDefaultSetParams.push({ key: 'launch_scene', val: String(idx) });
    }
    return true;
}

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
            S.pendingDefaultSetParams.push({ key: 'snap_load', val: String(btn) });
        }
    }

    deps.forceRedraw();
    return true;
}
