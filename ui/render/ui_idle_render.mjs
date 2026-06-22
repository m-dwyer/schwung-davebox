import { S, effectiveClip } from '../core/ui_state.mjs';
import {
    BANKS,
    NOTE_KEYS,
    NUM_TRACKS,
    PAD_MODE_DRUM,
    SCALE_DISPLAY,
    SCENE_LETTERS
} from '../core/ui_constants.mjs';
import { motionIdleModel } from '../core/ui_motion.mjs';
import { renderTrackRow } from './ui_track_chrome_render.mjs';
import {
    refreshCcGraphData,
    renderCcGraphPlot,
    renderCcPageProgress,
} from './ui_cc_lane_overlay_render.mjs';

export function renderSessionIdleView(deps) {
    deps.fill_rect(0, 0, 128, 12, 1);
    let oO, oE;
    if (S.playing) {
        oO = (Math.floor(S.masterPos / 192) % 2 === 0) ? 'O' : 'o';
        oE = (Math.floor(S.masterPos /  48) % 2 === 0) ? 'e' : '3';
    } else {
        oO = 'O'; oE = 'e';
    }
    const banner = oO + 'vertur' + oE;
    deps.print(40, 2, banner, 0);
    deps.drawMetroIndicator();
    renderTrackRow(deps, 34);
    renderActiveClipLetters(deps);
}

export function renderDrumTrackIdleView(deps) {
    const t         = S.activeTrack;
    const lane      = S.activeDrumLane[t];
    const pg        = S.drumLanePage[t];
    const note      = S.drumLaneNote[t][lane];
    const oct       = Math.floor(note / 12) - 2;
    const name      = NOTE_KEYS[note % 12];
    const bankGroup = pg === 0 ? 'Bank: A' : 'Bank: B';
    const bankName  = S.activeBank === 0 ? 'DRUM LANE' : S.activeBank === 1 ? 'NOTE FX' : S.activeBank === 5 ? 'REPEAT GROOVE' : S.activeBank === 6 ? BANKS[6].name : S.activeBank === 7 ? 'ALL LANES' : BANKS[S.activeBank] ? BANKS[S.activeBank].name : '?';
    (S.activeBank === 5 || S.activeBank === 6 ? deps.drawBankHeadingInverted : deps.drawBankHeading)(bankName, false);
    deps.print(4, 10, bankGroup + '  Pad: ' + name + oct + ' (' + note + ')', 1);
    const laneBit = 1 << lane;
    if (S.drumLaneSolo[t] & laneBit) {
        deps.print(128 - 4 - 6 * 6, 21, 'SOLOED', 1);
    } else if (S.drumLaneMute[t] & laneBit) {
        if (Math.floor(S.tickCount / 50) % 2 === 0)
            deps.print(128 - 4 - 5 * 6, 21, 'MUTED', 1);
    }
    deps.drawMetroIndicator();
    renderTrackRow(deps, 34);
    renderActiveClipLetters(deps);
    renderDrumPositionBar(deps, t);
}

export function renderMelodicTrackIdleView(deps) {
    const recTag  = (S.recordArmed && !S.recordCountingIn && S.recordArmedTrack === S.activeTrack)
        ? ' REC' : '';
    const oct     = S.trackOctave[S.activeTrack];
    const octStr  = 'Oct:' + (oct >= 0 ? '+' : '') + oct;
    const keyScl  = NOTE_KEYS[S.padKey] + ' ' + (SCALE_DISPLAY[S.padScale] || '?');
    const CHAR_W  = 6;
    const keySclX = 128 - 4 - keyScl.length * CHAR_W;
    (S.activeBank === 5 || S.activeBank === 6 ? deps.drawBankHeadingInverted : deps.drawBankHeading)(BANKS[S.activeBank].name + recTag, false);
    deps.print(4, 10, octStr, 1);
    if (S.bankParams[S.activeTrack][5][0]) {
        if (S.bankParams[S.activeTrack][5][7]) {
            deps.fill_rect(51, 9, 19, 9, 1);
            deps.print(52, 10, 'Arp', 0);
        } else {
            deps.print(52, 10, 'Arp', 1);
        }
    }
    deps.print(keySclX, 10, keyScl, 1);
    if (S.scaleAware) deps.fill_rect(keySclX, 15, keyScl.length * CHAR_W, 1, 1);
    deps.drawMetroIndicator();
    renderTrackRow(deps, 34);
    renderActiveClipLetters(deps);
    deps.drawPositionBar(S.activeTrack);
}

export function renderMotionIdleView(deps) {
    const t = S.activeTrack;
    const ac = effectiveClip(t);
    const model = motionIdleModel(t, ac);
    const lane = model.lane;
    const effectiveLength = model.effectiveLength;
    const laneTps = S.ccLaneTps[t][ac][lane] || (S.clipTPS[t][ac] || 24);

    deps.drawBankHeadingInverted(model.heading);
    renderMotionBadges(deps, model.badges);
    renderMotionLaneInfo(deps, model, lane);
    refreshCcGraphData(deps, t, ac, lane, effectiveLength, model.graphPages, model.graphKey);
    renderMotionGraph(deps, 33, 24);
    renderCcPageProgress(deps, t, effectiveLength, laneTps, 60, 3);
}

