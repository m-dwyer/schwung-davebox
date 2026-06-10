# SEQ8 Refactor Plan

This is the working plan for making `seq8.c` easier to change without turning
the Overture tool into a rewrite. The rule is mechanical extraction first,
behavioral changes second.

## Guardrails

- Keep `seq8.c` as the only compiled DSP source until a phase explicitly changes
  the build.
- Preserve the Schwung ABI entry points and WASM glue surface.
- Do not bump state version for refactors.
- Do not move code that performs render-path allocation, filesystem I/O, or host
  calls into helpers that obscure when they execute.
- After each phase, build native DSP, build WASM, and run emulator integration
  tests against real `seq8.wasm`.

## Phase 1: Constants and Porting Map

Status: done on `main`.

- Extract shared limits and immutable lookup tables into `seq8_constants.h`.
- Keep runtime types and logic in `seq8.c`.
- Add `UPSTREAM-PORTING.md` so future dAVEBOx changes have a clear landing map.

Acceptance:

- `./scripts/build.sh`
- `./scripts/build-wasm.sh`
- `npm run test:node` in `../web`

## Phase 2: Core Types Header

Status: done on `main`.

Goal: make the data model visible without changing behavior.

- Extract pure data types into `seq8_types.h`:
  - MIDI queue/event structs.
  - pfx, arp, automation, note, clip, drum lane, and track structs.
- Extract runtime instance state into `seq8_instance.h` so resource-owning fields
  stay separate from the portable data model.
- Keep helper functions, init logic, serialization, get/set param, and render
  logic in `seq8.c`.
- Keep `seq8_set_param.c` included by `seq8.c`.

Acceptance:

- Struct layouts are unchanged from the compiler's perspective.
- No function body moves in this phase.
- The native and WASM builds pass.
- Emulator integration tests pass.

## Phase 3: Initialization and Reset Helpers

Goal: separate defaulting/reset behavior from runtime processing.

- Extract clip, drum, pfx, arp, automation, and track init/reset helpers into a
  focused internal module or section.
- Keep call order unchanged in create/load/transport paths.
- Add small comments where default values are part of persisted state semantics.

Acceptance:

- Fresh boot defaults match existing tests.
- State load with missing sparse fields keeps current fallback behavior.
- No state version bump.

## Phase 4: Persistence Boundary

Goal: isolate state serialization and migration.

- Move JSON read/write helpers and state save/load routines behind a persistence
  boundary.
- Keep the v36 format intact.
- Document every accepted sparse/default key family near the persistence code.

Acceptance:

- Existing state files load.
- Clear-session sentinel behavior remains unchanged.
- Deferred-save behavior remains unchanged.

## Phase 5: Parameter Dispatch Boundary

Goal: make get/set param changes safer.

- Split read-only `get_param` handlers from mutating `set_param` handlers by
  behavior area.
- Keep atomic multi-field commands intact.
- Preserve known Schwung delivery constraints: unreliable new global keys,
  coalesced set_param writes, and no `get_param` from `onMidiMessage`.

Acceptance:

- Existing UI integration tests pass.
- At least one focused regression test covers any dispatch family moved in this
  phase.

## Phase 6: Runtime Engines

Goal: isolate high-risk timing engines only after contracts are explicit.

- Extract cohesive runtime families one at a time:
  - pfx/arp emission.
  - drum repeat.
  - CC/AT automation playback.
  - bake/export.
  - looper/merge/performance modifiers.
- Avoid changing render scheduling or event ordering during extraction.

Acceptance:

- Native and WASM builds pass after each family.
- Emulator tests pass after each family.
- Device verification is required before merging any phase that changes render
  scheduling, MIDI ordering, or state load/save.
