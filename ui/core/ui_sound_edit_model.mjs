export const SCHWUNG_SOUND_COMPONENTS = [
    { label: 'MIDI FX', param: 'midi_fx1:module', read: 'midi_fx1_module', list: 'midi_fx' },
    { label: 'Synth',   param: 'synth:module',    read: 'synth_module',    list: 'sound_generator' },
    { label: 'FX 1',    param: 'fx1:module',      read: 'fx1_module',      list: 'audio_fx' },
    { label: 'FX 2',    param: 'fx2:module',      read: 'fx2_module',      list: 'audio_fx' }
];

const DEFAULT_MODULE_CAPABILITIES = Object.freeze({
    browser: true,
    params: false,
    presets: false,
    deepEdit: true
});

export function clampComponentIndex(idx) {
    idx = idx | 0;
    if (idx < 0) return 0;
    if (idx >= SCHWUNG_SOUND_COMPONENTS.length) return SCHWUNG_SOUND_COMPONENTS.length - 1;
    return idx;
}

export function normalizeModuleName(v) {
    if (v == null) return '--';
    v = String(v);
    return v.length ? v : '--';
}

export function truncText(v, maxLen) {
    v = String(v || '');
    maxLen = maxLen | 0;
    return v.length > maxLen ? v.slice(0, maxLen) : v;
}

export function normalizeSchwungModuleIdentity(item, componentType) {
    if (typeof item === 'string') item = { id: item, name: item };
    if (!item) return null;

    const id = item.id || item.module || item.name || item.path;
    if (!id) return null;

    const status = item.status || item.installed_status || (item.installed === false ? 'missing' : 'installed');
    const capabilities = Object.assign({}, DEFAULT_MODULE_CAPABILITIES, item.capabilities || {});
    return {
        id: String(id),
        name: String(item.name || id),
        componentType: String(item.componentType || item.component_type || item.type || componentType || ''),
        category: item.category || item.group || '',
        vendor: item.vendor || item.source || '',
        status: String(status),
        capabilities
    };
}

export function normalizeSchwungModuleList(list, componentType) {
    if (typeof list === 'string') {
        try { list = JSON.parse(list); } catch (_e) {
            list = list.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
        }
    }
    if (!Array.isArray(list)) return [];
    return list.map(function(item) {
        return normalizeSchwungModuleIdentity(item, componentType);
    }).filter(Boolean);
}

export function readSchwungModuleName(slot, component) {
    if ((slot | 0) < 0 || !component || !component.read) return '--';
    if (typeof globalThis.shadow_get_param !== 'function') return '--';
    return normalizeModuleName(globalThis.shadow_get_param(slot | 0, component.read));
}

export function readSchwungModuleIdentity(slot, component) {
    const name = readSchwungModuleName(slot, component);
    if (name === '--') return null;
    return normalizeSchwungModuleIdentity({ id: name, name }, component ? component.list : '');
}

function normalizeChainParamList(raw) {
    if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch (_e) { raw = []; }
    }
    if (!Array.isArray(raw)) return [];
    return raw.map(function(p, idx) {
        if (typeof p === 'string') return { key: p, name: p, index: idx, source: 'chain' };
        if (!p || !p.key) return null;
        return Object.assign({}, p, {
            key: String(p.key),
            name: String(p.name || p.label || p.key),
            index: idx,
            source: 'chain'
        });
    }).filter(Boolean);
}

function parseJsonOrNull(raw) {
    if (!raw) return null;
    if (typeof raw !== 'string') return raw;
    try { return JSON.parse(raw); } catch (_e) { return null; }
}

function normalizeHierarchyParam(p, idx) {
    if (typeof p === 'string') return { key: p, name: p, index: idx, source: 'hierarchy' };
    if (!p || !p.key) return null;
    return Object.assign({}, p, {
        key: String(p.key),
        name: String(p.name || p.label || p.key),
        index: idx,
        source: 'hierarchy'
    });
}

