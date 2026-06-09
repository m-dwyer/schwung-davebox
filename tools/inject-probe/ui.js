/*
 * Inject Probe — a pure-JS, parametric MIDI-injection probe for mapping Move's
 * live engine/control seams. NO DSP, NO cross-compile: it injects straight into
 * MoveOriginal's MIDI_IN mailbox from JS via move_midi_inject_to_move(), so the
 * whole dev loop is "edit ui.js → repackage → reopen". Successor to the DSP-
 * based `engine-probe` for fast on-device experiments.
 *
 * ── How injection works (the reusable core) ───────────────────────────────
 * move_midi_inject_to_move([b0, status, d1, d2]) writes one 4-byte USB-MIDI
 * packet into Move's MIDI_IN. b0 = (cable<<4)|CIN; the cable nibble picks the
 * route Move firmware applies:
 *   cable 0  = internal hardware  → pads / buttons / knobs (control surface).
 *              Encoder CCs here move device params (positional p-locks); CC79 =
 *              the master Volume encoder; CC40..43 = track buttons (reversed:
 *              CC43=Trk1..CC40=Trk4); note 8 = Volume-knob capacitive touch.
 *   cable 2  = external USB MIDI  → routed to a track instrument by channel.
 *              Notes/velocity/poly-AT reach the voice; plain MIDI CC does NOT
 *              (Move manual §4.1.3 — measured flat).
 * You can pass several packets at once ([p0..p3, p0..p3, ...]) to fire a whole
 * gesture atomically — see the TrkVol gesture below.
 *
 * ── Known results baked in as presets / defaults ──────────────────────────
 *   • Per-track volume: hold a Track button + Volume-knob touch + ramp CC79,
 *     all on cable 0. Move shows the track-volume overlay BUT CC79 is the
 *     master encoder, so it bleeds into master — not a clean per-track control.
 *     (Step 16 runs this "TrkVol" gesture so you can re-observe it.)
 *   • Device-param p-locks: Ramp pattern, CC on cable 0, knob CC 71..78, while
 *     Move shows a device page — moves whatever param sits on that knob.
 *   • Live expression: Note (cable 2) held + PolyAT sweep reaches the voice.
 *
 * ── Controls ──────────────────────────────────────────────────────────────
 *   K1 cable (0/2/14/15)   K2 type (Note/CC/PolyAT/ChanAT/Bend)   K3 channel
 *   K4 data1 (note/cc#, Shift=±10)   K5 data2 (value, Shift=±10)
 *   K6 pattern (OneShot/Flip/Ramp/Hold)   K7 rate (ticks/event)
 *   Play  = OneShot: fire once · Flip/Ramp/Hold: start/stop
 *   Step 16 (note 31) = toggle the canned TrkVol gesture (track = channel 1..4)
 *   Configure while stopped (knob edits are ignored while a drive is running so
 *   injected cable-0 CCs can't drive our own selection).
 *
 * Resume-safe: repaints every tick (the host restores callbacks on resume but
 * never re-triggers a draw, so an as-needed redraw would leave the screen blank).
 */

import { announce, announceMenuItem } from
    '/data/UserData/schwung/shared/screen_reader.mjs';
import { decodeDelta } from
    '/data/UserData/schwung/shared/input_filter.mjs';

/* ---- hardware CCs / notes ---- */
const CC_SHIFT = 49;
const CC_KNOB1 = 71;            /* K1..K7 = CC71..77 */
const CC_PLAY  = 85;
const NOTE_GESTURE = 31;        /* step 16 toggles the TrkVol gesture */

/* ---- injection vocabulary ---- */
const CIN_FROM_STATUS = (status) => (status >> 4) & 0x0F;  /* CIN nibble = status hi nibble (0x8..0xE) */
const NOTE_VOL_TOUCH = 8;       /* capacitive touch of the Volume knob */
const CC_MASTER_VOL  = 79;      /* Move's top-right Volume encoder (relative) */

/* ---- parameter tables ---- */
const CABLES   = [0, 2, 14, 15];
const TYPES    = [
    { n: "Note",   s: 0x90 },
    { n: "CC",     s: 0xB0 },
    { n: "PolyAT", s: 0xA0 },
    { n: "ChanAT", s: 0xD0 },
    { n: "Bend",   s: 0xE0 },
];
const PATTERNS = ["OneShot", "Flip", "Ramp", "Hold"];

