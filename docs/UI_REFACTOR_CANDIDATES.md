# UI Refactor Candidates

This audit ranks larger `ui/ui.js` refactor opportunities by runtime concept,
testability, and risk. The goal is not smaller files by itself, but deeper
modules whose interfaces improve locality and leverage.

## Current Size Map

As of this audit, `ui/ui.js` is 9,563 lines. The largest functions are:

| Lines | Function | Main concept pressure |
| ---: | --- | --- |
| 977 | `_tickImpl()` | Tick Pipeline, Deferred Queue, recording drains, persistence, LED/render invalidation |
| 787 | `_onCC_knobs()` | Parameter Page edit behavior, CC automation, drum-lane page edits |
| 755 | `_onCC_jog()` | Modal workflow commits, menu dispatch, Parameter Page navigation, Loop-held edits |
| 459 | `_onCC_transport()` | transport, recording, playback, loop/perf modifiers |
| 402 | `_onStepButtons()` | Session View workflow, Track View step edit, Loop gesture, shortcuts |
| 391 | `_onCC_buttons()` | mode buttons, copy/delete/mute/shift state, view switching |
| 347 | `pollDSP()` | DSP Mirror refresh and host read ordering |
| 311 | `_onPadPress()` | Session View and Track View pad dispatch |
| 282 | `buildGlobalMenuItems()` | Global menu workflow and live-preview actions |
| 278 | `_onPadRelease()` | live note release, step release, recording, perf mode |
| 227 | `_onMidiInternalImpl()` | MIDI dispatch routing and modal/touch prefilters |
| 226 | `_onCC_stepedit()` | step-edit write behavior |
| 147 | `_onPadPressTrackView()` | Pad Surface routing and drum workflows |
| 123 | `readBankParams()` | Parameter Page DSP Mirror reads |
| 121 | `restoreUiSidecar()` | UI Sidecar restore and Track / Clip Sync reconciliation |

The remaining extraction opportunity is therefore mostly workflow and ordering
logic, not OLED presentation.

## Refactor Strategy

Use two tracks:

- **Characterization first** for runtime behavior. Before moving code, add tests
  that pin the current externally visible behavior through the same seam the new
  module will expose.
- **Thin adapter second**. `ui.js` should keep host globals, shared legacy state,
  and existing priority routers as adapters until the new module earns more
  ownership.
- **One concept at a time**. Avoid introducing a generic input handler or bank
  helper. A module earns depth only when deleting it would push rules back into
  multiple callers.

Good test seams for larger moves:

- fake `host_module_set_param`, `host_module_get_param`, and
  `shadow_send_midi_to_dsp`;
- fake LED functions and render invalidation callbacks;
- direct mutation of `S` mirrors before a workflow call;
- output assertions on queued `pendingDefaultSetParams` and pending readback
  flags.

## Ranked Candidates

### 1. Parameter Page Behavior

**Files**

- `ui/ui.js`: `_onCC_knobs()`, `readBankParams()`, `applyBankParam()`,
  `bankHasAltParams()`, `altIndicatorActive()`, related reset helpers
- `ui/render/ui_parameter_page_render.mjs`
- `ui/ui_bank_chrome_render.mjs`
- `ui/ui_constants.mjs`
- `tests/render/parameter-page-render.test.ts`

**Problem**

Parameter Page presentation is now mostly extracted, but behavior is still one
of the largest and riskiest areas. `_onCC_knobs()` encodes many unrelated
Parameter Page rules:

- melodic generic bank edits;
- drum DRUM LANE bank special cases;
- drum ALL LANES bank special cases;
- CC automation bank assignment, recording, audition, resting values, and
  delete-clear;
- alt-mode labels and write behavior;
- knob sensitivity, locks, acceleration, and one-shot actions;
- DSP writes plus JS mirror updates plus pending readback flags.

