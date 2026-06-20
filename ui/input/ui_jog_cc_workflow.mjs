/* Jog-wheel CC handlers split out of _onCC_jog.
 *
 * The jog wheel emits two CCs: a physical CLICK (MoveMainButton = CC 3, fired
 * as d1=3 d2=127) and a relative ROTATE (MoveMainKnob = CC 14, d2 decoded by
 * decodeDelta into ±n). _onCC_jog ran one long ladder of click handlers, then a
 * second ladder of rotate handlers. Both ladders walk the same set of contexts
 * (inherit picker, snapshot picker, the various confirm dialogs, the global
 * menu, then free movement) in the same relative order, so each context is
 * extracted here as ONE handler that branches on click vs rotate internally.
 *
 * Each handler:
 *   - returns false when its context guard doesn't match (fall through to the
 *     next handler), and
 *   - returns true when it consumed the event (mirrors the original `return;`
 *     out of _onCC_jog).
 *
 * Dialog ordering note: the original click ladder checks LGTO before the
 * STATE-WIPE / REC-BLOCKED dialogs, while the rotate ladder checks them in the
 * opposite order. These are mutually-exclusive modal confirm dialogs (only one
 * is ever open), so a single dispatch order is behavior-preserving. We follow
 * the click order (LGTO first).
 *
 * Two contexts have split click/rotate priority and so are NOT combined:
 *   - the Arp-Steps interval overlay EXITS on rotate (highest priority) but
 *     TOGGLES on click (lowest priority) — see handleUiJogStepIntervalExit
 *     (dispatched first) vs handleUiJogStepIntervalToggle (dispatched late).
 *
 * Handlers take everything via deps so they can be unit-tested without the host. */

/* Arp-Steps interval overlay: a jog ROTATE exits the overlay (and swallows the
 * turn so the underlying bank param isn't nudged on exit). Dispatched first, to
 * mirror the original rotate ladder where stepIntervalMode is checked ahead of
 * every dialog. */
export function handleUiJogStepIntervalExit(S, deps, d1, d2) {
    if (d1 !== deps.moveMainKnob || !S.stepIntervalMode) return false;
    const delta = deps.decodeDelta(d2);
    if (delta !== 0) {
        S.stepIntervalMode = false;
        deps.computePadNoteMap();
        S.screenDirty = true;
        deps.forceRedraw();
    }
    return true;
}

/* Inherit picker (set-duplicate first run): rotate cycles the candidate index,
 * click confirms (last index = Start blank → -1). */
export function handleUiJogInheritPicker(S, deps, d1, d2) {
    if (!S.pendingInheritPicker) return false;
    if (d1 === 3 && d2 === 127) {
        const p = S.pendingInheritPicker;
        const action = (p.selectedIndex === p.candidates.length) ? -1 : p.selectedIndex;
        deps.resolveInheritPicker(action);
        return true;
    }
    if (d1 === deps.moveMainKnob) {
        const delta = deps.decodeDelta(d2);
        if (delta !== 0) {
            const p = S.pendingInheritPicker;
            const total = p.candidates.length + 1;
            p.selectedIndex = (p.selectedIndex + (delta > 0 ? 1 : total - 1)) % total;
            S.screenDirty = true;
        }
        return true;
    }
    return false;
}

/* Snapshot picker: rotate scrolls, click resolves/arms a confirm. */
export function handleUiJogSnapshotPicker(S, deps, d1, d2) {
    if (!S.snapshotPicker) return false;
    if (d1 === 3 && d2 === 127) {
        deps.snapshotPickerClick();
        return true;
    }
    if (d1 === deps.moveMainKnob) {
        deps.snapshotPickerRotate(deps.decodeDelta(d2));
        return true;
    }
    return false;
}

/* CLEAR AUTOMATION modal: rotate moves the cursor, click toggles a row /
 * executes CLEAR. */
export function handleUiJogClearAutoMenu(S, deps, d1, d2) {
    if (!S.clearAutoMenu) return false;
    if (d1 === 3 && d2 === 127) {
        deps.clearAutoMenuClick();
        return true;
    }
    if (d1 === deps.moveMainKnob) {
        deps.clearAutoMenuRotate(deps.decodeDelta(d2));
        return true;
    }
    return false;
}

