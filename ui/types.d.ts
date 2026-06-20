/**
 * Overture UI Runtime — shared type surface.
 *
 * This is an ambient declaration file: it is read by `tsc` for type-checking
 * only and is NEVER bundled (esbuild ignores `.d.ts`). Nothing here ships to the
 * QuickJS runtime on the Move.
 *
 * Goal: give the 250-field `S` state bag (ui/core/ui_state.mjs) and the per-module
 * `deps` callback bags an explicit, checkable shape — without moving any field at
 * runtime. `State` is composed from concept sub-interfaces named after CONTEXT.md
 * runtime concepts (DSP Mirror, Pad Surface, Recording Workflow, ...). When a
 * concept later earns its own sub-object on `S` (e.g. `S.recording`), its
 * sub-interface is already carved out here, so the split is a rename, not a
 * re-discovery.
 *
 * Fidelity is intentionally a first pass: structured/nullable fields are typed
 * `any` with a TODO until their owning module opts into checking and the shape is
 * pinned. Boundaries between sub-interfaces are provisional and refined as modules
 * join `tsconfig.json`'s `include` list — that refinement IS the boy-scout work.
 */

// ===========================================================================
// State — composed from concept sub-interfaces (see ui/CONTEXT.md vocabulary).
// ===========================================================================

/** The single shared mutable UI Runtime state bag (`S`). */
export interface State
  extends TransportGlobalState,
    ModifierState,
    PerfState,
    LoopGestureState,
    PadSurfaceState,
    ClipMirror,
    DrumState,
    DrumRepeatState,
    ArpState,
    AllLanesState,
    CcAutomationState,
    BankInputState,
    StepEditState,
    SeqPlaybackState,
    TrackConfigState,
    SessionViewState,
    CoRunState,
    RecordingState,
    ModalState,
    RenderState,
    PersistenceLifecycleState,
    DeferredQueueState,
    TickMemoState {}

/** Global transport, clock, and metronome mirror. */
export interface TransportGlobalState {
  swingAmt: number;
  swingRes: number;
  inpQuant: boolean;
  midiInChannel: number;
  beatMarkersEnabled: boolean;
  launchQuant: number;
  scaleAware: number;
  playing: boolean;
  playingPrev: boolean;
  masterPos: number;
  tickCount: number;
  transportStartTick: number;
  dspLooperState: number;
  flashEighth: boolean;
  flashSixteenth: boolean;
  metronomeOn: number;
  metronomeOnLast: number;
  metronomeVol: number;
  metroPrevBeat: number;
  metroNoteOffTick: number;
}

/** Held-modifier surface: which buttons are down and whether they acted as a modifier. */
export interface ModifierState {
  shiftHeld: boolean;
  shiftTrackLEDActive: boolean;
  altMode: boolean;
  _altPrevBank: number;
  _altPrevTrack: number;
  _altBlinkPhase: number;
  loopHeld: boolean;
  deleteHeld: boolean;
  muteHeld: boolean;
  muteUsedAsModifier: boolean;
  captureHeld: boolean;
  captureUsedAsModifier: boolean;
  copyHeld: boolean;
  copySrc: any; // TODO: { kind, ... } copy source descriptor
  sampleHeld: boolean;
  sampleUsedAsModifier: boolean;
}

/** Performance-mode mods, presets, and looper stack. */
export interface PerfState {
  perfSync: boolean;
  perfStack: any[];
  perfStickyLengths: Set<number>;
  perfHoldPadHeld: boolean;
  perfModsToggled: number;
  perfModsHeld: number;
  perfLatchMode: boolean;
  perfLatchPressedTick: number;
  perfSnapshots: number[];
  perfRecalledSlot: number;
  perfModPopupName: string;
  perfModPopupEndTick: number;
  perfViewLocked: boolean;
}