The current interface is implicit: callers must know `S.activeBank`,
`S.trackPadMode`, `S.altMode`, `S.deleteHeld`, `S.recordArmed`, clip/lane
mirrors, and host write timing. That is shallow because the rules are only
testable by sending broad MIDI CC events through `ui.js`.

**Solution**

Create a **Parameter Page** behavior module that owns knob-turn classification
and edit application for one knob event. Start with one sub-slice, not the whole
function:

1. CC automation bank behavior, because it is cohesive and has distinct rules.
2. Drum ALL LANES behavior.
3. Drum DRUM LANE behavior.
4. Generic melodic bank behavior.

Keep `ui.js` as the adapter that passes host write functions, popup/redraw
callbacks, and the current `S` object.

**Benefits**

- **Locality**: Parameter Page write rules move next to the page concept instead
  of being spread across `_onCC_knobs()`, `applyBankParam()`, and render
  conditionals.
- **Leverage**: focused tests can cover one knob event with small state fixtures
  instead of full MIDI dispatch.
- **TDD path**: characterize CC bank cases first:
  - alt turn changes type/assignment and honors patched Schwung availability;
  - delete turn clears automation and resting value;
  - armed turn records automation;
  - playing automated lane auditions live only;
  - stopped lane changes resting value including the `--` floor.

**Risk**

High. This touches DSP writes and coalescing-sensitive mirror updates. Move in
small behavior slices with exact output tests.

### 2. Recording Workflow

**Files**

- `ui/ui.js`: `disarmRecord()`, `handoffRecordingToTrack()`,
  `recordNoteOn()`, `recordNoteOff()`, `_tickImpl()`, `_onPadRelease()`,
  `_onMidiExternalImpl()`, `_onCC_transport()`
- `ui/ui_tick_tasks.mjs`
- `web/tests/integration/tool.test.ts`
- `web/tests/integration/behaviour.test.ts`

**Problem**

Recording behavior crosses transport, pad release, external MIDI, Tick Pipeline
drains, drum note queues, count-in cancellation, scheduled stops, and track
handoff. The state is spread through many fields:

- `recordArmed`, `recordCountingIn`, `recordArmedTrack`;
- `_recordingNoteTrack`, `_drumRecNoteOns`, `_drumRecNoteOffs`;
- `pendingPrerollNote`, `pendingPrerollNotes`, `pendingPrerollToggleQueue`;
- `recordScheduledStop`, `pendingScheduledDisarm`;
- per-track drum resync flags.

The current seam is too wide: tests must reproduce pad/transport/tick ordering
to check one Recording Workflow rule.

**Solution**

Create a **Recording Workflow** module that owns recording state transitions and
recording note queues. The first interface should be narrow and imperative:

- arm/disarm/handoff;
- enqueue melodic note-on/off;
- enqueue drum note-on/off;
- drain recording queues from the Tick Pipeline.

Keep the Tick Pipeline ordering in `ui.js` or `ui_tick_tasks.mjs` initially; the
new module should provide one drain function used from the existing phase.

**Benefits**

- **Locality**: count-in cancellation, note queue matching, drum recording
  resync, and disarm cleanup live together.
- **Leverage**: tests can simulate note events and one tick drain without full
  MIDI dispatch.
- **TDD path**:
  - disarm during count-in sends cancel but not recording off;
  - disarm during active recording sends track recording off;
  - track handoff clears note matching and toggles old/new recording flags;
  - melodic note-on/off pairs drain in order;
  - drum note-on/off queues mark lane resync after drain.

**Risk**

High, but the module has a strong deletion test: deleting it would spread
recording rules back into transport, pad release, external MIDI, and tick code.

### 3. Session View Workflow

**Files**

- `ui/ui.js`: `_onStepButtons()`, `_onPadPress()`, `_onCC_side()`,
  `_onCC_buttons()`, session branches of `_onPadRelease()`
- `ui/ui_scene.mjs`
- `ui/ui_session_overview_render.mjs`
- `ui/ui_perf_render.mjs`
- `web/tests/integration/behaviour.test.ts`

