# Architectural Seams

This document identifies existing seams in the Overture codebase and how they can support evolutionary migration toward the target architecture. A seam is a place where behavior can be observed, tested, redirected, or owned without replacing the surrounding system.

The main conclusion: Overture already has many useful seams. The migration should preserve and deepen them rather than reorganizing the code around generic layers.

## Summary

### Existing Subsystem Boundaries To Preserve

- `midi/` as the raw MIDI and external MIDI boundary.
- `input/` as the current ordered control-surface dispatch boundary.
- `pad/` as the Pad Surface and pad interpretation boundary.
- `tick/` as the deferred-work and host-timing boundary.
- `sync/` as the DSP mirror/readback and structural edit boundary.
- `render/` as the OLED/LED presentation boundary.
- `perform/` as the performance, live-note, and recording boundary.
- `persist/` as the sidecar, snapshot, set-state, and export boundary.
- `bank/`, `drum/`, `view/`, and `corun/` as concept-oriented feature boundaries.

### Existing Abstractions To Expand

- `*Impl(S, deps)` workflow functions should continue to be the migration seam for focused tests and dependency injection.
- `ui_track_clip_sync_facade.mjs` should expand as the sync facade rather than allowing more callers to know sync ordering.
- `ui_recording_workflow.mjs` and `RecordingWorkflowState` should absorb more recording runtime state.
- `ui_pad_surface.mjs` should absorb more pad runtime state and live-note queue ownership.
- `ui_render_surface.mjs` should become the screen adapter for any future `ScreenFrame` work.
- `ui_leds.mjs` should split presentation from LED cache/palette flushing, but its cache knowledge should be preserved.
- `ui_midi_internal_workflow.mjs` should expand into the normalized hardware-event adapter.

### Areas Close To Target Architecture

- Workflow modules with injected deps and adjacent tests.
- Component modules such as confirm prompt, text keyboard, and status flash.
- Render modules with focused tests.
- Pad Surface runtime.
- Recording Workflow runtime.
- Sync facade and dependency adapters.
- Tick workflow/tasks split.
- Bank state/params modules.

### Highly Entangled Areas To Defer

- Co-run ownership across input, OLED, LEDs, palette, pad maps, and tick.
- Parameter Bank CC automation editing.
- Full command execution for musical edits before the DSP operation queue exists.
- Broad ScreenFrame or LedFrame conversion.
- Plugin-style feature registry.
- Global `S` reshaping without moving concrete ownership.

### Low-Risk Extraction Opportunities

- Normalized event constructors and optional `onNormalizedEvent` callback in MIDI routing.
- Context stack runtime with no production behavior.
- Confirm prompt context wrapper.
- Clip command descriptors without execution.
- DSP operation queue in compatibility mode.
- ScreenFrame adapter for confirm prompt only.
- LED cache adapter shell that preserves existing exports.
- Readback scheduler runtime before production use.

## Seam Catalog

## 1. Composition Root and Host Entrypoints

### Name

Composition Root / Host Entrypoint Seam

### Description

`ui/ui.js` installs host callbacks, memoizes long-lived runtime objects, wires dependency bags, and bridges host globals into feature modules.

### Files Involved

- `ui/ui.js`
- `ui/lifecycle/ui_init_workflow.mjs`
- `ui/lifecycle/ui_entrypoint_diagnostics.mjs`
- `tests/lifecycle/init-workflow.test.ts`
- `tests/lifecycle/entrypoint-diagnostics.test.ts`

### Why It Is A Seam

It is the one place where host globals, runtime singletons, and workflow modules meet. This makes it a good adapter seam for adding context stack, command bus, DSP queue, and feature capabilities without forcing feature modules to know host details.

### Coupling Level

Very high.

### Risk Level

High for behavior changes, low for additive adapter wiring.

### Candidate Migration Opportunities

- Instantiate a context stack in `ui.js` without routing behavior.
- Add a command bus and DSP operation queue as memoized runtime objects.
- Pass normalized-event callbacks through dependency bags.
- Keep `ui.js` explicit as composition root; do not hide it behind a plugin registry yet.

## 2. Global State Singleton

### Name

`S` State Singleton Seam

### Description

`ui/core/ui_state.mjs` owns the live singleton `S`, initial state creation, reset behavior, and some scheduling helpers.

### Files Involved

- `ui/core/ui_state.mjs`
- most workflow modules
- `tests/core/schedule-drum-lane-resync.test.ts`

### Why It Is A Seam

It is not a good abstraction, but it is a stable coordination point. Tests and modules already depend on the object identity of `S`, so migration can add owned runtime objects and aliases without breaking imports.

### Coupling Level

Very high.

### Risk Level

