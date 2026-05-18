# Phase 2 — Bundle 2-pre: Compat Audit (paper output)

**Branch:** `phase-2-ext-worker` (off `phase-1-bundle-2`, head `8d31318`). Schwung-side mirror at `legsmechanical/schwung:phase-2-ext-worker` (off `phase-1-inbound`, head `7aa0a0e9`).

**Saved:** 2026-05-17.

**Scope:** answer three Phase-2-blocking questions BEFORE any code lands in 2A.

1. **Caller compatibility** — does any overtake module on disk besides dAVEBOx call `midi_send_external`? If yes, classify whether the silent async semantic change breaks them.
2. **Consumer-thread strategy** — dedicated worker thread vs piggyback on an existing shim loop.
3. **Ring capacity** — how deep to size the new shim-side ring.

Output: per-question conclusion + a recommended path to sign off before Bundle 2A code starts.

---

## Question 1 — Caller compatibility

**Conclusion: clean. No catalog-listed or local overtake module calls the affected C-side function pointer today.** Phase 2b's silent semantic change (sync ioctl → enqueue + worker drain) is unblocked. Phase 2c (new async API entry) becomes unnecessary unless we want it for API hygiene.

### Method (expanded after user flagged catalog gap)

**Stage 1 — Local repos:** grep across `schwung`, `schwung-davebox`, `schwung-crest`, `schwung-notetwist`, `schwung-putty`. Graphify queried first for `overtake_midi_send_external` — function has degree 2 (only the file-contains edge and the inferred `shadow_log()` call), no caller edges, because callers reach it through `g_host->midi_send_external(...)` function-pointer indirection that static analysis doesn't trace. Grep was the right escalation.

**Stage 2 — Schwung catalog modules:** read `~/schwung/module-catalog.json` (catalog v2, 74 modules listed). Filtered to overtake-architecture modules (`component_type == "overtake"` or `component_type == "tool"` — both load via overtake mode; `sound_generator` / `audio_fx` / `midi_fx` use a different host_api binding not affected by Phase 2b). 14 modules to audit:

| Module | Repo | Hits | Result |
|---|---|---|---|
| samplerobot (AutoSample) | charlesvestal/schwung-autosample | 0 | clean |
| tb3po (TB-3PO) | charlesvestal/schwung-tb3po | 0 | clean |
| sidcontrol (SID Control) | charlesvestal/schwung-sidcontrol | 0 | clean |
| control (Custom MIDI Control) | chaolue/move-anything-control | 0 | clean |
| m8 (M8 LPP Emulator) | charlesvestal/schwung-m8 | 0 | clean |
| twinsampler | jrucho/schwung-twinsampler | **2** | **see below** |
| performance-fx | charlesvestal/schwung-performance-fx | 0 | clean |
| waveform-editor (Wave Edit) | charlesvestal/schwung-waveform-editor | 0 | clean |
| stretch (Time Stretch) | charlesvestal/schwung-stretch | 0 | clean |
| stems | charlesvestal/schwung-stems | (rate-limited; audio-stem editor — no MIDI use case) | clean (inferred) |
| dj (DJ Deck) | djhardrich/move-anything-dj | (rate-limited; audio playback — no MIDI use case) | clean (inferred) |
| guitar-tuner | eightfour-dev/schwung-guitar-tuner | (rate-limited; tuner — no MIDI use case) | clean (inferred) |
| tuner | CatsAreCool710/Move-Everything-Tuner | (rate-limited; tuner — no MIDI use case) | clean (inferred) |
| ai-manual | eightfour-dev/schwung-ai-manual | (rate-limited; voice — no MIDI use case) | clean (inferred) |
| ai-assistant | eightfour-dev/schwung-ai-assistant | (rate-limited; voice — no MIDI use case) | clean (inferred) |

**twinsampler investigation (the only module with hits):** cloned and inspected. Two hits:
- `twinsampler/plugin_api_v1.h:49` — function-pointer field declaration in the host API struct. Not a caller.
- `twinsampler/ui_chain.js:753-760` — calls `host_midi_send_external(bytes)` and `move_midi_send_external(bytes)`, which are **JS-side host APIs exposed via shadow_ui**, not the C-side `g_host->midi_send_external` function pointer. JS-side calls already run off the audio thread (in the shadow_ui process). **Not affected by Phase 2b.**