/** Loop-held A/B window gesture state. */
export interface LoopGestureState {
  loopJogActive: boolean;
  loopPressTick: number;
  loopLastTapEndTick: number;
  loopGestureStart: number;
  loopGestureFired: boolean;
  loopTapUnlatchTrack: number;
  loopGestureCtx: number;
  loopGestureTrack: number;
  loopGestureClip: number;
  loopGestureLane: number;
}

/** Pad Surface: note mapping and live-note tracking for performance input. */
export interface PadSurfaceState {
  padKey: number;
  padScale: number;
  padOctave: number[];
  padNoteMap: number[];
  padScaleSet: Set<number>;
  padLayoutChromatic: boolean[];
  lastPlayedNote: number;
  lastPadVelocity: number;
  liveActiveNotes: Set<number>;
}

/** DSP Mirror — per-clip melodic step/length/loop state. */
export interface ClipMirror {
  clipSteps: number[][][];
  clipNonEmpty: boolean[][];
  clipLength: number[][];
  clipLoopStart: number[][];
  clipTPS: number[][];
  clipPlaybackDir: number[][];
  clipPlaybackAudioReverse: number[][];
  clipSeqFollow: boolean[][];
  clipAdaptiveMode: boolean[][];
  clipLengthManuallySet: boolean[][];
  drumClipNonEmpty: boolean[][];
  trackActiveClip: number[];
  lastDspActiveClip: number[];
  trackQueuedClip: number[];
}

/** DSP Mirror — per-track Drum Lane state. */
export interface DrumState {
  drumLanePlaybackDir: number[][];
  drumLanePlaybackAudioReverse: number[][];
  activeDrumLane: number[];
  drumLanePage: number[];
  drumLaneSteps: string[][][];
  drumLaneHasNotes: boolean[][];
  drumLaneNote: number[][];
  drumLastVelZone: number[];
  drumVelZoneArmed: boolean[];
  drumLaneLength: number[];
  drumLaneLoopStart: number[];
  drumLaneTPS: number[];
  drumLaneEuclidN: number[][];
  drumStepPage: number[];
  drumCurrentStep: number[];
  drumLaneFlashTick: number[][];
  drumLaneMute: number[];
  drumLaneSolo: number[];
  drumLaneQnt: number[];
  drumLaneLenMode: number[][];
  drumLaneLengthManuallySet: boolean[];
  drumPerformMode: number[];
  drumInpQuant: number[];
  trackCurrentStep: number[];
  trackCurrentPage: number[];
}

/** Drum Repeat Workflow + Repeat Groove mirrors (Rpt1/Rpt2). */
export interface DrumRepeatState {
  drumRepeatHeldPad: number[];
  drumRepeatHeldPadVel: number[];
  drumRepeatHeldPadsStack: number[][];
  drumRepeatLatched: boolean[];
  pendingRepeatLane: number;
  pendingRepeatLaneTrack: number;
  drumRepeat2HeldLanes: Set<number>[];
  drumRepeat2LatchedLanes: Set<number>[];
  drumRepeat2RatePerLane: number[][];
  rpt2LoopPadUsed: boolean;
  drumRepeatGate: number[][];
  drumRepeatGateLen: number[][];
  drumRepeatVelScale: number[][][];
  drumRepeatNudge: number[][][];
}

/** SEQ ARP (per-clip) + TARP (per-track) step pattern state. */
export interface ArpState {
  seqArpStepVel: number[][][];
  tarpStepVel: number[][];
  seqArpStepInt: number[][][];
  tarpStepInt: number[][];
  seqArpStepLoopLen: number[][];
  tarpStepLoopLen: number[];
  stepIntervalMode: boolean;
  tarpHeldNotes: Set<number>[];
  lastTarpStyle: number[];
  noteFXRandomMode: number[];
  midiDlyRandomMode: number[];
}

/** ALL LANES bank transient reset bookkeeping. */
export interface AllLanesState {
  allLanesQntResetTick: number;
  allLanesQntResetTrack: number;
  allLanesResResetTick: number;
  allLanesResResetTrack: number;
  allLanesDirResetTick: number;
  allLanesDirResetTrack: number;
  allLanesConfirmed: boolean;
}

