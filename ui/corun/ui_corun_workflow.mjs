/* Enter co-run for slot N on track t. Persists the track's slot choice,
 * suppresses Overture's OLED drawing + track-button LEDs (handled where each
 * is written), and tells Schwung's shadow_ui to also tick the chain editor. */
export function enterSchwungCoRunImpl(S, deps, t, slot) {
    S.schwungCoRunSlot = slot;
    if (typeof deps.shadowCorunBegin === 'function')
        deps.shadowCorunBegin(deps.corunTargetChainEdit, slot, deps.overtureCorunKeepMask);
    S.screenDirty = true;
}

/* Exit co-run. Called on programmatic Overture state changes (track switch,
 * global-menu open, etc.) or by the pollDSP reconcile when the shim's
 * framework Back-handler has ended the session. Calling shadow_corun_end()
 * after the shim already ended is a no-op. */
export function exitSchwungCoRunImpl(S, deps) {
    if (S.schwungCoRunSlot < 0) return;
    S.schwungCoRunSlot = -1;
    S._coRunChanSlots = 0;
    if (typeof deps.shadowCorunEnd === 'function')
        deps.shadowCorunEnd();
    /* Modifier-key release CCs the user pressed inside the co-run may have
     * been routed to Schwung and never reached us — clear defensively so a
     * stuck Shift/Mute/etc. can't silence pad dispatch on return. Mirrors
     * the resume-from-suspend clear. */
    S.shiftHeld = false; S.deleteHeld = false; S.muteHeld = false;
    S.copyHeld  = false; S.loopHeld  = false; S.loopJogActive = false;
    S.captureHeld = false; S.shiftTrackLEDActive = false;
    /* Schwung's chain editor may have rewritten palette scratch entries while
     * we were ceded. Reapply our palette before invalidating the LED cache
     * so forceRedraw below repaints with the right colors. */
    deps.reapplyPalette();
    deps.invalidateLEDCache();
    deps.forceRedraw();
}

/* Enter Move-native co-run for Overture track t. Asks the shim to (a) yield
 * the OLED to Move firmware and (b) flip its sh_midi filter / shadow_ui
 * forward so the nav-CC + touch-note set routes to Move firmware instead
 * of Overture. Fires one cable-0 track-button tap so Move firmware lands
 * on the preset browser for the relevant track without the user touching
 * the front panel. Move's track-button CC mapping is REVERSED
 * (CC 43 = Track 1 ... CC 40 = Track 4), and Overture tracks 5-8 with
 * ROUTE_MOVE rely on the user's trackChannel to address one of Move's
 * 4 tracks — if trackChannel is outside 1-4 we just enter co-run without
 * an auto-tap and let the user pick the Move track manually. */
export function enterMoveNativeCoRunImpl(S, deps, t) {
    if (typeof deps.shadowCorunBegin !== 'function') return;
    if (typeof deps.moveMidiInjectToMove !== 'function') return;
    const ch = S.trackChannel[t] | 0;
    if (ch < 1 || ch > 4) deps.showActionPopup('MOVE CH>4', 'CH ' + ch);
    S.moveCoRunTrack = t;
    deps.computePadNoteMap();
    S.pendingPadNoteMapRecompute = true;
    deps.shadowCorunBegin(deps.corunTargetMoveNative, t, deps.overtureCorunKeepMask);
    /* Let Move firmware's own LED writes (track buttons, knob rings, transport)
     * reach hardware while it drives the device-edit UI. skip_led_clear makes the
     * shim's overtake LED-strip loop early-return, so Move's LEDs pass through live.
     * Toggled back off in exitMoveNativeCoRun(). This is a mid-overtake toggle — it
     * does NOT hit the entry/exit snapshot path, so the suspend/exit native LED
     * restore is unaffected. */
    if (typeof deps.shadowSetSkipLedClear === 'function') deps.shadowSetSkipLedClear(1);
    /* Defer the track-button "press" that lands Move on the device-edit page and
     * makes it repaint its track + knob LEDs. Injecting it immediately fails: Move's
     * repaint lands before the shim's co-run LED passthrough + OLED bypass go live
     * (corun_move_native_track hasn't propagated to the shim yet), so the repaint is
     * stripped and the LEDs don't show until a manual press. Fire it from tick() a
     * few ticks later, once co-run is fully active. */
    S.pendingMoveCoRunInject = 12;
    S.globalMenuOpen = false;
    S.lastSentMenuEditValue = null;
    S.screenDirty = true;
}

/* Exit Move-native co-run. The shim drops its input split + display
 * bypass the next time it reads corun_move_native_track from SHM, so
 * Move firmware's framebuffer stops reaching the OLED and the nav CCs
 * start flowing to Overture again. We force a full redraw so any LEDs
 * Move firmware was driving (knob rings, track buttons, Shift, Back)
 * get repainted from Overture state right away. */
export function exitMoveNativeCoRunImpl(S, deps) {
    if (S.moveCoRunTrack < 0) return;
    S.moveCoRunTrack = -1;
    S.pendingMoveCoRunInject = 0;  /* cancel any pending entry inject */
    S.moveCoRunPressQueue = null;  /* cancel any in-flight track-row press sequence */
    deps.computePadNoteMap();
    S.pendingPadNoteMapRecompute = true;
    if (typeof deps.shadowCorunEnd === 'function')
        deps.shadowCorunEnd();
    /* Resume the shim's overtake LED-strip loop so Overture owns the LEDs again
     * (mirror of the skip_led_clear(1) in enterMoveNativeCoRun). */
    if (typeof deps.shadowSetSkipLedClear === 'function') deps.shadowSetSkipLedClear(0);
    /* If a drum pad hold inject was in flight, send the note-off before the
     * co-run session ends so Move doesn't get a stuck note. */
    if (S.moveCoRunDrumHeld >= 0 && typeof deps.moveMidiInjectToMove === 'function') {
        deps.moveMidiInjectToMove([0x08, 0x80, S.moveCoRunDrumHeld, 0]);  /* plain pad off */
    }
    S.moveCoRunDrumHeld = -1;
    /* Modifier-key release CCs the user pressed inside Move firmware never
     * reach us during co-run — clear defensively so a stuck Shift/Mute/etc.
     * can't silence pad dispatch on return. Mirrors resume-from-suspend. */
    S.shiftHeld = false; S.deleteHeld = false; S.muteHeld = false;
    S.copyHeld  = false; S.loopHeld  = false; S.loopJogActive = false;
    S.captureHeld = false; S.shiftTrackLEDActive = false;
    /* Move firmware may have rewritten palette scratch entries (knob rings,
     * Shift/Back, etc.) while we were ceded. Reapply our palette before
     * invalidating the LED cache so forceRedraw below repaints with the
     * right colors, not stale ones left by Move firmware. */
    deps.reapplyPalette();
    deps.invalidateLEDCache();
    /* Force the knob-ring LEDs (CC 71-78) to repaint over Move's native colors on
     * the next draw. invalidateLEDCache clears the JS LED cache, but reapplyPalette
     * leaves the hardware buttonCache stale so the normal (non-forced)
     * cachedSetButtonLED knob writes get dropped — Move's knob colors then persist
     * until the user happens to change a knob value. One-shot force in updateTrackLEDs
     * (mirrors the force=true the track-button reclaim already uses). */
    S._forceKnobReemit = true;
    deps.forceRedraw();
}