/* ---- state ---- */
let cableIdx   = 1;   /* default cable 2 (USB → track) */
let typeIdx    = 1;   /* default CC */
let channel    = 0;   /* 0..15 */
let d1         = 7;   /* note/cc number (CC7 = volume by convention) */
let d2         = 127; /* value */
let patternIdx = 0;   /* OneShot */
let rate       = 8;   /* ticks between events */

let running    = 0;
let gesture    = 0;   /* TrkVol gesture runner */
let shiftHeld  = 0;

/* drive bookkeeping */
let tickCtr    = 0;
let flipLevel  = 0;
let rampDir    = 1;
let rampPhase  = 0;
let holdAsserted = 0;

/* ---- injection helpers (reuse these in any future probe) ---- */
function injPkt(b0, b1, b2, b3) {
    if (typeof move_midi_inject_to_move === "function")
        move_midi_inject_to_move([b0 & 0xFF, b1 & 0xFF, b2 & 0xFF, b3 & 0xFF]);
}
function injMsg(cable, status, a, b) {
    injPkt(((cable & 0x0F) << 4) | CIN_FROM_STATUS(status), status, a, b);
}
function ccMsg(cable, ch, num, val) { injMsg(cable, 0xB0 | (ch & 0x0F), num & 0x7F, val & 0x7F); }
function noteOn(cable, ch, n, v)    { injMsg(cable, 0x90 | (ch & 0x0F), n & 0x7F, v & 0x7F); }
function noteOff(cable, ch, n)      { injMsg(cable, 0x80 | (ch & 0x0F), n & 0x7F, 0); }
/* Move relative-encoder byte: +1..63 → 1..63 ; -1..-63 → 127..65 (128-n). */
function encByte(steps) {
    if (steps > 0) return Math.min(63, steps);
    if (steps < 0) return 128 - Math.min(63, -steps);
    return 0;
}

/* ---- the active single-message (from the dialed params) ---- */
function curStatus() { return TYPES[typeIdx].s | (channel & 0x0F); }
function curCable()  { return CABLES[cableIdx]; }

function fireOnce(value) {
    const t = TYPES[typeIdx];
    if (t.s === 0x90) {                       /* Note: value>0 = on, 0 = off */
        if (value > 0) noteOn(curCable(), channel, d1, value);
        else           noteOff(curCable(), channel, d1);
    } else if (t.s === 0xD0) {                /* ChanAT: single data byte */
        injMsg(curCable(), curStatus(), value, 0);
    } else {                                  /* CC / PolyAT / Bend: two bytes */
        injMsg(curCable(), curStatus(), d1, value);
    }
}

/* ---- canned gesture: per-track volume (hold track + touch + ramp CC79) ---- */
function gTrack() { return Math.max(1, Math.min(4, channel + 1)); }   /* channel 1..4 → track */
function gestureAssert(on) {
    const cc = 44 - gTrack();                 /* CC43=Trk1 .. CC40=Trk4 (reversed) */
    ccMsg(0, 0, cc, on ? 127 : 0);            /* hold/release the track button (cable 0) */
    if (on) noteOn(0, 0, NOTE_VOL_TOUCH, 127);/* assert Volume-knob touch */
    else    noteOff(0, 0, NOTE_VOL_TOUCH);
}

/* ---- drive (called from tick) ---- */
function driveStop() {
    if (TYPES[typeIdx].s === 0x90 && holdAsserted) noteOff(curCable(), channel, d1);
    holdAsserted = 0;
    running = 0;
}
function driveStart() {
    running = 1; tickCtr = 0; flipLevel = 0; rampDir = 1; rampPhase = 0;
    if (PATTERNS[patternIdx] === "Hold") {
        fireOnce(d2);                         /* assert and hold */
        holdAsserted = 1;
    }
}
function driveTick() {
    const pat = PATTERNS[patternIdx];
    if (pat === "Flip") {
        if (tickCtr % Math.max(1, rate) === 0) { flipLevel ^= 1; fireOnce(flipLevel ? 127 : 0); }
    } else if (pat === "Ramp") {
        if (tickCtr % Math.max(1, rate) === 0) {
            injMsg(curCable(), curStatus(), d1, encByte(rampDir > 0 ? 2 : -2));
            rampPhase += 2;
            if (rampPhase >= 128) { rampPhase = 0; rampDir = -rampDir; }
        }
    }
    /* OneShot fires on Play press; Hold asserted at start; nothing per-tick. */
}

