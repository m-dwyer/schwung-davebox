import { S } from './ui_state.mjs';
import {
    BANKS,
    TPS_VALUES,
    col4,
    fmtBool,
    fmtGateMod,
    fmtLen,
    fmtPct,
    fmtPlayDir,
    fmtRes,
    fmtRevStyle,
    fmtSign,
    fmtStretch,
    fmtVelOverride
} from './ui_constants.mjs';
import { effectiveClip } from './ui_leds.mjs';

export function renderDrumLaneBankOverview(deps) {
    const t    = S.activeTrack;
    const ac   = effectiveClip(t);
    const lane = S.activeDrumLane[t];
    const len  = S.drumLaneLength[t];
    const tpsIdx = Math.max(0, TPS_VALUES.indexOf(S.drumLaneTPS[t]));
    const sqfl   = S.clipSeqFollow[t][ac] ? 1 : 0;
    const eucN = Math.min(S.drumLaneEuclidN[t][lane] | 0, len);
    const drumLaneLabels = [S.altMode ? 'Zoom' : 'Res', 'Stch', S.altMode ? 'Nudg' : 'Shft', 'Lgto', 'Eucl', '-', S.altMode ? 'Rvrs' : 'Dir', 'SqFl'];
    const drumLaneVals  = [
        fmtRes(tpsIdx),
        fmtStretch(S.bankParams[t][0][1]),
        fmtSign(S.bankParams[t][0][2]),
        '->',
        String(eucN),
        '-',
        S.altMode ? fmtRevStyle(S.drumLanePlaybackAudioReverse[t][lane] | 0)
                  : fmtPlayDir(S.drumLanePlaybackDir[t][lane] | 0),
        fmtBool(sqfl),
    ];
    deps.drawBankHeading('DRUM LANE');
    renderBankCells(deps, drumLaneLabels, drumLaneVals);
}

export function renderAllLanesConfirm(deps) {
    deps.fill_rect(0, 0, 128, 9, 1);
    deps.print(4, 1, 'ALL LANES', 0);
    deps.print(106, 1, 'Tr' + (S.activeTrack + 1), 0);
    deps.print(10, 18, 'Edits will affect', 1);
    deps.print(10, 28, 'all lanes.', 1);
    deps.fill_rect(40, 44, 48, 16, 1);
    deps.print(52, 48, 'OK', 0);
}

export function renderAllLanesBankOverview(deps) {
    const t = S.activeTrack;
    const rv = S.bankParams[t][7][0];
    const qv = S.bankParams[t][7][3];
    const dv = S.bankParams[t][7][6];
    const DIQ_LABELS = ['Off','1/64','1/32','1/16','1/16T','1/8','1/8T','1/4','1/4T'];
    const allLabels = ['Res', 'Stch', S.altMode ? 'Nudg' : 'Shft', 'Qnt', 'VelIn', 'InQ', S.altMode ? 'Rvrs' : 'Dir', 'SyncRpt'];
    const allVals = [
        rv < 0 ? '--' : fmtRes(rv),
        fmtStretch(S.bankParams[t][7][1]),
        fmtSign(S.bankParams[t][7][2]),
        qv <= 0 ? '--' : fmtPct(qv),
        fmtVelOverride(S.trackVelOverride[t]),
        DIQ_LABELS[S.drumInpQuant[t]] || 'Off',
        dv < 0 ? '--' : (S.altMode ? fmtRevStyle(dv) : fmtPlayDir(dv)),
        fmtBool(S.bankParams[t][7][7]),
    ];
    deps.fill_rect(0, 0, 128, 9, 1);
    deps.print(4, 1, (Math.floor(S.tickCount / 24) % 2 === 0 ? 'ALL' : '   ') + ' LANES', 0);
    deps.print(106, 1, 'Tr' + (S.activeTrack + 1), 0);
    deps.drawAltArrow(98, true, deps.altIndicatorActive(S.activeTrack, S.activeBank));
    renderBankCells(deps, allLabels, allVals, { wideLabels: true });
}

