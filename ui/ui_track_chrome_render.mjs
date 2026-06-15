import { S } from './ui_state.mjs';
import { NUM_TRACKS } from './ui_constants.mjs';

export function renderTrackRow(deps, y) {
    const soloBlinkOn = Math.floor(S.tickCount / 24) % 2 === 0;
    for (let track = 0; track < NUM_TRACKS; track++) {
        const cx = track * 16 + 5;
        const bx = track * 16 + 3;
        const by = y - 2;
        const bw = 10, bh = 12;
        const isActive = track === S.activeTrack;
        if (S.trackMuted[track]) {
            if (soloBlinkOn) deps.print(cx, y, String(track + 1), 1);
            if (isActive) {
                deps.fill_rect(bx, by,      bw, 1,  1);
                deps.fill_rect(bx, by+bh-1, bw, 1,  1);
                deps.fill_rect(bx, by,      1,  bh, 1);
                deps.fill_rect(bx+bw-1, by, 1,  bh, 1);
            }
        } else if (S.trackSoloed[track]) {
            deps.fill_rect(bx, by, bw, bh, 1);
            deps.print(cx, y, String(track + 1), 0);
        } else {
            deps.print(cx, y, String(track + 1), 1);
            if (isActive) {
                deps.fill_rect(bx, by,      bw, 1,  1);
                deps.fill_rect(bx, by+bh-1, bw, 1,  1);
                deps.fill_rect(bx, by,      1,  bh, 1);
                deps.fill_rect(bx+bw-1, by, 1,  bh, 1);
            }
        }
    }
}
