import {
    LED_OFF,
    LEDS_PER_FRAME,
    SEQ8_NAV_FLAGS
} from '../core/ui_constants.mjs';

export function clearAllLEDsImpl(deps) {
    let n, c;
    for (n = 68; n <= 99; n++) deps.setLED(n, LED_OFF);
    for (n = 16; n <= 31; n++) deps.setLED(n, LED_OFF);
    for (c = 16; c <= 31; c++) deps.setButtonLED(c, LED_OFF);
    for (c = 40; c <= 43; c++) deps.setButtonLED(c, LED_OFF);
    for (const cc of [49, 50, 51, 52, 54, 55, 56, 58, 60, 62, 63])
        deps.setButtonLED(cc, LED_OFF);
    for (c = 71; c <= 78; c++) deps.setButtonLED(c, LED_OFF);
    for (const cc of [85, 86, 88, 118, 119]) deps.setButtonLED(cc, LED_OFF);
}

export function installFlagsWrapImpl(S, deps) {
    const current = deps.getFlagsFn();
    if (typeof current !== 'function') return;
    if (current._seq8) {
        current._active = true;
        return;
    }
    const orig = current;
    const wrap = function () {
        const f = orig();
        const hit = f & SEQ8_NAV_FLAGS;
        if (hit && wrap._active) {
            S.ledInitComplete = false;
            deps.invalidateLEDCache();
            clearAllLEDsImpl(deps);
            if (typeof deps.clearFlags === 'function') deps.clearFlags(hit);
            return f & ~SEQ8_NAV_FLAGS;
        }
        return f;
    };
    wrap._seq8   = true;
    wrap._orig   = orig;
    wrap._active = true;
    deps.setFlagsFn(wrap);
}

export function removeFlagsWrapImpl(deps) {
    const cur = deps.getFlagsFn();
    if (typeof cur === 'function' && cur._seq8) {
        cur._active = false;
        deps.setFlagsFn(cur._orig);
    }
}

export function buildLedInitQueueImpl() {
    const q = [];
    for (let n = 68; n <= 99; n++) q.push({ kind: 'note', id: n });
    for (let n = 16; n <= 31; n++) q.push({ kind: 'note', id: n });
    for (let c = 16; c <= 31; c++) q.push({ kind: 'cc', id: c });
    for (let c = 40; c <= 43; c++) q.push({ kind: 'cc', id: c });
    for (const c of [49, 50, 51, 52, 54, 55, 56, 58, 60, 62, 63])
        q.push({ kind: 'cc', id: c });
    for (let c = 71; c <= 78; c++) q.push({ kind: 'cc', id: c });
    for (const c of [85, 86, 88, 118, 119]) q.push({ kind: 'cc', id: c });
    return q;
}

export function drainLedInitImpl(S, deps) {
    const end = Math.min(S.ledInitIndex + LEDS_PER_FRAME, S.ledInitQueue.length);
    for (let i = S.ledInitIndex; i < end; i++) {
        const led = S.ledInitQueue[i];
        if (led.kind === 'cc') deps.setButtonLED(led.id, LED_OFF);
        else deps.setLED(led.id, LED_OFF);
    }
    S.ledInitIndex = end;
    if (S.ledInitIndex >= S.ledInitQueue.length) {
        S.ledInitComplete = true;
        /* Custom scratch palette entry for the Loop button's ambient LED —
         * Loop's LED renders palette colors brighter than peers (Delete/Copy
         * idx 16 = dim grey; same idx 16 is invisible on Loop, and 124/DarkGrey
         * on Loop reads as fully bright). Push a low-RGB entry before
         * reapplyPalette so the LED hardware picks up index 60 on the refresh. */
        deps.setPaletteEntryRGB(60, 32, 32, 32);
        deps.reapplyPalette();
    }
}