function extractHierarchyParams(raw) {
    const hier = parseJsonOrNull(raw);
    const levels = hier && (hier.levels || (hier.capabilities && hier.capabilities.ui_hierarchy && hier.capabilities.ui_hierarchy.levels));
    if (!levels) return [];
    const root = levels.root || levels.Root || levels.main || levels.Main || null;
    const levelNames = root ? ['root'] : Object.keys(levels);
    const seen = {};
    const out = [];
    for (let li = 0; li < levelNames.length; li++) {
        const level = li === 0 && root ? root : levels[levelNames[li]];
        if (!level) continue;
        const lists = [level.knobs, level.params];
        for (let listIdx = 0; listIdx < lists.length; listIdx++) {
            const list = lists[listIdx];
            if (!Array.isArray(list)) continue;
            for (let i = 0; i < list.length; i++) {
                const param = normalizeHierarchyParam(list[i], out.length);
                if (param && !seen[param.key]) {
                    seen[param.key] = true;
                    out.push(param);
                }
            }
        }
        if (out.length || root) break;
    }
    return out;
}

export function readSchwungComponentParams(slot, component) {
    if ((slot | 0) < 0 || !component || !component.param || typeof globalThis.shadow_get_param !== 'function') return [];
    const prefix = component.param.replace(':module', '');
    const chain = normalizeChainParamList(globalThis.shadow_get_param(slot | 0, component.param.replace(':module', ':chain_params')));
    const hierarchy = extractHierarchyParams(globalThis.shadow_get_param(slot | 0, component.param.replace(':module', ':ui_hierarchy')));
    const chainByKey = {};
    chain.forEach(function(p) { chainByKey[p.key] = p; });
    const params = hierarchy.length
        ? hierarchy.map(function(p) { return Object.assign({}, p, chainByKey[p.key] || {}, p, { source: 'hierarchy' }); })
        : chain;
    return params.map(function(p) {
        const value = globalThis.shadow_get_param(slot | 0, prefix + ':' + p.key);
        return Object.assign({}, p, { prefix, value: value == null ? '' : String(value) });
    });
}

export function readSchwungChainKnobSummary(slot) {
    if ((slot | 0) < 0 || typeof globalThis.shadow_get_param !== 'function') return [];
    const params = [];
    for (let i = 1; i <= 8; i++) {
        const name = normalizeModuleName(globalThis.shadow_get_param(slot | 0, 'knob_' + i + '_param'));
        if (name !== '--') params.push({ key: 'knob_' + i, knob: i, name, index: i - 1 });
    }
    return params;
}

export function selectedParamList(page) {
    const idx = clampComponentIndex(page.selectedIndex);
    const componentParams = (page.componentParams && page.componentParams[idx]) || [];
    if (componentParams.length) return componentParams.map(function(p, i) {
        const out = Object.assign({}, p, { displayPrefix: 'P', number: i + 1, source: p.source || 'chain', total: componentParams.length });
        const overrideKey = out.prefix && out.key ? out.prefix + ':' + out.key : '';
        if (overrideKey && page.paramValueOverrides && page.paramValueOverrides[overrideKey] != null) {
            out.value = page.paramValueOverrides[overrideKey];
        }
        return out;
    });
    return (page.chainParams || []).map(function(p) {
        return Object.assign({}, p, { displayPrefix: 'K', number: p.knob, source: 'knob', total: (page.chainParams || []).length });
    });
}

export function visibleParamList(page) {
    return selectedParamList(page);
}

