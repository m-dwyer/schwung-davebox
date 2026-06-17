import { S } from '../core/ui_state.mjs';
import { NOTE_KEYS, PAD_MODE_DRUM } from '../core/ui_constants.mjs';
import { effectiveClip } from './ui_leds.mjs';

export function renderTrackStepEditView(deps) {
    renderStepEditHeader(deps);
    if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM) {
        renderDrumStepEditGrid(deps);
        return true;
    }

    if (S.heldStepNotes.length > 0) {
        renderMelodicStepEditGrid(deps);
        return true;
    }
    if (S.stepWasEmpty) {
        deps.print(4, 30, '(empty)', 1);
        return true;
    }
    return false;
}

function renderStepEditHeader(deps) {
    deps.pixelPrint(37, 1, 'STEP EDIT', 1);
    deps.fill_rect(0, 9, 128, 1, 1);
}

function renderDrumStepEditGrid(deps) {
    const t = S.activeTrack;
    if (S.heldStepNotes.length <= 0) {
        deps.print(4, 30, '(empty)', 1);
        return;
    }

    const tps = S.drumLaneTPS[t] || 24;
    const gateSteps = S.stepEditGate / tps;
    const labels = ['Leng', 'Vel', 'Nudg', '--', 'Iter', 'Prob', 'Ratch', '--'];
    const vals = [
        gateSteps % 1 === 0 ? gateSteps.toFixed(0) : gateSteps.toFixed(2),
        String(S.stepEditVel),
        (S.stepEditNudge >= 0 ? '+' : '') + String(S.stepEditNudge),
        '',
        formatStepIter(S.stepEditIter),
        formatStepRand(S.stepEditRand),
        formatStepRatch(S.stepEditRatch),
        ''
    ];
    renderStepEditCells(deps, labels, vals, [3, 7]);
}

function renderMelodicStepEditGrid(deps) {
    const ac = effectiveClip(S.activeTrack);
    const root = S.heldStepNotes[0];
    const noteLabel = S.heldStepNotes.length > 1
        ? midiNoteName(root) + '+' + (S.heldStepNotes.length - 1)
        : midiNoteName(root);
    const tps = S.clipTPS[S.activeTrack][ac] || 24;
    const gateSteps = S.stepEditGate / tps;
    const labels = ['Oct', 'Note', 'Leng', 'Vel', 'Nudg', 'Iter', 'Prob', 'Ratch'];
    const vals = [
        noteLabel,
        noteLabel,
        gateSteps % 1 === 0 ? gateSteps.toFixed(0) : gateSteps.toFixed(2),
        String(S.stepEditVel),
        (S.stepEditNudge >= 0 ? '+' : '') + String(S.stepEditNudge),
        formatStepIter(S.stepEditIter),
        formatStepRand(S.stepEditRand),
        formatStepRatch(S.stepEditRatch)
    ];
    const colX = [0, 32, 64, 96];
    const rowY = [13, 35];
    const cellW = 31;
    const cellH = 22;
    const hiOP = (S.knobTouched === 0 || S.knobTouched === 1);
    const opX = colX[0];
    const opW = colX[1] + cellW - colX[0];
    if (hiOP) deps.fill_rect(opX, rowY[0] - 3, opW, cellH, 1);
    deps.print(colX[0] + 1, rowY[0], 'Oct', hiOP ? 0 : 1);
    deps.print(colX[1] + 1, rowY[0], 'Note', hiOP ? 0 : 1);
    deps.fill_rect(opX, rowY[0] + 7, opW, 1, hiOP ? 0 : 1);
    const noteX = opX + ((opW - noteLabel.length * 6) >> 1);
    deps.print(noteX, rowY[0] + 10, noteLabel, hiOP ? 0 : 1);
    renderStepEditCells(deps, labels, vals, [0, 1]);
}

function renderStepEditCells(deps, labels, vals, skip) {
    const colX = [0, 32, 64, 96];
    const rowY = [13, 35];
    const cellW = 31;
    const cellH = 22;
    for (let i = 0; i < 8; i++) {
        if (skip.indexOf(i) >= 0) continue;
        const col = i % 4;
        const row = (i / 4) | 0;
        const x = colX[col];
        const y = rowY[row];
        const hi = (S.knobTouched === i);
        if (hi) deps.fill_rect(x, y - 3, cellW, cellH, 1);
        deps.print(x + 1, y, labels[i], hi ? 0 : 1);
        deps.print(x + 1, y + 10, vals[i], hi ? 0 : 1);
    }
}

function formatStepIter(raw) {
    if (!raw) return '--';
    return (raw & 0xF) + '/' + ((raw >> 4) & 0xF);
}

function formatStepRand(raw) {
    if (!raw) return '--';
    return raw + '%';
}

function formatStepRatch(raw) {
    if (raw < 2) return '--';
    return 'x' + raw;
}

function midiNoteName(n) {
    return NOTE_KEYS[n % 12] + (Math.floor(n / 12) - 1);
}
