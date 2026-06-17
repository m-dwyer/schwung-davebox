import { S, PERF_FACTORY_PRESETS } from '../core/ui_state.mjs';

const PERF_MOD_NAMES = [
    'Oct↑','Oct↓','Sc↑','Sc↓','5th','Triton','Drift','Storm',
    'Decrsc','Swell','Cresc','Pulse','Sdchn','Stac','Lgto','RmpG',
    '½time','3Skip','Phnm','Sprs','Gltch','Stggr','Shfl','Back',
];

function modAscii(name) {
    return name.replace('↑', '+').replace('↓', '-').replace('½', 'Hf');
}

function renderPerfChip(deps, x, y, label, active) {
    const w = label.length * 6 + 3;
    if (active) {
        deps.fill_rect(x, y, w, 9, 1);
        deps.pixelPrint(x + 2, y + 2, label, 0);
    } else {
        deps.fill_rect(x,         y,     w, 1, 1);
        deps.fill_rect(x,         y + 8, w, 1, 1);
        deps.fill_rect(x,         y,     1, 9, 1);
        deps.fill_rect(x + w - 1, y,     1, 9, 1);
        deps.pixelPrint(x + 2, y + 2, label, 1);
    }
    return w;
}

export function renderPerfModeOled(deps) {
    deps.clear_screen();
    const activeMods = S.perfModsToggled | S.perfModsHeld;

    deps.fill_rect(0, 0, 128, 12, 1);
    let title;
    if (S.perfRecalledSlot >= 0) {
        const preset = PERF_FACTORY_PRESETS[S.perfRecalledSlot];
        title = preset ? preset.name : ('SLOT ' + (S.perfRecalledSlot + 1));
    } else {
        title = 'PERFORMANCE';
    }
    deps.print(4, 3, title, 0);

    if (S.actionPopupEndTick >= 0 && S.tickCount <= S.actionPopupEndTick && S.actionPopupLines.length > 0) {
        const count = S.actionPopupLines.length;
        if (count >= 4) {
            deps.print(4, 14, S.actionPopupLines[0], 1);
            deps.print(4, 25, S.actionPopupLines[1], 1);
            deps.print(4, 36, S.actionPopupLines[2], 1);
            deps.print(4, 47, S.actionPopupLines[3], 1);
        } else if (count === 3) {
            deps.print(4, 17, S.actionPopupLines[0], 1);
            deps.print(4, 29, S.actionPopupLines[1], 1);
            deps.print(4, 41, S.actionPopupLines[2], 1);
        } else if (count === 2) {
            deps.print(4, 20, S.actionPopupLines[0], 1);
            deps.print(4, 32, S.actionPopupLines[1], 1);
        } else {
            deps.print(4, 26, S.actionPopupLines[0], 1);
        }
    } else if (S.perfModPopupEndTick >= 0 && S.tickCount <= S.perfModPopupEndTick && S.perfModPopupName) {
        const px = Math.floor((128 - S.perfModPopupName.length * 6) / 2);
        deps.print(px < 0 ? 0 : px, 26, S.perfModPopupName, 1);
    } else {
        S.perfModPopupEndTick = -1;
        const activeNames = [];
        for (let i = 0; i < PERF_MOD_NAMES.length; i++)
            if ((activeMods >> i) & 1) activeNames.push(modAscii(PERF_MOD_NAMES[i]));
        if (activeNames.length === 0) {
            deps.pixelPrint(4, 24, 'no mods active', 1);
            deps.pixelPrint(4, 34, 'tap pad to engage', 1);
        } else {
            const maxChars = 20;
            const maxLines = 4;
            const lines = [];
            let cur = '';
            for (let i = 0; i < activeNames.length; i++) {
                const sep = cur ? '  ' : '';
                const next = cur + sep + activeNames[i];
                if (next.length > maxChars && cur) {
                    lines.push(cur);
                    if (lines.length >= maxLines) { cur = ''; break; }
                    cur = activeNames[i];
                } else {
                    cur = next;
                }
            }
            if (cur && lines.length < maxLines) lines.push(cur);
            for (let line = 0; line < lines.length; line++) {
                deps.pixelPrint(4, 16 + line * 8, lines[line], 1);
            }
        }
    }

    const fy = 53;
    let fx = 2;
    fx += renderPerfChip(deps, fx, fy, 'Hold',  S.perfHoldPadHeld || S.perfStickyLengths.size > 0) + 3;
    fx += renderPerfChip(deps, fx, fy, 'Sync',  S.perfSync) + 3;
    fx += renderPerfChip(deps, fx, fy, 'Latch', S.perfLatchMode) + 3;

    if (S.perfStack.length > 0) {
        const rateLabels = ['1/32','1/16','1/8','1/4','1/2'];
        const top = S.perfStack[S.perfStack.length - 1];
        const label = rateLabels[top.idx];
        const w = label.length * 6 + 3;
        const rx = 128 - w - 2;
        deps.fill_rect(rx, fy, w, 9, 1);
        deps.pixelPrint(rx + 2, fy + 2, label, 0);
    }
}
