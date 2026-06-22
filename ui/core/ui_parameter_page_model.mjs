import { col4, fmtArpRate, fmtRevStyle, fmtSign } from './ui_constants.mjs';

const RND_ALG_NAMES = ['Pure', 'Gaus', 'Walk'];

export const GENERIC_PARAMETER_PAGE_GRID_OPTIONS = {
    preformatted: true,
    preserveSlots: true,
    startY: 12,
    valueYOffset: 12
};

export function genericParameterPageGridModel(input) {
    return {
        cells: genericParameterPageCells(input),
        grid: GENERIC_PARAMETER_PAGE_GRID_OPTIONS
    };
}

export function labelValueParameterPageGridModel(input) {
    return {
        cells: labelValueParameterPageCells(input),
        grid: GENERIC_PARAMETER_PAGE_GRID_OPTIONS
    };
}

export function genericParameterPageCells(input) {
    const cells = [];
    const knobs = input.knobs;
    const vals = input.vals;
    for (let k = 0; k < 8; k++) {
        const knob = knobs[k];
        let lbl = knob.abbrev || '-';
        const delayShiftClkF = input.altMode && !input.isDrum && input.bank === 3 && k === 0;
        const clipDirAlt = input.altMode && !input.isDrum && knob.dspKey === 'clip_playback_dir';
        const rndAltAlgo = input.altMode && !input.isDrum && (input.bank === 1 || input.bank === 3) && k === 7;
        if (input.altMode) {
            if      (knob.dspKey === 'clock_shift')       lbl = 'Nudg';
            else if (knob.dspKey === 'clip_resolution')   lbl = 'Zoom';
            else if (knob.dspKey === 'clip_playback_dir') lbl = 'Rvrs';
            else if (delayShiftClkF)                      lbl = 'ClkF';
            else if (rndAltAlgo)                          lbl = 'Algo';
        }
        const rawVal = rndAltAlgo
            ? RND_ALG_NAMES[input.bank === 3 ? (input.midiDlyRandomMode || 0) : (input.noteFXRandomMode || 0)]
            : delayShiftClkF
                ? fmtSign(input.delayClockFb)
                : clipDirAlt
                    ? fmtRevStyle(input.clipPlaybackAudioReverse | 0)
                    : (knob.abbrev ? knob.fmt(vals[k]) : null);
        const txt = (knob.fmt === fmtArpRate && !delayShiftClkF) ? (rawVal || '-') : col4(rawVal);
        cells.push({
            label: lbl,
            value: txt,
            highlighted: input.knobTouched === k
        });
    }
    return cells;
}

export function labelValueParameterPageCells(input) {
    const cells = [];
    const labels = input.labels;
    const values = input.values;
    for (let k = 0; k < 8; k++) {
        if (!labels[k]) {
            cells.push(null);
            continue;
        }
        const lbl = labels[k];
        cells.push({
            label: input.wideLabels && lbl.length > 4 ? lbl : col4(lbl),
            value: col4(values[k]),
            highlighted: input.knobTouched === k
        });
    }
    return cells;
}
