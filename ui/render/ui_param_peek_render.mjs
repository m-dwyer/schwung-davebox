import { paramPeekInfo } from '../core/ui_motion.mjs';

export function renderParamPeek(deps) {
    const p = paramPeekInfo();
    deps.fill_rect(0, 0, 128, 9, 1);
    deps.print(4, 1, truncText(p.header, 20), 0);
    deps.print(4, 13, truncText(p.target, 20), 1);
    deps.print(4, 25, truncText(p.value, 20), 1);
    deps.print(4, 38, truncText(p.detail, 20), 1);
    deps.print(4, 52, truncText(p.route, 20), 1);
}

function truncText(s, maxLen) {
    s = String(s || '');
    return s.length > maxLen ? s.substring(0, Math.max(0, maxLen - 1)) + '.' : s;
}