/* Scene bake confirm: two-phase jog flow — loop count, then wrap yes/no. */
export function handleUiJogBakeScene(S, deps, d1, d2) {
    if (!S.confirmBakeScene) return false;
    if (d1 === 3 && d2 === 127) {
        if (S.confirmBakeSceneWrapPhase) {
            /* Wrap dialog: 0=YES, 1=NO, 2=CANCEL */
            if (S.confirmBakeSceneWrapSel < 2) {
                const _wrap = S.confirmBakeSceneWrapSel === 0 ? 1 : 0;
                S.pendingDefaultSetParams.push({
                    key: 'bake_scene',
                    val: S.confirmBakeSceneClip + ' ' + S.confirmBakeSceneLoops + ' ' + _wrap
                });
                S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
                deps.showActionPopup('SCENE', 'BAKED');
                S.pendingSceneBakeResync = 2;
                S.pendingSceneBakeClip   = S.confirmBakeSceneClip;
            }
            S.confirmBakeSceneWrapPhase = false;
            S.confirmBakeScene          = false;
            S.screenDirty               = true;
            return true;
        }
        if (S.confirmBakeSceneSel > 0) {
            /* Advance to wrap phase, hold loop count for the commit step. */
            S.confirmBakeSceneLoops     = [1, 2, 4][S.confirmBakeSceneSel - 1];
            S.confirmBakeSceneWrapPhase = true;
            S.confirmBakeSceneWrapSel   = 1; /* default: NO */
            S.screenDirty               = true;
            return true;
        }
        S.confirmBakeScene = false;
        S.screenDirty      = true;
        return true;
    }
    if (d1 === deps.moveMainKnob) {
        const delta = deps.decodeDelta(d2);
        if (delta !== 0) {
            if (S.confirmBakeSceneWrapPhase)
                S.confirmBakeSceneWrapSel = (S.confirmBakeSceneWrapSel + (delta > 0 ? 1 : 2)) % 3;
            else
                S.confirmBakeSceneSel = (S.confirmBakeSceneSel + (delta > 0 ? 1 : 3)) % 4;
            S.screenDirty = true;
        }
        return true;
    }
    return false;
}

/* Lgto confirm: rotate flips OK/CANCEL, click commits (OK applies, CANCEL
 * aborts). */
export function handleUiJogConfirmLgto(S, deps, d1, d2) {
    if (!S.confirmLgto) return false;
    if (d1 === 3 && d2 === 127) {
        const _sel = S.confirmLgtoSel | 0;
        S.confirmLgto = false;
        if (_sel === 0 && deps.setParam) {
            const _t = S.activeTrack;
            if (S.confirmLgtoIsDrum) {
                const _l = S.activeDrumLane[_t];
                deps.setParam('t' + _t + '_l' + _l + '_lgto_apply', '1');
                S.pendingDrumResync      = 2;
                S.pendingDrumResyncTrack = _t;
            } else {
                deps.setParam('t' + _t + '_lgto_apply', '1');
                S.pendingStepsReread      = 2;
                S.pendingStepsRereadTrack = _t;
                S.pendingStepsRereadClip  = S.trackActiveClip[_t];
            }
            S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
            deps.showActionPopup('LGTO', 'APPLIED');
        }
        S.screenDirty = true;
        deps.forceRedraw();
        return true;
    }
    if (d1 === deps.moveMainKnob) {
        const delta = deps.decodeDelta(d2);
        if (delta !== 0) {
            S.confirmLgtoSel = S.confirmLgtoSel === 0 ? 1 : 0;
            S.screenDirty = true;
        }
        return true;
    }
    return false;
}

/* State version mismatch dialog: rotate flips Yes/No, click commits
 * (Yes = wipe + clean start; No = exit module). */
export function handleUiJogStateWipe(S, deps, d1, d2) {
    if (!S.confirmStateWipe) return false;
    if (d1 === 3 && d2 === 127) {
        S.confirmStateWipe = false;
        if (S.confirmStateWipeSel === 0) {
            S.pendingSetLoad = true;
        } else {
            deps.removeFlagsWrap();
            deps.clearAllLEDs();
            if (deps.exitModule) deps.exitModule();
        }
        S.screenDirty = true;
        deps.forceRedraw();
        return true;
    }
    if (d1 === deps.moveMainKnob) {
        const delta = deps.decodeDelta(d2);
        if (delta !== 0) {
            S.confirmStateWipeSel = S.confirmStateWipeSel === 0 ? 1 : 0;
            S.screenDirty = true;
        }
        return true;
    }
    return false;
}

/* REC Unavailable dialog: rotate flips OK/BAKE NOW, click commits (OK = dismiss,
 * BAKE NOW = open standard bake confirm pre-targeted at active clip). */
export function handleUiJogRecordBlocked(S, deps, d1, d2) {
    if (!S.recordBlockedDialog) return false;
    if (d1 === 3 && d2 === 127) {
        const _sel = S.recordBlockedDialogSel | 0;
        S.recordBlockedDialog = false;
        if (_sel === 1) {
            /* Open bake confirm at active clip — same path as Capture-bare-tap. */
            const _bt = S.activeTrack, _bc = S.trackActiveClip[_bt];
            const _isDrum = S.trackPadMode[_bt] === deps.padModeDrum;
            S.confirmBake             = true;
            S.confirmBakeIsDrum       = _isDrum;
            S.confirmBakeIsMultiLoop  = !_isDrum;
            S.confirmBakeSel          = _isDrum ? 2 : 1;
            S.confirmBakeTrack        = _bt;
            S.confirmBakeClip         = _bc;
            S.confirmBakeDrumLoopOpen = false;
            S.confirmBakeWrapPhase    = false;
        }
        S.screenDirty = true;
        deps.forceRedraw();
        return true;
    }
    if (d1 === deps.moveMainKnob) {
        const delta = deps.decodeDelta(d2);
        if (delta !== 0) {
            S.recordBlockedDialogSel = S.recordBlockedDialogSel === 0 ? 1 : 0;
            S.screenDirty = true;
        }
        return true;
    }
    return false;
}

