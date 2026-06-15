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

## Next Larger Refactor Slices

The small extraction phases have created useful seams, but future work should
prefer larger cohesive workflow slices when they have a clear behavior concept
and testable ordering invariants. Do not chase line count alone: the interface
should hide real sequencing, mirror, and coalescing rules from `ui/ui.js`.

### 1. Repeat Groove Workflow Module

Recommended next slice.

Files:

- `ui/ui.js` around `_onCC_jog()` Delete+jog repeat-groove reset
- `ui/ui.js` around `_onCC_knobs()` Rpt groove step edits
- `ui/ui.js` around drum lane copy/move helper repeat-groove mirror sync
- `ui/ui.js` around Shift+Delete+lane hard reset repeat defaults
- `ui/ui_drum_repeat_workflows.mjs`
- `web/tests/integration/drum-repeat-workflows.test.ts`

Problem:

Repeat-groove state is still spread across jog, pad, knob, lane copy/move, and
hard-reset paths. Each path knows the same mirror defaults and DSP key shapes:
gate mask, gate length, velocity scale, nudge, Rpt2 rate, and deferred reset
queueing. This makes `ui.js` retain too much knowledge about repeat-groove
invariants even though drum-repeat pad workflows already live behind a module
interface.

Solution:

Deepen `ui_drum_repeat_workflows.mjs` around repeat-groove behavior. Keep the
interface behavior-specific; likely functions include:

- `resetDrumRepeatGrooveForLane(S, deps, track, lane)` for Delete+jog in Rpt
  modes. It must reset `drumRepeatGate`, `drumRepeatGateLen`,
  `drumRepeatVelScale`, and `drumRepeatNudge`, then queue
  `t${track}_l${lane}_repeat_groove_reset=1` through
  `pendingDefaultSetParams`, and show `RPT GROOVE` / `RESET`.
- `resetDrumRepeatGrooveMirrorsForLane(S, track, lane)` for mirror-only factory
  reset paths such as Shift+Delete+lane hard reset.
- `copyDrumRepeatGrooveMirrors(S, track, srcLane, dstLane)` and
  `moveDrumRepeatGrooveMirrors(S, track, srcLane, dstLane)` if the lane
  copy/move helpers can delegate without pulling unrelated lane behavior into
  the repeat module.
- Consider moving knob edits for repeat nudge and velocity scale only if the
  caller interface stays narrow and tests can cover clamp/write behavior without
  dragging the whole bank-edit path into the module.

Current behavior to preserve:

- `activeBank === 6` automation clear in `_onCC_jog()` must keep precedence over
  repeat-groove reset.
- Delete+jog repeat-groove reset only applies in Track View when Delete+jog is
  pressed, the active track is a drum track, and `drumPerformMode[track] > 0`.
- Delete+jog reset queues the DSP reset through `pendingDefaultSetParams`, not
  immediate `host_module_set_param`, to preserve one-per-tick coalescing
  avoidance.
- Gate-pad workflows that already live in `handleDrumRepeatGatePad()` preserve
  their current immediate DSP writes and redraw behavior.
- Lane hard reset preserves `midi_note` identity and its existing delayed
  `pendingDrumLaneResync` ordering.

Suggested focused tests:

- Delete+jog reset updates active-lane repeat-groove mirrors and queues exactly
  one deferred reset param after any existing pending entries.
- Automation clear precedence remains outside the repeat-groove function; the
  repeat function should not need to know about bank 6.
- Mirror-only factory reset sets gate `0xFF`, gate length `8`, velocity scale
  `100`, nudge `0`, and Rpt2 per-lane rate `0` without queuing a DSP reset.
- Copy/move mirror helpers preserve source/destination semantics and reset the
  move source to fresh defaults.
- Knob edit extraction, if included, clamps nudge to `[-50, 50]`, velocity scale
  to `[0, 200]`, and writes the same DSP payloads as today.

### 2. Drum Repeat Pad Router

Files:

- `ui/ui.js` around `_onPadPressTrackView()`
- `ui/ui.js` around `_onPadReleaseTrackView()`
- `ui_drum_repeat_workflows.mjs`

Problem:

Most Rpt1/Rpt2 pad behavior is extracted, but `ui.js` still classifies repeat
pad targets by mode, row, column, modifier state, and release grid. That routing
knowledge is not pad-surface behavior and it obscures the live-pad path.

Solution:

Move only the Rpt1/Rpt2 classification and dispatch into a repeat-pad router
function that calls the existing workflow functions. Keep ordinary drum pad
preview/recording, lane clear/copy/mute, and Capture selection outside this
interface.

Preserve:

- Rpt1 intercepts right-grid pads only when Shift/Copy/Mute are not held.
- Rpt2 intercepts right-grid rate/gate pads and left-grid lane pads, but
  Delete+lane must continue to go to destructive lane clear before repeat-lane
  handling.
- Release-side right-grid swallowing and Rpt2 lane-off behavior.
- Patched-vs-stock Schwung set_param gates already encoded in the workflow
  functions.

Manual hardware validation is more valuable for this slice than for pure
repeat-groove extraction because it touches the live pad press/release path.

### 3. Drum Lane Factory Reset Workflow

Files:

- `ui/ui.js` around Shift+Delete+lane hard reset
- `ui_drum_lane_workflows.mjs`
- `ui_drum_repeat_workflows.mjs`

Problem:

Shift+Delete+lane hard reset is a larger workflow that mixes lane reset, repeat
defaults, clip non-empty mirror recompute, delayed DSP resync setup, popup, and
redraw. It is valuable to extract, but it crosses drum-lane and repeat-groove
concepts.

Solution:

Extract after repeat-groove mirror helpers exist. The drum-lane workflow module
can own the overall hard-reset operation while calling repeat-groove helpers for
repeat-specific mirrors. Avoid making either module a broad catch-all.

Preserve:

- `t${track}_l${lane}_hard_reset=1` immediate DSP write.
- Undo/redo mirror updates.
- Lane length, steps, lane non-empty, clip non-empty recompute.
- Repeat-groove defaults and Rpt2 lane rate reset.
- `pendingDrumLaneResync` delayed refresh ordering.
- Popup and redraw behavior.

## Conceptual / Architectural Model

The dAVEBOx fork in `tool/` should become easier to understand by making the
runtime concepts explicit in modules with deep interfaces. The goal is not to
split by line count. The goal is to hide sequencing, mirror, and coalescing rules
behind named workflow and tick-pipeline interfaces so future changes can be made
at the right seam.

Target model:

- `ui/ui.js`: hardware entry points and top-level orchestration. It should route
  MIDI/button/tick events to named modules, but avoid owning workflow-specific
  mirror updates or DSP command sequencing when a deeper module can own them.
- `ui/ui_tick_tasks.mjs`: tick pipeline and DSP mirror scheduling. This module
  should own tick-context work: delayed drains, DSP read-back, state-load settle,
  hot-reload resync, deferred content sync, coalescing-sensitive queues, and
  end-of-tick persistence.
- `ui/ui_pad_surface.mjs`: non-destructive pad performance input and padmap
  state. Keep modal workflows, destructive lane workflows, LED/rendering, and
  full tick ordering outside this interface.
- `ui/ui_drum_lane_workflows.mjs`: destructive drum-lane workflows such as lane
  clear, mute/solo, copy/cut/paste, and factory reset.
- `ui/ui_drum_repeat_workflows.mjs`: drum repeat performance, latch, pad routing,
  and repeat-groove behavior.
- `ui/ui_latch_workflows.mjs`: universal latch sweeps shared across transport
  stop, Delete+Play, and workflows that clear latched musical intent.
- `ui/ui_clip_track_sync.mjs`: track, clip, drum lane, and sidecar mirror reads
  from DSP. This module has earned its seam: deferred tick readbacks, undo/redo
  targeted sync, full state-load sync, sidecar restore, and track conversion all
  need overlapping mirror behavior.

Important architectural invariants:

- `get_param` is only reliable from tick/render contexts, not MIDI callbacks.
- `set_param` and `shadow_send_midi_to_dsp` can coalesce within an audio buffer;
  order-sensitive writes must use one-per-tick queues where required.
- `pendingDefaultSetParams` ordering is load-bearing. Do not reorder existing
  pushes, and do not replace deferred queue writes with immediate
  `host_module_set_param()` unless the existing behavior already does that.
- Repeat pad routing precedence is load-bearing: Delete+lane destructive
  workflows must win before Rpt2 lane handling, and Rpt1/Rpt2 right-grid release
  swallowing must stay in the repeat router.
