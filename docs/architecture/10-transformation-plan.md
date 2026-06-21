# Transformation Plan

This plan turns the target architecture into small, independently shippable migrations. It assumes the current codebase remains live throughout the work. `ui/ui.js` should stay as the composition and legacy adapter until migrated modules have earned ownership through tests.

The plan favors additive adapters, characterization tests, and narrow behavior moves. It does not propose rewrites.

## Highest-Leverage First Migration

The best first migration is **Hardware Event Normalization for internal MIDI, as an adapter-only layer**.

Why this first:

- It has high leverage because contexts, command routing, workflow tests, and future plugin-style feature registration all benefit from semantic input events.
- It has low risk because it can be added beside `ui/midi/ui_midi_internal_workflow.mjs` without changing existing behavior.
- It is easy to test with the existing `tests/midi/midi-internal-workflow.test.ts` and input workflow tests.
- It centralizes Move hardware mapping without touching DSP timing, rendering, persistence, or undo.

The first PR should only add normalized event construction and tests, then continue passing events into the current handlers exactly as before.

## Phase 0: Baseline and Architecture Contracts

### Goal

Lock in the target architecture as documentation and add missing characterization tests around the first migration slices.

### Architectural Benefit

Creates a shared direction before code movement. Prevents architectural churn by making the first migrations explicit, testable, and reversible.

### Files Likely Affected

- `docs/architecture/00-current-architecture.md`
- `docs/architecture/01-principles.md`
- `docs/architecture/09-migration-strategy.md`
- `docs/architecture/10-transformation-plan.md`
- `tests/midi/midi-internal-workflow.test.ts`
- `tests/components/confirm-prompt.test.ts`
- `tests/sync/clip-edit-ops.test.ts`

### Expected LOC Change

+150 to +400 LOC, mostly tests and docs.

### Risk Level

Low. No production behavior should change.

### Testing Strategy

- Run `pnpm test`.
- Run focused tests for MIDI routing, confirm prompt, and clip edit ops.
- Add tests before moving behavior, not after.

### Rollback Strategy

Revert only the added docs/tests. No production code should depend on this phase.

### Success Criteria

- Architecture direction is documented.
- First migration slice is identified.
- Characterization tests pin the current behavior of that slice.

### Shippable PRs

#### PR 0.1: Add Transformation Plan

- Scope: add this document.
- Files: `docs/architecture/10-transformation-plan.md`.
- LOC: +250 to +450.
- Tests: not required beyond markdown review.
- Rollback: delete the file.

#### PR 0.2: Characterize Internal MIDI Routing

- Scope: add tests for raw MIDI classification and current swallow/pass-through behavior.
- Files: `tests/midi/midi-internal-workflow.test.ts`.
- LOC: +50 to +120.
- Tests: `pnpm test -- tests/midi/midi-internal-workflow.test.ts`.
- Rollback: revert test additions.

#### PR 0.3: Characterize Confirm Prompt as a Context Candidate

- Scope: add tests for rotate/action/render assumptions if gaps exist.
- Files: `tests/components/confirm-prompt.test.ts`, possibly `ui/components/ui_confirm_prompt.mjs` only for exported helper visibility.
- LOC: +30 to +80.
- Tests: `pnpm test -- tests/components/confirm-prompt.test.ts`.
- Rollback: revert test additions.

#### PR 0.4: Characterize Clip Clear/Reset Command Candidate

- Scope: assert current DSP queue writes, mirror patches, undo flags, and readback flags for `clearClipImpl` and `hardResetClipImpl`.
- Files: `tests/sync/clip-edit-ops.test.ts`.
- LOC: +60 to +160.
- Tests: `pnpm test -- tests/sync/clip-edit-ops.test.ts`.
- Rollback: revert test additions.

## Phase 1: Hardware Event Normalization

### Goal

Introduce normalized hardware events while keeping the current dispatch ladders and behavior intact.

### Architectural Benefit

