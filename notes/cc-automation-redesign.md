# CC automation redesign: per-clip "clip CC" resting value + recorded automation

## Context

Started as a bug fix (holding a step on the CC PARAM bank shows the live knob value, not the
value recorded at that step) and grew, by design, into a coherent rework of CC automation on
the CC PARAM bank (bank 6, melodic tracks).

The core idea: each melodic **clip** has 8 CC lanes (one per knob). A lane holds recorded
**automation** (already per-clip) plus a per-clip **resting value** ("clip CC") that the lane
falls back to. The resting value is **opt-in**: default is **"—" (unset = send nothing)**.
Recorded automation overrides the resting value where it exists; at loop boundaries the lane
ramps back to the resting value (if set). This replaces today's per-track manual CC value and
the interpolate-and-hold edges.

Today's relevant facts (verified):
- Knob→CC **assignment** is per-track (`cc_assign`, `seq8.c` / `t%dcca%d`) — **stays per-track**.
- The manual value is per-track (`cc_live_val` DSP `seq8.c:606`; `trackCCVal` JS) — **moves to per-clip**.
- Automation is per-clip (`clip_cc_auto[NUM_CLIPS]`, `seq8.c:599`; bitmask read
  `t%d_c%d_cc_auto_bits` `seq8.c:7555`; JS re-reads per clip on clip switch). Cap
  `CC_AUTO_MAX_POINTS=64` (`seq8.c:180`). Recording snaps to 1/32 (12-tick grid,
  `seq8_set_param.c:2405`).
- Playback interpolates between points and **holds** at the edges (`seq8.c:8254-8273`), emits on
  change (`8276`). State is **JSON text** (`seq8.c:1314`/`1576`) → struct growth needs **no wipe**.

## The model (behavior — implement to match this)

Per lane (clip + knob), let `rest` = the resting value (`0..127`, or **unset = "—"**), and let the
recorded automation points define "runs". `anchor` = the value at the loop boundary = the real
point at loop_start if the first step is automated, otherwise `rest`.

**Playback output at the playhead:**
- Inside a run (between/at recorded points): interpolate as today.
- Head (before first point) / tail (after last point) / fully-empty lane:
  - `rest` **set** → ramp (head: `anchor`→first point; tail: last point→`anchor`; empty:
    constant `anchor`). Full-span ramp; the loop becomes a seamless closed curve that resets to
    the resting value each cycle.
  - `rest` **unset ("—")** → **send nothing** (receiver holds last value; loop carries over) =
    today's behavior. So the ramp/reset is purely opt-in.
- Emission gated on change (`cc_auto_last_sent`); reset that to `0xFF` on transport **play** so
  values reliably re-assert at the playhead.

**Display value per knob** (the "—" rule, fully consistent = "no value defined here"):
- **Stopped** → the lane's `rest` value, or **"—"** if unset.
- **Playing/recording** → the value *defined* at the playhead (automation / ramp / `anchor`),
  or **"—"** where nothing is defined (unset-anchor gap/tail/head, or empty lane).
- **Holding a step** (step editor) → the value recorded at that step, or **"—"** if no point.

**Setting / clearing the resting value (knob turn, not holding a step):**
- The knob's value range gains a floor: **"—", 0, 1 … 127**. Turn **down past 0 → "—"** (clear
  resting value, send nothing); turn up from "—" → 0,1,… (set). Sends live as you turn.
- **Stopped** → turning sets the active clip's `rest` (any lane).
- **Playing, not armed, lane has NO automation** → turning sets `rest` (live convenience).
- **Playing + armed** → records automation (unchanged).
- **Playing, not armed, lane HAS automation** → transient live audition only (does **not** touch
  `rest`, to avoid colliding with auditioning).

