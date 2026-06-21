# DSP Write and Readback Inventory

## Purpose

This inventory documents current Overture UI DSP writes and DSP readback scheduling sites. It follows the approved direction in `approved-target-architecture.md` and `boundary-validation.md`: characterize current DSP timing before introducing any compatibility DSP operation queue.

This is not a refactor proposal.

## Compatibility Migration Progress

The compatibility migration keeps `S.pendingDefaultSetParams` as the backing
storage while routing selected structural writes through
`sync/ui_dsp_operation_queue.mjs`.

Migrated in `sync/ui_clip_edit_ops.mjs`:

- `clearClipImpl`
- `hardResetClipImpl`
- `copyClipImpl`
- `cutClipImpl`
- `copyStepImpl`
- `clearStepImpl`
- `copyRowImpl`
- `cutRowImpl`
- `clearRowImpl`
- `doLaneDoubleFillImpl`

Migrated in `drum/ui_drum_lane_workflows.mjs`:

- `copyDrumLaneImpl`
- `cutDrumLaneImpl`
- `copyDrumClipImpl`
- `cutDrumClipImpl`

Migrated in `bank/ui_bank_params.mjs`:

- `resetPerClipBankParamsToDefaultImpl`
- `resetFxBanksImpl`
- `resetSingleFxBankImpl`
- `resetTarpImpl`

Migrated through `sync/ui_automation_clear_ops.mjs`:

- `clearAutomationImpl`
- `resetCcLaneImpl`

Migrated in `input/ui_navigation_cc_workflow.mjs`:

- CC lane geometry resize writes from Loop+Up/Down on melodic bank 6

Still intentionally raw in `sync/ui_clip_edit_ops.mjs`: none.

## Timing Classes

| Class | Current meaning |
| --- | --- |
| Immediate write | Calls `host_module_set_param` / `deps.setParam` in the current handler or tick task. |
| Queued write | Pushes `{ key, val }` into `S.pendingDefaultSetParams`. |
| Unshift / priority write | Uses `S.pendingDefaultSetParams.unshift(...)` so the operation drains before older queued writes. |
| One-per-tick coalescing-sensitive write | Depends on `runDefaultSetParamDrain` shifting one queued item per tick. Often used because same-buffer or same-track writes can be dropped/coalesced by the host/DSP path. |
| Delayed readback | Sets `pending*` counters or runs tick/poll reads via `host_module_get_param` after DSP has processed a write. |
| Optimistic mirror update | Updates JS mirror state immediately before or while the DSP write is still pending. |
| Recording / live-note path | Performance-sensitive paths for live notes, recording drains, count-in, preroll, and adaptive recording. |
| Transport / performance path | Transport, mute/solo, snapshots, session/perf state, loop gestures, repeat performance, and live merge. |
| Bank / loop / drum / clip / route / co-run path | Concept-specific paths that have DSP ownership concerns. |

## Core Drains and Readbacks

| Site | Behavior | Classes |
| --- | --- | --- |
| `tick/ui_tick_tasks.mjs` `runDefaultSetParamDrain` | Drains `S.pendingDefaultSetParams.shift()` one item per tick when not loading a set and not waiting for DSP sync. Honors `S.clearDrainHold` before draining. | queued write, one-per-tick coalescing-sensitive write |
| `tick/ui_tick_tasks.mjs` `runDspMirrorResyncTasks` | Polls `instance_id` every 100 ticks for DSP hot reload. Drains `S.pendingDspSync` after `state_load`, then runs `pollDSP`, `syncClipsFromDsp`, `syncMuteSoloFromDsp`, sidecar restore, padmap recompute, LED invalidation, redraw. | delayed readback, mirror reconciliation |
| `tick/ui_tick_tasks.mjs` `runDeferredContentResyncTasks` | Drains `pendingDrumResync`, `pendingDrumLaneResync`, `pendingStepsReread`, and `pendingSceneBakeResync`. Reads drum clip/lane state, drum lane bank params, or melodic clip state after delayed writes. | delayed readback, drum path, clip path |
| `tick/ui_tick_tasks.mjs` `runPendingUndoSyncTask` | After `pendingUndoSync` reaches zero, reads `last_restore`, targeted clip restore data, and re-establishes recording flag if recording was active. | delayed readback, recording path, clip path |
| `tick/ui_tick_tasks.mjs` `runDeferredCcBitsRefresh` | Reads CC automation bits/rest values after MIDI-context operations where direct `get_param` can be null. | delayed readback, bank path |
| `sync/ui_polldsp_workflow.mjs` `pollDspWorkflow` | Fixed-order poll pipeline. Reads snapshots, transport state, active clips, queued clips, merge state, playhead, recording pending page, step LED data, active notes, save state, and co-run state. | delayed/readback poll, transport/performance path, co-run path |

