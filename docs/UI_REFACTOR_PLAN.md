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

Candidate 3:

- Added focused pad surface tests in `web/tests/integration/pad-surface.test.ts`.
- Added `ui/ui_pad_surface.mjs` for pad-map construction and DSP padmap payload
  creation.
- Updated `computePadNoteMap()` to delegate to the pad surface module while
  preserving the existing local caller interface.
- Added `ui_pad_surface.mjs` to `scripts/bundle_ui.py`.
- Moved live-note queue creation and enqueue helpers into `ui_pad_surface.mjs`,
  while leaving the tick-time drain in `ui_tick_tasks.mjs`.

Verification:

- `pnpm test:node tests/integration`
- `python3 scripts/bundle_ui.py`
