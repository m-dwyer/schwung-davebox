import { col4, fmtArpRate, fmtBool, fmtGateMod, fmtLen, fmtPct, fmtPlayDir, fmtRes, fmtRevStyle, fmtSign, fmtStretch, fmtVelOverride } from './ui_constants.mjs';

/**
 * @typedef {Object} ParameterPageKnob
 * @property {string | null | undefined} abbrev
 * @property {string | undefined} dspKey
 * @property {(value: number) => string | number | null | undefined} fmt
 */

/**
 * @typedef {Object} GenericParameterPageInput
 * @property {number} bank
 * @property {ParameterPageKnob[]} knobs
 * @property {number[]} vals
 * @property {boolean} altMode
 * @property {boolean} isDrum
 * @property {number} knobTouched
 * @property {number=} midiDlyRandomMode
 * @property {number=} noteFXRandomMode
 * @property {number=} delayClockFb
 * @property {number=} clipPlaybackAudioReverse
 */

/**
 * @typedef {Object} LabelValueParameterPageInput
 * @property {(string | null | undefined)[]} labels
 * @property {unknown[]} values
 * @property {boolean=} wideLabels
 * @property {number} knobTouched
 */

/**
 * @typedef {Object} DrumMidiDelayParameterPageInput
 * @property {ParameterPageKnob[]} knobs
 * @property {number[]} vals
 * @property {number} knobTouched
 */

/**
 * @typedef {Object} DrumLaneParameterPageInput
 * @property {boolean} altMode
 * @property {number} tpsIdx
 * @property {number} stretch
 * @property {number} shift
 * @property {number} euclidN
 * @property {number} playbackDir
 * @property {number} playbackAudioReverse
 * @property {boolean | number} seqFollow
 * @property {number} knobTouched
 */

/**
 * @typedef {Object} AllLanesParameterPageInput
 * @property {boolean} altMode
 * @property {number} resolution
 * @property {number} stretch
 * @property {number} shift
 * @property {number} quantize
 * @property {number} velocityOverride
 * @property {number} inputQuantize
 * @property {number} playbackDir
 * @property {boolean | number} syncRepeat
 * @property {number} knobTouched
 */

/**
 * @typedef {Object} DrumNoteFxParameterPageInput
 * @property {string} noteName
 * @property {number} noteNumber
 * @property {number} velocity
 * @property {number} quantize
 * @property {number} lengthMode
 * @property {number} gate
 * @property {number} knobTouched
 */

/**
 * @typedef {Object} DrumNoteFxNoteBlockModel
 * @property {string} octaveLabel
 * @property {string} noteLabel
 * @property {string} noteText
 * @property {boolean} highlighted
 */

/**
 * @typedef {Object} DrumNoteFxParameterPageModel
 * @property {DrumNoteFxNoteBlockModel} noteBlock
 * @property {import('../types').ParameterPageCellSlot[]} cells
 */

const RND_ALG_NAMES = ['Pure', 'Gaus', 'Walk'];

/** @type {import('../types').ParameterPageGridOptions} */
export const GENERIC_PARAMETER_PAGE_GRID_OPTIONS = {
    preformatted: true,
    preserveSlots: true,
    startY: 12,
    valueYOffset: 12
};

/**
 * @param {import('../types').ParameterPageCellSlot[]} cells
 * @returns {import('../types').ParameterPageGridModel}
 */
function parameterPageGridModel(cells) {
    return {
        cells: cells,
        grid: GENERIC_PARAMETER_PAGE_GRID_OPTIONS
    };
}

/**
 * @param {GenericParameterPageInput} input
 * @returns {import('../types').ParameterPageGridModel}
 */
export function genericParameterPageGridModel(input) {
    return parameterPageGridModel(genericParameterPageCells(input));
}

/**
 * @param {LabelValueParameterPageInput} input
 * @returns {import('../types').ParameterPageGridModel}
 */
export function labelValueParameterPageGridModel(input) {
    return parameterPageGridModel(labelValueParameterPageCells(input));
}

/**
 * @param {DrumMidiDelayParameterPageInput} input
 * @returns {import('../types').ParameterPageGridModel}
 */
export function drumMidiDelayParameterPageGridModel(input) {
    return parameterPageGridModel(drumMidiDelayParameterPageCells(input));
}

/**
 * @param {DrumLaneParameterPageInput} input
 * @returns {import('../types').ParameterPageGridModel}
 */
export function drumLaneParameterPageGridModel(input) {
    return parameterPageGridModel(drumLaneParameterPageCells(input));
}

/**
 * @param {AllLanesParameterPageInput} input
 * @returns {import('../types').ParameterPageGridModel}
 */
export function allLanesParameterPageGridModel(input) {
    return parameterPageGridModel(allLanesParameterPageCells(input));
}