## Queued Write Producers

| Site | DSP keys / family | Current behavior | Classes |
| --- | --- | --- | --- |
| `sync/ui_clip_edit_ops.mjs` `clearClipImpl` | `tN_cC_drum_clear`, `tN_cC_clear`, `tN_cC_clear_keep`, optional `tN_launch_clip` | Priority queues clear via `unshift`, sets `clearDrainHold = 1`, updates JS mirrors immediately, schedules `pendingStepsReread = 2` for melodic clear. | unshift/priority write, one-per-tick coalescing-sensitive write, optimistic mirror update, delayed readback, clip/drum path |
| `sync/ui_clip_edit_ops.mjs` `hardResetClipImpl` | `tN_cC_drum_reset`, `tN_cC_hard_reset` | Priority queues reset via `unshift`, sets `clearDrainHold = 1`, resets JS mirrors. Drum active clip mirrors are reset locally. | unshift/priority write, optimistic mirror update, clip/drum path |
| `sync/ui_clip_edit_ops.mjs` copy/cut/row/step ops | `clip_copy`, `clip_cut`, `row_copy`, `row_cut`, `row_clear`, `tN_lL_step_X_copy_to`, `tN_cC_step_X_copy_to`, `tN_cC_step_X_clear`, `tN_cC_kL_cc_lane_double_fill` | Queues single atomic DSP structural commands, updates destination/source mirrors immediately, schedules drum or melodic delayed readback for active affected content. Step clear refreshes active-step notes; CC lane double-fill preserves popup/redraw behavior. | queued write, one-per-tick coalescing-sensitive write, optimistic mirror update, delayed readback, clip/drum/bank path |
| `drum/ui_drum_lane_workflows.mjs` lane/clip copy/cut | `tN_lL_copy_to`, `tN_lL_cut_to`, `drum_clip_copy`, `drum_clip_cut` | Routes structural drum edit writes through the compatibility DSP operation queue, backed by `pendingDefaultSetParams`, and updates lane/clip mirrors. Active destination/source paths schedule drum resync or lane resync. | queued write, optimistic mirror update, delayed readback, drum path |
| `bank/ui_bank_params.mjs` reset banks | `tN_lL_pfx_reset`, `tN_lL_pfx_set`, `tN_pfx_reset`, `tN_cC_pfx_set`, `tN_tarp_reset`, per-bank reset keys | Routes reset and default-override writes through the compatibility DSP operation queue, backed by `pendingDefaultSetParams`. Comments explicitly preserve deferred order so reset and `delay_level 127` land on later ticks. | queued write, one-per-tick coalescing-sensitive write, optimistic mirror update, bank path |
| `bank/ui_bank_params.mjs` CC assignment defaults | `tN_cc_type_assign` | During CC bank read, default Schwung-routed tracks route eight assignment writes through the compatibility DSP operation queue, backed by `pendingDefaultSetParams`, one per tick. | queued write, one-per-tick coalescing-sensitive write, bank/route path |
| `bank/ui_bank_params.mjs` leaving drum mode | `tN_active_drum_lane`, `tN_drum_perform_mode` | After direct `tN_pad_mode`, queues downstream mirror writes and defers padmap recompute until queue is empty to avoid same-track interference. | immediate write plus queued write, one-per-tick coalescing-sensitive write, delayed padmap write, bank/drum/route path |
| `input/ui_button_cc_workflow.mjs` and `menu/ui_clear_auto_workflow.mjs` | CC lane reset, CC auto clear, aftertouch clear, TARP latch | Queues automation and latch clear operations from button/menu handlers. | queued write, bank/clip path |
| `input/ui_jog_cc_workflow.mjs` and `input/ui_navigation_cc_workflow.mjs` | bake, clip playback dir/reverse reset, CC lane loop/resolution/TPS writes, automation clear | Mixes queued structural/automation writes with direct action writes. CC lane geometry resize from navigation now routes through the compatibility DSP operation queue; several other sites schedule `pendingStepsReread` or `pendingDrumResync`. | queued write, immediate write, delayed readback, bank/loop/clip/drum path |
| `view/ui_session_view_workflow.mjs` | `snap_delete`, `snap_load`, `launch_scene`, `merge_place_row` | Queues session/performance operations from step/pad/row gestures. Clip/row copy paths delegate to structural edit ops above. | queued write, transport/performance path, clip path |
| `input/ui_transport_cc_workflow.mjs` sample/live merge | `merge_stop`, `merge_arm` | Queues merge arm/stop so placement/finalization can reconcile through poll state. | queued write, transport/performance path |
| `perform/ui_latch_workflows.mjs` and drum repeat stop/latch queues | `tN_drum_repeat_stop`, `tN_drum_repeat2_lane_off`, `tN_tarp_latch`, queued repeat latch/stop variants | Queues unlatch/stop operations where all-track sweeps would otherwise emit multiple same-buffer writes. | queued write, one-per-tick coalescing-sensitive write, transport/performance path, drum path |
| `perform/ui_transpose_workflow.mjs` | `t0_xpose_apply` | Queues transpose apply/cancel operations after preview. | queued write, bank/performance path |

