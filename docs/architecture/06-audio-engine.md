# Audio Engine Boundary

The audio engine boundary is the most important architecture boundary in Overture. It must be explicit, typed where possible, and honest about host timing.

## Current Boundary Critique

The current UI talks to DSP through string keys and string payloads. This is flexible but fragile:

- parameter names are assembled in many places
- payload formats are manually parsed and formatted
- host coalescing behavior leaks into feature workflows
- readback timing is encoded as scattered counters
- mirror updates can diverge from DSP until reconciliation

The current code also contains important real-world knowledge:

- some commands must be atomic
- some writes must be drained one per tick
- some readbacks must be delayed
- live notes and recording queues need special timing
- co-run and route handling need host-specific adapters

The target architecture should concentrate this knowledge instead of abstracting it away.

## DSP Protocol Layer

Introduce a protocol module that owns key construction and payload codecs.

```ts
interface DspProtocol {
  clipClear(track: number, clip: number): DspOp;
  clipCopy(source: ClipRef, target: ClipRef): DspOp;
  setBankParam(ref: BankParamRef, value: number): DspOp;
  readClip(track: number, clip: number): DspRead<ClipMirror>;
}
```

The protocol layer should provide:

- named operations
- payload encoders
- readback decoders
- validation for ranges and enum values
- compatibility helpers for existing string keys

This can be plain JavaScript with JSDoc/types before any broader TypeScript migration.

## DSP Operation Queue

The DSP operation queue owns host write scheduling.

Responsibilities:

- immediate writes when safe
- one-per-tick drains for coalescing-sensitive operations
- atomic command preference
- prioritized live note and recording drains
- readback scheduling after write
- debug tracing for tests

Feature workflows should not decide how to space host writes unless the timing rule is part of the feature's domain. They should declare timing requirements on the operation.

## Mirror Reconciliation

Every optimistic mirror update must have an explicit reconciliation strategy:

- no readback needed
- targeted readback
- full track readback
- full session readback
- delayed readback by N ticks
- readback after DSP restore token changes

The sync modules remain the right owner for readback implementation. Commands and workflows should request readbacks through a scheduler rather than setting many unrelated pending flags directly.

## Routes and Live Notes

Routes should be represented as explicit targets:

- Schwung DSP route
- Move-native route
- external MIDI route
- co-run shadow route

Live note dispatch should remain performance-oriented and should not be forced into undoable commands. It should still use normalized event and route descriptors so tests can assert chosen output without hardware.

## Recording

Recording needs a dedicated workflow boundary because it spans input, transport, tick drains, DSP writes, and mirror sync.

The Recording Workflow should own:

- arm/disarm state transitions
- count-in cancellation
- track handoff
- note-on/off matching
- melodic and drum recording queues
- drain policy used by the tick pipeline
- recording-related readback requests

This should be one of the earliest runtime-state migrations.

## Tick Pipeline

The tick pipeline remains necessary. Move and Schwung require deferred work. The target is not to remove tick; it is to make tick phases explicit.

Suggested phases:

1. time and suspend detection
2. input/deferred event drains
3. DSP operation queue drain
4. recording/live note drains
5. DSP readback scheduler
6. persistence and snapshot jobs
7. context timers and overlay expiry
8. render invalidation and LED/screen flush

Each phase should call concept-owned modules instead of containing feature logic directly.

## Migration Path

1. Add protocol helpers for one family of existing keys.
2. Route one command family through the DSP operation queue.
3. Replace one pending readback flag with a readback scheduler request.
4. Move recording queue drains behind Recording Workflow.
5. Move default parameter drains into the DSP operation queue.
6. Convert route/live-note dispatch to explicit route descriptors.
7. Add protocol tests for key/payload compatibility.