High if fields move broadly. Low if new owned state is added beside existing fields.

### Candidate Migration Opportunities

- Move concrete runtime state one concept at a time, starting with recording and pad surface.
- Add scheduler objects beside existing pending flags before replacing them.
- Avoid empty `S.app` / `S.dsp` shells unless a field migration follows immediately.
- Preserve `resetUiState()` identity semantics.

## 3. Constants and Hardware Definitions

### Name

Hardware Constants Seam

### Description

`ui/core/ui_constants.mjs` centralizes track counts, pad counts, bank definitions, colors, and Move-specific constants.

### Files Involved

- `ui/core/ui_constants.mjs`
- most workflow and render modules
- `tests/core/ui-descriptors.test.ts`

### Why It Is A Seam

The target architecture needs raw hardware mappings centralized. Existing constants are already a partial hardware boundary.

### Coupling Level

Medium to high.

### Risk Level

Low for additions, medium for renaming or moving constants.

### Candidate Migration Opportunities

- Keep hardware constants here or behind a thin `ui/input/ui_normalized_events.mjs` adapter.
- Do not scatter new MIDI numbers in feature workflows.
- Add event names that reference existing constants instead of duplicating values.

## 4. Internal MIDI Router

### Name

Raw MIDI Input Seam

### Description

`ui/midi/ui_midi_internal_workflow.mjs` parses MIDI status/data bytes, handles high-priority swallow/pass-through rules, and dispatches to CC, step, pad, touch, and aftertouch handlers.

### Files Involved

- `ui/midi/ui_midi_internal_workflow.mjs`
- `ui/input/ui_input_dispatch_workflow.mjs`
- `ui/pad/ui_pad_aftertouch_workflow.mjs`
- `tests/midi/midi-internal-workflow.test.ts`

### Why It Is A Seam

It is already the boundary between raw Move MIDI and semantic UI behavior. Adding normalized events here is high leverage and low risk if legacy dispatch remains unchanged.

### Coupling Level

Medium.

### Risk Level

Low for observer-style event emission, medium for changing dispatch consumers.

### Candidate Migration Opportunities

- Add normalized event constructors.
- Add optional `deps.onNormalizedEvent(event)` for tests and future routers.
- Keep swallow rules exactly where they are until contexts take over one modal at a time.
- Do not turn MIDI events directly into commands.

## 5. CC Input Dispatch

### Name

Ordered CC Dispatch Seam

### Description

`ui/input/ui_input_dispatch_workflow.mjs` fans CC messages into jog, button, transport, side-button, step-edit, navigation, and knob workflows.

### Files Involved

- `ui/input/ui_input_dispatch_workflow.mjs`
- `ui/input/ui_jog_cc_workflow.mjs`
- `ui/input/ui_button_cc_workflow.mjs`
- `ui/input/ui_transport_cc_workflow.mjs`
- `ui/input/ui_side_button_workflow.mjs`
- `ui/input/ui_navigation_cc_workflow.mjs`
- `ui/input/ui_knob_cc_workflow.mjs`
- `tests/input/*`

### Why It Is A Seam

The dispatch order is load-bearing. Because it is already centralized by control family, it can route to contexts before legacy handlers while preserving fallback behavior.

### Coupling Level

High.

### Risk Level

Medium to high. Ordering mistakes are user-visible.

### Candidate Migration Opportunities

- Add context-stack pre-routing for Back and simple modal jog handling.
- Convert tests to use normalized events gradually.
- Preserve existing handler order until each context migration has characterization tests.
- Defer broad reordering or generic router replacement.

## 6. Jog Workflow

### Name

Jog Priority Ladder Seam

### Description

`ui/input/ui_jog_cc_workflow.mjs` owns main encoder behavior across modal pickers, menus, sound edit, reset gestures, interval/alt toggles, and normal movement.

### Files Involved

- `ui/input/ui_jog_cc_workflow.mjs`
- `ui/menu/ui_clear_auto_workflow.mjs`
- `ui/menu/ui_global_menu.mjs`
- `ui/persist/ui_snapshot_workflow.mjs`
- `tests/input/jog-cc-workflow.test.ts`

### Why It Is A Seam

It is where modal input priority is most visible. A context stack can be introduced here by letting the top context consume jog events before the legacy ladder.

### Coupling Level

High.

### Risk Level

High for broad changes, medium for one simple modal.

### Candidate Migration Opportunities

- Route confirm prompt jog changes through a context.
- Keep picker/menu/sound-edit behavior legacy until multiple simpler contexts are stable.
- Use tests to pin priority before moving each modal.

## 7. Transport and Back Handling

### Name

Back / Transport Seam

### Description