## Immediate Write Producers

| Site | DSP keys / family | Current behavior | Classes |
| --- | --- | --- | --- |
| `tick/ui_tick_tasks.mjs` `runLiveNoteDrain` | `tN_live_notes` | Batches live note on/off events per track. Skips one tick after step operations so step writes clear the audio block first. | immediate write, recording/live-note path, coalescing-sensitive timing |
| `perform/ui_recording_workflow.mjs` `drainRecordingQueues` | `tN_record_note_on/off`, `tN_drum_record_note_on/off`, preroll step toggles/gates, adaptive length writes | Flushes at most one recording set-param family per tick. Branch order is load-bearing: note-ons before note-offs, preroll gate/toggle paths, then length/disarm/adaptive extension. | immediate write from tick, one-per-tick coalescing-sensitive write, recording/live-note path, optimistic mirror update |
| `perform/ui_recording_workflow.mjs` arm/disarm/handoff | `record_count_in`, `record_count_in_cancel`, `tN_recording` | Direct writes from transport/recording handlers. Count-in cancel intentionally avoids a second `_recording 0` write. | immediate write, recording path, transport path |
| `sync/ui_clip_edit_ops.mjs` `selectClipOnTrackImpl` and `view/ui_session_view_workflow.mjs` clip press paths | `tN_launch_clip`, `tN_stop_at_end`, `tN_deactivate` | Direct clip launch/stop/deactivate writes, with local active clip/page mirror updates and drum resync when focus changes. | immediate write, optimistic mirror update, transport/clip path |
| `sync/ui_clip_edit_ops.mjs` `doDoubleFillImpl` | `tN_all_lanes_double_fill`, `tN_lL_loop_double_fill`, `tN_loop_double_fill` | Direct loop double-fill writes. Updates length mirrors and schedules drum/melodic readback. | immediate write, optimistic mirror update, delayed readback, loop/drum/clip path |
| `perform/ui_loop_gesture_workflow.mjs` | `tN_cC_loop_set`, `tN_lL_loop_set`, `tN_all_lanes_loop_set`, `tN_cC_kL_cc_loop_set`, length writes | Direct atomic loop-window and length writes with immediate JS loop/length/page mirrors. All-lanes drum loop schedules drum resync. | immediate write, optimistic mirror update, loop/drum/clip/bank path |
| `bank/ui_bank_params.mjs` `applyTrackConfigImpl` / `applyBankParamImpl` | global, track, clip, route/channel/pad mode, pfx, clip resolution/dir | Direct param writes for most bank edits. Special cases queue known coalescing-sensitive keys such as `seq_arp_steps_mode`, `tarp_steps_mode`, and `delay_retrig`. | immediate write, queued write for exceptions, optimistic mirror update, bank/route path |
| `input/ui_knob_cc_workflow.mjs`, `input/ui_jog_cc_workflow.mjs`, `input/ui_knob_touch_workflow.mjs` | drum lane resolution/stretch/nudge/clock shift/euclid/playback, melodic nudge/resolution, global delay/note FX random mode, CC touch/clear | Direct gesture writes with local mirrors. Some destructive or resync-sensitive operations schedule `pendingDrumResync` or `pendingStepsReread`; some reset/clear writes are queued. | immediate write, delayed readback, bank/loop/drum/clip path |
| `view/ui_track_view_step_workflow.mjs` | step toggle/clear/reassign/gate/vel/nudge/iter/rand/ratch/set_notes, CC automation range/set writes, quantize | Direct step edit writes with local mirrors and selected delayed rereads, especially reassign/melodic moves. | immediate write, optimistic mirror update, delayed readback, clip/drum/bank path |
| `drum/ui_drum_lane_workflows.mjs` clear/reset/mute/solo | `tN_lL_hard_reset`, `tN_lL_clear`, `tN_lL_mute`, `tN_lL_solo` | Direct lane reset/clear/mute/solo writes with mirror updates. Factory reset schedules lane resync. | immediate write, optimistic mirror update, delayed readback for reset, drum path |
| `drum/ui_drum_repeat_workflows.mjs` repeat performance | `tN_drum_repeat_start/stop/vel/latched`, `tN_drum_repeat2_lane_on/off/rate/vel/stop/latch_held`, repeat groove edit keys | Direct performance writes for low-latency repeat pads/aftertouch/rates. Reset/stop/latch operations are sometimes queued when part of sweeps. | immediate write, queued write for reset/sweep, recording/live-note adjacent, transport/performance path, drum path |
| `pad/ui_pad_surface.mjs` | `tN_active_drum_lane`, `tN_drum_perform_mode`, `tN_drum_lane_page`, `tN_lL_step_S_vel`, `tN_drum_repeat_lane`, `tN_padmap` | Direct mirror/padmap writes. `tN_padmap` only writes when `S.dspInboundEnabled`; padmap recompute is delayed in some bank paths until the queue is empty. | immediate write, optimistic mirror update, drum/live-note/route path |
| `pad/ui_pad_workflow.mjs` and `pad/ui_pad_aftertouch_workflow.mjs` | looper, perf stack, arp/tarp step edits, `tN_live_at` | Direct low-latency pad/performance writes. | immediate write, recording/live-note path, transport/performance path |
| `perform/ui_mute_solo_workflow.mjs` and `input/ui_transport_cc_workflow.mjs` | mute/solo, mute all clear, transport, metronome, recording | Direct transport and mute/solo writes. Some transport operations intentionally combine multiple concepts into one `transport` payload, such as `play_focus` and `restart_at`, to avoid coalescing. | immediate write, transport/performance path |
| `menu/ui_global_menu.mjs`, `perform/ui_tap_tempo_workflow.mjs`, tick global preview | bpm, scale aware, launch quant, swing, MIDI input, metronome | Direct global/menu writes. Tick preview only sends changed edit values to avoid starving launch/transport commands. | immediate write, transport/performance path, bank/global path |
| `render/ui_perf_leds.mjs` | `perf_mods` | Direct perf-mod write from LED/perf update path. Sidecar restore may queue `perf_mods`. | immediate write or queued restore write, transport/performance path |
| `tick/ui_tick_tasks.mjs` persistence/set tasks | `state_load`, `save`, `snap_save`, `prune_orphan_states`, `tN_tarp_latch` | Direct tick-context writes. `state_load` sets `pendingDspSync = 5`; save is intentionally last so exit/hide happens on a later tick. | immediate write from tick, delayed readback, transport/performance/persist path |

