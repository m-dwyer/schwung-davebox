# CC automation latch recording + collinear decimation

## Context

dAVEBOx records per-clip CC automation on the AUTOMATION ("AUTO") bank (bank 6,
melodic tracks). Today's model is **touch/punch**: a knob writes an automation
point only while it is actively being turned (`cc_send` per detent) or physically
held (`cc_touch_held` render-path write per 1/32). Everywhere the playhead moves
without the knob moving, the **existing** automation is left intact.

This redesign replaces that with a **latch overwrite** model — the standard DAW
"latch" automation behavior — plus automatic point cleanup so long recordings stay
cheap and the stored curve carries no redundant breakpoints.

A separate, already-shipped fix (branch `cc-record-clobber-fix`, this session)
corrected `cc_auto_cur_val` being captured from the playhead eval during recording,
which clobbered the JS accumulator base. This spec builds on top of that fix.

## Model (implement to match)

1. **Latch engages per knob, on first turn — not on touch.** While the track is
   record-armed and the transport is playing, the instant a knob is *turned* it
   latches (the per-detent `cc_send`). Merely **touching** a knob does nothing —
   the old "write while physically held" touch-record path is removed entirely.
   Before the first turn, the knob's existing automation plays untouched. A knob
   never turned during the pass is never overwritten — it just plays back.

2. **Continuous overwrite along the playhead.** Once latched, the knob stamps its
   *current* value (0–127) onto the clip at each 1/32 step the playhead crosses,
   **replacing** any automation already in that step — whether or not the knob is
   still turning. Stop turning and it keeps writing the last value, so the lane
   flattens to it loop over loop.

3. **Starts from what's playing.** The first turn seeds the latch value from the
   value currently sounding at that spot (existing automation / resting value,
   else 0) so there is no jump. (This already holds: the armed branch computes
   `base` from `trackCCLiveVal`, which the clobber fix keeps equal to the playhead
   output.)

4. **Releases only on record-disarm or transport-stop.** Points already written
   stay. Re-arming starts fresh — no knob is latched until turned again.

5. **No erase while recording.** Recording only ever writes 0–127. The knob range
   does **not** reach "—" during live recording. Clearing a lane stays a separate,
   non-recording gesture (Delete+turn, Delete+jog, CLEAR AUTOMATION menu).

6. **Exact collinear decimation.** After a lane is overwritten, redundant interior
   points are removed: drop any point whose value equals the linear interpolation
   between its kept neighbors at its tick (exact, tolerance 0 → lossless). A flat
   hold (15,15,15,…) collapses to its two endpoints; a perfectly linear sweep
   collapses to its endpoints; genuinely curved gestures keep their shape. Runs
   **per latched lane at every loop-wrap**, plus a **final pass on record-stop**,
   so the point count stays bounded across long recordings.

### Consequences (intended, called out so they aren't surprises)
- Turn a knob to a value and leave record on for several loops → that lane becomes
  a flat constant (its prior automation erased by the overwrite). This is the
  point of latch.
- Other tracks, other banks, and untouched knobs are unaffected.

## Changes

### DSP — `dsp/seq8.c`, `dsp/seq8_set_param.c`

- **Per-track latch state.** Add `uint8_t cc_latched;` (bitmask, 1 bit/knob) to the
  track struct. Add `uint32_t cc_latch_last_snap[8];` (last 1/32 tick written per
  latched knob; reuse/rename the existing `cc_touch_last_snap[8]` if free) and a
  per-track `uint32_t cc_prev_ct;` for loop-wrap detection. Zero all on
  `create_instance`, `state_load`, transport-stop, and record-disarm.

- **`cc_send` handler (`seq8_set_param.c`):** keep `cc_emit` + `cc_live_val`
  update. When `tr->recording && pad_mode == MELODIC`: **set the latch bit**
  (`cc_latched |= 1<<k`) and stamp `cc_auto_touch_frame[k]` (keeps the cur_val
  display fix working). **Remove** the single point-write here — the render path
  now owns all writing.

