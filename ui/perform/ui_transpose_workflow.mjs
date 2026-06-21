import { queueTransposeApplyOperation } from './ui_transpose_dsp_operations.mjs';

export function anyMelodicClipHasContentImpl(S, deps) {
    for (let t = 0; t < deps.numTracks; t++) {
        if (S.trackPadMode[t] === deps.padModeDrum) continue;
        for (let c = 0; c < deps.numClips; c++) if (S.clipNonEmpty[t][c]) return true;
    }
    return false;
}

export function xposePreviewSetImpl(S, deps, candK, candS) {
    if (candK === S.padKey && candS === S.padScale) { xposeCancelPreviewImpl(S, deps); return; }
    S.xposePrevKey = candK; S.xposePrevScale = candS;
    deps.computePadNoteMap();   /* relayout pads to candidate (also pushes padmap) */
    if (typeof deps.setParam === 'function')
        deps.setParam('t0_xpose_prev',
            S.padKey + ' ' + S.padScale + ' ' + candK + ' ' + candS);
    S.screenDirty = true;
}

export function xposeCancelPreviewImpl(S, deps) {
    if (S.xposePrevKey === null && S.xposePrevScale === null) return;
    S.xposePrevKey = null; S.xposePrevScale = null;
    queueTransposeApplyOperation(S, S.padKey, S.padScale, S.padKey, S.padScale, 0);
    deps.computePadNoteMap();
    S.screenDirty = true;
}

export function xposeCommitImpl(S, deps, candK, candS) {
    queueTransposeApplyOperation(S, S.padKey, S.padScale, candK, candS, 1);
    S.padKey = candK; S.padScale = candS;
    S.xposePrevKey = null; S.xposePrevScale = null;
    deps.computePadNoteMap();
    deps.forceRedraw();
    S.screenDirty = true;
}
