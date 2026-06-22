import {
    NUM_TRACKS
} from '../core/ui_constants.mjs';
import { readCurrentSongIndex } from '../core/ui_auto_route.mjs';

export function runInitWorkflowImpl(S, deps) {
    deps.installConsoleOverride('SEQ8');
    /* Emulator / headless-test hook: expose the live UI state object so the
     * browser emulator + vitest harness can assert UI-mode behaviour (active
     * track / bank / clip, view toggles) that has no DSP get_param read-back.
     * Read-only inspection; a harmless extra global on device. */
    if (deps.exposeState) deps.exposeState(S);
    /* Clear any lingering co-run flag from a prior session -- shim's SHM
     * may still hold target/id if we were warm-restarted (Shift+Back +
     * relaunch does not reset shadow_control). */
    S.schwungCoRunSlot = -1;
    S.moveCoRunTrack = -1;
    if (typeof deps.shadowCorunEnd === 'function') deps.shadowCorunEnd();
    if (S.bankParams === null)
        S.bankParams = Array.from({length: NUM_TRACKS}, function() {
            return deps.banks.map(function(bank) { return bank.knobs.map(function(k) { return k.def; }); });
        });

    const p = (typeof deps.getParam === 'function')
        ? deps.getParam('playing') : null;
    const dspSurvived = (p !== null && p !== undefined);

    deps.log('SEQ8 init: ' + (p === '1' ? 'RESUMED playing' : 'FRESH/stopped'));

    /* Detect set mismatch: compare active_set.txt UUID with what the DSP currently has loaded.
     * Works regardless of JS context lifetime -- no cross-init state needed.
     * If they differ, DSP has old set's data: save it, then load the active set. */
    {
        const _as = deps.readActiveSet();
        S.currentSetUuid = _as.uuid;
        S.currentSetName = _as.name;
    }
    /* Record Move's currentSongIndex now (RECORD ONLY). The uuid/pendingSetLoad
     * path above/below handles the first-load auto-route; capturing the baseline
     * here prevents a spurious auto-route fire on the first later resume edge
     * (runSuspendDetection compares against S.lastSongIndex). */
    S.lastSongIndex = readCurrentSongIndex(deps);
    /* Inherit-picker decision tree for a freshly-pasted Move duplicate.
     * 'auto'   -- single family candidate, silently inherited; force pendingSetLoad.
     * 'picker' -- multiple candidates; dialog open, state_load is deferred.
     * 'blank'  -- no candidates; fall through to normal mismatch/exists checks.
     * Force pendingSetLoad on success: create_instance already called
     * seq8_load_state with the (then-empty) duplicate path; DSP needs to
     * reload from the now-seeded file. */
    const inheritResult = deps.maybeShowInheritPicker(S.currentSetUuid, S.currentSetName);
    const currentDspNonce = (typeof deps.getParam === 'function')
        ? deps.getParam('instance_id') : null;
    const dspUuid = (typeof deps.getParam === 'function')
        ? (deps.getParam('state_uuid') || '') : '';
    if (currentDspNonce) S.lastDspInstanceId = currentDspNonce;
    /* Check if DSP flagged a state version mismatch during create_instance.
     * If so, show the confirm dialog and suppress any pendingSetLoad -- the
     * dialog's "Yes" handler will trigger state_load after the user confirms. */
    const _svMismatch = (typeof deps.getParam === 'function')
        ? deps.getParam('state_version_mismatch') : null;
    if (_svMismatch && parseInt(_svMismatch, 10) === 1) {
        S.confirmStateWipe = true;
        S.confirmStateWipeSel = 1;
        S.pendingSetLoad = false;
        S.screenDirty = true;
    } else if (inheritResult === 'auto') {
        S.pendingSetLoad = true;
    } else if (inheritResult === 'picker') {
        /* state_load deferred until resolveInheritPicker fires */
    } else if (S.currentSetUuid && dspUuid !== S.currentSetUuid) {
        S.pendingSetLoad = true;
    } else if (S.currentSetUuid && typeof deps.fileExists === 'function') {
        const sp = '/data/UserData/schwung/set_state/' + S.currentSetUuid + '/seq8-state.json';
        if (!deps.fileExists(sp)) S.pendingSetLoad = true;
    }
    /* Schedule orphan prune for the next quiet tick (after state_load settles). */
    S.pendingPruneOrphans = true;

    if (typeof deps.getParam === 'function') {
        S.playing = dspSurvived;

        for (let t = 0; t < NUM_TRACKS; t++) {
            const ac = deps.getParam('t' + t + '_active_clip');
            if (ac !== null && ac !== undefined) S.trackActiveClip[t] = parseInt(ac, 10) | 0;
            const cs = deps.getParam('t' + t + '_current_step');
            const csVal = (cs !== null && cs !== undefined) ? (parseInt(cs, 10) | 0) : -1;
            S.trackCurrentStep[t] = csVal;
            S.trackCurrentPage[t] = csVal >= 0 ? Math.floor(csVal / 16) : 0;
            const qc = deps.getParam('t' + t + '_queued_clip');
            S.trackQueuedClip[t] = (qc !== null && qc !== undefined) ? (parseInt(qc, 10) | 0) : -1;
        }

        deps.syncClipsFromDsp();
        deps.syncMuteSoloFromDsp();
    }

    deps.extHeldNotes.clear();

    if (!S.hasInitedOnce) { S.sessionView = true; S.hasInitedOnce = true; }

    /* Restore UI state (active track, clip focus, view) from sidecar.
     * Deferred if pendingSetLoad: DSP hasn't loaded the new set yet, restoreUiSidecar
     * will be called again from the pendingDspSync completion path after the full resync. */
    deps.restoreUiSidecar(!S.pendingSetLoad);

    /* PHASE-1: capability gate for DSP-owned input. On patched Schwung the
     * shim delivers pad MIDI to overtake DSP's on_midi on the audio thread,
     * removing the slow-brain JS hop. We detect via shadow_inbound_pad_midi_active
     * (added in legsmechanical/schwung phase-1-inbound). When active, we suppress
     * queueLiveNoteOn/Off in liveSendNote AND push tN_padmap to DSP -- which
     * doubles as the DSP-side capability signal (its padmap handler sets
     * inst->dsp_inbound_enabled). The push happens on every computePadNoteMap
     * recompute, so it survives DSP instance recreate (state_load path).
     * Stock Schwung: function undefined, flag stays false, padmap never pushed,
     * existing JS path keeps working. Remove the gate when patches upstreamed. */
    S.dspInboundEnabled = (typeof deps.shadowInboundPadMidiActive === 'function');

    /* PHASE-2: capability gate for shim-side async ROUTE_EXTERNAL send.
     * On patched Schwung (legsmechanical/schwung phase-2-ext-worker) the
     * shim runs a low-priority worker thread that drains a 64-packet SPSC
     * ring fed by g_host->midi_send_external -- pulls the SPI ioctl off the
     * audio thread, removing the JS-tick floor on ROUTE_EXTERNAL latency.
     * When the sentinel is present we (a) skip the JS ext_queue drain in
     * tick(), and (b) tell DSP to call midi_send_external directly via the
     * 33rd token in the tN_padmap payload (see computePadNoteMap).
     * Stock Schwung: function undefined, flag stays false, DSP keeps
     * pushing to ext_queue and JS drains it as before.
     * Remove when patches upstreamed. */
    S.extSendAsyncEnabled = (typeof deps.shadowOvertakeSendExternalAsyncActive === 'function');

    deps.computePadNoteMap();

    /* Apply cable-2 channel remap for the current active track immediately
     * (tick() change-detect also covers this, but fires one tick later). */
    S._lastRemapTrack = -1;
    deps.applyExtMidiRemap();

    S.ledInitComplete = false;
    deps.invalidateLEDCache();
    S.ledInitQueue    = deps.buildLedInitQueue();
    S.ledInitIndex    = 0;

    deps.installFlagsWrap();

    S._origClearScreen = deps.clearScreen;
    S._wasSuspended    = false;
}