Creates the input boundary needed by the context stack, feature workflows, plugin-style registration, and focused tests. Raw MIDI bytes stop leaking into new behavior.

### Files Likely Affected

- `ui/input/ui_hardware_events.mjs` or `ui/input/ui_normalized_events.mjs` new
- `ui/midi/ui_midi_internal_workflow.mjs`
- `ui/input/ui_input_adapters.mjs`
- `ui/types.d.ts`
- `tests/midi/midi-internal-workflow.test.ts`
- `tests/input/input-dispatch-workflow.test.ts`
- `tests/input/*`

### Expected LOC Change

+250 to +600 LOC net over several PRs. Early PRs should be mostly additive.

### Risk Level

Low to medium. Low when adapter-only; medium when handlers start consuming normalized events.

### Testing Strategy

- Unit test raw MIDI to normalized event mapping.
- Keep existing MIDI and input dispatch tests unchanged initially.
- Add fixture tests for edge cases: aftertouch before noise filter, master volume pass-through, snapshot picker swallow, clear-auto swallow, session overlay swallow, knob touch, CC, step, pad press, pad release.
- Run `pnpm test -- tests/midi tests/input`.

### Rollback Strategy

Keep legacy raw handlers in place. Roll back by disabling normalized event creation and reverting event-consumer PRs one at a time.

### Success Criteria

- Raw hardware mapping is centralized.
- Existing input behavior is unchanged.
- Tests can inject semantic events without constructing MIDI byte arrays.

### Shippable PRs

#### PR 1.1: Define Normalized Event Types and Constructors

- Scope: add event constructors and docs only.
- Files: new `ui/input/ui_normalized_events.mjs`, `ui/types.d.ts`, tests.
- LOC: +120 to +220.
- Tests: new constructor tests.
- Rollback: delete new file and tests.

#### PR 1.2: Emit Normalized Events in MIDI Router Without Consuming Them

- Scope: have `handleUiMidiInternalMessage` optionally call `deps.onNormalizedEvent(event)` before current legacy dispatch.
- Files: `ui/midi/ui_midi_internal_workflow.mjs`, `tests/midi/midi-internal-workflow.test.ts`.
- LOC: +50 to +120.
- Tests: focused MIDI tests.
- Rollback: remove optional callback.

#### PR 1.3: Add Normalized Event Test Injector

- Scope: add a small test helper that routes semantic events into existing workflow deps.
- Files: `tests/helpers` if present, otherwise adjacent test utility; selected input tests.
- LOC: +80 to +180.
- Tests: one migrated input test.
- Rollback: remove helper and migrated test changes.

#### PR 1.4: Convert One Low-Risk Input Workflow Test to Normalized Events

- Scope: use normalized event injection for one workflow, likely button or navigation.
- Files: `tests/input/button-cc-workflow.test.ts` or `tests/input/navigation-cc-workflow.test.ts`.
- LOC: -20 to +80.
- Tests: focused input test.
- Rollback: restore raw CC fixture path.

#### PR 1.5: Document Raw MIDI Ownership

- Scope: add a short code comment or architecture note that raw MIDI belongs only to hardware adapters.
- Files: `docs/architecture/10-transformation-plan.md` or `ui/midi/ui_midi_internal_workflow.mjs`.
- LOC: +5 to +20.
- Tests: not required.
- Rollback: revert comment/doc note.

## Phase 2: Context Stack for Simple Modals

### Goal

Add a context stack runtime and migrate simple modal behavior without disturbing existing priority ladders.

### Architectural Benefit

Moves input capture, screen ownership, Back behavior, and modal lifecycle toward one owner per surface. Reduces the need to edit MIDI, jog, transport, render, and Back ladders for every new modal.

### Files Likely Affected

