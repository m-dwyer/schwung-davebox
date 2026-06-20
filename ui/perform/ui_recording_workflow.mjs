/**
 * Live-note recording sub-state, owned by the Recording Workflow concept
 * (held on the dedicated workflowState, not on `S`). Relocated here from
 * ui_live_note_workflow.mjs: it always belonged to this concept, and keeping it
 * here cuts the recording->live-note import edge so drum-recording producers
 * (incl. pad-surface, which live-note imports) can delegate to this module
 * without a no-circular violation.
 *
 * @typedef {Object} LiveNoteRecordingState
 * @property {Map<number, number>} recordingNoteTrack  pitch -> record realtime tick
 * @property {Map<number, { track: number, recording: boolean }>} extHeldNotes  external-MIDI held notes
 */

/** @returns {LiveNoteRecordingState} */
export function createLiveNoteRecordingState() {
    return {
        recordingNoteTrack: new Map(),
        extHeldNotes: new Map()
    };
}

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

/* Recording-gate predicates. These name the recording concept's truth table so
 * handler modules stop open-coding `S.recordArmed && !S.recordCountingIn && …`.
 * Three deliberate variants exist; keep them distinct (see recording-predicates
 * test for the pinned truth table):
 *   - isActivelyRecordingTrack: armed, PAST count-in, t is the armed track. The
 *     canonical "this event records onto t" gate.
 *   - isArmedForTrack: armed for t INCLUDING count-in — pad capture accumulates
 *     pre-roll while the count-in is still running.
 *   - isActivelyRecording: armed and past count-in, ANY track — the tick flush
 *     gate and count-in-flash gate, which don't care which track is armed. */

/**
 * @param {import('../types').State} S
 * @param {number} t
 * @returns {boolean}
 */
export function isActivelyRecordingTrack(S, t) {
    return S.recordArmed && !S.recordCountingIn && S.recordArmedTrack === t;
}

/**
 * @param {import('../types').State} S
 * @param {number} t
 * @returns {boolean}
 */
export function isArmedForTrack(S, t) {
    return S.recordArmed && S.recordArmedTrack === t;
}

/**
 * @param {import('../types').State} S
 * @returns {boolean}
 */
export function isActivelyRecording(S) {
    return S.recordArmed && !S.recordCountingIn;
}

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

/* Drum recording capture: enqueue a note-on/off onto the dedicated queues
 * (RecordingWorkflowState.drumRecNoteOns/Offs) the tick drain flushes into one
 * coalesced per-track set_param. The element shape is the queue contract — keep
 * it here, paired with the drain that reads `laneNote`/`vel`. Producers pass
 * just their queue (interface segregation), not the whole workflowState. */

/**
 * @param {import('../types').State} S
 * @param {any[]} drumRecNoteOns  the RecordingWorkflowState.drumRecNoteOns queue
 * @param {number} track
 * @param {number} laneNote
 * @param {number} vel
 * @param {number} lane  drum-lane index to repaint after capture, or <0 to skip
 *                       (external MIDI may receive a note mapping to no lane)
 */
export function enqueueDrumRecNoteOn(S, drumRecNoteOns, track, laneNote, vel, lane) {
    drumRecNoteOns.push({ track: track, laneNote: laneNote, vel: vel });
    if (lane >= 0) {
        S.pendingDrumLaneResync      = 3;
        S.pendingDrumLaneResyncTrack = track;
        S.pendingDrumLaneResyncLane  = lane;
    }
}

/**
 * @param {any[]} drumRecNoteOffs  the RecordingWorkflowState.drumRecNoteOffs queue
 * @param {number} track
 * @param {number} laneNote
 */
export function enqueueDrumRecNoteOff(drumRecNoteOffs, track, laneNote) {
    drumRecNoteOffs.push({ track: track, laneNote: laneNote });
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
