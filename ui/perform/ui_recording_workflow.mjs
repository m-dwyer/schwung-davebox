import {
    createLiveNoteRecordingState
} from './ui_live_note_workflow.mjs';

/** @typedef {import('./ui_live_note_workflow.mjs').LiveNoteRecordingState} LiveNoteRecordingState */

/**
 * The Recording Workflow's dedicated state object (kept off `S` — the shape the
 * rest of `S`'s concepts are migrating toward).
 *
 * @typedef {Object} RecordingWorkflowState
 * @property {LiveNoteRecordingState} liveNoteRecordingState
 * @property {any[]} drumRecNoteOns   TODO: queued drum note-on descriptor
 * @property {any[]} drumRecNoteOffs
 */

/**
 * Host slice this module needs (Interface Segregation). The composition root in
 * ui.js structurally satisfies this; `State` is the shared contract (ui/types).
 *
 * @typedef {Object} RecordingDeps
 * @property {number} padModeDrum
 * @property {number} moveRec        REC button CC
 * @property {number} ledOff         "LED off" colour constant
 * @property {(key: string, val: string) => void} setParam
 * @property {(cc: number, color: number) => void} setButtonLED
 */

/** @returns {RecordingWorkflowState} */
export function createRecordingWorkflowState() {
    return {
        liveNoteRecordingState: createLiveNoteRecordingState(),
        drumRecNoteOns: [],
        drumRecNoteOffs: []
    };
}

/**
 * @param {import('../types').State} S
 * @param {RecordingWorkflowState} workflowState
 */
export function clearRecordingNoteBuffers(S, workflowState) {
    workflowState.liveNoteRecordingState.recordingNoteTrack.clear();
    S._recNoteOns.length = 0;
    S._recNoteOffs.length = 0;
    workflowState.drumRecNoteOns.length = 0;
    workflowState.drumRecNoteOffs.length = 0;
}

/** @param {import('../types').State} S */
export function clearPendingPrerollRecording(S) {
    S.pendingPrerollNote = null;
    S.pendingPrerollNotes = [];
    S.pendingPrerollToggleQueue = [];
    S.pendingPrerollGate = null;
}

/* Disarm real-time recording: clear DSP flag (triggers deferred save), update LED. */
/**
 * @param {import('../types').State} S
 * @param {RecordingWorkflowState} workflowState
 * @param {RecordingDeps} deps
 */
export function disarmRecordImpl(S, workflowState, deps) {
    if (!S.recordArmed) return;
    const t = S.recordArmedTrack;
    const _wasCountingIn = S.recordCountingIn;
    S.recordArmed = false;
    S.recordPendingPage = false;
    S.recordCountingIn = false;
    S.recordArmedTrack = -1;
    S.countInStartTick = -1;
    S.countInQuarterTicks = 0;
    clearRecordingNoteBuffers(S, workflowState);
    clearPendingPrerollRecording(S);
    if (t >= 0) {
        const _dat = S.trackActiveClip[t];
        S.clipAdaptiveMode[t][_dat] = false;
        if (S.trackPadMode[t] === deps.padModeDrum) {
            S.pendingDrumResync = 2;
            S.pendingDrumResyncTrack = t;
        }
    }
    S.recordScheduledStop = false;
    S.recordScheduledStopTarget = -1;
    S.pendingScheduledDisarm = false;
    if (typeof deps.setParam === 'function') {
        if (_wasCountingIn) {
            /* Count-in active: only cancel is needed; sending _recording 0 would coalesce it away */
            deps.setParam('record_count_in_cancel', '1');
        } else {
            if (t >= 0) deps.setParam('t' + t + '_recording', '0');
        }
    }
    deps.setButtonLED(deps.moveRec, deps.ledOff);
}

/* Move recording to a different track while staying armed. No-op if not actively recording. */
/**
 * @param {import('../types').State} S
 * @param {RecordingWorkflowState} workflowState
 * @param {RecordingDeps} deps
 * @param {number} newTrack
 */
export function handoffRecordingToTrackImpl(S, workflowState, deps, newTrack) {
    if (!S.recordArmed || S.recordCountingIn || newTrack === S.recordArmedTrack) return;
    const old = S.recordArmedTrack;
    workflowState.liveNoteRecordingState.recordingNoteTrack.clear();
    S.recordArmedTrack = newTrack;
    if (typeof deps.setParam === 'function') {
        if (old >= 0) deps.setParam('t' + old + '_recording', '0');
        deps.setParam('t' + newTrack + '_recording', '1');
    }
}