Transport workflow handles Play, Record, Undo/Redo, Back, and modifier variants. Back currently closes a known list of surfaces before global suspend/hide behavior.

### Files Involved

- `ui/input/ui_transport_cc_workflow.mjs`
- `ui/perform/ui_recording_workflow.mjs`
- `ui/perform/ui_live_note_workflow.mjs`
- `tests/input/transport-cc-workflow.test.ts`

### Why It Is A Seam

Back behavior is the smallest useful integration point for the context stack. It can be routed through an empty stack first without changing behavior.

### Coupling Level

High.

### Risk Level

Medium to high.

### Candidate Migration Opportunities

- Add no-op context-stack Back pre-route.
- Let confirm prompt consume Back.
- Defer Record/Play refactors until Recording Workflow and command boundaries are stronger.

## 8. Pad Surface Runtime

### Name

Pad Surface Seam

### Description

`ui/pad/ui_pad_surface.mjs` owns pad runtime state such as pitch tracking, press tick tracking, and live-note queues. Pad workflows interpret Session View and Track View pad interactions.

### Files Involved

- `ui/pad/ui_pad_surface.mjs`
- `ui/pad/ui_pad_workflow.mjs`
- `ui/pad/ui_pad_aftertouch_workflow.mjs`
- `tests/pad/pad-surface.test.ts`
- `tests/pad/pad-workflow.test.ts`
- `tests/pad/pad-aftertouch-workflow.test.ts`

### Why It Is A Seam

It already has concept-owned runtime state outside `S`, which matches the target architecture.

### Coupling Level

Medium.

### Risk Level

Medium.

### Candidate Migration Opportunities

- Move remaining pad runtime fields out of `S` when clear.
- Consume normalized pad events in tests first.
- Keep live-note performance paths direct and do not force them through commands.

## 9. Recording Workflow

### Name

Recording Runtime Seam

### Description

`ui/perform/ui_recording_workflow.mjs` already defines `RecordingWorkflowState` and owns several live-note/drum recording queues and predicates.

### Files Involved

- `ui/perform/ui_recording_workflow.mjs`
- `ui/perform/ui_live_note_workflow.mjs`
- `ui/input/ui_transport_cc_workflow.mjs`
- `ui/tick/ui_tick_tasks.mjs`
- `tests/perform/recording-workflow.test.ts`
- `tests/perform/recording-predicates.test.ts`
- `tests/tick/tick-tasks.test.ts`

### Why It Is A Seam

Recording spans transport, pads, MIDI, tick drains, DSP writes, and readbacks. The existing workflow state is a strong starting point for owning that complexity.

### Coupling Level

High.

### Risk Level

Medium to high.

### Candidate Migration Opportunities

- First expose a drain interface and call it from tick.
- Move arm/disarm transitions later.
- Move runtime queues before changing user-visible recording behavior.
- Coordinate with DSP operation queue before changing write timing.

## 10. Live Note Dispatch

### Name

Live Note / Route Dispatch Seam

### Description

Live note behavior chooses between DSP live notes, external MIDI, Move-native route payloads, and Schwung shadow MIDI depending on route and message type.

### Files Involved

- `ui/perform/ui_live_note_workflow.mjs`
- `ui/core/ui_routes.mjs`
- `ui/midi/ui_midi_external_workflow.mjs`
- `ui/pad/ui_pad_workflow.mjs`
- `tests/perform/live-note-workflow.test.ts`
- `tests/midi/midi-external-workflow.test.ts`

### Why It Is A Seam

It is a natural boundary for route descriptors. It should remain performance-oriented and not become an undoable command path.

### Coupling Level

Medium to high.

### Risk Level

Medium.

### Candidate Migration Opportunities

- Add explicit route target descriptors.
- Test chosen output route without hardware.
- Defer until normalized input exists and recording drains are stable.

## 11. Tick Workflow

### Name

Tick Pipeline Seam

### Description

`ui/tick/ui_tick_workflow.mjs` orchestrates per-tick work and `ui/tick/ui_tick_tasks.mjs` owns most delayed tasks.

### Files Involved

- `ui/tick/ui_tick_workflow.mjs`
- `ui/tick/ui_tick_tasks.mjs`
- `ui/tick/ui_tick_adapters.mjs`
- `tests/tick/ui_tick_workflow.test.ts`
- `tests/tick/tick-tasks.test.ts`

### Why It Is A Seam

The tick layer already exists because the hardware and DSP require delayed work. It is the right place to call a DSP operation queue, readback scheduler, recording drain, persistence jobs, and render flushes.

### Coupling Level

High.

### Risk Level

High for reordering, medium for adding explicit phases that preserve order.