/* Bake confirm: multi-phase (drum CLIP/LANE → loop count → wrap, or melodic
 * single/multi-loop → wrap). Rotate moves the active selection for whichever
 * phase is open; click commits/advances/cancels. */
export function handleUiJogBakeConfirm(S, deps, d1, d2) {
    if (!S.confirmBake) return false;
    if (d1 === 3 && d2 === 127) {
        if (S.confirmBakeWrapPhase) {
            /* Wrap dialog: 0=YES, 1=NO, 2=CANCEL */
            if (S.confirmBakeWrapSel < 2) {
                const _wrap = S.confirmBakeWrapSel === 0 ? 1 : 0;
                const _loops = S.confirmBakeLoops;
                if (S.confirmBakeIsDrum) {
                    const _laneArg = S.confirmBakeDrumMode === 1 ? ' ' + S.activeDrumLane[S.confirmBakeTrack] : ' 0';
                    S.pendingDefaultSetParams.push({
                        key: 'bake',
                        val: S.confirmBakeTrack + ' ' + S.confirmBakeClip + ' ' + S.confirmBakeDrumMode + ' ' + _loops + _laneArg + ' ' + _wrap
                    });
                    S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
                    deps.showActionPopup('BAKED', _loops + 'x');
                    S.pendingBankRefresh = S.confirmBakeTrack;
                    if (S.confirmBakeClip === S.trackActiveClip[S.confirmBakeTrack]) {
                        S.pendingDrumResync      = 2;
                        S.pendingDrumResyncTrack = S.confirmBakeTrack;
                    }
                } else {
                    S.pendingDefaultSetParams.push({
                        key: 'bake',
                        val: S.confirmBakeTrack + ' ' + S.confirmBakeClip + ' 0 ' + _loops + ' 0 ' + _wrap
                    });
                    S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
                    deps.showActionPopup('BAKED', _loops + 'x');
                    S.pendingBankRefresh      = S.confirmBakeTrack;
                    S.pendingStepsReread      = 2;
                    S.pendingStepsRereadTrack = S.confirmBakeTrack;
                    S.pendingStepsRereadClip  = S.confirmBakeClip;
                }
            }
            S.confirmBakeWrapPhase    = false;
            S.confirmBakeDrumLoopOpen = false;
            S.confirmBake  = false;
            S.screenDirty  = true;
            return true;
        }
        if (S.confirmBakeIsMultiLoop) {
            if (S.confirmBakeSel > 0) {
                /* advance to wrap dialog */
                S.confirmBakeLoops     = [1, 2, 4][S.confirmBakeSel - 1];
                S.confirmBakeWrapPhase = true;
                S.confirmBakeWrapSel   = 1; /* default: NO */
                S.screenDirty = true;
                return true;
            }
        } else if (!S.confirmBakeIsDrum) {
            if (S.confirmBakeSel === 0) {
                deps.setParam('bake', S.confirmBakeTrack + ' ' + S.confirmBakeClip);
                S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
                deps.showActionPopup('BAKED');
                S.pendingBankRefresh = S.confirmBakeTrack;
                S.pendingStepsReread      = 2;
                S.pendingStepsRereadTrack = S.confirmBakeTrack;
                S.pendingStepsRereadClip  = S.confirmBakeClip;
            }
        } else if (S.confirmBakeDrumLoopOpen) {
            /* drum step 2: loop count — 0=CANCEL, 1-3 = 1x/2x/4x → wrap dialog */
            if (S.confirmBakeDrumLoopSel > 0) {
                S.confirmBakeLoops     = [1, 2, 4][S.confirmBakeDrumLoopSel - 1];
                S.confirmBakeWrapPhase = true;
                S.confirmBakeWrapSel   = 1; /* default: NO */
                S.screenDirty = true;
                return true;
            }
            S.confirmBakeDrumLoopOpen = false;
            S.confirmBake = false;
            S.screenDirty = true;
            return true;
        } else {
            /* drum step 1: 0=CLIP, 1=LANE, 2=CANCEL */
            if (S.confirmBakeSel < 2) {
                S.confirmBakeDrumMode     = S.confirmBakeSel === 0 ? 2 : 1;
                S.confirmBakeDrumLoopOpen = true;
                S.confirmBakeDrumLoopSel  = 1;
                S.screenDirty = true;
                return true;
            }
        }
        S.confirmBake = false;
        S.screenDirty = true;
        return true;
    }
    if (d1 === deps.moveMainKnob) {
        const delta = deps.decodeDelta(d2);
        if (delta !== 0) {
            if (S.confirmBakeWrapPhase) {
                S.confirmBakeWrapSel = (S.confirmBakeWrapSel + (delta > 0 ? 1 : 2)) % 3;
            } else if (S.confirmBakeIsDrum && S.confirmBakeDrumLoopOpen) {
                S.confirmBakeDrumLoopSel = (S.confirmBakeDrumLoopSel + (delta > 0 ? 1 : 3)) % 4;
            } else if (S.confirmBakeIsDrum) {
                S.confirmBakeSel = (S.confirmBakeSel + (delta > 0 ? 1 : 2)) % 3;
            } else if (S.confirmBakeIsMultiLoop) {
                S.confirmBakeSel = (S.confirmBakeSel + (delta > 0 ? 1 : 3)) % 4;
            } else {
                S.confirmBakeSel = S.confirmBakeSel === 0 ? 1 : 0;
            }
            S.screenDirty = true;
        }
        return true;
    }
    return false;
}