- **Render path (`seq8.c`, the CC block ~8588–8639):** replace the
  `cc_touch_held` touch-record block with a **latch-record** block. For each knob
  with `cc_latched` bit set, while `tr->recording && tr->clip_playing`:
  - compute `snap = (_ct/12)*12`;
  - if `snap != cc_latch_last_snap[k]`: **clear that 1/32 cell**
    (`cc_auto_clear_range(ca, k, snap, snap+11)`) then
    `cc_auto_set_point(ca, k, snap, cc_live_val[k])`; update `cc_latch_last_snap`;
    set `cc_auto_bits` (via existing mechanism) and `state_dirty`.
  - The eval/emit loop above is unchanged; for a latched knob the just-written
    point makes eval == `cc_live_val`, so playback stays consistent. The cur_val
    suppression branch (from the clobber fix) already reports `cc_live_val`.

- **Loop-wrap detection + decimation.** Track `cc_prev_ct`; a wrap is
  `(_ct < cc_prev_ct)` within the loop window (or `current_step` returning to
  `loop_start`). On wrap, for each latched knob run
  `cc_auto_decimate(ca, k)` (new helper). Also run it for each latched knob when
  recording is disarmed / transport stops (record-stop pass), then clear
  `cc_latched`.

- **`cc_auto_decimate(cc_auto_t *a, int k)` (new, `seq8.c`):** single forward walk
  over lane `k`'s sorted points; remove point `i` when
  `val[i] == round( val[i-1] + (val[i+1]-val[i-1]) * (tick[i]-tick[i-1]) /
  (tick[i+1]-tick[i-1]) )` (exact integer collinearity). Compact in place. Keep
  first and last points. O(n) per lane.

### JS — `ui/ui.js`

- **Armed branch (`_onCCMsg` bank 6, ~7956):** unchanged in spirit — compute
  `nv = clamp(base+accel, 0, 127)`, set `trackCCLiveVal`, `cc_send`, set the auto
  bit. The latch now lives DSP-side; the JS keeps sending `cc_send` per effective
  detent (engages + refreshes the live value). No "—" path here (range stays
  0–127). The clobber-fix poll keeps `trackCCLiveVal` correct between detents.
- No new get_param needed for playback; the existing `cc_cur_vals` /
  `cc_auto_bits` polls cover display + LED state. After record-stop, the existing
  per-clip re-read of `cc_rest` / auto-bits refreshes the decimated lane mirrors.

### State / build
- No state-format change, no version bump (latch state is transient runtime only;
  the decimated points serialize through the existing per-clip CC block). No wipe.
- `./scripts/build.sh && ./scripts/install.sh`; GLIBC ≤ 2.35; reboot Move.
- CHANGELOG `### Features` (new recording behavior is user-visible). No MANUAL
  control change beyond the recording-behavior description — update the AUTO-bank
  recording paragraph in MANUAL.md.

## Verification (on device, plain hands-on)
1. **Latch + flatten:** play, arm record on a melodic track, AUTO bank. Turn a
   knob to ~64 and let go. Over the next loop the whole lane reads ~64 (prior
   automation on that lane gone). Stop record → it plays back flat 64.
2. **Live draw:** keep nudging the knob through a loop → the lane follows your
   moves; stop turning mid-loop → it holds the last value to the loop end.
3. **Untouched knob preserved:** record-arm, turn only K1 → K2's existing
   automation still plays unchanged.
4. **Starts from playing value:** a lane already automated to 100 at the playhead —
   first turn nudges from ~100, not from 0.
5. **Release:** disarm record → turning the knob no longer overwrites (back to
   resting-value / audition behavior). Re-arm → nothing overwrites until you turn.
6. **Decimation:** record a flat hold for a couple loops, stop, step through the
   lane — it has endpoints only, not a point every step (no audible change).
7. **No drop on long record:** hold record for many loops on a flat value → no
   point-cap warning, lane stays clean.
8. Other banks / drum tracks / non-armed playback unchanged.

## Parked / not in scope
- ±1 tolerance decimation (start exact; one-line bump later if sweeps feel heavy).
- Erase-while-recording (kept as separate non-recording gestures).
- Per-lane loop length, Pitch Bend type — earlier parked queue, unchanged.