- Delayed drum lane resync behavior is load-bearing. Preserve the current
  `pendingDrumLaneResync` delays and the refresh order of lane steps, bank
  params, and redraw.
- Patched Schwung capability gates must remain runtime-gated. Stock Schwung
  fallback behavior must keep working.

## Refactor Pace And Risk

Use two refactor speeds instead of treating all of `ui.js` the same.

Slow path: use small slices with exact ordering tests for runtime behavior whose
bugs are subtle or hardware-dependent. This includes DSP mirror reads, tick
pipeline work, deferred queues, pad input, bank writes, track conversion, and
anything that touches `pendingDefaultSetParams`, `host_module_set_param()`, or
`shadow_send_midi_to_dsp()`. Preserve caller timing and wrappers until the
module interface has clearly earned more ownership.

Faster path: allow larger extractions for lower-risk presentation code where
the main failure mode is visual or structural rather than DSP state corruption.
This includes view-model construction, display rendering branches, labels,
menu/modal presentation helpers, and repeated UI formatting code. These slices
should still follow runtime concepts, but they can be broader when tests or
render-output checks cover the behavior.

Do not chase line count by creating generic helper/pass-through modules. A
smaller `ui.js` is only an improvement when the extracted module hides a real
runtime concept, invariant, or presentation boundary. The practical balance is:

- keep the deletion test strict for DSP/tick/write/input paths;
- move read-only DSP mirror code in narrow, testable slices;
- use larger slices to remove view/render/modal bulk once the target boundary is
  clear;
- leave mixed read/write areas such as `readBankParams()` in `ui.js` until the
  pure mirror and deferred-write responsibilities can be separated cleanly.

## Current Next Direction

The Track / Clip Sync module is now established. Continue it only with narrow
read-only mirror moves whose deletion test holds. The most recent mirror
candidates were completed:

- `readTarpStepVel(t)` as `readTrackArpStepConfigFromDsp(S, deps, track)`;
- `readDrumRepeatRates(t)` as `readDrumRepeatRatesFromDsp(S, deps, track)`.

Stop doing sync mirror slices by default for now. The next preferred direction is
the faster presentation path: extract cohesive view/render/modal boundaries with
output-focused tests. Preserve `drawUI()` priority order, and keep DSP reads or
write behavior at their current orchestration seams unless a deeper runtime
concept clearly earns the move. Avoid broadening the sync module into a generic
bank service.

## Track / Clip Sync Slice History

Highest-value next refactor: start the Track / Clip Sync module by moving shared
DSP mirror readback behavior out of `ui.js` and `ui_tick_tasks.mjs` into
`ui/ui_clip_track_sync.mjs`.

Why this slice:

- `ui.js` is still large partly because it owns DSP mirror knowledge in several
  places: `restoreUiSidecar()`, `syncClipsFromDsp()`, `syncClipsTargeted()`,
  track conversion, and session/clip workflows.
- `ui_tick_tasks.mjs` now has deferred melodic readback behavior that overlaps
  with `syncClipsTargeted()`. Keeping the same readback rules in both places
  weakens locality.
- The important concept is not "clip helper functions"; it is "JS mirrors DSP
  track/clip state now". That seam has leverage across hot reload, state load,
  undo/redo, scene bake, targeted step reread, sidecar restore, and track-type
  conversion.
- A sync module gives later tick-pipeline work a smaller adapter: tick tasks can
  ask for mirror operations instead of carrying every low-level DSP key shape.

Suggested implementation:

1. Add focused tests in `web/tests/integration/clip-track-sync.test.ts` or keep
   the first tests in `tick-tasks.test.ts` if the module is initially exercised
   only through deferred tick readbacks.
2. Add `ui/ui_clip_track_sync.mjs` and register it in `scripts/bundle_ui.py`.
3. Move only the shared melodic clip readback first. It should preserve the
   current behavior from `ui_tick_tasks.mjs` and `syncClipsTargeted()`:
   - read `t${track}_c${clip}_steps`;
   - update `S.clipSteps` using the existing `1`/`2`/empty mapping where that
     path currently supports it;
   - recompute `S.clipNonEmpty` via `clipHasContent(track, clip)`;
   - read and parse clip length;
   - read and validate TPS through `TPS_VALUES`, falling back to `24`;
   - refresh per-clip bank params only when the read clip is active and the
     caller currently does so.
