# Migration Ranking

This document ranks the proposed migrations from `10-transformation-plan.md` against the target architecture and the current codebase. It is intentionally opinionated.

The short version:

- **Highest total leverage:** DSP Operation Queue, followed by command descriptors for structural edits.
- **Best first migration:** adapter-only Hardware Event Normalization.
- **First three migrations to implement:** Hardware Event Normalization, Context Stack for one simple modal, DSP Operation Queue in compatibility mode.
- **Delay:** broad command conversion, readback scheduler, rendering frames, co-run context, plugin-style registration.
- **Likely unnecessary:** full plugin registry, full frame conversion for every screen, nested state roots that do not move ownership, and any attempt to turn every input into a command.

## Scoring Model

Scores are 1 to 5.

- **Leverage:** architectural improvement if successful.
- **Effort:** implementation cost. Higher means more effort.
- **Risk:** chance of behavior regression. Higher means more risk.
- **Testability:** how well the migration can be tested in isolation. Higher is better.
- **Dependencies:** how much it depends on earlier migrations. Higher means more dependencies.

The best early migrations have high leverage, low effort, low risk, high testability, and low dependencies.

## Ranked Migration Table

| Rank | Migration | Leverage | Effort | Risk | Testability | Dependencies | Verdict |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | DSP Operation Queue compatibility mode | 5 | 3 | 3 | 5 | 1 | Highest architectural leverage. Do it early, but first in non-production/compat mode. |
| 2 | Hardware Event Normalization, adapter-only | 4 | 2 | 1 | 5 | 0 | Best first implementation. It unlocks safer later work. |
| 3 | Context Stack runtime plus one simple modal | 4 | 3 | 3 | 4 | 1 | Worth doing early after normalized events start existing. |
| 4 | Clip command descriptors without execution | 4 | 2 | 1 | 5 | 0 | Cheap way to shape the command system without touching behavior. |
| 5 | Recording Workflow drain interface | 4 | 3 | 3 | 4 | 1 | Strong concept boundary. Do after queue semantics are clear. |
| 6 | Command bus execution for one clip command | 4 | 4 | 4 | 4 | 2 | Valuable but should follow descriptor and queue tests. |
| 7 | Readback Scheduler runtime | 4 | 3 | 4 | 4 | 2 | Important, but only after commands/queue prove the policy shape. |
| 8 | Parameter Bank CC automation slice | 4 | 4 | 4 | 4 | 2 | High payoff, but too risky before command/readback discipline exists. |
| 9 | LED cache adapter boundary | 3 | 3 | 3 | 4 | 1 | Useful before broad LED frame work; keep scope narrow. |
| 10 | ScreenFrame for confirm prompt only | 3 | 2 | 2 | 5 | 2 | Good as a rendering spike after context work. |
| 11 | Session View step-button slice | 3 | 4 | 4 | 3 | 2 | Useful but behavior-heavy. Delay until input normalization is real. |
| 12 | Drum lane clear/reset commands | 3 | 3 | 4 | 4 | 3 | Do after clip commands establish the command pattern. |
| 13 | Recording arm/disarm interface | 3 | 4 | 4 | 4 | 2 | Valuable, but more user-visible than queue drains. |
| 14 | Pending steps reread through scheduler | 3 | 3 | 4 | 4 | 3 | Good scheduler proof once a migrated command needs it. |
| 15 | Pending drum lane resync through scheduler | 3 | 3 | 4 | 4 | 3 | Same as steps reread, but more feature-specific. |
| 16 | Pad Surface runtime ownership | 3 | 3 | 3 | 4 | 1 | Good cleanup, but less cross-cutting than recording or DSP queue. |
| 17 | Sidecar schema shell | 2 | 2 | 2 | 4 | 1 | Useful only if persistence changes are imminent. |
| 18 | Co-run context ownership slice | 4 | 5 | 5 | 3 | 4 | High leverage but high risk. Delay until context and LED boundaries exist. |
| 19 | LedFrame model and one LED region | 3 | 4 | 3 | 4 | 2 | Delay until LED adapter boundary is clearer. |
| 20 | Nested state roots shell | 2 | 2 | 2 | 3 | 0 | Mostly cosmetic unless fields actually move. Do not prioritize. |
| 21 | Feature/plugin registry | 2 | 4 | 3 | 3 | 5 | Delay heavily. Likely unnecessary for a long time. |
| 22 | Broad ScreenFrame conversion | 2 | 5 | 4 | 4 | 3 | Not worth doing broadly. Convert only where it removes real pain. |

