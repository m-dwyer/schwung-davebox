import { S } from './ui_state.mjs';
import {
    BANKS,
    NOTE_KEYS,
    NUM_TRACKS,
    PAD_MODE_DRUM,
    SCALE_DISPLAY,
    SCENE_LETTERS
} from './ui_constants.mjs';

export function renderDrumTrackIdleView(deps) {
    const t         = S.activeTrack;
    const lane      = S.activeDrumLane[t];
    const pg        = S.drumLanePage[t];
    const note      = S.drumLaneNote[t][lane];
    const oct       = Math.floor(note / 12) - 2;
    const name      = NOTE_KEYS[note % 12];
    const bankGroup = pg === 0 ? 'Bank: A' : 'Bank: B';
    const bankName  = S.activeBank === 0 ? 'DRUM LANE' : S.activeBank === 1 ? 'NOTE FX' : S.activeBank === 5 ? 'REPEAT GROOVE' : S.activeBank === 6 ? BANKS[6].name : S.activeBank === 7 ? 'ALL LANES' : BANKS[S.activeBank] ? BANKS[S.activeBank].name : '?';
    (S.activeBank === 5 || S.activeBank === 6 ? deps.drawBankHeadingInverted : deps.drawBankHeading)(bankName, false);
    deps.pixelPrint(4, 10, bankGroup + '  Pad: ' + name + oct + ' (' + note + ')', 1);
    const laneBit = 1 << lane;
    if (S.drumLaneSolo[t] & laneBit) {
        deps.pixelPrint(128 - 4 - 6 * 6, 21, 'SOLOED', 1);
    } else if (S.drumLaneMute[t] & laneBit) {
        if (Math.floor(S.tickCount / 50) % 2 === 0)
            deps.pixelPrint(128 - 4 - 5 * 6, 21, 'MUTED', 1);
    }
    deps.drawMetroIndicator();
    deps.drawTrackRow(34);
    renderActiveClipLetters(deps);
    deps.drawDrumPositionBar(t);
}

export function renderMelodicTrackIdleView(deps) {
    const recTag  = (S.recordArmed && !S.recordCountingIn && S.recordArmedTrack === S.activeTrack)
        ? ' REC' : '';
    const oct     = S.trackOctave[S.activeTrack];
    const octStr  = 'Oct:' + (oct >= 0 ? '+' : '') + oct;
    const keyScl  = NOTE_KEYS[S.padKey] + ' ' + (SCALE_DISPLAY[S.padScale] || '?');
    const CHAR_W  = 6;
    const keySclX = 128 - 4 - keyScl.length * CHAR_W;
    (S.activeBank === 5 || S.activeBank === 6 ? deps.drawBankHeadingInverted : deps.drawBankHeading)(BANKS[S.activeBank].name + recTag, false);
    deps.pixelPrint(4, 10, octStr, 1);
    if (S.bankParams[S.activeTrack][5][0]) {
        if (S.bankParams[S.activeTrack][5][7]) {
            deps.fill_rect(51, 9, 19, 7, 1);
            deps.pixelPrint(52, 10, 'Arp', 0);
        } else {
            deps.pixelPrint(52, 10, 'Arp', 1);
        }
    }
    deps.pixelPrint(keySclX, 10, keyScl, 1);
    if (S.scaleAware) deps.fill_rect(keySclX, 15, keyScl.length * CHAR_W, 1, 1);
    deps.drawMetroIndicator();
    deps.drawTrackRow(34);
    renderActiveClipLetters(deps);
    deps.drawPositionBar(S.activeTrack);
}

function renderActiveClipLetters(deps) {
    for (let t = 0; t < NUM_TRACKS; t++) {
        const cx = t * 16 + 5;
        const ac = S.trackActiveClip[t];
        const hasData = S.trackPadMode[t] === PAD_MODE_DRUM
            ? S.drumClipNonEmpty[t][ac]
            : S.clipNonEmpty[t][ac];
        const isActive = (S.trackClipPlaying[t] || S.trackWillRelaunch[t] || (S.trackQueuedClip[t] >= 0)) && hasData;
        if (isActive) {
            deps.fill_rect(cx - 1, 45, 9, 7, 1);
            deps.pixelPrint(cx, 46, SCENE_LETTERS[ac], 0);
        } else {
            deps.pixelPrint(cx, 46, SCENE_LETTERS[ac], 1);
        }
    }
}