### Candidate Migration Opportunities

- Add DSP operation queue drain in compatibility mode.
- Replace one pending readback flag with scheduler drain after tests.
- Move recording drain behind Recording Workflow.
- Do not rewrite the tick pipeline as a generic scheduler.

## 12. Deferred DSP Set Param Queue

### Name

Pending Set Param Seam

### Description

`S.pendingDefaultSetParams`, `S.clearDrainHold`, and related tick drains represent an existing informal DSP operation queue.

### Files Involved

- `ui/core/ui_state.mjs`
- `ui/tick/ui_tick_tasks.mjs`
- `ui/sync/ui_clip_edit_ops.mjs`
- `ui/bank/ui_bank_params.mjs`
- `tests/tick/tick-tasks.test.ts`
- `tests/sync/clip-edit-ops.test.ts`

### Why It Is A Seam

It already encodes host coalescing policy. A formal DSP operation queue should preserve this behavior first, then absorb more write paths.

### Coupling Level

High.

### Risk Level

Medium in compatibility mode, high when changing production writers.

### Candidate Migration Opportunities

- Create a queue API that mirrors current push/unshift/drain semantics.
- Add ordering and one-per-tick tests.
- Route one low-risk clip command through it.
- Defer broad command bus execution until this seam is stable.

## 13. DSP Sync Facade

### Name

Track / Clip Sync Facade Seam

### Description

`ui/sync/ui_track_clip_sync_facade.mjs` assembles clip, track, drum, bank, and state sync operations behind a facade.

### Files Involved

- `ui/sync/ui_track_clip_sync_facade.mjs`
- `ui/sync/ui_clip_state_sync.mjs`
- `ui/sync/ui_clip_track_sync.mjs`
- `ui/sync/ui_sync_adapters.mjs`
- `tests/sync/track-clip-sync-facade.test.ts`
- `tests/sync/clip-state-sync.test.ts`
- `tests/sync/clip-track-sync.test.ts`

### Why It Is A Seam

It already hides readback details and host adapter dependencies. It is the natural consumer of future readback scheduler requests.

### Coupling Level

Medium.

### Risk Level

Medium.

### Candidate Migration Opportunities

- Route scheduler requests to facade methods.
- Keep sync ordering inside the facade.
- Add typed protocol helpers gradually for high-churn key families.

## 14. Structural Clip Edit Operations

### Name

Clip Command Candidate Seam

### Description

`ui/sync/ui_clip_edit_ops.mjs` performs clear/copy/cut/reset/select/double-fill operations and updates both DSP commands and JS mirrors.

### Files Involved

- `ui/sync/ui_clip_edit_ops.mjs`
- `ui/sync/ui_track_clip_sync_facade.mjs`
- `ui/render/ui_leds.mjs`
- `ui/core/ui_state.mjs`
- `tests/sync/clip-edit-ops.test.ts`

### Why It Is A Seam

These operations are already grouped by structural edit concept. They are the best first candidates for command descriptors because tests can assert queued DSP ops, mirror patches, undo flags, and readback scheduling.

### Coupling Level

High.

### Risk Level

Medium for descriptors, high for execution changes.

### Candidate Migration Opportunities

- Add command descriptors for clear/reset without executing them.
- Route one melodic clear/reset branch through the DSP operation queue.
- Move undo marking and invalidation metadata into the command descriptor gradually.

## 15. Readback Pending Flags

### Name

Readback Scheduling Seam

### Description

Pending fields such as `pendingStepsReread`, `pendingDrumResync`, `pendingDrumLaneResync`, `pendingUndoSync`, and `pendingDspSync` coordinate delayed mirror reconciliation.

### Files Involved

- `ui/core/ui_state.mjs`
- `ui/tick/ui_tick_tasks.mjs`
- `ui/sync/*`
- `tests/tick/tick-tasks.test.ts`
- `tests/core/schedule-drum-lane-resync.test.ts`

### Why It Is A Seam

These flags already express readback intent, just without a common request model. They can be converted one type at a time.

### Coupling Level

High.

### Risk Level

High if timing changes.

### Candidate Migration Opportunities

- Add scheduler runtime with no production users.
- Convert pending steps reread after one command uses descriptor metadata.
- Convert drum lane resync through `scheduleDrumLaneResync`.
- Keep old flags as compatibility aliases during transition.

## 16. Render Surface

### Name

OLED Host Adapter Seam

### Description

`ui/render/ui_render_surface.mjs` wraps host display primitives and helper drawing functions.

### Files Involved

- `ui/render/ui_render_surface.mjs`
- `ui/render/ui_screen_router_workflow.mjs`
- render modules under `ui/render/`
- `tests/render/*`

