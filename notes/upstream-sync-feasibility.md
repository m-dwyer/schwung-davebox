# Upstream Schwung sync — feasibility assessment

**Date:** 2026-05-18. **Working branch:** `phase-2-ext-worker`. **Question asked:** what's the impact of recent upstream Schwung releases on our refactor, and can we bring fork + working branch up to date?

**Short answer:** Technically trivial — empirically tested. **Strategically: pause and decide.** Memory `project_phase_2_session_state` says explicitly "no piecemeal merges — coordinated drop after PR #93 lands in a tagged release." PR #93 is still **open with zero reviews**. Doing the fork-main sync now is choosing to break that discipline. The technical green light below is not the same as a green light to proceed; the user should decide.

---

## 1. What shipped upstream since our v0.9.13 base

Two upstream releases (`charlesvestal/schwung`):

- **v0.9.14** — 38 commits. Themes:
  - **Module bypass shortcut** (Mute+JogClick) — ~12 commits in `chain_host.c`, `shadow_ui.c`, `shadow_ui.js`, autosave format.
  - **Latency Comp** — aligns Schwung slots with Move→Schwung audio; `chain_host.c`, `shadow_link_audio.{c,h}`, `shadow_resample.{c,h}`.
  - **wav_position zoom + multi-marker editor** — `shadow_ui.js`, `shadow_ui_master_fx.mjs`.
  - **Shim cable-2 inject fix** (`92beafdf`) — reverts PR #78's cable-0 reinjection. Commit message explicitly verifies dAVEBOx is unaffected (uses `host_api.midi_inject_to_move` cable=2, a separate code path).
  - **Shim instrumentation** (`23e8f2f3`) — per-slot DSP timing telemetry.
  - **`a5187af2`** — refresh hierarchy on preset change (shadow_ui).
  - Catalog / docs / manager noise.
- **v0.9.15** — version bump only, no content.
- **Post-v0.9.15 on `origin/main`** — our own PR #92 merged (commits `42218970`, `dc7ce3f1`, merge `15b14164`). Already present in our `phase-2-ext-worker` ancestry as `a58f557f` + `7aa0a0e9`.

PR #93 (Phase 2 ext_midi audio-thread drain) is **still open**, no reviews, status CLEAN/MERGEABLE.

---

## 2. Conflict map (file-level)

Files touched by **fork-only commits** (9 commits, `origin/main..fork/main`):
- `src/schwung_shim.c`, `src/shadow/shadow_ui.c`, `src/shadow/shadow_ui.js`, `src/host/shadow_constants.h`, plus chain_host, link_audio, resample, manager, build script, docs, catalog.

Files touched by **upstream churn** since v0.9.13:
- Hot: `shadow_ui.js` (9 commits), `schwung_shim.c` (9 commits), `chain_host.c` (5 commits), `shadow_ui.c` (1 commit).

Overlap = potential conflict zone: `shadow_ui.c`, `shadow_ui.js`, `schwung_shim.c`, `chain_host.c`.

---

## 3. Empirical rebase test

Two throwaway branches, then deleted.

