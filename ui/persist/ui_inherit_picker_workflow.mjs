export function maybeShowInheritPickerImpl(S, deps, uuid, name) {
    if (!uuid || !name) return 'blank';
    if (typeof deps.fileExists !== 'function') return 'blank';
    if (deps.fileExists(deps.uuidToStatePath(uuid))) return 'blank';
    const idx = S.nameIndexCache || (S.nameIndexCache = deps.loadNameIndex());
    const candidates = deps.findInheritCandidates(name, idx);
    if (candidates.length === 0) return 'blank';
    if (candidates.length === 1) {
        deps.copyStateFiles(candidates[0].uuid, uuid);
        return 'auto';
    }
    S.pendingInheritPicker = {
        dstUuid: uuid,
        dstName: name,
        candidates: candidates,
        selectedIndex: 0
    };
    S.screenDirty = true;
    return 'picker';
}

export function resolveInheritPickerImpl(S, deps, action) {
    const p = S.pendingInheritPicker;
    if (!p) return;
    if (action >= 0 && action < p.candidates.length) {
        deps.copyStateFiles(p.candidates[action].uuid, p.dstUuid);
    }
    S.pendingSetLoad = true;
    S.pendingInheritPicker = null;
    S.screenDirty = true;
}