### Why It Is A Seam

It is the existing place to adapt render intent to host calls. Any `ScreenFrame` work should use this seam rather than bypassing it.

### Coupling Level

Medium.

### Risk Level

Low for additive frame adapter, medium for converting screens.

### Candidate Migration Opportunities

- Add `ScreenFrame` adapter methods.
- Convert confirm prompt rendering first.
- Keep direct drawing for complex Track View and Session View screens until needed.

## 17. Screen Router

### Name

Screen Ownership Seam

### Description

`ui/render/ui_screen_router_workflow.mjs` selects which full-screen or overlay renderer owns the OLED.

### Files Involved

- `ui/render/ui_screen_router_workflow.mjs`
- `ui/menu/ui_dialogs.mjs`
- `ui/render/ui_modal_render.mjs`
- `ui/render/ui_prompt_render.mjs`
- `tests/render/screen-router-workflow.test.ts`

### Why It Is A Seam

It centralizes much of current screen priority. It is the integration point where context-owned screens can be offered first, then fall back to the legacy router.

### Coupling Level

High.

### Risk Level

Medium to high.

### Candidate Migration Opportunities

- Add top-context screen capture before legacy routing.
- Route only confirm prompt first.
- Avoid full router rewrite or screen enum migration early.

## 18. Render Modules

### Name

Focused Renderer Seam

### Description

Most OLED screens already have separate render modules and adjacent tests.

### Files Involved

- `ui/render/ui_idle_render.mjs`
- `ui/render/ui_session_overview_render.mjs`
- `ui/render/ui_perf_render.mjs`
- `ui/render/ui_bank_render.mjs`
- `ui/render/ui_step_edit_render.mjs`
- `ui/render/ui_modal_render.mjs`
- `ui/render/ui_prompt_render.mjs`
- `ui/render/ui_sound_edit_render.mjs`
- `tests/render/*`

### Why It Is A Seam

The render modules can be tested and converted selectively. This is already close to the target architecture, except render intent is usually host calls rather than frame data.

### Coupling Level

Low to medium.

### Risk Level

Low for tests and simple renderers, medium for high-density views.

### Candidate Migration Opportunities

- Add frame rendering only for simple or fragile screens.
- Preserve existing direct render modules where they are already testable.
- Do not do blanket ScreenFrame conversion.

## 19. LED Rendering and Cache

### Name

LED Adapter / Presentation Seam

### Description

`ui/render/ui_leds.mjs` owns LED presentation, hardware write caching, force resend, co-run special cases, and invalidation.

### Files Involved

- `ui/render/ui_leds.mjs`
- `ui/render/ui_led_init_workflow.mjs`
- `ui/render/ui_perf_leds.mjs`
- `tests/render/led-init-workflow.test.ts`
- `tests/render/melodic-pad-leds.test.ts`
- `tests/render/perf-leds.test.ts`
- `tests/render/sound-leds.test.ts`

### Why It Is A Seam

It is already the central LED boundary. The target architecture should split adapter policy from presentation meaning without losing cache and palette knowledge.

### Coupling Level

High.

### Risk Level

Medium to high.

### Candidate Migration Opportunities

- Wrap last-sent caches behind an adapter object while preserving exports.
- Add partial LED frame helpers only after cache ownership is clearer.
- Defer co-run LED ownership migration until this adapter exists.

## 20. LED Initialization

### Name

LED Init Throughput Seam

### Description

`ui/render/ui_led_init_workflow.mjs` initializes LEDs over multiple frames and handles palette setup.

### Files Involved

- `ui/render/ui_led_init_workflow.mjs`
- `ui/render/ui_leds.mjs`
- `tests/render/led-init-workflow.test.ts`

### Why It Is A Seam

It already isolates a Move-specific hardware constraint: not all LEDs should be initialized in one frame.

### Coupling Level

Medium.

### Risk Level

Medium.

### Candidate Migration Opportunities

- Keep throughput policy here or in the future LED adapter.
- Do not fold this into generic rendering.
- Add tests before changing palette or force-resend behavior.

## 21. Menu System

### Name

Descriptor-Based Menu Seam

### Description

`ui/menu/ui_global_menu.mjs` builds menu items from descriptors and Schwung menu primitives. `ui/menu/ui_dialogs.mjs` renders menu and related dialog surfaces.

### Files Involved

- `ui/menu/ui_global_menu.mjs`
- `ui/menu/ui_dialogs.mjs`
- `ui/menu/ui_clear_auto_workflow.mjs`
- `tests/menu/global-menu.test.ts`
- `tests/menu/clear-auto-workflow.test.ts`

### Why It Is A Seam

