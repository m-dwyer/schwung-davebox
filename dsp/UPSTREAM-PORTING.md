# SEQ8 Upstream Porting Notes

This fork is allowed to diverge from upstream dAVEBOx, but upstream changes
should still be easy to audit and port intentionally.

## Current Layout

- `seq8.c` remains the single translation unit and owns the Schwung ABI entry
  points, runtime state, state serialization, get/set param dispatch, playback,
  recording, automation, bake/export, and render scheduling.
- `seq8_set_param.c` is still included by `seq8.c`; do not compile it as a
  separate object.
- `seq8_constants.h` owns shared limits and immutable lookup tables that were
  previously at the top of `seq8.c`.

## Porting Upstream Changes

1. Fetch upstream and inspect changes by behavior area, not by raw line number.
2. If an upstream change touches constants or timing tables, port it to
   `seq8_constants.h`.
3. If it touches runtime logic, port it to the corresponding section in
   `seq8.c` or `seq8_set_param.c` and keep exported ABI functions unchanged.
4. Preserve state version compatibility unless the serialized format is truly
   incompatible.
5. Rebuild both targets after porting:
   - `./scripts/build.sh`
   - `./scripts/build-wasm.sh`
6. Run the Overture emulator integration tests that use real `seq8.wasm`.

## Refactor Rule

Prefer mechanical extractions first. Move constants, types, and cohesive helper
families without changing behavior; only change behavior after tests pin the old
and desired outcomes.