## Readback Scheduling Sites

| Flag / scheduler | Set by | Drained by | Readback behavior |
| --- | --- | --- | --- |
| `S.pendingStepsReread` | Melodic clear/copy step/double fill/reassign/nudge/bake/resolution operations in `sync`, `input`, and `view` paths. | `runDeferredContentResyncTasks` | Calls `readMelodicClipFromDsp(... preserveInactiveSteps, refreshActiveBankParams)` and redraws. |
| `S.pendingDrumResync` | Drum clip/row copy/cut/clear, all-lanes edits, drum loop/double-fill, recording disarm, session focus changes, knob edits. | `runDeferredContentResyncTasks` | Calls `syncDrumClipContent`, `syncDrumLanesMeta`, and active-lane `syncDrumLaneSteps`. |
| `S.pendingDrumLaneResync` | `scheduleDrumLaneResync` from drum lane copy/cut, drum recording note capture, lane factory reset, and step copy. | `runDeferredContentResyncTasks` | Calls `syncDrumLaneSteps`, refreshes drum lane bank params, redraws. Last write wins by design in `core/ui_state.mjs`. |
| `S.pendingDspSync` | Set to `5` after `state_load`. | `runDspMirrorResyncTasks` | Full mirror refresh after set load reaches audio thread. |
| `S.pendingUndoSync` | Undo/redo transport button handler after `undo_restore` / `redo_restore`. | `runPendingUndoSyncTask` | Reads `last_restore`, syncs targeted clips, re-establishes recording flag when needed. |
| `S.pendingSceneBakeResync` | Scene bake paths. | `runDeferredContentResyncTasks` | Re-reads all tracks at the baked scene clip, drum or melodic as appropriate. |
| `S.pendingCCBitsRefresh` | CC automation clear/edit paths that run in MIDI context. | `runDeferredCcBitsRefresh` | Reads `tN_cC_cc_auto_bits` and `tN_cC_cc_rest`. |
| `S.pendingPadNoteMapRecompute` | Leaving drum mode in track config. | `runPendingPadNoteMapRecompute` | Defers `computePadNoteMap` until `pendingDefaultSetParams` is empty and `clearDrainHold` is zero. |
| Poll-only readbacks | `pollDspWorkflow`, `runPadMapSelfHealTask`, `runCcLiveValPoll`, `runMetroBeatDetect`, `runTransportButtonLEDs` TARP blink, Sch label fetch. | Tick/poll tasks | Continuous or periodic reads for UI mirrors, playhead, LEDs, external queue, co-run, labels, and self-healing. |

