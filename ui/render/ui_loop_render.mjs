import { S } from '../core/ui_state.mjs';
import { PAD_MODE_DRUM } from '../core/ui_constants.mjs';
import { effectiveClip } from './ui_leds.mjs';
import { autoLaneLabel } from '../core/ui_motion.mjs';

export function renderLoopView(deps) {
    const loopL2 = 'STEP BTN=by page';
    const loopL3 = 'JOG TURN=by step';
    const loopX2 = Math.floor((128 - loopL2.length * 6) / 2);
    const loopX3 = Math.floor((128 - loopL3.length * 6) / 2);
    if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM) {
        renderDrumLoopView(deps, loopL2, loopL3, loopX2, loopX3);
    } else if (S.activeBank === 6) {
        renderAutoLoopView(deps);
    } else {
        renderMelodicLoopView(deps, loopL2, loopL3, loopX2, loopX3);
    }
}

function renderDrumLoopView(deps, loopL2, loopL3, loopX2, loopX3) {
    const t   = S.activeTrack;
    const len = S.drumLaneLength[t];
    if (S.activeBank === 7) {
        const allBlink = Math.floor(S.tickCount / 24) % 2 === 0;
        const l1 = 'Clip length-' + (allBlink ? 'ALL' : '   ') + ' lanes';
        deps.print(Math.floor((128 - 21 * 6) / 2), 4, l1, 1);
    } else {
        deps.print(Math.floor((128 - 11 * 6) / 2), 4, 'Lane length', 1);
    }
    deps.fill_rect(0, 15, 128, 1, 1);
    deps.print(loopX2, 22, loopL2, 1);
    deps.print(loopX3, 34, loopL3, 1);
    renderLoopSteps(deps, len);
}

function renderAutoLoopView(deps) {
    const t = S.activeTrack;
    const ac = effectiveClip(t);
    const ccLane = S.ccActiveLane[t];
    const laneLen = S.ccLaneLength[t][ac][ccLane];
    const resTps = S.ccLaneResTps[t][ac][ccLane] || S.ccLaneTps[t][ac][ccLane];
    const label = autoLaneLabel(t, ccLane, true);
    const resName = tpsName(resTps);
    const header = 'Lane config: K' + (ccLane + 1) + '-' + label;
    deps.pixelPrint(Math.floor((128 - header.length * 6) / 2), 4, header, 1);
    deps.fill_rect(0, 15, 128, 1, 1);
    deps.pixelPrint(1, 18, 'STEP BTN=Leng by page', 1);
    deps.pixelPrint(1, 25, 'JOG TURN=Leng by step', 1);
    const zoomTps = S.ccLaneTps[t][ac][ccLane] || (S.clipTPS[t][ac] || 24);
    const zoomName = tpsName(zoomTps);
    renderBracketValue(deps, 34, 'Resolution: <', resName, '>');
    renderBracketValue(deps, 41, 'Zoom: +', zoomName, '-');
    renderLoopSteps(deps, laneLen > 0 ? laneLen : S.clipLength[t][ac]);
}

function renderMelodicLoopView(deps, loopL2, loopL3, loopX2, loopX3) {
    const ac = effectiveClip(S.activeTrack);
    const steps = S.clipLength[S.activeTrack][ac];
    deps.print(Math.floor((128 - 11 * 6) / 2), 4, 'Clip Length', 1);
    deps.fill_rect(0, 15, 128, 1, 1);
    deps.print(loopX2, 22, loopL2, 1);
    deps.print(loopX3, 34, loopL3, 1);
    renderLoopSteps(deps, steps);
}

function renderLoopSteps(deps, steps) {
    const label = 'Steps: ' + steps + '/256';
    const x = Math.floor((128 - label.length * 6) / 2);
    const valueX = x + 7 * 6;
    const valueW = (label.length - 7) * 6;
    deps.fill_rect(valueX - 1, 50, valueW + 2, 14, 1);
    deps.print(x, 52, 'Steps: ', 1);
    deps.print(valueX, 52, steps + '/256', 0);
}

function renderBracketValue(deps, y, label, value, suffix) {
    const valueX = 1 + label.length * 6;
    const valueW = value.length * 6 + 2;
    deps.pixelPrint(1, y, label, 1);
    deps.fill_rect(valueX - 1, y - 1, valueW, 7, 1);
    deps.pixelPrint(valueX, y, value, 0);
    deps.pixelPrint(valueX + valueW, y, suffix, 1);
}

function tpsName(tps) {
    if (tps === 12) return '1/32';
    if (tps === 48) return '1/8';
    if (tps === 96) return '1/4';
    if (tps === 384) return '1bar';
    return '1/16';
}
