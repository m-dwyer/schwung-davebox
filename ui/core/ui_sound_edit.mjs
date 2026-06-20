import { S } from './ui_state.mjs';
import {
    EDIT_SOUND_PREFLIGHT_TICKS,
    describeEditSoundForTrack,
    schSlotsForTrack
} from './ui_routes.mjs';
import {
    SCHWUNG_SOUND_COMPONENTS,
    clampComponentIndex,
    displayParamValue,
    nextEditableParamValue,
    normalizeSchwungModuleIdentity,
    normalizeSchwungModuleList,
    readSchwungChainKnobSummary,
    readSchwungComponentParams,
    readSchwungModuleIdentity,
    readSchwungModuleName,
    visibleParamList
} from './ui_sound_edit_model.mjs';
import { renderSchwungSoundPage as renderSchwungSoundPageImpl } from './ui_sound_edit_render.mjs';

const SOUND_PARAM_PEEK_MS = 1000;

export {
    SCHWUNG_SOUND_COMPONENTS,
    normalizeSchwungModuleIdentity,
    normalizeSchwungModuleList
};

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

function currentModuleIdForComponent(page, component) {
    if (!page || !component || !component.read) return '';
    const v = readSchwungModuleName(page.slot, component);
    return v === '--' ? '' : v;
}

function soundParamFeedbackForKnob(page, knobIdx, status) {
    const params = visibleParamList(page);
    const pageCount = Math.max(1, Math.ceil(params.length / 8));
    const pageIdx = Math.max(0, Math.min(pageCount - 1, Math.floor((page.paramDetailIndex | 0) / 8)));
    const p = params[pageIdx * 8 + knobIdx];
    if (!p) return { knob: knobIdx + 1, label: '--', value: '--', displayValue: '--', status: 'empty' };
    return {
        knob: knobIdx + 1,
        label: p.name || p.key || '--',
        value: p.value,
        displayValue: displayParamValue(p),
        type: p.type,
        min: p.min,
        max: p.max,
        rangeMin: p.rangeMin,
        rangeMax: p.rangeMax,
        status
    };
}

function setTouchedParamFeedback(page, feedback) {
    const nowMs = (typeof Date !== 'undefined' && Date.now) ? Date.now() : NaN;
    page.touchedParam = Object.assign({}, feedback, {
        expireAtMs: Number.isFinite(nowMs) ? nowMs + SOUND_PARAM_PEEK_MS : NaN,
        expireTick: (S.tickCount | 0) + 50
    });
}

function rememberSchwungSoundPosition(page) {
    if (!page || page.track == null || !S.schwungSoundMemory) return;
    const track = page.track | 0;
    if (track < 0 || track >= S.schwungSoundMemory.length) return;
    S.schwungSoundMemory[track] = {
        selectedIndex: clampComponentIndex(page.selectedIndex | 0),
        paramDetailIndex: Math.max(0, page.paramDetailIndex | 0),
        paramDetail: !!page.paramDetail
    };
}

function componentHasParams(page, idx) {
    idx = clampComponentIndex(idx);
    if (idx >= 0 && idx < 4 && page.componentParams && page.componentParams[idx] && page.componentParams[idx].length) return true;
    return !!(page.chainParams && page.chainParams.length && idx === 1);
}

function firstPlayableComponentIndex(page) {
    const memory = S.schwungSoundMemory && S.schwungSoundMemory[page.track | 0];
    if (memory && componentHasParams(page, memory.selectedIndex)) return clampComponentIndex(memory.selectedIndex);
    if (componentHasParams(page, 1)) return 1;
    for (let i = 0; i < 4; i++) {
        if (componentHasParams(page, i)) return i;
    }
    return memory ? clampComponentIndex(memory.selectedIndex) : 1;
}

function restoreSchwungSoundPosition(page) {
    const memory = S.schwungSoundMemory && S.schwungSoundMemory[page.track | 0];
    const selectedIndex = firstPlayableComponentIndex(page);
    page.selectedIndex = selectedIndex;
    page.paramDetailIndex = memory && memory.selectedIndex === selectedIndex ? Math.max(0, memory.paramDetailIndex | 0) : 0;
    page.paramDetail = componentHasParams(page, selectedIndex) && (!memory || memory.paramDetail !== false || memory.selectedIndex !== selectedIndex);
    page.touchedParam = null;
}

export function refreshSchwungSoundPageModules() {
    const page = S.schwungSoundPage;
    if (!page) return;
    page.modules = SCHWUNG_SOUND_COMPONENTS.map(function(c) {
        return c.read ? readSchwungModuleIdentity(page.slot, c) : null;
    });
    page.names = page.modules.map(function(module) {
        return module ? module.name : '';
    });
    page.componentParams = SCHWUNG_SOUND_COMPONENTS.map(function(c) {
        return readSchwungComponentParams(page.slot, c);
    });
    page.chainParams = readSchwungChainKnobSummary(page.slot);
    S.screenDirty = true;
}