- new `ui/context/ui_context_stack.mjs`
- new `ui/context/ui_confirm_context.mjs`
- `ui/components/ui_confirm_prompt.mjs`
- `ui/input/ui_transport_cc_workflow.mjs`
- `ui/input/ui_jog_cc_workflow.mjs`
- `ui/render/ui_screen_router_workflow.mjs`
- `ui/menu/ui_dialogs.mjs`
- `ui/ui.js`
- `tests/components/confirm-prompt.test.ts`
- new `tests/context/context-stack.test.ts`
- `tests/input/transport-cc-workflow.test.ts`
- `tests/render/screen-router-workflow.test.ts`

### Expected LOC Change

+400 to +900 LOC net over several PRs. Some later PRs should remove duplicated modal checks.

### Risk Level

Medium. Modal priority and Back behavior are user-visible and muscle-memory sensitive.

### Testing Strategy

- Unit test stack push/pop/current/empty behavior.
- Unit test capture policies and Back routing.
- Characterize the first migrated modal before integration.
- Keep legacy flags bridged until parity is proven.
- Run `pnpm test -- tests/components tests/input tests/render`.

### Rollback Strategy

Each migrated context must have a feature flag or adapter fallback to legacy flags during the PR. Roll back by routing Back/render/input to the legacy path and removing the context registration.

### Success Criteria

- At least one modal declares its input, render, and Back behavior in one context.
- Existing behavior remains unchanged.
- New modal behavior can be tested without full MIDI dispatch.

### Shippable PRs

#### PR 2.1: Add Context Stack Runtime

- Scope: stack data structure, capture result helpers, no production integration.
- Files: new `ui/context/ui_context_stack.mjs`, new `tests/context/context-stack.test.ts`.
- LOC: +150 to +280.
- Tests: context stack tests.
- Rollback: delete new files.

#### PR 2.2: Add Context Adapter in Composition Root

- Scope: instantiate context stack in `ui/ui.js` and expose it in deps, but do not route behavior yet.
- Files: `ui/ui.js`, maybe `ui/lifecycle/ui_init_workflow.mjs`.
- LOC: +30 to +90.
- Tests: lifecycle/init tests.
- Rollback: remove adapter wiring.

#### PR 2.3: Route Back Through Empty Context Stack First

- Scope: no-op behavior when stack is empty; tests prove legacy Back still runs.
- Files: `ui/input/ui_transport_cc_workflow.mjs` or current Back handler location, `tests/input/transport-cc-workflow.test.ts`.
- LOC: +40 to +100.
- Tests: transport Back tests.
- Rollback: remove pre-route call.

#### PR 2.4: Wrap Confirm Prompt as a Context

- Scope: create confirm context that delegates rendering to existing `renderConfirmPrompt` and actions to existing prompt helpers.
- Files: new `ui/context/ui_confirm_context.mjs`, `ui/components/ui_confirm_prompt.mjs`, tests.
- LOC: +120 to +260.
- Tests: context and confirm prompt tests.
- Rollback: stop registering confirm context; keep old prompt code.

#### PR 2.5: Route Confirm Prompt Screen Through Context Stack

- Scope: allow top context to capture OLED before legacy screen router.
- Files: `ui/render/ui_screen_router_workflow.mjs`, `tests/render/screen-router-workflow.test.ts`.
- LOC: +50 to +140.
- Tests: screen router tests.
- Rollback: remove context render branch.

#### PR 2.6: Route Confirm Prompt Jog/Back Through Context

- Scope: top context consumes jog rotation and Back for confirm prompt only.
- Files: `ui/input/ui_jog_cc_workflow.mjs`, `ui/input/ui_transport_cc_workflow.mjs`, tests.
- LOC: +80 to +180.
- Tests: jog and transport tests.
- Rollback: disable confirm context registration.

#### PR 2.7: Migrate Text Keyboard or Snapshot Picker

- Scope: repeat the pattern on the next simplest modal.
- Files: `ui/components/ui_text_keyboard.mjs` or `ui/persist/ui_snapshot_workflow.mjs`, render/input tests.
- LOC: +150 to +350.
- Tests: focused component/workflow/render tests.
- Rollback: unregister migrated context.