## Coalescing-Sensitive Patterns To Preserve

- `pendingDefaultSetParams` is already an informal DSP operation queue. The drain is one item per tick and is suppressed during set load / DSP sync.
- `clearClipImpl` and `hardResetClipImpl` use `unshift` plus `clearDrainHold = 1` so clear/reset writes land before older queued writes but not in the same buffer as synchronous per-clip reset fan-out.
- Recording uses a separate one-family-per-tick drain, not `pendingDefaultSetParams`, because note events and adaptive length/disarm writes are latency-sensitive and ordered.
- Live notes are batched per track and delayed one tick after step operations.
- Some operations use single combined DSP payloads to avoid two writes in one buffer: `transport=play_focus:T:C`, `transport=restart_at:T:P:L`, loop `*_loop_set`, row/clip copy/cut commands, live merge placement, and drum repeat2 latch held.
- Bank resets deliberately queue reset then default override so `delay_level 127` lands after DSP reset zeros it.
- Padmap recompute after leaving drum mode waits for the queue to empty because same-track `tN_*` writes can interfere.
- Co-run paths are not pure DSP writes, but they share timing constraints with UI ownership, MIDI injection, LED cache, and host pass-through. They should remain characterized separately from normal DSP operation migration.

## Remaining Raw Queue Classification

This section is an anti-mechanical-migration checkpoint. Not every remaining
`pendingDefaultSetParams.push(...)` should be blindly wrapped. Some sites have
documented coalescing timing and should preserve queue semantics; some are
semantic UI operations that need a higher-level operation boundary first; some
may be simplification candidates if direct writes or existing readback are
proved sufficient.

