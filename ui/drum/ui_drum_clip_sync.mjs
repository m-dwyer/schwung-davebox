import { DRUM_BASE_NOTE, DRUM_LANES, NUM_CLIPS } from '../core/ui_constants.mjs';

/** Sync one drum lane's step data and length from DSP. */
export function syncDrumLaneStepsImpl(S, deps, t, l) {
    if (!deps.getParam) return;
    const raw = deps.getParam('t' + t + '_l' + l + '_steps');
    if (raw) {
        for (let s = 0; s < 256; s++) S.drumLaneSteps[t][l][s] = raw[s] || '0';
        S.drumLaneHasNotes[t][l] = raw.indexOf('1') >= 0;
    }
    if (l === S.activeDrumLane[t]) {
        const lenRaw = deps.getParam('t' + t + '_l' + l + '_length');
        if (lenRaw !== null) S.drumLaneLength[t] = parseInt(lenRaw, 10) || 16;
        const lsRaw = deps.getParam('t' + t + '_l' + l + '_loop_start');
        if (lsRaw !== null) S.drumLaneLoopStart[t] = parseInt(lsRaw, 10) | 0;
        const lsPage = Math.floor(S.drumLaneLoopStart[t] / 16);
        const winPages = Math.max(1, Math.ceil(S.drumLaneLength[t] / 16));
        if (S.drumStepPage[t] < lsPage) S.drumStepPage[t] = lsPage;
        else if (S.drumStepPage[t] > lsPage + winPages - 1) S.drumStepPage[t] = lsPage + winPages - 1;
        const tpsRaw = deps.getParam('t' + t + '_l' + l + '_tps');
        if (tpsRaw !== null) S.drumLaneTPS[t] = parseInt(tpsRaw, 10) || 24;
    }
}

/** Sync lane notes and hit-presence for all lanes of track t (active clip). */
export function syncDrumLanesMetaImpl(S, deps, t) {
    if (!deps.getParam) return;
    for (let l = 0; l < DRUM_LANES; l++) {
        const noteRaw = deps.getParam('t' + t + '_l' + l + '_lane_note');
        if (noteRaw !== null) S.drumLaneNote[t][l] = parseInt(noteRaw, 10) || (DRUM_BASE_NOTE + l);
        const ncRaw  = deps.getParam('t' + t + '_l' + l + '_note_count');
        S.drumLaneHasNotes[t][l] = ncRaw !== null ? parseInt(ncRaw, 10) > 0 : false;
    }
    const muteRaw = deps.getParam('t' + t + '_drum_lane_mute');
    if (muteRaw !== null) S.drumLaneMute[t] = parseInt(muteRaw, 10) >>> 0;
    const soloRaw = deps.getParam('t' + t + '_drum_lane_solo');
    if (soloRaw !== null) S.drumLaneSolo[t] = parseInt(soloRaw, 10) >>> 0;
}

/** Sync S.drumClipNonEmpty[t] for all clips -- called on track switch and state load. */
export function syncDrumClipContentImpl(S, deps, t) {
    if (!deps.getParam) return;
    for (let c = 0; c < NUM_CLIPS; c++) {
        const raw = deps.getParam('t' + t + '_c' + c + '_drum_has_content');
        S.drumClipNonEmpty[t][c] = raw === '1';
    }
}