/* Tap-tempo overlay: click closes it; rotate (unshifted) nudges BPM. NOTE: a
 * SHIFTED rotate is intentionally NOT consumed here — it falls through to the
 * movement handler so Shift+jog still steps the active track while tap-tempo is
 * open. */
export function handleUiJogTapTempo(S, deps, d1, d2) {
    if (!S.tapTempoOpen) return false;
    if (d1 === 3 && d2 === 127) {
        deps.closeTapTempo();
        S.screenDirty = true;
        return true;
    }
    if (d1 === deps.moveMainKnob && !S.shiftHeld) {
        const delta = deps.decodeDelta(d2);
        if (delta !== 0) {
            S.tapTempoBpm = Math.max(40, Math.min(250, S.tapTempoBpm + delta));
            if (deps.setParam) deps.setParam('bpm', String(S.tapTempoBpm));
            S.screenDirty = true;
        }
        return true;
    }
    return false;
}

/* Global menu (Menu button): click commits whichever sub-dialog / menu item is
 * active (route check, export-done, clear/save/convert/export/xpose confirms,
 * Key/Scale enum finalize, or generic menu input); rotate scrolls the active
 * sub-dialog / edits the active value/enum item / navigates the menu. */
export function handleUiJogGlobalMenu(S, deps, d1, d2) {
    if (!S.globalMenuOpen) return false;
    if (d1 === 3 && d2 === 127) {
        if (S.routeCheckOpen) {
            S.routeCheckOpen = false;
            S.screenDirty = true;
            return true;
        }
        if (S.exportDoneDialog) {            /* OK dismiss */
            S.exportDoneDialog = false;
            S.globalMenuOpen   = false;
            S.screenDirty = true;
            return true;
        }
        if (S.confirmClearSession) {
            if (S.confirmClearSel === 0) deps.doClearSession();
            else { S.confirmClearSession = false; }
            S.screenDirty = true;
            return true;
        }
        if (S.confirmSaveState) {
            const _yes = S.confirmSaveSel === 0;
            S.confirmSaveState = false;
            if (_yes) deps.openSaveSnapshot();
            S.screenDirty = true;
            return true;
        }
        if (S.confirmConvertToDrum) {
            const _ct = S.confirmConvertTrack;
            const _yes = S.confirmConvertToDrumSel === 0;
            deps.closeConvertConfirm();
            /* Defer to tick() — this runs in the on_midi path where get_param
             * (inside convertTrackType -> syncClipsFromDsp) returns null. */
            if (_yes) S.pendingTrackConvert = { t: _ct, toDrum: true };
            S.screenDirty = true;
            return true;
        }
        if (S.confirmExport) {
            if (S.confirmExportSel === 0) deps.confirmExportStart();   /* arms pendingExport, drained in tick() */
            else S.confirmExport = false;
            S.screenDirty = true;
            return true;
        }
        if (S.confirmXpose) {                 /* "Transpose all clips?" Yes/No */
            if (S.confirmXposeSel === 0) deps.xposeCommit(S.confirmXposeKey, S.confirmXposeScale);
            else                         deps.xposeCancelPreview();
            S.confirmXpose = false;
            if (S.globalMenuState) { S.globalMenuState.editing = false; S.globalMenuState.editValue = null; }
            S.lastSentMenuEditValue = null; S.bpmWasEditing = false;
            S.screenDirty = true;
            return true;
        }
        /* Key/Scale: intercept the click that would finalize the enum edit.
         * No change → exit. Has melodic notes → confirm. Empty → commit silently. */
        {
            const _it = (S.globalMenuState && S.globalMenuItems)
                        ? S.globalMenuItems[S.globalMenuState.selectedIndex] : null;
            if (_it && _it.type === 'action' && _it.onAction) {
                S.globalMenuState.editing = false;
                S.globalMenuState.editValue = null;
                _it.onAction();
                S.screenDirty = true;
                return true;
            }
            if (_it && S.globalMenuState.editing && (_it.label === 'Key' || _it.label === 'Scale')) {
                const ev    = S.globalMenuState.editValue !== null ? S.globalMenuState.editValue : _it.get();
                const candK = _it.label === 'Key'   ? ev : S.padKey;
                const candS = _it.label === 'Scale' ? ev : S.padScale;
                if (candK === S.padKey && candS === S.padScale) {
                    deps.xposeCancelPreview();
                    S.globalMenuState.editing = false; S.globalMenuState.editValue = null;
                    S.lastSentMenuEditValue = null; S.bpmWasEditing = false;
                } else if (deps.anyMelodicClipHasContent()) {
                    S.confirmXpose = true; S.confirmXposeSel = 0;
                    S.confirmXposeKey = candK; S.confirmXposeScale = candS;
                    /* keep editing + preview armed under the dialog */
                } else {
                    deps.xposeCommit(candK, candS);
                    S.globalMenuState.editing = false; S.globalMenuState.editValue = null;
                    S.lastSentMenuEditValue = null; S.bpmWasEditing = false;
                }
                S.screenDirty = true;
                return true;
            }
        }
        deps.handleMenuInput({
            cc: 3, value: d2,
            items: S.globalMenuItems, state: S.globalMenuState, stack: S.globalMenuStack,
            onBack: function() { S.globalMenuOpen = false; },
            shiftHeld: S.shiftHeld
        });
        S.screenDirty = true;
        return true;
    }
    if (d1 === deps.moveMainKnob) {
        deps.ensureGlobalMenuFresh();
        if (S.routeCheckOpen) {
            const delta = deps.decodeDelta(d2);
            if (delta !== 0) {
                S.routeCheckSelected = Math.max(0, Math.min(7, (S.routeCheckSelected | 0) + delta));
                S.screenDirty = true;
            }
        } else if (S.exportDoneDialog) {
            /* single OK button — jog does nothing */
        } else if (S.confirmClearSession) {
            const delta = deps.decodeDelta(d2);
            if (delta !== 0) { S.confirmClearSel = S.confirmClearSel === 0 ? 1 : 0; S.screenDirty = true; }
        } else if (S.confirmSaveState) {
            const delta = deps.decodeDelta(d2);
            if (delta !== 0) { S.confirmSaveSel = S.confirmSaveSel === 0 ? 1 : 0; S.screenDirty = true; }
        } else if (S.confirmConvertToDrum) {
            const delta = deps.decodeDelta(d2);
            if (delta !== 0) { S.confirmConvertToDrumSel = S.confirmConvertToDrumSel === 0 ? 1 : 0; S.screenDirty = true; }
        } else if (S.confirmExport) {
            const delta = deps.decodeDelta(d2);
            if (delta !== 0) { S.confirmExportSel = S.confirmExportSel === 0 ? 1 : 0; S.screenDirty = true; }
        } else if (S.confirmXpose) {
            const delta = deps.decodeDelta(d2);
            if (delta !== 0) { S.confirmXposeSel = S.confirmXposeSel === 0 ? 1 : 0; S.screenDirty = true; }
        } else if (S.globalMenuState.editing) {
            const delta = deps.decodeDelta(d2);
            if (delta !== 0) {
                const item = S.globalMenuItems[S.globalMenuState.selectedIndex];
                if (item && item.type === 'value') {
                    const cur = S.globalMenuState.editValue !== null ? S.globalMenuState.editValue : item.get();
                    S.globalMenuState.editValue = Math.min(item.max, Math.max(item.min, cur + delta));
                } else if (item && item.type === 'enum') {
                    const opts = item.options || [];
                    const idx  = opts.indexOf(S.globalMenuState.editValue);
                    const sign = delta > 0 ? 1 : -1;
                    S.globalMenuState.editValue = opts[((idx + sign) % opts.length + opts.length) % opts.length];
                }
                S.screenDirty = true;
            }
        } else {
            deps.handleMenuInput({
                cc: deps.moveMainKnob, value: d2,
                items: S.globalMenuItems, state: S.globalMenuState, stack: S.globalMenuStack,
                onBack: function() { S.globalMenuOpen = false; },
                shiftHeld: false
            });
            S.screenDirty = true;
        }
        return true;
    }
    return false;
}