## Phase 3: Command Bus and DSP Operation Queue

### Goal

Introduce command descriptors and a DSP operation queue for a narrow structural edit family.

### Architectural Benefit

Centralizes DSP writes, optimistic mirror patches, undo policy, readback scheduling, and render invalidation for migrated operations. This reduces duplicated edit policy in feature workflows.

### Files Likely Affected

- new `ui/commands/ui_command_bus.mjs`
- new `ui/commands/ui_clip_commands.mjs`
- new `ui/dsp/ui_dsp_ops.mjs` or `ui/sync/ui_dsp_operation_queue.mjs`
- `ui/sync/ui_clip_edit_ops.mjs`
- `ui/tick/ui_tick_tasks.mjs`
- `ui/tick/ui_tick_workflow.mjs`
- `ui/core/ui_state.mjs`
- `tests/sync/clip-edit-ops.test.ts`
- new `tests/commands/command-bus.test.ts`
- `tests/tick/tick-tasks.test.ts`

### Expected LOC Change

+500 to +1200 LOC net over several PRs. Later conversions may reduce duplicated command policy.

### Risk Level

Medium to high. DSP write ordering and host coalescing are correctness-sensitive.

### Testing Strategy

- Start with descriptors that are built but not executed.
- Assert descriptor contents before changing execution.
- Mirror current `pendingDefaultSetParams` behavior exactly in queue tests.
- Run focused clip edit and tick tests.
- Use characterization tests to compare pre/post queued key/value pairs.

### Rollback Strategy

Keep legacy edit functions callable. Each conversion PR should be reversible by changing one wrapper back to the old implementation.

### Success Criteria

- One structural edit family is represented as commands.
- DSP operation timing is tested in one place.
- Undo marking and readback policy are not repeated in migrated handlers.

### Shippable PRs

#### PR 3.1: Add Command Descriptor Types and Test Helpers

- Scope: descriptor helpers only, no behavior changes.
- Files: new `ui/commands/ui_command_bus.mjs`, `ui/types.d.ts`, tests.
- LOC: +150 to +300.
- Tests: command helper tests.
- Rollback: delete new files.

#### PR 3.2: Add Clip Command Descriptors Without Execution

- Scope: build descriptors for `clearClip` and `hardResetClip`; legacy functions still execute.
- Files: new `ui/commands/ui_clip_commands.mjs`, `tests/sync/clip-edit-ops.test.ts`.
- LOC: +150 to +300.
- Tests: descriptor shape tests.
- Rollback: delete descriptor module.

#### PR 3.3: Add DSP Operation Queue in Compatibility Mode

- Scope: queue can push/unshift and drain like `S.pendingDefaultSetParams`, but no production user yet.
- Files: new `ui/sync/ui_dsp_operation_queue.mjs`, `tests/tick/tick-tasks.test.ts` or new queue tests.
- LOC: +160 to +320.
- Tests: queue drain ordering and one-per-tick tests.
- Rollback: delete queue.

#### PR 3.4: Route One Clip Command Through Command Bus

- Scope: convert only melodic `clearClipImpl` path or only `hardResetClipImpl`; keep drum path legacy if needed.
- Files: `ui/sync/ui_clip_edit_ops.mjs`, command modules, tests.
- LOC: -40 to +180.
- Tests: clip edit tests.
- Rollback: restore old branch from characterization test.

#### PR 3.5: Move Undo Marking for Migrated Command

- Scope: command bus applies `undoAvailable`, `redoAvailable`, and hybrid snapshot clearing for migrated command.
- Files: command bus, clip edit ops tests.
- LOC: +40 to +120.
- Tests: undo flag assertions.
- Rollback: move flag writes back into legacy function.

#### PR 3.6: Move Readback/Invalidation Metadata for Migrated Command

- Scope: command descriptor owns `pendingStepsReread`, LED invalidation, and redraw intent for migrated command.
- Files: command modules, `ui/sync/ui_clip_edit_ops.mjs`, tests.
- LOC: +60 to +160.
- Tests: clip edit tests plus render invalidation assertions where existing.
- Rollback: restore direct flag writes.

