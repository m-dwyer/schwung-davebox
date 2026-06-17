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
        if (m.cc) {
            S.trackCCAutoBits[t][c] = 0;
            S.trackCCLiveVal[t] = new Array(8).fill(-1);
            S.clipCCVal[t][c] = new Array(8).fill(-1);
            S.pendingDefaultSetParams.push({ key: 't' + t + '_cc_auto_clear', val: String(c) });
        }
        if (m.at) {
            S.clipAtHas[t][c] = false;
            S.pendingDefaultSetParams.push({ key: 't' + t + '_c' + c + '_at_clear', val: '1' });
        }
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
