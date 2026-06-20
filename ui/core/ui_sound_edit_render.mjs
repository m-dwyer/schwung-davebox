import {
    SCHWUNG_SOUND_COMPONENTS,
    clampComponentIndex,
    displayParamValue,
    selectedParamList,
    truncText,
    visibleParamList
} from './ui_sound_edit_model.mjs';
import {
    compactLayoutLabel,
    compactLayoutValue,
    renderEncoderValueGrid,
    renderHeaderPill,
    splitLayoutWords
} from '../render/ui_oled_layout.mjs';

function renderSchwungSoundParamDetail(surface, page) {
    const params = selectedParamList(page);
    const idx = clampComponentIndex(page.selectedIndex);
    const component = SCHWUNG_SOUND_COMPONENTS[idx];
    const module = page.modules && page.modules[idx];
    const visibleParams = visibleParamList(page);
    const total = params.length;
    const pageCount = Math.max(1, Math.ceil(visibleParams.length / 8));
    const pageIdx = Math.max(0, Math.min(pageCount - 1, Math.floor((page.paramDetailIndex | 0) / 8)));
    const start = pageIdx * 8;
    surface.print(0, 0, truncText(component.label + ' ' + (module && module.name ? module.name : '--'), 15), 1);
    if (total) {
        surface.print(96, 0, truncText(String(pageIdx + 1) + '/' + pageCount, 5), 1);
    }
    if (!params.length) {
        surface.print(0, 18, 'Params --', 1);
        return true;
    }
    if (page.touchedParam) {
        return renderFocusedParam(surface, page.touchedParam, component, module, pageIdx, pageCount);
    }
    for (let i = 0; i < 8; i++) {
        const p = visibleParams[start + i];
        const col = i < 4 ? 0 : 64;
        const row = i % 4;
        const y = 12 + row * 10;
        if (!p) {
            surface.print(col, y, '-- --', 1);
            continue;
        }
        surface.print(col, y, compactParamCell(p, 10), 1);
    }
    if (pageCount > 1) surface.print(96, 54, String(pageIdx + 1) + '/' + pageCount, 1);
    return true;
}

function renderFocusedParam(surface, touched, component, module, pageIdx, pageCount) {
    const title = truncText(component.label + ' ' + (module && module.name ? module.name : '--'), 17);
    if (surface.fill_rect) surface.fill_rect(0, 0, 128, 9, 1);
    surface.print(2, 1, title, surface.fill_rect ? 0 : 1);
    surface.print(110, 1, 'K' + (touched.knob | 0), surface.fill_rect ? 0 : 1);

    const lines = wrapParamLabel(readableParamName(touched.label || '--'), 21);
    surface.print(0, 14, lines[0], 1);
    if (lines[1]) surface.print(0, 24, lines[1], 1);

    const value = focusedParamValue(touched);
    const valueText = truncText(value, 21);
    if (surface.fill_rect) {
        surface.fill_rect(0, 36, 128, 12, 1);
        surface.print(centerX(valueText), 38, valueText, 0);
    } else {
        surface.print(0, 38, valueText, 1);
    }

    const status = focusedParamStatus(touched);
    if (status) {
        surface.print(0, 54, status, 1);
    } else if (!renderFocusedRangeBar(surface, touched)) {
        surface.print(0, 54, 'Bank ' + (pageIdx + 1) + '/' + pageCount, 1);
    }
    return true;
}

function focusedParamValue(touched) {
    if (!touched) return '--';
    if (touched.status === 'empty') return 'No param';
    if (touched.status === 'unmapped') return 'Unmapped';
    if (touched.status === 'unavailable') return 'No write';
    return touched.displayValue || displayParamValue({ value: touched.value });
}

function focusedParamStatus(touched) {
    if (!touched) return '';
    if (touched.status === 'readOnly') return 'Read only';
    if (touched.status === 'empty' || touched.status === 'unmapped' || touched.status === 'unavailable') return '';
    return '';
}

function renderFocusedRangeBar(surface, touched) {
    if (!surface.fill_rect) return false;
    const type = String(touched.type || '').toLowerCase();
    if (type === 'enum' || type === 'bool' || type === 'boolean' || type === 'string' || type === 'filepath' || type === 'file' || type === 'canvas') return false;
    const min = firstFiniteNumber(touched.min, touched.rangeMin);
    const max = firstFiniteNumber(touched.max, touched.rangeMax);
    const value = parseFloat(touched.value);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || !Number.isFinite(value)) return false;
    const frac = Math.max(0, Math.min(1, (value - min) / (max - min)));
    surface.fill_rect(0, 55, 128, 1, 1);
    surface.fill_rect(0, 61, 128, 1, 1);
    surface.fill_rect(0, 55, 1, 7, 1);
    surface.fill_rect(127, 55, 1, 7, 1);
    surface.fill_rect(1, 56, Math.max(1, Math.min(126, Math.round(frac * 126))), 5, 1);
    return true;
}

