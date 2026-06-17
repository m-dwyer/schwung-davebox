import {
    Red,
    Green,
    DeepRed,
    DarkBlue,
    Mustard,
    DeepGreen,
    DarkGrey,
    LightGrey,
    DeepMagenta,
    PurpleBlue,
    White
} from '/data/UserData/schwung/shared/constants.mjs';

import {
    LED_OFF,
    TRACK_COLORS,
    TRACK_DIM_COLORS
} from '../core/ui_constants.mjs';

/* Pad -> modifier bit index. R1=bits 0-7 (pitch), R2=bits 8-15 (vel/gate), R3=bits 16-23 (wild). */
export const PERF_MOD_PAD_MAP = Object.freeze({
    76: 0,  /* Oct↑    */ 77: 1,  /* Oct↓    */ 78: 2,  /* Sc↑     */ 79: 3,  /* Sc↓     */
    80: 4,  /* 5th     */ 81: 5,  /* Triton  */ 82: 6,  /* Drift   */ 83: 7,  /* Storm   */
    84: 8,  /* Soft    */ 85: 9,  /* Hard    */ 86: 10, /* Cresc   */ 87: 11, /* Pulse   */
    88: 12, /* Sdchn   */ 89: 13, /* Stac    */ 90: 14, /* Lgto    */ 91: 15, /* RmpG    */
    92: 16, /* ½time   */ 93: 17, /* 3Skip   */ 94: 18, /* Phnm    */ 95: 19, /* Sprs    */
    96: 20, /* Gltch   */ 97: 21, /* Stggr   */ 98: 22, /* Shfl    */ 99: 23, /* Back    */
});

export const PERF_MOD_FULL_NAMES = [
    'Octave Up','Octave Down','Scale Up','Scale Down','Fifth','Tritone','Drift','Storm',
    'Decrescendo','Swell','Crescendo','Pulse','Sidechain','Staccato','Legato','Ramp Gate',
    'Half Time','3 Skip','Phantom','Sparse','Glitch','Stagger','Shuffle','Backwards',
];

export const PERF_MOD_POPUP_TICKS = 80; /* ~500ms at ~160 ticks/s */

/* Send current combined modifier bitmask to DSP. */
export function sendPerfModsImpl(S, deps) {
    if (typeof deps.setParam === 'function')
        deps.setParam('perf_mods', String(S.perfModsToggled | S.perfModsHeld));
}

/* Draw the full 4-row pad grid for Performance Mode.
 * R0 (68-75): rate pads 1-6 (pulse at capture rate), triplet toggle, latch.
 * R1 (76-83): PITCH modifier pads (HotMagenta family).
 * R2 (84-91): VEL/GATE modifier pads (VividYellow family).
 * R3 (92-99): WILD modifier pads (Cyan family).
 * Also clears step buttons (16-31) — not used in Perf Mode. */
export function updatePerfModeLEDsImpl(S, deps) {
    if (!S.ledInitComplete) return;
    const activeMods = S.perfModsToggled | S.perfModsHeld;
    /* Step buttons: preset slots. */
    for (let i = 0; i < 16; i++) {
        if (i === S.perfRecalledSlot)         deps.setLED(16 + i, White);
        else if (S.perfSnapshots[i] !== 0)    deps.setLED(16 + i, PurpleBlue);
        else                                deps.setLED(16 + i, LightGrey);
    }

    /* R0 (68-75): rate pads 0-4 (1/32..1/2), hold (5), sync (6), latch (7).
     * Static colors only — no flashing. */
    for (let i = 0; i < 5; i++) {
        const rateActive = S.perfStickyLengths.has(i) ||
                           S.perfStack.some(function(e) { return e.idx === i; });
        deps.setLED(68 + i, rateActive ? White : DarkGrey);
    }
    /* Hold pad (73): bright Red when engaged, dim Red when off. */
    deps.setLED(73, S.perfHoldPadHeld ? Red : DeepRed);
    /* Sync (pad 74): bright Green when on, dim Green when off. */
    deps.setLED(74, S.perfSync ? Green : DeepGreen);
    /* Latch (pad 75): track-3 bright/dim pair (BrightGreen / DarkOlive). */
    deps.setLED(75, S.perfLatchMode ? TRACK_COLORS[2] : TRACK_DIM_COLORS[2]);

    /* R1 (76-83): PITCH mods — active = White, inactive = dim Magenta */
    for (let i = 0; i < 8; i++) {
        const note = 76 + i;
        const modIdx = PERF_MOD_PAD_MAP[note];
        if (modIdx !== undefined)
            deps.setLED(note, (activeMods >> modIdx) & 1 ? White : DeepMagenta);
        else
            deps.setLED(note, LED_OFF);
    }

    /* R2 (84-91): VEL/GATE mods — active = White, inactive = dim Yellow */
    for (let i = 0; i < 8; i++) {
        const note = 84 + i;
        const modIdx = PERF_MOD_PAD_MAP[note];
        if (modIdx !== undefined)
            deps.setLED(note, (activeMods >> modIdx) & 1 ? White : Mustard);
        else
            deps.setLED(note, LED_OFF);
    }

    /* R3 (92-99): WILD mods — active = White, inactive = dim Blue */
    for (let i = 0; i < 8; i++) {
        const note = 92 + i;
        const modIdx = PERF_MOD_PAD_MAP[note];
        if (modIdx !== undefined)
            deps.setLED(note, (activeMods >> modIdx) & 1 ? White : DarkBlue);
        else
            deps.setLED(note, LED_OFF);
    }
}
