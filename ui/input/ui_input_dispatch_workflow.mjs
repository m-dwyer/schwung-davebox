import {
    handleUiCaptureButton,
    handleUiCopyButton,
    handleUiDeleteButton,
    handleUiLoopPerfModeButton,
    handleUiLoopTrackViewButton,
    handleUiMenuCoRunExitButton,
    handleUiMuteModifierButton,
    handleUiNoteSessionButton,
    handleUiShiftButton
} from './ui_button_cc_workflow.mjs';
import {
    handleUiJogAltToggle,
    handleUiJogBakeConfirm,
    handleUiJogBakeScene,
    handleUiJogClearAutoMenu,
    handleUiJogConfirmLgto,
    handleUiJogDeleteReset,
    handleUiJogGlobalMenu,
    handleUiJogInheritPicker,
    handleUiJogMovement,
    handleUiJogRecordBlocked,
    handleUiJogShiftDeleteReset,
    handleUiJogSnapshotPicker,
    handleUiJogStateWipe,
    handleUiJogStepIntervalExit,
    handleUiJogStepIntervalToggle,
    handleUiJogTapTempo
} from './ui_jog_cc_workflow.mjs';
import {
    handleUiKnobAltDelayClockFb,
    handleUiKnobAltRandomMode,
    handleUiKnobCcParam,
    handleUiKnobDrumAllLanes,
    handleUiKnobDrumClip,
    handleUiKnobDrumNoteFX,
    handleUiKnobDrumRepeatGroove,
    handleUiKnobGeneric,
    handleUiKnobMelodicInQ,
    handleUiKnobOverlaySwallow,
    handleUiKnobStepInterval
} from './ui_knob_cc_workflow.mjs';
import {
    handleUiPageNavButton,
    handleUiSceneNavButton
} from './ui_navigation_cc_workflow.mjs';
import {
    handleUiPadArpStepIntervalSeq,
    handleUiPadArpStepIntervalTarp,
    handleUiPadCoRunDrumInject,
    handleUiPadPerfMode,
    handleUiPadReleaseCoRunDrum,
    handleUiPadReleaseLoopStep,
    handleUiPadReleasePadNote,
    handleUiPadReleasePerfMode,
    handleUiPadReleaseSeqArpEditor,
    handleUiPadReleaseStepButton,
    handleUiPadReleaseTapTempo,
    handleUiPadReleaseTarpArpEditor,
    handleUiPadTapTempo,
    handleUiPadTrackViewCaptureDrumLane,
    handleUiPadTrackViewDrumLaneClear,
    handleUiPadTrackViewDrumLaneReset,
    handleUiPadTrackViewDrumOrMelodic,
    handleUiPadTrackViewDrumRepeat
} from '../pad/ui_pad_workflow.mjs';
import {
    handleSessionViewClipPadPress,
    handleSessionViewStepPress
} from '../view/ui_session_view_workflow.mjs';
import {
    handleUiSideButton
} from './ui_side_button_workflow.mjs';
import {
    handleTrackViewCopyStepPress,
    handleTrackViewDeleteStepPress,
    handleTrackViewDrumStepPress,
    handleTrackViewMelodicStepPress,
    handleTrackViewMuteStepPress,
    handleTrackViewShiftStepPress,
    handleTrackViewStepEditKnob
} from '../view/ui_track_view_step_workflow.mjs';
import {
    handleUiBackButton,
    handleUiMuteButton,
    handleUiPlayButton,
    handleUiRecordButton,
    handleUiSampleButton,
    handleUiUndoButton
} from './ui_transport_cc_workflow.mjs';

