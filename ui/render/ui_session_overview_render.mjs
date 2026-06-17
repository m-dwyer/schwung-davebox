import { S } from '../core/ui_state.mjs';
import { NUM_CLIPS, NUM_TRACKS } from '../core/ui_constants.mjs';

export function renderSessionOverview(deps) {
    deps.fill_rect(0, 0, 128, 64, 1);
    const bandY = Math.floor(S.sceneRow / 4) * 16;
    deps.fill_rect(0, bandY, 128, 16, 0);

    for (let scene = 0; scene < NUM_CLIPS; scene++) {
        const y = scene * 4;
        deps.fill_rect(0, y, 128, 1, (y >= bandY && y < bandY + 16) ? 1 : 0);
    }

    for (let track = 0; track < NUM_TRACKS; track++) {
        const x = track * 16;
        if (bandY > 0) deps.fill_rect(x, 0, 1, bandY, 0);
        deps.fill_rect(x, bandY, 1, 16, 1);
        if (bandY + 16 < 64) deps.fill_rect(x, bandY + 16, 1, 64 - bandY - 16, 0);
    }

    const blinkOn = S.flashEighth;
    for (let track = 0; track < NUM_TRACKS; track++) {
        const x = track * 16 + 1;
        const activeClip = S.trackActiveClip[track];
        for (let scene = 0; scene < NUM_CLIPS; scene++) {
            const y = scene * 4 + 1;
            const color = (scene >= S.sceneRow && scene < S.sceneRow + 4) ? 1 : 0;
            const hasData = S.clipNonEmpty[track][scene];
            const isActive = scene === activeClip;
            const isPlaying = isActive && S.trackClipPlaying[track];
            if (isPlaying && hasData) {
                if (blinkOn) deps.fill_rect(x + 1, y + 1, 13, 1, color);
            } else if (isActive && hasData) {
                deps.fill_rect(x + 1, y + 1, 13, 1, color);
            } else if (S.overviewCache[track][scene]) {
                deps.fill_rect(x + 6, y + 1, 2, 1, color);
            }
        }
    }
}
