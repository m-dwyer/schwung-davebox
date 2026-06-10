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

Status: done on `main`.

Goal: separate defaulting/reset behavior from runtime processing.

- Extract clip, drum, pfx, arp, automation, and track init/reset helpers into a
  focused internal module or section.
- Keep call order unchanged in create/load/transport paths.
- Add small comments where default values are part of persisted state semantics.

Completed slices:

- `seq8_init.h` owns pfx, clip, drum lane, track, drum repeat, TARP, and
  automation full-reset helpers.
- `seq8_clear_state` keeps panic/output behavior in `seq8.c` and delegates the
  post-panic field reset to `seq8_init.h`.
- `seq8_track_init_defaults` and `seq8_instance_init_defaults` now hold the
  startup/default field assignments while `seq8.c` still owns lifecycle, file
  I/O, dispatch, render scheduling, and behavior-heavy reset paths.

Acceptance:

- Fresh boot defaults match existing tests.
- State load with missing sparse fields keeps current fallback behavior.
- No state version bump.

## Phase 4: Persistence Boundary

Status: done on `main`.

Goal: isolate state serialization and migration.

- Move low-level JSON read/write helpers behind a persistence boundary.
- Keep the v36 format intact.
- Keep higher-level `seq8_do_serialize`, `seq8_save_state`, and
  `seq8_load_state` in `seq8.c` while the state format boundary settles.

Completed slices:

- `seq8_persistence.h` owns scalar/sparse JSON readers, step-hex array
  read/write helpers, iterator sanitization, and parent directory creation.

Acceptance:

- Existing state files load.
- Clear-session sentinel behavior remains unchanged.
- Deferred-save behavior remains unchanged.

## Phase 5: Parameter Dispatch Boundary

Status: superseded by clip/note helper extraction; parameter dispatch remains
future work.

## Phase 5A: Clip and Note Model Helpers

Status: done on `main`.

Goal: make step-array and note-array synchronization explicit before changing
musical step behavior.

- Extract note/step helper routines into `seq8_clip.h`.
- Keep `seq8.c` as the single translation unit.
- Preserve the dual representation contract:
  - `note_step` owns midpoint step assignment.
  - `clip_migrate_to_notes` derives notes from step arrays.
  - `clip_build_steps_from_notes` rebuilds step arrays from notes.
  - `clip_default_step_gate_ticks` centralizes mode-aware new-step gate
    defaults.

Acceptance:

- Native and WASM builds pass.
- Emulator integration tests pass.
- No state version bump.

## Product Slice: Mode-Aware Default Step Gates

Status: done on `main`.

- New melodic/keys steps default to one full step (`ticks_per_step`, normally
  24).
- New drum-lane steps default to one half step (`ticks_per_step / 2`, normally
  12).
- Existing explicit step gates are preserved when adding notes to a populated
  step.
- UI empty-step edit fallbacks match DSP defaults.
- Covered by a real `seq8`-wasm integration test.

## Future Phase: Parameter Dispatch Boundary

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
