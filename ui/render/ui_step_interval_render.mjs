import { S } from '../core/ui_state.mjs';
import { col4 } from '../core/ui_constants.mjs';
import { effectiveClip } from './ui_leds.mjs';

export function renderStepIntervalOverlay(deps, bank) {
    const t     = S.activeTrack;
    const isSeq = (bank === 4);
    const arr   = isSeq ? S.seqArpStepInt[t][effectiveClip(t)] : S.tarpStepInt[t];
    deps.drawBankHeading(isSeq ? 'SEQ ARP Steps' : 'ARP IN Steps');
    for (let k = 0; k < 8; k++) {
        const colX = 4 + (k % 4) * 30;
        const rowY = k < 4 ? 12 : 36;
        const hi   = (S.knobTouched === k);
        if (hi) deps.fill_rect(colX, rowY, 24, 24, 1);
        const lbl = 'S' + (k + 1);
        const v   = arr[k] | 0;
        const val = (v === 0) ? ' 0' : (v > 0 ? '+' + v : String(v));
        deps.print(colX, rowY,      col4(lbl), hi ? 0 : 1);
        deps.print(colX, rowY + 12, col4(val), hi ? 0 : 1);
    }
}
