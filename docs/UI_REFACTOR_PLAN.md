# UI Refactor Plan

This plan captures architecture review candidates for continuing the split of
`ui/ui.js`. It is intended to survive context-window resets and let future work
pick up one phase at a time.

## Current Shape

`ui/ui.js` is still the primary orchestration module for the QuickJS UI. It sits
beside extracted modules such as `ui_export.mjs`, `ui_leds.mjs`,
`ui_motion.mjs`, `ui_persistence.mjs`, `ui_routes.mjs`, and
`ui_tick_tasks.mjs`.

The file is large because it owns several hard dAVEBOx invariants:

- `get_param` is only reliable from tick/render contexts, not MIDI callbacks.
- `set_param` and `shadow_send_midi_to_dsp` can coalesce within an audio buffer.
- The UI must keep JS mirrors in sync with DSP state for clips, tracks, drum
  lanes, automation, recording, and set changes.
- Patched Schwung capabilities must be gated at runtime and stock Schwung must
  keep working.
- Suspend/resume, co-run, and state-load paths have ordering constraints.

Splitting should therefore deepen modules by concern and invariant, not only by
line count.

## Candidate Deepening Opportunities

### 1. Tick / DSP Mirror Module

Files:

- `ui/ui.js` around `pollDSP()`
- `ui/ui.js` around `_tickImpl()`
- `ui/ui_tick_tasks.mjs`

Problem:

`pollDSP()` and `_tickImpl()` mix DSP snapshot parsing, pending command drains,
coalescing workarounds, state-load sync, recording flushes, LED timing, menu
preview, suspend/resume, and periodic resync. `ui_tick_tasks.mjs` is a useful
start, but parts of it are still shallow: callers must know ordering and pass a
large deps bag.

Solution:

Deepen this around the dAVEBOx tick pipeline: DSP mirror refresh, pending DSP
writes, deferred resyncs, suspend/save, and periodic UI invalidation.

Benefits:

This concentrates the highest-risk invariants in one place. Tests can exercise
tick phases through a smaller interface instead of building fragile full-UI
scenarios.

Initial phases:

1. Inventory all current tick phases in `_tickImpl()` and classify them as
   input-drain, DSP-write-drain, DSP-read-sync, UI-timeout, persistence, or
   render invalidation.
2. Move pure scheduling helpers and repeated resync code into `ui_tick_tasks.mjs`
   without changing order.
3. Introduce one tick runner module that owns ordering and receives a narrow host
   adapter object.
4. Add focused tests with fake host functions for coalescing-sensitive drains,
   state-load settle, and suspend/save ordering.

### 2. Parameter Bank Module

Files:

- `ui/ui.js` around `readBankParams()`
- `ui/ui.js` around `applyBankParam()`
- `ui/ui.js` around `_onCC_knobs()`
- `ui/ui_constants.mjs`

Problem:

Bank definitions live in constants while bank reads, bank writes, alt-mode
behavior, knob acceleration, drum/melodic special cases, and OLED bank rendering
remain spread through `ui.js`.

Solution:

Move bank semantics by concern: bank model, DSP read/write behavior, knob edit
behavior, and bank display model.

Benefits:

`BANKS` becomes the source of behavior, not just metadata. Tests can cover bank
transitions and DSP key generation without running MIDI handlers.

### 3. Pad Surface / Live Input Module

Files:

- `ui/ui.js` around `computePadNoteMap()`
- `ui/ui.js` around live-note queueing and `liveSendNote()`
- `ui/ui.js` around `_onPadPressTrackView()`
- `ui/ui.js` around pad release handling

Problem:

Pad note mapping, modal pad suppression, patched-Schwung inbound support, live
note batching, drum lane selection, repeat gestures, and recording side effects
are split across many regions. This is where coalescing bugs and wrong-surface
ownership bugs are likely.

Solution:

Deepen a pad surface module that owns pad maps, pad dispatch state, live note
queueing, and drum/melodic pad gesture routing.

Benefits:

Pad ownership rules gain locality. Tests can verify modal suppression, patched
versus stock Schwung behavior, and live-note batching without traversing the
entire MIDI dispatcher.

Initial phases:

1. Extract pad-map construction into a module that updates `S.padNoteMap` and
   returns the DSP padmap payload when patched Schwung is active.
2. Move live-note queueing and draining behind one module-owned queue so the
   duplicate drain paths in `ui.js` can be reconciled.
3. Split drum pad gestures by concern: lane select, lane clear/reset, repeat
   mode, velocity zones, and recording.
4. Add focused tests for modal pad dispatch mute, octave-shifted melodic maps,
   drum velocity-zone sentinels, and same-tick note on/off ordering.

### 4. Track and Clip Sync Module

Files:

- `ui/ui.js` around `restoreUiSidecar()`
- `ui/ui.js` around `syncClipsFromDsp()`
- `ui/ui.js` around `syncClipsTargeted()`
- `ui/ui.js` around `readTrackConfig()`

Problem:

Sidecar restore, full clip sync, targeted undo sync, track config sync, and
track type conversion all manually mutate `S` and know DSP key shapes.