function renderMotionBadges(deps, badges) {
    let x = 60;
    for (let i = 0; i < badges.length; i++) {
        const text = badges[i];
        const w = text.length * 6 + 3;
        deps.fill_rect(x, 1, w, 7, 1);
        deps.print(x + 1, 1, text, 0);
        x += w + 2;
    }
}

function renderMotionLaneInfo(deps, model, lane) {
    const value = model.value;
    const line1 = 'K' + (lane + 1) + ' ' + model.laneLabel + ':';
    deps.print(4, 10, line1, 1);
    const valueX = 4 + line1.length * 6;
    deps.print(valueX, 10, value, 1);
    deps.fill_rect(valueX, 19, value.length * 6, 1, 1);
    if (model.paramText) {
        deps.print(128 - model.paramText.length * 6 - 1, 10, model.paramText, 1);
    }
    deps.print(4, 21, model.resText, 1);
    deps.print(128 - model.zoomText.length * 6 - 4, 21, model.zoomText, 1);
}

function renderMotionGraph(deps, graphY, graphH) {
    const dataLen = renderCcGraphPlot(deps, graphY, graphH);
    // Motion-idle marker: only while a step is held, full-height, color 0.
    if (S.heldStep >= 0) {
        const stepX = Math.min(127, Math.floor(S.heldStep * 128 / dataLen));
        deps.fill_rect(stepX, graphY, 1, graphH, 0);
    }
}

function renderActiveClipLetters(deps) {
    for (let t = 0; t < NUM_TRACKS; t++) {
        const cx = t * 16 + 5;
        const ac = S.trackActiveClip[t];
        const hasData = S.trackPadMode[t] === PAD_MODE_DRUM
            ? S.drumClipNonEmpty[t][ac]
            : S.clipNonEmpty[t][ac];
        const isActive = (S.trackClipPlaying[t] || S.trackWillRelaunch[t] || (S.trackQueuedClip[t] >= 0)) && hasData;
        if (isActive) {
            deps.fill_rect(cx - 1, 45, 9, 9, 1);
            deps.print(cx, 46, SCENE_LETTERS[ac], 0);
        } else {
            deps.print(cx, 46, SCENE_LETTERS[ac], 1);
        }
    }
}

export function renderDrumPositionBar(deps, track) {
    const loopStart = S.drumLaneLoopStart[track] | 0;
    const length = S.drumLaneLength[track];
    const startPage = loopStart >> 4;
    const windowPages = Math.max(1, Math.ceil(length / 16));
    const viewPage = Math.max(0, Math.min(S.drumStepPage[track] - startPage, windowPages - 1));
    const currentStep = S.drumCurrentStep[track];
    const playPage = (S.playing && S.trackClipPlaying[track] && currentStep >= loopStart && currentStep < loopStart + length)
        ? Math.floor((currentStep - loopStart) / 16) : -1;
    const barY = 57, barH = 5, segGap = 1;
    const segW = Math.max(2, Math.floor((120 - (windowPages - 1) * segGap) / windowPages));
    const startX = 4;
    for (let page = 0; page < windowPages; page++) {
        const x = startX + page * (segW + segGap);
        if (page === viewPage) {
            deps.fill_rect(x, barY, segW, barH, 1);
        } else if (page === playPage) {
            deps.fill_rect(x, barY, segW, 1, 1);
            deps.fill_rect(x, barY + barH - 1, segW, 1, 1);
            deps.fill_rect(x, barY, 1, barH, 1);
            deps.fill_rect(x + segW - 1, barY, 1, barH, 1);
        } else {
            deps.fill_rect(x, barY + barH - 1, segW, 1, 1);
        }
    }
    if (S.playing && S.trackClipPlaying[track] && currentStep >= loopStart && currentStep < loopStart + length) {
        const winPxW = windowPages * (segW + segGap) - segGap;
        const dotX = startX + Math.floor((currentStep - loopStart) * winPxW / Math.max(1, length));
        const viewSegStart = startX + viewPage * (segW + segGap);
        const onSolid = dotX >= viewSegStart && dotX < viewSegStart + segW;
        deps.fill_rect(dotX, barY, 1, barH, onSolid ? 0 : 1);
    }

    const lane = S.activeDrumLane[track];
    const steps = S.drumLaneSteps[track][lane];
    let hasLeft = false, hasRight = false;
    for (let step = 0; step < loopStart; step++) if (steps[step] !== '0') { hasLeft = true; break; }
    for (let step = loopStart + length; step < 256; step++) if (steps[step] !== '0') { hasRight = true; break; }
    if (hasLeft) deps.fill_rect(startX - 2, barY + 1, 1, barH - 2, 1);
    if (hasRight) {
        const xRight = startX + windowPages * (segW + segGap) - segGap + 1;
        deps.fill_rect(xRight, barY + 1, 1, barH - 2, 1);
    }
}
