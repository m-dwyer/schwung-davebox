import { S } from './ui_state.mjs';

export const EDIT_SOUND_PREFLIGHT_TICKS = 24;

export function editSoundSlotLabel(slot) {
    return 'Slot' + ((slot | 0) + 1);
}

export function matchingSchwungSlotMask(trackChannel, slots) {
    if (!slots) return 0;
    const ch = trackChannel | 0;
    let mask = 0;
    for (let i = 0; i < slots.length && i < 4; i++) {
        if (slots[i].channel === ch || slots[i].channel === 0) mask |= (1 << i);
    }
    return mask;
}

/* Bitmask (bits 0-3) of ALL Schwung slots that receive a track's MIDI channel.
 * Multiple slots on the same channel are layered; the lowest set bit is the slot
 * co-run opens first. */
export function schSlotsForTrack(t) {
    if (typeof globalThis.shadow_get_slots !== 'function') return 0;
    return matchingSchwungSlotMask(S.trackChannel[t], globalThis.shadow_get_slots());
}

export function firstSchwungSlot(mask) {
    if ((mask | 0) === 0) return -1;
    let i = 0;
    while (i < 4 && !(mask & (1 << i))) i++;
    return i < 4 ? i : -1;
}

export function schSlotForTrack(t) {
    return firstSchwungSlot(schSlotsForTrack(t));
}

export function editSoundPreflightLine(t, route, slot) {
    const ch = S.trackChannel[t] | 0;
    if ((route | 0) === 1) return 'T' + (t + 1) + ' Move Ch' + ch;
    return 'T' + (t + 1) + ' Schwung ' + editSoundSlotLabel(slot);
}

export function canEditSoundRoute(route) {
    return (route | 0) === 0 || (route | 0) === 1;
}

export function describeEditSoundForTrack(t, caps) {
    const route = S.trackRoute[t] | 0;
    const hasCoRun = !!(caps && caps.hasCoRun);
    const hasMoveInject = !!(caps && caps.hasMoveInject);

    if (!hasCoRun) return { title: 'CO-RUN', body: 'UNAVAILABLE', queue: null, slotMask: 0 };

    if (route === 1) {
        if (!hasMoveInject) return { title: 'CO-RUN', body: 'UNAVAILABLE', queue: null, slotMask: 0 };
        const ch = S.trackChannel[t] | 0;
        if (ch < 1 || ch > 4) {
            return {
                title: 'MOVE CH>4',
                body: 'Ch' + ch,
                queue: { track: t | 0, route: route | 0, slot: -1 },
                slotMask: 0
            };
        }
        return {
            title: 'EDIT SOUND',
            body: editSoundPreflightLine(t, route, -1),
            queue: { track: t | 0, route: route | 0, slot: -1 },
            slotMask: 0
        };
    }

    if (route === 0) {
        const mask = schSlotsForTrack(t);
        if (mask === 0) {
            return {
                title: 'NO SLOT',
                body: 'Ch' + (S.trackChannel[t] | 0),
                queue: { track: t | 0, route: route | 0, slot: -1 },
                slotMask: 0
            };
        }
        const slot = firstSchwungSlot(mask);
        return {
            title: 'EDIT SOUND',
            body: editSoundPreflightLine(t, route, slot),
            queue: { track: t | 0, route: route | 0, slot: slot | 0 },
            slotMask: mask
        };
    }

    return { title: 'CO-RUN', body: 'UNAVAILABLE', queue: null, slotMask: 0 };
}

export function routeScopeLabel(t) {
    const route = S.trackRoute[t] | 0;
    const ch = S.trackChannel[t] | 0;
    if (route === 1) return 'T' + (t + 1) + ' Move Ch' + ch;
    if (route === 2) return 'T' + (t + 1) + ' External Ch' + ch;
    const slot = schSlotForTrack(t);
    return 'T' + (t + 1) + ' Schwung ' + (slot >= 0 ? editSoundSlotLabel(slot) : 'Ch' + ch);
}

export function routeScopeShortLabel(t) {
    const route = S.trackRoute[t] | 0;
    const ch = S.trackChannel[t] | 0;
    if (route === 1) return 'Move Ch' + ch;
    if (route === 2) return 'Ext Ch' + ch;
    const slot = schSlotForTrack(t);
    return 'Schw ' + (slot >= 0 ? 'S' + (slot + 1) : 'Ch' + ch);
}

export function routeCheckExpectedLabel(t) {
    return t < 4 ? ('T' + (t + 1) + ' Move Ch' + (t + 1))
                 : ('T' + (t + 1) + ' Schwung Ch' + (t + 1));
}

export function routeCheckNeedsWarning(t) {
    const expectedRoute = t < 4 ? 1 : 0;
    const expectedCh = t + 1;
    return S.trackRoute[t] !== expectedRoute || S.trackChannel[t] !== expectedCh;
}
