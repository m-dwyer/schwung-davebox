/* ------------------------------------------------------------------ */
/* Global menu item builder                                            */
/* ------------------------------------------------------------------ */
/* Lift-and-shift of buildGlobalMenuItems() from ui.js. This is a pure
 * BUILDER (not a dispatch ladder): it returns the flat list of menu-item
 * descriptors whose get/set closures capture host state via `deps`. The
 * thin wrapper in ui.js (`buildGlobalMenuItems`) calls this with the live
 * S + createGlobalMenuDeps(); both call sites (openGlobalMenu + the menu
 * refresh) re-run it so route/track-mode-conditional items recompute.
 *
 * Shared-module symbols (create*, fmt*, constants, persistence/export/route
 * helpers) are imported directly — only ui.js-local helpers + the host
 * get/set params thread through `deps`. */

import {
    createValue, createEnum, createToggle, createAction, createDivider
} from '/data/UserData/schwung/shared/menu_items.mjs';
import {
    NOTE_KEYS, SCALE_NAMES, PAD_MODE_DRUM, NUM_CLIPS,
    fmtRoute, fmtNA, fmtVelOverride
} from '../core/ui_constants.mjs';
import { saveState, writeSidecar, loadSnapshotManifest } from '../persist/ui_persistence.mjs';
import { requestExport } from '../persist/ui_export.mjs';
import { canEditSoundRoute } from '../core/ui_routes.mjs';

/* deps: applyTrackConfig, computePadNoteMap, forceRedraw, editSoundForTrack,
 * openTapTempo, xposePreviewSet, openLoadSnapshot, getParam, setParam */
