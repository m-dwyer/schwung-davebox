import { S } from '../core/ui_state.mjs';

export function renderSessionActionPopup(deps) {
    const n = S.actionPopupLines.length;
    if (n >= 4) {
        deps.print(4, 14, S.actionPopupLines[0], 1);
        deps.print(4, 25, S.actionPopupLines[1], 1);
        deps.print(4, 36, S.actionPopupLines[2], 1);
        deps.print(4, 47, S.actionPopupLines[3], 1);
    } else if (n === 3) {
        deps.print(4, 17, S.actionPopupLines[0], 1);
        deps.print(4, 29, S.actionPopupLines[1], 1);
        deps.print(4, 41, S.actionPopupLines[2], 1);
    } else if (n === 2) {
        deps.print(4, 22, S.actionPopupLines[0], 1);
        deps.print(4, 34, S.actionPopupLines[1], 1);
    } else {
        deps.print(4, 28, S.actionPopupLines[0], 1);
    }
}

export function renderTrackActionPopup(deps) {
    if (S.actionPopupHighlight >= 0 && S.actionPopupLines.length >= 3) {
        const title = S.actionPopupLines[0];
        const tw = title.length * 6;
        const tx = Math.floor((128 - tw) / 2);
        deps.print(tx, 4, title, 1);
        deps.fill_rect(tx, 13, tw, 1, 1);
        for (let li = 1; li < S.actionPopupLines.length; li++) {
            const ly = 12 + li * 14;
            const lw = S.actionPopupLines[li].length * 6;
            const lx = Math.floor((128 - lw) / 2);
            if (li === S.actionPopupHighlight) {
                deps.fill_rect(0, ly - 1, 128, 13, 1);
                deps.print(lx, ly, S.actionPopupLines[li], 0);
            } else {
                deps.print(lx, ly, S.actionPopupLines[li], 1);
            }
        }
    } else if (S.actionPopupLines.length >= 2) {
        deps.print(4, 22, S.actionPopupLines[0], 1);
        deps.print(4, 34, S.actionPopupLines[1], 1);
    } else {
        deps.print(4, 28, S.actionPopupLines[0], 1);
    }
}