Menu items are already descriptor-like, which is close to the target idea of declared context/command behavior. However closures still reach into `S` and deps directly.

### Coupling Level

Medium to high.

### Risk Level

Medium.

### Candidate Migration Opportunities

- Convert simple menu actions to command descriptors after command bus exists.
- Move menu open/close behavior behind context stack later.
- Defer global menu context migration until simpler modals are stable.

## 22. Confirm Prompt Component

### Name

Small Modal Component Seam

### Description

`ui/components/ui_confirm_prompt.mjs` owns prompt creation, rotation, action selection, and rendering.

### Files Involved

- `ui/components/ui_confirm_prompt.mjs`
- `tests/components/confirm-prompt.test.ts`
- future `ui/context/ui_confirm_context.mjs`

### Why It Is A Seam

It is small, pure enough, and already tested. It is the best first context candidate.

### Coupling Level

Low.

### Risk Level

Low to medium.

### Candidate Migration Opportunities

- Wrap it in a context.
- Add `ScreenFrame` output after context routing works.
- Keep existing render function as compatibility adapter.

## 23. Text Keyboard Component

### Name

Text Entry Modal Seam

### Description

`ui/components/ui_text_keyboard.mjs` owns text keyboard behavior and is already separately tested.

### Files Involved

- `ui/components/ui_text_keyboard.mjs`
- `tests/components/text-keyboard.test.ts`

### Why It Is A Seam

It is another context candidate after confirm prompt. It has more state than confirm prompt but still has a focused component boundary.

### Coupling Level

Low to medium.

### Risk Level

Medium.

### Candidate Migration Opportunities

- Migrate after confirm prompt proves context stack integration.
- Keep text buffer inside context state eventually.
- Avoid using it as the very first context migration.

## 24. Snapshot and Inherit Pickers

### Name

Persistence Picker Seam

### Description

Snapshot and inherit workflows live under `persist/` and own picker state, confirmation state, and state-file operations.

### Files Involved

- `ui/persist/ui_snapshot_workflow.mjs`
- `ui/persist/ui_inherit_picker_workflow.mjs`
- `ui/persist/ui_persistence.mjs`
- `tests/persist/snapshot-workflow.test.ts`
- `tests/persist/inherit-picker-workflow.test.ts`

### Why It Is A Seam

These are concept-owned workflows with tests. They are good later context candidates because their modal state should eventually leave broad `S` flags.

### Coupling Level

Medium.

### Risk Level

Medium.

### Candidate Migration Opportunities

- Wrap picker state in context after simpler modals.
- Keep file persistence APIs isolated.
- Defer if active set/state-file behavior is being changed elsewhere.

## 25. Persistence and Sidecar

### Name

Sidecar Persistence Seam

### Description

`ui/persist/ui_persistence.mjs` owns active-set paths, sidecar save/restore, state-file copying, snapshots, and action popups.

### Files Involved

- `ui/persist/ui_persistence.mjs`
- `ui/persist/ui_export.mjs`
- `ui/persist/ui_snapshot_workflow.mjs`
- `tests/persist/*`

### Why It Is A Seam

It is already a subsystem boundary. It should be preserved and later get schema ownership when persistence changes are active.

### Coupling Level

High.

### Risk Level

High for format changes, low for tests and schema shell.

### Candidate Migration Opportunities

- Add sidecar schema only when moving real fields.
- Keep UI-owned persisted state distinct from DSP mirror state.
- Avoid persistence refactors during command/DSP queue migration.

## 26. Export Workflow

### Name

Export Flow Seam

### Description

`ui/persist/ui_export.mjs` owns Ableton export request, confirmation, polling, and completion behavior.

### Files Involved

- `ui/persist/ui_export.mjs`
- `ui/menu/ui_dialogs.mjs`
- `ui/tick/ui_tick_tasks.mjs`
- persist/export tests if added

### Why It Is A Seam

It is a bounded workflow with modal and tick behavior. It can later become a context-owned workflow, but it is not an early migration target.

### Coupling Level

Medium.

### Risk Level

Medium.

### Candidate Migration Opportunities

- Add focused tests before any migration.
- Convert export confirmation to context after confirm prompt and snapshot picker.
- Keep polling in tick until a general job model exists.

## 27. Parameter Bank

### Name

Parameter Bank Seam

### Description

`bank/` owns parameter bank state and reads/writes, while `ui/input/ui_knob_cc_workflow.mjs` owns much of the knob-turn behavior.

### Files Involved

- `ui/bank/ui_bank_params.mjs`
- `ui/bank/ui_bank_state.mjs`
- `ui/input/ui_knob_cc_workflow.mjs`
- `ui/render/ui_bank_render.mjs`
- `ui/render/ui_bank_chrome_render.mjs`
- `tests/bank/*`
- `tests/input/knob-cc-workflow.test.ts`
- `tests/render/bank-render.test.ts`