**Problem**

Session View behavior is conceptually separate from Track View, but its rules
are scattered:

- scene launch and scene row navigation;
- step buttons as scene launchers, scene-bake picker targets, merge placement,
  mute snapshot slots, and performance preset slots;
- side buttons selecting/revealing clips;
- Delete/Copy/Cut/Mute modifiers;
- Performance OLED takeover and looper/performance modifier state.

The current `ui.js` handler shape makes it difficult to see which Session View
workflow wins when modifiers overlap.

**Solution**

Create a **Session View** workflow module that receives normalized input events
from `ui.js`:

- step press/release;
- pad press/release;
- side button press;
- jog/scene row movement later if useful.

Start with step-button behavior because `_onStepButtons()` has a clear
Session View branch and focused state transitions.

**Benefits**

- **Locality**: Session View modifier priority becomes explicit in one module.
- **Leverage**: tests can assert queued DSP commands and state transitions for
  scene launch, snapshot recall/save, scene-bake picker selection, and perf
  preset clear/recall.
- **TDD path**:
  - Delete+step clears perf preset versus mute snapshot depending on mode;
  - scene-bake picker step opens confirm with selected scene;
  - merge placement queues `merge_place_row`;
  - Shift+step dispatches shortcut and does not launch scene;
  - plain step queues `launch_scene`;
  - perf step release toggles recalled preset.

**Risk**

Medium. Mostly input workflow and queued commands, but it touches performance
looper state and snapshots. Keep host writes behind deps.

### 4. Step / Loop Gesture Workflow

**Files**

- `ui/ui.js`: `_fireLoopWindowSet()`, `_fireLoopWindowSetCC()`,
  `_loopGestureCtxFor()`, `_resolveLoopGesture()`, loop branches in
  `_onCC_jog()`, `_onStepButtons()`, `_onPadRelease()`
- `ui/ui_loop_render.mjs`
- `web/tests/integration/loop-render.test.ts`

**Problem**

Loop-held behavior now has a good render module, but the edit behavior is still
split across jog turns, step presses, step releases, and pad releases. It owns
several invariants:

- melodic clip, drum lane, ALL LANES, and CC lane loop contexts;
- A/B step window gestures;
- length-only fallback on release;
- page clamping and manual-length flags;
- active recording blocks length edits.

The current seam is not obvious because loop behavior is embedded inside
generic button handlers.

**Solution**

Create a Step / Loop gesture module. This concept is not yet named in
`CONTEXT.md`; if selected, either add a glossary term or fold it under Track
View if the name does not earn its keep.

**Benefits**

- **Locality**: all loop window state and page-clamping rules live together.
- **Leverage**: tests can exercise A/B tap gestures and jog length edits without
  full CC/pad routing.
- **TDD path**:
  - first Loop+step arms context without writing;
  - second step writes packed range with sorted A/B;
  - release fallback preserves legacy length behavior;
  - CC bank uses CC lane loop keys and TPS conversion;
  - active recording suppresses writes.

**Risk**

Medium-high. The behavior is isolated but user-facing and timing-sensitive.

### 5. Modal Workflow State

**Files**

- `ui/ui.js`: `draw*` modal wrappers, `_onCC_jog()` modal commit/rotate
  branches, snapshot/inherit/clear-auto helpers
- `ui/ui_modal_render.mjs`
- `ui/ui_prompt_render.mjs`
- `ui/ui_persistence.mjs`
- `web/tests/integration/modal-render.test.ts`

**Problem**

Modal presentation is extracted, but modal workflow state remains heavily mixed
into jog handling:

- inherit picker;
- snapshot picker;
- clear automation menu;
- bake and scene-bake confirms;
- state wipe, record blocked, Lgto, transpose confirms;
- global menu sub-confirms.

The presentation module is now deep enough for rendering, but workflow commits
still live in a large `if` chain.

**Solution**