export function displayParamValue(p) {
    if (!p || p.value == null || p.value === '') return '--';
    if (p.type === 'enum' && Array.isArray(p.options)) {
        const idx = parseInt(p.value, 10);
        if (String(idx) === String(p.value) && p.options[idx] != null) return String(p.options[idx]);
    }
    if (p.type === 'bool' || p.type === 'boolean') return String(p.value) === '1' || String(p.value) === 'true' ? 'On' : 'Off';
    const n = parseFloat(p.value);
    if (Number.isFinite(n)) {
        if (Math.abs(n) >= 100) return String(Math.round(n));
        if (Math.abs(n) >= 10) return String(Math.round(n * 10) / 10);
        return String(Math.round(n * 100) / 100);
    }
    return String(p.value);
}

function formatParamForSet(value, p, step) {
    const type = String(p.type || '').toLowerCase();
    if (type === 'int' || type === 'integer') return String(Math.round(value));
    if (Number.isFinite(step) && step > 0 && String(step).indexOf('.') >= 0) {
        const places = decimalsForStep(step);
        return value.toFixed(places).replace(/\.?0+$/, '');
    }
    return String(Math.round(value * 1000000) / 1000000);
}

function isDiscreteParam(p, type) {
    if (type === 'int' || type === 'integer' || type === 'enum' || type === 'bool' || type === 'boolean') return true;
    const declaredStep = firstFiniteNumber(p.step, p.increment, p.delta, NaN);
    return Number.isFinite(declaredStep) && declaredStep >= 1;
}

function decimalsForStep(step) {
    if (step >= 1) return 0;
    if (step >= 0.1) return 1;
    return 2;
}

export function nextEditableParamValue(p, delta) {
    const cur = p.value == null ? '' : String(p.value);
    const type = String(p.type || '').toLowerCase();
    if (type === 'enum' && Array.isArray(p.options) && p.options.length) {
        let idx = p.options.indexOf(cur);
        const pluginUsesIndex = idx < 0;
        if (pluginUsesIndex) {
            const parsed = parseInt(cur, 10);
            idx = Number.isFinite(parsed) && parsed >= 0 && parsed < p.options.length ? parsed : 0;
        }
        idx = (idx + (delta > 0 ? 1 : -1) + p.options.length) % p.options.length;
        return pluginUsesIndex ? String(idx) : String(p.options[idx]);
    }
    if (type === 'bool' || type === 'boolean') {
        return (cur === '1' || cur === 'true') ? '0' : '1';
    }
    if (type === 'string' || type === 'filepath' || type === 'file' || type === 'canvas') return null;

    const min = firstFiniteNumber(p.min, p.minimum, p.minValue, p.low, p.lower, p.rangeMin, p.range_min);
    const max = firstFiniteNumber(p.max, p.maximum, p.maxValue, p.high, p.upper, p.rangeMax, p.range_max);
    const declaredStep = firstFiniteNumber(p.step, p.increment, p.delta, NaN);
    const hasMin = Number.isFinite(min);
    const hasMax = Number.isFinite(max);
    let n = parseFloat(cur);
    if (!Number.isFinite(n)) {
        const looksNumeric = type === 'float' || type === 'number' || type === 'double' || type === 'int' || type === 'integer' || hasMin || hasMax || Number.isFinite(declaredStep);
        if (!looksNumeric) return null;
        if (hasMin && hasMax && min <= 0 && max >= 0) n = 0;
        else if (hasMin) n = min;
        else if (hasMax) n = max;
        else n = 0;
    }
    const range = hasMin && hasMax ? Math.abs(max - min) : 0;
    const step = isDiscreteParam(p, type)
        ? (Number.isFinite(declaredStep) && declaredStep > 0 ? declaredStep : 1)
        : (range > 0 ? range / 100 : (Number.isFinite(declaredStep) && declaredStep > 0 ? declaredStep : 0.01));
    let next = n + delta * step;
    if (hasMin) next = Math.max(min, next);
    if (hasMax) next = Math.min(max, next);
    return formatParamForSet(next, p, step);
}

function firstFiniteNumber() {
    for (let i = 0; i < arguments.length; i++) {
        const n = parseFloat(arguments[i]);
        if (Number.isFinite(n)) return n;
    }
    return NaN;
}
