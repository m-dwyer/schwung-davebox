import { S } from '../core/ui_state.mjs';
import { PAD_MODE_DRUM } from '../core/ui_constants.mjs';

const BANK_CYCLE_DRUM = [7, 0, 1, 3, 5, 6];

function bankCyclePos() {
    if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM) {
        const i = BANK_CYCLE_DRUM.indexOf(S.activeBank);
        return { idx: i < 0 ? 0 : i, count: BANK_CYCLE_DRUM.length };
    }
    return { idx: Math.max(0, Math.min(6, S.activeBank)), count: 7 };
}

export function drawBankStrip(deps, rightX, hdrBgWhite) {
    const fg = hdrBgWhite ? 0 : 1;
    const pos = bankCyclePos();
    const segW = 3, pitch = 4;
    const startX = rightX - (pos.count * pitch - 1);
    for (let i = 0; i < pos.count; i++) {
        const x = startX + i * pitch;
        if (i === pos.idx) deps.fill_rect(x, 1, segW, 6, fg);
        else               deps.fill_rect(x, 5, segW, 2, fg);
    }
    return startX;
}

export function drawBankHeaderRight(deps, showTrack, hdrBgWhite) {
    if (S.sessionView) return;
    const hasAlt = deps.bankHasAltParams(S.activeTrack, S.activeBank);
    if (showTrack === false) {
        const sx = drawBankStrip(deps, 124, hdrBgWhite);
        if (hasAlt) drawAltArrow(deps, sx - 8, hdrBgWhite, deps.altIndicatorActive(S.activeTrack, S.activeBank));
    } else if (hasAlt) {
        drawAltArrow(deps, 98, hdrBgWhite, deps.altIndicatorActive(S.activeTrack, S.activeBank));
    }
}

export function drawBankHeading(deps, name, showTrack) {
    deps.fill_rect(0, 0, 128, 9, 1);
    deps.print(4, 1, name, 0);
    if (showTrack !== false) deps.print(106, 1, 'Tr' + (S.activeTrack + 1), 0);
    drawBankHeaderRight(deps, showTrack, true);
}

export function drawBankHeadingInverted(deps, name, showTrack) {
    deps.fill_rect(0, 0, 128, 9, 0);
    deps.fill_rect(0, 0, 128, 1, 1);
    deps.fill_rect(0, 8, 128, 1, 1);
    deps.print(4, 1, name, 1);
    if (showTrack !== false) deps.print(106, 1, 'Tr' + (S.activeTrack + 1), 1);
    drawBankHeaderRight(deps, showTrack, false);
}

export function drawAltArrow(deps, x, hdrBgWhite, on) {
    if (on && S._altBlinkPhase === 1) return;
    const fg = hdrBgWhite ? 0 : 1;
    deps.fill_rect(x,     2, 5, 1, fg);
    deps.fill_rect(x + 1, 3, 3, 1, fg);
    deps.fill_rect(x + 2, 4, 1, 1, fg);
}