## Single Highest Leverage Migration

The single highest leverage migration is **DSP Operation Queue compatibility mode**.

Reason:

- The most dangerous architectural problem is not raw MIDI or modal routing. It is that DSP write timing, host coalescing, undo availability, optimistic mirror patches, and delayed readbacks are spread across workflows.
- A queue gives Overture one place to encode Move/Schwung timing rules.
- It directly supports command descriptors, readback scheduling, recording drains, default parameter drains, and testable DSP output.
- It reduces the chance that future feature work accidentally breaks hardware behavior.

This should **not** be the first production behavior migration. The first queue PR should be compatibility-only: same semantics as `S.pendingDefaultSetParams`, isolated tests, no broad command conversion.

## First Three Migrations To Implement

### 1. Hardware Event Normalization, Adapter-Only

Implement first.

Scope:

- define normalized event constructors
- emit normalized events from `ui/midi/ui_midi_internal_workflow.mjs`
- keep existing handlers and dispatch ordering unchanged
- add tests for raw MIDI to semantic event mapping

Why first:

- lowest risk
- very testable
- no DSP or rendering implications
- gives later context/workflow tests a cleaner input language

Do not convert broad handler behavior yet. The first win is centralizing hardware mapping.

### 2. Context Stack Runtime Plus Confirm Prompt

Implement second.

Scope:

- add context stack runtime
- route Back through an empty stack first
- wrap confirm prompt as the first context
- route confirm prompt render/jog/Back through the context
- keep legacy flags bridged

Why second:

- modal fragmentation is one of the clearest UX-maintainability problems
- confirm prompt is small and already has component tests
- it proves input capture, screen capture, and Back semantics without touching DSP

Do not start with snapshot picker, text keyboard, sound edit, or co-run. They carry too much hidden behavior for the first context migration.

### 3. DSP Operation Queue Compatibility Mode

Implement third.

Scope:

- add a queue that can model `push`, `unshift`, drain hold, and one-per-tick behavior
- write direct tests for ordering and timing
- initially keep production behavior unchanged
- then route one low-risk structural edit path through it

Why third:

- it is the core boundary for long-term correctness
- it unlocks command execution and readback scheduling
- it should be introduced before the command system starts executing real edits

Do not combine this with command bus execution. Queue semantics deserve their own PRs.

## Migrations To Delay

### Full Command Bus Execution

Delay until:

- clip command descriptors exist
- DSP operation queue compatibility tests pass
- at least one structural edit has characterization tests

Command descriptors are cheap and should happen early. Executing commands is higher risk because it changes where undo flags, mirror patches, readbacks, and invalidation happen.

### Readback Scheduler

Delay until:

- at least one command descriptor needs readback metadata
- the DSP queue has a production user
- current pending flag behavior is characterized

The scheduler is valuable, but introducing it before commands use it will create a second deferred-work abstraction with no pressure test.

### Parameter Bank CC Automation Slice

Delay until:

- normalized input exists
- command descriptors are established
- readback/invalidation policy is clearer

Parameter Bank behavior is high payoff, but it is a dense cluster of DSP writes, recording behavior, automation semantics, delete behavior, alt behavior, and UI feedback. It should not be the first concept migration.

### Co-run Context Ownership

Delay until:

- context stack has at least two normal modal users
- LED adapter boundary exists
- co-run behavior is well characterized

Co-run is high leverage but too invasive. It touches input, OLED suppression, LED reclaim, palette state, modifiers, Move-native UI, and tick reconciliation. Moving it early would be risky architecture theater.

### Rendering Frames Beyond Confirm Prompt

Delay broad frame work.

Do a narrow confirm-prompt `ScreenFrame` only after the confirm context exists. Do not start by converting the main screen router or Track View renderers. The current render tests and render modules are already fairly modular; broad frame conversion adds churn before the bigger behavioral boundaries are fixed.

### LedFrame Model

Delay until LED cache ownership is cleaner.