/* ---- display ---- */
function draw() {
    clear_screen();
    print(0, 0, "Inject Probe", 1);
    print(96, 0, running ? "RUN" : "stop", 1);
    print(0, 12, "cbl" + curCable() + " " + TYPES[typeIdx].n + " c" + (channel + 1), 1);
    print(0, 24, "d1 " + d1 + "   d2 " + d2, 1);
    print(0, 36, PATTERNS[patternIdx] + "  rate " + rate, 1);
    print(0, 48, gesture ? ("GESTURE: TrkVol t" + gTrack()) : "K1cbl K2typ K3ch K4d1", 1);
    print(0, 56, gesture ? "Step16=stop  Play=drive" : "K5d2 K6pat K7rate Play=fire", 1);
}

globalThis.init = function() {
    shiftHeld = 0;
    announceMenuItem("Inject Probe", TYPES[typeIdx].n);
    draw();
};

globalThis.tick = function() {
    tickCtr++;
    if (running) driveTick();
    if (gesture) {
        if (tickCtr % 8 === 0) gestureAssert(1);          /* re-stamp (shim drops touch on suspend) */
        if (tickCtr % Math.max(1, rate) === 0) {          /* ramp CC79 up/down */
            ccMsg(0, 0, CC_MASTER_VOL, encByte(rampDir > 0 ? 2 : -2));
            rampPhase += 2;
            if (rampPhase >= 128) { rampPhase = 0; rampDir = -rampDir; }
        }
    }
    draw();   /* repaint every tick → resume always shows */
};

globalThis.onMidiMessageInternal = function(data) {
    if (!data) return;
    const status = data[0] | 0, n = data[1] | 0, v = data[2] | 0;
    const type = status & 0xF0;

    /* Step 16 → toggle the TrkVol gesture. */
    if (type === 0x90 && v > 0 && n === NOTE_GESTURE) {
        gesture ^= 1;
        if (gesture) { rampDir = 1; rampPhase = 0; gestureAssert(1); }
        else         { gestureAssert(0); }
        announce(gesture ? "gesture on" : "gesture off");
        return;
    }

    if (type === 0x90 && n < 10) return;          /* capacitive knob touch */
    if (type === 0xA0 || type === 0xD0) return;
    if (status === 0xF8 || status === 0xF0 || status === 0xF7) return;
    if (type !== 0xB0) return;

    if (n === CC_SHIFT) { shiftHeld = v > 0 ? 1 : 0; return; }

    if (n === CC_PLAY && v > 0) {
        if (PATTERNS[patternIdx] === "OneShot") { fireOnce(d2); announce("fired"); }
        else if (running) { driveStop(); announce("stopped"); }
        else { driveStart(); announce("started"); }
        return;
    }

    /* Configure while stopped — ignore knob edits during an active drive so an
     * injected cable-0 CC can't drive our own selection. */
    if ((running || gesture) && n >= CC_KNOB1 && n <= CC_KNOB1 + 6) return;
    if (n < CC_KNOB1 || n > CC_KNOB1 + 6) return;

    const step = (() => { const r = decodeDelta(v); return r > 0 ? 1 : (r < 0 ? -1 : 0); })();
    if (step === 0) return;
    const big = shiftHeld ? 10 : 1;

    switch (n - CC_KNOB1) {
    case 0: cableIdx   = clamp(cableIdx + step, 0, CABLES.length - 1); break;   /* K1 cable */
    case 1: typeIdx    = clamp(typeIdx + step, 0, TYPES.length - 1);   break;   /* K2 type  */
    case 2: channel    = clamp(channel + step, 0, 15);                 break;   /* K3 chan  */
    case 3: d1         = clamp(d1 + step * big, 0, 127);               break;   /* K4 data1 */
    case 4: d2         = clamp(d2 + step * big, 0, 127);               break;   /* K5 data2 */
    case 5: patternIdx = clamp(patternIdx + step, 0, PATTERNS.length - 1); break;/* K6 pattern */
    case 6: rate       = clamp(rate + step, 1, 50);                    break;   /* K7 rate  */
    }
};

globalThis.onMidiMessageExternal = function(_d) {};

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
