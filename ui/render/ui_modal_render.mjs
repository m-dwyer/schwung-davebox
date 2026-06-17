import { STATE_VERSION } from '../core/ui_constants.mjs';

function truncateLabel(label, maxChars) {
    return label.length > maxChars ? label.substring(0, maxChars - 1) + '…' : label;
}

function snapById(p, id) {
    for (let i = 0; i < p.snaps.length; i++) if (p.snaps[i].id === id) return p.snaps[i];
    return null;
}

function renderButton(deps, x, y, w, h, selected, label, labelOff) {
    if (selected) {
        deps.fill_rect(x, y, w, h, 1);
        deps.print(x + labelOff, y + 3, label, 0);
    } else {
        deps.fill_rect(x, y, w, 1, 1);
        deps.fill_rect(x, y + h - 1, w, 1, 1);
        deps.fill_rect(x, y, 1, h, 1);
        deps.fill_rect(x + w - 1, y, 1, h, 1);
        deps.print(x + labelOff, y + 3, label, 1);
    }
}

function renderSnapYesNo(deps, sel) {
    const noX = 6, yesX = 74, btnY = 46, btnW = 46, btnH = 13;
    renderButton(deps, noX, btnY, btnW, btnH, sel === 1, 'No', 17);
    renderButton(deps, yesX, btnY, btnW, btnH, sel === 0, 'Yes', 14);
}

export function renderStateWipeConfirm(deps, selected) {
    deps.clear_screen();
    deps.drawMenuHeader('Incompatible State');
    deps.print(4, 16, 'Session incompatible', 1);
    deps.print(4, 25, 'with current dB ver.', 1);
    deps.print(4, 34, 'Erase and proceed?', 1);
    renderButton(deps, 6,  46, 46, 13, selected === 0, 'Yes', 14);
    renderButton(deps, 74, 46, 46, 13, selected === 1, 'No',  17);
}

export function renderRecordBlockedDialog(deps, selected) {
    deps.clear_screen();
    deps.drawMenuHeader('REC Unavailable');
    deps.print(4, 16, 'Set Dir to Fwd', 1);
    deps.print(4, 25, 'or Bake', 1);
    renderButton(deps, 6,  46, 46, 13, selected === 0, 'OK',       19);
    renderButton(deps, 58, 46, 64, 13, selected === 1, 'BAKE NOW', 6);
}

export function renderLgtoConfirm(deps, opts) {
    deps.clear_screen();
    deps.drawMenuHeader(opts && opts.isDrum ? 'Lgto (lane)' : 'Lgto (clip)');
    deps.print(4, 16, 'Destructive', 1);
    deps.print(4, 25, 'Proceed?', 1);
    const selected = opts ? opts.selected : 0;
    renderButton(deps, 6,  46, 46, 13, selected === 0, 'OK',     19);
    renderButton(deps, 58, 46, 64, 13, selected === 1, 'CANCEL', 14);
}

