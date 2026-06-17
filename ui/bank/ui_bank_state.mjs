import { PAD_MODE_DRUM } from '../core/ui_constants.mjs';

/* True when (track-type, bank) exposes alt params reachable via S.altMode.
 * Melodic banks 4/5 use stepIntervalMode for indicator state, but still expose
 * the alt-arrow affordance. */
export function bankHasAltParamsImpl(S, t, bank) {
    if (S.trackPadMode[t] === PAD_MODE_DRUM) return bank === 0 || bank === 5 || bank === 7;
    return bank === 0 || bank === 1 || bank === 3 || bank === 4 || bank === 5 || bank === 6;
}

/* Returns true when the current bank's alt indicator should flash. For melodic
 * SEQ ARP / ARP IN this is the Arp Steps overlay flag; for every other alt-param
 * bank it is altMode. */
export function altIndicatorActiveImpl(S, t, bank) {
    if (S.trackPadMode[t] !== PAD_MODE_DRUM && (bank === 4 || bank === 5)) {
        return S.stepIntervalMode;
    }
    return S.altMode;
}

/* CC-knob acceleration. Mutates S.knobAccel* exactly like the original ui.js
 * helper; Date.now remains the time source so host behavior stays unchanged. */
export function ccKnobDeltaImpl(S, d2, k) {
    const sign = (d2 >= 1 && d2 <= 63) ? 1 : (d2 >= 65 && d2 <= 127) ? -1 : 0;
    if (!sign) return 0;
    const now = Date.now();
    const gap = now - (S.knobAccelLast[k] || 0);
    S.knobAccelLast[k] = now;
    if (sign !== S.knobAccelDir[k] || gap > 180) { S.knobAccelRun[k] = 0; S.knobAccelAcc[k] = 0; }
    S.knobAccelDir[k] = sign;
    S.knobAccelRun[k]++;
    const run  = S.knobAccelRun[k];
    const gain = run <= 12 ? 1 : run <= 24 ? 2 : run <= 36 ? 4 : 6;
    const BASE = 3;
    S.knobAccelAcc[k] += gain;
    const units = Math.floor(S.knobAccelAcc[k] / BASE);
    if (units === 0) return 0;
    S.knobAccelAcc[k] -= units * BASE;
    return sign * units;
}
