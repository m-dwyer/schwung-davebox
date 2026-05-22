# dAVEBOx Upcoming Tasks

## Bugs to fix

3. **Scale-aware key/scale changes** — transpose all clip notes on Key/Scale change. Design TBD.
7. **State snapshots / multi-save per session.** Global Menu items "Save snapshot" + "Recall state". Current auto-save behavior unchanged; snapshots are explicit and independent. On state-version bump, dAVEBOx load shows confirm dialog before wiping incompatible snapshots: "dAVEBOx updated — Incompatible session snapshots will be deleted. Proceed? [Yes/No]" (No is default).
9. **MIDI clock sync**

## 1.0 fixes/tweaks — remaining (carried over from the May 2026 batch)

### Bugs

- **Power button doesn't work within dAVEBOx.** Native Move power gesture is swallowed; need to either pass through or implement.
- ~~**Volume knob (master) inconsistent speed + pauses sequencer.**~~ FIXED 2026-05-21 (main `7398983`). Root cause was *not* host acceleration — `claims_master_knob:true` forwards the full CC 79 detent stream to dAVEBOx, which spent cycles dispatching it against the sequencer/MIDI path. Fix: drop CC 79 + volume-touch note 8 at the top of `onMidiMessageInternal`; volume stays Move-native via `button_passthrough[79]`.
- **Shift+clip = focus-without-activate.** Companion to the focused-clip-active default (shipped 2026-05-19). Needs a JS-side "focused vs DSP-active" split so edits target the focused clip even when DSP is still playing the prior one. Deferred — requires deeper refactor.
- **Co-run step-button shortcut should only fire in Track View.** Shift+Step3 (Edit Slot / Edit Synth co-run entry) currently fires in Session View too. Restrict to Track View — Session View Shift+step should pass through to the existing menu shortcuts only.
- **Knob position alignment** of similar params across banks/track types. Example: InQ value should sit at the same knob angle across all places it appears (ALL LANES, CLIP K6 melodic, etc.).
- **HIGH PRIORITY: Delete+jog click on TARP bank doesn't reset to default.** Delete+jog should reset the active bank's params to defaults (matches SEQ ARP / other melodic banks). Same for Shift+Delete+jog (spec'd to reset ALL banks — TARP currently doesn't participate). Audit both reset paths in `_onCC_jog` to include TARP per-track defaults (style, rate, octaves, gate, steps_mode, retrigger, step_vel[8]=4, step_int[8]=0, step_loop_len=8).
- **Move-native knob (CC 71-78) stutters sequencer in co-run.** [FORK-SIDE FIX] Turning a device-edit knob during Move-native co-run stutters dAVEBOx's sequencer + pauses MIDI-out. **Diagnosed 2026-05-21:** root cause is SPI frame-budget overrun (~900µs after the ~2ms ioctl). dAVEBOx's `overtake_dsp_gen->render_block` runs every frame in *both* suspend and co-run (gated only on the instance existing, `schwung_shim.c:1718`), so dAVEBOx is not the variable — verified: suspend + sequencer playing + Move knobs = no hiccup. The variable is MoveOriginal's per-knob work: in co-run you're on the device-edit page, so each CC 71-78 detent does a synth-param write **+ knob-ring OLED redraw** on its FIFO-70 threads, spiking the frame past budget → late SPI transfer → stutter/MIDI jitter. In suspend the lighter Move screen makes the redraw cheaper. Ruled out as *non*-fixes (empirically): CC 71-78 never reach dAVEBOx JS in co-run (shim filters them, `schwung_shim.c:6897`); suppressing all dAVEBOx LED output in co-run changed nothing. The redraw is inside stock Move firmware (can't change). **Only viable lever (fork shim, co-run path):** coalesce rapid CC 71-78 detents per frame before they reach Move — accumulate the relative-encoder deltas and emit ≤1 combined CC per knob per frame (value carries the summed delta, so full knob travel is preserved, just fewer Move redraws). Verify on-device first that Move honors a >1 delta in a single CC. Companion to the volume-knob fix (main `7398983`), which dropped CC 79 JS-side because dAVEBOx (not Move) was processing it there.

### Features

- **Schwung: module favorites in picker.** Shift + jog in the picker favorites a module, which moves it to the top of the module list. (Schwung-side feature.)
- **Reclaim Back button** from Schwung suspend — currently Back triggers suspend; offer a different gesture for suspend so dAVEBOx can use Back.
- **Drum lane repeats respond to pad pressure** — pad pressure continuously sets velocity of incoming repeats.
- **Enable pad pressure broadly** beyond drum repeats — investigate which features should be pressure-aware.
- **Ableton Live set export** — MIDI data + clip structure. All clips with pfx baked down (4x loop bake for random pfx, wrap-around for delay).
- **Mono param on CLIP param bank.** New on/off param in the clip parameter bank. When ON, every note-on triggers a note-off on any previously-playing note(s) on that track — monophonic voicing (last-note priority). When OFF, polyphonic (current behavior). Per-clip.

### Schwung-side (fork) features

- **Two effect sends with returns** added to the chain menu. Each send hosts up to 3 Schwung effects in series.
- **Module favorites in picker** (mirrored from Features list above — Schwung-side).

## Open investigations

- **dAVEBOx co-run vs TB-3PO co-run** — characterize differences; identify anything TB-3PO does cleaner that we should adopt.

## Post-1.0 investigations

- **Song mode — linear arrangement recording and editing.** One long "song clip" per track (no pfx, independent of the 16-clip grid) that captures all tracks' output via an all-track live merge variant. Primary constraint is state persistence: the text-format `state_buf[65536]` can't hold long-form song data — needs a binary format or a separate song-state file. Memory is fine (~200 KB for 8 lean clips at 2K notes each). Step arrays should be dropped for song clips (note-centric model only). UI is the biggest scope item: a linear horizontal arrangement view is a new mode entirely.

- **Move-native state readback via Sentry breadcrumbs.** Sentry SDK writes per-process breadcrumb files under `/data/UserData/Sentry/<uuid>.run/__sentry-breadcrumb{1,2}` (MessagePack ring buffer). MoveOriginal emits `Set MainMode (new state: note|session|songOverview)`, `Set ShiftMode`, `Push/Pop MomentaryMode`, `Song opened (UUID ...)` — a real read-only side channel into Move-native firmware state. Would let co-run auto-detect exit, mirror Shift state, and sync set loads. Investigation parked with full vocabulary + caveats in `notes/sentry-breadcrumb-state-readback.md`. Next step: live capture during a co-run handoff while exercising Note/Session/device-edit/preset-browser, then prototype a msgpack parser.

Source: `~/Downloads/local todo.txt` (user-maintained). When user adds new items there, they should be mirrored here.