## Phase 4: Readback Scheduler and State Ownership

### Goal

Replace scattered pending readback flags gradually and begin splitting global state by ownership.

### Architectural Benefit

Makes optimistic DSP mirror updates explicit. Reduces coupling between edit workflows, tick timing, sync modules, and render invalidation.

### Files Likely Affected

- new `ui/sync/ui_readback_scheduler.mjs`
- `ui/tick/ui_tick_tasks.mjs`
- `ui/sync/ui_clip_track_sync.mjs`
- `ui/sync/ui_clip_state_sync.mjs`
- `ui/sync/ui_track_clip_sync_facade.mjs`
- `ui/core/ui_state.mjs`
- `ui/perform/ui_recording_workflow.mjs`
- `ui/pad/ui_pad_surface.mjs`
- `tests/tick/tick-tasks.test.ts`
- `tests/sync/*`
- `tests/perform/recording-workflow.test.ts`
- `tests/pad/pad-surface.test.ts`

### Expected LOC Change

+600 to +1400 LOC over several PRs. Net reduction is expected later when old pending fields are removed.

### Risk Level

Medium to high. Incorrect readback timing can cause UI/DSP divergence.

### Testing Strategy

- Add scheduler tests for delay, target, replacement, and cancellation.
- Convert one pending flag at a time.
- Assert existing sync calls happen on the same tick as before.
- Keep old fields as aliases during transition.
- Run `pnpm test -- tests/tick tests/sync`.

### Rollback Strategy

Each converted readback keeps a compatibility path to the old pending fields until the phase is complete. Roll back by restoring old tick checks for the specific readback type.

### Success Criteria

- At least one migrated command schedules readback through a scheduler.
- Tick code drains scheduler requests by type.
- New state roots exist inside `S` without breaking existing imports.

### Shippable PRs

#### PR 4.1: Add Readback Scheduler Runtime

- Scope: scheduler data structure and tests only.
- Files: new `ui/sync/ui_readback_scheduler.mjs`, new tests.
- LOC: +180 to +340.
- Tests: scheduler tests.
- Rollback: delete new files.

#### PR 4.2: Route Pending Steps Reread Through Scheduler

- Scope: convert `pendingStepsReread` for one command path, while preserving old fields for legacy callers.
- Files: `ui/tick/ui_tick_tasks.mjs`, `ui/sync/ui_clip_edit_ops.mjs`, scheduler tests.
- LOC: +80 to +220.
- Tests: tick and clip edit tests.
- Rollback: restore direct pending fields.

#### PR 4.3: Route Pending Drum Lane Resync Through Scheduler

- Scope: adapt `scheduleDrumLaneResync` to enqueue scheduler requests internally.
- Files: `ui/core/ui_state.mjs`, `ui/tick/ui_tick_tasks.mjs`, `tests/core/schedule-drum-lane-resync.test.ts`.
- LOC: +80 to +200.
- Tests: schedule-drum-lane-resync and tick tests.
- Rollback: restore old helper implementation.

#### PR 4.4: Introduce Nested State Roots

- Scope: add `S.app`, `S.dsp`, `S.runtime`, `S.sidecar` shells without moving fields.
- Files: `ui/core/ui_state.mjs`, `tests/core/*`.
- LOC: +80 to +180.
- Tests: state initialization/reset tests.
- Rollback: remove nested shells.

#### PR 4.5: Move Recording Runtime State Behind Recording Workflow

- Scope: move one runtime-only recording map/queue from broad state into `RecordingWorkflowState` or its existing runtime object.
- Files: `ui/perform/ui_recording_workflow.mjs`, `ui/tick/ui_tick_tasks.mjs`, recording tests.
- LOC: -50 to +250.
- Tests: recording workflow and tick tests.
- Rollback: restore old field location and adapter.