/** CC automation lanes, knob acceleration, and gradient render cache. */
export interface CcAutomationState {
  trackCCAssign: number[][];
  trackCCType: number[][];
  schLabel: (string | null)[][];
  schLabelFetchLane: number;
  clipCCVal: number[][][];
  trackCCAutoBits: number[][];
  clipAtHas: boolean[][];
  trackCCLiveVal: number[][];
  ccActiveLane: number[];
  ccLaneLoopStart: number[][][];
  ccLaneLength: number[][][];
  ccLaneTps: number[][][];
  ccLaneResTps: number[][][];
  knobAccelLast: number[];
  knobAccelDir: number[];
  knobAccelRun: number[];
  knobAccelAcc: number[];
  pendingCCBitsRefresh: number;
  ccGradVals: number[];
  ccGradHasBP: boolean[];
  ccGradKey: string;
  ccGraphOvData: any[];
  ccGraphOvKey: string;
  ccGradPaletteTrack: number;
}

/** Parameter Bank selection + knob input bookkeeping. */
export interface BankInputState {
  activeBank: number;
  trackActiveBank: number[];
  bankParams: number[][][] | null;
  pendingBankRefresh: number;
  knobTouched: number;
  knobAccum: number[];
  knobLastDir: number[];
  knobLocked: boolean[];
  knobTurnedTick: number[];
  knobTouchStartTick: number;
  bankSelectTick: number;
  jogTouched: boolean;
  clockShiftTouchDelta: number;
}

/** Step-edit overlay (held step) write buffers. */
export interface StepEditState {
  heldStepBtn: number;
  heldStep: number;
  heldStepNotes: number[];
  stepWasEmpty: boolean;
  stepWasHeld: boolean;
  stepEditVel: number;
  stepEditGate: number;
  stepEditNudge: number;
  stepEditIter: number;
  stepEditRand: number;
  stepEditRatch: number;
  ccStepEditVal: number[];
  ccStepEditSet: boolean[];
  ccStepEditComputed: number[];
  ccStepEditActive: boolean;
  stepBtnPressedTick: number[];
  stepOpTick: number;
}

/** Live sequencer playback note tracking. */
export interface SeqPlaybackState {
  seqActiveNotes: Set<number>;
  seqLastStep: number;
  seqLastClip: number;
  seqNoteOnClipTick: number;
  seqNoteGateTicks: number;
}

/** Per-track configuration mirror + active track. */
export interface TrackConfigState {
  activeTrack: number;
  trackChannel: number[];
  trackRoute: number[];
  trackPadMode: number[];
  trackVelOverride: number[];
  trackLooper: number[];
  trackAtMode: number[];
  atLastSent: number[];
  trackClipPlaying: boolean[];
  trackWillRelaunch: boolean[];
  trackPendingPageStop: boolean[];
  trackOctave: number[];
  trackMuted: boolean[];
  trackSoloed: boolean[];
}

/** Session View: clip grid, scene rows, snapshots, side-button reveal. */
export interface SessionViewState {
  sessionView: boolean;
  sessionViewMomentary: boolean;
  _lastSessionView: boolean;
  sceneRow: number;
  sceneBtnFlashTick: number[];
  sideHeldBtn: number;
  sideBtnPressedTick: number;
  revealClipsTrack: number;
  cachedSceneAllPlaying: boolean[];
  cachedSceneAllQueued: boolean[];
  cachedSceneAnyPlaying: boolean[];
  snapshots: any[]; // TODO: mute-snapshot slot shape
  sessionStepHeld: number;
  sessionStepHeldCtx: number;
  stepSaveFlashStartTick: number;
  stepSaveFlashEndTick: number;
  noteSessionPressedTick: number;
  sessionOverlayHeld: boolean;
  overviewCache: any;
  dspMergeState: number;
  dspMergeDstClip: number;
  dspMergeTrack: number;
  pendingMergeArm: boolean;
  pendingMergePlacement: boolean;
  pendingSceneBakePicker: boolean;
}