export function onCcJogImpl(S, deps, d1, d2) {
    if (S.shiftTrackLEDActive) { S.shiftTrackLEDActive = false; S.screenDirty = true; }
    const jogDeps = deps.createJogCcWorkflowDeps();
    if (handleUiJogStepIntervalExit(S, jogDeps, d1, d2)) return;
    if (handleUiJogInheritPicker(S, jogDeps, d1, d2)) return;
    if (handleUiJogSnapshotPicker(S, jogDeps, d1, d2)) return;
    if (handleUiJogClearAutoMenu(S, jogDeps, d1, d2)) return;
    if (handleUiJogBakeScene(S, jogDeps, d1, d2)) return;
    if (handleUiJogConfirmLgto(S, jogDeps, d1, d2)) return;
    if (handleUiJogStateWipe(S, jogDeps, d1, d2)) return;
    if (handleUiJogRecordBlocked(S, jogDeps, d1, d2)) return;
    if (handleUiJogBakeConfirm(S, jogDeps, d1, d2)) return;
    if (handleUiJogTapTempo(S, jogDeps, d1, d2)) return;
    if (handleUiJogGlobalMenu(S, jogDeps, d1, d2)) return;
    if (handleUiJogShiftDeleteReset(S, jogDeps, d1, d2)) return;
    if (handleUiJogDeleteReset(S, jogDeps, d1, d2)) return;
    if (handleUiJogStepIntervalToggle(S, jogDeps, d1, d2)) return;
    if (handleUiJogAltToggle(S, jogDeps, d1, d2)) return;
    if (handleUiJogMovement(S, jogDeps, d1, d2)) return;
}

export function onCcButtonsImpl(S, deps, d1, d2) {
    handleUiShiftButton(S, deps.createButtonCcWorkflowDeps(), d1, d2);

    if (d1 !== deps.moveShift && d2 === 127 && S.shiftTrackLEDActive) {
        S.shiftTrackLEDActive = false;
    }

    if (handleUiDeleteButton(S, deps.createButtonCcWorkflowDeps(), d1, d2)) return;
    handleUiCopyButton(S, deps.createButtonCcWorkflowDeps(), d1, d2);
    handleUiMuteModifierButton(S, deps.createButtonCcWorkflowDeps(), d1, d2);
    handleUiCaptureButton(S, deps.createButtonCcWorkflowDeps(), d1, d2);
    if (d1 === deps.moveCapture) return;
    if (handleUiMenuCoRunExitButton(S, deps.createButtonCcWorkflowDeps(), d1, d2)) return;
    if (handleUiNoteSessionButton(S, deps.createButtonCcWorkflowDeps(), d1, d2)) return;
    if (handleUiLoopPerfModeButton(S, deps.createButtonCcWorkflowDeps(), d1, d2)) return;
    if (handleUiLoopTrackViewButton(S, deps.createButtonCcWorkflowDeps(), d1, d2)) return;
}

export function onCcTransportImpl(S, deps, d1, d2) {
    handleUiBackButton(S, deps.createTransportCcWorkflowDeps(), d1, d2);
    handleUiUndoButton(S, deps.createTransportCcWorkflowDeps(), d1, d2);
    handleUiPlayButton(S, deps.createTransportCcWorkflowDeps(), d1, d2);
    handleUiRecordButton(S, deps.createTransportCcWorkflowDeps(), d1, d2);
    handleUiSampleButton(S, deps.createTransportCcWorkflowDeps(), d1, d2);
    handleUiMuteButton(S, deps.createTransportCcWorkflowDeps(), d1, d2);

    handleUiPageNavButton(S, deps.createNavigationCcWorkflowDeps(), d1, d2);
    handleUiSceneNavButton(S, deps.createNavigationCcWorkflowDeps(), d1, d2);
}

export function onCcSideImpl(S, deps, d1, d2) {
    handleUiSideButton(S, deps.createSideButtonWorkflowDeps(), d1, d2);
}

export function onCcStepEditImpl(S, deps, d1, d2) {
    handleTrackViewStepEditKnob(S, deps.createTrackViewStepWorkflowDeps(), d1, d2);
}