/**
 * @param {DrumNoteFxParameterPageInput} input
 * @returns {DrumNoteFxParameterPageModel}
 */
export function drumNoteFxParameterPageModel(input) {
    return {
        noteBlock: {
            octaveLabel: 'Oct',
            noteLabel: 'Note',
            noteText: input.noteName + ' ' + input.noteNumber,
            highlighted: input.knobTouched === 0 || input.knobTouched === 1
        },
        cells: drumNoteFxParameterPageCells(input)
    };
}

/**
 * @param {GenericParameterPageInput} input
 * @returns {import('../types').ParameterPageCellSlot[]}
 */
export function genericParameterPageCells(input) {
    /** @type {import('../types').ParameterPageCellSlot[]} */
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

/**
 * @param {LabelValueParameterPageInput} input
 * @returns {import('../types').ParameterPageCellSlot[]}
 */
export function labelValueParameterPageCells(input) {
    /** @type {import('../types').ParameterPageCellSlot[]} */
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

/**
 * @param {DrumMidiDelayParameterPageInput} input
 * @returns {import('../types').ParameterPageCellSlot[]}
 */
export function drumMidiDelayParameterPageCells(input) {
    const knobs = input.knobs;
    const vals = input.vals;
    const labels = [knobs[0].abbrev, knobs[1].abbrev, knobs[2].abbrev, knobs[3].abbrev, 'Gate', 'Clk', 'Retrg', null];
    const values = [
        knobs[0].fmt(vals[0]),
        knobs[1].fmt(vals[1]),
        knobs[2].fmt(vals[2]),
        knobs[3].fmt(vals[3]),
        fmtGateMod(vals[4]),
        fmtSign(vals[5]),
        fmtBool(vals[6]),
        null
    ];
    return labelValueParameterPageCells({
        labels: labels,
        values: values,
        knobTouched: input.knobTouched
    });
}

/**
 * @param {DrumNoteFxParameterPageInput} input
 * @returns {import('../types').ParameterPageCellSlot[]}
 */
export function drumNoteFxParameterPageCells(input) {
    return labelValueParameterPageCells({
        labels: [null, null, 'Vel', 'Qnt', 'Len>', '>Gate', null, null],
        values: [
            null,
            null,
            fmtSign(input.velocity),
            fmtPct(input.quantize),
            fmtLen(input.lengthMode),
            fmtPct(input.gate),
            null,
            null
        ],
        wideLabels: true,
        knobTouched: input.knobTouched
    });
}

/**
 * @param {DrumLaneParameterPageInput} input
 * @returns {import('../types').ParameterPageCellSlot[]}
 */
export function drumLaneParameterPageCells(input) {
    const labels = [
        input.altMode ? 'Zoom' : 'Res',
        'Stch',
        input.altMode ? 'Nudg' : 'Shft',
        'Lgto',
        'Eucl',
        '-',
        input.altMode ? 'Rvrs' : 'Dir',
        'SqFl'
    ];
    const values = [
        fmtRes(input.tpsIdx),
        fmtStretch(input.stretch),
        fmtSign(input.shift),
        '->',
        String(input.euclidN),
        '-',
        input.altMode ? fmtRevStyle(input.playbackAudioReverse | 0) : fmtPlayDir(input.playbackDir | 0),
        fmtBool(input.seqFollow ? 1 : 0)
    ];
    return labelValueParameterPageCells({
        labels: labels,
        values: values,
        knobTouched: input.knobTouched
    });
}

/**
 * @param {AllLanesParameterPageInput} input
 * @returns {import('../types').ParameterPageCellSlot[]}
 */
export function allLanesParameterPageCells(input) {
    const DIQ_LABELS = ['Off','1/64','1/32','1/16','1/16T','1/8','1/8T','1/4','1/4T'];
    const labels = [
        'Res',
        'Stch',
        input.altMode ? 'Nudg' : 'Shft',
        'Qnt',
        'VelIn',
        'InQ',
        input.altMode ? 'Rvrs' : 'Dir',
        'SyncRpt'
    ];
    const values = [
        input.resolution < 0 ? '--' : fmtRes(input.resolution),
        fmtStretch(input.stretch),
        fmtSign(input.shift),
        input.quantize <= 0 ? '--' : fmtPct(input.quantize),
        fmtVelOverride(input.velocityOverride),
        DIQ_LABELS[input.inputQuantize] || 'Off',
        input.playbackDir < 0 ? '--' : (input.altMode ? fmtRevStyle(input.playbackDir) : fmtPlayDir(input.playbackDir)),
        fmtBool(input.syncRepeat)
    ];
    return labelValueParameterPageCells({
        labels: labels,
        values: values,
        wideLabels: true,
        knobTouched: input.knobTouched
    });
}