/** Move Co-Run: ceding hardware to Move/Schwung while preserving return state. */
export interface CoRunState {
  schwungCoRunSlot: number;
  _coRunChanSlots: number;
  pendingEditSoundEntry: any; // TODO: { track, route, slot, delay }
  moveCoRunTrack: number;
  moveCoRunDrumHeld: number;
  _moveCoRunTrackLedsActive: boolean;
  pendingEditEntryTrack: number;
}

/** Recording Workflow: arm/count-in/note-queue/scheduled-stop state. */
export interface RecordingState {
  recordArmed: boolean;
  recordPendingPage: boolean;
  recordCountingIn: boolean;
  recordArmedTrack: number;
  countInStartTick: number;
  countInBeatStartTick: number;
  countInQuarterTicks: number;
  countInDspPrev: boolean;
  _recNoteOns: any[]; // TODO: queued note-on descriptor
  _recNoteOffs: any[];
  recordBpm: number;
  recordScheduledStop: boolean;
  recordScheduledStopTarget: number;
  pendingScheduledDisarm: boolean;
  pendingPrerollNote: any; // TODO: { track, lane, laneNote, vel, ... }
  pendingPrerollNotes: any[];
  pendingPrerollToggleQueue: any[];
  pendingPrerollGate: any;
  recordBlockedDialog: boolean;
  recordBlockedDialogSel: number;
}

/** Modal/dialog workflow state (confirms, pickers, menus, tap tempo). */
export interface ModalState {
  confirmLgto: boolean;
  confirmLgtoSel: number;
  confirmLgtoIsDrum: boolean;
  globalMenuOpen: boolean;
  globalMenuItems: any;
  globalMenuState: any;
  globalMenuStack: any;
  globalMenuBuiltForTrack: number;
  routeCheckOpen: boolean;
  routeCheckSelected: number;
  bpmWasEditing: boolean;
  lastSentMenuEditValue: any;
  confirmClearSession: boolean;
  confirmSaveState: boolean;
  confirmStateWipe: boolean;
  confirmStateWipeSel: number;
  confirmConvertToDrum: boolean;
  confirmConvertToDrumSel: number;
  confirmConvertTrack: number;
  pendingTrackConvert: any;
  confirmBake: boolean;
  confirmBakeSel: number;
  confirmBakeIsDrum: boolean;
  confirmBakeTrack: number;
  confirmBakeClip: number;
  confirmBakeDrumLoopOpen: boolean;
  confirmBakeDrumLoopSel: number;
  confirmBakeDrumMode: number;
  confirmBakeScene: boolean;
  confirmBakeSceneSel: number;
  confirmBakeSceneClip: number;
  confirmBakeSceneWrapPhase: boolean;
  confirmBakeSceneWrapSel: number;
  confirmBakeSceneLoops: number;
  xposePrevKey: any;
  xposePrevScale: any;
  confirmXpose: boolean;
  confirmXposeSel: number;
  confirmXposeKey: number;
  confirmXposeScale: number;
  tapTempoOpen: boolean;
  tapTempoTapTimes: number[];
  tapTempoBpm: number;
  tapTempoFlashTick: number;
  tapTempoFlashPad: number;
  confirmClearSel: number;
  confirmSaveSel: number;
  confirmSaveCount: number;
  confirmExport: boolean;
  confirmExportSel: number;
  exportDoneDialog: boolean;
  exportDonePath: string;
  exportDoneMissing: number;
  clearAutoMenu: any; // TODO: { sel, at, cc }
  deleteTapArmed: boolean;
  snapshotPicker: any; // TODO: picker modal shape
  pendingInheritPicker: any;
}