export function renderBakeConfirm(deps, opts) {
    opts = opts || {};
    deps.clear_screen();
    if (opts.wrapPhase) {
        deps.drawMenuHeader('WRAP TAILS?');
        deps.print(4, 16, 'Wrap delay echoes', 1);
        deps.print(4, 25, 'past clip end back', 1);
        deps.print(4, 34, 'to the beginning?', 1);
        const bW = 38, bH = 13, bY = 50;
        renderButton(deps, 4,  bY, bW, bH, opts.wrapSel === 0, 'YES',    9);
        renderButton(deps, 45, bY, bW, bH, opts.wrapSel === 1, 'NO',    14);
        renderButton(deps, 86, bY, bW, bH, opts.wrapSel === 2, 'CANCEL', 1);
    } else if (opts.isMultiLoop) {
        deps.drawMenuHeader('BAKE FX?');
        deps.print(4, 14, 'Bake N loops of FX', 1);
        deps.print(4, 23, 'chain to clip?', 1);
        const bH = 12, bY = 38;
        renderButton(deps, 2,  bY, 27, bH, opts.sel === 1, '1x',     9);
        renderButton(deps, 31, bY, 27, bH, opts.sel === 2, '2x',     9);
        renderButton(deps, 60, bY, 27, bH, opts.sel === 3, '4x',     9);
        renderButton(deps, 89, bY, 37, bH, opts.sel === 0, 'CANCEL', 3);
    } else if (!opts.isDrum) {
        deps.drawMenuHeader('BAKE FX?');
        deps.print(4, 16, 'Apply effects chain', 1);
        deps.print(4, 25, 'to clip notes and', 1);
        deps.print(4, 34, 'clear the settings.', 1);
        renderButton(deps, 6,  46, 46, 13, opts.sel === 1, 'No',  17);
        renderButton(deps, 74, 46, 46, 13, opts.sel === 0, 'Yes', 14);
    } else if (opts.drumLoopOpen) {
        const modeLabel = opts.drumMode === 1 ? 'LANE' : 'CLIP';
        deps.drawMenuHeader('BAKE DRUMS?');
        deps.print(4, 13, modeLabel + ' — loop count:', 1);
        const mH = 11;
        renderButton(deps, 14, 33, 100, mH, opts.drumLoopSel === 0, 'CANCEL', 31);
        renderButton(deps, 4,  47, 36,  mH, opts.drumLoopSel === 1, '1x', 12);
        renderButton(deps, 46, 47, 36,  mH, opts.drumLoopSel === 2, '2x', 12);
        renderButton(deps, 88, 47, 36,  mH, opts.drumLoopSel === 3, '4x', 12);
    } else {
        deps.drawMenuHeader('BAKE DRUMS?');
        deps.print(4, 16, 'Bake FX to clip', 1);
        deps.print(4, 25, '(all lanes) or lane?', 1);
        const bW = 38, bH = 13, bY = 50;
        renderButton(deps, 4,  bY, bW, bH, opts.sel === 0, 'CLIP',   7);
        renderButton(deps, 45, bY, bW, bH, opts.sel === 1, 'LANE',   7);
        renderButton(deps, 86, bY, bW, bH, opts.sel === 2, 'CANCEL', 1);
    }
}

export function renderBakeSceneConfirm(deps, opts) {
    opts = opts || {};
    deps.clear_screen();
    deps.drawMenuHeader('BAKE SCENE?');
    const mH = 11;
    if (opts.wrapPhase) {
        deps.print(4, 22, 'Wrap tails?', 1);
        const bY = 47, bW = 36;
        renderButton(deps, 4,  bY, bW, mH, opts.wrapSel === 0, 'YES',    9);
        renderButton(deps, 45, bY, bW, mH, opts.wrapSel === 1, 'NO',    14);
        renderButton(deps, 86, bY, bW, mH, opts.wrapSel === 2, 'CANCEL', 1);
    } else {
        deps.print(4, 22, 'Loop count:', 1);
        renderButton(deps, 14, 33, 100, mH, opts.sel === 0, 'CANCEL', 31);
        renderButton(deps, 4,  47, 36,  mH, opts.sel === 1, '1x', 12);
        renderButton(deps, 46, 47, 36,  mH, opts.sel === 2, '2x', 12);
        renderButton(deps, 88, 47, 36,  mH, opts.sel === 3, '4x', 12);
    }
}

export function renderXposeConfirm(deps, opts) {
    opts = opts || {};
    const noteKeys = opts.noteKeys || [];
    const scaleDisplay = opts.scaleDisplay || [];
    deps.clear_screen();
    deps.drawMenuHeader('TRANSPOSE CLIPS?');
    const tgt = noteKeys[opts.key] + ' ' + (scaleDisplay[opts.scale] || '?');
    deps.print(4, 22, 'To ' + tgt, 1);
    deps.print(4, 33, 'All melodic clips', 1);
    const mH = 11, bY = 50, bW = 50;
    renderButton(deps, 4,  bY, bW, mH, opts.sel === 0, 'YES', 17);
    renderButton(deps, 74, bY, bW, mH, opts.sel === 1, 'NO',  20);
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