Move one modal workflow at a time behind a module interface. Start with
snapshot picker or clear automation because they already have helper functions
and self-contained state.

**Benefits**

- **Locality**: modal rotate/click/open/close behavior sits next to its state
  shape and renderer.
- **Leverage**: tests can call workflow functions directly and assert state
  transitions plus queued commands.
- **TDD path**:
  - snapshot rotate wraps over manifest entries;
  - snapshot click arms confirm or queues load/save;
  - clear automation toggles rows and queues the right clear commands;
  - Back/cancel paths restore editing state.

**Risk**

Medium-low for individual modals. Avoid a generic modal dispatcher until at
least two workflows share a real interface.

### 6. Move Co-Run Workflow

**Files**

- `ui/ui.js`: `enterSchwungCoRun()`, `exitSchwungCoRun()`,
  `enterMoveNativeCoRun()`, `exitMoveNativeCoRun()`, co-run branches in
  `drawUI()`, `_onStepButtons()`, `_onPadRelease()`, `_tickImpl()`
- `ui/ui_sound_edit.mjs`
- `ui/ui_tick_tasks.mjs`

**Problem**

Move Co-Run is a distinct runtime mode, but ownership rules are spread across
display, LED, input, tick, and sound-edit entry paths. It has a strong concept:
dAVEBOx cedes selected hardware behavior to Move firmware while preserving
enough UI Runtime state to return safely.

**Solution**

Create a **Move Co-Run** workflow module that owns enter/exit state transitions
and input swallowing policy. Keep host capability checks and actual host calls
passed as deps.

**Benefits**

- **Locality**: OLED ownership, LED freezing, exit affordance, and pass-through
  cleanup rules live together.
- **Leverage**: tests can pin entry/exit cleanup without involving unrelated
  Track View or Session View handlers.
- **TDD path**:
  - enter chain-edit stores slot and masks hardware groups;
  - enter Move-native stores track and clears conflicting state;
  - Step 3 exits and other steps are swallowed;
  - pad release sends Move note-off only for the tracked held drum pad;
  - exit restores UI state and redraw flags.

**Risk**

Medium. Hardware integration is sensitive, but the concept is isolated and has
clear state transitions.

### 7. Tick Pipeline Deepening

**Files**

- `ui/ui.js`: `_tickImpl()`, `pollDSP()`
- `ui/ui_tick_tasks.mjs`
- `ui/ui_clip_track_sync.mjs`

**Problem**

`_tickImpl()` is still the largest function. It owns many phases: host polling,
DSP Mirror reads, pending write drains, recording drains, state-load settle,
LED tasks, persistence, splash/render invalidation, and error capture. Some
helpers exist, but the caller still has to know a lot about ordering.

**Solution**

Do not attack the full function at once. First write an explicit Tick Pipeline
phase list in code or docs, then move one phase at a time behind deeper modules
that already own the concept. Examples:

- recording queue drains into Recording Workflow;
- UI Sidecar save/name-index/prune into UI Sidecar workflow;
- remaining read-only mirror refreshes into Track / Clip Sync only when the
  deletion test holds.

**Benefits**

- **Locality**: load-bearing ordering gets documented and tested per phase.
- **Leverage**: tests can run one phase with fake deps rather than a full tick.

**Risk**

Highest. Treat this as the slow path. Improve it by extracting concept-owned
phases, not by creating a generic tick runner too early.

## Recommended Next Move

Do not pick solely by line count. The best next larger slice is:

1. **Session View Workflow** if the goal is medium-risk progress and a clear
   TDD path.
2. **Recording Workflow** if the goal is highest architectural leverage.
3. **Parameter Page Behavior** if the goal is maximum `ui.js` reduction, with
   the understanding that it must proceed in small, exact behavior slices.

My recommendation: start with **Session View Workflow: step-button behavior**.
It is large enough to change the shape of `ui.js`, has a strong test seam, and
does not immediately enter the highest-risk coalescing paths.