/** Render-side flags, popups, splash, and LED-init queue. */
export interface RenderState {
  screenDirty: boolean;
  lastBlinkOn: any;
  lastSoloBlink: any;
  actionPopupEndTick: number;
  actionPopupLines: string[];
  actionPopupHighlight: number;
  noNoteFlashEndTick: number;
  stretchBlockedEndTick: number;
  ledInitQueue: any[];
  ledInitIndex: number;
  ledInitComplete: boolean;
  _origClearScreen: any;
  bootSplashTicks: number;
  currentSplashIdx: number;
  splashWasVisible: boolean;
}

/** Set load/save lifecycle, UI Sidecar, snapshots, undo/redo availability. */
export interface PersistenceLifecycleState {
  currentSetUuid: string;
  currentSetName: string;
  lastDspInstanceId: string;
  hasInitedOnce: boolean;
  _wasSuspended: boolean;
  pendingSetLoad: boolean;
  pendingDspSync: number;
  stateLoading: boolean;
  pendingSuspendSave: boolean;
  pendingExitAfterSave: boolean;
  pendingHideAfterSave: boolean;
  pendingExport: boolean;
  pendingExportRun: boolean;
  pendingPruneOrphans: boolean;
  nameIndexCache: any;
  pendingSnapshotCopy: any;
  undoAvailable: boolean;
  redoAvailable: boolean;
  undoSeqArpSnapshot: any;
  redoSeqArpSnapshot: any;
}

/** Deferred Queue: tick-drained pending commands and resync flags. */
export interface DeferredQueueState {
  pendingDefaultSetParams: SetParamCmd[];
  clearDrainHold: number;
  pendingStepsReread: number;
  pendingStepsRereadTrack: number;
  pendingStepsRereadClip: number;
  pendingChordToStep: any;
  pendingChordPhase2: any;
  pendingAllLanesStretchCheck: number;
  pendingDrumResync: number;
  pendingDrumResyncTrack: number;
  pendingDrumLaneResync: number;
  pendingDrumLaneResyncTrack: number;
  pendingDrumLaneResyncLane: number;
  pendingPadNoteMapRecompute: boolean;
  pendingUndoSync: number;
  pendingClearLengthTrack: number;
  pendingClearLengthClip: number;
  pendingSceneBakeResync: number;
  pendingSceneBakeClip: number;
}

/** Tick-memo diff guards (cable-2 remap dedupe, session-view edge detect). */
export interface TickMemoState {
  _lastRemapTrack: number;
  _lastRemapRoute: number;
  _lastRemapChannel: number;
  _lastRemapMidiIn: number;
  extMidiRemapActive: boolean;
  delayClockFb: number[];
  delayRetrig: number[];
}

/** A queued DSP set_param command drained from the Tick Pipeline. */
export interface SetParamCmd {
  key: string;
  val: string;
}

// ===========================================================================
// Deps — per-module callback bags assembled by the composition root (ui.js).
// Each workflow module declares the slice it needs. Signatures are a first
// pass; tighten them when ui.js itself is typed and the wiring is pinned.
// ===========================================================================

/** Deps required by ui/view/ui_session_view_workflow.mjs. */
export interface SessionViewDeps {
  numTracks: number;
  padModeDrum: number;
  setParam(key: string, val: string): void;
  forceRedraw(): void;
  invalidateLEDCache(): void;
  showActionPopup(line1: string, line2?: string): void;
  sendPerfMods(): void;
  switchActiveTrack(track: number): void;
  setTrackMute(track: number, on: boolean): void;
  setTrackSolo(track: number, on: boolean): void;
  trackClipHasContent(track: number, clip: number): boolean;
  clipIsEmpty(track: number, clip: number): boolean;
  doShiftStepCommon(idx: number): void;
  handoffRecordingToTrack(track: number): void;
  refreshPerClipBankParams(...args: any[]): void;
  clearClip(...args: any[]): void;
  clearRow(...args: any[]): void;
  copyClip(...args: any[]): void;
  copyRow(...args: any[]): void;
  cutClip(...args: any[]): void;
  cutRow(...args: any[]): void;
  copyDrumClip(...args: any[]): void;
  cutDrumClip(...args: any[]): void;
  hardResetClip(...args: any[]): void;
}