export function buildGlobalMenuItemsImpl(S, deps) {
    return [
        createValue('Channel', {
            get: function() { return S.trackChannel[S.activeTrack]; },
            set: function(v) { deps.applyTrackConfig(S.activeTrack, 'channel', v); },
            min: 1, max: 16, step: 1,
            format: function(v) { return String(v); }
        }),
        createEnum('Route', {
            get: function() { return S.trackRoute[S.activeTrack]; },
            set: function(v) { deps.applyTrackConfig(S.activeTrack, 'route', v); },
            options: [0, 1, 2],
            format: function(v) { return fmtRoute(v); }
        }),
        createEnum('Mode', {
            get: function() { return S.trackPadMode[S.activeTrack]; },
            /* Flipping Mode CONVERTS the track's notes (see convertTrackType).
             * set() is called as a live preview while editing AND on commit
             * via set(get()); the v===cur guard makes those re-fires no-ops. */
            set: function(v) {
                const t = S.activeTrack;
                if (v === S.trackPadMode[t]) return;
                if (v === PAD_MODE_DRUM) {
                    /* Keys -> Drums: warn only if there are notes to lose;
                     * an empty track converts straight through (no dialog). */
                    let hasData = false;
                    for (let c = 0; c < NUM_CLIPS; c++)
                        if (S.clipNonEmpty[t][c]) { hasData = true; break; }
                    if (hasData) {
                        S.confirmConvertToDrum    = true;
                        S.confirmConvertToDrumSel = 1;   /* default No */
                        S.confirmConvertTrack     = t;
                        S.screenDirty = true;
                    } else {
                        S.pendingTrackConvert = { t: t, toDrum: true };
                    }
                } else {
                    /* Drums -> Keys: no prompt. Defer to tick() (get_param-safe). */
                    S.pendingTrackConvert = { t: t, toDrum: false };
                }
            },
            options: [0, 1],
            format: function(v) { return v ? 'Drums' : 'Keys'; }
        }),
        createEnum('Layout', {
            get: function() { return S.padLayoutChromatic[S.activeTrack] ? 1 : 0; },
            set: function(v) {
                if (S.trackPadMode[S.activeTrack] !== 0) return;
                S.padLayoutChromatic[S.activeTrack] = v !== 0;
                deps.computePadNoteMap();
                deps.forceRedraw();
            },
            options: [0, 1],
            format: function(v) {
                if (S.trackPadMode[S.activeTrack] !== 0) return fmtNA();
                return v ? 'Chrom' : 'Scale';
            }
        }),
        createValue('VelIn', {
            get: function() { return S.trackVelOverride[S.activeTrack]; },
            set: function(v) { deps.applyTrackConfig(S.activeTrack, 'track_vel_override', v); },
            min: 0, max: 127, step: 1,
            format: function(v) { return fmtVelOverride(v); }
        }),
        createToggle('Looper', {
            get: function() { return S.trackLooper[S.activeTrack] !== 0; },
            set: function(v) { deps.applyTrackConfig(S.activeTrack, 'track_looper', v ? 1 : 0); },
            onLabel: 'On', offLabel: 'Off'
        }),
        /* Pad-pressure (aftertouch) send mode — melodic tracks only. On drum
         * tracks pad pressure is owned by the repeat-velocity system, so the
         * item is hidden there. Move route supports Off/Poly only (Move
         * instruments take poly AT); Schwung/External also offer Channel.
         * Options recompute each menu open (buildGlobalMenuItems re-runs). Mode is
         * JS-side (carried per-message in tN_live_at) → persisted in the sidecar. */
        ...(S.trackPadMode[S.activeTrack] !== PAD_MODE_DRUM ? [
            createEnum('AftTch', {
                get: function() { return S.trackAtMode[S.activeTrack] | 0; },
                set: function(v) { S.trackAtMode[S.activeTrack] = v | 0; writeSidecar(); },
                options: S.trackRoute[S.activeTrack] === 1 ? [0, 1] : [0, 1, 2],
                format: function(v) { return v === 2 ? 'Chan' : v === 1 ? 'Poly' : 'Off'; }
            })
        ] : []),
        /* One user-facing sound-edit command. Route-specific dispatch stays in
         * editSoundForTrack() so Move-native and Schwung chain-edit co-run keep
         * their separate internals while the menu exposes one gesture. */
        ...(canEditSoundRoute(S.trackRoute[S.activeTrack]) ? [
            createAction('Edit Sound...', function() {
                deps.editSoundForTrack(S.activeTrack);
            })
        ] : []),
        createDivider('Global'),
        createValue('BPM', {
            get: function() {
                const v = parseFloat(deps.getParam('bpm'));
                return (v > 0 && isFinite(v)) ? Math.round(v) : 120;
            },
            set: function(v) { deps.setParam('bpm', String(Math.round(v))); },
            min: 40, max: 250, step: 1,
            format: function(v) { return String(Math.round(v)); }
        }),
        createAction('Tap Tempo', function() {
            deps.openTapTempo();
        }),
        /* Key/Scale: turning the knob previews a transpose of all melodic clips
         * (live, uncommitted); the click commits behind a confirm (see the
         * jog-click intercept + xpose* helpers). set() runs as the menu-edit
         * live preview AND on edit-exit (set(get()) → candidate==committed →
         * cancel), so back-out cleanly drops the preview. */
        createEnum('Key', {
            get: function() { return S.padKey; },
            set: function(v) { deps.xposePreviewSet(v, S.padScale); },
            options: [0,1,2,3,4,5,6,7,8,9,10,11],
            format: function(v) { return NOTE_KEYS[((v | 0) % 12 + 12) % 12]; }
        }),
        createEnum('Scale', {
            get: function() { return S.padScale; },
            set: function(v) { deps.xposePreviewSet(S.padKey, v); },
            options: [0,1,2,3,4,5,6,7,8,9,10,11,12,13],
            format: function(v) { return SCALE_NAMES[v] || 'Major'; }
        }),
        createToggle('Scale Aware', {
            get: function() { return S.scaleAware !== 0; },
            set: function(v) {
                S.scaleAware = v ? 1 : 0;
                if (deps.setParam)
                    deps.setParam('scale_aware', S.scaleAware ? '1' : '0');
            },
            onLabel: 'On', offLabel: 'Off'
        }),
        createEnum('Launch', {
            get: function() { return S.launchQuant; },
            set: function(v) {
                S.launchQuant = v;
                if (deps.setParam)
                    deps.setParam('launch_quant', String(v));
            },
            options: [0, 1, 2, 3, 4, 5],
            format: function(v) {
                return ['Now','1/16','1/8','1/4','1/2','1-bar'][v] || '1-bar';
            }
        }),
        createValue('Swing Amt', {
            get: function() { return S.swingAmt; },
            set: function(v) { S.swingAmt = v; deps.setParam('swing_amt', String(v)); },
            min: 0, max: 100,
            format: function(v) { return Math.round(50 + v * 0.25) + '%'; }
        }),
        createEnum('Swing Res', {
            get: function() { return S.swingRes; },
            set: function(v) { S.swingRes = v; deps.setParam('swing_res', String(v)); },
            options: [0, 1],
            format: function(v) { return ['1/16','1/8'][v] || '1/16'; }
        }),
        createEnum('MIDI In', {
            get: function() { return S.midiInChannel; },
            set: function(v) {
                S.midiInChannel = v;
                if (deps.setParam)
                    deps.setParam('midi_in_channel', String(v));
            },
            options: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],
            format: function(v) { return v === 0 ? 'All' : String(v); }
        }),
        createEnum('Metro', {
            get: function() { return S.metronomeOn; },
            set: function(v) {
                S.metronomeOn = v | 0;
                if (deps.setParam)
                    deps.setParam('metro_on', String(S.metronomeOn));
            },
            options: [0, 1, 2, 3],
            format: function(v) {
                return ['Off', 'Cnt-In', 'Play', 'Always'][v | 0];
            }
        }),
        createValue('Metro Vol', {
            get: function() { return S.metronomeVol; },
            set: function(v) {
                S.metronomeVol = v | 0;
                if (deps.setParam)
                    deps.setParam('metro_vol', String(S.metronomeVol));
            },
            min: 0, max: 150, step: 1,
            format: function(v) { return String(v | 0) + '%'; }
        }),
        createToggle('Beat Marks', {
            get: function() { return S.beatMarkersEnabled; },
            set: function(v) { S.beatMarkersEnabled = v; deps.forceRedraw(); },
            onLabel: 'On', offLabel: 'Off'
        }),
        createAction('Route Check', function() {
            S.routeCheckOpen = true;
            S.routeCheckSelected = 0;
            S.screenDirty = true;
        }),
        createAction('Export to Ableton', function() {
            requestExport();
        }),
        createAction('Save state', function() {
            S.confirmSaveCount = loadSnapshotManifest(S.currentSetUuid).length;
            S.confirmSaveState = true;
            S.confirmSaveSel   = 1;   /* default No */
        }),
        createAction('Load state', function() {
            deps.openLoadSnapshot();
        }),
        createAction('Clear Sess', function() {
            S.confirmClearSession = true;
            S.confirmClearSel     = 1;
            S.screenDirty         = true;
        }),
        createAction('Quit', function() {
            saveState();                       /* sets pendingSuspendSave */
            S.pendingExitAfterSave = true;     /* drained one tick after save fires */
            S.globalMenuOpen = false;
        }),
    ];
}