4. Use the new helper from `runDeferredContentResyncTasks()` and
   `syncClipsTargeted()` without changing their external behavior. Keep
   `runDeferredContentResyncTasks()` ordering exactly as-is.
5. Only after the first slice is proven, consider moving adjacent sync behavior:
   targeted CC automation readback, aftertouch presence, full melodic clip sync,
   drum clip/lane sync, and sidecar restore defaults. Do not combine these into
   the first extraction.
6. Keep the interface narrow and explicit. Prefer a small host adapter containing
   `host_module_get_param`, `NUM_STEPS`, `TPS_VALUES`, `clipHasContent`, and
   optionally `refreshPerClipBankParams`. Avoid passing general UI operations
   such as `forceRedraw`; callers should keep redraw timing at their current
   tick/workflow seam.
7. Preserve behavior exactly:
   - `get_param` use remains in tick/render-safe paths only;
   - scene-bake, pending-step reread, and undo/redo ordering do not change;
   - active-clip bank refresh happens in the same places as today;
   - drum lane resync ordering remains inside deferred content resync;
   - `pendingDefaultSetParams` ordering is untouched.

Suggested focused tests:

- Shared melodic readback updates steps, `clipNonEmpty`, length, and TPS with
  the same fallback behavior as today.
- Active-clip readback refreshes per-clip bank params; inactive-clip readback
  does not.
- `pendingStepsReread` and `pendingSceneBakeResync` keep their current call
  ordering, including redraw timing.
- `syncClipsTargeted()` keeps fallback-to-full-sync behavior for missing or
  malformed restore info.
- Targeted undo/redo sync keeps CC automation and aftertouch readback behavior
  unchanged if those reads remain in `ui.js` during the first slice.

After this slice:

- Continue deepening `ui_clip_track_sync.mjs` only where two or more call paths
  benefit. The deletion test should hold: deleting the module should push DSP
  key-shape and mirror-update rules back into multiple callers.
- Once clip/track sync has a useful interface, revisit `ui_tick_tasks.mjs` and
  consider an explicit tick phase runner. Do not create a broad tick runner
  while its adapter would still need to expose most of `ui.js`.
- The next large line-count candidate after sync is display presentation:
  concrete bank/view renderers, modal presentation, and repeated formatting
  helpers. Keep `readBankParams()`, `applyBankParam()`, and knob edit behavior
  in `ui.js` until the pure mirror and deferred-write responsibilities can be
  separated cleanly.

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
- Moved Track View Loop button drum-repeat latch/unlatch behavior into
  `prepareDrumRepeatLoopPress()`, `latchHeldDrumRepeatsOnLoopPress()`, and
  `handleDrumRepeatLoopTapRelease()`, preserving tap-unlatch eligibility,
  Rpt2 held-lanes-to-latched promotion through `tN_drum_repeat2_latch_held`,
  Rpt1 pending-default latch writes, and Rpt1/Rpt2 pending-default stop ordering.
- Moved Track View Delete+Loop active drum-repeat stop into
  `handleDeleteLoopDrumRepeatStop()`, preserving the unconditional drum-track
  gesture swallow/redraw, immediate Rpt1/Rpt2 stop writes, Rpt1 held-pad stack
  cleanup, and Rpt2 latched-lane mirror clearing.
- Added `ui/ui_latch_workflows.mjs` for the universal latch sweep shared by
  transport stop and Delete+Play, instead of expanding the drum-repeat workflow
  interface to cover TARP.
- Moved `unlatchAllTracks()` into the latch workflow module, preserving Rpt1
  stop mirror cleanup, Rpt2 per-lane unlatch queueing, TARP latch clearing, and
  per-track pendingDefaultSetParams ordering for one-per-tick drain behavior.
- Added focused coverage in `web/tests/integration/latch-workflows.test.ts`.
- Moved Track View Shift+Step 8 drum perform-mode cycling into
  `cycleDrumRepeatPerformMode()`, preserving stop-before-mode-change ordering,
  Rpt1 held-pad cleanup, Rpt2 held/latched lane cleanup, repeat-bank selection,
  and the mode popup behavior.
- Started the larger Repeat Groove Workflow Module slice by moving
  repeat-groove reset/default mirror behavior into
  `ui_drum_repeat_workflows.mjs`:
  `resetDrumRepeatGrooveForLane()`,
  `resetDrumRepeatGrooveMirrorsForLane()`,
  `copyDrumRepeatGrooveMirrors()`, and
  `moveDrumRepeatGrooveMirrors()`.
