# Testing Strategy

The target architecture should make hardware behavior testable without hardware. Tests should verify normalized input, state changes, command descriptors, DSP operations, readback scheduling, and rendered frames.

## Current Strengths

The project already has a broad test suite around workflows, rendering helpers, sync, input dispatch, lifecycle, and components. Existing `*Impl` functions and dependency bags are a useful test seam.

The migration should build on this rather than replace it.

## Current Gaps

Important behavior is still hard to test because:

- raw MIDI routing and feature behavior are often coupled
- modal priority is spread across handlers
- DSP writes are string outputs from many call sites
- host coalescing policy is not centralized
- render intent is often only observable as drawing calls
- LED meaning and LED flushing are mixed
- undo/redo availability is manually set across workflows

## Test Layers

### Protocol Tests

Assert DSP key and payload compatibility.

Examples:

- command encodes the same `set_param` key as legacy code
- readback parser handles current DSP payload
- invalid track/clip/bank values are rejected

### Command Tests

Assert command descriptors and command execution effects.

Examples:

- clip clear emits expected DSP op
- command marks undo policy
- command schedules targeted readback
- command invalidates screen and LEDs
- command applies expected optimistic mirror patch

### Context Tests

Assert modal and overlay ownership.

Examples:

- top modal consumes jog and Back
- overlay allows transport to bubble
- Back pops a picker before global suspend behavior
- co-run context suppresses LED ownership and passes through selected input

### Workflow Tests

Keep focused concept tests for:

- Recording Workflow
- Pad Surface
- Parameter Bank
- Drum Lane Workflow
- Session View
- Track View Step Workflow
- Tick Pipeline phases

These tests should use normalized events and capability fakes, not raw host globals.

### Render Frame Tests

Assert screen and LED frames before hardware flush.

Examples:

- modal screen frame contains expected text ops
- Track View LED frame marks loop and active steps
- co-run frame suppresses owned LEDs
- LED adapter sends only changed LEDs
- palette reclaim forces resend after co-run exit

### Characterization Tests

Before moving risky behavior, add characterization tests through the current public seam. Then move internals while preserving those tests.

Good candidates:

- undo/redo restore sync
- recording handoff and drain order
- parameter bank CC automation edits
- co-run enter/exit LED reclaim
- Back behavior with nested surfaces

## Test Harness Direction

The harness should provide:

- fake host params
- fake display
- fake LEDs
- fake MIDI sends
- fake file system for persistence tests
- deterministic tick runner
- normalized event injector
- command bus spy
- render frame collector

This lets tests assert behavior at the right boundary instead of inspecting unrelated global fields.

## Migration Path

1. Add tests before each behavior move.
2. Add protocol tests for new DSP helpers.
3. Add command tests for the first command family.
4. Add context tests for the first modal migration.
5. Add frame tests for one screen renderer and one LED region.
6. Add tick phase tests when the DSP operation queue is introduced.
7. Keep legacy integration tests until the new seams cover equivalent behavior.