function centerX(text) {
    return Math.max(0, Math.floor((128 - String(text || '').length * 6) / 2));
}

function wrapParamLabel(label, maxLen) {
    label = String(label || '--');
    maxLen = maxLen | 0;
    if (label.length <= maxLen) return [label, ''];
    const words = label.split(/\s+/).filter(Boolean);
    let line = '';
    const lines = [];
    for (let i = 0; i < words.length; i++) {
        const next = line ? line + ' ' + words[i] : words[i];
        if (next.length <= maxLen) {
            line = next;
        } else {
            if (line) lines.push(line);
            line = words[i];
        }
        if (lines.length === 1) break;
    }
    if (line) lines.push(line);
    return [truncText(lines[0] || label, maxLen), truncText(lines[1] || '', maxLen)];
}

function firstFiniteNumber() {
    for (let i = 0; i < arguments.length; i++) {
        const n = parseFloat(arguments[i]);
        if (Number.isFinite(n)) return n;
    }
    return NaN;
}

function readableParamName(name) {
    return splitLayoutWords(name).join(' ');
}

function compactParamCell(p, maxLen) {
    maxLen = maxLen | 0;
    const value = compactLayoutValue(displayParamValue(p), Math.min(5, Math.max(2, maxLen - 2)));
    const labelBudget = Math.max(1, maxLen - value.length - 1);
    const label = compactSoundParamLabel(p, labelBudget);
    return truncText(label + ' ' + value, maxLen);
}

function renderSoundHeader(surface, page, component) {
    const title = truncText('T' + (page.track + 1) + ' ' + compactSlotTitle(component.label), 8);
    const idx = clampComponentIndex(page.selectedIndex);
    const module = page.modules && page.modules[idx];
    const name = module && module.name ? module.name : 'Empty';
    renderHeaderPill(surface, title, name, { titleMax: 8, pillMax: 10 });
}

function compactSlotTitle(label) {
    label = String(label || '');
    if (label === 'MIDI FX') return 'MIDI FX';
    if (label === 'Synth') return 'SYNTH';
    if (label === 'FX 1') return 'FX1';
    if (label === 'FX 2') return 'FX2';
    return label.toUpperCase();
}

function renderParamGrid(surface, page, startY) {
    const params = visibleParamList(page);
    const pageCount = Math.max(1, Math.ceil(params.length / 8));
    const pageIdx = Math.max(0, Math.min(pageCount - 1, Math.floor((page.paramDetailIndex | 0) / 8)));
    const start = pageIdx * 8;
    const cells = [];
    for (let i = 0; i < 8; i++) {
        const p = params[start + i];
        if (p) cells.push({
            label: p.shortName || p.short_name || p.name || p.label || p.key || '',
            value: displayParamValue(p)
        });
    }
    renderEncoderValueGrid(surface, cells, {
        mode: 'encoder-grid',
        startY,
        pageIdx,
        pageCount
    });
}

function compactSoundParamLabel(p, maxLen) {
    return compactLayoutLabel(p.shortName || p.short_name || p.name || p.label || p.key || '', maxLen);
}

export function renderSchwungSoundPage(S, surface) {
    const page = S.schwungSoundPage;
    if (!page) return false;
    surface.clear_screen();
    if (page.slot < 0) {
        surface.print(0, 0, 'SOUND T' + (page.track + 1), 1);
        surface.print(0, 14, 'NO SLOT', 1);
        surface.print(0, 28, 'Ch' + (S.trackChannel[page.track] | 0), 1);
        surface.print(0, 50, 'Menu exits', 1);
        return true;
    }
    if (page.browser) {
        const component = SCHWUNG_SOUND_COMPONENTS[clampComponentIndex(page.selectedIndex)];
        surface.print(0, 0, component.label, 1);
        if (page.noList) {
            surface.print(0, 18, 'NO LIST', 1);
            surface.print(0, 32, 'Needs Schwung hook', 1);
            return true;
        }
        const start = Math.max(0, Math.min(page.browserIndex | 0, Math.max(0, page.browserItems.length - 3)));
        for (let i = 0; i < 3; i++) {
            const idx = start + i;
            if (idx >= page.browserItems.length) break;
            surface.print(0, 16 + i * 14, (idx === page.browserIndex ? '>' : ' ') + page.browserItems[idx].name, 1);
        }
        return true;
    }
    if (page.paramDetail && page.touchedParam) return renderSchwungSoundParamDetail(surface, page);
    const selectedIndex = clampComponentIndex(page.selectedIndex);
    const component = SCHWUNG_SOUND_COMPONENTS[selectedIndex];
    renderSoundHeader(surface, page, component);
    renderParamGrid(surface, page, 14);
    return true;
}