- Moved repeat-groove step knob edits into
  `editDrumRepeatGrooveStep()`, preserving velocity-scale/nudge clamp ranges,
  DSP payload shapes, and dirty-screen behavior.
- Added focused coverage for Delete+jog deferred reset queue ordering,
  mirror-only factory reset, copy/move mirror semantics, and repeat-groove knob
  clamp/write behavior in
  `web/tests/integration/drum-repeat-workflows.test.ts`.
- Started the Drum Repeat Pad Router slice by moving Track View Rpt1/Rpt2 pad
  press and release classification into `handleDrumRepeatPadPress()` and
  `handleDrumRepeatPadRelease()`, preserving modifier exclusions,
  Delete+lane precedence, right-grid release swallowing, Rpt2 lane release
  swallowing, and stock-vs-patched Schwung behavior in the existing concrete
  workflow helpers.
- Added focused router coverage for Rpt1 rate/gate routing, Rpt2 rate/gate/lane
  routing, Delete+lane fallthrough, and repeat-owned release swallowing in
  `web/tests/integration/drum-repeat-workflows.test.ts`.
- Completed the Drum Lane Factory Reset Workflow slice by moving
  Shift+Delete+lane hard reset into `handleDrumLaneFactoryReset()` in
  `ui_drum_lane_workflows.mjs`, while delegating repeat-specific defaults to
  `resetDrumRepeatGrooveMirrorsForLane()`.
- Added focused lane workflow coverage for immediate hard-reset DSP write,
  undo/redo mirrors, lane length/steps/has-notes reset, clip non-empty
  recompute, repeat-groove/Rpt2 rate defaults, delayed lane resync ordering,
  popup/redraw behavior, and invalid-lane no-op.
- Consolidated the completed repeat/drum-lane workflow cluster:
  `handleDrumRepeat2RightGridPadRelease()` is now private to
  `ui_drum_repeat_workflows.mjs`, with right-grid release coverage moved to the
  public repeat pad-release router, and the workflow adapters in `ui.js` now
  share one private optional host `set_param` adapter helper.
- Continued Candidate 1 with a small tick/DSP mirror cleanup: moved the
  drum-repeat recording active-lane refresh into `ui_tick_tasks.mjs` as
  `runRepeatRecordingLaneRefreshTask()`, preserving its position after deferred
  content resync drains and keeping repeat pad routing/lane workflows unchanged.
- Added focused coverage in `web/tests/integration/tick-tasks.test.ts` for the
  active repeat-recording refresh and its record/play/session/drum/repeat gates.
- Deepened the Tick / DSP Mirror module by moving DSP hot-reload detection and
  pending state-load resync into `ui_tick_tasks.mjs` as
  `runDspMirrorResyncTasks()`, preserving its position after
  `runDefaultSetParamDrain()` and before `runMoveCoRunTickTasks()`.
- Added focused coverage in `web/tests/integration/tick-tasks.test.ts` for
  hot-reload cadence/nonce gates, refresh ordering, sidecar/state-loading
  differences, and pending DSP sync countdown behavior.
- Extracted a private melodic content readback helper inside
  `ui_tick_tasks.mjs`, shared by `pendingStepsReread` and
  `pendingSceneBakeResync`, preserving `runDeferredContentResyncTasks()`
  ordering and interface.
- Added focused coverage in `web/tests/integration/tick-tasks.test.ts` for the
  shared melodic readback behavior across targeted step reread and scene bake.
- Continued the Track / Clip Sync module slice by moving targeted undo/redo
  restore-pair readback into `readTargetedClipRestorePairFromDsp()` in
  `ui_clip_track_sync.mjs`, preserving `syncClipsTargeted()` ownership of
  `last_restore` parsing, malformed fallback-to-full-sync behavior, `DR` row
  handling, screen-dirty timing, and loop control.
- Added focused coverage in `web/tests/integration/clip-track-sync.test.ts` for
  melodic targeted pair ordering and drum targeted pair ordering. The existing
  malformed `last_restore` fallback coverage remains in
  `web/tests/integration/tool.test.ts`.
- Reassessed the next Parameter Bank / DSP Mirror pressure points and kept the
  slice narrow: moved only packed bank snapshot readback into
  `ui_clip_track_sync.mjs` as `refreshPerClipBankParamsFromDsp()`,
  `refreshDrumLaneBankParamsFromDsp()`, and `readDrumRepeatStateFromDsp()`.
  `readBankParams()` remains in `ui.js` because it still mixes track/global
  reads, action state, and the CC bank's deferred default writes.
