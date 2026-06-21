# Architecture Principles

This document defines the target architectural principles for Overture. It critiques the current architecture and the candidate template patterns, then sets the constraints that should guide future changes.

## Current Architecture Critique

The current UI has survived because it is practical: it knows the Ableton Move hardware, works around Schwung host timing, and preserves many edge cases that generic app architectures usually miss. The refactor should keep that operational knowledge.

The main architectural weaknesses are:

- `S` is too broad. It mixes DSP mirrors, UI focus, modal flags, transient hardware state, recording queues, persistence flags, render invalidation, and feature-local state.
- Current screen and modal ownership is implicit. Rendering and input priority are encoded as ordered boolean checks, not as a declared current surface.
- Input dispatch depends on scattered priority ladders. Adding a new overlay or gesture requires updating MIDI swallow rules, jog handling, Back behavior, render priority, and sometimes LEDs.
- DSP communication is stringly typed and timing-sensitive. Host coalescing workarounds leak across edit workflows, recording, live notes, tick tasks, and sync.
- Undo/redo is manual and decentralized. Edit paths remember to mark availability and schedule readback independently.
- LED rendering mixes view decisions, hardware cache policy, palette programming, co-run reclaim, and host writes.
- Co-run is cross-cutting. Its ownership rules affect input, LEDs, OLED drawing, pad maps, palette state, sound edit, and tick reconciliation.

These are not reasons for a rewrite. They are evidence that the next architecture should isolate runtime concepts and preserve hardware-specific invariants behind explicit interfaces.

## Template Pattern Critique

The template repository demonstrates useful directions:

- Hardware event normalization is a strong fit. Overture should stop routing raw MIDI bytes through feature logic.
- A context stack is useful for modal and overlay ownership. It should replace duplicated modal priority checks over time.
- Commands are useful for structural edits, undo labels, readback scheduling, and test assertions.
- Rendered LED and screen frames are useful because tests can compare intended output before host I/O.

The template is too generic for Overture as written:

- `any`-based command and context interfaces would hide the most important contracts.
- A single "every hardware interaction becomes a command" rule is too broad. Many events are navigation, pressure, transport, transient live note, co-run pass-through, or render-only state changes.
- A generic undo stack is not enough because DSP owns many undoable facts and host coalescing constrains command timing.
- A naive context stack can obscure hardware ownership. Overture needs explicit input capture, render capture, LED capture, and Back behavior per context.
- Render frames must model Move-specific constraints: 128x64 OLED, limited LED throughput during initialization, palette state, cached LED writes, and co-run reclaim.

## Superior Alternatives

Prefer Overture-specific versions of the template patterns:

- Use a typed event boundary, not raw MIDI and not `any`.
- Use a context stack with declared capabilities, not only `current().handleInput()`.
- Use command descriptors with DSP effects, mirror effects, invalidation effects, undo metadata, and readback policy, not only `apply()` and `undo()`.
- Use a DSP operation queue that owns coalescing rules, rather than scattering one-per-tick drains across workflows.
- Use render models and frame diffing. Renderers should return desired screen/LED output; host adapters should own actual writes and caches.
- Keep concept-owned runtime modules. Overture should deepen modules such as Recording Workflow, Pad Surface, Parameter Bank, Track/Clip Sync, Tick Pipeline, and Co-run instead of reorganizing by generic pattern names.

## Target Constraints

Architecture must optimize for:

- Ableton Move hardware: small OLED, limited physical controls, LED cache behavior, MIDI control surface constraints, co-run ownership conflicts, and host parameter coalescing.
- Testability: normalized input, command results, state transitions, DSP writes, readback scheduling, and render frames must be assertable without the device.
- Maintainability: each concept should own its invariants and expose a narrow interface.
- Consistent user experience: modal priority, Back behavior, LED meaning, and screen ownership must be predictable.
- Long-term extensibility: new views, commands, routes, plugins, and hardware mappings should not require edits across unrelated workflows.

## Rules of Thumb

- Prefer deep concept modules over shallow helper modules.
- Keep `ui.js` as an adapter while migrating; do not force an early composition-root rewrite.
- Move one behavior slice at a time behind tests.
- Do not introduce abstractions that erase DSP timing, ownership, or hardware constraints.
- State ownership must be explicit: UI-owned, DSP-owned mirror, sidecar-owned, runtime-only, or host-owned.
- Rendering should be a pure description step followed by an adapter-controlled flush.
- Commands should be introduced where they reduce duplicated edit, undo, readback, and invalidation logic.
- Contexts should be introduced where they remove duplicated modal routing and Back behavior.

