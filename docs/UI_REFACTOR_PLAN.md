# Remaining ui.js Refactor Roadmap

This roadmap captures the remaining decomposition work after the completed
`ui.js` extraction phases. Continue only with mechanical, behavior-preserving
refactors. `ui.js` may remain the UI Runtime composition root where that keeps
ordering and public entrypoints explicit.

Follow `docs/adr/0001-refactor-by-runtime-concept.md`: deepen modules by
runtime concept and invariant, not by line count. Do not create a generic
all-deps module.

## Guardrails

- Preserve behavior and public wrapper/global callback names in `ui.js`.
- Move one cohesive runtime concept per phase.
- Prefer mechanical moves over rewrites.
- Add or extend focused tests before moving behavior whenever the current tests
  do not pin the ordering, fallback, or coalescing-sensitive invariant being
  touched.
- Keep Tick Pipeline ordering explicit and reviewable.
- Preserve DSP readback/write ordering exactly unless a test first proves a
  reordering is behavior-neutral and the change is called out in the phase
  notes.
- Keep stock Schwung fallbacks and patched Schwung capability gates intact.
- Run focused tests first, then `cd overture/web && npm run test:node`.
- Treat `npm run typecheck` and full `npm run lint` as non-blocking until
  existing unrelated failures are resolved; do not add new lint noise.
- Commit after each green phase.

## Current Status

- Phase 2 Track / Clip Sync Facade is complete. `ui.js` keeps public wrapper
  names while sync/readback behavior is behind `ui_track_clip_sync_facade.mjs`.
- Phase 3 Pad Surface Runtime is complete. Pad press runtime state, pad-map
  recompute, DSP padmap push, pad-dispatch mute policy, and drum mirror setters
  are behind `ui_pad_surface.mjs` / `createPadSurfaceRuntime()`.
- Remaining `ui.js` Pad Surface wrappers are intentional public/local entrypoint
  shims: `computePadNoteMap`, `setActiveDrumLane`, `setDrumPerformMode`, and
  `setDrumLanePage`.
- Phase 4 Input Dispatch Dependency Locality is complete. Hardware CC/note
  constants for pads, buttons, transport, navigation, jog, input dispatch, and
  internal MIDI routing are grouped behind `ui_input_adapters.mjs`; the repeated
  `host_exit_module` late-binding check is also localized there.
- Remaining `ui.js` input dependency factory entries are intentional composition
  thunks or phase-owned runtime dependencies. They stay in `ui.js` because
  moving them would cross the Tick Pipeline, Parameter Bank, Drum Lane Workflow,
  Drum Repeat Workflow, Loop Gesture, Track View Step, or public wrapper
  boundaries.

## Completed: Phase 4 Input Dispatch Dependency Locality

Phase 4 reduced dependency factory noise in `ui.js` only where a
hardware-concept adapter could preserve dispatch priority and short-circuit
behavior exactly.

Test audit:

- Audited `input-dispatch-workflow.test.ts`, `pad-workflow.test.ts`,
  `button-cc-workflow.test.ts`, `transport-cc-workflow.test.ts`,
  `navigation-cc-workflow.test.ts`, `jog-cc-workflow.test.ts`, and
  `knob-cc-workflow.test.ts`.
- Added narrow adapter coverage before moving dependency construction that was
  not already pinned. Existing tests already pinned dispatch priority, modal
  short-circuiting, pad press/release ordering, and raw internal MIDI routing.

Mechanical decomposition:

- Audited `createInputDispatchWorkflowDeps()` and the pad/CC-specific dependency
  factories before edits. Large behavior-heavy factories were intentionally left
  in place.
- Added concept-scoped adapters for pads, transport, navigation, buttons, jog,
  raw input dispatch, and internal MIDI routing where the adapter hides repeated
  hardware knowledge from `ui.js`.
- Localized the repeated `host_exit_module` optional host lookup in
  `ui_input_adapters.mjs`.
- Preserved `globalThis.onMidiMessageInternal`,
  `globalThis.onMidiMessageExternal`, and public wrapper names in `ui.js`.
- Did not move Tick Pipeline dependency construction, Parameter Bank runtime
  behavior, destructive Drum Lane Workflow behavior, or Drum Repeat Workflow
  behavior in this phase.

Verification for the phase:

- Focused input-dispatch and hardware-concept tests were run after each slice.
- `cd overture/web && npm run test:node` was green after each slice.
- No non-blocking checks were skipped for Phase 4.

## 1. Tick Pipeline Locality

Deepen the Tick Pipeline first, but do not move `createTickWorkflowDeps()`
wholesale. The goal is to reduce ordering friction inside `ui_tick_workflow.mjs`
while keeping `runTickWorkflow(S, deps)` as the public interface.