**Step A** — `git rebase origin/main` from `fork/main` (9 commits):
- **One conflict, in one file, two trivial adjacency sites in `shadow_ui.c`** — both are "ours adds helper X here; theirs adds helper Y here" textual collisions at the same insertion line. Resolution = keep both sides verbatim, no semantic merge.
- The other 8 commits applied cleanly. Move-native co-run (`add063c3`), Shift+JogClick (`b5d83ec4`), patches/README, davebox-local.patch — none collided.
- Verified post-rebase: `grep -cE 'JS_SetPropertyStr.*shadow_(inbound_pad_midi|set_corun|get_corun)' src/shadow/shadow_ui.c` → **5** (Phase 1's `inbound_pad_midi_active` + chain-edit co-run pair + Move-native co-run pair). All globals registered.

**Step B** — `git rebase --onto <rebased-fork-main> 24a437a8 phase-2-ext-worker` (3 commits):
- **Zero conflicts.** Git auto-dropped Phase 1's first commit (`a58f557f`, "deliver internal pad MIDI to overtake on_midi") via patch-id matching against the now-upstream version. Two commits replayed clean: `7aa0a0e9` (Phase 1 sentinel) and `e69345c7` (Phase 2 audio-thread ring).

Net result: textual-clean rebase end-to-end with one keep-both adjacency fix in one file.

---

## 4. API-breakage audit (dAVEBOx vs new upstream features)

Each new upstream feature checked for impact on dAVEBOx (`component_type: "tool"`):

| Feature | Where it lives | dAVEBOx impact |
|---|---|---|
| Module bypass (Mute+JogClick) | `chain_host.c` (chain module DSP); `shadow_ui.js` `handleSelect()` gated `if (view === CHAIN_EDIT)` | **None.** Tool modules don't use chain_host; bypass UI only in CHAIN_EDIT view, dAVEBOx runs in OVERTAKE. CC 88 (Mute) is tracked in `hostMuteHeld`, but only read inside the CHAIN_EDIT branch. |
| Latency Comp | `shadow_link_audio.*`, `shadow_resample.*` (audio path) | **None.** dAVEBOx has no audio. |
| wav_position zoom | `shadow_ui.js` editor view | **None.** dAVEBOx doesn't use wav_position. |
| Cable-2 inject fix (`92beafdf`) | `shim_pre_transfer` no-tool fallback path | **None — explicitly verified by Charles in the commit body.** dAVEBOx uses `host_api.midi_inject_to_move` → shadow_mailbox, not the hardware MIDI_IN buffer this fix changed. |
| Shim instrumentation | Internal telemetry in `schwung_shim.c` | **None.** No public API. |
| Refresh hierarchy on preset change | `shadow_ui` chain UI | **None.** dAVEBOx is the active tool, not a chain slot module. |

`shadow_link_audio.h` and `shadow_resample.h` got **additive** symbols (`LATENCY_COMP_TARGET_SAMPLES`, `link_audio_reset_nudge_state`, `link_audio_drain_avail_stats`, `latency_comp_user_enabled`, `latency_comp_active`). No existing symbol changed signature or was removed.

---

## 5. Feasibility tiering (per advisor)

**Tier 1 — textual-clean (proven).** Rebase succeeds with one keep-both fix; conflict resolution verified to produce all 5 expected `JS_SetPropertyStr` registrations.

**Tier 2 — build-clean (untested).** Have NOT run `./scripts/build.sh` against the rebased fork. The shim binary must compile against the new upstream headers (Latency Comp added 4 new prototypes; bypass added the new struct fields). Risk = low; co-run / Phase 1 / Phase 2 don't touch those subsystems. But unverified.

**Tier 3 — device-clean (untested).** Have NOT deployed the rebased shim to Move + booted dAVEBOx + exercised co-run, Move-native co-run, ROUTE_EXTERNAL, Phase 2 audio-thread drain. Risk = low based on the API audit, but unverified.

---

## 6. If we proceed — work plan

1. **Sync upstream tags safely.** `cd ~/schwung && git fetch origin --tags --force` (current fetch is rejecting clobbers — fork has tag-name collisions on `v0.7.*` / `v0.8.*` / `working` from old work).
2. **Rebase fork main.** On a real branch off `fork/main`: `git rebase origin/main`. Resolve the one `shadow_ui.c` conflict by keep-both (procedure documented in §3). Force-push to `fork/main` only after verifying registration count = 5.
3. **Rebase working branch.** On a real branch off `phase-2-ext-worker`: `git rebase --onto <new-fork-main> 24a437a8`. Phase 1's pre-PR-92 commit auto-drops; remaining 2 commits replay clean.
4. **Regenerate the patch.** `git diff <new-base>..fork/main -- src/ > patches/davebox-local.patch` and commit. The `<new-base>` will be whatever upstream tag we want as the published patch base (probably `v0.9.15` or whatever the next tagged release becomes after PR #93 merges).
5. **Tier-2 verify:** `./scripts/build.sh` in `~/schwung`, confirm shim builds.
6. **Tier-3 verify:** deploy rebased shim to `/data/UserData/schwung/schwung-shim.so` AND `/usr/lib/schwung-shim.so`, reboot Move, exercise:
   - dAVEBOx loads + transport works
   - co-run via `Edit Slot...` (chain-edit) and `Edit Synth...` (Move-native)
   - ROUTE_EXTERNAL emits (Phase 2 path)
   - pads route through DSP on_midi (Phase 1 path)
   - new upstream features coexist (bypass shortcut in CHAIN_EDIT, etc.)
7. **Re-run the A/B latency capture** (`tools/midi-jitter/`) to confirm Phase 2 jitter still ≈ 1.35 ms stddev under the new shim.
8. **Push fork main + branch** as a coordinated operation.

dAVEBOx `phase-2-ext-worker` itself does NOT need rebasing yet — it's the dAVEBOx-side branch, independent of the Schwung shim build. Only changes here would be if the Move-native or co-run JS calls into APIs whose semantics moved, which the API audit found they did not.

---

## 7. The strategic question (revisit before proceeding)

Memory `project_phase_2_session_state` § "End-of-refactor coordinated drop":
> Deferred until both PRs ship in a tagged Schwung release.
> No piecemeal merges to main — same coordinated-drop discipline as Phase 1.

The implicit reason: a half-synced fork is harder to debug if something regresses, and the patch base needs to point at a real upstream tag for downstream users to reproduce.

PR #93 is still open with no review activity. Two paths:

- **Hold (default per memory).** Wait for PR #93 review → merge → tagged release on `charlesvestal/schwung`. Then execute the full coordinated drop (fork main sync + working-branch merge + patch regen + dAVEBOx release) in one pass. No half-states.
- **Sync now anyway.** Cheap technically. Buys: nothing concrete unless a specific upstream feature is needed. Costs: the patch base becomes "fork main mid-flight, somewhere between v0.9.15 and the next release," which is awkward to document. Risks the trap of "we're already half-synced, might as well do the rest" pressure.

Open question for the user: **is there a reason to sync the fork now, or are we just doing it because it's possible?** If the answer is "nothing forcing it," hold per the prior discipline.

---

## 8. Files touched by this assessment (none committed)

- This file (`notes/upstream-sync-feasibility.md`) — written for the record. Safe to delete after decision.
- Test branches `test/rebase-fork-main`, `test/rebase-phase-2`, `test/verify-rebase`, `test/patch-on-upstream` were created and deleted during the assessment; `~/schwung` working tree restored to `phase-2-ext-only`, no uncommitted changes.