export function openSchwungSoundPage(t, slot) {
    S.pendingEditSoundEntry = null;
    S.globalMenuOpen = false;
    S.lastSentMenuEditValue = null;
    S.schwungSoundPage = {
        track: t | 0,
        slot: slot | 0,
        selectedIndex: 1,
        browser: false,
        browserItems: [],
        browserIndex: 0,
        noList: false,
        paramDetail: false,
        paramDetailIndex: 0,
        touchedParam: null,
        paramValueOverrides: {},
        modules: [],
        componentParams: [],
        chainParams: [],
        names: []
    };
    refreshSchwungSoundPageModules();
    restoreSchwungSoundPosition(S.schwungSoundPage);
}

export function closeSchwungSoundPage() {
    if (!S.schwungSoundPage) return false;
    S.schwungSoundPage = null;
    S.screenDirty = true;
    return true;
}

function filterHostModulesForComponent(componentType) {
    if (typeof globalThis.host_list_modules !== 'function') return null;
    return normalizeSchwungModuleList(globalThis.host_list_modules()).filter(function(item) {
        return item.componentType === componentType;
    });
}

export function openSchwungSoundBrowser() {
    const page = S.schwungSoundPage;
    if (!page) return false;
    if (page.slot < 0) {
        S.screenDirty = true;
        return true;
    }
    const component = SCHWUNG_SOUND_COMPONENTS[clampComponentIndex(page.selectedIndex)];
    if (!component.param) return { deepEdit: true, track: page.track, slot: page.slot };
    if (typeof globalThis.shadow_list_modules_for_component === 'function') {
        page.browserItems = normalizeSchwungModuleList(
            globalThis.shadow_list_modules_for_component(component.list),
            component.list
        );
    } else {
        const hostItems = filterHostModulesForComponent(component.list);
        if (hostItems === null) {
            page.browser = true;
            page.browserItems = [];
            page.browserIndex = 0;
            page.noList = true;
            S.screenDirty = true;
            return true;
        }
        page.browserItems = hostItems;
    }
    if (!page.browserItems.length && component.list === 'sound_generator') {
        const synthItems = filterHostModulesForComponent('synth');
        if (synthItems && synthItems.length) page.browserItems = synthItems;
    }
    if (!page.browserItems.length) {
        page.browser = true;
        page.browserIndex = 0;
        page.noList = true;
        S.screenDirty = true;
        return true;
    }
    page.browser = true;
    const currentId = currentModuleIdForComponent(page, component);
    const currentIndex = currentId
        ? page.browserItems.findIndex(function(item) { return item.id === currentId; })
        : -1;
    page.browserIndex = currentIndex >= 0 ? currentIndex : 0;
    page.noList = page.browserItems.length === 0;
    S.screenDirty = true;
    return true;
}

export function applySchwungSoundBrowserSelection() {
    const page = S.schwungSoundPage;
    if (!page || !page.browser || page.slot < 0 || page.noList) return false;
    const component = SCHWUNG_SOUND_COMPONENTS[clampComponentIndex(page.selectedIndex)];
    const item = page.browserItems[page.browserIndex | 0];
    if (!component || !component.param || !item) return false;
    if (typeof globalThis.shadow_set_param !== 'function') {
        page.noList = true;
        S.screenDirty = true;
        return true;
    }
    globalThis.shadow_set_param(page.slot | 0, component.param, item.id);
    page.browser = false;
    page.browserItems = [];
    page.browserIndex = 0;
    page.noList = false;
    page.paramValueOverrides = {};
    refreshSchwungSoundPageModules();
    return true;
}

export function rotateSchwungSoundPage(delta) {
    const page = S.schwungSoundPage;
    if (!page || delta === 0) return false;
    if (page.browser) {
        const n = page.browserItems.length;
        if (n > 0) page.browserIndex = Math.max(0, Math.min(n - 1, (page.browserIndex | 0) + delta));
    } else if (page.paramDetail) {
        const params = visibleParamList(page);
        const pageCount = Math.max(1, Math.ceil(params.length / 8));
        const currentPage = Math.max(0, Math.min(pageCount - 1, Math.floor((page.paramDetailIndex | 0) / 8)));
        const nextPage = Math.max(0, Math.min(pageCount - 1, currentPage + delta));
        page.paramDetailIndex = nextPage * 8;
        if (nextPage !== currentPage) page.touchedParam = null;
    } else {
        page.selectedIndex = clampComponentIndex((page.selectedIndex | 0) + delta);
        page.paramDetailIndex = 0;
        page.touchedParam = null;
    }
    rememberSchwungSoundPosition(page);
    S.screenDirty = true;
    return true;
}

export function toggleSchwungSoundParamDetail() {
    const page = S.schwungSoundPage;
    if (!page || page.browser) return false;
    const component = SCHWUNG_SOUND_COMPONENTS[clampComponentIndex(page.selectedIndex)];
    if (!component || !component.read) return false;
    page.paramDetail = !page.paramDetail;
    page.paramDetailIndex = 0;
    page.touchedParam = null;
    rememberSchwungSoundPosition(page);
    S.screenDirty = true;
    return true;
}