Solution:

Concentrate DSP mirror behavior for tracks, clips, drum lanes, sidecar restore,
and track config in one deeper module.

Benefits:

All workflows that need "JS mirrors DSP now" gain leverage. Tests can validate
sync from fake `get_param` snapshots.

### 5. Screen Router and View Render Modules

Files:

- `ui/ui.js` around `drawUI()`
- `ui_dialogs.mjs`
- `ui_motion.mjs`
- `ui_leds.mjs`

Problem:

`drawUI()` is a priority-ordered screen state machine plus many concrete render
implementations. Some extracted modules are useful, but `drawUI()` still owns too
many display modes and modal priorities.

Solution:

Keep the priority router in one place, but move each view implementation behind
deeper view modules: session overview, track idle, bank overview, step edit,
performance mode, and transient overlays.

Benefits:

Display regressions gain locality. Tests can snapshot view-model or render
command output for one view at a time.

### 6. Modal Workflow Module

Files:

- `ui/ui.js` around `buildGlobalMenuItems()`
- `ui/ui.js` around jog-click modal handling
- `ui/ui.js` around menu open/close helpers

Problem:

Global menu items, confirm dialogs, snapshot picker, inherit picker, bake flows,
transpose preview, and route check state are coupled through `S` and MIDI
handlers. The current seam is mostly "check flags in the right order".

Solution:

Deepen modal workflow ownership: opening, closing, committing, cancelling, and
rendering state for menu/dialog workflows.

Benefits:

One place can enforce Back cancels, jog click commits, preview cancellation, and
tick-only action deferral. Tests can cover workflow transitions without sending
full MIDI CC sequences.

## Recommended Order

Start with candidates 1 and 3.

Candidate 1 should go first because it protects the ordering and coalescing
rules that every later split depends on. Candidate 3 should follow because pad
surface behavior is dense, growing, and directly tied to patched-versus-stock
Schwung compatibility.

## Guardrails

- Preserve runtime behavior first. Prefer small extraction phases with no logic
  changes.
- Keep tick ordering explicit and reviewable.
- Do not introduce a seam unless at least two call paths or tests benefit from it.
- Treat `S` as shared legacy state during early phases; reduce direct access only
  after a module has earned its shape.
- Keep stock Schwung fallbacks intact while patched-Schwung gates remain.
- Run `python3 scripts/bundle_ui.py` after UI module changes.
- For deployed validation, follow `CLAUDE.md`: install JS changes and restart the
  Move stack before reporting behavior done.

## Current Pad Surface Interface

As of 2026-06-15, `ui/ui_pad_surface.mjs` is the module for pad-surface
performance input and padmap state. Its interface currently owns:

- melodic and drum pad-map construction, including DSP padmap payload creation;
- live-note queue construction and enqueue helpers;
- drum pad geometry, velocity-zone conversion, and pad target classification;
- drum lane selection as a surface operation: select active lane, sync steps,
  and refresh lane bank params;
- non-destructive drum performance input: velocity-pad preview, normal lane-pad
  preview/record/pre-roll behavior, and Capture+lane silent selection.

Do not keep adding unrelated pad behavior to this module. These concerns should
stay outside the pad surface interface for now:

- destructive drum lane workflows: Delete+lane clear, Copy/Cut/Paste lane,
  Mute/Solo lane;
- modal/menu/snapshot/session workflows;
- rendering, LED policy, and view priority;
- full tick ordering and DSP mirror drains.

Next likely module: `ui_drum_lane_workflows.mjs` for destructive or workflow-like
drum lane actions. Its first phases should cover Copy/Cut/Paste lane,
Mute/Solo lane, and Delete+lane clear separately, each with focused tests.

## Progress Log

### 2026-06-15

Started Candidate 1 and Candidate 3 on branch `refactor/ui-tick-pad-surface`.

Candidate 1:

- Added focused integration coverage for live-note drain ordering in
  `web/tests/integration/tick-tasks.test.ts`.
- Moved collision-aware live-note draining into `ui_tick_tasks.mjs` as
  `runLiveNoteDrain()`.
- Removed the older simple `_drainLiveNotes()` path from `ui.js`, leaving one
  tick-loop drain.
- Moved deferred drum tap note-off draining into `ui_tick_tasks.mjs` as
  `runDeferredDrumNoteOffDrain()`.
- Moved external MIDI route queue draining into `ui_tick_tasks.mjs` as
  `runExternalRouteQueueDrain()`, preserving the patched-Schwung async-send
  bypass.
- Moved scheduled metro note-off injection into `ui_tick_tasks.mjs` as
  `runMetroNoteOffTask()`.
- Moved patched-Schwung padmap self-heal polling into `ui_tick_tasks.mjs` as
  `runPadMapSelfHealTask()`.

Candidate 3:

- Added focused pad surface tests in `web/tests/integration/pad-surface.test.ts`.
- Added `ui/ui_pad_surface.mjs` for pad-map construction and DSP padmap payload
  creation.
