import { clearAutomationImpl } from '../sync/ui_automation_clear_ops.mjs';

export function openClearAutoMenuImpl(S) {
    S.clearAutoMenu = { sel: 0, at: false, cc: false };
    S.screenDirty = true;
}

export function closeClearAutoMenuImpl(S) {
    S.clearAutoMenu = null;
    S.screenDirty = true;
}

export function clearAutoMenuRotateImpl(S, delta) {
    const m = S.clearAutoMenu;
    if (!m || delta === 0) return;
    m.sel = (m.sel + (delta > 0 ? 1 : 4)) % 5;   /* 0=AT 1=PB 2=CC 3=CLEAR 4=Cancel */
    S.screenDirty = true;
}

export function clearAutoMenuClickImpl(S, deps) {
    const m = S.clearAutoMenu;
    if (!m) return;
    if (m.sel === 0) { m.at = !m.at; }              /* Aftertouch (AT) */
    else if (m.sel === 1) { /* Pitch bend (PB) — placeholder, not selectable */ }
    else if (m.sel === 2) { m.cc = !m.cc; }         /* Control Change (CC) — all CC data */
    else if (m.sel === 4) { closeClearAutoMenuImpl(S); return; }   /* Cancel */
    else {                                           /* CLEAR — execute */
        const t = S.activeTrack, c = deps.effectiveClip(t);
        clearAutomationImpl(S, t, c, { cc: m.cc, at: m.at });
        const done = [];
        if (m.at) done.push('AT');
        if (m.cc) done.push('CC');
        if (done.length) {
            S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
        }
        closeClearAutoMenuImpl(S);
        deps.invalidateLEDCache();
        deps.showActionPopup('CLEARED', done.length ? done.join(' ') : 'NOTHING');
        return;
    }
    S.screenDirty = true;
}