export function openGlobalMenuImpl(S, deps) {
    /* Co-run owns the OLED — exit it before opening the menu so Overture
     * can draw again. */
    if (S.schwungCoRunSlot >= 0) deps.exitSchwungCoRun();
    if (S.moveCoRunTrack >= 0) deps.exitMoveNativeCoRun();
    S.globalMenuItems         = deps.buildGlobalMenuItems();
    S.globalMenuState         = deps.createMenuState();
    S.globalMenuStack         = deps.createMenuStack();
    S.globalMenuOpen          = true;
    S.globalMenuBuiltForTrack = S.activeTrack;
    S.lastSentMenuEditValue   = null;
    S.screenDirty             = true;
    S.jogTouched              = false;
}

/* Rebuild the global menu items list if the active track has changed since the
 * last build. The Edit Sound action is route-dependent, so a Shift+jog track
 * switch with the menu open must rebuild the list. Cursor preserved by
 * label-match when possible, otherwise clamped. */
export function ensureGlobalMenuFreshImpl(S, deps) {
    if (!S.globalMenuOpen) return;
    if (S.globalMenuBuiltForTrack === S.activeTrack) return;
    let prevLabel = null;
    if (S.globalMenuItems && S.globalMenuState) {
        const _cur = S.globalMenuItems[S.globalMenuState.selectedIndex];
        if (_cur) prevLabel = _cur.label || null;
    }
    S.globalMenuItems = deps.buildGlobalMenuItems();
    if (prevLabel && S.globalMenuState) {
        let idx = -1;
        for (let i = 0; i < S.globalMenuItems.length; i++) {
            const _it = S.globalMenuItems[i];
            if (_it && _it.label === prevLabel) { idx = i; break; }
        }
        if (idx >= 0) S.globalMenuState.selectedIndex = idx;
        else S.globalMenuState.selectedIndex = Math.min(
            S.globalMenuState.selectedIndex,
            Math.max(0, S.globalMenuItems.length - 1));
    }
    S.globalMenuBuiltForTrack = S.activeTrack;
}

function closeShortcutSurfaceImpl(S, deps) {
    if (S.tapTempoOpen) {
        if (deps.closeTapTempo) deps.closeTapTempo();
        else S.tapTempoOpen = false;
    }
    if (S.globalMenuOpen) {
        S.globalMenuOpen = false;
        S.lastSentMenuEditValue = null;
    }
}

export function jumpToMenuLabelImpl(S, deps, label) {
    closeShortcutSurfaceImpl(S, deps);
    openGlobalMenuImpl(S, deps);
    if (!S.globalMenuItems || !S.globalMenuState) return;
    for (let i = 0; i < S.globalMenuItems.length; i++) {
        const it = S.globalMenuItems[i];
        if (it && it.label === label) {
            S.globalMenuState.selectedIndex = i;
            return;
        }
    }
}

export function doShiftStepCommonImpl(S, deps, idx) {
    if      (idx === 1) jumpToMenuLabelImpl(S, deps, 'Global');
    else if (idx === 2 && !S.sessionView) {
        /* Track View only — Session View Shift+Step3 is reserved for the
         * existing menu-shortcut set. Defer co-run entry until Shift releases
         * — otherwise the held Shift CC leaks into Move firmware / Schwung
         * chain editor (the shim starts forwarding Shift on co-run entry).
         * Dispatch happens in _onCC_buttons Shift-release branch. */
        closeShortcutSurfaceImpl(S, deps);
        S.pendingEditEntryTrack = S.activeTrack;
    }
    else if (idx === 4) {
        closeShortcutSurfaceImpl(S, deps);
        deps.openTapTempo();
    }
    else if (idx === 5) {
        closeShortcutSurfaceImpl(S, deps);
        S.metronomeOn = (S.metronomeOn === 1) ? 3 : 1;
        if (deps.setParam)
            deps.setParam('metro_on', String(S.metronomeOn));
        deps.showActionPopup(['Off', 'Cnt-In', 'Play', 'Always'][S.metronomeOn]);
    }
    else if (idx === 6) jumpToMenuLabelImpl(S, deps, 'Swing Amt');
    else if (idx === 8) jumpToMenuLabelImpl(S, deps, 'Scale');
}
