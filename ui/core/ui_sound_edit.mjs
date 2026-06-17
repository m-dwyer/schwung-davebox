import { S } from './ui_state.mjs';
import {
    EDIT_SOUND_PREFLIGHT_TICKS,
    describeEditSoundForTrack,
    schSlotsForTrack
} from './ui_routes.mjs';

function queueEditSoundEntry(t, route, slot) {
    S.pendingEditSoundEntry = {
        track: t | 0,
        route: route | 0,
        slot: slot | 0,
        delay: EDIT_SOUND_PREFLIGHT_TICKS
    };
    S.screenDirty = true;
}

export function clearPendingEditSoundEntry() {
    S.pendingEditSoundEntry = null;
}

export function requestEditSoundForTrack(t, caps) {
    clearPendingEditSoundEntry();
    S.globalMenuOpen = false;
    S.lastSentMenuEditValue = null;

    const desc = describeEditSoundForTrack(t, caps);
    if (desc.slotMask) S._coRunChanSlots = desc.slotMask;
    if (desc.queue) queueEditSoundEntry(desc.queue.track, desc.queue.route, desc.queue.slot);
    return { title: desc.title, body: desc.body };
}

export function refreshSchwungCoRunSlotMask(t) {
    const mask = schSlotsForTrack(t);
    S._coRunChanSlots = mask;
    return mask;
}

export function advancePendingEditSoundEntry(activeTrack) {
    const e = S.pendingEditSoundEntry;
    if (!e) return null;

    if (e.track !== activeTrack || e.route !== (S.trackRoute[e.track] | 0)) {
        clearPendingEditSoundEntry();
        return null;
    }

    if (--e.delay > 0) return null;

    clearPendingEditSoundEntry();
    if (e.route === 1) return { kind: 'move', track: e.track };
    if (e.route === 0) {
        refreshSchwungCoRunSlotMask(e.track);
        return { kind: 'schwung', track: e.track, slot: e.slot };
    }
    return null;
}