#### PR 4.6: Move Pad Surface Runtime State Behind Pad Surface

- Scope: move one pad runtime field or queue fully into `ui_pad_surface.mjs`.
- Files: `ui/pad/ui_pad_surface.mjs`, `ui/pad/ui_pad_workflow.mjs`, pad tests.
- LOC: -30 to +180.
- Tests: pad surface/workflow tests.
- Rollback: restore old field and adapter.

## Phase 5: Rendering Frames

### Goal

Make render intent testable by having renderers return screen and LED frames before host flushing.

### Architectural Benefit

Separates presentation decisions from hardware writes. Enables frame-level tests, adapter-owned caching, and explicit co-run ownership.

### Files Likely Affected

- new `ui/render/ui_screen_frame.mjs`
- new `ui/render/ui_led_frame.mjs`
- `ui/render/ui_render_surface.mjs`
- `ui/render/ui_modal_render.mjs`
- `ui/render/ui_prompt_render.mjs`
- `ui/render/ui_screen_router_workflow.mjs`
- `ui/render/ui_leds.mjs`
- `ui/render/ui_led_init_workflow.mjs`
- `tests/render/*`

### Expected LOC Change

+500 to +1300 LOC over several PRs. Early conversions may add code before direct drawing is removed.

### Risk Level

Medium. Visual regressions are likely if frame coordinates, clipping, or LED diffing are wrong.

### Testing Strategy

- Start with one simple modal screen.
- Assert frame ops, then assert adapter emits same host calls.
- Convert one small LED region separately.
- Keep existing render tests until frame tests cover equivalent behavior.
- Run `pnpm test -- tests/render`.

### Rollback Strategy

Keep direct rendering functions as the source of truth until the frame path is verified. Roll back by switching router/adapter back to direct render for the migrated surface.

### Success Criteria

- One screen surface can be tested without host display calls.
- One LED region can be tested as desired state before hardware flush.
- LED cache and palette policy remain adapter-owned.

### Shippable PRs

#### PR 5.1: Add ScreenFrame Data Model and Adapter

- Scope: define frame ops and adapter to existing render surface; no renderer conversion.
- Files: new `ui/render/ui_screen_frame.mjs`, `ui/render/ui_render_surface.mjs`, tests.
- LOC: +180 to +360.
- Tests: frame adapter tests.
- Rollback: delete new files and adapter hook.

#### PR 5.2: Convert Confirm Prompt Rendering to ScreenFrame

- Scope: add `renderConfirmPromptFrame` while keeping `renderConfirmPrompt` as adapter-backed compatibility.
- Files: `ui/components/ui_confirm_prompt.mjs`, tests.
- LOC: +80 to +180.
- Tests: confirm prompt frame and existing render tests.
- Rollback: remove frame function.

#### PR 5.3: Route Context-Owned Confirm Screen Through Frame Adapter

- Scope: when confirm context captures screen, flush frame through adapter.
- Files: context/render router modules, tests.
- LOC: +60 to +160.
- Tests: screen router/context tests.
- Rollback: route confirm context back to direct render.

#### PR 5.4: Add LedFrame Data Model

- Scope: define partial LED frame and merge/diff helpers; no production conversion.
- Files: new `ui/render/ui_led_frame.mjs`, tests.
- LOC: +180 to +360.
- Tests: LED frame merge/diff tests.
- Rollback: delete new files.

#### PR 5.5: Convert One LED Region to Partial LedFrame

- Scope: choose a small region such as transport buttons or side buttons, then feed existing `setButtonLED` adapter.
- Files: `ui/render/ui_leds.mjs`, relevant render tests.
- LOC: -40 to +220.
- Tests: LED render tests.
- Rollback: restore old region function.

#### PR 5.6: Move LED Cache Behind Adapter Interface

