import { PAD_MODE_DRUM, POLL_INTERVAL } from '../core/ui_constants.mjs';

export function drawUIImpl(S, deps) {
    /* CO-RUN: shadow_ui's chain editor owns the OLED while this is active.
     * Skip every Overture draw path so it doesn't fight the chain editor's
     * frame. shadow_ui still calls clear_screen + redraw each tick. */
    if (S.schwungCoRunSlot >= 0) return;
    /* Move-native co-run: Move firmware owns the OLED (preset browser /
     * device-edit pages). The shim's display_mode bypass keeps Move's
     * framebuffer visible while the MIDI filter stays active; we just
     * stay out of the way. Pad/step LEDs freeze at entry-time state —
     * verified harmless in real use (nothing the user does during co-run
     * depends on live LED feedback). */
    if (S.moveCoRunTrack >= 0) {
        /* Side clip buttons: the button paired to the Move track this Overture
         * track routes to blinks; the rest stay dark grey. Move's track numbering
         * is reversed (Track 1 = CC 43 = top .. Track 4 = CC 40 = bottom), so a
         * channel ch (1-4) maps to top-to-bottom bit (ch-1). Forced every
         * POLL_INTERVAL to re-assert over Move firmware's pass-through writes. */
        const _coRunCh = (S.trackChannel[S.moveCoRunTrack] | 0);
        const _litMask = (_coRunCh >= 1 && _coRunCh <= 4) ? (1 << (_coRunCh - 1)) : 0;
        deps.paintCoRunSideButtons(_litMask, (S.tickCount % POLL_INTERVAL) === 0);
        return;
    }
    /* Alt-param mode is transient: any bank change, track change, or entering
     * Session View drops back to primary params. Diff-guard catches every
     * S.activeBank / S.activeTrack reassignment regardless of source. */
    if (S.altMode && (S.sessionView ||              /* session view can be entered via a button after altMode was set */
            S.activeBank !== S._altPrevBank ||
            S.activeTrack !== S._altPrevTrack)) {
        S.altMode = false;
    }
    S._altPrevBank  = S.activeBank;
    S._altPrevTrack = S.activeTrack;
    if (S.sessionOverlayHeld) { deps.renderSessionOverview(deps.renderSurface()); return; }
    if (S.pendingInheritPicker) { deps.drawInheritPicker(); return; }
    if (S.snapshotPicker) { deps.drawSnapshotPicker(); return; }
    if (S.clearAutoMenu) { deps.drawClearAutoMenu(); return; }
    if (S.pendingSceneBakePicker) {
        deps.renderSceneBakePickerPrompt(deps.renderSurface());
        return;
    }
    if (S.pendingMergePlacement) {
        deps.renderMergePlacementPrompt(deps.renderSurface());
        return;
    }
    if (S.confirmStateWipe) { deps.drawStateWipeConfirm(); return; }
    if (S.recordBlockedDialog) { deps.drawRecordBlockedDialog(); return; }
    if (S.confirmLgto)         { deps.drawLgtoConfirm();         return; }
    if (S.confirmXpose) { deps.drawXposeConfirm(); return; }
    if (S.confirmBakeScene) { deps.drawBakeSceneConfirm(); return; }
    if (S.confirmBake) { deps.drawBakeConfirm(); return; }
    if (S.globalMenuOpen || S.tapTempoOpen) { deps.ensureGlobalMenuFresh(); deps.drawGlobalMenu(); return; }
    if (S.schwungSoundPage) { deps.renderSchwungSoundPage(deps.renderSurface()); return; }
    /* Perf Mode OLED takeover (Session View + Loop held or locked) */
    if (S.sessionView && (S.loopHeld || S.perfViewLocked)) { deps.renderPerfModeOled(deps.renderSurface()); return; }
    if (S.stateLoading || S.bootSplashTicks > 0) {
        deps.renderSplashScreen(S, deps.renderSurface());
        return;
    }
    /* Not in splash mode — clear the entry-edge flag so the next splash rerolls. */
    if (S.splashWasVisible) S.splashWasVisible = false;

    deps.clear_screen();
    if (S.sessionView) {
        if (S.actionPopupEndTick >= 0) {
            deps.renderSessionActionPopup(deps.renderSurface());
            return;
        }
        deps.renderSessionIdleView(deps.renderSurface());
        return;
    }

    /* Track View — priority display state machine */
    const bank      = S.activeBank;
    const inTimeout = S.bankSelectTick >= 0 || S.jogTouched;

    /* Compress-limit override: highest priority for ~1500ms after a blocked compress */
    if (S.stretchBlockedEndTick >= 0) {
        deps.renderCompressLimitNotice(deps.renderSurface());
        return;
    }

    /* Action confirmation pop-up: ~500ms; defers to step edit and active-knob bank overview */
    if (S.actionPopupEndTick >= 0 && S.heldStep < 0 && S.knobTouched < 0) {
        deps.renderTrackActionPopup(deps.renderSurface());
        return;
    }

    /* No-note flash: ~600ms after pressing an empty step with no prior pad */
    if (S.noNoteFlashEndTick >= 0 && S.activeBank !== 6) {
        deps.renderNoNoteFlashNotice(deps.renderSurface());
        return;
    }

    if (S.shiftHeld && !S.sessionView && S.heldStep < 0 && S.knobTouched < 0 &&
            !S.deleteHeld && !S.copyHeld && !S.muteHeld && !S.loopHeld) {
        deps.renderShiftStepHelp(deps.renderSurface());
        return;
    }

    /* Step edit: show assigned notes and step identity */
    if (S.heldStep >= 0) {
        if (S.activeBank === 6 && S.trackPadMode[S.activeTrack] !== PAD_MODE_DRUM) {
            deps.renderCcStepEditView(deps.renderSurface());
            return;
        } else {
        if (deps.renderTrackStepEditView(deps.renderSurface())) return;
        /* Non-empty melodic step, notes still loading at hold threshold: fall through to bank/header. */
    } /* end else (non-bank-6 step edit) */
    }

    /* Loop view: own priority state so screen is fully cleared first */
    if (S.loopHeld) {
        deps.renderLoopView(deps.renderSurface());
        return;
    }

    /* Arp Steps interval overlay: persistent bank overview while jog-clicked into
     * step-interval mode on SEQ ARP (4) or TARP (5). K1-K8 = per-step scale-degree
     * offsets (±24); pad grid is the persistent step-vel level editor handled in
     * updateTrackLEDs. Renders REGARDLESS of knob-touch / inTimeout (persistent). */
    if (bank >= 0 && S.stepIntervalMode && !S.sessionView && (bank === 4 || bank === 5)) {
        deps.renderStepIntervalOverlay(deps.renderSurface(), bank);
        return;
    }

    /* Auto bank idle display: lane info + automation graph + progress bar */
    if (bank === 6 && S.trackPadMode[S.activeTrack] !== PAD_MODE_DRUM &&
            !S.loopHeld && S.knobTouched < 0 && !inTimeout) {
        deps.renderMotionIdleView(deps.renderSurface());
        return;
    }

    if (bank >= 0 && (S.knobTouched >= 0 || inTimeout ||
            (S.altMode && deps.bankHasAltParams(S.activeTrack, bank)) ||
            (S.shiftHeld && bank === 1 && S.trackPadMode[S.activeTrack] !== PAD_MODE_DRUM))) {
        if (S.knobTouched >= 0 && !S.stepIntervalMode) {
            deps.renderParamPeek(deps.renderSurface());
            return;
        }
        const bankRenderDeps = deps.renderSurface();
        if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM && bank === 5) {
            const t    = S.activeTrack;
            const lane = S.activeDrumLane[t];
            deps.syncDrumRepeatState(t, lane);
        }
        deps.renderTrackBankOverview(bankRenderDeps, bank);

    } else if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM) {
        deps.renderDrumTrackIdleView(deps.renderSurface());
    } else {
        deps.renderMelodicTrackIdleView(deps.renderSurface());
    }
}
