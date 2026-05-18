# dAVEBOx Architecture Audit — Audit-1: Inbound (Move → DSP)

Scope: pad-press / external-MIDI to DSP entry. Code reading + light device probe.
Output: per-item classification + effort estimate, feeding Phase 1 migration plan.

Source plan: memory `project_davebox_architecture_rethink.md` (2026-05-14).
Sister rethink memory framing: *MIDI traverses JS before reaching DSP. Phase 1 = remove JS routing layer between pad-press and DSP-feature-call.*

---

## Classification rubric (apply to each transformation)

For each item below, capture:

- **(a) JS state owned** — variables, arrays, or maps held in JS that the path reads/writes.
- **(b) DSP keys read/written** — `set_param` / `get_param` keys touched.
- **(c) Logic ownership** — *JS holds the algorithm* (decision, math, accumulation) vs *JS only routes params DSP already understands*.
- **(d) Recording-path entanglement** — does this transformation interact with `recordNoteOn` / drum recording / step-write paths?
- **(e) Classification** — one of:
  - `trivial-reroute` — JS just forwards args to a DSP feature. Phase 1 = call from `on_midi` directly.
  - `state-port` — JS holds material state. Needs DSP-side state struct + porting algorithm.
  - `hybrid` — DSP has the feature, but JS owns coordination state (e.g. held-note tracking) that needs to migrate.
  - `unknown — device probe` — closed-source / hardware behavior; mark and defer.
- **(f) Effort** — `XS` (≤1h, mechanical), `S` (1-4h), `M` (1-3 days), `L` (week+), `?` (depends on Audit findings).

The phase-1 effort estimate is the sum of (f) over `state-port` + `hybrid` items, plus the shim-patch baseline.

---

## Layer 0/1: Move firmware → Schwung shim → JS shadow_ui

**Findings (code-verified 2026-05-14):**

1. **Move firmware** writes MIDI to its HW MIDI_OUT mmap region (`global_mmap_addr + MIDI_OUT_OFFSET`). Timing / batching / ordering: **closed source, `unknown — device probe`**. Defer.
2. **Shim audio-thread scan** (`shadow_inprocess_process_midi`, `schwung_shim.c:1094`) iterates MIDI_OUT every audio block, slot-by-slot. For each event:
   - Calls `shadow_chain_dispatch_midi_to_slots(pkt, ...)` → invokes `on_midi(instance, msg, len, source)` on every chain slot's plugin **inside the audio thread**. For dAVEBOx this is **a no-op** — `dsp/seq8.c:4753` is an empty stub: `(void)instance; (void)msg; (void)len; (void)source;`. **This is the audio-thread hook that Phase 1 needs to populate.**
   - Calls `shadow_ui_midi_publish(head, status, d1, d2)` (`schwung_shim.c:2364`) — lock-free release-store into the shim→shadow_ui SHM ring + increments `shadow_control->midi_ready`.
3. **shadow_ui process** (separate process from audio thread) runs `while (!global_exit_flag)` (`shadow/shadow_ui.c:3387`). Each iteration:
   - If `midi_ready` changed since last iteration → `process_shadow_midi` (`shadow_ui.c:3283`) acquire-load-scans the ring; for each filled slot, calls `onMidiMessageExternal` (cable 2) or `onMidiMessageInternal` (cable 0/1) **as a JS function call**, then release-stores 0 to free the slot.
   - Then calls `tick()`.
4. **JS onMidiMessageInternal/External** (`ui/ui.js:7911`, `:8109`) fire once per event, separate JS turn per call. Synchronously dispatch into `_onPadPress` / `_onPadRelease` / `_onCC_*` / `_onStepButtons` / liveSendNote / etc.
5. **Live-note batching** — JS accumulates note events from any number of `onMidiMessage` calls into `pendingLiveNotes[t][]` (`ui.js:546`), drained once per `tick()` into a single `host_module_set_param('t{N}_live_notes', batch)` (`ui.js:2232`).
6. **DSP** processes `tN_live_notes` payload in the next render block: parser at `dsp/seq8_set_param.c:4114` walks the string left-to-right, calling `live_note_on` / `live_note_off` per token.

**State held in shim/shadow_ui:** none beyond the SHM ring slot bytes + `shadow_control->midi_ready` counter. **No transformation, no buffering with semantic content** on the shadow_ui side. However, `shadow_chain_dispatch_midi_to_slots` (`schwung/src/host/shadow_midi.c:320`) — which feeds the audio-thread `on_midi` path — does perform per-slot transformations:

1. **Channel filter (line 339)**: a slot only receives messages on its configured channel; slots set to All (-1) receive every channel. For dAVEBOx's 8-tracks-on-8-channels architecture, the slot must be configured All so DSP can route by channel internally to `tr->channel`. *Verify on device.*
2. **Channel remap (line 381)**: `shadow_chain_remap_channel(i, status)` rewrites the channel byte before invoking on_midi.
3. **Transpose (line 382)**: `shadow_chain_apply_transpose(i, msg)` rewrites the pitch byte before invoking on_midi.
4. **Source flag (line 384, line 398)**: `on_midi` receives `source = MOVE_MIDI_SOURCE_EXTERNAL` for routed MIDI and a separate broadcast pass at `MOVE_MIDI_SOURCE_FX_BROADCAST` for audio-FX side-chain (dAVEBOx should ignore broadcast).

**Latency floor (Wart 1):**
- D — shadow_ui loop scheduler latency (≤ 1 iteration of the shadow_ui main loop).
- F — `tick()` cadence ~94 Hz → 10.6ms quantization.
- G→H — `set_param` param shm visibility (1 render block).

The shadow_ui loop runs as a userspace process, not the audio thread. It is the slow brain.

**Phase 1 entry-point sketch:** implement `dsp/seq8.c::on_midi` to dispatch into `live_note_on` / `drum_record_note_on` / etc. on the audio thread. *Then* the JS path becomes UI-only (LED/OLED reaction), and the shim does not need patching for inbound capture — `on_midi` is already wired. **This is a smaller patch than the memory plan implies; the audio-thread MIDI hook already exists and is just unused.**

**Caveat to validate** in transformations below: every JS transformation that today owns state (Looper hold, preroll capture, TARP held-physical, etc.) must either move into DSP or accept being late.

**Classification:** Layer 0/1 itself is `clean` (no shim refactor needed for capture). Phase 1 surface area is at the DSP `on_midi` symbol + each JS transformation site.

---

## Layer 2: JS shadow_ui transformations

### 2.1 onMidiMessage dispatch (`ui.js:7911`, `:8109`)

- **(a) JS state** — `S.sessionOverlayHeld`, `S.knobTouched`, `S.knobTurnedTick[]`, `S.activeBank`, `S.perfViewLocked`, `S.trackLooper[]`, `S.deleteHeld`, `S.shiftHeld`, `S.trackPadMode[]`, `S.recordArmed`, `S.recordCountingIn`, `S.trackCCAutoBits[][]`, `S.trackCCLiveVal[][]`, `S.trackCCVal[][]`, `S.rndDialogMode`, `S.midiDlyRandomMode[]`, `S.noteFXRandomMode[]`, `S.allLanesQntResetTick`/`Track`, `S.bankParams[][][]`, `S.clockShiftTouchDelta`, `S.knobLocked[]`, `S.knobAccum[]`, `S.lastPadVelocity`, `S.lastPlayedNote`, `S.heldStep`, `S.heldStepNotes`, `S.stepWasEmpty`, `S.clipSteps[][][]`, `S.clipNonEmpty[][]`, `S.extMidiRemapActive`, `S.midiInChannel`, `S.trackChannel[]`, `S.trackRoute[]`, `S.seqActiveNotes`, `S.recordArmedTrack`, `S.drumRepeatHeldPad[]`, `S.drumRepeatHeldPadVel[]`, `S.drumPerformMode[]`, `S.drumRepeat2HeldLanes[]`, `S.drumLaneNote[][]`.
- **(b) DSP keys** — `tN_*_nudge` (clip / drum / all-lanes variants), `delay_pitch_random_mode`, `noteFX_random_mode`, `tN_cc_auto_clear_k`, `tN_cc_touch`, `track_looper`, `tN_drum_repeat_vel`, `tN_drum_repeat2_vel`, plus all downstream from `_onPadPress` / `_onCCMsg` / `_onStepButtons` / `_onPadRelease` / `_onCC_*` (recursive surface — see those entries).
- **(c) Logic ownership** — **JS holds dispatch + intent classification**: knob-touch vs knob-turn vs pad vs step-button vs CC vs aftertouch routing, all view/modifier overlays (Session overlay, Shift, Delete, Perf View locked, global menu, count-in, record-armed, rnd-dialog mode, held-step). This is the heart of the slow brain. None of these classifications are easily portable — they bind UI state to MIDI semantics.
- **(d) Recording entanglement** — gates record-arm checks (`S.recordArmed && !S.recordCountingIn`) at multiple branches. Held-step path (`S.heldStep >= 0`) writes step toggles via DSP `step_N_toggle` / `step_N_set_notes`.
- **(e) Classification** — **`hybrid`** for the dispatch envelope (UI dispatch stays in JS by definition; only the pad-note → DSP entry can move to `on_midi`). For Phase 1 the relevant question is *which downstream call sites need the audio-thread call path?* — that's `_onPadPress` (note-on), `_onPadRelease` (note-off), and the external-MIDI 0x90/0x80 branches in `onMidiMessageExternal`. Knob/CC/step-button routing can stay in JS slow brain.
- **(f) Effort** — **S**. Adding an `on_midi`-side fast path for note events does not require removing the JS dispatch; the JS path keeps running for UI side-effects (LED, OLED) and recording-coordination. Concretely: shim `on_midi(SOURCE_INTERNAL/EXTERNAL)` already differentiates source; DSP routes by `tr->channel` and `tr->route`. Knob CC remains JS-only.

### 2.2 pendingLiveNotes drain (`ui.js:546`, `:2232`)