**Resets → "—"** (clear automation *and* resting value): CC-bank Delete+jog, Clear Session,
hard-reset clip/scene, **and Delete+turn** (per-knob: clears that knob's automation + `rest`).

## Changes

### 1. DSP data (`dsp/seq8.c`)
- `CC_AUTO_MAX_POINTS` 64 → **1024** (`:180`). All uses reference the macro (`:187-188, 1588,
  5860`; `seq8_set_param.c:2487`) → scale automatically. +~2.8 MB RAM total; text state stays
  compatible (no wipe).
- Add **`uint8_t rest_val[8]`** to `cc_auto_t` (`:186-189`); `0xFF` = unset ("—"). +8 bytes/clip.
- Serialize sparse: emit `rest_val[k]` when `!= 0xFF` (in the per-clip CC block `:1314-1328`,
  e.g. key `t%dc%dcr%d`); load it in the per-clip CC loader (`:1576-1599`). Default `0xFF` on
  `clip_init`/load.

### 2. DSP playback (`dsp/seq8.c:8236-8295`)
- Rework the per-knob output to the **model** above: compute `anchor` (real loop_start point
  else `rest_val[k]`); interpolate runs; head/tail/empty ramp to `anchor` when set, else emit
  nothing. Keep emit-on-change.
- Capture the **defined value** into `cc_auto_cur_val[8]` (new per-track field; `0xFF` = "—")
  **before** the recording emit-suppress `continue` (so a knob being recorded still reports the
  value being written). Used by the display.
- Loop-wrap is handled implicitly by the anchor (the closed curve), but reset behavior relies on
  the head ramp; ensure per-track loop-window wrap is reflected in `_ct` as today.

### 3. DSP handlers (`dsp/seq8.c`, `dsp/seq8_set_param.c`)
- **Re-assert on play** (`seq8_set_param.c:272-300`): `memset cc_auto_last_sent = 0xFF` for each
  track so play re-asserts the playhead value.
- **New read** `t%d_c%d_cc_auto_at_<t1>_<t2>` (`seq8.c` near `_cc_auto_bits` ~`:7561`): 8 values,
  per knob = first recorded point in `[t1,t2]` else `-1`. Seeds the step editor.
- **New read** `t%d_cc_cur_vals` (mirrors `cc_live_vals` `:7194`): returns `cc_auto_cur_val[0..7]`
  (`-1`/`255` = "—") for the realtime display.
- **New read** `t%d_c%d_cc_rest` (or fold into an existing per-clip read): returns `rest_val[0..7]`
  so JS mirrors the resting values on clip switch.
- **Resting-value set/clear**: route the existing `cc_send` path (`seq8_set_param.c:2388`) so that
  when **stopped** (or playing+unautomated), it writes `clip_cc_auto[active].rest_val[k]` (0xFF
  for "—"), marks `state_dirty`. (cc_send already transmits live + holds the value.)
- **Flat-hold step write** (`cc_auto_set2` `:2452`, sole caller is step-edit): add
  `cc_auto_clear_range(a,k,t1,t2)` (drop points in `[t1,t2]`) before writing both endpoints, so a
  step edit is a clean flat value with no stray interior points.
- **Resets → "—"**: in `cc_auto_clear` (`:2494`) and `cc_auto_clear_k` (`:2476`) also set the
  affected `rest_val` to `0xFF`.

### 4. JS state + reload (`ui/ui_state.mjs`, `ui/ui.js`)
- Replace per-track `trackCCVal[t][k]` with **per-clip** `clipCCVal[t][c][k]` (the resting value;
  `-1` = "—"). Add `ccStepEditSet[8]` (drives "—" vs value in the step editor).
- Reload `clipCCVal` for the active clip on clip/track switch via the **same hook** that re-reads
  `trackCCAutoBits` (`ui.js:2472`) — read `cc_rest`. Restored from saved state (DSP-side).

### 5. JS gestures (`ui/ui.js`)
- **Knob turn** (`_onCC_knobs` CC branch `:7649-7701`): implement the set/clear rules above —
  value range floor at "—" (down past 0 → -1; up from -1 → 0); **stopped or (playing & lane
  un-automated)** → set active clip `rest` via `cc_send`; **playing & armed** → record (unchanged);
  **playing & automated & un-armed** → transient live only. Unify the step-edit write to a single
  owner (`_onCC_stepedit` `:7126`) so it isn't double-written by `_onCC_knobs` (today both fire
  via `_onCCMsg` `:7927`); guard the `_onCC_knobs` normal-turn during step-hold.
- **Delete+turn** (`:7652-7660`): also clear that knob's `rest` → "—" (it already clears
  automation).
- **Resets** (`:5841-5860` CC-bank Delete+jog; `doClearSession`; hard resets `:7021/7026/8665`):
  set clip CCs to **"—"** (not `0`). Broad FX reset (`:5812`) — include CC only if it already
  covers the CC bank (verify; mirror the ARP-IN exclusion choice).

### 6. JS display (`ui/ui.js`)
- **Overview** (`:3633`): per knob — stopped → `clipCCVal` (active clip) or "—"; playing → poll
  `cc_cur_vals` (alongside the existing `cc_live_vals` poll `:4794`) and show it or "—".
- **Step editor** (`:3339-3352`, value at `:3350`): seed from `cc_auto_at` (Part read); show the
  recorded value or "—" (`ccStepEditSet`); first knob-turn writes from the lane's value at that
  step (resting value if set, else 0) and flips "—"→value.

### 7. CC bank as a visual step-automation editor (was candidates #1-3)
- **Persistent CC OLED** (`ui.js:3476-3479`): add `(bank === 6 && !S.sessionView)` to the
  overview gate so the CC view stays up the whole time you're on the bank, instead of reverting
  to the track overview after the ~2 s bank-select timeout (`inTimeout`).
