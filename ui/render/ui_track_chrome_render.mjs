import { S } from '../core/ui_state.mjs';
import {
    NUM_TRACKS,
    PAD_MODE_DRUM,
    fmtVelOverride
} from '../core/ui_constants.mjs';

export function renderMetroIndicator(deps) {
    const METRO_LABELS = [null, 'Count', 'Rec', 'Rec/Ply'];
    const label = METRO_LABELS[S.metronomeOn];
    if (label) {
        const tx = 8;
        const tw = label.length * 6;
        deps.fill_rect(4, 22, 2, 2, 1);
        deps.print(tx, 21, label, 1);
        deps.fill_rect(tx + tw + 2, 22, 2, 2, 1);
    }

    if (!S.sessionView) {
        const t  = S.activeTrack;
        const ac = (!S.playing && S.trackQueuedClip[t] >= 0) ? S.trackQueuedClip[t] : S.trackActiveClip[t];
        const isDrum = S.trackPadMode[t] === PAD_MODE_DRUM;
        const isEmpty = isDrum ? !S.drumClipNonEmpty[t][ac] : !S.clipNonEmpty[t][ac];
        const manualLength = isDrum ? S.drumLaneLengthManuallySet[t] : S.clipLengthManuallySet[t][ac];
        deps.print(67, 21, fmtVelOverride(S.trackVelOverride[t]), 1);
        deps.print(isEmpty && !manualLength ? 103 : 109, 21, isEmpty && !manualLength ? 'Adap' : 'Fix', 1);
    }
}

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