- Updated `computePadNoteMap()` to delegate to the pad surface module while
  preserving the existing local caller interface.
- Added `ui_pad_surface.mjs` to `scripts/bundle_ui.py`.
- Moved live-note queue creation and enqueue helpers into `ui_pad_surface.mjs`,
  while leaving the tick-time drain in `ui_tick_tasks.mjs`.
- Moved drum pad geometry helpers into `ui_pad_surface.mjs` as
  `drumPadToLane()` and `drumPadToVelZone()`.
- Moved drum velocity-zone conversion into `ui_pad_surface.mjs` as
  `drumVelZoneToVelocity()`.
- Added `resolveDrumPadTarget()` to `ui_pad_surface.mjs` so drum pad callers can
  classify lane, velocity-zone, and invalid lane-page targets through one
  interface.
- Moved drum velocity-pad press behavior into `ui_pad_surface.mjs` as
  `handleDrumVelocityPadPress()`, covering live preview, held-step velocity
  writes, and armed-recording resync scheduling.
- Moved normal drum lane-pad press behavior into `ui_pad_surface.mjs` as
  `handleDrumLanePadPress()`, keeping Copy/Mute/Delete workflows in `ui.js`.
- Added a local `createDrumPadPressDeps()` adapter in `ui.js` so drum pad-surface
  behavior calls share one dependency bundle.
- Added `selectDrumLaneSurface()` to centralize lane select/sync/refresh work,
  and moved Capture+drum-lane silent selection into `ui_pad_surface.mjs` as
  `handleCaptureDrumLanePress()`.

Next module:

### Drum lane workflows complete

- Added focused workflow coverage in
  `web/tests/integration/drum-lane-workflows.test.ts`.
- Added `ui/ui_drum_lane_workflows.mjs` for destructive drum lane workflows.
- Moved Delete+drum-lane clear mirror/DSP behavior into
  `handleDeleteDrumLaneClear()`, preserving both legacy call-site variants:
  the early Delete+lane shortcut keeps undo marking and `LANE`/`CLEARED`,
  while the in-line drum-mode branch keeps lane-bank refresh and
  `LANE CLEARED`.
- Added `ui_drum_lane_workflows.mjs` to `scripts/bundle_ui.py`.
- Moved Mute+drum-lane and Shift+Mute+drum-lane behavior into
  `handleDrumLaneMuteSolo()`, preserving modifier consumption, mutually
  exclusive mute/solo mirrors, DSP write ordering, and redraw.
- Moved Copy/Cut/Paste drum-lane behavior into
  `handleDrumLaneCopyPaste()`, preserving source arming, same-track paste,
  cut-to-copy source conversion, incompatible-source swallow semantics, LED
  invalidation, popup text, lane selection, and bank refresh ordering.

Drum repeat workflows:

- Added focused repeat workflow coverage in
  `web/tests/integration/drum-repeat-workflows.test.ts`.
- Added `ui/ui_drum_repeat_workflows.mjs` for drum repeat pad workflows.
- Moved the shared Rpt1/Rpt2 gate-pad workflow into
  `handleDrumRepeatGatePad()`, preserving Delete+gate defaults reset,
  Loop+gate cycle-fill behavior, tap gate toggles, DSP write payloads, and
  redraw ordering.
- Moved the Rpt2 lane-pad press workflow into
  `handleDrumRepeat2LanePadPress()`, preserving lane selection refresh,
  held/latched lane Set updates, patched-Schwung lane-on/off gating,
  Loop-held latch coalescing behavior, `padPitch` suppression, and redraw
  ordering.
- Moved Rpt2 lane-pad release and right-grid release swallow behavior into
  `handleDrumRepeat2LanePadRelease()` and
  `handleDrumRepeat2RightGridPadRelease()`, preserving held-lane cleanup,
  non-latched lane-off, latched-lane continuation, and screen-dirty behavior.
- Added `ui_drum_repeat_workflows.mjs` to `scripts/bundle_ui.py`.
- Moved the Rpt1 rate-pad lifecycle into `handleDrumRepeatRatePadPress()` and
  `handleDrumRepeatRatePadRelease()`, preserving stock-vs-patched Schwung
  start gating, `drum_repeat_latched` write ordering, Loop-held latch,
  re-tap-to-unlatch, held-pad stack push/pop, release-side stack resume, queued
  inactive release removal, and right-grid release swallowing.
- Moved the Rpt2 rate-pad assignment into `handleDrumRepeat2RatePadPress()`,
  preserving active-lane rate mirror updates, stock-vs-patched Schwung
  `tN_drum_repeat2_rate` gating, DSP payload shape, and screen-dirty behavior.
- Moved Rpt1/Rpt2 drum-repeat pad aftertouch into
  `handleDrumRepeatPadAftertouch()` and `handleDrumRepeat2LaneAftertouch()`,
  preserving held-pad velocity mirror updates, held-lane filtering, and
  `tN_drum_repeat_vel` / `tN_drum_repeat2_vel` payloads.

Verification:

- `pnpm test:node tests/integration`
- `python3 scripts/bundle_ui.py`
