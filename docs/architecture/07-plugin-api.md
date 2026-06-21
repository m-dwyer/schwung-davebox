# Plugin API

The target plugin API should make extension possible without letting plugins couple directly to global state, host globals, or DSP string protocols.

## Scope

"Plugin" here means an internal Overture extension boundary, not necessarily a third-party package format. The first goal is to let features be added as isolated modules with clear contracts. External plugin loading can come later if needed.

## Current Extension Problem

New features currently tend to touch:

- `S`
- MIDI routing
- jog/button/pad ladders
- render priority
- LED rendering
- tick tasks
- DSP sync
- persistence
- undo/redo flags

This creates feature coupling even when the feature itself is small.

## Target Feature Module Contract

A feature module may provide:

```ts
interface OvertureFeature {
  id: string;
  contexts?: ContextFactory[];
  commands?: CommandFactory[];
  reducers?: ReducerRegistration[];
  renderers?: RendererRegistration[];
  tickTasks?: TickTaskRegistration[];
  dspProtocol?: DspProtocolRegistration[];
  sidecarSchema?: SidecarSchemaPatch;
  tests?: FeatureTestHarness;
}
```

All fields are optional. A feature should register only the surfaces it owns.

## Allowed Capabilities

Feature modules should receive capabilities, not globals:

- state selectors
- command dispatcher
- context stack API
- DSP operation queue
- readback scheduler
- render invalidator
- persistence adapter
- route/live-note adapter
- clock/tick utilities
- debug logger

Capabilities make tests simple and prevent direct host access.

## Boundaries

Plugins and feature modules must not:

- mutate arbitrary global state
- call host globals directly
- assemble DSP parameter keys outside registered protocol helpers
- write LEDs or OLED directly
- register hidden modal priority outside the context stack
- add sidecar fields without schema ownership

Legacy modules may violate these rules during migration. New modules should not.

## Hardware Mapping

Hardware event normalization should support feature registration, but hardware mapping must remain centralized. Features should consume semantic events such as:

- `pad.press`
- `step.press`
- `encoder.turn`
- `button.press`
- `transport.play`
- `touch.knob`

Features should not depend on raw MIDI status bytes or Move CC numbers unless they are hardware adapter modules.

## DSP Extensions

If a feature needs DSP support, it should register protocol operations and readback decoders. This keeps string keys and payloads discoverable and testable.

## Migration Path

1. Treat existing runtime concepts as built-in features.
2. Introduce a registration shape in the composition root without dynamic loading.
3. Register one low-risk feature surface, such as a modal or render overlay.
4. Register command factories for one command family.
5. Move feature-specific tick tasks behind registrations.
6. Add sidecar schema registration after persistence boundaries are clearer.
7. Consider external loading only after built-in registration is stable.