| Site / keys | Classification | Rationale / next move |
| --- | --- | --- |
| `bank/ui_bank_params.mjs` CC assignment defaults: `tN_cc_type_assign` | Migrated compatibility queue family | Runs after CC bank read when defaulting Schwung-routed tracks to Sch1-8. It now routes through `enqueueDspOperation` while preserving FIFO append order on `pendingDefaultSetParams`. |
| `bank/ui_bank_params.mjs` leaving drum mode: `tN_active_drum_lane`, `tN_drum_perform_mode`, `pendingPadNoteMapRecompute` | Migrated compatibility queue family | Direct `tN_pad_mode=0` remains immediate, while follow-up `tN_active_drum_lane` and `tN_drum_perform_mode` writes route through `enqueueDspOperation` with FIFO append order. Padmap recompute remains coupled to the active-track leave-drum operation and still waits for the queue and `clearDrainHold` to clear. |
| `bank/ui_bank_params.mjs` deferred bank apply keys: `seq_arp_steps_mode`, `tarp_steps_mode`, `delay_retrig` | Migrated compatibility queue family | Comment documents same-track same-buffer coalescing, especially `delay_retrig` followed by clip launch. These three keys now route through `enqueueDspOperation` while preserving FIFO append order on `pendingDefaultSetParams`; direct writes remain for unrelated `applyBankParamImpl` track keys. |
| `sync/ui_clip_edit_ops.mjs` `clearStepImpl` / `doLaneDoubleFillImpl`: `tN_cC_step_X_clear`, `tN_cC_kL_cc_lane_double_fill` | Migrated compatibility queue family | Structural step clear and CC-lane double-fill now route through `enqueueDspOperation` while preserving FIFO append order, optimistic mirrors, active-step note refresh, popup, and redraw behavior. |
| `menu/ui_clear_auto_workflow.mjs` and `input/ui_button_cc_workflow.mjs`: `tN_cc_auto_clear`, `tN_cC_at_clear`, `tN_cC_kL_cc_lane_reset` | Migrated compatibility queue family | Menu clear and Delete+Loop CC-lane reset now route through shared `clearAutomationImpl` / `resetCcLaneImpl` operation boundaries, preserving FIFO append order, CC-before-AT DSP order, JS mirror wipes/resets, popup text, undo flags, and nearby TARP latch behavior. |
| Selected `input/ui_jog_cc_workflow.mjs` automation clear/reset paths | Preserve for reset-gesture audit | Jog reset branches still mix automation clears with FX reset, bake-adjacent state, playback direction/audio-reverse reset side effects, and delayed readbacks. Keep raw until the surrounding reset gestures are characterized. |
| `input/ui_navigation_cc_workflow.mjs` CC lane TPS / loop / res TPS writes | Migrated compatibility queue family | Loop+Up/Down melodic-bank-6 lane geometry changes now route the ordered `cc_lane_tps`, `cc_loop_set`, and optional `cc_lane_res_tps` sequence through `enqueueDspOperation`, preserving FIFO append order and JS mirror updates. |
| `input/ui_jog_cc_workflow.mjs` bake / bake_scene | Semantic operation first | Bake writes have modal state transitions, undo marking, bank refresh, and delayed scene/clip readback. They should become explicit bake operations, not raw queue wrappers. |
| `input/ui_jog_cc_workflow.mjs` playback-dir / audio-reverse resets | Simplification candidate after audit | These are reset side-effects around broader bank reset gestures. Some may not need queue timing if they are independent keys, but they often run next to reset FX and automation clears. Keep raw until grouped by reset gesture and tested. |
| `view/ui_session_view_workflow.mjs` `snap_delete`, `snap_load`, `launch_scene`, `launch_scene_quant`, `merge_place_row` | Semantic operation first; avoid broad migration | These are session/performance commands coupled to UI modal state, mute/solo mirrors, scene buttons, and merge placement. They should be modeled as session operations before any queue migration. |
| `sync/ui_polldsp_workflow.mjs` focused empty clip auto-launch: `tN_launch_clip` | Question before migrating | This is queued from a poll/transport transition to avoid clashing with start behavior, while record-arm auto-launch remains direct. Treat as transport timing, not a generic structural writer. |
| `sync/ui_clip_state_sync.mjs` sidecar restore: `perf_mods` | Question before migrating | This is a post-restore performance-mod replay. It is not a normal user edit and may belong with restore sequencing or direct `sendPerfMods` semantics. |
| `input/ui_transport_cc_workflow.mjs` merge arm/stop/cancel | Semantic operation first; transport/performance path | Merge commands intentionally reconcile through DSP poll state and LEDs. Keep separate from structural DSP queue migration. |
| `drum/ui_drum_repeat_workflows.mjs` / `perform/ui_latch_workflows.mjs` repeat stop/latch and TARP latch sweeps | Preserve queue timing; performance path | All-track or multi-lane sweeps can emit many same-family writes. Queue timing is probably load-bearing, but these should be migrated only inside a repeat/latch operation boundary. |
| `perform/ui_transpose_workflow.mjs` `t0_xpose_apply` | Semantic operation first | Commit/cancel both interact with padmap recompute and preview state. A transpose operation can own ordering; do not mechanically wrap first. |

## Remaining Migration Windows

These windows group the remaining raw queue sites by behavior and risk. Each
window should add focused tests that prove direct DSP writes, queued DSP
operations, FIFO order, mirror updates, and delayed readback behavior as
applicable. Keep migrating one window at a time; do not mechanically wrap
unrelated raw queue producers.

1. Playback direction and audio reverse reset side effects:
   audit the broader reset gestures first, then migrate only the reset-pair
   families for drum lanes and melodic clips.