- Added focused coverage in `web/tests/integration/clip-track-sync.test.ts` for
  melodic and drum bank snapshot read ordering, packed fallback/default
  behavior, and drum-track delegation through the per-clip refresh path.
- Continued the narrow Parameter Bank / DSP Mirror read-only slice by moving
  track config readback into `ui_clip_track_sync.mjs` as
  `readTrackConfigFromDsp()`, preserving the `ui.js` wrapper and full-sync
  caller timing. This keeps knob edit/write behavior, `readBankParams()`, and
  CC-bank deferred default writes in `ui.js`.
- Added focused coverage in `web/tests/integration/clip-track-sync.test.ts` for
  track config DSP read ordering, route/default parsing, missing-value fallback
  behavior, DIQ clamping, the DIQ bank mirror update, track arp step config
  readback, and Rpt2 per-lane repeat-rate readback.
- Switched to the faster presentation path after reassessing `drawUI()`.
  Added `ui/ui_bank_render.mjs` for the concrete drum bank-overview renderers:
  DRUM LANE, ALL LANES confirm/overview, NOTE FX, REPEAT GROOVE, and drum DELAY.
  Kept `drawUI()` priority/order and left the REPEAT GROOVE
  `syncDrumRepeatState()` readback in `ui.js` immediately before rendering.
- Added focused output coverage in `web/tests/integration/bank-render.test.ts`
  for the moved presentation formatting.
- Continued the faster presentation path after reassessing the `loopHeld`
  `drawUI()` branch. Added `ui/ui_loop_render.mjs` for the Loop-held drum lane,
  AUTO lane config, and melodic clip-length render paths. Kept `drawUI()`
  priority/order, loop state/timing, CC lane state, and all input/DSP/knob write
  behavior at the existing seams.
- Added focused output coverage in `web/tests/integration/loop-render.test.ts`
  for the moved loop presentation formatting.
- Continued the faster presentation path after reassessing the held-step Track
  View branches. Added `ui/ui_step_edit_render.mjs` for non-CC step-edit
  presentation: the shared header plus drum and melodic step-edit grids. Kept
  the CC automation step-hold graph, render-time DSP read, and all step/knob
  edit-write behavior in `ui.js`, and preserved the melodic note-loading
  fall-through.
- Added focused output coverage in
  `web/tests/integration/step-edit-render.test.ts` for drum step edit, melodic
  merged note-cell rendering, empty held steps, and the note-loading fall-through
  case.
- Continued the faster presentation path with the remaining held-step Track View
  presentation branch. Added `ui/ui_cc_step_edit_render.mjs` for the CC
  automation step-hold graph, header, knob cells, and progress bar. Kept the
  render-time DSP graph read/cache inside this presentation renderer, and left
  CC step edit/write behavior in `ui.js`.
- Added focused output/cache coverage in
  `web/tests/integration/cc-step-edit-render.test.ts` for graph refresh,
  scheduler labels, knob-cell formatting, cached graph reuse, and missing-page
  fallback rendering.
- Continued the faster presentation path with the AUTO idle Track View branch.
  Moved lane info, badges, automation graph, render-time graph read/cache, and
  lane-aware progress rendering into `renderMotionIdleView()` in
  `ui/ui_idle_render.mjs`, preserving `drawUI()` priority/order and leaving CC
  edit/write behavior in `ui.js`.
- Added focused output/cache coverage in
  `web/tests/integration/idle-render.test.ts` for AUTO idle lane text, badges,
  graph refresh/cache reuse, and playing progress rendering.
- Continued the faster presentation path by moving Track View bank-overview
  presentation dispatch into `renderTrackBankOverview()` in
  `ui/ui_bank_render.mjs`. Kept the `drawUI()` priority gate and the
  REPEAT GROOVE `syncDrumRepeatState()` readback in `ui.js` immediately before
  rendering, and left bank reads/writes plus knob edit behavior unchanged.
- Added focused dispatch/output coverage in
  `web/tests/integration/bank-render.test.ts`.