export function renderDrumNoteFxBankOverview(deps) {
    const t    = S.activeTrack;
    const vals = S.bankParams[t][1];
    deps.drawBankHeading('NOTE FX');
    {
        const lane     = S.activeDrumLane[t];
        const dlNote   = S.drumLaneNote[t][lane];
        const noteStr  = deps.midiNoteName(dlNote) + ' ' + dlNote;
        const hiLane   = (S.knobTouched === 0 || S.knobTouched === 1);
        const LX = 4, LY = 12, LW = 54, LH = 24;
        if (hiLane) {
            deps.fill_rect(LX, LY, LW, LH, 1);
        } else {
            deps.fill_rect(LX, LY + 9, LW, 1, 1);
        }
        const lc = hiLane ? 0 : 1;
        deps.print(LX + Math.floor((LW/2 - 18) / 2),                    LY + 1,  'Oct',  lc);
        deps.print(LX + Math.floor(LW/2) + Math.floor((LW/2 - 24) / 2), LY + 1,  'Note', lc);
        deps.print(LX + Math.floor((LW - noteStr.length * 6) / 2),      LY + 13, noteStr, lc);
    }
    {
        const lane = S.activeDrumLane[t];
        const nfxLabels = [null, null, 'Vel', 'Qnt', 'Len>', '>Gate', null, null];
        const nfxVals   = [null, null, fmtSign(vals[1]), fmtPct(vals[2]),
                           fmtLen(S.drumLaneLenMode[t][lane] | 0), fmtPct(vals[0]),
                           null, null];
        for (let k = 2; k < 6; k++) {
            const colX = 4 + (k % 4) * 30;
            const rowY = k < 4 ? 12 : 36;
            const hi   = (S.knobTouched === k);
            const cellW = (k === 5) ? 30 : 24;
            if (hi) deps.fill_rect(colX, rowY, cellW, 24, 1);
            const lbl = nfxLabels[k];
            deps.print(colX, rowY,      lbl.length > 4 ? lbl : col4(lbl), hi ? 0 : 1);
            deps.print(colX, rowY + 12, col4(nfxVals[k]),                 hi ? 0 : 1);
        }
    }
}

export function renderDrumRepeatGrooveBankOverview(deps) {
    const t    = S.activeTrack;
    const lane = S.activeDrumLane[t];
    deps.fill_rect(0, 0, 128, 9, 0);
    deps.fill_rect(0, 0, 128, 1, 1);
    deps.fill_rect(0, 8, 128, 1, 1);
    deps.print(4, 1, 'REPEAT GROOVE', 1);
    if (!S.sessionView && deps.bankHasAltParams(S.activeTrack, S.activeBank)) {
        deps.drawAltArrow(98, false, deps.altIndicatorActive(S.activeTrack, S.activeBank));
    }
    const gLen = S.drumRepeatGateLen[t][lane];
    for (let k = 0; k < 8; k++) {
        const colX = 4 + (k % 4) * 30;
        const rowY = k < 4 ? 12 : 36;
        const hi   = (S.knobTouched === k);
        if (hi) deps.fill_rect(colX, rowY, 24, 24, 1);
        if (k >= gLen) continue;
        const gateOn = !!(S.drumRepeatGate[t][lane] & (1 << k));
        if (gateOn) {
            deps.fill_rect(colX, rowY + 1, 24, 4, hi ? 0 : 1);
        } else {
            const bc = hi ? 0 : 1;
            deps.fill_rect(colX, rowY + 1, 24, 1, bc);
            deps.fill_rect(colX, rowY + 4, 24, 1, bc);
            deps.fill_rect(colX, rowY + 1, 1, 4, bc);
            deps.fill_rect(colX + 23, rowY + 1, 1, 4, bc);
        }
        const vs   = S.drumRepeatVelScale[t][lane][k];
        const ndg  = S.drumRepeatNudge[t][lane][k];
        const disp = S.altMode
            ? (ndg === 0 ? ' 0%' : (ndg > 0 ? '+' : '') + ndg + '%')
            : vs + '%';
        deps.print(colX, rowY + 12, col4(disp), hi ? 0 : 1);
    }
}

export function renderDrumMidiDelayBankOverview(deps) {
    const t     = S.activeTrack;
    const vals  = S.bankParams[t][3];
    const knobs = BANKS[3].knobs;
    const drumDlyLabels = [knobs[0].abbrev, knobs[1].abbrev, knobs[2].abbrev, knobs[3].abbrev, 'Gate', 'Clk', 'Retrg', null];
    const drumDlyFmt    = [knobs[0].fmt, knobs[1].fmt, knobs[2].fmt, knobs[3].fmt, fmtGateMod, fmtSign, fmtBool, null];
    deps.drawBankHeading(BANKS[3].name);
    for (let k = 0; k < 8; k++) {
        if (!drumDlyLabels[k]) continue;
        const colX = 4 + (k % 4) * 30;
        const rowY = k < 4 ? 12 : 36;
        const hi   = (S.knobTouched === k);
        if (hi) deps.fill_rect(colX, rowY, 24, 24, 1);
        deps.print(colX, rowY,      col4(drumDlyLabels[k]), hi ? 0 : 1);
        deps.print(colX, rowY + 12, col4(drumDlyFmt[k](vals[k])), hi ? 0 : 1);
    }
}

function renderBankCells(deps, labels, values, opts) {
    const wideLabels = opts && opts.wideLabels;
    for (let k = 0; k < 8; k++) {
        if (!labels[k]) continue;
        const colX = 4 + (k % 4) * 30;
        const rowY = k < 4 ? 12 : 36;
        const hi   = (S.knobTouched === k);
        if (hi) deps.fill_rect(colX, rowY, 24, 24, 1);
        const lbl = labels[k];
        deps.print(colX, rowY,      wideLabels && lbl.length > 4 ? lbl : col4(lbl), hi ? 0 : 1);
        deps.print(colX, rowY + 12, col4(values[k]), hi ? 0 : 1);
    }
}