2. Bake and bake scene:
   model explicit bake operations that own modal state, undo marking, bank
   refresh, and delayed scene/clip readback before queue migration.
3. Session view scene, snapshot, and merge commands:
   model session operations for `snap_delete`, `snap_load`, `launch_scene`,
   `launch_scene_quant`, and `merge_place_row`; treat these as
   session/performance commands, not structural edit writes.
4. Merge arm, stop, and cancel transport path:
   keep separate from session view because poll/LED reconciliation and
   transport state are part of the behavior.
5. Repeat, latch, and TARP latch sweeps:
   add repeat/latch operation boundaries before migrating multi-track or
   multi-lane queued sweeps.
6. Transpose, sidecar restore, and focused empty clip auto-launch:
   clean up the remaining small but semantically odd producers after the
   common operation patterns are established.

## Remaining Family Migration Notes

Use these notes as a pre-flight checklist before migrating any remaining raw
queue family. Each migration should add focused tests before or alongside the
queue-helper change, and should keep unrelated raw queue producers untouched.

### Leaving drum mode

- Owner: `bank/ui_bank_params.mjs` `applyTrackConfigImpl`.
- Migrated queued keys: `tN_active_drum_lane`, `tN_drum_perform_mode`
  now route through `enqueueDspOperation`, backed by
  `S.pendingDefaultSetParams`.
- Keep immediate: `tN_pad_mode=0` must remain a direct `setParam` write.
- Preserve mirror/timing: `S.trackPadMode[t]`, drum-bank fallback state, and
  `S.pendingPadNoteMapRecompute` stay coupled to this operation.
- Tests pin: direct `tN_pad_mode` precedes queued follow-up writes; queued
  follow-up writes append FIFO after existing queued work; active-track
  `S.pendingPadNoteMapRecompute` coupling is preserved; padmap recompute does
  not run while `pendingDefaultSetParams` is non-empty or `clearDrainHold > 0`.
- Out of scope: broader route/padmap self-heal behavior and unrelated track
  config keys.

### Automation and CC lane clears

- Owners: `menu/ui_clear_auto_workflow.mjs`,
  `input/ui_button_cc_workflow.mjs`.
- Migrated queued keys: `tN_cc_auto_clear`, `tN_cC_at_clear`,
  `tN_cC_kL_cc_lane_reset` now route through `clearAutomationImpl` and
  `resetCcLaneImpl`, backed by `S.pendingDefaultSetParams`.
- Preserve mirror/readback: CC automation bit mirrors, aftertouch flags,
  popup state, undo flags, active-bank indicators, and the legacy popup order
  for combined AT+CC clear.
- Tests pin: no direct `setParam`, FIFO append after existing queued work,
  CC-before-AT DSP operation order, mirror wipe/reset before DSP readback, and
  unchanged nearby TARP latch queue behavior.
- Still raw/out of scope: selected `input/ui_jog_cc_workflow.mjs`
  automation-clear reset branches, bake, playback direction resets, and
  repeat/latch TARP sweeps.

### CC lane geometry

- Owner: `input/ui_navigation_cc_workflow.mjs`.
- Migrated queued keys: `tN_cC_kL_cc_lane_tps`, `tN_cC_kL_cc_loop_set`,
  optional `tN_cC_kL_cc_lane_res_tps` now route through
  `enqueueDspOperation`, backed by `S.pendingDefaultSetParams`.
- Preserve mirror/timing: lane length, loop start, TPS/resolution mirrors, and
  ordered multi-write geometry changes.
- Tests pin: no direct writes for the resize branch, FIFO append after
  existing queued work, exact ordered two-key and three-key paths, invalid
  resolution reset write behavior, mirror updates, active-lane redraw behavior,
  and unchanged nearby page-nav resolution direct write behavior.
- Out of scope: unrelated jog-bank resets and automation clears.

### Playback direction and audio reverse resets

- Owner: selected reset branches in `input/ui_jog_cc_workflow.mjs`.
- Raw queued keys: drum-lane `playback_dir` / `playback_audio_reverse` and
  melodic clip `clip_playback_dir` / `clip_playback_audio_reverse`.
- Preserve mirror/timing: associated bank params, reset gesture popup/redraw,
  and any neighboring reset or clear writes in the same gesture.
- Tests to pin: whether queue timing is required when these writes are adjacent
  to FX reset, automation clear, or clip/lane reset operations.
- Out of scope: do not migrate as standalone writes until the surrounding reset
  gesture is characterized.