Implementation direction:

- Split `runTickWorkflow` internally into private phase runners for host/input
  drains, DSP Mirror sync, UI timers/LEDs, persistence, and final draw.
- Keep every task call in the current order unless a test explicitly pins and
  justifies a no-op regrouping.
- Keep tick adapters concept-scoped (`ui_tick_adapters.mjs`,
  `ui_sync_adapters.mjs`, `ui_input_adapters.mjs`); do not introduce a single
  Tick Pipeline mega-adapter.
- Extend `ui_tick_workflow.test.mjs` and `tick-tasks.test.ts` for phase ordering,
  coalescing-sensitive drains, state-load settle, suspend/save, and final draw
  gating.

## 2. Track / Clip Sync Facade

Deepen the existing Track / Clip Sync modules around the concept "refresh the
DSP Mirror now." Move sync wrapper behavior out of `ui.js` while preserving the
existing wrapper names where other modules call them.

Status: complete.

Implementation direction:

- Consolidate drum lane sync, full clip sync, targeted sync, mute/solo sync,
  sidecar restore, track config readback, and related readback deps.
- Keep DSP key shapes, read ordering, and sidecar fallback/default behavior
  byte-for-byte.
- Avoid folding Parameter Bank writes into this phase; only move readback and
  DSP Mirror refresh behavior.
- Extend `clip-state-sync.test.ts`, `clip-track-sync.test.ts`, and
  `drum-clip-sync.test.ts`.

## 3. Pad Surface Runtime

Consolidate Pad Surface runtime state and mirror setters without absorbing
destructive Drum Lane Workflow or Drum Repeat Workflow behavior.

Status: complete.

Implementation direction:

- Move `padPitch`, `padPressTick`, pad-map recompute, DSP padmap push, and
  pad-dispatch mute helpers behind the Pad Surface module.
- Move the mirror setters for active drum lane, drum perform mode, and drum lane
  page only if the Pad Surface interface can preserve their DSP push invariants
  exactly.
- Preserve patched-vs-stock Schwung gates and same-tick note on/off ordering.
- Extend `pad-surface.test.ts`, `pad-workflow.test.ts`,
  `input-dispatch-workflow.test.ts`, and relevant behavior harness coverage.

## 4. Input Dispatch Dependency Locality

Status: complete.

After Pad Surface consolidation, reduce the remaining CC/pad dependency
factories in `ui.js` by grouping input adapters by hardware concept.

Implementation direction:

- Move adapter construction for jog, buttons, transport, navigation, knobs, and
  pads into input-runtime modules only where deletion would push repeated
  knowledge back into callers.
- Keep `globalThis.onMidiMessageInternal` and
  `globalThis.onMidiMessageExternal` assigned in `ui.js`.
- Preserve dispatch priority order and all existing short-circuit behavior.
- Extend `input-dispatch-workflow.test.ts`, plus the focused jog/button/knob/
  transport/navigation workflow tests touched by the phase.

## 5. Parameter Bank Runtime

Deepen `ui_bank_params.mjs` around Parameter Bank semantics, not just read/write
functions.

Implementation direction:

- Move remaining bank-adjacent wrappers from `ui.js`: `resetTarp`, bank alt
  checks, bank param read/apply/reset deps, and route-check warning linkage.
- Keep coalescing-sensitive `pendingDefaultSetParams` ordering byte-for-byte.
- Keep bank display rendering separate unless a later phase proves the display
  model belongs behind the same Parameter Bank interface.
- Extend `bank-params.test.ts`, `knob-cc-workflow.test.ts`, and relevant bank
  render tests.

## 6. Entrypoint Error Wrapper

Extract the diagnostic entrypoint error capture only after the behavior modules
above are stable.

Implementation direction:

- Move the error buffer, dedupe map, log formatting, and host write-file adapter
  into a tiny UI Runtime diagnostic module.
- Keep `globalThis.init`, `globalThis.tick`,
  `globalThis.onMidiMessageInternal`, and `globalThis.onMidiMessageExternal`
  assigned in `ui.js`.
- Preserve log path, dedupe key, context fields, swallowed-error behavior, and
  stock-host no-op behavior.
- Add focused unit coverage for dedupe, missing writer no-op, and one captured
  entrypoint failure.

## Assumptions

- This roadmap is documentation for future phases, not a request to begin the
  next code extraction.
- Work proceeds one phase at a time.
- `ui.js` remains the composition root for UI Runtime entrypoints and wrapper
  names until a deeper module earns a smaller interface.
- ADR-0001 remains binding for future refactor decisions.