export function handleUiJogSchwungSoundPage(S, deps, d1, d2) {
    if (!S.schwungSoundPage) return false;
    if (d1 === 3 && d2 === 127) {
        if (S.schwungSoundPage.browser) deps.applySchwungSoundBrowserSelection();
        else if (S.shiftHeld) {
            const track = S.schwungSoundPage.track | 0;
            const slot = S.schwungSoundPage.slot | 0;
            deps.closeSchwungSoundPage();
            deps.enterSchwungCoRun(track, slot);
        }
        else {
            const result = deps.openSchwungSoundBrowser();
            if (result && result.deepEdit) {
                const track = result.track | 0;
                const slot = result.slot | 0;
                deps.closeSchwungSoundPage();
                deps.enterSchwungCoRun(track, slot);
            }
        }
        deps.forceRedraw();
        return true;
    }
    if (d1 === deps.moveMainKnob) {
        deps.rotateSchwungSoundPage(deps.decodeDelta(d2));
        deps.forceRedraw();
        return true;
    }
    return false;
}

/* Shift+Delete+jog (click) in Track View: full clip/lane param reset.
 * Drum: real-time FX banks + Dir/RvSt/SqFl. Melodic: NOTE FX + HARMZ + MIDI DLY
 * + SEQ ARP + all automation. Click-only. */