export function selectSchwungSoundComponent(idx) {
    const page = S.schwungSoundPage;
    if (!page || page.browser) return false;
    idx = idx | 0;
    if (idx < 0 || idx > 3) return false;
    page.selectedIndex = idx;
    page.paramDetailIndex = 0;
    page.touchedParam = null;
    page.paramDetail = componentHasParams(page, idx);
    rememberSchwungSoundPosition(page);
    S.screenDirty = true;
    return true;
}

export function adjustSchwungSoundVisibleParam(knobIdx, delta) {
    const page = S.schwungSoundPage;
    if (!page || !page.paramDetail || page.browser || delta === 0) return false;
    knobIdx = knobIdx | 0;
    if (knobIdx < 0 || knobIdx > 7) return false;
    const params = visibleParamList(page);
    const pageCount = Math.max(1, Math.ceil(params.length / 8));
    const pageIdx = Math.max(0, Math.min(pageCount - 1, Math.floor((page.paramDetailIndex | 0) / 8)));
    const p = params[pageIdx * 8 + knobIdx];
    if (!p) {
        setTouchedParamFeedback(page, { knob: knobIdx + 1, label: '--', value: '--', displayValue: '--', status: 'empty' });
        S.screenDirty = true;
        return true;
    }
    if (!p.prefix || !p.key) {
        setTouchedParamFeedback(page, { knob: knobIdx + 1, label: p.name || p.key || '--', value: '--', displayValue: '--', status: 'unmapped' });
        S.screenDirty = true;
        return true;
    }
    if (typeof globalThis.shadow_set_param !== 'function') {
        setTouchedParamFeedback(page, { knob: knobIdx + 1, label: p.name || p.key, value: '--', displayValue: '--', status: 'unavailable' });
        S.screenDirty = true;
        return true;
    }
    const next = nextEditableParamValue(p, delta);
    if (next == null) {
        setTouchedParamFeedback(page, {
            knob: knobIdx + 1,
            label: p.name || p.key,
            value: p.value,
            displayValue: displayParamValue(p),
            type: p.type,
            min: p.min,
            max: p.max,
            rangeMin: p.rangeMin,
            rangeMax: p.rangeMax,
            status: 'readOnly'
        });
        S.screenDirty = true;
        return true;
    }
    globalThis.shadow_set_param(page.slot | 0, p.prefix + ':' + p.key, next);
    if (!page.paramValueOverrides) page.paramValueOverrides = {};
    page.paramValueOverrides[p.prefix + ':' + p.key] = String(next);
    p.value = next;
    setTouchedParamFeedback(page, {
        knob: knobIdx + 1,
        label: p.name || p.key,
        value: next,
        displayValue: displayParamValue(p),
        type: p.type,
        min: p.min,
        max: p.max,
        rangeMin: p.rangeMin,
        rangeMax: p.rangeMax,
        status: 'edited'
    });
    const selectedIdx = clampComponentIndex(page.selectedIndex);
    if (page.componentParams && page.componentParams[selectedIdx]) {
        const real = page.componentParams[selectedIdx].find(function(cp) { return cp.key === p.key; });
        if (real) real.value = next;
    }
    S.screenDirty = true;
    return true;
}

export function touchSchwungSoundVisibleParam(knobIdx) {
    const page = S.schwungSoundPage;
    if (!page || !page.paramDetail || page.browser) return false;
    knobIdx = knobIdx | 0;
    if (knobIdx < 0 || knobIdx > 7) return false;
    setTouchedParamFeedback(page, soundParamFeedbackForKnob(page, knobIdx, 'peek'));
    S.screenDirty = true;
    return true;
}

export function expireSchwungSoundParamPeek() {
    const page = S.schwungSoundPage;
    if (!page || !page.touchedParam) return false;
    const nowMs = (typeof Date !== 'undefined' && Date.now) ? Date.now() : NaN;
    if (Number.isFinite(nowMs) && Number.isFinite(page.touchedParam.expireAtMs)) {
        if (nowMs < page.touchedParam.expireAtMs) return false;
    } else if ((S.tickCount | 0) < (page.touchedParam.expireTick | 0)) {
        return false;
    }
    page.touchedParam = null;
    S.screenDirty = true;
    return true;
}

export function renderSchwungSoundPage(surface) {
    return renderSchwungSoundPageImpl(S, surface);
}

export function requestEditSoundForTrack(t, caps) {
    clearPendingEditSoundEntry();
    S.globalMenuOpen = false;
    S.lastSentMenuEditValue = null;

    const desc = describeEditSoundForTrack(t, caps);
    if (desc.slotMask) S._coRunChanSlots = desc.slotMask;
    if (desc.queue && desc.queue.route === 0)
        openSchwungSoundPage(desc.queue.track, desc.queue.slot);
    else if (desc.queue)
        queueEditSoundEntry(desc.queue.track, desc.queue.route, desc.queue.slot);
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
