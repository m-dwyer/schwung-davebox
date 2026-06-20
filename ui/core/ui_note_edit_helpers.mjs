import { NOTE_KEYS, SCALE_INTERVALS, drumVelZoneToVelocity } from './ui_constants.mjs';

/* Step-edit pitch nudge: move note up/down to next in-scale pitch.
 * When scale-aware is off, shifts by exactly 1 semitone per dir. */
export function scaleNudgeNoteImpl(S, note, dir, key, scale) {
    if (!S.scaleAware) return Math.max(0, Math.min(127, note + dir));
    const ivls = SCALE_INTERVALS[scale];
    let candidate = note + dir;
    while (candidate >= 0 && candidate <= 127) {
        const pc = ((candidate - key) % 12 + 12) % 12;
        if (ivls.indexOf(pc) >= 0) return candidate;
        candidate += dir;
    }
    return Math.max(0, Math.min(127, note + dir));
}

/* Step-entry velocity. Single source of truth used by every step-write site. */
export function stepEntryVelocityImpl(S, t, liveVel, allowZone) {
    if (allowZone) {
        if (liveVel >= 0) return liveVel;
        if (S.drumVelZoneArmed && S.drumVelZoneArmed[t])
            return drumVelZoneToVelocity(S.drumLastVelZone[t]);
        const tvo = S.trackVelOverride[t];
        if (tvo > 0) return tvo;
        return 100;
    }
    const tvo = S.trackVelOverride[t];
    if (tvo > 0) return tvo;
    if (liveVel >= 0) return liveVel;
    return 100;
}

/* Root note in pad layout closest to octave 4 — guaranteed in-scale and on a pad. */
export function defaultStepNoteImpl(S) {
    const target = S.padKey + 60;
    let best = -1, bestDist = 999;
    for (let i = 0; i < 32; i++) {
        if (S.padNoteMap[i] === 0xFF) continue;
        const p = S.padNoteMap[i] + S.trackOctave[S.activeTrack] * 12;
        if (p < 0 || p > 127) continue;
        if (S.padNoteMap[i] % 12 !== S.padKey) continue;
        const d = Math.abs(p - target);
        if (d < bestDist) { bestDist = d; best = p; }
    }
    if (best >= 0) return best;
    for (let i = 0; i < 32; i++) {
        if (S.padNoteMap[i] === 0xFF) continue;
        return Math.max(0, Math.min(127, S.padNoteMap[i] + S.trackOctave[S.activeTrack] * 12));
    }
    return 60;
}

/** MIDI note number -> display string e.g. "C3/60" */
export function drumNoteLabelImpl(midiNote) {
    const oct  = Math.floor(midiNote / 12) - 2;
    const name = NOTE_KEYS[midiNote % 12];
    return name + oct + '/' + midiNote;
}