export function handleUiJogShiftDeleteReset(S, deps, d1, d2) {
    if (!(d1 === 3 && d2 === 127 && S.shiftHeld && S.deleteHeld && !S.sessionView)) return false;
    if (S.trackPadMode[S.activeTrack] === deps.padModeDrum) {
        /* Drum: Shift+Delete+jog = reset all real-time FX banks + Dir/RvSt/SqFl */
        const _dt = S.activeTrack, _dl = S.activeDrumLane[_dt], _dac = deps.effectiveClip(_dt);
        deps.resetFxBanks(_dt);
        S.drumLanePlaybackDir[_dt][_dl] = 0;
        S.drumLanePlaybackAudioReverse[_dt][_dl] = 0;
        S.bankParams[_dt][0][6] = 0;
        S.clipSeqFollow[_dt][_dac] = true;
        S.bankParams[_dt][0][7] = 1;
        S.pendingDefaultSetParams.push({ key: 't' + _dt + '_l' + _dl + '_playback_dir', val: '0' });
        S.pendingDefaultSetParams.push({ key: 't' + _dt + '_l' + _dl + '_playback_audio_reverse', val: '0' });
        deps.showActionPopup('LANE PARAMS', 'RESET');
    } else {
        /* Melodic: full reset — NOTE FX, HARMZ, MIDI DLY, + SEQ ARP */
        const _arpTrack = S.activeTrack;
        const _arpParams = Array.from({length: 8}, function(_, k) {
            const pm = deps.banks[4].knobs[k]; return pm ? S.bankParams[_arpTrack][4][k] : 0;
        });
        deps.resetFxBanks(_arpTrack);
        for (let k = 0; k < 8; k++) {
            const pm = deps.banks[4].knobs[k];
            if (pm) S.bankParams[_arpTrack][4][k] = pm.def;
        }
        /* Bank reset also clears ALL automation (CC + AT, + PB later) for the clip. */
        const _ac2 = deps.effectiveClip(_arpTrack);
        S.trackCCAutoBits[_arpTrack][_ac2] = 0;
        S.trackCCLiveVal[_arpTrack] = new Array(8).fill(-1);
        S.clipCCVal[_arpTrack][_ac2] = new Array(8).fill(-1);
        S.clipAtHas[_arpTrack][_ac2] = false;
        S.pendingDefaultSetParams.push({ key: 't' + _arpTrack + '_cc_auto_clear', val: String(_ac2) });
        S.pendingDefaultSetParams.push({ key: 't' + _arpTrack + '_c' + _ac2 + '_at_clear', val: '1' });
        S.undoSeqArpSnapshot = { track: _arpTrack, params: _arpParams };
        const _mac = deps.effectiveClip(_arpTrack);
        S.clipPlaybackDir[_arpTrack][_mac] = 0;
        S.clipPlaybackAudioReverse[_arpTrack][_mac] = 0;
        S.bankParams[_arpTrack][0][6] = 0;
        S.clipSeqFollow[_arpTrack][_mac] = true;
        S.bankParams[_arpTrack][0][7] = 1;
        S.pendingDefaultSetParams.push({ key: 't' + _arpTrack + '_clip_playback_dir', val: '0' });
        S.pendingDefaultSetParams.push({ key: 't' + _arpTrack + '_clip_playback_audio_reverse', val: '0' });
        deps.showActionPopup('CLIP PARAMS', 'RESET');
    }
    return true;
}

/* Delete+jog (click) in Track View: scoped reset of the active bank/context.
 * CC PARAM bank (6) clears all automation; drum Rpt mode resets lane groove;
 * drum normal resets the active real-time FX bank; ARP IN (5) resets TARP;
 * melodic resets FX banks + Dir/RvSt/SqFl. Click-only. */
