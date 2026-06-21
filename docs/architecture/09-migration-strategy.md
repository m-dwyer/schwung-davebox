# Migration Strategy

Overture should migrate by stabilizing boundaries around existing behavior, not by rewriting the UI. The current architecture contains many hardware and DSP invariants that must be preserved.

## Migration Principles

- Incremental migration only.
- Characterize behavior before moving risky code.
- Keep `ui.js` as the composition adapter until new modules earn ownership.
- Prefer concept modules over generic layers.
- Preserve DSP timing behavior before improving shape.
- Keep legacy flags and new contexts bridged temporarily where useful.
- Remove compatibility bridges after each migrated slice is stable.

## Phase 0: Baseline and Architecture Contracts

Deliverables:

- keep `00-current-architecture.md` as current-state reference
- adopt these target docs as architectural direction
- identify first migration slice
- add missing characterization tests around that slice

Recommended first slice: confirmation prompt or text keyboard for context migration, plus clip clear/reset for command migration.

## Phase 1: Hardware Event Normalization

Introduce normalized input events while keeping existing dispatch ladders.

Tasks:

- create event types for pads, steps, buttons, encoders, knob touch, aftertouch, and transport
- adapt internal MIDI parsing to emit normalized events
- keep legacy handlers as consumers
- add tests mapping raw MIDI to normalized events

Outcome:

- hardware mapping becomes centralized
- feature tests can inject semantic events

## Phase 2: Context Stack for Simple Modals

Add the context stack and migrate simple modal surfaces.

Tasks:

- implement context runtime with capture policies
- route Back through context stack first
- migrate one confirmation prompt
- migrate text keyboard or snapshot picker next
- bridge old `S` flags during transition

Outcome:

- modal input/render/Back behavior starts living together
- new surfaces no longer require edits across every input ladder

## Phase 3: Command Bus and DSP Operation Queue

Introduce command descriptors for a narrow structural edit family.

Tasks:

- define command descriptor shape
- implement command executor with fakeable capabilities
- add DSP operation queue with current coalescing behavior
- convert one clip or drum command family
- centralize undo availability for migrated commands

Outcome:

- command tests can assert DSP writes, mirror patches, readbacks, and invalidation
- host timing policy starts moving out of feature handlers

## Phase 4: Readback Scheduler and State Ownership

Replace scattered pending readback flags gradually.

Tasks:

- add readback request types
- route one migrated command family through scheduler
- move sync execution behind scheduler handlers
- split `S` into nested roots for app, dsp, runtime, and sidecar state
- move runtime-only state for Recording Workflow or Pad Surface

Outcome:

- optimistic mirror behavior becomes explicit
- state ownership becomes visible without requiring a full store rewrite

## Phase 5: Rendering Frames

Move rendering toward frame production and adapter flushing.

Tasks:

- define `ScreenFrame` and `LedFrame`
- convert one modal screen renderer
- convert one LED region
- put LED cache and palette behavior behind an adapter
- add frame tests

Outcome:

- render intent is testable before host writes
- LED ownership and co-run reclaim become explicit adapter policy

## Phase 6: Concept Module Deepening

Migrate the highest-pressure runtime concepts one at a time.

Suggested order:

1. Recording Workflow
2. Parameter Bank CC automation slice
3. Drum Lane Workflow write operations
4. Session View step/pad behavior
5. Co-run context and LED ownership
6. Persistence and sidecar schema

Each migration should:

- add characterization tests
- define the concept interface
- move the smallest coherent behavior slice
- keep legacy adapters
- remove old duplicated policy after parity

## Phase 7: Plugin-Style Registration

After contexts, commands, renderers, and tick tasks have stable contracts, introduce built-in feature registration.

Tasks:

- register built-in contexts
- register command factories
- register renderers
- register tick tasks
- register DSP protocol helpers
- register sidecar schema patches

Outcome:

- new features can integrate through declared extension points
- `ui.js` becomes a composition root instead of a behavioral hub

## Risks

- Moving modal priority too early can regress muscle-memory behavior.
- Centralizing DSP writes without preserving coalescing behavior can break edits on hardware.
- A generic command system can become boilerplate if applied to transient input.
- A context stack can hide priority if capture policies are not explicit.
- Frame rendering can increase work per tick if diffing and dirty scopes are ignored.

## Success Criteria

The migration is working when:

- new modal surfaces register one context and do not touch unrelated handlers
- new structural edits are represented as command descriptors
- DSP write timing is testable through the operation queue
- renderers can be tested without host display calls
- LED ownership is explicit during co-run
- `S` has fewer top-level fields and clearer ownership
- `ui.js` mostly wires capabilities rather than implementing behavior

