# dAVEBOx Upcoming Tasks

## Bugs to fix

3. **Scale-aware key/scale changes** — transpose all clip notes on Key/Scale change. Design TBD.
7. **State snapshots** (16 slots)
9. **MIDI clock sync**
10. **Track conversion** (`tN_convert_to_drum`/`tN_convert_to_melodic`): Global Menu Mode item or dedicated dialog.
20. **Scene bake**: bake all 8 tracks at a given clip index. Needs: DSP `bake_scene` set_param handler (loop over tracks, call bake_clip/bake_drum_clip per type); JS multi-track post-bake resync; new confirm dialog. Per-clip bake functions already exist; `launch_scene` is the precedent for scene-level DSP loops.

## 1.0 fixes/tweaks — remaining (carried over from the May 2026 batch)

The batch on `1.0-tweaks` shipped items #5, #8, #10, #14, #16, #20, #29, #32 from the original 33-item list. These remain:

### Bugs

- **Power button doesn't work within dAVEBOx.** Native Move power gesture is swallowed; need to either pass through or implement.
- **Volume knob (master) inconsistent speed + pauses sequencer.** Turning the master vol knob causes MIDI output to drop momentarily. Suspect Schwung host running master-knob acceleration despite `claims_master_knob: true`. Diagnose shim/host interaction.
- **Clear Session: other track-config fields likely still drift.** The 2026-05-19 fix resets `pad_mode` / `active_drum_lane` / `drum_perform_mode` in the DSP `state_load` set_param handler, but `tr->channel`, `tr->pfx.route`, `tr->pfx.looper_on`, `tr->pad_octave` (and likely tarp state) are still untouched. JS `doClearSession` resets the JS mirrors but never pushes them to DSP, so each field keeps its pre-clear value on the DSP side. User hasn't reported these as visible bugs (probably because non-default channel/route is uncommon), but if they do, the fix shape is identical: add to the same reset loop in `seq8_set_param.c` `state_load` handler. See `notes/drum-melodic-mode-flip-and-clear-session-drift.md`.
- **Scene capture grabs all focused clips, including empty/inactive ones.** Should only capture clips that are *playing* or *will play* on next transport start.
- **Press Record during playback** starts recording mid-page. Should start at the beginning of the next page.
- **Drum lane copy/paste broken.** Notes and params appear to copy in UI, but the destination lane is empty after paste. Regression — likely DSP-side paste path mismatched to drum-lane struct.
- **Note duration hold+tap should extend THROUGH the last tapped step.** Currently sets duration TO the tapped step, not through it. Hold step 0, tap step 4 → notes should hold until start of step 5 (step-resolution boundary, not note-window).
- **Lowest pad octave bug:** at the bottom octave setting on melodic tracks, the three left-most pads on the bottom row all light up when any one is pressed. Investigate octave-aware pad lighting logic.
- **Shift+clip = focus-without-activate.** Companion to the focused-clip-active default (shipped 2026-05-19). Needs a JS-side "focused vs DSP-active" split so edits target the focused clip even when DSP is still playing the prior one. Deferred — requires deeper refactor.
- **Re-sync after lane / clip length change.** When user edits lane length or clip length, playback should re-anchor cleanly. Current behavior can phase-shift.
- **Reclaim ceded LEDs after split-UI exit.** dAVEBOx needs to re-fire all LEDs that were yielded to Move/Schwung native during co-run. Today some LEDs remain stuck on the native value until next state change. (Partial mitigation shipped in this batch via `invalidateLEDCache()`; verify whether the broader reclaim is still needed.)
- **Knob position alignment** of similar params across banks/track types. Example: InQ value should sit at the same knob angle across all places it appears (ALL LANES, CLIP K6 melodic, etc.).
- **Re-sync playback after sub-page loop length adjust.** Adjusting loop within a sub-page should re-anchor — both clip and lane scopes.
- **Native Move knob hang.** Turning a Move-native knob from within dAVEBOx (or in native co-run when controlling Move-native) hangs the dAVEBOx sequencer MIDI output. Suspect shared SPI path. Diagnose.

### Features

- **Tap loop in drum track view** unlatches all latched repeats on that track. Rules: pad held + loop tapped → no-op; loop held for significant duration → no-op; loop tapped alone → unlatch all pads on the active track.
- **Schwung: module favorites in picker.** Shift + jog in the picker favorites a module, which moves it to the top of the module list. (Schwung-side feature.)
- **Reclaim Back button** from Schwung suspend — currently Back triggers suspend; offer a different gesture for suspend so dAVEBOx can use Back.
- **Drum lane repeats respond to pad pressure** — pad pressure continuously sets velocity of incoming repeats.
- **Enable pad pressure broadly** beyond drum repeats — investigate which features should be pressure-aware.
- **Ableton Live set export** — MIDI data + clip structure. All clips with pfx baked down (4x loop bake for random pfx, wrap-around for delay).
- **Delay `retrig` param** — new knob. When a note is received while repeats are still playing, the existing repeats stop immediately; only the most recent press's repeats are audible.
- **All-track clip merge.**
- **Shift + row button** launches the row from the beginning of the next bar.

Source: `~/Downloads/1.0 fixes tweaks.txt` (user-maintained). When user adds new items there, they should be mirrored here.