export function handleUiJogDeleteReset(S, deps, d1, d2) {
    if (!(d1 === 3 && d2 === 127 && S.deleteHeld && !S.sessionView)) return false;
    /* CC PARAM bank (bank 6): Delete+jog clears all CC automation for the
     * active clip. This branch must run regardless of pad mode or drum
     * perform mode — previously it was nested inside the melodic branch,
     * so on a drum track in Rpt mode it was silently shadowed by the
     * repeat-groove reset path. */
    if (S.activeBank === 6) {
        /* AUTOMATION bank: Delete+jog clears ALL automation types for the
         * active clip (CC + AT, and PB once implemented). */
        const _t = S.activeTrack, _c = deps.effectiveClip(_t);
        S.trackCCAutoBits[_t][_c] = 0;
        S.trackCCLiveVal[_t] = new Array(8).fill(-1);
        /* Reset the resting values too → "—" (cc_auto_clear clears both
         * automation and rest_val DSP-side). */
        S.clipCCVal[_t][_c] = new Array(8).fill(-1);
        S.clipAtHas[_t][_c] = false;
        /* Defer clear pushes — synchronous from jog handler coalesces. */
        S.pendingDefaultSetParams.push({ key: 't' + _t + '_cc_auto_clear', val: String(_c) });
        S.pendingDefaultSetParams.push({ key: 't' + _t + '_c' + _c + '_at_clear', val: '1' });
        deps.showActionPopup('AUTOMATION', 'CLEAR');
        deps.invalidateLEDCache();
        return true;
    }
    if (S.trackPadMode[S.activeTrack] === deps.padModeDrum) {
        if (S.drumPerformMode[S.activeTrack] > 0) {
            /* Rpt/Rpt2 mode: Delete+jog = reset current lane groove params */
            const _rt = S.activeTrack;
            const _rl = S.activeDrumLane[_rt];
            deps.resetDrumRepeatGrooveForLane(_rt, _rl);
        } else {
            /* Drum: Delete+jog = reset only the active real-time FX bank + Dir/RvSt/SqFl */
            const REAL_TIME_BANKS = [1, 2, 3];
            if (REAL_TIME_BANKS.indexOf(S.activeBank) >= 0) {
                deps.resetSingleFxBank(S.activeTrack, S.activeBank);
            }
            const _bt = S.activeTrack, _bl = S.activeDrumLane[_bt], _bac = deps.effectiveClip(_bt);
            S.drumLanePlaybackDir[_bt][_bl] = 0;
            S.drumLanePlaybackAudioReverse[_bt][_bl] = 0;
            S.bankParams[_bt][0][6] = 0;
            S.clipSeqFollow[_bt][_bac] = true;
            S.bankParams[_bt][0][7] = 1;
            S.pendingDefaultSetParams.push({ key: 't' + _bt + '_l' + _bl + '_playback_dir', val: '0' });
            S.pendingDefaultSetParams.push({ key: 't' + _bt + '_l' + _bl + '_playback_audio_reverse', val: '0' });
            deps.showActionPopup('BANK RESET');
        }
    } else if (S.activeBank === 5) {
        /* ARP IN bank: dedicated reset that clears every TARP param
         * (style/rate/oct/gate/steps_mode/retrigger/latch/sync + step arrays
         * + loop length). Shift+Delete+jog (above) intentionally leaves
         * ARP IN alone. */
        deps.resetTarp(S.activeTrack);
        deps.showActionPopup('ARP IN', 'RESET');
    } else {
        const _mt = S.activeTrack, _mac2 = deps.effectiveClip(_mt);
        deps.resetFxBanks(_mt);
        S.undoSeqArpSnapshot = null;
        S.clipPlaybackDir[_mt][_mac2] = 0;
        S.clipPlaybackAudioReverse[_mt][_mac2] = 0;
        S.bankParams[_mt][0][6] = 0;
        S.clipSeqFollow[_mt][_mac2] = true;
        S.bankParams[_mt][0][7] = 1;
        S.pendingDefaultSetParams.push({ key: 't' + _mt + '_clip_playback_dir', val: '0' });
        S.pendingDefaultSetParams.push({ key: 't' + _mt + '_clip_playback_audio_reverse', val: '0' });
        deps.showActionPopup('BANK RESET');
    }
    return true;
}

/* Plain jog click on SEQ ARP (bank 4) or TARP (bank 5) in Track View toggles
 * the Arp Steps interval-edit overlay. Click-only; dispatched late (the rotate
 * EXIT is a separate, high-priority handler). */
export function handleUiJogStepIntervalToggle(S, deps, d1, d2) {
    if (!(d1 === 3 && d2 === 127 && !S.shiftHeld && !S.deleteHeld && !S.copyHeld && !S.muteHeld &&
            !S.sessionView && S.trackPadMode[S.activeTrack] !== deps.padModeDrum &&
            (S.activeBank === 4 || S.activeBank === 5))) return false;
    S.stepIntervalMode = !S.stepIntervalMode;
    /* Repush padmap so pads stop dispatching notes while the overlay is on. */
    deps.computePadNoteMap();
    S.screenDirty = true;
    deps.forceRedraw();
    return true;
}

/* Plain jog click on an alt-param bank: toggle sticky alt-param mode. On a drum
 * ALL LANES bank (7) that isn't yet confirmed, the first click confirms it
 * instead. Click-only. */