export function onCcKnobsImpl(S, deps, d1, d2) {
    if (d1 >= 71 && d1 <= 78) {
        if (handleUiKnobOverlaySwallow(S, deps.createKnobCcWorkflowDeps(), d1, d2)) return;
        const knobIdx = d1 - 71;
        S.knobTouched = knobIdx;
        S.knobTurnedTick[knobIdx] = S.tickCount;
        S.screenDirty = true;
        if (handleUiKnobStepInterval(S, deps.createKnobCcWorkflowDeps(), d1, d2)) return;
        if (handleUiKnobDrumClip(S, deps.createKnobCcWorkflowDeps(), d1, d2)) return;
        if (handleUiKnobDrumAllLanes(S, deps.createKnobCcWorkflowDeps(), d1, d2)) return;
        if (handleUiKnobDrumNoteFX(S, deps.createKnobCcWorkflowDeps(), d1, d2)) return;
        if (handleUiKnobDrumRepeatGroove(S, deps.createKnobCcWorkflowDeps(), d1, d2)) return;
        if (handleUiKnobCcParam(S, deps.createKnobCcWorkflowDeps(), d1, d2)) return;
        if (handleUiKnobAltRandomMode(S, deps.createKnobCcWorkflowDeps(), d1, d2)) return;
        if (handleUiKnobAltDelayClockFb(S, deps.createKnobCcWorkflowDeps(), d1, d2)) return;
        if (handleUiKnobMelodicInQ(S, deps.createKnobCcWorkflowDeps(), d1, d2)) return;
        handleUiKnobGeneric(S, deps.createKnobCcWorkflowDeps(), d1, d2);
        return;
    }
}

export function switchViewCleanupImpl(S, deps) {
    S.heldStepBtn = -1;
    S.heldStep = -1;
    S.heldStepNotes = [];
    S.stepWasEmpty = false;
    S.stepWasHeld = false;
    S.stepBtnPressedTick.fill(-1);
    S.sessionStepHeld = -1;
    S.sessionStepHeldCtx = 0;
    if (!S.sessionView && (S.perfViewLocked || S.perfStack.length > 0)) {
        const hadLoop = S.perfStack.length > 0;
        S.perfStack = [];
        S.perfStickyLengths = new Set();
        S.perfHoldPadHeld = false;
        S.perfViewLocked = false;
        S.loopHeld = false;
        S.loopJogActive = false;
        S.perfModsHeld = 0;
        deps.sendPerfMods();
        if (hadLoop && deps.setParam)
            deps.setParam('looper_stop', '1');
    }
    if (S.sessionView) {
        for (let i = 0; i < 16; i++) deps.setLED(16 + i, deps.ledOff);
        for (let t = 0; t < 8; t++) deps.setLED(deps.trackPadBase + t, deps.ledOff);
    } else {
        for (let row = 0; row < 4; row++)
            for (let t = 0; t < 8; t++) deps.setLED(92 - row * 8 + t, deps.ledOff);
    }
}

export function onCcMsgImpl(deps, d1, d2) {
    deps.onJog(d1, d2);
    deps.onButtons(d1, d2);
    deps.onTransport(d1, d2);
    deps.onSide(d1, d2);
    deps.onStepEdit(d1, d2);
    deps.onKnobs(d1, d2);
}

export function onPadPressTrackViewImpl(S, deps, status, d1, d2) {
    const padDeps = deps.createPadWorkflowDeps();
    if (handleUiPadTrackViewDrumLaneReset(S, padDeps, d1)) return;
    if (handleUiPadTrackViewDrumLaneClear(S, padDeps, d1)) return;
    if (handleUiPadTrackViewDrumRepeat(S, padDeps, d1, d2)) return;
    if (handleUiPadTrackViewCaptureDrumLane(S, padDeps, d1)) return;
    handleUiPadTrackViewDrumOrMelodic(S, padDeps, d1, d2);
}

