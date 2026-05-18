# Phase 2 — Session Checkpoint (partial drop landed, PR #93 still open upstream)

**Saved:** 2026-05-18. **Status: ✓ Phase 2 implementation COMPLETE + DEVICE-VERIFIED + A/B-MEASURED + PARTIAL DROP LANDED on our side + PR #93 OPEN upstream.**

---

## 2026-05-18 — partial drop landed (later in the same day)

Decision reversal vs the "no piecemeal merges" plan documented below: after the vanilla-Schwung verify test passed cleanly, we did **steps 1, 2, and 3 of the coordinated drop without waiting for PR #93 to merge upstream**. Steps 4 (cleanup pass) and 5 (release) were explicitly held.

What changed today:

- **dAVEBOx `main` advanced from `770a2b0` (v0.4.0) to `8f09032`.** All 32 commits from the refactor branch (Phase 1 Bundles 1 / 1.5 / 1.6 / 2.0 / 2A / 2A-fixup / 2B / 2C-Rpt1 / 2C-Rpt2 + Phase 2 Bundle 2A redesign + Bundle 2B + session-state docs + jitter tools + design records) live on `main` now. `phase-2-ext-worker` force-updated to the same commit (rebased onto the two GitHub README updates that landed on `origin/main` between sessions). Pushed `origin/main` + `origin/phase-2-ext-worker`.
- **Fork `main` (`legsmechanical/schwung`) advanced from `24a437a8` to `d7076bc2`.** Rebased onto upstream `origin/main` (= v0.9.15 + PR #92 merge), pulled in 44 upstream commits at the base (v0.9.14: bypass shortcut, Latency Comp, wav_position zoom; v0.9.15: version bump; PR #92's merge commits). 9 fork-only co-run commits + 1 Phase 2 commit replayed cleanly on top. One trivial keep-both adjacency conflict resolved in `shadow_ui.c`. Duplicate Phase 1 sentinel commit auto-dropped via `git rebase --onto`. `patches/davebox-local.patch` regenerated against the new base (commit `d7076bc2`). Force-pushed `fork/main` + `fork/phase-2-ext-worker` with `--force-with-lease`.
- **`fork/phase-2-ext-only` (PR #93 head) untouched** — PR is still open, do not rewrite.
- **CHANGELOG.md `[Unreleased]`** picked up two new entries today: Phase 2 ROUTE_EXTERNAL jitter improvement (Performance / UX) and the modal pad-interception fix (Fixes).
- **Move device** is still running the pre-rebase build (from `phase-2-ext-worker` HEAD `e69345c7`, base v0.9.13). Functionally equivalent for everything verified, but does NOT include v0.9.14's Latency Comp etc. Rebuild from `~/schwung` to pull those in if needed.

What still needs PR #93 to land before triggering:

- **Step 4 (cleanup pass)** — delete `PHASE-1:` / `PHASE-2:` gate comments, delete `ext_queue` storage + `ext_queue_push` + `EXT_QUEUE_SIZE` + `get_param("ext_queue")` handler + JS `tick()` ext_queue drain. User decision 2026-05-18: scrap the stock-fallback path entirely. Deferred until vanilla = patched (= PR #93 in a tagged Schwung release).
- **Step 5 (release)** — cut dAVEBOx `v0.5.0`+ once everything is in. CHANGELOG `[Unreleased]` is ready to finalize.

So the current state asymmetry: dAVEBOx-side Phase 2 code lives on `main` (just merged); shim-side Phase 2 code lives on our fork `main` but is NOT yet upstream. A user running dAVEBOx + stock Schwung gets the fallback path (verified today). A user running dAVEBOx + our fork's shim gets full Phase 2.

---

## Original 2026-05-18 plan (for historical reference — SHAs and "main untouched" statements below are now stale; the partial-drop block above supersedes them)

Phase 1 (PR #92) + Phase 2 (PR #93) are now both at upstream Schwung. Phase 1 merged 2026-05-17; Phase 2 opened 2026-05-18, awaiting review. Until both ship in a tagged Schwung release, dAVEBOx still requires the `legsmechanical/schwung` fork for full Phase 1 + Phase 2 behavior.

---

## Branch state (final consolidated layout)

### dAVEBOx (`legsmechanical/schwung-davebox`)
- `main` = `770a2b0` (v0.4.0, untouched).
- `phase-2-ext-worker` = `800ffc2` — **the combined Phase 1 + Phase 2 refactor branch.** All 29 commits live here linearly: Phase 1 Bundles 1 / 1.5 / 1.6 / 2.0 / 2A / 2A-fixup / 2B / 2C-Rpt1 / 2C-Rpt2 + Phase 2 Bundle 2A redesign + Bundle 2B + all session-state docs. Pushed `origin/phase-2-ext-worker`.
- Per-bundle branches deleted: `phase-1-bundle-1`, `phase-1-bundle-2` removed locally and from `origin`.

### Schwung fork (`legsmechanical/schwung`)
- `main` = `24a437a8` (untouched; 41 commits behind upstream now that PR #92 merged — sync deferred).
- `phase-2-ext-worker` = `e69345c7` — **the combined Phase 1 + Phase 2 refactor branch**, scrubbed of `aa8601ac` (broken first-attempt). One Phase 2 commit on top of `phase-1-inbound`'s two commits. Pushed `fork/phase-2-ext-worker` (force-pushed during scrub).
- `phase-2-ext-only` = `8ccec031` — **PR #93's head branch.** Single Phase 2 commit cherry-picked on top of `origin/main` (which already has PR #92 merged). Do NOT touch while PR is open. Pushed `fork/phase-2-ext-only`.
- `phase-1-inbound` deleted locally + from `fork` remote (content lives on as ancestors of `phase-2-ext-worker` AND in upstream main via PR #92).

### Upstream Schwung (`charlesvestal/schwung`)
- `main` head includes PR #92 merge commit `15b14164` (merge of `dc7ce3f1` — Phase 1).
- PR #93 (`feat(overtake): audio-thread-safe midi_send_external for overtake DSPs`) — OPEN, base `main`, head `legsmechanical:phase-2-ext-only`. https://github.com/charlesvestal/schwung/pull/93

---

## Phase 2 redesign — single commit on the Schwung side

`e69345c7` (fork's `phase-2-ext-worker`) and `8ccec031` (PR #93's head, identical content) implement:

- **Producer side** (`src/schwung_shim.c`): `overtake_midi_send_external` rewritten as a lock-free SPSC enqueue into a 64-slot ring. No syscalls from the audio thread. Drop-newest on full with silent counter.
- **Consumer side** (`src/schwung_shim.c`): new `overtake_ext_drain_into_shadow(uint8_t *shadow)` writes up to 20 packets/block into `shadow + MIDI_OUT_OFFSET` via next-empty-slot scan. Called from `shim_pre_transfer` AFTER `shadow_clear_move_leds_if_overtake` and BEFORE the JACK MIDI writer (sequencer notes get slot priority over JACK chain output).
- **Capability sentinel** (`src/shadow/shadow_ui.c`): `shadow_overtake_send_external_async_active()` — zero-arg, returns 1. Same shape as PR #92's `shadow_inbound_pad_midi_active`.

The broken first attempt (`aa8601ac` — worker pthread doing its own SPI ioctl) is gone from history. Lessons preserved in [[spi-single-channel]] memory and §"Critical lessons" below.

---

## A/B latency measurement (Phase 2 verify gate — PASSED)

Captured 2026-05-18 via the in-repo jitter analyzer (`tools/midi-jitter/index.html`, Web MIDI + Chrome, runs at `http://localhost:8080` after `python3 -m http.server` in that dir). dAVEBOx playing a deterministic ROUTE_EXTERNAL clip on Move (44100/128, sequencer rate ~120 BPM), 199 note-on events captured per side.

Capture A — `S.extSendAsyncEnabled = false` forced in `ui/ui.js:3823` → legacy `ext_queue` + JS-tick drain.
Capture B — line restored to `(typeof shadow_overtake_send_external_async_active === 'function')` → Phase 2 audio-thread drain.

| Metric | A (legacy, JS-tick) | B (Phase 2, audio-thread) | Improvement |
|---|---:|---:|---:|
| Mean Δt (sanity) | 120.97 ms | 120.98 ms | (same clip BPM) |
| Stddev (jitter) | 10.25 ms | **1.35 ms** | **7.6× tighter** |
| P5–P95 spread | 35.00 ms | 3.00 ms | 12× tighter |
| Max−Min worst-case | 41.20 ms | 3.30 ms | 12.5× tighter |

Matches the architectural prediction exactly: A's stddev ≈ JS tick floor (~10.6 ms); B's stddev ≈ one audio block (~2.9 ms = irreducible lower bound for ROUTE_EXTERNAL on Move per SPI mailbox cadence). These numbers are in PR #93's body.

Raw JSON: `~/Downloads/davebox-jitter-1779067747952.json` (transient, not committed).

---

## In-repo working tree (untracked, intentionally not committed)

- `tools/midi-jitter/index.html` + `README.md` — Web MIDI jitter analyzer used for the A/B test. Useful for any future latency-verification work. Considered durable; commit candidate.
- `notes/SCHWUNG_PHASE_2_EXT_MIDI_PR.md` — full PR #93 draft (title + body + how-to-open instructions). Historical reference.
- `notes/SCHWUNG_PHASE_2_EXT_MIDI_PR_BODY.md` — body-only file fed to `gh pr create --body-file`. Already used; PR is open.
- `notes/SCHWUNG_INBOUND_PAD_MIDI_PR.md` + `_BODY.md` — obsolete (PR #92's drafts; already merged upstream). Safe to delete or archive.
- `notes/audit-davebox-arch.md` — Phase 1 + Phase 2 architectural plan. Still useful as design-decision record. §9.5 framing correct; the consumer-thread choice is superseded by audio-thread-drain redesign.
- `notes/phase-2-compat-audit.md` — pre-Phase-2 compat audit. Q1 + Q3 correct; Q2 known wrong (the audit recommended a worker thread; reality was the broken first attempt, fixed by audio-thread drain).
- `notes/DISCORD_INTRO_POST.md`, `notes/RECORDING_LATENCY_EXPERIMENT.md` — unrelated drafts, untouched this session.

---

## What's still open / not done

### Vanilla-Schwung verify test (parked — proposed Prereq 2)
Build a stock Schwung shim from `charlesvestal/schwung:main` (currently does NOT yet include PR #93, so stock = "PR #92 + everything before"). Install on Move, boot dAVEBOx, verify the capability-gating still works:
- Pad presses still trigger (Phase 1 dormant or active depending on shim build → JS `onMidiMessage` fallback or DSP `on_midi` path).
- ROUTE_EXTERNAL still emits (Phase 2 sentinel absent on stock → `ext_queue` + JS tick drain fallback active).
- No crashes, no missing features, no LED weirdness.

This is the safety net for users running stock Schwung; never executed this session.

### End-of-refactor coordinated drop (deferred until both PRs ship in a tagged Schwung release)
> **Feasibility pre-checked 2026-05-18 — see `notes/upstream-sync-feasibility.md`.** Fork-main sync against current upstream is textually trivial (one keep-both adjacency conflict in `shadow_ui.c`); zero API breakage from v0.9.14 features. Held per coordinated-drop discipline until PR #93 ships in a tagged release.

1. Once Charles cuts a release containing PR #92 + PR #93: merge dAVEBOx `phase-2-ext-worker` → `main` (linear FF, 29 commits).
2. Merge fork `phase-2-ext-worker` → fork `main` (after first syncing fork main from upstream — 41+ commits to pull in).
3. Regenerate `patches/davebox-local.patch` from `git -C ~/schwung diff <new-base-tag>..main -- src/`.
4. Cleanup pass: delete every `PHASE-1:` and `PHASE-2:` gate comment; delete `ext_queue` storage + `ext_queue_push` + `EXT_QUEUE_SIZE` + `get_param("ext_queue")` handler + JS `tick()` ext_queue drain. User decision 2026-05-18: scrap the stock-fallback path entirely.
5. Cut dAVEBOx release (`0.5.0`+).

No piecemeal merges to main — same coordinated-drop discipline as Phase 1.

### Parked product items (out of refactor scope, revisit later)
- Drum repeats (Rpt1 / Rpt2) and looper dormant during count-in. See [[drum-repeats-during-countin]].
- Drum repeat InQ behavior tweaks. See [[drum-repeat-inq-behavior]].
- Delete+Play universal unlatch (pure JS gesture). See [[delete-play-universal-unlatch]].
- Per-track octave UX discoverability. See [[per-track-octave-ux]].
- Remaining modal-pad-interception cases (bake confirm, inherit picker, scene-save flow) — pattern documented in [[modal-pad-interception-regression]].

---

## Critical lessons (carried forward, preserve in memory)

1. **SPI mailbox is single-channel — see [[spi-single-channel]].** No worker thread can ioctl-ship MIDI faster than the audio thread's per-block transfer; only place to drain is `shim_pre_transfer` before the audio thread's own ioctl. ROUTE_EXTERNAL floor on Move = ~2.9 ms = irreducible.
2. **Read the docs first.** `SPI_PROTOCOL.md` made the single-channel rule explicit. The Phase 2 audit's "worker-thread with its own ioctl" recommendation was wrong because it didn't consult that doc. Grep `~/schwung-docs/` for platform API uncertainty — required, not optional.
3. **No file I/O on the audio thread.** Per `REALTIME_SAFETY.md` §1, SPI callback has a ~900µs budget. The broken first-attempt's per-packet `shadow_log` calls were a buried violation. Use silent counters + an out-of-band reader for diagnostics.
4. **USB-A out is cable-2 (`0x20 | cin` in byte 0).** Direct C-side `midi_send_external` callers must encode the cable nibble; the JS `move_midi_external_send` path adds it server-side.
5. **Capability gating must be uniform across routes.** `liveSendNote` route=2 was missing the `dspInboundEnabled` gate that routes 0 and 1 already had — a pre-existing Phase 1 inconsistency only surfaced once Phase 2 made ROUTE_EXTERNAL emit reliably.
6. **Cherry-pick > rebase when scrubbing a delta-style commit.** `cbc4621c` was crafted as a delta from the broken `aa8601ac` (it deleted things `aa8601ac` added). Rebasing the delta onto a base without those additions conflicts. Reconstruct the end-state as a single direct commit instead: `git reset --hard <base>; git checkout <target-commit> -- .; git commit`.
7. **Mirror PR #92's body structure** for upstream Schwung PRs. Charles seems to prefer "What this does / Why it matters / Implementation notes / Compatibility / Risk / Verification" structure with concrete measurement numbers in Verification when available.

---

## Resume-here cheat sheet for the next session

1. Read this file first.
2. Check PR #93 status: `gh pr view 93 --repo charlesvestal/schwung --json state,reviews,comments`.
3. If still OPEN: vanilla-Schwung verify test is the natural next prereq. Build stock shim, swap onto Move, verify capability fallback paths.
4. If MERGED + a tagged release shipped: execute end-of-refactor coordinated drop per §"End-of-refactor coordinated drop" above.
5. Tool to re-run A/B latency: `cd tools/midi-jitter && python3 -m http.server 8080` → open `http://localhost:8080` in Chrome.
