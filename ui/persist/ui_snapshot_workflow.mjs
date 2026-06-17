export function beginSnapshotSaveImpl(S, deps, id) {
    S.pendingSnapshotCopy = { id: id, label: deps.snapshotLabel() };
    deps.saveState();
}

export function openSaveSnapshotImpl(S, deps) {
    if (S.pendingSuspendSave || S.pendingSnapshotCopy) return;  /* save already in flight */
    const snaps = deps.loadSnapshotManifest(S.currentSetUuid);
    if (snaps.length >= deps.snapshotCap) {
        S.snapshotPicker = { mode: 'overwrite', snaps: snaps, sel: 0, confirm: null };
        S.globalMenuOpen = false;
        S.screenDirty = true;
        return;
    }
    beginSnapshotSaveImpl(S, deps, String(deps.now()));
    S.globalMenuOpen = false;
    deps.showActionPopup('STATE', 'SAVED');
}

export function openLoadSnapshotImpl(S, deps) {
    const snaps = deps.loadSnapshotManifest(S.currentSetUuid);
    if (snaps.length === 0) {
        S.globalMenuOpen = false;
        deps.showActionPopup('NO', 'SNAPSHOTS');
        return;
    }
    const stale = [];
    for (let i = 0; i < snaps.length; i++)
        if (snaps[i].sv !== deps.stateVersion) stale.push(snaps[i].id);
    S.snapshotPicker = { mode: 'load', snaps: snaps, sel: 0, confirm: null };
    if (stale.length > 0)
        S.snapshotPicker.confirm = { kind: 'wipe', sel: 1, wipeIds: stale };
    S.globalMenuOpen = false;
    S.screenDirty = true;
}

export function closeSnapshotPickerImpl(S) {
    S.snapshotPicker = null;
    S.screenDirty = true;
}

export function snapshotPickerRotateImpl(S, delta) {
    const p = S.snapshotPicker;
    if (!p || delta === 0) return;
    if (p.confirm) {
        p.confirm.sel = p.confirm.sel === 0 ? 1 : 0;
    } else {
        const n = p.snaps.length;
        if (n > 0) p.sel = (p.sel + (delta > 0 ? 1 : n - 1)) % n;
    }
    S.screenDirty = true;
}

export function snapshotPickerClickImpl(S, deps) {
    const p = S.snapshotPicker;
    if (!p) return;
    if (p.confirm) {
        const yes = p.confirm.sel === 0;
        const kind = p.confirm.kind;
        if (kind === 'wipe') {
            if (yes) { p.snaps = deps.dropSnapshots(S.currentSetUuid, p.confirm.wipeIds); p.sel = 0; }
            p.confirm = null;
            if (p.snaps.length === 0) closeSnapshotPickerImpl(S);
            else S.screenDirty = true;
            return;
        }
        const id = p.confirm.targetId;
        closeSnapshotPickerImpl(S);
        if (kind === 'load' && yes) {
            deps.applySnapshotToLive(S.currentSetUuid, id);
            S.pendingSetLoad = true;          /* reuse the normal state_load reload path */
            deps.showActionPopup('STATE', 'LOADED');
        } else if (kind === 'overwrite' && yes) {
            beginSnapshotSaveImpl(S, deps, id);            /* reuse id -> overwrite in place */
            deps.showActionPopup('STATE', 'SAVED');
        }
        return;
    }
    const snap = p.snaps[p.sel];
    if (!snap) return;
    if (p.mode === 'load') {
        if (snap.sv !== deps.stateVersion) return;   /* incompatible: ignore press */
        p.confirm = { kind: 'load', sel: 1, targetId: snap.id };
    } else {
        p.confirm = { kind: 'overwrite', sel: 1, targetId: snap.id };
    }
    S.screenDirty = true;
}