- Scope: wrap `lastSentNoteLED`, `lastSentButtonLED`, and invalidation behind an adapter object while preserving exports.
- Files: `ui/render/ui_leds.mjs`, `ui/render/ui_led_init_workflow.mjs`, tests.
- LOC: +120 to +300.
- Tests: LED init and LED render tests.
- Rollback: restore module-local cache access.

## Phase 6: Concept Module Deepening

### Goal

Move high-pressure behavior into deeper concept modules with narrow interfaces.

### Architectural Benefit

Reduces `S` mutation spread and makes complex behavior testable through domain seams. Keeps runtime invariants local to concepts rather than hidden in broad input/tick ladders.

### Files Likely Affected

- `ui/perform/ui_recording_workflow.mjs`
- `ui/bank/ui_bank_params.mjs`
- `ui/bank/ui_bank_state.mjs`
- `ui/input/ui_knob_cc_workflow.mjs`
- `ui/drum/ui_drum_lane_workflows.mjs`
- `ui/view/ui_session_view_workflow.mjs`
- `ui/pad/ui_pad_workflow.mjs`
- `ui/corun/ui_corun_workflow.mjs`
- `ui/render/ui_leds.mjs`
- `ui/persist/ui_persistence.mjs`
- `ui/ui.js`
- corresponding tests under `tests/perform`, `tests/bank`, `tests/drum`, `tests/view`, `tests/corun`, `tests/persist`

### Expected LOC Change

Varies by concept. Each PR should target -150 to +350 LOC net. Across the phase, expect +1000 to +2500 LOC initially, then gradual reduction in `ui/ui.js` and duplicated policy.

### Risk Level

Medium to high. These are behavior-heavy modules touching recording, bank edits, drum lanes, co-run, and persistence.

### Testing Strategy

- Characterization first for each behavior slice.
- Move one sub-slice at a time.
- Use normalized event fixtures and command descriptors where available.
- Keep old wrappers in `ui.js` until parity.
- Run focused tests for each concept plus `pnpm test`.

### Rollback Strategy

Every concept migration should preserve the old wrapper entrypoint. Roll back by pointing the wrapper back to the legacy implementation for that slice.

### Success Criteria

- Each migrated concept owns its runtime state and invariants.
- Deleting the concept module would clearly push behavior back into multiple callers.
- `ui.js` shrinks by behavior removal, not by shallow pass-through extraction.

### Shippable PRs

#### PR 6.1: Recording Workflow Drain Interface

- Scope: expose one drain method from `ui_recording_workflow.mjs` and call it from tick without changing queue semantics.
- Files: recording workflow, tick tasks, tests.
- LOC: -40 to +180.
- Tests: recording workflow and tick tests.
- Rollback: inline old tick drain path.

#### PR 6.2: Recording Arm/Disarm Interface

- Scope: move one arm/disarm transition behind Recording Workflow, preserving transport handler wrapper.
- Files: recording workflow, transport workflow, tests.
- LOC: -60 to +220.
- Tests: recording and transport tests.
- Rollback: route wrapper to old transition code.

#### PR 6.3: Parameter Bank CC Automation Slice

- Scope: move only CC automation knob-turn classification and edit application.
- Files: `ui/input/ui_knob_cc_workflow.mjs`, `ui/bank/*`, tests.
- LOC: -100 to +300.
- Tests: knob workflow and bank tests.
- Rollback: restore old CC automation branch.

#### PR 6.4: Drum Lane Clear/Reset Commands

- Scope: convert drum lane clear/reset to command descriptors after command bus is stable.
- Files: drum workflow, command modules, tests.
- LOC: -80 to +260.
- Tests: drum lane and command tests.
- Rollback: restore direct DSP write path.

#### PR 6.5: Session View Step Button Slice

- Scope: route Session View step-button behavior through `ui_session_view_workflow.mjs`.
- Files: session view workflow, step/pad input handlers, tests.
- LOC: -80 to +300.
- Tests: session/view/input tests.
- Rollback: restore legacy branch in step handler.

#### PR 6.6: Co-run Context Ownership Slice

