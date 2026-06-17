import { S } from './ui_state.mjs';

export function routeCheckSlots() {
    if (typeof globalThis.shadow_get_slots !== 'function') return null;
    const slots = globalThis.shadow_get_slots();
    return Array.isArray(slots) ? slots : null;
}

export function slotIsThru(slot) {
    if (!slot) return false;
    if (slot.thru === true || slot.is_thru === true) return true;
    if (slot.forward_channel === -2 || slot.channel === -2) return true;
    const type = String(slot.type || slot.mode || slot.name || '').toLowerCase();
    return type.indexOf('thru') >= 0;
}

export function routeCheckSchwungStatus(ch, slots) {
    if (!slots) return 'CHECK';
    let first = -1;
    let thru = false;
    for (let i = 0; i < slots.length && i < 4; i++) {
        const slot = slots[i] || {};
        if (slotIsThru(slot)) {
            if (slot.channel === ch || slot.channel === 0 ||
                    slot.channel === -2 || slot.forward_channel === -2) thru = true;
            continue;
        }
        if (slot.channel === ch || slot.channel === 0) {
            first = i;
            break;
        }
    }
    if (first >= 0) return 'OK S' + (first + 1);
    return thru ? 'THRU!' : 'NO SLOT';
}

export function routeCheckStatus(t, slots) {
    const expectedRoute = t < 4 ? 1 : 0;
    const expectedCh = t + 1;
    const actualRoute = S.trackRoute[t] | 0;
    const actualCh = S.trackChannel[t] | 0;
    if (actualRoute !== expectedRoute) return 'ROUTE!';
    if (expectedRoute === 1) {
        if (actualCh !== expectedCh) return 'CH' + actualCh + '!';
        return 'MANUAL';
    }
    return routeCheckSchwungStatus(actualCh, slots);
}

export function routeCheckViewModel(selected, slots) {
    selected = Math.max(0, Math.min(7, selected | 0));
    const start = selected < 4 ? 0 : 4;
    const rows = [];
    for (let row = 0; row < 4; row++) {
        const t = start + row;
        const n = t + 1;
        const move = t < 4;
        const route = move ? ('Move Ch' + n) : ('Schw Ch' + (S.trackChannel[t] | 0));
        rows.push({
            track: t,
            text: 'T' + n + ' ' + route,
            status: routeCheckStatus(t, slots),
            active: t === selected
        });
    }
    return {
        title: 'ROUTE CHECK',
        range: (start + 1) + '-' + (start + 4) + '/8',
        rows: rows,
        footer: 'Jog scroll  Back/Menu'
    };
}