- **(a) JS state** — `pendingLiveNotes[NUM_TRACKS][]` array (per-track queue of `{isOff, pitch, vel}`).
- **(b) DSP keys** — writes `tN_live_notes` payload (handled at `seq8_set_param.c:4114`). String parser walks left-to-right firing `live_note_on`/`live_note_off`.
- **(c) Logic ownership** — **routing-only**. The queue exists purely to defeat same-buffer per-key set_param coalescing (see `pending-live-notes-note-events-only` + `set-param-per-buffer-per-key` memories). It holds no semantic state — order in == order out. JS does not transform the note; the only logic is the batching itself.
- **(d) Recording entanglement** — `liveSendNote` (`ui.js:2253`) decides whether to queue based on `activelyRecording` (ROUTE_MOVE only — recording path inline-monitors via DSP). Drum recording path direct-fires through `_drumRecNoteOns` and bypasses the queue. Both interactions vanish once on_midi takes over: DSP would route to recording + monitoring synchronously in one call.
- **(e) Classification** — **`trivial-reroute`** (in fact, *delete*). Phase 1 obsoletes this entire mechanism. With `on_midi` firing on the audio thread, every event reaches `live_note_on` immediately in arrival order; no coalescing channel; no queue needed.
- **(f) Effort** — **XS**. Pure deletion once on_midi path lands; `_drainLiveNotes`, `queueLiveNoteOn/Off`, `pendingLiveNotes[]`, and the `tN_live_notes` set_param handler all become dead code. (Recording path's _drumRecNoteOns array similarly — see 2.6.)


### 2.3 VelIn scaling

- **(a) JS state owned** — `S.trackVelOverride[t]` (per-track, 0=Live, 1–127=fixed). Initialized from DSP via `applyTrackConfig` (`ui.js:2114`).
- **(b) DSP keys** — `t%d_tvo` (sparse, missing=0). Read at `dsp/seq8.c:1365–1367` on state load. Used by `effective_vel(tr, raw)` at `seq8.c:3652/3684/3800` (Rpt1/Rpt2 playback paths). **NOT applied** to `live_notes` (`set_param.c:4144`) nor to `drum_record_note_on` (`set_param.c:4002–4020`) — those take raw velocity as the param string.
- **(c) Logic ownership** — split. JS owns the application for inbound (live monitoring + recording) via `liveSendNote` (`ui.js:2257–2260`), with explicit `rawVel` bypass for right-pad vel-zone / Rpt-vel / step-entry. DSP owns the application for autonomous repeat playback (`effective_vel`). The split is intentional: paths that need bypass (vel zones, vel-pad recording) sit in JS today and pass the raw byte to DSP, so DSP can't blindly re-apply.
- **(d) Recording entanglement** — strong. `drum_record_note_on` records `step_vel` as-passed; JS must pre-apply VelIn (and/or zone) before firing the set_param. Same pattern for melodic record.
- **(e) Classification** — **`hybrid`**. Algorithm is trivial (one multiply/replace), but the boundary needs to know intent (apply vs bypass) per event, which today is encoded in `rawVel` at JS call sites.
- **(f) Effort** — **S**. Move `track_vel_override[]` into the DSP-visible side and have `on_midi` apply it by default. Bypass paths (right-pad zone, repeat-vel, step-entry-on-held-step) must be classified inside DSP via the same source-bank/intent flags 2.5/2.6 need; if those move together, VelIn is mechanical.
- **Phase 1 implication** — `on_midi` applies VelIn before `live_note_on` for plain pad presses; vel-zone and repeat-vel events must arrive with a `rawVel`/source flag so DSP knows to skip the override.

### 2.4 Scale-aware transpose

- **(a) JS state owned** — `S.padNoteMap[32]`, `S.padScale`, `S.padKey`, `S.padOctave[t]`, `S.scaleAware`, `S.padLayoutChromatic[t]`, plus `SCALE_INTERVALS` lookup. `computePadNoteMap()` (`ui.js:1317`) bakes pitch into `padNoteMap` on key/scale change.
- **(b) DSP keys** — `key` (`inst->pad_key`), `scale` (`inst->pad_scale`), `scale_aware` (`inst->scale_aware`). DSP `scale_transpose()` at `dsp/seq8.c:2463` — invoked **only on clip-playback note-fx (harmonize / random / note offset)**, never on inbound live pads.
- **(c) Logic ownership** — **JS owns the inbound resolution**. *Critical distinction*: Move firmware emits notes 68–99 for pad presses (one MIDI note per physical pad — see FEATURE_REFERENCE.md). JS `computePadNoteMap` (`ui.js:1317–1339`) computes a *non-trivial* 32-entry pad-index → MIDI-pitch table:
  - Chromatic layout: `pitch = root + col + row*8` where `root = padOctave*12 + padKey`.
  - Diatonic layout: `pitch = root + (deg/n)*12 + intervals[deg % n]` where `deg = col + row*3`.
  This is **not equivalent** to `scale_transpose(raw_note, 0)` — `scale_transpose` is a degree-offset shifter, not a pad-index-to-pitch resolver. Today JS substitutes the resolved pitch *before* set_param fires; DSP sees the absolute MIDI note already. The "firmware pad → MIDI note" mapping (Move's pad-row-to-note-number scheme) is a *different, lower-level* mapping than the scale-aware mapping JS does on top.
- **(d) Recording entanglement** — clip notes are stored with the already-resolved pitch (JS feeds resolved pitch to record/step-write). Scale changes mid-recording do not retroactively re-scale prior notes.
- **(e) Classification** — **`state-port`** (corrected from `trivial-reroute` after advisor flag). `on_midi` receives the firmware pad note (68–99), not the scale-aware pitch. DSP must own a `pad_note_map[NUM_TRACKS][32]` cache plus per-track `pad_octave[t]` and `pad_layout_chromatic[t]` state, with the `computePadNoteMap` algorithm ported to C and re-baked on any key/scale/octave/chromatic change. DSP must also branch on `source` (INTERNAL = pad press → apply map; EXTERNAL = real MIDI → pass through raw).
- **(f) Effort** — **S** (corrected from XS). New per-track DSP state (`pad_octave`, `pad_layout_chromatic`, `pad_note_map[32]`), port computePadNoteMap (~20–30 lines C), re-bake hook on `key`/`scale`/`scale_aware`/octave/layout set_params, and `on_midi` source-branch. Pad-index derivation from MIDI note: `padIdx = note - 68` for notes in [68, 99]; outside range = not a pad press, treat as external/raw.
- **Phase 1 implication** — `on_midi` cannot assume incoming note pitches are already scale-resolved. Without this port, Phase 1 changes the *user-visible scale-aware behavior* (pads stop responding to key/scale settings). DSP-side resolution is mandatory for Phase 1; treat as part of Bundle 1, not deferred.

### 2.5 Rpt1 / Rpt2 logic

- **(a) JS state owned** — `S.drumPerformMode[t]` (0/1/2), `S.drumRepeatHeldPad[t]`, `S.drumRepeatHeldPadVel[t]`, `S.drumRepeatLatched[t]`, `S.drumRepeat2HeldLanes[t]`, `S.drumRepeat2LatchedLanes[t]`, `S.drumRepeat2RatePerLane[t][lane]`, mirrors of DSP gate/velScale/nudge (`syncDrumRepeatState`, `ui.js:1546–1556`). **Coalescing band-aid**: `S.pendingRepeatLane` / `S.pendingRepeatLaneTrack` (`ui.js:6761–6765`, drained at `ui.js:3854–3857`).
- **(b) DSP keys** — `tN_drum_repeat_start/stop/lane/vel`, `tN_drum_repeat2_lane_on/off/rate/vel`, `tN_lN_repeat_state` (read-back). Handlers at `seq8_set_param.c:3852–3977`.
- **(c) Logic ownership** — **DSP-autonomous** once activated. Pad press fires one `drum_repeat_start` set_param; `drum_repeat_tick` / `drum_repeat2_tick` (`seq8.c:3660–3863`) own the rate-driven fire loop, InQ quantization, recording into the active clip on each fire. JS only does activation, lane-switch deferral, and aftertouch poke.
- **(d) Recording entanglement** — fires inside the DSP tick path write directly into the active drum clip (`seq8.c:3712–3741, 3818–3846`), respecting InQ semantics. No JS in the loop.
- **(e) Classification** — **`hybrid`** for the pad-press entry, mostly `trivial-reroute` once you're inside DSP. The `pendingRepeatLane` deferral is a coalescing band-aid that **does not disappear automatically** with `on_midi` — under on_midi, two pad events (rate-pad + lane-pad) in one audio block still need ordered delivery. With on_midi the band-aid is *internal to DSP* (a 1-tick queue inside the track struct) instead of `set_param`-coupled. Still required, but simpler.
- **(f) Effort** — **M** (~3–4 days). Move pad-classification (rate pad vs lane pad vs vel pad) into a `drum_pad_event(track, padIdx, vel, isOn)` DSP helper. Replicate Rpt1 lane-switch deferral as a per-track field. Aftertouch poke is already a thin set_param — can stay or move opportunistically.
- **Phase 1 implication** — `on_midi` must dispatch drum-track pad events through a new DSP-side classifier; today this classifier lives in `_onPadPress`. Risk: Rpt2 (`ui.js:6547–6600`) is less stable per agent flag — handle carefully.

### 2.6 Velocity zones (drum)

- **(a) JS state owned** — `S.drumVelZoneArmed[t]` (per-track boolean sticky), `S.drumLastVelZone[t]` (0–15 cached zone). Helpers `drumPadToVelZone()` (`ui.js:1390`), `drumVelZoneToVelocity()` (`ui.js:1398`), `stepEntryVelocity()` (`ui.js:1003`).
- **(b) DSP keys** — **none today**. Vel-zone state does not exist in DSP at all.
- **(c) Logic ownership** — pure JS. Right-pad press detected in `_onPadPress` (`ui.js:6626`) sets armed + last zone. Subsequent left-pad presses consume the armed zone via `stepEntryVelocity()` (priority: active zone press > sticky zone > VelIn > default 100). Velocity flows into recording / step-write / monitoring scalars but no zone state reaches DSP.
- **(d) Recording entanglement** — velocity feeds `drum_record_note_on` set_param + `_step_N_vel` writes; monitoring is `liveSendNote(..., rawVel=true)` to bypass VelIn.
- **(e) Classification** — **`state-port`**. No DSP coupling today. To run inbound on the audio thread, the armed-zone state must live in DSP per-track (e.g. `drum_vel_zone_armed`, `drum_last_vel_zone`).
- **(f) Effort** — **S**. New DSP per-track fields, port `drumPadToVelZone` + `stepEntryVelocity` priority stack to C, integrate into `on_midi`. Estimate ~150 lines DSP.
- **Phase 1 implication** — **gating dependency for 2.3 (VelIn)** — zone selection must run before any "apply VelIn?" decision in DSP. Cannot defer to JS callback; by then the note is in flight. 2.5 (Rpt) and 2.6 (zones) and 2.3 (VelIn) form a coupled triplet for Phase 1.

### 2.7 Looper capture

- **(a) JS state owned** — `S.trackLooper[t]` (per-track on/off toggle), session-view gesture state (`S.loopGestureStart`, `S.loopGestureFired`, `S.loopGestureCtx`, `S.loopGestureTrack`, `S.loopGestureClip`, `S.loopGestureLane`), `S.perfStack` (perf-mode arm stack), `S.perfSync` (sync flag).
- **(b) DSP keys** — `track_looper` (via `applyTrackConfig`, `ui.js:2134`), `looper_arm <ticks>`, `looper_stop`, `looper_retrigger`, `looper_sync` (`ui.js:5111/5135/6437/6940/6949/6963/6964/6973/6983/6987`).
- **(c) Logic ownership** — **DSP-native capture**. The looper IS audio-thread resident: state machine (IDLE/ARMED/CAPTURING/LOOPING) at `dsp/seq8.c:697–701`, event buffer `looper_events[LOOPER_MAX_EVENTS=1024]` at `:744`, capture hook inside `pfx_send` (`:1700`) post-effects. Per-track `looper_on` toggle gates capture and playback. JS only owns (i) the per-track on/off toggle and (ii) the user gesture that translates "Loop+step N" into a tick count. Capture itself happens entirely on the audio thread — *no JS in the capture path*.
- **(d) Recording entanglement** — independent of clip recording. Looper is post-fx capture; clip recording is pre-fx (raw input → `notes[]`). Both can be armed simultaneously without interference.
- **(e) Classification** — **`trivial-reroute`** for inbound. The plan's "Looper capture" item turns out to be a misread of where capture lives — the actual capture is DSP-native already.
- **(f) Effort** — **XS**. No changes required. The JS-side arming gesture stays in JS (it's a UI gesture, not in the audio path). The `looper_arm` set_param can stay as-is or move into `on_midi` opportunistically if the arming pad press is on the audio thread.
- **Phase 1 implication** — none. Looper survives Phase 1 unchanged.

### 2.8 Count-in preroll (deep)

- **(a) JS state owned**
  - `S.recordCountingIn`, `S.countInStartTick` (JS tick at count-in start), `S.countInBeatStartTick`, `S.countInQuarterTicks`, `S.transportStartTick` (JS tick when transport-start fires after count-in).
  - `S.pendingPrerollNote` — drum-mode single capture: `{ track, lane, laneNote, vel, pressedAtTick, countInStart, releasedAtTick? }`.
  - `S.pendingPrerollNotes[]` — melodic chord capture: array of `{ track, clip, pitch, vel, pressedAtTick, countInStart, releasedAtTick? }`.
  - `S.pendingPrerollToggleQueue[]` — chord-drain queue, one toggle per tick.
  - `S.pendingPrerollGate` — deferred gate write fired one tick after last toggle.
- **(b) DSP keys** — `tN_cC_step_LS_toggle` (or `tN_lL_step_LS_toggle` for drum), `tN_cC_step_LS_gate` / `tN_lL_step_LS_gate`. Where `LS = loop_start`. The two-tick deferred pattern (see memory `two_tick_deferred`) — toggle then gate one tick later — is preserved end-to-end.
- **(c) Logic ownership** — **JS owns the entire algorithm.** Capture sites at `_onPadPress` drum branch (`ui.js:6757`) and melodic branch (`ui.js:6855`), both gated on `S.recordCountingIn`. Release stamps `releasedAtTick` at `ui.js:7878–7883`. The drain in `tick()` (`ui.js:4385–4470`) does the heavy lifting:
  1. Waits until *all chord notes released AND ≥ 1 step elapsed after transport start* (skips first loop pass to avoid double-trigger).
  2. Computes `dspPerJs = 384 / countInDur` (JS-tick → DSP-tick ratio measured during count-in).
  3. Computes `gate = clamp(pressedDur * dspPerJs, 1, tps*16)`.
  4. Stamps the first held note as a `_step_LS_toggle`, drains remaining chord notes one per JS tick (`pendingPrerollToggleQueue`) — a coalescing band-aid.
  5. Fires `_step_LS_gate` one tick after the final toggle (`pendingPrerollGate`).
  6. TARP-on bail-out: discards all preroll state since `tarp_fire_step` records the arp output instead (`ui.js:4433`).
- **(d) Recording entanglement** — central. This *is* the recording capture path for any notes pressed during count-in. Separate from the post-count-in record path (`_recNoteOns` / `_drumRecNoteOns`), which is the normal recording flush above it in the same tick block.
- **(e) Classification** — **`state-port`**. Material algorithm: timing math, chord aggregation, two-tick gate-after-toggle pattern, TARP gate. Today the algorithm exists *because* JS can't read DSP tick directly during count-in; DSP can do this cleanly with its own tick basis. Effort goes mostly into porting the algorithm and adding DSP state for the capture buffer.
- **(f) Effort** — **M** (~3–5 days). New DSP struct fields (`preroll_buf[NUM_TRACKS][N_pitch_slots]` with `pressed_tick`, `released_tick`, `vel`, `pitch`/`laneNote`; flush state per track). On_midi captures into the buffer when `recording_counting_in`. At transport-start edge, DSP runs the conversion (with native tick basis — no `dspPerJs` ratio needed) and writes directly into clip notes via `clip_insert_note` instead of going through `_step_LS_toggle` + `_step_LS_gate` set_params. The two-tick deferred pattern collapses because DSP can write notes[] and steps[] in one atomic operation. Net result: simpler code, no coalescing band-aids, more accurate timing.
- **Phase 1 implication** — preroll is *the* place where Phase 1 most directly improves timing. Today the recorded preroll chord is stamped at step 0 with gate computed from JS-tick-domain math (`dspPerJs` ratio). After Phase 1, capture timing is DSP-native and the stamped position can carry sub-step `note_tick_offset` (per `step_write_rounding` memory). TARP-on bail-out semantics must be preserved.

### 2.9 TARP input chord aggregation

- **(a) JS state owned** — UI-display only. `tN_tarp_held` get_param drains DSP's held buffer for visual feedback (Arp chip inversion per `tarp_latch_semantics` memory); JS does not aggregate.
- **(b) DSP keys** — JS calls `tN_live_notes` per note event (see 2.2); DSP's `live_note_on` / `live_note_off` (`seq8.c:3884–3965`) intercept on the DSP side and run all aggregation logic.
- **(c) Logic ownership** — **DSP-native**. The `arp_engine_t` per track owns `held_pitch[ARP_MAX_HELD]`, `held_physical[ARP_MAX_HELD]`, `held_count`. `arp_add_note` / `arp_remove_note` (`seq8.c:3231/3234`), `tarp_drop_latched` (`:3603`), latch-aware on/off semantics with the held_physical vs latched-but-not-physical distinction (`:3907–3927`, `:3956–3958`). The "TARP-on track records arp output, not input chord" decision (per `davebox-architecture-rethink` open-questions answer + `seq8.c` tarp_fire_step) is all DSP-side.
- **(d) Recording entanglement** — only via `tarp_fire_step` writing to clip while recording is armed (DSP path). Input chord itself is not recorded (by design). 2.8 (preroll) explicitly bails out for TARP-on tracks.
- **(e) Classification** — **`trivial-reroute`** for inbound. The note path `on_midi → live_note_on(inst, tr, pitch, vel)` invokes existing DSP TARP logic with zero changes.
- **(f) Effort** — **XS**. No new state, no new algorithms. The `on_midi` audio-thread path calling `live_note_on` directly is faster than today's `set_param('tN_live_notes', ...)` indirection — same destination, no string parse, no per-buffer-key coalescing window.
- **Phase 1 implication** — TARP is one of the strongest cases for Phase 1: today's input → JS-tick batch → set_param string → DSP parser → `live_note_on` chain incurs the full ~10–20ms slow-brain stack before chord aggregation even starts. Direct `on_midi → live_note_on` aggregates inside the same audio block. *This is the path most-affected by the chord-stagger investigation that motivated the refactor.*

---

## Layer 3: JS → DSP boundary recheck

### 3.1 `tN_live_notes` payload (note on/off)
The existing band-aid against same-buffer per-key set_param coalescing. JS accumulates all note events from any number of `onMidiMessage` calls into `pendingLiveNotes[t][]`; `tick()` drains into one set_param per track; DSP parser walks left-to-right firing `live_note_on`/`live_note_off`. **Verified working** under chord input. Phase 1 obsoletes this whole mechanism (see 2.2).

### 3.2 `shadow_send_midi_to_dsp` path (CC / AT / PB / non-note)
The earlier audit framing claimed this path "shares the set_param coalescing channel." That was my mistake — the existing memory `pending_live_notes_note_events_only` only says non-note events must go via `shadow_send_midi_to_dsp` instead of pendingLiveNotes, which is correct.

Traced today (2026-05-14):
- `liveSendNote` (`ui.js:2293`) calls `shadow_send_midi_to_dsp([status, d1, d2])`.
- Schwung shadow_ui binds this to `js_shadow_send_midi_to_dsp` (`schwung/src/shadow/shadow_ui.c:841`) which writes to a **separate ring buffer** (`shadow_midi_dsp_shm`), 4-byte aligned, with its own `ready` counter — **not** the param-shm channel.
- Shim drains via `shadow_drain_ui_midi_dsp()` (`schwung/src/host/shadow_midi.c:702`) and dispatches each packet to chain slots via `shadow_chain_dispatch_midi_to_slots(pkt, ...)` — which invokes **`on_midi(instance, pkt, len, source)`** on each chain slot's plugin.

**Implication:** dAVEBOx's `on_midi` is a no-op (`dsp/seq8.c:4753`). So **every CC / aftertouch / pitchbend message routed via `shadow_send_midi_to_dsp` arrives at dAVEBOx DSP and is dropped on the floor.** It only reaches other chain plugins that implement on_midi.

This means:
- ROUTE_SCHWUNG live CC/AT/PB (`liveSendNote` non-note branch) **does not modulate dAVEBOx's pfx chain today**. If a user routes MPE-style expression to a dAVEBOx track expecting NOTE FX / TARP / etc. to respond, nothing happens.
- ROUTE_MOVE external CC/AT/PB has the same outcome inside dAVEBOx.

**Phase 1 bonus:** the moment `on_midi` is implemented to call `live_note_on`/`live_note_off` for note events, the same handler can also forward CC/AT/PB to a `live_cc(tr, ...)` / `live_at` / `live_pb` entry — enabling MPE-style expression that doesn't exist today. This is a *new capability*, not just a refactor.

### 3.3 Held-step writes from external MIDI
`onMidiMessageExternal` melodic branch (`ui.js:8184`) writes `tN_cC_step_HELDSTEP_set_notes` or `tN_cC_step_HELDSTEP_toggle` per pad press. **Same key across multiple presses in one audio buffer → coalesces to last write.** Not currently batched like live_notes. A 3-note chord pressed simultaneously while holding a step loses 2 notes if all three land in one buffer.

**Severity:** unknown — needs a device probe. The path is gated on `S.heldStep >= 0 && !S.shiftHeld && !S.sessionView` which is a manual gesture; users typically don't slam 3 pads simultaneously while holding a step button. But the failure mode exists.

**Phase 1 fix:** with `on_midi` in DSP, held-step writes can fire `clip_insert_note` / `step_notes` mutation directly on the audio thread with full ordering preserved.

### 3.4 Recording note batching
Already correct: `_recNoteOns` / `_drumRecNoteOns` / `_recNoteOffs` / `_drumRecNoteOffs` arrays batch into single set_param payloads (`tN_record_note_on`, `tN_drum_record_note_on`, etc.) in the tick flush (`ui.js:4361–4384`). One payload per buffer per track. **Same pattern as live_notes, also obsoleted by Phase 1.**

### 3.5 Drum repeat lane switch
The `pendingRepeatLane` deferral (`ui.js:6761–6765` → tick drain `:3854–3857`) defers `tN_drum_repeat_lane` set_param by 1 tick to avoid colliding with the pad-press `drum_repeat_start` payload in the same buffer. **Survives Phase 1** as an internal DSP queue (see 2.5).

---

## Punch list

> ⚠️ **Finding #1 below was SUPERSEDED by Audit-3 follow-up §3.2 (lines 716–778).** The "no shim patch needed" claim was wrong — pad presses do NOT reach overtake `on_midi` today. Use the dispatch table in Audit-3 follow-up §3.2 as the canonical reference. Phase 1 Bundle 1 effort revised from S (2–3 days) to M (3–4 days) accordingly.

### Major findings that change the Phase-1 plan

1. **`dsp/seq8.c::on_midi` is already wired by Schwung — just empty.** The "shim patch on `legsmechanical/schwung` to deliver pad MIDI directly to a new DSP host hook" described in the rethink memory's Phase 1 step 1 **is not needed**. The audio-thread MIDI hook exists (`shadow_chain_dispatch_midi_to_slots` → `on_midi` for every plugin). Populating the stub is the entire shim-side effort.

   **CORRECTION (Audit-3 follow-up §3.2):** This finding is wrong. Pad presses are routed only to chain slots, not to overtake DSP. dAVEBOx is `tool_config.overtake: true`, not a chain slot. A shim patch IS required to deliver internal pad MIDI to overtake `on_midi`. See §3.2 for the verified dispatch table.
2. **`shadow_send_midi_to_dsp` writes to a separate ring**, drained by `shadow_drain_ui_midi_dsp()` → `on_midi`. Memory `pending_live_notes_note_events_only` is wrong about the channel. Today, **all CC/AT/PB inbound is silently dropped** by dAVEBOx because `on_midi` is empty. Implementing `on_midi` unlocks MPE-style expression as a side-effect of Phase 1.
3. **Three "JS transformations" listed in the rethink memory are already DSP-native:** Looper (capture inside `pfx_send`), scale-aware transpose (pad → MIDI happens JS-side and DSP receives absolute pitch — no scale logic on inbound), TARP input chord aggregation (DSP `arp_engine_t.held_pitch[]/held_physical[]` owns it). These contribute **XS** effort each — most of which is just deleting the no-op JS path.

### Per-item classification summary

| Item | Class | Effort | Notes |
|---|---|---|---|
| 2.1 onMidiMessage dispatch | hybrid | S | UI dispatch stays JS; only pad/external note path moves |
| 2.2 pendingLiveNotes drain | trivial-reroute (delete) | XS | Whole mechanism becomes dead code |
| 2.3 VelIn scaling | hybrid | S | Coupled with 2.5 / 2.6 — need bypass flag/source classification |
| 2.4 Scale-aware transpose | state-port | S | DSP must own pad_note_map + computePadNoteMap port + source-branch (advisor correction) |
| 2.5 Rpt1 / Rpt2 dispatch | hybrid | M | Pad-press classifier moves to DSP; lane-switch deferral persists |
| 2.6 Velocity zones (drum) | state-port | S | No DSP state today; ~150 lines new C |
| 2.7 Looper capture | trivial-reroute | XS | Already DSP-native — misclassified in memory |
| 2.8 Count-in preroll | state-port | M | Largest single port; algorithm + capture buffer; obsoletes timing band-aids |
| 2.9 TARP input aggregation | trivial-reroute | XS | Already DSP-native — the call site changes, not the engine |

### Recommended Phase 1 order

1. **Skeleton + scale-aware port** (S + S): implement `on_midi(inst, msg, len, source)` that:
   - Ignores `MOVE_MIDI_SOURCE_FX_BROADCAST`.
   - For pad-note range (68–99) and `source == INTERNAL`, derives `padIdx = note - 68` and looks up `pad_note_map[track][padIdx]` (new per-track cache, populated by ported `computePadNoteMap`) for the resolved pitch.
   - For external MIDI, passes pitch through raw.
   - Routes to `live_note_on`/`live_note_off` (melodic) or drum equivalent by track channel match (`tr->channel == (msg[0] & 0x0F) + 1`).
   - Port `computePadNoteMap` to C; re-bake on `key`/`scale`/`scale_aware`/`pad_octave`/`pad_layout_chromatic` set_param.
   - Initially keep the JS `tN_live_notes` path as fallback under a feature flag. *Latency floor measurement* on device: chord-stagger improvement vs today is the headline metric.
   - **Verify**: slot is configured channel=All so dAVEBOx sees all 8 channels — device probe.
2. **VelIn + vel zones + Rpt dispatch** (S + S + M, coupled): port the right-pad classification path together. These three depend on shared "input intent" state (vel-pad press vs lane pad vs rate pad). Order within the bundle: vel zones first (no DSP state today), then VelIn (needs zone bypass), then Rpt (consumes both).
3. **Count-in preroll** (M): port the capture buffer + chord drain + gate-after-toggle pattern. Big win: native DSP-tick timing replaces the JS-tick → DSP-tick ratio. Preserve TARP-on bail-out.
4. **Cleanup** (XS-S): delete `pendingLiveNotes`, `_drainLiveNotes`, `queueLiveNoteOn/Off`, the `tN_live_notes` payload parser (or keep as dead-code fallback briefly). Delete the JS-side preroll arrays.

### Out of Audit-1 scope but flagged

- **CC/AT/PB inbound capability** (section 3.2) — new feature unlocked by `on_midi`; not required for chord-stagger fix but trivial to fold in.
- **Held-step coalescing under chord-spanning external MIDI** (section 3.3) — known coalescing failure mode, severity unknown without device probe. Phase 1's `on_midi` path resolves it as a side effect when held-step writes move to DSP.
- **Move firmware MIDI ordering / timestamping** — `unknown — device probe`. Not blocking; Schwung shim is arrival-order passthrough.
- **`shadow/input_filter.mjs`** — Schwung-shared LED/button cache, *not* a MIDI input transformation. Memory `reapply_palette_led` references it for LED reapply semantics. Not part of Layer 2.

### Total Phase 1 effort estimate

Counting only the porting work (not the audit itself): **~2.5 weeks** at sustained pace.

- Bundle 1 (skeleton + scale-aware port + cleanup): 2–3 days.
- Bundle 2 (VelIn + vel zones + Rpt): 4–6 days.
- Bundle 3 (count-in preroll): 3–5 days.
- Integration + device verification: ongoing across bundles.

Risks: Rpt2 is flagged as less stable (per agent #6 finding); handle carefully. Preroll has TARP-on bail-out semantics that must be preserved exactly. The held-step coalescing fix (3.3) is a bonus that could land in Bundle 1 if convenient. Scale-aware port has device-probe gating (verify slot channel=All) that could surface unexpected routing constraints.

---

## Next session

- Pre-Phase-1 device probe: capture pad-event MIDI_OUT trace under chord input on a TARP-armed track to measure today's slow-brain floor (so Phase 1's improvement is quantifiable, not just theoretical).
- Audit-3 (Output routes + side channels) — schedule independently of Phase 1; doesn't gate the inbound rewire.
- Audit-4 (Cross-cutting + dead-stagger code) — independent, lands as small Phase-0 fixes on `main`.

---

# Audit-2: Storage write + Playback read

Scope: how arrived MIDI lands in `notes[]` / step arrays; how playback reads it back; multi-track parallelism; loop window wrap. Code reading only.

## Layer 4: Storage write path

### 4.1 Melodic recording (`tN_record_note_on` at `seq8_set_param.c:3220`)

**Multi-event-in-one-buffer behavior** — verified clean:
- JS batches all chord note-ons into one set_param payload (`ui.js:4361–4366`).
- DSP snapshots `current_clip_tick` once at handler entry (line 3228); every note in the payload lands at that same tick. **Chord cohesion preserved by design.**
- InQ snap (line 3233–3234): if `inst->inp_quant` set, tick rounds down to step boundary.
- Per note: `clip_insert_note` appends to `notes[idx]` with `{tick, gate=GATE_TICKS, pitch, vel, suppress_until_wrap=1, active=1}` (`:4462–4477`). Step array mirror updated synchronously (steps[], step_notes[], step_note_count[], step_vel[], step_gate[], note_tick_offset[], LRS_SET). **Atomic per note.**

**Caps (silent drops on overflow)**:
- `cl->note_count >= MAX_NOTES_PER_CLIP` → `clip_insert_note` returns -1; note dropped, step mirror not updated. **Unknown — needs to check actual MAX_NOTES_PER_CLIP value and whether real usage approaches it.**
- `rec_pending[10]` per track — 11th simultaneously held melodic note silently not registered for gate close on note-off; gate stays at default GATE_TICKS instead of actual hold duration.
- `step_note_count[sidx] < 8` check (line 3292) — 9th note in same step dropped from step mirror (notes[] still has it; step LED + step-edit overlay won't see it).

**TARP bypass**: line 3256–3259 — when `tr->tarp_on`, raw input feeds `live_note_on` (arp held buffer); arp output gets recorded by `tarp_fire_step` later, not by record_note_on. Matches `davebox-architecture-rethink` open-questions answer.

**ROUTE_MOVE inline monitor**: line 3310 — fires `live_note_on` immediately after insert so the performer hears the note without a separate live_notes set_param race. Same-buffer behavior — no extra latency.

**Phase 1 implication**: with `on_midi` firing per event on the audio thread, JS-side payload batching becomes unnecessary. Each event calls `clip_insert_note` directly. *Tick precision does not improve within a block* — `current_clip_tick` only updates at the per-DSP-tick advance loop (line 6695), so multiple on_midi calls in one render_block all snapshot the same clip tick. Sub-block timing precision requires recomputing tick from sample-position; **deferred per the architecture rethink memory (sub-block jitter deferred)**. Today's block-quantized recording is the baseline Phase 1 maintains.

### 4.2 Drum recording (`tN_drum_record_note_on` at `seq8_set_param.c:3981`)

Step-aligned, not tick-aligned. Each pitch maps to its lane by `midi_note`; writes one entry to `dlc->step_notes[step]` at `tr->drum_current_step[lane]`.

**One-hit-per-step semantics** (line 4016: `dlc->step_note_count[step] == 0`): if step already has a hit, the new hit is **silently dropped**. Two payload-chord-pitches both routing to lanes that landed on already-occupied steps both lose. (Cross-lane collisions don't happen — each pitch maps to a unique lane via midi_note.)

**Sub-step InQ** (line 4025–4037): per-track `drum_inp_quant` priority; nearest-rounding sub-step; falls back to global `inp_quant` (snap to step) or raw `drum_tick_in_step`. Sub-step offset goes into `note_tick_offset[step][0]`.

**clip_migrate_to_notes** (line 4041): rebuilds notes[] from steps after each insert. Mostly OK because drum-record is step-anchored.

**suppress_until_wrap** (line 4042–4049): sets the flag on any note at the recorded tick. Prevents same-pass replay.

**drum_rec_pending[lane]** (line 4051–4055): per-lane single slot tracking the on-tick + step for the matching off. A re-hit on the same lane while the previous note-off is pending **overwrites** the pending state — the prior note's gate never closes from the off handler.

**Phase 1 implication**: same as 4.1 — on_midi can call this code directly. The one-hit-per-step drop is intentional behavior; not a refactor target.

### 4.3 Hidden write paths

- **TARP recording** lives in `tarp_fire_step` (DSP audio thread, drives arp output → clip on recording flag).
- **SEQ ARP recording** similar pattern in `arp_fire_step`.
- **Drum Repeat recording** in `drum_repeat_tick` / `drum_repeat2_tick`, gated by `drum_last_rec_step[DRUM_LANES]` write-once detector (per memory `drum_repeat_recording_write_once`).
- **Live Merge** captures into a separate `merge_pending` buffer, finalizes at next page boundary.
- **Bake**: bake_clip / bake_drum_clip / bake_drum_lane re-run pfx chain offline and write to clip.

All of these already run on the audio thread; Phase 1 doesn't touch them.

## Layer 5: Playback read path

### 5.1 Tick model (`render_block` at `seq8.c:6195`)

- Per render_block: `inst->tick_accum += inst->tick_delta`; while `tick_accum >= tick_threshold`, **advance one DSP tick** (loop at `:6332`). Multiple DSP ticks per block possible (high BPM / small buffers).
- Per DSP tick (the inner loop body):
  1. `looper_tick`
  2. Swing recompute (at `master_tick_in_step == 0`)
  3. Merge state transitions (ARMED→CAPTURING at step boundary; STOPPING→finalize at 16-step page)
  4. Metro beat
  5. **Per-track loop (8 iterations)** — WINDOW SNAP safety net → gate countdown (`play_pending[32]`) → clip-launch / page-stop / record-arm at `master_tick_in_step==0` → note-on scan → drum_repeat_tick → drum_repeat2_tick → tarp_tick → arp_tick → CC automation playback + touch-record
  6. **Per-track tick + step advance (8 iterations)** — melodic: `tick_in_step++` → on wrap, `current_step` advances within `[loop_start, loop_start+length)` → on `current_step == loop_start`, clear `suppress_until_wrap`, reset `live_recorded_steps`, retrigger SEQ ARP. Drum: per-lane independent tick + step advance (32 lanes × 8 tracks = **256 independent playheads**).
  7. `current_clip_tick` recomputed (line 6695): `current_step * tps + tick_in_step`.
  8. `master_tick_in_step++`; on wrap, `global_tick++`.
- Per block-end: `pfx_q_fire(track.pfx, sample_counter_at_block_end)` (line 6215) — all queued events with `fire_at ≤ block-end` fire in immediate succession. Same for drum lanes.

### 5.2 Note-fire timing

- Per-DSP-tick per-track scan over `cl->notes[]` (line 6551): match `effective_note_tick(n, cl, quantize) == current_clip_tick`. Match → `pfx_note_on(inst, tr, pitch, vel)` and register `play_pending` entry for gate countdown.
- `play_pending[32]` cap per track (line 6535/6565): if overflowed, `pfx_note_on` still fires but **no gate countdown registered** — note hangs (no sequencer note-off). User-observable bug under extreme polyphony.

**`effective_note_tick` (`seq8.c:6123`) — verified sub-tick-precise:**
- `sn = note_step(n->tick)` → rounded step index.
- `delta = n->tick - sn*tps` → signed sub-step offset (may be negative if note rounded up).
- `eff_tick = sn*tps + delta * (100 - quantize) / 100`.
- `quantize=0` → `eff_tick == n->tick` exactly (sub-step preserved).
- `quantize=100` → `eff_tick == step_grid` (snap to step).
- In-between → linear interpolation from sub-step to grid.
- Both `eff_tick` and `cct = current_step*tps + tick_in_step` are integers in the same tick domain. **Equality is exact.** Stored sub-step offsets (`note_tick_offset[step][i]`) survive playback so long as the playhead increments through every integer tick — which the tick-accumulator loop (`:6332`) guarantees as long as `tick_accum >= tick_threshold` is checked in a while-loop. **No skipped ticks, no double-fires.**

**Sample-accuracy ceiling**: note fires at `pfx_note_on` immediately, but the actual MIDI emit through `pfx_send` queues into the per-track pfx queue with sample-position fire_at. The block-end `pfx_q_fire` flushes everything with `fire_at ≤ now` — so all events in the same render_block fire together at block end. **Sub-block timing is erased** (per the architecture rethink "sub-block jitter deferred" finding).

### 5.3 Multi-track parallelism

- All 8 tracks **lock-step on the master DSP tick**. The `for (t = 0; t < NUM_TRACKS; t++)` per-tick loops advance every track at the same tick boundary.
- Per-track state independence: each track has its own `current_step`, `tick_in_step`, `active_clip`, `pfx.sample_counter`. Drum tracks have per-lane `drum_current_step[32]`, `drum_tick_in_step[32]`.
- **Clip TPS divergence**: tracks can have different `ticks_per_step` (per-clip `cl->ticks_per_step`). The master DSP tick is the *finest grain*; each track's tick_in_step advances 1 per master tick, wraps at its own clip's tps. So tracks with smaller tps step faster — but all share the master tick budget, so master-tick alignment is preserved.
- **Drum lanes within a track** advance independently — each lane has its own `clip_t` inside `drum_lane_t.clip` with its own `ticks_per_step` and `length`. Per-tick advance uses `dlc->ticks_per_step` (`:6517/6657`) — verified per-lane, not shared. **Polyrhythmic by construction** (32 lanes × 8 tracks = 256 independent playheads, each with its own tps/length/loop_start).

### 5.4 Loop window wrap

- Per-track wrap check at step-advance (line 6679–6692 melodic, 6660–6669 drum-lane): `if (ns2 >= loop_start + length || ns2 < loop_start) ns2 = loop_start`. **Sample-clean within the DSP-tick boundary.**
- Wrap-trigger side effects (line 6683–6691): clear `suppress_until_wrap` on all notes; reset `live_recorded_steps[32]`; SEQ ARP `pending_retrigger=1` (if retrigger style). Drum side (line 6663–6668): clear `suppress_until_wrap` only.
- **No sub-tick wrap interpolation** — the wrap happens at the DSP-tick boundary. A note recorded with sub-tick `note_tick_offset` near step length-1 + offset doesn't move; if `loop_start + length` cuts mid-step, the wrap snap happens at the integer step boundary, not the sub-tick position. Acceptable: clip lengths are integer steps; the only place sub-tick precision matters is *within* a step, not at wrap.

### 5.5 WINDOW SNAP safety net

Lines 6395–6426: at the top of each per-track per-tick block, melodic checks `current_step` in `[loop_start, loop_start+length)`; drum checks each lane's `drum_current_step[l]`. Out-of-window → snap to `loop_start` + `seq8_ilog` breadcrumb. Catches any OOB writes that slipped past per-handler clamps. **Defensive; should never fire in practice.**

## Layer 6: Storage + Playback findings

### 6.1 Clean

- Chord cohesion: melodic record_note_on tick-snapshot-once preserves chord alignment.
- Per-track independence: each track / drum lane has its own playhead state.
- Loop window wrap: integer step-boundary clean, with `suppress_until_wrap` reset + SEQ ARP retrigger handled.
- WINDOW SNAP safety net catches OOB writes.

### 6.2 Known limits (silent drops)

| Limit | Site | Drop mode |
|---|---|---|
| `MAX_NOTES_PER_CLIP = 512` (`seq8.c:285`) | `clip_insert_note` (`seq8.c:4464`) | clip_insert_note returns -1; step mirror not updated; subsequent step view "missing" the note. 512 is generous — a fully-packed 256-step clip with 2 notes/step is at-cap; typical 16/32-step clips with <8-note polyphony are well below |
| `step_note_count[sidx] < 8` | `record_note_on` (`set_param.c:3292`) | 9th note in same step lands in notes[] but not in step view |
| `rec_pending[10]` | `record_note_on` (`set_param.c:3265`) | 11th simultaneous held note → gate stays default on note-off |
| `play_pending[32]` per track | playback note-on (`seq8.c:6535/6565`) | pfx_note_on fires; no gate countdown; note hangs |
| `drum_rec_pending[lane]` single slot | `drum_record_note_on` | Re-hit overwrites pending; prior note's gate never closes |
| One-hit-per-step drum | `drum_record_note_on` (`set_param.c:4016`) | Subsequent hit on occupied step silently dropped |

None of these are caused by JS routing; they exist regardless of Phase 1.

### 6.3 Sub-block timing

- `current_clip_tick` is recomputed only at the per-DSP-tick advance loop (`seq8.c:6695`). Multiple `on_midi` calls within one render_block all see the *same* tick when calling `clip_insert_note`. **Phase 1 does NOT improve recording-time precision within a block.**
- All emit-side events queue with sample-position fire_at, but `pfx_q_fire` runs once per block at block-end — erasing sub-block stagger. Matches the architecture rethink's "deferred sub-block jitter" finding.

### 6.4 Phase 1 implications

- **No refactor work in Layer 4 or 5.** Storage + playback are already audio-thread native, sample-precise on call, and Phase 1 maintains identical semantics.
- **Recording state machines** (`rec_pending`, `drum_rec_pending`, `suppress_until_wrap`, `drum_last_rec_step`) are timing-correct under fast input *given* JS batching today; with `on_midi` firing per-event, they remain correct because each event still snapshots `current_clip_tick` once. Per-event vs per-payload doesn't change tick precision in the block.
- The block-end `pfx_q_fire` model is the floor: Phase 1's chord-stagger improvement comes entirely from removing the JS slow-brain stack *before* events reach `live_note_on`. After that they're already audio-thread native.

### 6.5 Out of Audit-2 scope but flagged

- **Sub-block jitter fix** — explicitly deferred per the rethink memory. Revisit only if Phase 1 doesn't resolve perceptible issues.
- **`play_pending[32]` hung-note overflow** — silent failure; flag for Audit-3 (output routes) or a separate cleanup pass.
- **`LRS_SET` definition** for context: `live_recorded_steps[s>>3] |= 1u << (s & 7)` (`seq8.c:559`) — per-track 32-byte bitmap (8 bits × 32 bytes = 256 step flags = SEQ_STEPS) marking steps that received a live-recorded note since last loop wrap. Reset at wrap (`seq8.c:6687`).

## Audit-2 punch list

| Item | Class | Phase-1 effort | Notes |
|---|---|---|---|
| 4.1 Melodic recording chord cohesion | clean | none | Per-payload tick snapshot already correct |
| 4.2 Drum recording one-hit-per-step | intentional | none | Design choice, not a bug |
| 4.3 Hidden write paths (TARP/SEQ ARP/Merge/Bake) | clean | none | All audio-thread native |
| 5.1 Tick model | clean | none | Block-quantized but deterministic |
| 5.2 Note-fire timing | clean | none | Sample-position queue + block-end flush |
| 5.3 Multi-track parallelism | clean | none | Lock-step master tick, independent per-track state |
| 5.4 Loop window wrap | clean | none | Integer step-boundary clean |
| 5.5 WINDOW SNAP | clean | none | Defensive safety net |
| 6.2 Silent-drop caps | known limits | none for Phase 1 | Independent cleanup task; not a Phase 1 blocker |
| 6.3 Sub-block timing | deferred | n/a | Per architecture rethink decision |

**Net**: Audit-2 surfaces **no Phase 1 work**. Storage + playback are already where the rethink memory wants them. The slow-brain warts are entirely in the *inbound* path (Audit-1); once that lands, the chord-stagger improvement happens because events traverse fewer layers, not because storage or playback changes.

---

# Audit-3: Output routes + side channels

Scope: how DSP-emitted MIDI reaches each output destination; how side channels (perf mods, CC automation, looper, merge, bake, SEQ ARP) schedule into and out of the pfx chain. Code reading + cross-repo (`~/schwung/src/`) reads for host-side definitions of `midi_inject_to_move` / `midi_send_internal` / `midi_send_external`.

Source plan: memory `project_davebox_architecture_rethink.md` Audit-3 scope; carries forward findings from Audit-1 (`on_midi` empty stub) and Audit-2 (storage + playback clean).

---

## Layer 7: ROUTE_MOVE downstream (pfx_emit → midi_inject_to_move)

**Findings (code-verified 2026-05-14):**

1. **`pfx_emit` ROUTE_MOVE branch** (`dsp/seq8.c:1851–1855`): builds a 4-byte USB-MIDI packet `[CIN | (status>>4), status, d1, d2]` and calls `g_host->midi_inject_to_move(pkt, 4)` synchronously. `drum_pfx_emit` (`:2880–2884`) is identical. Same audio block — no buffering on dAVEBOx side.
2. **Schwung-side host hook (overtake)**: `overtake_host_api.midi_inject_to_move = shadow_chain_midi_inject` (`schwung/src/schwung_shim.c:1347`). The function (`schwung/src/host/shadow_midi.c:674–699`) is a **lock-free SHM ring producer**: `memcpy` 4 bytes into `host_shadow_midi_inject_shm->buffer`, advance `write_idx`, `__sync_synchronize`, `ready++`. Drained "same-thread as drain (both run in the shim's SPI loop)". **No syscall. Audio-thread safe by construction.**
3. **Caveat — render_block context required for note-offs to release Move voices** (per memory `pending-set-param-cant-release-move` and root `CLAUDE.md`). Symptom: a `pfx_send` ROUTE_MOVE note-off issued from a `set_param` handler reaches Move but does NOT release the synth voice envelope. Confirmed in code: `looper_stop` (`dsp/seq8.c:2304–2308`) explicitly defers `looper_silence_active` via `inst->looper_pending_silence = 1`, drained at the top of next `looper_tick` (`:2080–2083`). All other ROUTE_MOVE emit sites already run from render_block (per-tick scans, pfx queue drains, drum repeat ticks) so they're safe by construction.
4. **send_panic ROUTE_MOVE branch** (`dsp/seq8.c:2348–2353`): instead of blasting 8 × 16 × 128 note-offs, sends one CC 123 (All Notes Off) sweep per channel. Move's voice manager handles the sweep cleanly. Reference for any future "Move can't take 2048 messages in one block" fixes.

**Latency floor for ROUTE_MOVE:** sample-precise on call → block-quantized at `pfx_q_fire` → injected into Move's MIDI region → Move firmware dispatches at its own scheduler tempo. Move-side downstream timing is **closed-source — `unknown — device probe`**, but symptomatic evidence (chord stagger investigations 2026-05-13) suggests Move's input handling is stable at audio-block granularity.

**Phase 2 implication:** **None.** ROUTE_MOVE is already audio-thread native. The deferred-silence pattern (`looper_pending_silence`) is the canonical fix for the "set_param context can't release voices" gotcha; if any future feature needs to ROUTE_MOVE-emit from a non-render_block site, copy that pattern.

**Classification:** `clean`.
**Effort:** none.

---

## Layer 8: ROUTE_SCHWUNG downstream (pfx_emit → midi_send_internal)

**dAVEBOx runtime context:** `module.json` declares `tool_config.overtake: true`, so the shim loads dAVEBOx via `shadow_overtake_dsp_load` (`schwung/src/schwung_shim.c:1309`) and the host_api dAVEBOx receives is `overtake_host_api` (set up at `schwung_shim.c:1336–1347`). **All §8/§9/§7 conclusions below describe the overtake path, not the standalone host or the chain-source path.** See footnote at end of §9 for the standalone-host code that does NOT govern dAVEBOx in production.

**Findings (code-verified 2026-05-14):**

1. **`pfx_emit` ROUTE_SCHWUNG branch** (`dsp/seq8.c:1861–1862`): builds 4-byte packet `[status>>4, status, d1, d2]` and calls `g_host->midi_send_internal(msg, 4)` synchronously. (Note the CIN nibble differs from ROUTE_MOVE: here it's the raw `status>>4`, e.g. `9` for note-on; ROUTE_MOVE prepends `0x20 |` to mark cable 2.) `drum_pfx_emit` (`:2891`) is identical. Same audio block.
2. **Schwung-side host hook (overtake)** — `overtake_midi_send_internal` (`schwung/src/schwung_shim.c:1264–1273`): rebuilds the USB-MIDI packet with the correct CIN and calls `shadow_chain_dispatch_midi_to_slots(pkt, ...)` — an **in-process dispatch** that delivers the packet to every chain slot's plugin via `on_midi`. **No syscall. No SPI ioctl. No shared buffer with external.**
3. **Stability evidence**: `midi_send_internal` is called every block from dAVEBOx during normal playback (every sequenced note + every CC automation update + every TARP/SEQ ARP fire). It's been stable since v0.1 because the call is *purely* a function-call dispatch through the shim — the same shape as a direct `on_midi(...)` invocation, just with packet-shape repackaging. There is no audio-thread blocking risk.

**Phase 2 implication for ROUTE_SCHWUNG itself:** **None.** Already audio-thread native and structurally safe (no syscalls in the call chain).

**Critical implication for ROUTE_EXTERNAL** (carries into §9 below): the symmetry I assumed in an earlier draft was wrong. Internal and external are **NOT** the same code path under overtake — internal is in-process dispatch, external is a direct SPI `real_ioctl` from the caller's thread (see §9). The CLAUDE.md "never call from render/tick path (deadlock)" claim is supported by source after all.

**Classification:** `clean`.
**Effort:** none.

---

## Layer 9: ROUTE_EXTERNAL ext_queue + deadlock analysis (Wart 2)

**Findings (code-verified 2026-05-14):**

### 9.1 DSP-side queue

1. **ext_queue ring buffer**: 64 slots of `ext_msg_t = {status, d1, d2}` (`dsp/seq8.c:623–624`, `EXT_QUEUE_SIZE`).
2. **Producer**: `ext_queue_push` (`:1623–1628`) called from `pfx_emit` (`:1857–1859`) and `drum_pfx_emit` (`:2886–2889`) when `fx->route == ROUTE_EXTERNAL`. **Drops newest on full** — silent.
3. **Consumer**: get_param `"ext_queue"` handler (`:5725–5742`) drains the entire ring into a `"S D1 D2;S D1 D2;..."` string, advances tail. Read = drain.
4. **Send_panic workaround** (`:2339–2347`): for ROUTE_EXTERNAL, panic uses CC 120 (All Sound Off) + CC 123 (All Notes Off) per channel — 32 total messages — instead of 128 note-offs/channel that would obviously overflow the 64-slot queue. **This workaround is direct evidence that the queue is sized too small for general traffic** and DSP code already special-cases around it.

### 9.2 JS-side drain

1. **Drain site** (`ui/ui.js:3784–3796`): inside the `tick()` loop, every tick (~94 Hz). `host_module_get_param('ext_queue')` returns the drain string; JS splits by `;` and ` `, fires `move_midi_external_send([cin, s, d1, d2])` per packet.
2. **Schwung-side JS binding**: `move_midi_external_send` (Schwung `shadow_ui.c:1252` → `js_move_midi_send(2, ...)`) calls `queueMidiSend(2, buf, 4)` — the **same function** the DSP-side `midi_send_internal` ultimately calls. From the shim's perspective, JS-driven external send and DSP-driven internal send hit the identical SPI buffer.

### 9.3 Latency

- DSP emits at sample-precise fire_at → enqueued same block → drained next JS tick (up to **10.6 ms** wait, ~5 ms average) → JS calls `move_midi_external_send` → Schwung `queueMidiSend` writes to outgoing_midi buffer → ioctl flush at next 80-byte threshold.
- Total ROUTE_EXTERNAL latency = audio block latency + 5–10 ms tick wait + ~one block worth of buffering delay before SPI flush. **At worst ~25 ms additional latency vs ROUTE_SCHWUNG.**
- Ordering: FIFO; one tick's drain is enqueue-order, so chord cohesion within a single tick window is preserved as long as queue doesn't overflow.

### 9.4 Deadlock claim — supported by source (overtake path)

**The "midi_send_external deadlocks from render thread" claim in `dsp/CLAUDE.md` is supported by the overtake host_api wiring.** Path analysis (overtake context — what dAVEBOx actually runs):

| Route | Audio-thread call → | What that function does |
|---|---|---|
| ROUTE_SCHWUNG | `overtake_midi_send_internal` (`schwung_shim.c:1264–1273`) | In-process `shadow_chain_dispatch_midi_to_slots` — pure function dispatch to chain slots' `on_midi`. **No syscall.** |
| ROUTE_MOVE | `shadow_chain_midi_inject` (`schwung/src/host/shadow_midi.c:674–699`) | Lock-free write to a 4-byte SHM ring (`memcpy` + `__sync_synchronize` + `ready++`). **No syscall.** Drained "same-thread as drain (both run in the shim's SPI loop)". |
| ROUTE_EXTERNAL | `overtake_midi_send_external` (`schwung_shim.c:1280–1307`) | Writes 4 bytes into `hardware_mmap_addr` (offset 0) and calls **`real_ioctl(shadow_spi_fd, _IOC(_IOC_NONE, 0, 0xa, 0), 0x300)` directly from the caller thread.** This is a syscall into the SPI driver that blocks until flush completes. |

**The asymmetry is structural**, not a stale claim. Internal and Move both stay in user-space; external descends to a kernel ioctl on the audio thread. Whether the resulting issue is a literal lock-graph deadlock (SPI driver vs audio path) or "merely" audio-thread starvation (ioctl latency variance starves the next render block), the practical answer is the same: **don't call `midi_send_external` from the audio thread.** The ext_queue + JS-drain workaround exists for a real reason, and the JS drain runs in the shadow_ui process — not the audio thread — when it eventually calls `move_midi_external_send` (which under JS routes through `js_move_midi_send` → `queueMidiSend(2, ...)`, a different code path again that has its own thread story; not relevant to the deadlock question because it's off the audio thread).

**Note (process-vs-thread):** the JS-side `move_midi_external_send` ultimately writes to the *same* shared `outgoing_midi` SPI buffer as the would-be direct call, but it does so from the shadow_ui process loop (lower priority, audio-thread-decoupled). The decoupling is what makes it safe — not the buffer or the ioctl path, both of which are identical. Phase 2 must preserve "kernel ioctl off audio thread" or replicate decoupling differently.

### 9.5 Phase 2 routing

**Phase 2a (direct emit, ext_queue deleted) — OFF THE TABLE.** The earlier draft suggested probing whether direct emit is safe. The probe would tell us nothing new — the asymmetry is in source: `overtake_midi_send_external` calls `real_ioctl(SPI)` synchronously. No probe needed; do not delete ext_queue.

**Phase 2b (shim-side worker thread under existing API)**:
- Schwung-side patch on `legsmechanical/schwung`: replace `overtake_midi_send_external`'s body. Instead of writing to `hardware_mmap_addr` + `real_ioctl` synchronously, push 4 bytes into a shim-side ring (lock-free, like `shadow_chain_midi_inject` does for ROUTE_MOVE). Spawn a low-priority worker thread that drains the ring and performs the ioctl off the audio thread.
- Drain rate target: ≥ 1 ms (vs JS today's ~10 ms tick). Cuts ROUTE_EXTERNAL latency from ~25 ms worst-case to ≤ ~5 ms.
- dAVEBOx side: change `pfx_emit` ROUTE_EXTERNAL to call `g_host->midi_send_external(pkt, 4)` directly. Delete dAVEBOx's `ext_queue` + JS drain + get_param handler. The shim-side ring replaces them.
- **Risk**: silent change to other overtake modules — anyone else calling `midi_send_external` from any context now goes through the worker thread. Likely beneficial for them too, but worth a Schwung-side compat check. Audit overtake module list before merging.
- **Effort: M (~3–5 days)**, mostly Schwung-side. Capability-gate per [[capability-gated-schwung-features]] — fall back to current ext_queue path if shim doesn't have the worker thread.

**Phase 2c (new async API entry point)** — alternative to 2b:
- Add `host_api_v2_t.midi_send_external_async` as a new function pointer (bumps API version). Old `midi_send_external` keeps its sync `real_ioctl` semantics for callers that want them.
- dAVEBOx calls `midi_send_external_async`. ext_queue + JS drain delete the same way as 2b.
- Cleaner contract (explicit caller opt-in) but bumps `MOVE_PLUGIN_API_VERSION`, which cascades through every module's `init` version check. Heavier coordination cost.
- **Effort: M (~4–6 days)**, similar shape to 2b plus API-version cascade.

**Recommendation**: **Phase 2b** — silent shim-side fix is the lowest coordination cost and matches the `shadow_chain_midi_inject` precedent (ROUTE_MOVE already uses a shim-side ring, lock-free, drained by the SPI loop). A second route doing the same is a small additive change. 2c is the right answer if the silent behavior change to other overtake modules turns up a regression during the compat check.

**Classification:** `dirty — fix in shim`.
**Effort:** **M (~3–5 days)** for Phase 2b.

---

## Layer 10: Side channels

### 10.1 Performance Mode mods (perf_apply / perf_mods_active)

- **JS write site**: `sendPerfMods` (`ui/ui.js:2340–2343`) — three lines: `host_module_set_param('perf_mods', String(mask))`. Fires from `_onStepButtons` / `_onPadPress` / `_onPadRelease` / `_onCC_buttons` / `_switchViewCleanup` (per graphify). No batching needed — single 32-bit bitmask.
- **DSP read site**: `inst->perf_mods_active` consumed inside `looper_tick` (`dsp/seq8.c:2149–2210` cycle-start hook + `:2234–2275` per-event emit hook via `perf_apply` at `:1914`). The mods only apply during `LOOPER_STATE_LOOPING`.
- **Latency model**: mod-press → set_param → coalesced into next render_block (≤ 1 block ≈ 10.6 ms) → applied to next looper-emit boundary. Sub-block precision is irrelevant because the value is a steady-state bitmask, not a per-event payload.
- **Coalescing risk**: zero — perf_mods is one key, last-write-wins on the bitmask is correct semantics (the JS bitmask is the source of truth).

**Classification:** `clean`. Mods are a Looper-only feature; the Looper is DSP-native (Audit-1 §2.7); mod application sits inside the same per-tick loop and inherits its timing model.
**Phase implication:** none.

### 10.2 CC automation (record + playback)

- **Playback site** (`dsp/seq8.c:6587–6631`): per-DSP-tick per-track scan inside the master tick loop. For each of 8 knobs, walks `clip_cc_auto[clip].ticks[k]` finding the bracketing pair around `current_clip_tick`, lerps to target value, fires `pfx_send(CC|channel, cc_assign[k], val)` only when the value changes vs `cc_auto_last_sent[k]`. Sample-precise on the DSP-tick boundary (same model as note-fire, see Audit-2 §5.2).
- **Touch-suppression** (`:6597–6601`): if `cc_touch_held` bit set OR `cc_auto_touch_frame[k]` is recent (within `CC_TOUCH_GRACE_BLOCKS` of `block_count`), skip emission. Lets a recording knob turn override the recorded automation without the recorded value fighting back.
- **Touch-record** (`:6633–6644`): when `cc_touch_held` set + `recording`, every 1/32 boundary (`_ct / 12 * 12`) writes a new automation point via `cc_auto_set_point`.
- **JS role**: `_onCC_knobs` fires `tN_cc_touch` + `tN_cc_live_val` set_params on knob touch and turn. That's it. Not in the audio playback path.
- **Coalescing**: `tN_cc_touch` is per-track per-knob bitmask, last-write-wins is correct. `tN_cc_live_val` is per-knob value, last-write-wins is correct.

**Classification:** `clean`. Fully DSP-native; JS is purely a parameter pipe.
**Phase implication:** none.

### 10.3 Looper capture / loop boundaries

Already audited inbound-side at Audit-1 §2.7. Output-side recap:

- **Capture into ring**: `pfx_send` Looper hook (`dsp/seq8.c:1719`-ish, just before merge hook) writes events with `(tick=looper_pos, status, d1, d2, track)` into `looper_events[1024]`. Capture position is the per-DSP-tick `looper_pos` — block-quantized.
- **Playback**: `looper_tick` LOOPING branch (`:2146–2298`) drains all events whose `tick == looper_pos` per DSP tick, applies `perf_apply`, fires via `pfx_send` with `looper_emitting=1` to bypass the gate (so the looper's own emits don't recurse into the capture hook).
- **Boundary at `looper_pos == cap`** (`:2278–2298`): if `looper_pending_rate_ticks` is set, transition to `CAPTURING` at new rate; else cycle++. Rate change at boundary is sample-aligned.
- **Stop deferred** via `looper_pending_silence` (`:2304–2308`) drained at next `looper_tick` (`:2080–2083`) — Move ROUTE caveat (see §7).
- **Re-entry guard**: `looper_emitting` flag bypasses both the capture hook and the LOOPING-suppression hook. Reset around every emit. Verified at `looper_silence_active` (`:1881–1906`) and the cycle-start silence sweep (`:2133–2141`).

**Classification:** `clean`. Capacity caps (1024 events/loop, 32 staccato pendings) — known limits, audited.
**Phase implication:** none.

### 10.4 Live Merge state machine (capture + finalize)

- **Capture hook** in `pfx_send` (`dsp/seq8.c:1774–1825`): when `merge_state == CAPTURING` and event is on `merge_track`, capture note-on into `merge_pending[32]` `{pitch, tick_at_on=rel, vel}`; on note-off, find matching pitch in merge_pending, compute gate, write `clip_insert_note(dst_clip, tick_at_on, gate, pitch, vel)`. **Post-pfx capture** (matches Looper) — the merge sees what would have gone out, including TARP/HARMZ/MIDI DLY effects.
- **State transitions** (`dsp/seq8.c:6362–6370` inside per-DSP-tick block):
  - `ARMED → CAPTURING` at `master_tick_in_step == 0` (next step boundary).
  - `STOPPING → finalize` at `master_tick_in_step == 0 && global_tick % 16 == 0` (next 16-step page boundary). Auto-aligns the captured clip to a power-of-2 page length.
- **Auto-finalize on overflow** (`:1784–1785`): if `rel >= 256 * merge_tps` (max clip length), `merge_finalize` fires from inside `pfx_send`. Safe because merge_finalize only mutates merge state + dst clip, not the active emit pipeline.
- **Known limit**: `merge_pending[32]` cap. 33rd simultaneously held note silently dropped during capture. Same shape as `rec_pending[10]` (Audit-2 §6.2).
- **Drum-track special case** (`:1800–1810`): on note-off match, walks `drum_clips[dst].lanes[]` to find the lane whose `midi_note` matches the captured pitch; writes into that lane's `clip_t`. Pitch → lane mapping is per-clip.

**Classification:** `clean`. Same DSP-native shape as Looper capture.
**Phase implication:** none. Known limit (merge_pending[32]) carried in §11 punch list as an independent cleanup task.

### 10.5 Bake (offline pfx-chain re-run)

- `bake_clip` (`dsp/seq8.c:5154`) reconstructs clip output by replaying the source clip notes through the pfx chain offline (no audio-thread dependency), writing results into the destination clip via `clip_insert_note` + `clip_build_steps_from_notes`.
- Per-loop init: `pfx_init_defaults` + `pfx_apply_params` per loop iteration to reset per-loop accumulators (per memory `bake_pfx_state_per_loop`). Walk accumulator (`note_random_walk`) reset per loop is correct.
- Stage helpers: `bake_stage_arp_out` (`:5055`) seeds the arp held buffer; `bake_stage_midi_dly` (`:4985`) replays MIDI DLY echoes; `pfx_build_gen_notes` (`:2559`) replays NOTE FX/HARMZ. `bake_apply_quantize` runs the quantize stage as a final pass.
- **Real-time match**: bake-emitted notes are bit-identical to live playback for the same input clip + pfx state, **modulo the inputs that bake can't see** (live TARP/SEQ ARP held buffers, live CC automation touch values). For pure clip → pfx-chain replay, `bake_clip` IS the playback engine running offline.
- **Audio thread**: bake never touches the audio thread. Runs entirely from set_param context.

**Classification:** `clean`.
**Phase implication:** none.

### 10.6 SEQ ARP scheduling

- `arp_tick` (`dsp/seq8.c:3505`) called per-DSP-tick per-track from render_block (`:6583`). Drains `pending_retrigger` first; counts down `gate_remaining` (sample-correct off-emit when reaching 0); waits for first-note quantization (sync mode); else counts down `ticks_until_next` and fires `arp_fire_step`.
- `arp_fire_step` (`:3417`) computes editor-column from `arp_master_tick`, applies step pattern (Off/Mute/Step), computes pitch+vel via `arp_compute_step` from held buffer, emits raw with `arp_emitting=1` to bypass the gate. Sets `gate_remaining = rate * gate_pct / 100`.
- **Cycle-wrap retrigger**: in render_block step-advance (`:6688–6690`), at clip wrap if `arp.style && arp.retrigger`, sets `pfx.arp.pending_retrigger = 1`. Drained at top of next `arp_tick`.
- **Held buffer as input**: SEQ ARP consumes notes added via `arp_add_note` from `pfx_send` (the SEQ ARP gate at `:1705–1716` intercepts upstream emits). Its inputs are sample-correct because the gate runs in the same call as the upstream pfx_send.
- **Output timing**: rate-quantized within a master-tick-divisible grid (`ARP_RATE_TICKS` in DSP-tick units). Per-tick precise.

**Classification:** `clean`. Fully DSP-native; rate quantization is the design, not a wart.
**Phase implication:** none.

### 10.7 TARP input chord aggregation (cross-ref)

Already audited in Audit-1 §2.9 — DSP-native. No output-side wart.

### 10.8 Count-in preroll buffer (cross-ref)

Already audited in Audit-1 §2.8 — JS-owned, slated for Bundle 3 of Phase 1. No output-side wart.

---

## Layer 11: Cross-cutting

### 11.1 pfx_q_fire re-entry guard

`pfx_q_fire` (`dsp/seq8.c:2426–2443`) sets `g_inst->in_queue_drain = 1` around the drain loop. The schedule-time swing block in `pfx_send` (`:1834–1843`) checks `!g_inst->in_queue_drain` before re-queueing — this prevents queued events from re-entering swing on fire (which would scramble on/off pair order, hanging notes per memory `swing_architecture`). **Verified, clean.**

### 11.2 send_panic per-route specialization

`send_panic` (`dsp/seq8.c:2325–2354`) demonstrates explicit per-route awareness:
- ROUTE_SCHWUNG: 16 ch × 128 note-offs (2048 messages — direct in-process dispatch, fine).
- ROUTE_EXTERNAL: CC 120 + CC 123 per channel (32 messages — works around 64-slot ext_queue limit).
- ROUTE_MOVE: CC 123 per channel only (16 messages — `silence_active_notes_move` already swept tracked notes; CC 123 covers off-book sustains).

Under Phase 2b, dAVEBOx's `ext_queue` deletes but the shim-side ring inherits a similar capacity question. Conservative path: keep the CC 120/123 specialization — small messages cheap regardless of queue depth, and if the shim ring is sized comparably (~64 slots) the existing logic continues to apply. Trivial.

### 11.3 Block-end fire model — output-side carrier of sub-block jitter

Confirmed in §5.2 (Audit-2): all events with `fire_at ≤ block_end` fire at block end via `pfx_q_fire`. This applies to ALL routes — ROUTE_MOVE, ROUTE_SCHWUNG, ROUTE_EXTERNAL alike. Sub-block stagger is erased on emit regardless of destination. **Phase 2 does not change this.** Per architecture rethink memory, sub-block jitter remediation is deferred to a separate Phase 3 candidate, only revisited if Phase 1+2 don't resolve perceptible issues.

---

## Audit-3 punch list

### Per-item classification summary

| Item | Class | Phase-2 effort | Notes |
|---|---|---|---|
| 7. ROUTE_MOVE | clean | none | `shadow_chain_midi_inject` is lock-free SHM ring write; deferred-silence pattern handles set_param context gotcha |
| 8. ROUTE_SCHWUNG | clean | none | `overtake_midi_send_internal` is in-process `shadow_chain_dispatch_midi_to_slots` — no syscall |
| 9. ROUTE_EXTERNAL ext_queue | dirty — fix in shim | **M (~3–5 days)** | 2b shim-side worker thread + ring (mirrors ROUTE_MOVE pattern); 2a deletion ruled out — `overtake_midi_send_external` does sync `real_ioctl(SPI)` |
| 10.1 Perf mods | clean | none | Bitmask coalesces correctly; Looper-only |
| 10.2 CC automation | clean | none | Fully DSP-native; touch-suppression handled |
| 10.3 Looper capture | clean | none | Already audited; deferred-silence pattern verified |
| 10.4 Live Merge | clean | none | merge_pending[32] cap is a known limit, not a Phase 2 item |
| 10.5 Bake | clean | none | Offline replay matches playback by construction |
| 10.6 SEQ ARP | clean | none | DSP-native, rate-quantized by design |
| 10.7 TARP | (Audit-1 §2.9) | — | Inbound-only wart; output is DSP-native |
| 10.8 Count-in preroll | (Audit-1 §2.8) | — | Inbound-only wart; Phase 1 Bundle 3 |
| 11.1 pfx_q_fire re-entry guard | clean | none | Verified |
| 11.2 send_panic per-route | clean | trivial | Will simplify after 2a if probe passes |
| 11.3 Block-end fire model | deferred | — | Per architecture rethink decision |

### Major findings that change the Phase-2 plan

1. **The "midi_send_external deadlocks from render thread" claim IS supported by source** under the overtake host_api. `overtake_midi_send_external` (`schwung/src/schwung_shim.c:1280–1307`) calls `real_ioctl(shadow_spi_fd, ...)` synchronously from the caller thread. By contrast, `overtake_midi_send_internal` is pure in-process dispatch and `shadow_chain_midi_inject` is a lock-free SHM ring. **The asymmetry is structural, not stale.** ext_queue + JS-drain workaround is justified.
2. **Phase 2a (delete ext_queue, direct emit) is OFF the table** — would put a kernel ioctl on the audio thread per emit. Phase 2 must preserve "kernel ioctl off audio thread."
3. **Recommended path: Phase 2b (~3–5 days, Schwung-side)** — replace `overtake_midi_send_external` body with a shim-side ring + low-priority worker thread that performs the ioctl. Mirrors the existing `shadow_chain_midi_inject` pattern (ROUTE_MOVE already uses a shim-side ring). dAVEBOx-side: delete its own ext_queue + JS drain, call `g_host->midi_send_external` directly. Cuts ROUTE_EXTERNAL latency from ~25 ms worst-case to ≤ ~5 ms.
4. **All other side channels are already DSP-native.** Perf mods, CC automation, Looper, Live Merge, Bake, SEQ ARP, TARP — none require Phase 2 work. The rethink memory's framing of side channels as audit-targets surfaced no warts.
5. **Sub-block jitter remains the only deferred item** — same answer as Audit-2. Defer; revisit only if Phase 1+2 don't resolve perceptible issues.

### Recommended Phase 2 order

1. **Schwung-side compat audit (XS)**: list every other module that currently uses `midi_send_external` under overtake. Confirm the silent change (sync ioctl → enqueue + worker drain) is benign for them. If any caller relies on synchronous semantics — bail to Phase 2c (new async API entry) instead.
2. **Phase 2b implementation (M, 3–5 days)**:
   - Schwung patch on `legsmechanical/schwung`: rewrite `overtake_midi_send_external` body. Lock-free 4-byte ring, mirror `shadow_chain_midi_inject` shape (`memcpy` + `__sync_synchronize` + `ready++`). Add a low-priority worker thread (or piggyback on an existing shim loop) that drains the ring at ≥ 1 ms cadence and performs the SPI `real_ioctl`.
   - Capability-gate per [[capability-gated-schwung-features]] — runtime check (e.g. a new sentinel function or version field) before deleting dAVEBOx's fallback. Stock Schwung (no patch) keeps using ext_queue + JS drain.
   - Update `legsmechanical/schwung` patch and rebuild + deploy `schwung-shim.so` per [[schwung-shim-deploy-path]].
3. **Phase 2b dAVEBOx-side cleanup (XS, contingent on capability gate)**:
   - Edit `pfx_emit` ROUTE_EXTERNAL to call `g_host->midi_send_external(pkt, 4)` directly. Same for `drum_pfx_emit`.
   - Delete `ext_queue`, `ext_queue_push`, `ext_msg_t`, `EXT_QUEUE_SIZE` storage.
   - Delete `get_param("ext_queue")` handler.
   - Delete `ui.js:3783–3797` JS drain block.
   - Update `dsp/CLAUDE.md` MIDI routing section: keep the "from audio thread" guidance, but now safe under patched-shim runtime.
   - Keep `send_panic` ROUTE_EXTERNAL CC 120/123 specialization (shim ring will likely be ~64 slots — same constraint).
4. **Device verification**: A/B compare ROUTE_EXTERNAL latency before/after by recording the same MIDI source twice into a DAW (one capture pre-patch, one post-patch). Target: ≤ 5 ms added latency vs ROUTE_SCHWUNG.

### Out of Audit-3 scope but flagged

- **Move firmware MIDI scheduler timing** (`unknown — device probe`) — closed-source; not blocking; Phase 2 doesn't touch ROUTE_MOVE.
- **`merge_pending[32]` overflow** — same shape as Audit-2 §6.2 known limits; an independent cleanup task, not gated by Phase 2.
- **`looper_events[1024]` capacity** — known limit; if a long capture window with dense input fills it, additional events drop silently. Not in Phase 2 scope.
- **CC 79 + Note 8 unconditional passthrough in shim** (`feedback_schwung_shim_cc79_passthrough`) — Schwung-side specialization; not relevant to Phase 2 routing decisions but a reminder that the shim has specialized passes that may need parallel treatment if Phase 2b adds a worker thread.

### Total Phase 2 effort estimate

**M — ~3–5 days** for Phase 2b (Schwung-side worker thread + ring, dAVEBOx-side cleanup). Adds to the patch surface on `legsmechanical/schwung` (rebase risk per [[schwung-pending-pr]]); capability-gated so dAVEBOx still ships from `main` for users on stock Schwung.

If 2b's silent semantic change to other overtake modules turns up a regression during compat audit, fall back to Phase 2c (new `midi_send_external_async` API entry) — adds ~1 day for the API-version cascade. Either way the dAVEBOx-side delta is the same XS cleanup.

---

## Footnote — code paths NOT relevant to dAVEBOx production runtime

For future-self: a chunk of this audit's first draft was wrong because I read code paths that don't govern dAVEBOx's runtime. Recording them here so the same mistake doesn't recur:

- **`schwung/src/schwung_host.c`** — the standalone Schwung host (`queueMidiSend`, `queueExternalMidiSend`, `queueInternalMidiSend`, `mm_midi_send_*_wrapper`). Used by the standalone Schwung binary during development. **Not the production runtime on Move.** dAVEBOx as `tool_config.overtake: true` loads via the shim's overtake path, not the standalone host.
- **`schwung/src/modules/chain/dsp/chain_host.c`** — chain MODULE source plugin host (`midi_source_send`, `g_source_host_api`). Wires both `midi_send_internal` and `midi_send_external` to `midi_source_send` (in-process loop back to chain), not to USB. **Not used by overtake tools.** Relevant if dAVEBOx ever switches to `component_type: "midi_source"` inside a chain.
- **`module_manager.c:213–214`** — generic module-manager wrapper assignment. Used by the standalone host (`mm_init` is called from `schwung_host.c:2697`). **Not the overtake path.**

The production runtime for dAVEBOx is `schwung/src/schwung_shim.c` `overtake_host_api` (lines 1336–1347), wiring:
- `midi_send_internal` → `overtake_midi_send_internal` (in-process).
- `midi_send_external` → `overtake_midi_send_external` (sync `real_ioctl` SPI — the wart).
- `midi_inject_to_move` → `shadow_chain_midi_inject` (lock-free SHM ring).

When in doubt about the production code path, check `module.json` first (`tool_config.overtake`?) and trace from the shim, not from `schwung_host.c`.

---

## Audit-3 follow-up: Audit-1 §3.2 reverify (the bigger correction)

**Done 2026-05-14.** Reverify of Audit-1 §3.2's "CC/AT/PB silently dropped because `on_midi` empty" framing. The conclusion was based on tracing only the chain-slot dispatch path; under overtake (dAVEBOx's actual runtime), the shim has a second delivery path — `overtake_dsp_gen->on_midi` — wired in only TWO places.

### Method

Cross-repo grep of `~/schwung/src/` for every `overtake_dsp_gen->on_midi(` and `overtake_dsp_fx->on_midi(` invocation site, plus reading `shadow_inprocess_process_midi` (`schwung_shim.c:1094–1255`), `shadow_filter_move_input` MIDI handlers (~`6635–6750`), and `shadow_drain_ui_midi_dsp` (`host/shadow_midi.c:702–743`).

### What reaches `overtake_dsp_gen->on_midi` today

Only two delivery sites exist in the entire shim:

1. **MIDI_OUT cable-0 realtime clock** (`schwung_shim.c:1157–1160`): 1-byte system messages (Start/Stop/Continue/Clock, status 0xF8–0xFF). `MOVE_MIDI_SOURCE_EXTERNAL`. Empty `on_midi` drops them today; populating `on_midi` would unlock cable-0 transport awareness.
2. **MIDI_OUT cable-2 musical** (`schwung_shim.c:1245–1247`): 3-byte channel messages (status 0x80–0xE0) — note-on, note-off, CC, polyphonic-AT, channel-AT, pitch-bend, program-change. Cable 2 = external USB MIDI flowing OUT of Move (which includes external USB MIDI flowing IN passed-through). `MOVE_MIDI_SOURCE_EXTERNAL`. Empty `on_midi` drops them today; populating `on_midi` would unlock external USB MIDI.

**Nothing else.** No CC capture rules, no FX broadcast, no MIDI_IN filter site, no `shadow_send_midi_to_dsp` drain — none of these reach overtake. They all dispatch only to `shadow_plugin_v2->on_midi(shadow_chain_slots[..])` (chain slots) or to `shadow_master_fx_forward_midi`.

### What does NOT reach overtake `on_midi`

1. **Pad presses (notes 68–99 from internal Move pads)** — appear in MIDI_IN as cable-0 musical notes. Handled by `shadow_filter_move_input` (~`schwung_shim.c:6687–6741`), which routes them only to chain slots (capture rules → focused `shadow_chain_slots[slot]->on_midi` at line 6717; FX_BROADCAST → all active `shadow_chain_slots[]->on_midi` at 6731). The post-ioctl filter publishes some pad events to JS via `shadow_ui_midi_publish` (lines 6649, 6690, 6695, 6702 — covers track buttons 40–43, knob touches 0–7, pad_block 68–99, polyphonic AT under pad_block). But there is no overtake delivery from this MIDI_IN handler.
2. **JS-routed `shadow_send_midi_to_dsp`** (used by `liveSendNote` for non-note CC/AT/PB) — lands in `shadow_midi_dsp_shm`, drained by `shadow_drain_ui_midi_dsp` (`host/shadow_midi.c:702–743`). The drain calls only `shadow_chain_dispatch_midi_to_slots(pkt, ...)` — no overtake side branch. So today these messages reach chain plugins (which dAVEBOx isn't) and not overtake.
3. **Move internal CCs (knob turns, transport buttons)** — comment at `schwung_shim.c:1118–1121`: *"MIDI_IN (internal controls) is NOT routed to DSP here. Shadow UI handles knobs via set_param based on ui_hierarchy."* Captured CCs (transport, jog, etc.) handled JS-side. Capture-rule CCs route to focused chain slot, not overtake.

### What this corrects

**Audit-1 §1.2 was importantly imprecise.** That section said:

> *"Shim audio-thread scan iterates MIDI_OUT every audio block, slot-by-slot. For each event: Calls `shadow_chain_dispatch_midi_to_slots(pkt, ...)` → invokes `on_midi(instance, msg, len, source)` on every chain slot's plugin. For dAVEBOx this is a no-op — `dsp/seq8.c:4753` is an empty stub … This is the audio-thread hook that Phase 1 needs to populate."*

Two things wrong with that:
1. The scan is **cable-2 only** for the chain dispatch (`if (cable != 2) continue;` at line 1198). Cable-0 musical traffic (which includes pad presses if they reach MIDI_OUT at all) is filtered out before the dispatch.
2. Even if dispatch fired, dAVEBOx is **not a chain slot** — it's `tool_config.overtake: true`. Chain dispatch goes to `shadow_plugin_v2->on_midi(shadow_chain_slots[..])`. Overtake DSP receives MIDI only through the two sites I enumerated above.

**Audit-1 punch list finding #1 is wrong.** It claimed *"`dsp/seq8.c::on_midi` is already wired by Schwung — just empty. The shim patch on `legsmechanical/schwung` to deliver pad MIDI directly to a new DSP host hook described in the rethink memory's Phase 1 step 1 is not needed."* In fact:

- Pad-press internal MIDI is **not** routed to overtake `on_midi` today. The shim patch IS needed if Phase 1 wants pad presses on the audio thread (which it does — that's the whole point of removing the JS slow-brain stack from the inbound path).
- The two existing overtake `on_midi` deliveries (cable-0 realtime, cable-2 musical) cover external transport and external USB MIDI, but not the headline use case.

**Audit-1 §3.2's "Phase 1 unlocks MPE-style expression as a side-effect" is half right.** Populating `on_midi` does unlock external USB MIDI (cable-2 musical at `schwung_shim.c:1245`) — which is most of what an MPE controller would emit. But it does NOT unlock the JS-routed `shadow_send_midi_to_dsp` path that `liveSendNote` uses for CC/AT/PB. To unify both inbound paths, Phase 1 needs a small additional Schwung patch in `shadow_drain_ui_midi_dsp` to also tee to `overtake_dsp_gen->on_midi`. Same patch surface as the pad-press fix.

### Phase 1 implications (revised from Audit-1)

1. **Phase 1 surface area is bigger than the Audit-1 punch list claimed.** Bundle 1 must include a Schwung-side shim patch on `legsmechanical/schwung` to:
   - Deliver MIDI_IN cable-0 pad-press musical notes (notes 10–127, status 0x80/0x90 — exclude knob-touch reserved range 0–9) to `overtake_dsp_gen->on_midi(MOVE_MIDI_SOURCE_INTERNAL)`.
   - Tee `shadow_drain_ui_midi_dsp`'s drain loop to also invoke `overtake_dsp_gen->on_midi(MOVE_MIDI_SOURCE_HOST)` so JS-routed CC/AT/PB reaches overtake too. (Optional for Bundle 1's pad-press goal; required for full MPE expression.)
2. **Patch scope is small** — both changes are 5–15 lines each in `schwung_shim.c`, mirroring the existing two delivery sites. Same capability-gate pattern as [[chain-edit-corun-shipped]] / [[move-native-corun-shipped]] (dAVEBOx checks for the patched-shim runtime; falls back to `pendingLiveNotes` JS path if absent).
3. **Bundle 1 effort revised: S → M (3–4 days vs 2–3)** — adds the Schwung patch + capability gate + dual-path logic on dAVEBOx side. Total Phase 1 estimate goes from ~2.5 weeks to ~3 weeks.
4. **Schwung shim deploy + rebase risk applies** — per [[schwung-shadow-ui-deploy]] and [[schwung-pending-pr]]. Patch lives in `patches/davebox-local.patch`; cherry-pick onto next upstream Schwung version.

### Updated dispatch table (this is the canonical version going forward)

| Inbound source | Cable / shim entry | Delivery to overtake `on_midi` today | After Phase 1 patch |
|---|---|---|---|
| External USB MIDI (musical) | MIDI_OUT cable-2, `shim:1245` | YES (drops because empty) | YES (handled) |
| External USB clock | MIDI_OUT cable-0 realtime, `shim:1157` | YES (drops because empty) | YES (handled) |
| Internal pad presses | MIDI_IN cable-0, `shim:6687` | **NO** | YES (after shim patch) |
| Internal knob CCs | MIDI_IN cable-0, `shim:6654` | **NO** (intentional — JS handles) | NO (unchanged) |
| JS `shadow_send_midi_to_dsp` (CC/AT/PB) | `shadow_drain_ui_midi_dsp` | **NO** | YES (after shim drain patch — optional) |

### Audit-1 punch list — supersession notice

Treat finding #1 in `## Punch list` (the Audit-1 section, mid-document) as **superseded by this Audit-3 follow-up**. The "no shim patch needed" claim was wrong. Phase 1 Bundle 1 effort revised to **M (3–4 days)** to account for the Schwung-side shim work; total Phase 1 from **~2.5 weeks → ~3 weeks**.

---

## Next session

- **Audit-4 (Cross-cutting + dead-stagger code, Phase 0)** remains: walk every sub-block scheduling site (`pfx_sched_delay_ons`, `pfx_sched_delay_offs`, MIDI DLY echo placement, unison stagger, HARMZ stagger). Per-site decision: kept (offset > block size) or dead-coalesced (delete or document). Lands as small Phase 0 commits on `main`.
- Phase 2 is independent of Phase 1 — could run in parallel by another agent / branch.

---

# Audit-4: Sub-block scheduling sites + Audit-2/3 block-size correction

Scope: every site that calls `pfx_q_insert` / `drum_pfx_q_insert` with a sub-tick `fire_at` offset. Per-site verdict: **kept** (offset reliably crosses ≥1 audio block) vs **dead-coalesced** (offset never exceeds one block, sample-position information is erased at `pfx_q_fire` block-end).

Source plan: prior audits' "Next session" + advisor pre-flight.

## Layer 12.0: Calibration — queue + block size facts

**Two facts that change every prior audit conclusion about sub-block timing:**

1. **`MOVE_FRAMES_PER_BLOCK = 128`** (`dsp/host/plugin_api_v1.h:17`, `~/schwung/src/host/plugin_api_v1.h:17`). One audio block = 128 samples = **~2.67 ms at 48 kHz** — *not* 512 samples. Audit-2 §6.3 / Audit-3 §11.3 stated "sub-block stagger erased at block-end" assuming a 512-sample block; with the real 128-sample block, several scheduling sites whose offsets I assumed died actually survive.

2. **`pfx_q_insert` is binary-search sorted by `fire_at`** (`dsp/seq8.c:2380–2398`), not FIFO. `pfx_q_fire` drains in sorted order with `<=` semantics (`:2429`). Even when timing collapses (offset < block), **emit order is preserved**. So a "dead-coalesced" site can still be order-load-bearing.

**`pfx_q_fire` cadence**: invoked at the TOP of every `render_block` (`:6213–6218`), immediately after `fx->sample_counter += frames` (`:6208`). `now` passed in = end-of-current-block. Events with `fire_at <= sample_counter` fire; the rest stay queued.

**`pfx_send` vs `pfx_q_insert`**: `pfx_send` (`:1700`) emits synchronously through `pfx_emit` *unless* schedule-time swing deferral fires (`:1834–1843` — when `swing_step_delay > 0` on even steps). So a "primary" note-on with swing off hits the wire in the *same* audio block; queued copies fire ≥1 block later.

## Layer 12: Per-site verdicts

### 12.1 `pfx_sched_delay_ons` — MIDI DLY note-on repeats

**Site**: `dsp/seq8.c:2569–2660`. `cumul_delay` (samples) = `Σ CLOCK_VALUES[delay_time_idx] * sp` with optional `fb_clock` decay/growth per rep.

- `sp = pfx_spc(inst, tr) = (sample_rate * 60) / (BPM * 480)` samples per 480-PPQN clock.
- At 48 kHz / 120 BPM: `sp = 50`; min `CLOCK_VALUES[0] = 30` (1/64 note) → first rep `cumul = 1500 samples = ~12 blocks`. Max `CLOCK_VALUES[16] = 2880` (1/1D) → first rep `cumul = 144,000 samples ≈ 1000 blocks`.
- At extreme 240 BPM / 1/64: `sp = 25`, first rep `cumul = 750 samples = ~6 blocks`. Still kept.
- Each event also adds `swing_offset_for_fire_at(...)` (samples, see §12.7) — adds more block-crossing offset.

**Verdict: kept across the entire parameter range.** No floor configuration where rep 0 stays sub-block. **Class: kept.**

### 12.2 `pfx_sched_delay_offs` — MIDI DLY note-off repeats

**Site**: `dsp/seq8.c:2664–2682`. `off = base_time + cumul_delay + (gate_smp * gate_factor)` per rep. Inherits §12.1's `cumul_delay` floor (≥6 blocks); `gate_smp` strictly positive.

**Verdict: kept across the entire parameter range. Class: kept.**

### 12.3 Unison stagger

**Site**: `pfx_note_on` `dsp/seq8.c:2802–2810`. `UNISON_STAGGER = 220` samples (`:95`). `fx->unison ∈ {0, 1, 2}` (Off/x2/x3).

- c=0 → stagger = 220 samples = **~1.72 audio blocks** at 48 kHz.
- c=1 → stagger = 440 samples = **~3.44 blocks**.
- Comment says "~5 ms at 44100 Hz" — at 48 kHz it's ~4.58 ms / ~9.17 ms for c=0/c=1.

**Block-relative timing**:
- Primary emits synchronously via `pfx_send` → `pfx_emit` (no queue, swing off) during block N's per-tick scan, where `sc = S_N` (sample_counter at end of block N, set at top of block N).
- Stagger c=0 queued at `S_N + 220`. Drain checks:
  - Block N+1 top: `pfx_q_fire(S_N + 128)` → `220 <= 128`? No, stays queued.
  - Block N+2 top: `pfx_q_fire(S_N + 256)` → `220 <= 256`? Yes, fires.
- Stagger c=1 at `S_N + 440` → fires at block N+4 (`S_N + 512 >= 440`).
- **First unison copy fires 2 audio blocks (~5.33 ms) after primary; second copy at ~10.67 ms.**

**Drum/HARMZ note**: drum side has no unison (line 3146 hardcodes `stored_unison = 0`). HARMZ siblings inside `gen[]` share the *same* fire_at as the primary they wrap — they don't add a second stagger axis.

**Off-side compensation**: `pfx_note_off` adds `uni_ext = UNISON_STAGGER * stored_unison` to `off_time` (`:2834–2848`) so the off lands after all unison ons. Correct.

**Off-side queue: when?**: `pfx_note_off` immediate-emits when `off_time <= now`; queues when `off_time > now` (`:2840–2845`). With `gate_smp + uni_ext > 128 samples`, queues; at very short `gate_time%`, may bypass queue. Doesn't affect the on-side stagger verdict.

**Verdict: kept (timing survives ≥1 block of delay between primary and first unison copy). Class: kept.**

**Design-intent preservation**: the 220-sample number ported from NoteTwist targets ~5 ms at 44.1 kHz. On Move (48 kHz, 128-smp blocks) the actual wall-clock gap quantizes to 5.33 ms / 10.67 ms — within ~7% of the original 4.58 ms / 9.17 ms unquantized values. The block model preserves design intent rather than imposing a destructive quantization artifact.

### 12.4 HARMZ stagger — **NOT a scheduling site**

**Site**: `pfx_build_harmz_copies` `dsp/seq8.c:2537–2557`. Returns sibling pitches as an array `out[]` (primary + octaver + h1 + h2). All siblings emit/queue at the same `fire_at` as the primary they expand (callers iterate `for j in gc` over the array).

- Within `pfx_note_on` (`:2799–2800`): primary array → tight `pfx_send` loop, synchronous.
- Within unison stagger loop (`:2807`): primary array → tight `pfx_q_insert` loop, all entries share the same `stagger` `fire_at`.
- Within `pfx_sched_delay_ons` rep loop (`:2651–2655`): primary array → tight `pfx_q_insert` loop, all entries share the same `ft` `fire_at`.

The sorted-insert at `pfx_q_insert` keeps insertion order for equal `fire_at` (`<=` test at `:2386` places new entries after existing equals). HARMZ siblings emit in declaration order: primary, octaver, h1, h2.

**Verdict: not in scope for sub-block scheduling. Class: not a stagger site.** Document.

### 12.5 Drum-side `drum_pfx_sched_delay_ons` / `drum_pfx_sched_delay_offs`

**Site**: `dsp/seq8.c:3068–3126`. Same `CLOCK_VALUES` table, same `MAX_DELAY_SAMPLES` floor as §12.1/12.2. Inherits same kept-across-range verdict. No drum unison (`stored_unison = 0`), no drum HARMZ.

**Verdict: kept. Class: kept.**

### 12.6 Perf staccato `fire_at` — **different domain**

**Sites**: `dsp/seq8.c:1761` (Phantom ghost note-off scheduling in capture hook), `:2068` (Staccato/Legato/Ramp Gate gate-override scheduling in `perf_apply`), drain at `:2109` (CAPTURING) and `:2270` (LOOPING).

The `fire_at` field in `perf_staccato_notes[]` is a **looper-tick index** (modulo `looper_capture_ticks`), not a sample counter. Drain test is exact equality `fire_at == looper_pos` — fires at the matching per-DSP-tick. Smallest gap = 2 looper ticks = 2 × MOVE_FRAMES_PER_BLOCK = 256 samples.

**Verdict: not in `pfx_q_insert` scheduling domain.** Per-looper-tick precision (~2.67 ms), not sub-block. **Class: separate scheduling domain — out of Audit-4 scope.** Cross-ref Audit-3 §10.1 (perf mods classification).

### 12.7 Schedule-time swing offset (`swing_offset_for_fire_at`)

**Site**: helper at `dsp/seq8.c:2405–2424`; called from §12.1/12.2/12.3 (and drum counterparts §12.5).

- `off_ticks = swing_amt * pair_ticks / 400`. `swing_amt ∈ [0, 100]`; `pair_ticks = 48` (1/16) or `96` (1/8).
- Max `off_ticks` = 12 (1/16) or 24 (1/8).
- Converted to samples via `spt = MOVE_FRAMES_PER_BLOCK * tick_threshold / tick_delta` (samples per DSP tick).
- At 48 kHz / 120 BPM: 1 step ≈ 6000 samples; max swing offset at 100% = ~3000 samples = **~23 blocks**. At swing_amt=20 (typical): ~600 samples = ~4-5 blocks.
- swing_amt=0 → `swing_step_delay_offbeat = 0`; helper short-circuits at `:2410`.

**Verdict: kept for any musically meaningful swing_amt. Class: kept.** Floor case is the no-swing zero, which is a hard skip not a scheduling site.

### 12.8 `bake_stage_midi_dly` — offline, tick-domain

**Site**: `dsp/seq8.c:4985–5053`. Operates entirely in 96-PPQN clip-tick space (`echo_tick`, `cumul`). No `pfx_q_insert`, no sample-position scheduling. Writes results to `out[]` array consumed by `clip_insert_note`.

Bake also does *not* replicate UNISON_STAGGER (no unison stage in `BAKE_STAGES[]`); HARMZ siblings *are* preserved (via `pfx_build_gen_notes` shared with live, called from bake stage 0). Already documented in Audit-2 §10.5 ("modulo the inputs bake can't see").

**Verdict: out of Audit-4 scope.** Cross-ref Audit-2 §10.5.

### 12.9 Other sub-block writes (catalogued for completeness)

| Site | Target | Domain | Audit-4 relevance |
|---|---|---|---|
| `pfx_send` swing deferral `:1834–1843` | `pfx_q_insert` even-step note-on/off | sample | Drives §12.7 — primary emits queue when swing active; sort-by-fire_at keeps pair order; `in_queue_drain` re-entry guard at `:1836` |
| `drum_pfx_send` swing deferral `:3022–3030` | `drum_pfx_q_insert` | sample | Mirror of above for drums |
| `pfx_note_off` deferred-off `:2842–2845` | `pfx_q_insert` | sample | Off when `off_time > now`. `off_time - now` is at least `gate_smp + uni_ext`; verify gate_smp floor below |
| `drum_pfx_note_off` deferred-off `:3164–3167` | `drum_pfx_q_insert` | sample | Same |
| `drum_repeat_tick` / `drum_repeat2_tick` `fire_at` `:3680, :3796` | local `int` var, drain test `drum_repeat_phase == fire_at` (`:3682`) | DSP-tick | Not in `pfx_q_insert` domain — per-tick repeat scheduler, fires on phase equality |
| `merge_finalize` `:1632–1640` | clip insert | tick | Out of scope (clip-storage) |

**`pfx_note_off` deferred-off floor**: `off_time = on_time + gate_smp + uni_ext`. `gate_smp` is positive (line 2372 clamps to ≥1 when `gate_time > 0`); `uni_ext = UNISON_STAGGER * stored_unison ∈ {0, 220, 440}`. At `gate_time=1` minimum: `gate_smp = (GATE_TICKS * TICKS_TO_480PPQN * sp * 1 / 100) ≈ (24 * 5 * 50 * 0.01) = 60 samples`. Below one block. With `unison=0`, this defers and fires next block (`now + 60`, drained when sc advances 128 — first opportunity). With `unison>0`, `off_time` lands several blocks out. Not dead-coalesced (queues then fires next block; that's still "1 block of stagger" which is the floor of the queue model).

## Audit-4 punch list

| Item | Class | Phase-0 effort | Notes |
|---|---|---|---|
| 12.1 `pfx_sched_delay_ons` | kept | none | Min floor ~6 blocks even at 240 BPM / 1/64 |
| 12.2 `pfx_sched_delay_offs` | kept | none | Inherits §12.1 floor + positive gate_smp |
| 12.3 Unison stagger | kept | none | First copy 1 block after primary; second copy +1 block more |
| 12.4 HARMZ (`pfx_build_harmz_copies`) | not a stagger site | none | Sibling array, shared `fire_at`; stable sorted insert preserves order |
| 12.5 Drum-side delay | kept | none | Mirror of §12.1/12.2 |
| 12.6 Perf staccato | separate domain | none | Looper-tick precision, not sample |
| 12.7 Schedule-time swing | kept | none | Max ~23 blocks at 120 BPM / swing=100; zero on no-swing |
| 12.8 `bake_stage_midi_dly` | offline / tick | none | Already covered by Audit-2 §10.5 |
| 12.9 Other sub-block writes | mixed | none | Catalogued; no dead-coalesced sites |

**Net: zero dead-stagger sites.** Every site reviewed is timing-load-bearing at ≥1 block of separation, with the exception of HARMZ which isn't a scheduling site at all. **No Phase-0 deletions warranted.**

## Layer 12.10: Audit-2/3 corrections (carry forward)

This audit changes two prior-audit findings — both based on the wrong block size (assumed 512 samples; actual 128).

### Correction A: Audit-2 §6.3 "Sub-block timing"

Original:
> *"All emit-side events queue with sample-position fire_at, but `pfx_q_fire` runs once per block at block-end — erasing sub-block stagger."*

**Corrected reading**:
- `pfx_q_fire` runs at the TOP of each `render_block`, after `sample_counter += 128`. So "block-end" = `sc_new` = `sc_old + 128`.
- Two events queued during block N with `fire_at` distance < 128 samples *from each other and from the next sc advance* coalesce at the same drain call — their *relative* timing is erased. The *absolute* delay is still at least one block (~2.67 ms) because they fire at the next `pfx_q_fire`, not the current one.
- Sub-block stagger *across* the 128-sample boundary is preserved at 1-block granularity, and per the §12.3 trace, can produce 2+ block delays for offsets like UNISON_STAGGER=220 because the queued event misses block N+1's drain window and waits for block N+2.
- Emit order within a single `pfx_q_fire` drain is preserved by the binary-search sort (stable for equal keys via `<=` test).

**Phase 1 implication**: storage path remains clean; the §6.4 conclusion "no Phase 1 work in Layer 4 or 5" still holds. The correction only affects how we describe what Phase 1 inherits.

### Correction B: Audit-3 §11.3 "Block-end fire model"

Original:
> *"all events with fire_at ≤ block_end fire at block end via pfx_q_fire. … Sub-block stagger is erased on emit regardless of destination."*

**Corrected reading**: same as A. "Block_end" is the 128-sample boundary, not 512. Stagger sites with offsets ≥ 128 samples (which is *all* the scheduling sites surveyed in Audit-4) cross block boundaries and produce real downstream timing.

**Phase 2 implication**: no change. ROUTE_EXTERNAL via `ext_queue` + JS drain still wins ~5 ms on Phase 2b. The ROUTE_MOVE / ROUTE_SCHWUNG block-end model is unchanged; only the magnitude of the "erased" interval was wrong.

### Architecture-rethink memory: "sub-block jitter deferred to Phase 3"

The rethink's framing remains correct — sub-block (intra-128-sample) timing is genuinely erased, and Phase 3 sub-block-jitter remediation would target *that* erasure. None of the scheduling sites surveyed here are sub-128-sample. The Phase 3 candidate work is purely about *event timing within a single block* — recording side (multiple `on_midi` calls within one block all snapshot the same `current_clip_tick`) and emit side (multiple `pfx_q_fire` events with different fire_at < 128-window all emit at the same wall-clock moment).

## Layer 12.11: What this audit didn't find

The advisor pre-flight asked: *"does the dead-stagger code currently cause incorrect behavior?"* Answer: **no**. Every scheduling site is load-bearing under normal parameter ranges. No deletions are warranted. The Audit-4 deliverable is **documentation + prior-audit corrections**, not Phase 0 commits.

This is a useful inversion of the original framing in the rethink memory ("Audit-4 lands as small Phase 0 fixes on `main`"). There are no fixes — the architecture is more correct than the rethink suspected, and the only meaningful Phase 0 output is the §12.10 corrections to Audit-2/3.

## Next session

- Phase 1 (inbound: pad-press → `on_midi`) — primary remaining work, ~3 weeks per Audit-3 follow-up.
- Phase 2 (ROUTE_EXTERNAL shim worker thread) — ~3–5 days, independent of Phase 1.
- No Phase 0 from Audit-4.

