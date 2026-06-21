# Command System

Commands are the target abstraction for user-visible state changes that may affect DSP, UI mirrors, undo/redo, persistence, or rendering. They should not wrap every input event.

## Problem

Current edit workflows manually coordinate:

- `host_module_set_param` calls
- optimistic mirror updates
- undo/redo availability
- readback delays
- dirty flags
- LED invalidation
- popup/status feedback
- special UI-side snapshots

The result is duplicated policy and fragile omissions.

## What Should Be a Command

Use commands for:

- clip clear/copy/cut/reset/select/double/fill
- scene operations
- drum lane clear/copy/reset/mute/solo
- parameter writes that alter persistent musical state
- automation edits
- route/channel changes
- snapshot apply/drop/copy
- state load/save operations
- recording arm/disarm transitions when they change DSP state

Do not force commands for:

- raw MIDI parsing
- transient held-button state
- pad pressure updates
- live note on/off dispatch that is not undoable
- jog movement inside a picker before commit
- render invalidation alone
- co-run pass-through events

## Command Descriptor

A command should describe effects rather than hide them in arbitrary closures.

```ts
interface CommandDescriptor {
  id: string;
  label: string;
  category: 'clip' | 'scene' | 'drum' | 'bank' | 'transport' | 'state' | 'route';
  undo: UndoPolicy;
  dspOps: DspOp[];
  mirrorPatch?: MirrorPatch;
  sidecarPatch?: SidecarPatch;
  readbacks?: ReadbackRequest[];
  invalidation?: InvalidationScope;
  coalescing?: CoalescingPolicy;
}
```

The command bus executes descriptors through adapters:

- DSP operation queue
- state patcher
- undo coordinator
- sync scheduler
- render invalidator
- status feedback adapter

## Undo/Redo Strategy

Overture should not replace DSP undo with a generic UI undo stack. DSP owns most musical history. The UI command system should coordinate with DSP undo.

Undo policies:

- `dsp`: DSP owns undo/redo. UI marks availability and schedules restore readback.
- `ui`: UI owns undo/redo for UI-only state.
- `hybrid`: DSP owns most state, but UI owns companion snapshots such as SEQ ARP bank state.
- `none`: command is not undoable.

Undo/redo commands should be first-class descriptors:

- send `undo_restore` or `redo_restore`
- schedule targeted readback
- clear stale recording buffers if required
- restore hybrid UI snapshots
- invalidate screen and LEDs

## DSP Operation Queue

Commands should not call `host_module_set_param` directly. They should enqueue DSP operations with timing metadata.

```ts
interface DspOp {
  key: string;
  value: string;
  mode: 'immediate' | 'one-per-tick' | 'atomic-required';
  reason: string;
}
```

The queue owns host coalescing policy:

- one-per-tick drains
- atomic command preference
- readback delay
- drain holds
- live note and recording priority
- telemetry in tests

This does not eliminate the tick pipeline. It makes the tick pipeline call one queue with explicit policy.

## Critique of Template Command Pattern

The template command interface:

```ts
interface Command {
  label: string;
  apply(state: any): any;
  undo(state: any): any;
}
```

is not enough for Overture because:

- DSP state is not just local state.
- host coalescing affects correctness.
- undo is usually DSP-owned.
- commands need readback scheduling.
- commands need render/LED invalidation.
- commands need testable host outputs.

Overture needs command descriptors and execution policy, not a pure in-memory reducer pattern.

## Migration Path

1. Create command descriptors for a narrow existing slice, preferably clip clear/copy/reset or drum lane clear/reset.
2. Keep legacy handlers, but make them build and execute commands.
3. Add tests that assert command descriptor, DSP ops, mirror patch, readbacks, and invalidation.
4. Move undo availability marking into the command bus.
5. Move `pendingDefaultSetParams` and similar drains into the DSP operation queue.
6. Convert Parameter Bank and automation edits after simpler structural commands are stable.
7. Convert undo/redo restore handling into command descriptors with sync policies.