- Scope: model one co-run ownership rule, such as LED suppression or Back/exit affordance, as a context capability.
- Files: co-run workflow, context stack, LED renderer, tests.
- LOC: +120 to +350.
- Tests: co-run and LED tests.
- Rollback: unregister co-run context capability and use old global checks.

#### PR 6.7: Sidecar Schema Shell

- Scope: add explicit sidecar schema object without changing persisted format.
- Files: `ui/persist/ui_persistence.mjs`, state types, persist tests.
- LOC: +120 to +260.
- Tests: persistence tests.
- Rollback: remove schema shell.

## Phase 7: Plugin-Style Registration

### Goal

Introduce built-in feature registration after contexts, commands, renderers, and tick tasks have stable contracts.

### Architectural Benefit

Turns extension points into declared registrations. Reduces composition-root knowledge and makes new features integrate through capabilities rather than global state and host calls.

### Files Likely Affected

- new `ui/features/ui_feature_registry.mjs`
- `ui/ui.js`
- context modules
- command modules
- render modules
- tick modules
- DSP protocol modules
- sidecar schema modules
- tests for feature registry and selected integrations

### Expected LOC Change

+400 to +1000 LOC over several PRs. Later feature registrations may reduce wiring in `ui/ui.js`.

### Risk Level

Medium. The registry can become unnecessary abstraction if introduced before contracts stabilize.

### Testing Strategy

- Start with registration data only.
- Register one low-risk built-in feature, likely confirm prompt context or one renderer.
- Assert capabilities are passed explicitly.
- Run full `pnpm verify` when wiring changes reach `ui.js`.

### Rollback Strategy

Keep direct imports/wiring in `ui.js` until each registered feature is proven. Roll back by removing a feature registration and restoring direct wiring.

### Success Criteria

- At least one built-in feature registers a context, command, renderer, or tick task.
- Feature modules receive capabilities instead of host globals.
- `ui.js` becomes thinner without losing explicit composition behavior.

### Shippable PRs

#### PR 7.1: Add Feature Registry Skeleton

- Scope: registry and capability shape only, no production features.
- Files: new `ui/features/ui_feature_registry.mjs`, tests.
- LOC: +160 to +320.
- Tests: registry tests.
- Rollback: delete new files.

#### PR 7.2: Register Confirm Context as a Built-In Feature

- Scope: move confirm context registration into feature registry.
- Files: feature registry, confirm context, `ui/ui.js`, tests.
- LOC: -20 to +180.
- Tests: context and lifecycle tests.
- Rollback: direct-register confirm context again.

#### PR 7.3: Register One Command Family

- Scope: register clip command factory through the registry.
- Files: feature registry, clip command module, command tests.
- LOC: +60 to +180.
- Tests: command and registry tests.
- Rollback: direct import command factory.

#### PR 7.4: Register One Render Surface

- Scope: register confirm prompt or another migrated frame renderer.
- Files: feature registry, render router, tests.
- LOC: +80 to +220.
- Tests: render and registry tests.
- Rollback: direct render router branch.

#### PR 7.5: Register One Tick Task

- Scope: register a migrated readback or recording drain tick task.
- Files: feature registry, tick workflow/tasks, tests.
- LOC: +80 to +240.
- Tests: tick and registry tests.
- Rollback: call tick task directly from tick pipeline.

## Program-Level Verification

Use this command before merging behavior-changing PRs:

```sh
pnpm verify
```

For docs-only PRs, markdown review is sufficient. For narrow migration PRs, run focused tests first, then full `pnpm test`; use `pnpm verify` when touching `ui/ui.js`, dependency boundaries, or shared adapters.

## Migration Stop Conditions

Pause and reassess if:

- a PR requires changing more than three unrelated feature areas
- a context migration needs broad modal priority rewrites
- a command migration changes DSP write timing without a queue test
- frame rendering causes more host writes per tick
- `ui.js` shrinks only by creating shallow pass-through modules

The goal is steady architectural leverage, not movement for its own sake.