- **Active lane** = last-touched CC knob, **persistent** (new `S.ccActiveLane[t]`, set on knob
  touch, does NOT time out like `knobTouched`). Its overview cell is **always highlighted**, and
  it selects which lane the step-LED breakpoints show.
- **Step-LED value gradient** (CC bank): render the **active lane's** automation across step LEDs
  16-31 (current page) as **value→brightness in WHITE, 6 levels** with a *perceptual*
  ramp: **"—" (no value) = off**; **value 0 = dim floor** (visible, distinct from off); up to
  value 127 = full. **Playhead pad = track color** (overrides the gradient on that pad). Pages like
  the note view (out-of-window = DarkGrey). [AS-BUILT NOTE: original draft said track-color gradient
  + white playhead; flipped per user — white gradient needs no track-RGB table, playhead is a plain
  named track color.] Needs **6 scratch palette slots** (white at 6 brightnesses) — using 59-64.
  Brightness is **static during playback** (write the 6 palette entries only on bank-entry/track
  change, not per tick; only the track-color playhead moves) → SysEx budget fine. Data: new get_param
  `t%d_c%d_cc_step_vals_<page>` returning the active lane's 16 step **output values** for the page
  (via the shared output-value helper, so it includes ramps/anchor; `0xFF` = "—"). Render in the
  CC-bank branch of `updateStepLEDs` (`ui_leds.mjs`). Start at **6 levels**; can raise later if
  more safe slots are confirmed on device.