### Why It Is A Seam

There is already a bank concept boundary, but behavior is split between bank modules, knob input, render, DSP writes, automation, and recording. It is high payoff but not low risk.

### Coupling Level

High.

### Risk Level

High.

### Candidate Migration Opportunities

- Move only CC automation classification first, after normalized input and command/readback policy exist.
- Keep render modules separate.
- Do not attempt a full bank rewrite.

## 28. Drum Workflows

### Name

Drum Lane / Repeat Seam

### Description

`drum/` owns drum clip sync, lane workflows, repeat modes, lane copy/clear/reset, and repeat groove edits.

### Files Involved

- `ui/drum/ui_drum_clip_sync.mjs`
- `ui/drum/ui_drum_lane_workflows.mjs`
- `ui/drum/ui_drum_repeat_workflows.mjs`
- `tests/drum/*`

### Why It Is A Seam

The drum concept is already separated and tested. It can adopt command descriptors for lane operations after clip commands prove the pattern.

### Coupling Level

Medium to high.

### Risk Level

Medium to high.

### Candidate Migration Opportunities

- Convert lane clear/reset to command descriptors after clip commands.
- Route drum lane resync through scheduler later.
- Preserve drum-specific sync and repeat invariants in drum modules.

## 29. Session View Workflow

### Name

Session View Seam

### Description

`ui/view/ui_session_view_workflow.mjs` owns some Session View behavior, but session behavior still spans step buttons, pads, side buttons, copy/delete/mute modifiers, and performance state.

### Files Involved

- `ui/view/ui_session_view_workflow.mjs`
- `ui/input/ui_button_cc_workflow.mjs`
- `ui/input/ui_side_button_workflow.mjs`
- `ui/pad/ui_pad_workflow.mjs`
- `ui/render/ui_session_overview_render.mjs`
- `tests/render/session-overview-render.test.ts`

### Why It Is A Seam

It is a concept boundary that can be deepened. It is not yet the full owner of Session View input behavior.

### Coupling Level

High.

### Risk Level

High.

### Candidate Migration Opportunities

- Move one step-button Session View slice after normalized input exists.
- Keep pad and side-button behavior legacy until tests cover modifier priority.
- Do not move all Session View behavior at once.

## 30. Track View Step Workflow

### Name

Track View Step Edit Seam

### Description

`ui/view/ui_track_view_step_workflow.mjs` owns Track View step behavior, with rendering in step edit modules and input in step/button workflows.

### Files Involved

- `ui/view/ui_track_view_step_workflow.mjs`
- `ui/render/ui_step_edit_render.mjs`
- `ui/render/ui_step_interval_render.mjs`
- `ui/input/ui_button_cc_workflow.mjs`
- `tests/view/track-view-step-workflow.test.ts`
- `tests/render/step-edit-render.test.ts`

### Why It Is A Seam

It is already a focused workflow with tests. It can remain as a concept module and should not be dissolved into generic input or command layers.

### Coupling Level

Medium.

### Risk Level

Medium.

### Candidate Migration Opportunities

- Use normalized step events in tests.
- Introduce commands only for committed structural edits, not held-step UI state.
- Preserve existing workflow boundary.

## 31. Co-run Workflow

### Name

Co-run Ownership Seam

### Description

`ui/corun/ui_corun_workflow.mjs` owns Schwung chain-editor co-run and Move-native co-run entry/exit behavior.

### Files Involved

- `ui/corun/ui_corun_workflow.mjs`
- `ui/render/ui_leds.mjs`
- `ui/render/ui_screen_router_workflow.mjs`
- `ui/pad/ui_pad_workflow.mjs`
- `ui/input/*`
- `ui/tick/ui_tick_tasks.mjs`
- `tests/corun/corun-workflow.test.ts`

### Why It Is A Seam

It is a named concept boundary, but its effects are cross-cutting. It should eventually become context-owned, but only after context and LED adapter seams are stable.

### Coupling Level

Very high.

### Risk Level

Very high.

### Candidate Migration Opportunities

- Add characterization tests for enter/exit and LED reclaim.
- Model one ownership rule as a context capability later.
- Defer broad co-run migration.

## 32. Sound Edit

### Name

Sound Edit Seam

### Description

Sound edit behavior and rendering are split across core and render modules.

### Files Involved

- `ui/core/ui_sound_edit.mjs`
- `ui/core/ui_sound_edit_model.mjs`
- `ui/core/ui_sound_preset_manager.mjs`
- `ui/render/ui_sound_edit_render.mjs`
- `tests/render/sound-leds.test.ts`