export function handleUiJogAltToggle(S, deps, d1, d2) {
    if (!(d1 === 3 && d2 === 127 && !S.shiftHeld && !S.deleteHeld && !S.copyHeld && !S.muteHeld &&
            !S.sessionView && deps.bankHasAltParams(S.activeTrack, S.activeBank))) return false;
    if (S.trackPadMode[S.activeTrack] === deps.padModeDrum && S.activeBank === 7 && !S.allLanesConfirmed) {
        S.allLanesConfirmed = true;
        S.screenDirty = true;
        deps.forceRedraw();
        return true;
    }
    S.altMode = !S.altMode;
    S.screenDirty = true;
    deps.forceRedraw();
    return true;
}

/* Free jog ROTATE (no dialog open): Shift = step active track; Session View =
 * scroll scene rows; Loop held = loop length (delegated); held step = step
 * gate/length; otherwise = cycle banks. Always swallows a rotate that reached
 * it (mirrors the original `if (d1 === MoveMainKnob) { ...; return; }`). */
export function handleUiJogMovement(S, deps, d1, d2) {
    if (d1 !== deps.moveMainKnob) return false;
    const delta = deps.decodeDelta(d2);
    if (delta !== 0) {
        if (S.shiftHeld) {
            /* Shift + jog (any view): step active track 0–7, clamp at ends */
            const next = Math.min(deps.numTracks - 1, Math.max(0, S.activeTrack + delta));
            if (next !== S.activeTrack) {
                deps.extNoteOffAll();
                deps.handoffRecordingToTrack(next);
                deps.switchActiveTrack(next);
                if (S.trackPadMode[next] === deps.padModeDrum) {
                    if (S.activeBank === 2 || S.activeBank === 4) S.activeBank = 0;
                    deps.resyncDrumTrack(next);
                } else {
                    if (S.activeBank === 7) S.activeBank = 0;
                    deps.refreshPerClipBankParams(next);
                }
                deps.computePadNoteMap();
                S.seqActiveNotes.clear();
                S.seqLastStep = -1;
                S.seqLastClip = -1;
                deps.forceRedraw();
            }
        } else if (S.sessionView) {
            S.sceneRow = Math.min(deps.numClips - 4, Math.max(0, S.sceneRow + delta));
            deps.forceRedraw();
        } else if (S.loopHeld) {
            deps.handleLoopJog(delta);
        } else if (S.heldStep >= 0) {
            /* Change #3: a held step reserves the jog for step LENGTH
             * (Move's "hold step + wheel = length"), so it no longer
             * silently falls through to bank-cycling underneath the Step
             * Edit overlay. Only writes when the held step has content; on
             * an empty step the jog is simply inert (but never cycles banks). */
            const _t    = S.activeTrack;
            const _drm  = S.trackPadMode[_t] === deps.padModeDrum;
            const _ac   = deps.effectiveClip(_t);
            const _lane = S.activeDrumLane[_t];
            const _hasContent = _drm
                ? (S.drumLaneSteps[_t][_lane][S.heldStep] !== '0')
                : (S.heldStepNotes.length > 0);
            if (_hasContent) {
                const _tps  = (_drm ? S.drumLaneTPS[_t] : S.clipTPS[_t][_ac]) || 24;
                const _gmax = Math.min(65535, 256 * _tps);
                const _stps = S.stepEditGate / _tps;
                const _inc  = _stps <= 16 ? Math.round(_tps / 4) : _stps <= 64 ? _tps : _tps * 8;
                let _nv = S.stepEditGate + delta * _inc;
                if (_inc > 1) _nv = Math.round(_nv / _inc) * _inc;
                S.stepEditGate = Math.max(1, Math.min(_gmax, _nv));
                const _key = _drm
                    ? 't' + _t + '_l' + _lane + '_step_' + S.heldStep + '_gate'
                    : 't' + _t + '_c' + _ac + '_step_' + S.heldStep + '_gate';
                if (deps.setParam)
                    deps.setParam(_key, String(S.stepEditGate));
                deps.forceRedraw();
            }
        } else {
            const cur = S.activeBank;
            const isDrumJog = S.trackPadMode[S.activeTrack] === deps.padModeDrum;
            let next;
            if (isDrumJog) {
                /* Drum bank order: ALL LANES(7) → DRUM LANE(0) → NOTE FX(1) → MIDI DLY(3) → RPT GROOVE(5) → CC PARAM(6) */
                const DRUM_BANK_ORDER = [7, 0, 1, 3, 5, 6];
                const ci = DRUM_BANK_ORDER.indexOf(cur);
                const ni = Math.max(0, Math.min(DRUM_BANK_ORDER.length - 1, (ci >= 0 ? ci : 0) + delta));
                next = DRUM_BANK_ORDER[ni];
            } else {
                next = Math.min(6, Math.max(0, cur + delta));
            }
            if (next !== cur) {
                S.activeBank = next;
                S.trackActiveBank[S.activeTrack] = next;
                if (next === 7) S.allLanesConfirmed = false;
                if (next === 6) S.schLabelFetchLane = 0;
                deps.readBankParams(S.activeTrack, next);
                S.bankSelectTick = S.tickCount;
                deps.writeSidecar();
                deps.forceRedraw();
            }
        }
    }
    return true;
}