### Session, scene, snapshot, and merge placement

- Owner: `view/ui_session_view_workflow.mjs`.
- Raw queued keys: `snap_delete`, `snap_load`, `launch_scene`,
  `launch_scene_quant`, `merge_place_row`.
- Preserve mirror/timing: modal/session state, selected scene/clip indices,
  mute/solo or merge mirrors, launch quantization behavior, LEDs, and poll-DSP
  reconciliation.
- Tests to pin: modal state transitions, queued command order, and merge state
  reconciliation through poll state.
- Out of scope: structural clip/row copy paths already delegated to structural
  edit operations. Model these as session operations before queue migration.

### Transport and focused empty clip auto-launch

- Owners: `sync/ui_polldsp_workflow.mjs` and
  `input/ui_transport_cc_workflow.mjs`.
- Raw queued keys: focused `tN_launch_clip`, `merge_stop`, `merge_arm`,
  `merge_cancel`.
- Preserve mirror/timing: transport start behavior, focused empty clip rules,
  record-arm auto-launch differences, merge LEDs, and DSP poll reconciliation.
- Tests to pin: auto-launch only happens on the intended transport transition,
  merge arm/stop/cancel still reconcile via poll state, and direct launch paths
  remain direct where required.
- Out of scope: do not merge with structural clip launch/select behavior.

### Restore and sidecar replay

- Owner: `sync/ui_clip_state_sync.mjs`.
- Raw queued keys: `perf_mods`; sidecar restore may replace
  `S.pendingDefaultSetParams` wholesale to prepend restore writes.
- Preserve mirror/timing: restore ordering, performance mod replay, sidecar
  state, and post-load DSP sync behavior.
- Tests to pin: restore replay order when the queue already contains work, and
  whether replacement of the backing queue is intentional for that path.
- Out of scope: normal performance-mod LED writes and user-edit queues.

### Repeat, latch, and TARP sweeps

- Owners: `drum/ui_drum_repeat_workflows.mjs` and
  `perform/ui_latch_workflows.mjs`.
- Raw queued keys: repeat groove reset, repeat latched/stop keys,
  repeat2 stop/lane-off keys, and `tN_tarp_latch`.
- Preserve mirror/timing: performance latency, all-track or multi-lane sweep
  ordering, latch UI state, and low-latency direct repeat writes.
- Tests to pin: sweep order, no-op gating when nothing is latched, and separation
  between queued sweep writes and direct performance writes.
- Out of scope: do not migrate repeat pad/aftertouch/rate writes through this
  compatibility queue.

### Transpose preview commit/cancel

- Owner: `perform/ui_transpose_workflow.mjs`.
- Raw queued keys: `t0_xpose_apply`.
- Preserve mirror/timing: preview state, cancel/commit branching, padmap
  recompute, popup/redraw, and active bank state.
- Tests to pin: commit and cancel payloads, preview cleanup, queue order after
  existing work, and padmap recompute behavior.
- Out of scope: do not touch TARP, scale, or unrelated performance paths.

Recommended next order:

1. Before touching leaving-drum-mode, add tests around queue-empty padmap recompute and same-track ordering.
2. Defer session, transport, live merge, repeat/latch, transpose, and bake paths until each has a semantic operation boundary.

## Safest First Compatibility-Migration Candidate

The safest first candidate is the existing `pendingDefaultSetParams` drain itself, scoped to the structural clip edit family in `sync/ui_clip_edit_ops.mjs`, especially `clearClipImpl` / `hardResetClipImpl`.

Why this candidate is safest:

- It already uses a queue-shaped contract: `{ key, val }` entries drained by `runDefaultSetParamDrain`.
- It has explicit comments documenting coalescing behavior, `unshift` priority, and `clearDrainHold`.
- It is DSP-affecting structural edit behavior, matching the approved first-wave scope.
- It already centralizes undo marking, optimistic mirror updates, delayed melodic readback, and drum resync scheduling in a small set of functions.
- It is not the live-note or recording path, so a compatibility migration can avoid the most latency-sensitive drains.
- It is not co-run, route remap, pad dispatch, or transport start/stop, all of which have broader hardware ownership interactions.

The migration compatibility requirement for this candidate is strict: preserve `push` versus `unshift`, one-per-tick drain order, `clearDrainHold`, suppression during `pendingSetLoad` / `pendingDspSync`, and the delayed readback flags exactly.
