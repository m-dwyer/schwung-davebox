# dAVEBOx UI Context

dAVEBOx is a Schwung tool module for Ableton Move. This context names the runtime concepts that should shape UI modules, seams, and tests.

## Language

**Tool Module**:
A Schwung module that owns an interactive JavaScript UI and a DSP engine without being an audio instrument.
_Avoid_: App, plugin, service

**UI Runtime**:
The QuickJS runtime that handles Move hardware events, tick/render callbacks, and UI-side state mirrors.
_Avoid_: Frontend, client

**DSP Engine**:
The C runtime that owns sequencer state, parameter handlers, persistence, and audio-thread-safe command execution.
_Avoid_: Backend, server

**DSP Mirror**:
The UI Runtime's JavaScript copy of selected DSP Engine state used for rendering, routing, and workflow decisions.
_Avoid_: Cache, model, store

**Tick Pipeline**:
The ordered work performed from `tick()`, where `get_param` is reliable and coalescing-sensitive writes can be drained safely.
_Avoid_: Loop, scheduler

**Deferred Queue**:
A UI Runtime queue drained from the Tick Pipeline to avoid same-buffer `set_param` coalescing or callback-context `get_param` failures.
_Avoid_: Task list, command queue

**Pad Surface**:
The non-destructive performance-input surface that maps Move pads to notes, drum lanes, velocity zones, and DSP padmap payloads.
_Avoid_: Pad component, controller layer

**Drum Lane**:
One lane of a drum track, with its own steps, lane metadata, per-lane note FX, delay, repeat-groove mirrors, and active-lane selection.
_Avoid_: Drum row, kit slot

**Drum Lane Workflow**:
A destructive or structural operation on a Drum Lane, such as clear, copy, cut, paste, mute/solo, or factory reset.
_Avoid_: Pad handling, lane helper

**Drum Repeat Workflow**:
A repeat-performance operation for Rpt1/Rpt2 pads, latches, rate pads, repeat-groove edits, and repeat-owned pad routing.
_Avoid_: Repeat pad surface, repeat helper

**Repeat Groove**:
Per-Drum-Lane repeat shaping state: gate mask, gate length, velocity scale, nudge, and Rpt2 lane rate.
_Avoid_: Groove, repeat params

**Track / Clip Sync**:
The DSP Mirror readback behavior that refreshes track, clip, drum lane, automation, and sidecar-derived UI state from DSP.
_Avoid_: Clip helper, sync service

**UI Sidecar**:
The UI Runtime persistence file for UI-only state such as active track, active clips, session view, active drum lanes, performance memory, active banks, and track octave.
_Avoid_: UI state file, settings

**Session View**:
The clip-grid view where pads launch, select, copy, clear, or edit clips by track and scene row.
_Avoid_: Grid view, launcher

**Track View**:
The performance/edit view for the active track where pads play notes, drum lanes, repeat workflows, or bank-selection gestures.
_Avoid_: Detail view, edit view

**Parameter Bank**:
A bank of eight knob-addressable parameters whose read/write behavior may target global, track, clip, drum-lane, action, or automation state.
_Avoid_: Knob page, bank component

**Render Surface**:
The single bag of OLED drawing primitives (`print`, `pixelPrint`, `fill_rect`, `clear_screen`), shared chrome helpers (bank headings, alt arrow, metro indicator, position bar), and render-time param queries (`altIndicatorActive`, `bankHasAltParams`, `midiNoteName`) that every render module draws through. Assembled once at the composition root and memoized; a render module reads only the subset it needs off the one surface. Replaced the former per-render deps factories and their identity adapters.
_Avoid_: Canvas, graphics context, render deps, draw adapter

**Patched Schwung Capability**:
A runtime-gated host feature available only when the patched Schwung host exposes the required function.
_Avoid_: Feature flag, build flag

**Move Co-Run**:
The mode where dAVEBOx cedes selected hardware behavior to Move firmware while preserving enough UI Runtime state to return safely.
_Avoid_: Native mode, passthrough

## Relationships

- A **Tool Module** contains one **UI Runtime** and one **DSP Engine**.
- The **UI Runtime** maintains a **DSP Mirror** by reading the **DSP Engine** from the **Tick Pipeline**.
- A **Deferred Queue** is drained by the **Tick Pipeline** when command ordering or host callback context is load-bearing.
- The **Pad Surface** routes non-destructive **Track View** performance input, while **Drum Lane Workflow** owns destructive Drum Lane operations.
- **Drum Repeat Workflow** owns repeat-specific pad routing and **Repeat Groove** state, not general Drum Lane destruction.
- **Track / Clip Sync** refreshes the **DSP Mirror** for clips, tracks, drum lanes, automation, and sidecar-derived UI state.
- The **UI Sidecar** persists UI-only state and is reconciled with DSP state through **Track / Clip Sync** after state load or resume.
- **Parameter Bank** read/write behavior depends on track type, active clip, active drum lane, and coalescing-sensitive DSP command rules.
- Every render module draws through the one **Render Surface**; the composition root assembles it once and passes it wherever a per-render deps bag was formerly built.
- **Patched Schwung Capability** checks keep the same **Tool Module** working on both stock and patched Schwung hosts.

## Example Dialogue

> **Dev:** "Should the Pad Surface clear a lane when Delete is held?"
> **Domain expert:** "No. The **Pad Surface** should classify and handle non-destructive performance input. Delete+lane belongs to a **Drum Lane Workflow**, and Rpt2 lane pads belong to a **Drum Repeat Workflow**."

> **Dev:** "Can this clip reread helper live in tick tasks?"
> **Domain expert:** "Only temporarily. Once both deferred readbacks and undo/redo use it, the concept is **Track / Clip Sync**, because the load-bearing rule is how the **DSP Mirror** is refreshed."

## Flagged Ambiguities

- "Sync" can mean writing JS mirrors to DSP or reading DSP into JS. Resolved: **Track / Clip Sync** means reading DSP state into the **DSP Mirror** unless explicitly described as a write.
- "Pad handling" previously covered padmap construction, live notes, drum lane destruction, and repeat routing. Resolved: **Pad Surface**, **Drum Lane Workflow**, and **Drum Repeat Workflow** are separate concepts.
- "State" can mean DSP persistence, UI-only sidecar persistence, or the in-memory DSP Mirror. Resolved: use **DSP Engine** state, **UI Sidecar**, or **DSP Mirror** explicitly.
- "Queue" can hide different ordering requirements. Resolved: use **Deferred Queue** only for Tick Pipeline drains that preserve `set_param` or `get_param` invariants.
