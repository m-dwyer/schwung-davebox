const OLED_W = 128;
const OLED_H = 64;

export function splitLayoutWords(name) {
    return String(name || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_\-./:]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

export function compactLayoutValue(value, maxLen) {
    value = String(value == null || value === '' ? '--' : value);
    maxLen = maxLen | 0;
    if (value.length <= maxLen) return value;
    if (value.indexOf('/') >= 0) return truncLayoutText(value.replace(/\.0+$/, ''), maxLen);
    const n = parseFloat(value);
    if (Number.isFinite(n)) {
        const rounded = Math.abs(n) >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
        if (rounded.length <= maxLen) return rounded;
    }
    return truncLayoutText(value, maxLen);
}

export function compactLayoutLabel(name, maxLen) {
    const words = splitLayoutWords(name);
    name = words.join(' ');
    maxLen = maxLen | 0;
    if (!name) return '--'.slice(0, maxLen);
    const known = knownLayoutAbbreviation(words, maxLen);
    if (known) return known;
    if (name.length <= maxLen) return name;
    if (words.length > 1) {
        const last = words[words.length - 1];
        if (/^\d+$/.test(last)) {
            const numbered = words[0].charAt(0).toUpperCase() + last;
            if (numbered.length <= maxLen) return numbered;
        }
        const initials = words.map(function(p) { return p.charAt(0); }).join('').toUpperCase();
        if (initials.length <= maxLen) return initials;
    }
    const compact = name.replace(/[aeiou]/gi, '');
    if (compact.length >= 2) return truncLayoutText(compact, maxLen);
    return truncLayoutText(name, maxLen);
}

export function renderHeaderPill(surface, title, pill, opts) {
    opts = opts || {};
    title = truncLayoutText(title, opts.titleMax || 8);
    pill = '[' + truncLayoutText(pill || 'Empty', opts.pillMax || 10) + ']';
    surface.print(0, 0, title, 1);
    const x = Math.min(opts.maxPillX || 78, title.length * 6 + (opts.gap == null ? 6 : opts.gap));
    if (surface.fill_rect) {
        const w = Math.min(OLED_W - x, pill.length * 6);
        surface.fill_rect(x, 0, w, 9, 1);
        surface.print(x, 1, pill, 0);
    } else {
        surface.print(x, 0, pill, 1);
    }
}

export function renderPageRail(surface, pageIdx, pageCount, opts) {
    opts = opts || {};
    if (pageCount <= 1) return;
    if (!surface.fill_rect) {
        surface.print(opts.fallbackX || 120, opts.fallbackY || 54, String(pageIdx + 1) + '/' + pageCount, 1);
        return;
    }
    const visible = Math.min(pageCount, opts.maxDots || 4);
    const gap = opts.gap == null ? 4 : opts.gap;
    const dotH = opts.dotH || 2;
    const totalH = visible * gap - (gap - dotH);
    const x = opts.x == null ? 124 : opts.x;
    const y = opts.y == null ? Math.max(14, Math.floor((OLED_H - totalH) / 2)) : opts.y;
    for (let i = 0; i < visible; i++) {
        const active = i === Math.min(pageIdx, visible - 1);
        surface.fill_rect(x, y + i * gap, active ? (opts.activeW || 3) : (opts.inactiveW || 1), dotH, 1);
    }
}

export function renderEncoderValueGrid(surface, cells, opts) {
    opts = opts || {};
    const pageIdx = opts.pageIdx || 0;
    const pageCount = opts.pageCount || 1;
    const mode = opts.mode || 'encoder-grid';
    const filtered = cells.filter(Boolean);
    if (!filtered.length) {
        surface.print(opts.emptyX || 0, opts.emptyY || 24, opts.emptyText || 'No mapped params', 1);
        return;
    }
    const useSparse = mode === 'sparse';
    const positions = useSparse
        ? sparseTwoPositions(opts.startY == null ? 18 : opts.startY)
        : grid4x2Positions(opts.startY == null ? 14 : opts.startY);
    const labelMax = opts.labelMax || (useSparse ? 8 : 4);
    const valueMax = opts.valueMax || (useSparse ? 8 : 4);
    for (let i = 0; i < filtered.length && i < positions.length; i++) {
        const cell = filtered[i];
        const pos = positions[i];
        surface.print(pos.x, pos.y, compactLayoutLabel(cell.label, labelMax), 1);
        surface.print(pos.x, pos.y + 8, compactLayoutValue(cell.value, valueMax), 1);
    }
    renderPageRail(surface, pageIdx, pageCount, opts.pageRail || {});
}

function grid4x2Positions(startY) {
    const out = [];
    const startX = 4;
    const colW = 30;
    for (let i = 0; i < 8; i++) {
        out.push({
            x: startX + (i % 4) * colW,
            y: startY + Math.floor(i / 4) * 22
        });
    }
    return out;
}

function sparseTwoPositions(startY) {
    return [
        { x: 4, y: startY },
        { x: 64, y: startY }
    ];
}

function knownLayoutAbbreviation(words, maxLen) {
    if (!words.length) return '';
    const key = words.join(' ').toLowerCase();
    const joined = words.join('').toLowerCase();
    const map = {
        attack: 'Atk',
        decay: 'Dec',
        sustain: 'Sus',
        release: 'Rel',
        drive: 'Drv',
        enabled: 'En',
        enable: 'En',
        mix: 'Mix',
        gain: 'Gain',
        tone: 'Tone',
        level: 'Lvl',
        volume: 'Vol',
        feedback: 'Fb',
        rate: 'Rate',
        depth: 'Dep',
        amount: 'Amt',
        cutoff: 'Cut',
        resonance: 'Res',
        'filter env depth': 'Env',
        filterenvdepth: 'Env',
        'stereo width': 'Width',
        stereowidth: 'Width',
        'output level': 'Out',
        outputlevel: 'Out'
    };
    const abbr = map[key] || map[joined] || '';
    return abbr && abbr.length <= maxLen ? abbr : '';
}

function truncLayoutText(v, maxLen) {
    v = String(v || '');
    maxLen = maxLen | 0;
    return v.length > maxLen ? v.slice(0, maxLen) : v;
}