The LED cache adapter is more important than a full frame model. The current pain is mixed ownership of presentation, cache, palette, and co-run reclaim. Start by isolating cache/palette flushing, then decide whether `LedFrame` is still needed.

### Nested State Roots

Delay until fields actually move.

Adding `S.app`, `S.dsp`, `S.runtime`, and `S.sidecar` as empty shells is low risk but also low value. It can create the illusion of progress while `S` remains just as coupled.

### Sidecar Schema Shell

Delay until persistence changes are active.

Sidecar schema is useful, but it should follow a real persistence migration or a bug-prone sidecar change. Otherwise it is another layer with little immediate payoff.

## Migrations Likely Unnecessary

### Plugin-Style Feature Registry

Likely unnecessary for the foreseeable future.

Overture needs better internal boundaries, not dynamic feature registration. A registry may become useful later if there are many independent built-in features with stable contracts. Right now it risks turning straightforward composition in `ui.js` into indirection.

Keep `ui.js` as an explicit composition root. Reduce behavior in it through concept modules, not through a registry.

### Full ScreenFrame Conversion

Likely unnecessary as a blanket migration.

Frame rendering is useful where tests need to assert output independent of host calls. It does not follow that every OLED renderer must return a frame. Some existing render modules are already isolated enough and direct drawing is acceptable when host primitives are simple.

Use frames surgically for:

- context-owned modals
- renderers with fragile layout logic
- tests that currently require noisy host spies

Avoid converting all Track View, Session View, and performance rendering just for architectural symmetry.

### Full LedFrame Conversion

Likely unnecessary unless co-run and LED cache work demand it.

The LED system needs clearer adapter ownership. It may not need a complete retained LED frame model. If cache invalidation, palette programming, forced resend, and co-run suppression can be isolated behind an adapter, that may be enough.

### Nested State Roots Without Field Movement

Unnecessary on its own.

State roots are useful only when they move ownership. A PR that adds empty roots but leaves all mutation paths unchanged should be rejected unless it is immediately followed by a field migration in the same small series.

### Turning Every Input Into a Command

Unnecessary and harmful.

Commands should represent user-visible state changes, especially DSP-affecting structural edits. They should not wrap:

- raw MIDI parsing
- held-button state
- jog movement inside an uncommitted picker
- pad pressure
- live notes
- co-run pass-through
- render invalidation

Forcing every event through commands would add ceremony and obscure timing-sensitive behavior.

## Recommended Implementation Order

### Immediate

1. Hardware Event Normalization, adapter-only.
2. Context Stack runtime and confirm prompt context.
3. DSP Operation Queue compatibility mode.
4. Clip command descriptors without execution.

### Next

5. Execute one low-risk clip command through the command bus.
6. Move undo marking for that command into the command bus.
7. Add Readback Scheduler runtime.
8. Route pending steps reread for the migrated command through the scheduler.
9. Recording Workflow drain interface.

### Later

10. Parameter Bank CC automation slice.
11. Drum lane clear/reset commands.
12. Session View step-button slice.
13. LED cache adapter boundary.
14. Confirm prompt `ScreenFrame`.
15. Pad Surface runtime ownership.

### Much Later, If Still Needed

16. Co-run context ownership.
17. Sidecar schema.
18. LedFrame model.
19. Feature/plugin registry.
20. Broad screen frame conversion.

## Dependency Notes

- Hardware Event Normalization has no hard dependencies and improves most later tests.
- Context Stack does not strictly require normalized events for the first confirm prompt, but normalized events make later contexts cleaner.
- DSP Operation Queue should precede command execution.
- Command descriptors can precede the queue if they are not executed.
- Readback Scheduler should follow at least one migrated command or queue user.
- Rendering frames should follow context migration for the first context-owned surface.
- Co-run context should follow both context stack and LED adapter work.
- Plugin registry should follow stable contexts, commands, renderers, and tick task contracts. That means it should wait a long time.

## Final Recommendation

Be disciplined about the first month of work:

1. Do not touch the high-risk musical behavior first.
2. Build the normalized input seam.
3. Prove one context on confirm prompt.
4. Build the DSP queue in compatibility mode.
5. Only then execute one small command through the new path.

That sequence gives real architecture leverage without asking the project to survive a rewrite.

