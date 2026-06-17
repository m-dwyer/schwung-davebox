import { S } from '../core/ui_state.mjs';
import { col4, col5, POLL_INTERVAL } from '../core/ui_constants.mjs';
import { effectiveClip } from './ui_leds.mjs';
import { autoLaneLabel } from '../core/ui_motion.mjs';

export function renderCcStepEditView(deps) {
    const t = S.activeTrack;
    const ac = effectiveClip(t);
    const lane = S.ccActiveLane[t];
    const effectiveLength = S.ccLaneLength[t][ac][lane] || S.clipLength[t][ac];
    const laneTps = S.ccLaneTps[t][ac][lane] || (S.clipTPS[t][ac] || 24);
    const barY = 60;
    const barH = 3;
    const graphH = 12;
    const graphY = barY - graphH - 2;

    refreshCcStepGraphData(deps, t, ac, lane, effectiveLength);
    renderCcStepGraph(deps, graphY, graphH);
    renderCcStepHeader(deps, t, lane);
    renderCcStepKnobs(deps, t);
    renderCcStepProgress(deps, t, effectiveLength, laneTps, barY, barH);
}

function refreshCcStepGraphData(deps, t, ac, lane, effectiveLength) {
    const pages = Math.ceil(effectiveLength / 16);
    const key = 'sg_' + t + '_' + ac + '_' + lane;
    if (key === S.ccGraphOvKey && (S.tickCount % POLL_INTERVAL) !== 0) return;

    S.ccGraphOvData = [];
    for (let page = 0; page < pages; page++) {
        const raw = (typeof deps.host_module_get_param === 'function')
            ? deps.host_module_get_param('t' + t + '_c' + ac + '_ccsv_' + lane + '_' + page)
            : null;
        if (raw) {
            const parts = raw.split(' ');
            for (let step = 0; step < 16 && page * 16 + step < effectiveLength; step++)
                S.ccGraphOvData.push(step < parts.length ? parseInt(parts[step], 10) : 255);
        }
    }
    S.ccGraphOvKey = key;
}

function renderCcStepGraph(deps, graphY, graphH) {
    deps.fill_rect(0, graphY, 128, 1, 1);
    deps.fill_rect(0, graphY + graphH - 1, 128, 1, 1);
    deps.fill_rect(0, graphY, 1, graphH, 1);
    deps.fill_rect(127, graphY, 1, graphH, 1);
    const dataLen = S.ccGraphOvData.length || 1;
    const drawY = graphY + 2;
    const drawH = graphH - 4;
    let prevPy = -1;
    for (let x = 1; x < 127; x++) {
        const idx = Math.floor(x * dataLen / 128);
        const value = idx < S.ccGraphOvData.length ? S.ccGraphOvData[idx] : -1;
        if (value >= 0 && value <= 127) {
            const py = drawY + drawH - 1 - Math.round(value * (drawH - 1) / 127);
            if (prevPy >= 0 && prevPy !== py) {
                const yMin = Math.min(prevPy, py);
                const yMax = Math.max(prevPy, py);
                deps.fill_rect(x, yMin, 1, yMax - yMin + 1, 1);
            } else {
                deps.fill_rect(x, py, 1, 1, 1);
            }
            prevPy = py;
        } else {
            prevPy = -1;
        }
    }
    const stepX = Math.min(126, Math.max(1, Math.floor(S.heldStep * 126 / dataLen) + 1));
    deps.fill_rect(stepX, graphY + 1, 1, graphH - 2, 1);
}

function renderCcStepHeader(deps, t, lane) {
    deps.pixelPrint(1, 1, 'Step ' + (S.heldStep + 1), 1);
    let label = '';
    const labelLane = S.knobTouched >= 0 ? S.knobTouched : lane;
    if (S.trackCCType[t][labelLane] === 2)
        label = S.schLabel[t][labelLane] || ('Sch' + S.trackCCAssign[t][labelLane]);
    if (label) deps.pixelPrint(128 - label.length * 6 - 1, 1, label, 1);
    deps.fill_rect(0, 7, 128, 1, 1);
}

function renderCcStepKnobs(deps, t) {
    for (let k = 0; k < 8; k++) {
        const col = k % 4;
        const row = Math.floor(k / 4);
        const x = 4 + col * 31;
        const y = 11 + row * 18;
        const hi = (S.knobTouched === k) || (S.ccActiveLane[t] === k);
        if (hi) deps.fill_rect(x - 1, y - 1, 29, 18, 1);
        const label = autoLaneLabel(t, k, false);
        let value;
        if (S.ccStepEditSet[k]) {
            value = String(S.ccStepEditVal[k]);
        } else {
            const computed = S.ccStepEditComputed[k];
            value = (computed >= 0 && computed <= 127) ? '(' + computed + ')' : '--';
        }
        deps.print(x, y, col4(label), hi ? 0 : 1);
        deps.print(x, y + 9, col5(value), hi ? 0 : 1);
    }
}

function renderCcStepProgress(deps, t, effectiveLength, laneTps, barY, barH) {
    const pageCount = Math.max(1, Math.ceil(effectiveLength / 16));
    const viewPage = Math.max(0, Math.min(S.trackCurrentPage[t], pageCount - 1));
    const pageGap = 1;
    const pageW = Math.max(2, Math.floor((120 - (pageCount - 1) * pageGap) / pageCount));
    let playPage = -1;
    let progress = 0;
    if (S.playing) {
        progress = (S.masterPos % (effectiveLength * laneTps)) / (effectiveLength * laneTps);
        playPage = Math.floor(progress * pageCount);
    }
    for (let page = 0; page < pageCount; page++) {
        const x = 4 + page * (pageW + pageGap);
        if (page === viewPage) deps.fill_rect(x, barY, pageW, barH, 1);
        else if (page === playPage) {
            deps.fill_rect(x, barY, pageW, 1, 1);
            deps.fill_rect(x, barY + barH - 1, pageW, 1, 1);
            deps.fill_rect(x, barY, 1, barH, 1);
            deps.fill_rect(x + pageW - 1, barY, 1, barH, 1);
        } else {
            deps.fill_rect(x, barY + barH - 1, pageW, 1, 1);
        }
    }
    if (S.playing) {
        const barW = pageCount * (pageW + pageGap) - pageGap;
        const dx = 4 + Math.floor(progress * barW);
        const viewStart = 4 + viewPage * (pageW + pageGap);
        deps.fill_rect(dx, barY, 1, barH, (dx >= viewStart && dx < viewStart + pageW) ? 0 : 1);
    }
}