### Why It Is A Seam

The model/render split is close to the target architecture. However sound edit also has modal/co-run characteristics and host shadow APIs.

### Coupling Level

Medium to high.

### Risk Level

Medium to high.

### Candidate Migration Opportunities

- Preserve model/render split.
- Add tests before moving input ownership.
- Defer context migration until simpler contexts and co-run boundaries are stable.

## 33. Component Helpers

### Name

Pure Component Seam

### Description

Small component modules own reusable UI concepts with focused tests.

### Files Involved

- `ui/components/ui_confirm_prompt.mjs`
- `ui/components/ui_status_flash.mjs`
- `ui/components/ui_text_keyboard.mjs`
- `tests/components/*`

### Why It Is A Seam

These modules are close to target architecture because they are small, testable, and not deeply tied to host state.

### Coupling Level

Low.

### Risk Level

Low.

### Candidate Migration Opportunities

- Use them as first context and frame-rendering candidates.
- Keep them independent of `S` where possible.
- Do not absorb them into menu/dialog monoliths.

## 34. Dependency Adapter Pattern

### Name

`*Impl(S, deps)` Seam

### Description

Many modules export implementation functions that accept `S` plus a dependency bag. Tests fake dependencies directly.

### Files Involved

- many `ui/**/*_workflow.mjs`
- `ui/sync/ui_sync_adapters.mjs`
- `ui/tick/ui_tick_adapters.mjs`
- tests across all folders

### Why It Is A Seam

This is the most useful existing testing seam. It allows behavior to move behind new adapters without needing device hardware or global host APIs.

### Coupling Level

Medium.

### Risk Level

Low when preserved, high if replaced abruptly.

### Candidate Migration Opportunities

- Introduce context stack, command bus, DSP queue, and render invalidator as deps.
- Keep existing `*Impl` exports during migration.
- Avoid dependency bag bloat by moving cohesive capability objects in slowly.

## 35. Tests As Seam Map

### Name

Existing Test Boundary Seam

### Description

The test tree mirrors many runtime concepts: input, MIDI, pad, perform, persist, render, sync, tick, drum, bank, view, and components.

### Files Involved

- `tests/input/*`
- `tests/midi/*`
- `tests/pad/*`
- `tests/perform/*`
- `tests/persist/*`
- `tests/render/*`
- `tests/sync/*`
- `tests/tick/*`
- `tests/drum/*`
- `tests/bank/*`
- `tests/view/*`
- `tests/components/*`

### Why It Is A Seam

The tests show where behavior is already observable. Migration should follow existing test boundaries before inventing new abstraction layers.

### Coupling Level

Low to medium.

### Risk Level

Low.

### Candidate Migration Opportunities

- Add characterization tests at existing seams before moving behavior.
- Convert tests to normalized events one workflow at a time.
- Add command/queue/frame tests beside existing behavior tests.

## Preservation Recommendations

- Preserve folder-level concept boundaries. They are imperfect, but they reflect real runtime concepts.
- Preserve dependency-injected `*Impl` functions as the primary test seam.
- Preserve `ui.js` as explicit composition root for now.
- Preserve tick as the place where delayed hardware/DSP work is coordinated.
- Preserve direct renderers where they are already simple and tested.
- Preserve live-note fast paths outside undoable commands.

## Expansion Recommendations

- Expand raw MIDI routing into hardware event normalization.
- Expand confirm/text components into context-owned modal surfaces.
- Expand pending set-param behavior into a DSP operation queue.
- Expand clip edit operations into command descriptors.
- Expand sync facade into readback scheduler target.
- Expand Recording Workflow and Pad Surface runtime ownership.
- Expand LED handling into an adapter that owns cache, palette, forced resend, and co-run suppression.

## Deferral Recommendations

- Defer co-run context migration until context stack and LED adapter exist.
- Defer Parameter Bank behavior migration until command/readback policy is established.
- Defer broad ScreenFrame and LedFrame conversion.
- Defer plugin registry until there are several stable registered capabilities.
- Defer broad `S` restructuring until fields can move into real owners.

## Low-Risk Starting Points

1. Add normalized input event constructors and optional MIDI observer callback.
2. Add context stack runtime without production behavior.
3. Wrap confirm prompt as the first context.
4. Add clip command descriptors without execution.
5. Add DSP operation queue in compatibility mode.
6. Add readback scheduler runtime without production use.
7. Add `ScreenFrame` support for confirm prompt only.
8. Wrap LED caches behind an adapter while preserving existing exports.

These are evolutionary migrations. Each one can ship without requiring a rewrite, and each one creates a stronger seam for the next step.

