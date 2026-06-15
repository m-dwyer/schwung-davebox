import { STATE_VERSION } from './ui_constants.mjs';

function truncateLabel(label, maxChars) {
    return label.length > maxChars ? label.substring(0, maxChars - 1) + '…' : label;
}

function snapById(p, id) {
    for (let i = 0; i < p.snaps.length; i++) if (p.snaps[i].id === id) return p.snaps[i];
    return null;
}

function renderSnapYesNo(deps, sel) {
    const noX = 6, yesX = 74, btnY = 46, btnW = 46, btnH = 13;
    function btn(x, on, label, off) {
        if (on) {
            deps.fill_rect(x, btnY, btnW, btnH, 1);
            deps.print(x + off, btnY + 3, label, 0);
        } else {
            deps.fill_rect(x, btnY, btnW, 1, 1);
            deps.fill_rect(x, btnY + btnH - 1, btnW, 1, 1);
            deps.fill_rect(x, btnY, 1, btnH, 1);
            deps.fill_rect(x + btnW - 1, btnY, 1, btnH, 1);
            deps.print(x + off, btnY + 3, label, 1);
        }
    }
    btn(noX, sel === 1, 'No', 17);
    btn(yesX, sel === 0, 'Yes', 14);
}

export function renderInheritPicker(deps, picker) {
    deps.clear_screen();
    if (!picker) return;

    deps.print(2, 2,  'Copied Move set', 1);
    deps.print(2, 10, 'detected',        1);
    deps.fill_rect(0, 18, 128, 1, 1);
    deps.print(2, 20, 'Inherit Overture', 1);
    deps.print(2, 28, 'state from?',     1);
    deps.fill_rect(0, 36, 128, 1, 1);

    const total = picker.candidates.length + 1;
    const visible = 3;
    const sel = picker.selectedIndex;
    let top = Math.max(0, Math.min(sel - 1, total - visible));
    if (total <= visible) top = 0;
    const lineH = 9;
    const listTopY = 39;
    for (let i = 0; i < visible && (top + i) < total; i++) {
        const idx = top + i;
        const y = listTopY + i * lineH;
        const isBlank = (idx === picker.candidates.length);
        const label = isBlank ? 'Start blank' : picker.candidates[idx].name;
        const truncated = truncateLabel(label, 20);
        if (idx === sel) {
            deps.fill_rect(2, y - 1, 124, lineH - 1, 1);
            deps.print(5, y, truncated, 0);
        } else {
            deps.print(5, y, truncated, 1);
        }
    }
    if (top > 0) deps.print(120, listTopY, '^', 1);
    if (top + visible < total) deps.print(120, listTopY + (visible - 1) * lineH, 'v', 1);
}

export function renderSnapshotPicker(deps, picker) {
    deps.clear_screen();
    if (!picker) return;

    if (picker.confirm) {
        const c = picker.confirm;
        if (c.kind === 'wipe') {
            deps.drawMenuHeader('STATES UPDATED');
            deps.print(4, 18, 'Delete ' + c.wipeIds.length + ' snapshot(s)', 1);
            deps.print(4, 27, 'from an older', 1);
            deps.print(4, 36, 'version?', 1);
        } else if (c.kind === 'load') {
            const s = snapById(picker, c.targetId);
            deps.drawMenuHeader('LOAD STATE');
            deps.print(4, 18, 'Load ' + (s ? s.label : ''), 1);
            deps.print(4, 27, 'Unsaved changes', 1);
            deps.print(4, 36, 'will be lost.', 1);
        } else {
            const s = snapById(picker, c.targetId);
            deps.drawMenuHeader('OVERWRITE');
            deps.print(4, 18, 'Replace', 1);
            deps.print(4, 27, (s ? s.label : '') + '?', 1);
        }
        renderSnapYesNo(deps, c.sel);
        return;
    }

    deps.drawMenuHeader(picker.mode === 'overwrite' ? 'OVERWRITE WHICH?' : 'LOAD STATE');
    const total = picker.snaps.length;
    const visible = 4;
    const sel = picker.sel;
    let top = Math.max(0, Math.min(sel - 1, total - visible));
    if (total <= visible) top = 0;
    const lineH = 9;
    const listTopY = 20;
    for (let i = 0; i < visible && (top + i) < total; i++) {
        const idx = top + i;
        const y = listTopY + i * lineH;
        const s = picker.snaps[idx];
        let label = s.label || '';
        if (picker.mode === 'load' && s.sv !== STATE_VERSION) label += ' (old)';
        const truncated = truncateLabel(label, 20);
        if (idx === sel) {
            deps.fill_rect(2, y - 1, 124, lineH - 1, 1);
            deps.print(5, y, truncated, 0);
        } else {
            deps.print(5, y, truncated, 1);
        }
    }
    if (top > 0) deps.print(120, listTopY, '^', 1);
    if (top + visible < total) deps.print(120, listTopY + (visible - 1) * lineH, 'v', 1);
}

export function renderClearAutomationMenu(deps, menu) {
    deps.clear_screen();
    if (!menu) return;
    deps.drawMenuHeader('CLEAR AUTOMATION');
    const rows = [
        { label: 'Aftertouch (AT)',     box: menu.at ? '[x]' : '[ ]' },
        { label: 'Pitch bend (PB)',     box: '( )' },
        { label: 'Control Change (CC)', box: menu.cc ? '[x]' : '[ ]' },
        { label: 'CLEAR',  action: true },
        { label: 'Cancel', action: true }
    ];
    const lineH = 9, topY = 18;
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const y = topY + i * lineH;
        const selected = (menu.sel === i);
        if (selected) deps.fill_rect(2, y - 1, 124, lineH - 1, 1);
        const txt = r.action ? r.label : (r.box + ' ' + r.label);
        deps.print(5, y, txt, selected ? 0 : 1);
    }
}