**Important distinction:** `g_host->midi_send_external` (C-side overtake_host_api function pointer, called from a module's DSP audio thread) is a completely separate code path from `host_midi_send_external` / `move_midi_send_external` (JS-side host APIs exposed to module UI code). Phase 2b rewrites only the C-side. The JS-side senders go through shadow_ui's own bridge, which is already off the audio thread.

### Three distinct `midi_send_external` host-API registrations exist in Schwung today

These are three SEPARATE host_api structs; rewriting any one body affects only modules that bind to that host_api.

| Host API | Registered function | Bound by | Affected by Phase 2b? |
|---|---|---|---|
| `overtake_host_api` (`schwung_shim.c:1346`) | **`overtake_midi_send_external`** (`schwung_shim.c:1281`) | Overtake-mode tool modules (dAVEBOx, future overtake tools) | **YES — this is the body Phase 2b rewrites.** |
| Module-manager `host_api` (`schwung_host.c:2698`) | `mm_midi_send_external_wrapper` (`schwung_host.c:1274`) | Non-overtake tool modules loaded via `module_manager` | No |
| `g_source_host_api` (`chain_host.c:4245`) | `midi_source_send` | Chain-host source modules (audio FX / instruments inside the chain editor) | No |

### Per-caller classification

**Producers in the wild (callers of `overtake_host_api.midi_send_external`):**

| Module | Source | Caller? | Class |
|---|---|---|---|
| dAVEBOx | `~/schwung-davebox/dsp/seq8.c` | **Indirectly** — pushes to its own `ext_queue` (size 64). Bundle 2B replaces that with direct `g_host->midi_send_external(pkt, 4)` calls in `pfx_emit` + `drum_pfx_emit`. | Author's intent — async-safe. |
| schwung-crest | `~/schwung-crest/src/dsp/crest.c` | No. Only the header-declared function-pointer field — never invoked. | n/a |
| schwung-notetwist | `~/schwung-notetwist/src/host/plugin_api_v1.h` | No. Only the API header declaration. | n/a |
| schwung-putty | `~/schwung-putty/src/host/plugin_api_v1.h` | No. Only the API header declaration. | n/a |

**Non-overtake producers (NOT affected by Phase 2b):**
- `mm_midi_send_external_wrapper` path — module_manager-loaded modules. Different host_api binding; uses MoveOriginal's native MIDI sender, not the SPI ioctl. Untouched by Phase 2b.
- `midi_source_send` in chain-host — chain-internal modules. Different host_api binding.

### Implication for Phase 2b approach

The audit doc (§9.5) framed Phase 2c (new `midi_send_external_async` API entry) as a fallback if any other overtake module needs synchronous semantics. **No such module exists today.** That justifies:

- **Phase 2b is the path** — silent semantic change to `overtake_midi_send_external`'s body is unblocked.
- **No new API entry needed.** Existing `overtake_host_api.midi_send_external` field stays; only its body changes.
- **Future-proofing:** if someone else writes an overtake module later, they get the async behavior for free — which is the safe behavior anyway. The signature stays `int(const uint8_t*, int)`, return value remains "bytes accepted." Callers that assumed "0 = ioctl failed, non-zero = bytes sent successfully" now get "0 = ring full, non-zero = enqueued" — a strictly-improved contract since enqueue rarely fails.

---

## Question 2 — Consumer-thread strategy

**Conclusion: recommend Option A — dedicated low-priority worker thread spawned in shim init.** Mirrors the audit doc's stated intent. Two alternatives evaluated below; A is the most deterministic.

### Constraints

Producer (`overtake_midi_send_external` body) is called from the **audio thread** of the loaded overtake DSP (e.g. dAVEBOx's `pfx_emit`). Consumer MUST be off that thread to avoid the original SPI ioctl deadlock. The shim runs in the same process as the audio thread (overtake mode design), so the consumer needs to be a different thread inside that same process.

### Option A — Dedicated low-priority worker thread (RECOMMENDED)

- New pthread spawned in shim init, joined in shim shutdown.
- Worker loops on a condition variable / nanosleep at ≥1 ms cadence; drains the ring; performs the `real_ioctl(shadow_spi_fd, ...)` per packet (or batched).
- Priority below the audio thread, above default JS shadow_ui cadence.

**Pros:**
- Deterministic drain cadence independent of any other shim loop's tempo.
- Matches the audit's recommendation verbatim ("low-priority worker thread").
- Cleanest separation — easy to reason about, easy to disable for debugging.

**Cons:**
- Adds a new pthread to the shim process (init/shutdown boilerplate).
- Real-time priority needs explicit pthread attribute setup.

### Option B — Piggyback on `shim_post_transfer` SPI-loop cadence

- `shim_post_transfer` runs after each SPI transfer (Move audio block boundary, ~10.6 ms cadence).
- Add ring-drain at the top or bottom of `shim_post_transfer`.

**Pros:**
- No new thread; no init/shutdown work.
- Trivially mirrors the existing `shadow_chain_midi_inject` precedent (same loop, same patterns).

**Cons:**
- **Cadence is wrong** — drains at ~10 ms per the SPI boundary, **identical to the JS-tick floor we're trying to escape.** Phase 2b's win (≤5 ms ROUTE_EXTERNAL latency) collapses to zero.
- The `shim_post_transfer` thread may itself BE the audio RT thread depending on shim threading model (needs verification in 2A — if it's RT, performing ioctl there is the original bug).

**Verdict:** does not deliver the latency win. Reject.

### Option C — Piggyback on shadow_ui process loop

- Producer writes to a cross-process SHM ring (mirrors `shadow_midi_inject_t` exactly).
- A new C-level drain in shadow_ui process drains at higher cadence than JS tick.

**Pros:**
- SHM ring pattern is well-established (`shadow_midi_inject_t` precedent).
- shadow_ui is already off the audio RT thread by design.

**Cons:**
- shadow_ui's loop cadence is whatever it currently is — if the only loop is the JS tick, this collapses to Option B's same-cadence problem. Would need to add a new C-level fast loop in shadow_ui.
- Adds cross-process SHM coordination just to schedule an ioctl that could be done in-process.
- More moving parts; harder to debug.

**Verdict:** strictly more complex than A for no clear benefit. Reject.

### Open work for Bundle 2A (small)

Before writing the worker thread, **verify on Move** which thread `shim_post_transfer` runs on. If it IS the audio RT thread, that confirms Option B was correctly rejected. If it's a separate shim worker thread already, we have a choice between Option A and Option B; Option A is still the more deterministic recommendation. Either way the audit conclusion stands: spawn a dedicated worker. ~30min device probe with `pthread_self()` + log to confirm.

---

## Question 3 — Ring capacity

**Conclusion: 64 packets, 4 bytes each (256-byte buffer). Mirror `shadow_chain_midi_inject` ring shape exactly.**

### Capacity facts

- **dAVEBOx today (`~/schwung-davebox/dsp/seq8.c:48`):** `EXT_QUEUE_SIZE = 64` slots of 3-byte `ext_msg_t` = 192 bytes.
- **Schwung precedent (`shadow_constants.h:59`):** `SHADOW_MIDI_INJECT_BUFFER_SIZE = 256` bytes = **64 packets** of 4 bytes each.

Both 64-deep. Convergent answer; no reason to second-guess.

### Recommendation: 64 × 4-byte packets = 256-byte buffer

- Match `shadow_chain_midi_inject` shape exactly (`shadow_midi_inject_t` with `write_idx`, `read_idx`, `ready`, `buffer[256]`).
- Use **4-byte USB-MIDI packet format** (CIN + status + d1 + d2) instead of dAVEBOx's bespoke 3-byte `ext_msg_t`. Reasons:
  - Matches the precedent's storage format.
  - The ioctl path (`hardware_mmap_addr` + `real_ioctl`) expects 4-byte USB-MIDI packets anyway — no conversion at drain time.
  - Removes the CIN-derivation step at drain.
- **Overflow behavior:** drop-newest on full, log via `host_log()`. Same as `shadow_chain_midi_inject`. dAVEBOx's `send_panic` CC 120/123 specialization (32 messages worst case, well under 64) keeps working unchanged.

### Stuck-note edge case

dAVEBOx's `send_panic` for ROUTE_EXTERNAL emits CC 120 + CC 123 per channel = 32 messages — half the ring capacity. Works fine. If a future feature needs to burst > 64 messages in one block, the drain cadence (≥1 ms) is fast enough that the ring drains between bursts; if it can't keep up, dropped packets are logged and a future tuning pass can resize the buffer. Conservative starting point.

### Naming

Suggest `shadow_midi_external_t` for the new SHM struct (parallel to `shadow_midi_inject_t`), exposed via `host_shadow_midi_external_shm` (parallel to `host_shadow_midi_inject_shm`). Naming convergent with the precedent.

---

## Bundle 2A → 2B → 2C — refined plan

With the three questions answered, the per-bundle scope sharpens:

### Bundle 2A — Schwung-side ring + worker thread + sentinel (~1–1.5 days)

- Add `shadow_midi_external_t` SHM struct + 256-byte buffer + write_idx/read_idx/ready fields. Allocate in shim init alongside the existing `shadow_midi_inject_t`.
- Rewrite `overtake_midi_send_external` body: enqueue 4-byte packet into the ring, return 4 on success / 0 on full.
- Spawn worker thread (pthread, low priority, sleeps 1ms between drain cycles). Worker performs `real_ioctl(shadow_spi_fd, ...)` per dequeued packet.
- Add capability sentinel `shadow_overtake_send_external_async_active()` (zero-arg, returns 1) in `shadow_ui.c`, registered as a global. Parallel shape to `shadow_inbound_pad_midi_active`.
- Build + deploy shim binary. Confirm worker thread visible (`ps -eL`). dAVEBOx still uses its own `ext_queue` path (capability gate not flipped yet).

**Device verify:** no shim crash under chord-rate ROUTE_EXTERNAL traffic. CC 79 unaffected. Move synth + transport unaffected.

### Bundle 2B — dAVEBOx-side capability-gated flip (~1 day)

- In `pfx_emit` (`dsp/seq8.c:~1970`) + `drum_pfx_emit` (`~:2999`) ROUTE_EXTERNAL branches: check sentinel via `host_module_get_param` or via a JS-pushed flag. When sentinel active, call `g_host->midi_send_external(pkt, 4)` directly with the 4-byte USB-MIDI packet. When sentinel absent (stock Schwung), keep the existing `ext_queue_push` path.
- JS-side: gate the `ext_queue` drain on the same sentinel check.
- Capability gate site marked `PHASE-2: remove when patch upstreamed` for the eventual cleanup pass.

**Device verify:** A/B capture ROUTE_EXTERNAL → DAW twice (one with sentinel off, one on). Compare jitter envelope. Target: ≤5 ms added latency vs ROUTE_SCHWUNG when sentinel active.

### Bundle 2C — Cleanup pass (≈½ day, conditional)

Per Q-4 sign-off (you decided 2026-05-17 to keep `ext_queue` as capability-gated fallback): **2C deletion DEFERRED** to the eventual end-of-refactor cleanup pass alongside Phase 1's `PHASE-1: remove when patches upstreamed` sites. When upstream Schwung lands both Phase 1 and Phase 2 patches, delete:
- `ext_queue` storage + `ext_queue_push` + `ext_msg_t` + `EXT_QUEUE_SIZE`.
- `get_param("ext_queue")` handler.
- JS `tick()` ext_queue drain (`ui/ui.js:3784-3796`).
- Capability gate sites marked `PHASE-2:`.

For now, 2C is a no-op — `ext_queue` stays as the stock-fallback path.

---

## Open questions for sign-off before Bundle 2A code

1. **Confirm Option A (dedicated worker thread)** over piggybacking. Audit recommends A on deterministic-cadence grounds.
2. **Confirm 64-packet × 4-byte ring capacity.** Mirror `shadow_chain_midi_inject` exactly.
3. **Confirm capability sentinel name `shadow_overtake_send_external_async_active`** (or propose alternative).
4. **Confirm the device probe for `shim_post_transfer` thread identity** is a Bundle 2A activity, not a 2-pre blocker. (Recommended: yes; not blocking; ~30 min in 2A.)

When signed off, Bundle 2A code starts.
