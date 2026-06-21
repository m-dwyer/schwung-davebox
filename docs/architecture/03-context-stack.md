# Context Stack

The context stack is the target owner for modal, overlay, and temporary surface behavior. It should replace scattered flags and duplicated priority checks incrementally.

## Problem

Current modal behavior is fragmented:

- Render priority lives mainly in the screen router.
- Input swallow rules live in MIDI, jog, transport, Back, menu, and feature handlers.
- Back behavior is an explicit list of known surfaces.
- LED behavior is usually inferred from global flags.
- Each modal owns state differently.

This makes new surfaces expensive and risky because they require coordinated edits in multiple ladders.

## Target Context Contract

A context is a runtime object that declares what it owns.

```ts
interface UiContext {
  id: string;
  kind: 'base' | 'overlay' | 'modal' | 'corun';
  priority: number;
  inputCapture: InputCapturePolicy;
  screenCapture: ScreenCapturePolicy;
  ledCapture: LedCapturePolicy;
  onEvent(event: NormalizedInputEvent, env: ContextEnv): ContextResult;
  renderScreen?(model: RenderModel): ScreenFrame;
  renderLeds?(model: RenderModel): PartialLedFrame;
  onBack?(env: ContextEnv): ContextResult;
  onEnter?(env: ContextEnv): void;
  onExit?(env: ContextEnv): void;
}
```

The important part is not the exact TypeScript shape. The important part is that capture, rendering, Back behavior, and lifecycle are declared in one place.

## Stack Semantics

The stack should contain:

- one base context for normal Session View or Track View behavior
- zero or more overlays
- zero or one blocking modal at the top
- special co-run contexts that can explicitly delegate hardware ownership

Event routing:

1. Normalize raw hardware input.
2. Offer the event to the top context.
3. If the top context declines and its capture policy allows bubbling, continue downward.
4. If no context handles it, route to the base workflow.
5. Commands and state changes are returned as results, not performed implicitly when possible.

Back behavior:

- Back is routed to the top context first.
- A context may consume Back, pop itself, convert Back into a command, or allow bubbling.
- Global suspend/hide behavior runs only after no context consumes Back.

## Context Types

### Base Contexts

Base contexts own normal surfaces:

- Session View
- Track View
- Performance View if it becomes a durable mode

They should be long-lived and may delegate to concept workflows such as Pad Surface, Parameter Bank, and Loop Gesture.

### Overlay Contexts

Overlay contexts add temporary behavior without taking full ownership.

Examples:

- action popup
- param peek
- shift help
- no-note flash
- interval overlay

They usually capture screen partially or not at all, and rarely capture LEDs.

### Modal Contexts

Modal contexts own input until resolved.

Examples:

- confirmation prompt
- snapshot picker
- inherit picker
- clear automation menu
- text keyboard
- route check
- export confirmation

They should define their own cursor state, rendering, commit, cancel, and Back semantics.

### Co-run Contexts

Co-run contexts are special because another UI may own parts of the hardware. They must declare:

- which inputs pass through
- which LEDs are suppressed
- which LEDs are reclaimed on exit
- whether OLED drawing is skipped
- modifier cleanup on enter/exit

Co-run should become a context capability rather than a cross-cutting global check.

## Critique of Template Context Stack

The template `ContextStack` is a useful starting sketch but insufficient:

- It has no empty-stack behavior.
- It has no capture policy.
- It assumes only the current context matters.
- It does not model Back.
- It does not model LED/OLED ownership separately.
- It does not integrate with command dispatch or DSP timing.

Overture should borrow the stack idea, not the implementation.

## Migration Path

1. Introduce a context stack runtime next to existing flags.
2. Wrap one simple modal, such as confirm prompt or text keyboard, while still syncing to existing `S` fields if needed.
3. Route Back through the stack before the legacy Back ladder.
4. Route OLED rendering through context screen capture before the legacy router.
5. Route normalized input through the stack before legacy handlers.
6. Convert picker and confirmation surfaces one by one.
7. Model co-run as an explicit context after modal migration proves stable.