export function onPadPressImpl(S, deps, status, d1, d2) {
    const padDeps = deps.createPadWorkflowDeps();
    handleUiPadCoRunDrumInject(S, padDeps, status, d1, d2);
    if (handleUiPadTapTempo(S, padDeps, d1)) return;
    if (handleUiPadArpStepIntervalSeq(S, padDeps, d1)) return;
    if (handleUiPadArpStepIntervalTarp(S, padDeps, d1)) return;
    if (handleUiPadPerfMode(S, padDeps, d1)) return;
    if (handleSessionViewClipPadPress(S, deps.createSessionViewWorkflowDeps(), d1)) {
        return;
    } else {
        deps.onPadPressTrackView(status, d1, d2);
    }
}

export function onStepButtonsImpl(S, deps, d1, d2) {
    if (S.schwungCoRunSlot >= 0 || S.moveCoRunTrack >= 0) {
        if (d1 - 16 === 2) {
            if (S.moveCoRunTrack >= 0) deps.exitMoveNativeCoRun();
            else { deps.exitSchwungCoRun(); deps.forceRedraw(); }
        }
        return;
    }
    const overtureShortcutSurfaceOpen = S.globalMenuOpen || S.tapTempoOpen;
    if (overtureShortcutSurfaceOpen && (!S.shiftHeld || d2 <= 0)) return;
    if (d2 > 0 && S.shiftTrackLEDActive) { S.shiftTrackLEDActive = false; S.screenDirty = true; }
    S.stepOpTick = S.tickCount;
    const idx = d1 - 16;
    /* Overture-owned shortcut surfaces should not trap the user in their
     * original opener. Route every Shift+step to the full Track View shortcut
     * handler so common jumps and track actions share one behavior. Co-run is
     * handled above because Step 3 is its return affordance. */
    if (overtureShortcutSurfaceOpen && S.shiftHeld) {
        if (handleTrackViewShiftStepPress(S, deps.createTrackViewStepWorkflowDeps(), idx)) return;
        return;
    }
    if (S.revealClipsTrack >= 0) {
        deps.selectClipOnTrack(S.revealClipsTrack, idx);
        deps.forceRedraw();
        return;
    }
    if (handleSessionViewStepPress(S, deps.createSessionViewWorkflowDeps(), idx)) {
        return;
    } else if (deps.handleLoopStepPress(idx)) {
        return;
    } else if (handleTrackViewCopyStepPress(S, deps.createTrackViewStepWorkflowDeps(), idx)) {
        return;
    } else if (handleTrackViewDeleteStepPress(S, deps.createTrackViewStepWorkflowDeps(), idx)) {
        return;
    } else if (handleTrackViewMuteStepPress(S, deps.createTrackViewStepWorkflowDeps(), idx)) {
        return;
    } else if (handleTrackViewShiftStepPress(S, deps.createTrackViewStepWorkflowDeps(), idx)) {
        return;
    } else if (handleTrackViewDrumStepPress(S, deps.createTrackViewStepWorkflowDeps(), idx)) {
        return;
    } else if (handleTrackViewMelodicStepPress(S, deps.createTrackViewStepWorkflowDeps(), idx)) {
        return;
    }
}

export function onPadReleaseImpl(S, deps, status, d1, d2) {
    const padDeps = deps.createPadWorkflowDeps();
    if (handleUiPadReleaseTapTempo(S, padDeps, d1)) return;
    handleUiPadReleaseCoRunDrum(S, padDeps, d1);
    if (handleUiPadReleaseLoopStep(S, padDeps, d1)) return;
    if (handleUiPadReleaseSeqArpEditor(S, padDeps, d1)) return;
    if (handleUiPadReleaseTarpArpEditor(S, padDeps, d1)) return;
    if (handleUiPadReleasePerfMode(S, padDeps, d1)) return;
    if (handleUiPadReleaseStepButton(S, padDeps, d1)) return;
    handleUiPadReleasePadNote(S, padDeps, d1);
}