- Continued the presentation path by moving the drum idle position bar into
  `ui/ui_idle_render.mjs` and the Session Overview held-grid renderer into
  `ui/ui_session_overview_render.mjs`. Kept `drawUI()` as the priority router
  and left session navigation, clip state, and drum lane mirrors untouched.
- Added focused output coverage in `web/tests/integration/idle-render.test.ts`
  and `web/tests/integration/session-overview-render.test.ts`.
- Continued the presentation path by moving shared track-number row rendering
  into `ui/ui_track_chrome_render.mjs` and Performance OLED takeover rendering
  into `ui/ui_perf_render.mjs`. Kept perf input, LED updates, latch state, and
  looper/DSP writes in `ui.js`.
- Added focused output coverage in `web/tests/integration/idle-render.test.ts`
  and `web/tests/integration/perf-render.test.ts`.
- Continued the presentation path by moving the inherit picker, snapshot picker,
  and clear-automation menu into `ui/ui_modal_render.mjs`. Kept
  `drawUI()` priority/order, modal open/close/commit/cancel input handling, and
  deferred DSP/default writes in `ui.js`.
- Added focused output coverage in `web/tests/integration/modal-render.test.ts`
  for selected-row inversion, scroll indicators, snapshot confirm subviews, and
  checkbox/action rows.
- Continued the modal presentation path by moving the simple state-wipe,
  record-blocked, and Lgto confirm dialog renderers into `ui/ui_modal_render.mjs`.
  Kept their open/commit/cancel input handling and workflow side effects in
  `ui.js`.
- Extended focused modal output coverage for simple confirm title/body text and
  selected button inversion.
- Continued the modal presentation path by moving `drawBakeConfirm()` into
  `ui/ui_modal_render.mjs`. Kept bake target selection, commit/cancel handling,
  and DSP/deferred write behavior in `ui.js`.
- Extended focused modal output coverage for bake wrap tails, multi-loop,
  melodic confirm, drum clip/lane choice, and drum loop-count subviews.
- Continued the modal presentation path by moving `drawBakeSceneConfirm()` into
  `ui/ui_modal_render.mjs`. Kept scene-bake loop selection, wrap-tail
  commit/cancel handling, DSP writes, and deferred resync behavior in `ui.js`.
- Extended focused modal output coverage for scene-bake loop-count and
  wrap-tail subviews.
- Continued the modal presentation path by moving `drawXposeConfirm()` into
  `ui/ui_modal_render.mjs`. Kept transpose preview, commit/cancel handling,
  pad-map recompute, and deferred apply writes in `ui.js`.
- Extended focused modal output coverage for transpose target text, fallback
  scale label, and selected YES/NO button inversion.
- Continued the presentation path by moving bank/header chrome rendering into
  `ui/ui_bank_chrome_render.mjs`: bank strip, right-side header chrome, normal
  and inverted headings, and the alt-arrow affordance. Kept `drawUI()` priority
  order, bank selection, knob behavior, bank read/write behavior, alt-mode state
  mutation, and DSP reads/writes at their existing seams in `ui.js`.
- Added focused output coverage in
  `web/tests/integration/bank-chrome-render.test.ts` for normal and inverted
  headings, track indicator suppression, melodic and drum overview strips,
  alt-arrow blink visibility, and Session View right-side suppression.
- Continued the presentation path by moving the metronome/status OLED chrome
  into `renderMetroIndicator()` in `ui/ui_track_chrome_render.mjs`, beside the
  existing track-number row renderer. Kept idle-view routing and the
  `drawMetroIndicator()` wrapper in `ui.js`, and left clip/track mirror updates
  untouched.
- Extended focused output coverage in `web/tests/integration/idle-render.test.ts`
  for metronome labels/off state, Track View velocity and adaptive/fixed
  indicators, melodic/drum fixed cases, and Session View right-side suppression.
- Continued the presentation path by moving packed splash-frame drawing into
  `renderSplashFrame()` in `ui/ui_splash.mjs`, where the decoded splash assets
  and dimensions already live. Kept `drawUI()` priority/order, splash entry-edge
  frame selection, `S.splashWasVisible`, `S.currentSplashIdx`, and
  `clear_screen()` in `ui.js`.
- Added focused output coverage in `web/tests/integration/splash-render.test.ts`
  for MSB-first decoding, horizontal run coalescing, trailing run flushing,
  empty frames, multi-row y coordinates, and wider packed rows.

Verification:

- `npm run test:node -- tests/integration/splash-render.test.ts`
- `npm run test:node -- tests/integration/modal-render.test.ts tests/integration/loop-render.test.ts tests/integration/param-peek-render.test.ts tests/integration/prompt-render.test.ts tests/integration/popup-render.test.ts tests/integration/idle-render.test.ts tests/integration/bank-render.test.ts tests/integration/bank-chrome-render.test.ts tests/integration/perf-render.test.ts tests/integration/session-overview-render.test.ts tests/integration/splash-render.test.ts tests/integration/step-edit-render.test.ts tests/integration/cc-step-edit-render.test.ts tests/integration/step-interval-render.test.ts tests/integration/ui-descriptors.test.ts`
- `npm run test:node -- tests/integration`
- `npm run test:node`
- `python3 scripts/bundle_ui.py`
- `node --check dist/overture/ui.js`
- `npm run build`
- `npm run test:node -- tests/integration/idle-render.test.ts`
- `npm run test:node -- tests/integration/modal-render.test.ts tests/integration/loop-render.test.ts tests/integration/param-peek-render.test.ts tests/integration/prompt-render.test.ts tests/integration/popup-render.test.ts tests/integration/idle-render.test.ts tests/integration/bank-render.test.ts tests/integration/bank-chrome-render.test.ts tests/integration/perf-render.test.ts tests/integration/session-overview-render.test.ts tests/integration/step-edit-render.test.ts tests/integration/cc-step-edit-render.test.ts tests/integration/step-interval-render.test.ts tests/integration/ui-descriptors.test.ts`
- `npm run test:node -- tests/integration`
- `npm run test:node`
- `python3 scripts/bundle_ui.py`
- `node --check dist/overture/ui.js`
- `npm run build`
- `npm run test:node -- --run tests/integration/bank-chrome-render.test.ts`
- `npm run test:node -- tests/integration/modal-render.test.ts tests/integration/loop-render.test.ts tests/integration/param-peek-render.test.ts tests/integration/prompt-render.test.ts tests/integration/popup-render.test.ts tests/integration/idle-render.test.ts tests/integration/bank-render.test.ts tests/integration/bank-chrome-render.test.ts tests/integration/perf-render.test.ts tests/integration/session-overview-render.test.ts tests/integration/step-edit-render.test.ts tests/integration/cc-step-edit-render.test.ts tests/integration/step-interval-render.test.ts tests/integration/ui-descriptors.test.ts`
- `npm run test:node -- tests/integration`
- `npm run test:node`
- `python3 scripts/bundle_ui.py`
- `node --check dist/overture/ui.js`
- `npm run build`
- `npm run test:node -- tests/integration/modal-render.test.ts`
- `npm run test:node -- tests/integration/modal-render.test.ts tests/integration/loop-render.test.ts tests/integration/param-peek-render.test.ts tests/integration/prompt-render.test.ts tests/integration/popup-render.test.ts tests/integration/idle-render.test.ts tests/integration/bank-render.test.ts tests/integration/perf-render.test.ts tests/integration/session-overview-render.test.ts tests/integration/step-edit-render.test.ts tests/integration/cc-step-edit-render.test.ts tests/integration/step-interval-render.test.ts tests/integration/ui-descriptors.test.ts`
- `npm run test:node -- tests/integration`
- `npm run test:node`
- `npm run build`
- `node --check dist/overture/ui.js`
- `pnpm test:node tests/integration/drum-lane-workflows.test.ts`
- `pnpm test:node tests/integration/latch-workflows.test.ts`
- `pnpm test:node tests/integration/drum-repeat-workflows.test.ts`
- `npm run test:node -- tests/integration/clip-track-sync.test.ts tests/integration/tick-tasks.test.ts`
- `pnpm test:node tests/integration/loop-render.test.ts`
- `pnpm vitest run tests/integration/step-edit-render.test.ts`
- `pnpm vitest run tests/integration/cc-step-edit-render.test.ts`
- `pnpm test:node tests/integration/idle-render.test.ts`
- `pnpm test:node tests/integration/loop-render.test.ts tests/integration/param-peek-render.test.ts tests/integration/prompt-render.test.ts tests/integration/popup-render.test.ts tests/integration/idle-render.test.ts tests/integration/bank-render.test.ts tests/integration/ui-descriptors.test.ts`
- `pnpm test:node tests/integration`
- `pnpm test:node`
- `python3 scripts/bundle_ui.py`