- **Computed value in step editor** (#1): when holding a step, also show the **interpolated/
  output value** the lane produces at that step (from the playback value helper, via a get_param
  evaluating at the step's tick). Unset ("—") steps show the computed value in a distinct style
  (e.g. parenthesized/dim) so the cell conveys both "no set point" and "what plays here"; set
  steps show the point value. (Exact layout TBD.)
- **Single-step clears** (#2): while holding a step —
  - **turn a knob down past 0 → "—"** clears *that knob's* point(s) in the step window
    (`cc_auto_clear_range`);
  - **Delete + step** clears *all knobs'* points within that step (whole-step wipe). Add to the
    step-button press handler, gated on `bank === 6` (distinct from note/drum Delete+step).
  Neither touches the per-lane resting value (that's Delete+turn / bank resets).

### 8. Per-knob continuous-MIDI type (CC + aftertouch) — 7-bit
Generalize the bank from "CC only" to a continuous-modulation bank. Add a per-track per-knob
**type** (`cc_type[8]`: 0 = CC, 1 = Channel Pressure / mono aftertouch). Both are 7-bit unipolar
(0-127) so storage, automation, resting value, "—"/floor, and the gradient are unchanged — only
the **send encoding** and the **label** differ.
- **DSP:** add `cc_type[8]` per track; serialize sparse; in the send path (`cc_send` and the
  playback emit) branch on type — CC → `0xB0|ch, cc_assign[k], v`; Channel Pressure →
  `0xD0|ch, v` (2-byte; ensure the sender handles message length). `cc_assign[k]` is used only
  for type CC.
- **JS:** mirror `clipCCType`/track-level type; **assignment UI** — Shift+turn picks the **type**
  (and, for CC, the number); label shows `C74` (CC) vs `AT` (aftertouch). Persist with the set.
- Designed so a future **Pitch Bend** type (next milestone) slots in as another type value.

## Critical files
- `dsp/seq8.c` — cap; `rest_val`/`cc_auto_cur_val` fields; serialize/load; playback rework +
  shared output-value helper; `cc_auto_clear_range`; new get_params (`_cc_auto_at_`,
  `_cc_cur_vals`, `_cc_rest`, `_cc_step_vals_<page>` (active-lane 16 step output values),
  value-at-tick for the step editor).
- `dsp/seq8_set_param.c` — play re-assert (`:272`); `cc_send` writes `rest_val` when stopped/
  un-automated (`:2388`); `cc_auto_set2` flat-hold+clear-range (`:2452`); resets clear `rest_val`
  (`:2476/2494`); whole-step clear handler for Delete+step.
- `ui/ui.js` — knob-turn rules, "—" floor, Delete+turn, resets (`:5841` etc.), display
  (`:3633`/`:3350`), step-edit seed (`:5183`), poll (`:4794`); **persistent CC OLED gate**
  (`:3476`); `S.ccActiveLane` (set on knob touch, always-highlighted); **Delete+step** + step
  turn-to-"—" in the step-button handler.
- `ui/ui_leds.mjs` — CC-bank step-LED breakpoint view (active lane's points + playhead).
- `ui/ui_state.mjs` — `clipCCVal[t][c][k]`, `ccStepEditSet[8]`, `ccActiveLane[8]`.

## Build / deploy
DSP change → `./scripts/build.sh && ./scripts/install.sh`; `nm -D dist/davebox/dsp.so | grep
GLIBC` ≤ 2.35; reboot Move. **No state wipe** (text format; struct growth is compatible).
CHANGELOG `### Fixes` + `### Features` entries; update MANUAL (CC bank behavior is user-visible).

## Verification (on device, plain hands-on)
1. **Held-step shows recorded value:** record CC automation across some steps; hold a recorded
   step → its recorded values show; hold an un-recorded step → "—".
2. **Step edit = flat hold:** record a knob sweep through a step, then step-edit that step → it
   plays a flat value across the step (no ramp), display matches; re-hold → same value.
3. **Resting value + loop ramp:** set a knob's clip CC (turn while stopped), automate it to move
   mid-clip → on loop, the CC eases back to the resting value each cycle; with the resting value
   **unset ("—")** it does NOT reset (carries over).
4. **"—" everywhere consistent:** an empty lane reads "—" stopped, playing, and record-armed.
5. **Turn-down-to-"—":** turn a knob below 0 → "—" (stops asserting); turn up → sets again.
6. **Play-time set on empty lane:** while playing (not armed), turn a knob with no automation →
   its resting value sticks; on an automated lane the same turn only auditions.
7. **Resets:** CC-bank Delete+jog, Delete+turn (per knob), Clear Session, hard-reset clip → the
   affected clip CCs read "—".
8. **Persistence:** set clip CCs, save+reload the set → restored and asserted at play.
9. **Capacity:** continuous sweep across a long clip (e.g. 256 steps @ 1/8 = 32 bars) plays back
   across the whole clip (no drop after ~2 bars).
10. Per-clip: switching the focused clip shows that clip's CC values; assignments stay per-track.
11. **Persistent CC OLED:** sit on the CC bank doing nothing → the CC view stays up (doesn't
    revert to the track overview after ~2 s).
12. **Active lane + gradient:** touch a knob → that lane's cell stays highlighted and its
    automation shows on the step LEDs as a 6-level track-color **brightness gradient** ("—"=off,
    value 0 = dim floor, 127 = full), with the **white** playhead overriding; touch another knob
    → highlight + gradient follow. The gradient holds steady as the playhead moves.
13. **Step editor computed value:** hold a step in a ramp/gap → the cell shows the interpolated
    value (distinct style for unset), so you see what plays there even with no point.
14. **Single-step clears:** hold a step, turn a knob down past 0 → that knob's point at the step
    clears to "—"; Delete+step → all knobs' points in that step clear.
15. Drum tracks / other banks unchanged.

## Parked for later — next-milestone queue (NOT in this build)
Order: (a) Pitch Bend → (b) per-lane loop length → (c) interior baseline.

**(a) Pitch Bend (14-bit modulation)** — the immediate next milestone after this ships. Adds a
`cc_type` value for PB. Requires: **16-bit value storage** (uint8→uint16 across `cc_auto`'s
`vals`/`rest_val`/`cur_val` + handlers — localized, ≈+1 MB RAM); **bipolar display** (center
8192 neutral; the unipolar "value 0 = dim floor" rule replaced by a center-relative gradient);
**send** `0xE0|ch, lsb, msb`; **one PB per channel** → assignment UI limits PB to a single knob
per track; **center-snap** UX for hitting 8192 with a continuous knob. Everything else (per-clip
automation, resting value, loop ramp, gradient mechanics, "—") carries over unchanged.

**(b) Per-lane loop length (automation polymeter)** — after PB. Each CC lane
gets its own loop length independent of the note loop. Precedent: drum lanes already do this
(`drum_current_step[lane]`, per-lane `loop_start`/`length`). CC lanes mirror it — per-lane length
storage, an independent phase counter (not the note playhead), points in the lane's own tick
space, recording at the lane's wrapped position, per-lane loop boundary for the ramp/anchor.
Touches storage, playback, recording, display; ~scale of the core redesign. Will be much cleaner
on top of the per-clip lane structure this build introduces.

**(c) True interior baseline / step-grid.** This build resets to the resting value only at loop
boundaries (head/tail ramp). A fuller model would let the resting value fill *interior* gaps
between sparse runs (needs a gap threshold ~1/32 to tell a continuous gesture from a true gap)
and could become a pure step grid. Decision notes retained; revisit if interior gap behavior is
wanted.

## Open items (resolved)
- Broad FX reset (`ui.js:5812`): **clear clip CCs if it already covers the CC bank** (confirmed).
- Step-editor first-turn base on an empty step: **resting value if set, else 0** (confirmed).

(Former candidates #1-3 are now committed — see Changes section 7. #4 is parked below.)
