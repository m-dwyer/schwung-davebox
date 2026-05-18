# PR draft — Schwung Phase 2: audio-thread-safe overtake midi_send_external

**Target:** `legsmechanical:phase-2-ext-worker` → `charlesvestal:main`
**Format:** mirrors PR #92 (`feat(overtake): deliver internal pad MIDI to overtake DSP's on_midi hook`).
**Status:** ready to open once `aa8601ac` (broken first-attempt) is scrubbed from `phase-2-ext-worker` so the PR shows one clean commit.

---

## Suggested title

`feat(overtake): audio-thread-safe midi_send_external for overtake DSPs`

## Body

### What this PR does

Makes `overtake_host_api.midi_send_external` safe to call from an overtake DSP's **audio thread**, by replacing the pre-existing synchronous SPI ioctl body with a lock-free SPSC ring whose drain rides the audio thread's existing per-block `shim_pre_transfer` cycle.

Today, the function does its own `real_ioctl(0xa, 0x300)` on the hardware-mapped SPI buffer, after first clearing the first 256 bytes of that buffer with `memset`. That works for occasional one-shot output, but it (a) issues an SPI ioctl out of step with the audio thread's per-block ioctl and (b) clears bytes 0–255 of a 768-byte mailbox that includes the **audio output region at offset 256+**. Result: any overtake DSP that calls `midi_send_external` at sequencer rate from its audio thread ends up clobbering audio frames and producing loud digital noise.

This PR rewrites the function to enqueue 4-byte USB-MIDI packets into a lock-free 64-slot ring; a new `overtake_ext_drain_into_shadow()` consumer drains the ring into the mailbox MIDI_OUT region (bytes 0–79, capacity 20 packets per block) inside the existing `shim_pre_transfer`, just before the existing JACK MIDI writer. The mailbox then ships atomically via the audio thread's existing per-block ioctl — no second ioctl, no syscalls from `midi_send_external`, no concurrent-mmap race.

A capability sentinel `shadow_overtake_send_external_async_active()` lets tools detect this build at runtime and opt into the audio-thread call path; on stock builds the function is undefined and tools fall back to whatever JS-side path they have today.

### Two pieces

1. **`src/schwung_shim.c`** — rewrites the body of `overtake_midi_send_external`, adds `overtake_ext_drain_into_shadow`, calls the drain once per block in `shim_pre_transfer` between `shadow_clear_move_leds_if_overtake` and the JACK MIDI writer. Net change: +67 / −83 lines (removes a worker-thread scaffold and per-packet `shadow_log` calls that were part of an earlier exploration; final design is audio-thread-only).
2. **`src/shadow/shadow_ui.c`** — 13 lines. Zero-arg `js_shadow_overtake_send_external_async_active` registered in `init_javascript`. Same shape as `js_shadow_inbound_pad_midi_active` from PR #92.

### Why this matters

**Removes a real bug for any overtake tool that wants to emit MIDI from its audio thread.** The pre-existing body's `memset(hardware_mmap_addr, 0, 256)` zeroes the first 256 bytes of the SPI mailbox on every call. Bytes 0–79 are MIDI_OUT (fine to clear), but bytes 80–255 overlap display state. More importantly, the unsynchronized ioctl ships the whole 768-byte mailbox out of step with the audio thread's own ioctl, so audio bytes in the 256–767 region get framed mid-write. Tools that send at sequencer rate (e.g. a step sequencer routing notes to USB-A) currently hear loud digital glitches.

**Brings external MIDI send into parity with the rest of the overtake audio-thread API.** Overtake DSPs already have `on_midi`, `render_block`, and `pfx_send` running on the audio thread; PR #92 made internal pad input land there too. After this PR, the matching output side — `midi_send_external` — is safe to call from the same context. Tools no longer have to choose between "JS-tick latency floor" and "audio glitching."

**Replaces the JS-tick floor for ROUTE_EXTERNAL.** Tools that previously worked around the bug by buffering output in DSP state and draining it on a `get_param` call from a JS tick (`~94 Hz` on Move = `~10.6 ms` floor) can now call `midi_send_external` directly from the audio thread. The output rides the audio-block cadence instead (`~2.9 ms` at 44100/128). For sequencer-style tools this brings ROUTE_EXTERNAL into the same latency class as internal slot routing.

**Opt-in via capability sentinel keeps modules forward- and backward-compatible.** Pattern mirrors PR #92 / `shadow_set_corun_chain_edit` / `shadow_set_corun_move_native`. Tools check `typeof shadow_overtake_send_external_async_active === 'function'` and route their output accordingly. Useful for any overtake tool whose output is currently bottlenecked by the buggy synchronous-ioctl path or a JS-tick workaround — step sequencers, arpeggiators, repeat engines, gate latches.

### Implementation notes for tool authors adopting this

Calls to `overtake_host_api.midi_send_external` from the audio thread (e.g. inside `render_block`, `on_midi`, or any audio-thread-invoked dispatch) are now safe and non-blocking. The function is a producer-side SPSC enqueue: `__sync_synchronize` + `memcpy` + head bump, no syscalls, no allocations. Returns `len` on success, `0` on ring full. The ring is sized at 64 packets; over-budget bursts drop-newest and increment a silent counter (tools can poll a `get_param` for diagnostics if needed).

Packet format is 4-byte USB-MIDI: `{0x0F & cin | 0xF0 & cable_nibble, status, d1, d2}`. For USB-A out (cable-2), that's `{0x20 | cin, status, d1, d2}` — same encoding the JACK MIDI writer uses.

Per-block drain capacity is 20 packets (the SPI mailbox MIDI_OUT region holds 20 × 4 bytes = 80 bytes). At ~344 audio blocks/sec on Move, that's ~6880 packets/sec sustained, well above realistic sequencer-rate traffic. The drain claims slots BEFORE the JACK MIDI writer, so sequencer output gets priority over JACK chain output when both compete.

The sentinel returns `1` today; the return value is intentionally not parsed as a bitmask yet — "non-zero means active" leaves room to grow into capability flags without breaking the contract, matching the PR #92 sentinel.

### Compatibility

- **Stock builds**: `shadow_overtake_send_external_async_active` is undefined. Tools that check `typeof ... === 'function'` see `false` and continue using their pre-existing path (whether direct ioctl or JS-tick workaround). Zero behavior change.
- **This build, tool doesn't opt in**: The new producer is invoked the same way the old function was. Tools that call it get a fast non-blocking enqueue instead of a syscall + memset + ioctl — which is strictly an improvement, but no API contract change. The output still reaches USB-A within one audio block instead of immediately, which is a ~3ms delivery delay vs the pre-existing immediate-but-glitchy path. Tools that previously avoided calling `midi_send_external` because of the audio-glitch bug can now use it without that hazard, even without opting into the sentinel.
- **This build, tool opts in**: Tool's audio-thread MIDI output reaches USB-A on the next block boundary. The mean delivery latency is ~half an audio block (~1.5ms) with worst-case ~3ms.
- **Non-overtake mode**: Function is unchanged from a calling perspective; the host only invokes it when an overtake DSP is loaded and calls it.

### Risk

- **Removed code paths**: The synchronous `real_ioctl(0xa, 0x300)` body inside `overtake_midi_send_external` and the `memset(hardware_mmap_addr, 0, 256)` it depended on. No other callers; both were internal to the function. The ioctl that ships the mailbox still fires once per audio block via the existing `shim_pre_transfer` ioctl — output reaches the wire on the same cadence as JACK MIDI output.
- **Added code paths**: A 256-byte ring buffer, two `__sync_synchronize` barriers per packet on producer side, a bounded (≤20 iterations) drain loop per audio block on consumer side. No locks, no allocations, no logging. Drain finds empty slots by scanning the 80-byte MIDI_OUT region for zero quads — same slot-discovery pattern as the JACK MIDI writer.
- **Ordering vs JACK MIDI**: Drain runs BEFORE the JACK writer, so when both compete for the 20 slot/block budget, sequencer notes win and JACK chain MIDI gets the leftover. For chain modules that emit MIDI alongside an overtake tool sending sequencer-rate output, this means JACK MIDI may lose slots under bursty load; the inverse ordering (JACK first) would penalize the sequencer tool, which is the higher-priority case. Switchable in a follow-up if needed.
- **Audio-thread safety**: Drain is `__sync_synchronize` + bounded `memcpy` loop, no syscalls, no logging — fits inside the SPI callback's ~900µs budget by a wide margin.

### Verification

Built and run on Move (Schwung v0.9.13 base). dAVEBOx development tree exercises the path across:
- Sequencer-rate ROUTE_EXTERNAL output (16-step clip, all 8 tracks, chord-rate worst-case bursts)
- Concurrent JACK MIDI output from a chain module under the same overtake tool
- Per-pitch live note-on/note-off events from pad presses (latency-sensitive path)
- Set-switch / state-load module reinstantiation
- USB-A MIDI delivery to a DAW (Mac, captured via Web MIDI for inter-arrival jitter analysis)

**Measured jitter improvement on Move (device build), 199 events per side:**

| Metric                         | Pre-PR (JS-tick workaround) | This PR (audio-thread drain) |
|---|---:|---:|
| Inter-arrival stddev           | 10.25 ms                    | **1.35 ms**                  |
| Worst-case spread (max − min)  | 41.20 ms                    | **3.30 ms**                  |
| P5–P95 spread                  | 35.00 ms                    | **3.00 ms**                  |

7.6× tighter jitter, 12.5× tighter worst-case spread. The remaining ~3 ms B-side spread is one audio block at 44100/128, matching the SPI mailbox cadence — i.e. the irreducible lower bound for ROUTE_EXTERNAL on Move.

No regressions observed on chain MIDI output or on stock dAVEBOx (where the pre-existing JS-tick path remains in use under the sentinel-off fallback).

---

## How to open the PR (when ready)

1. **Scrub `aa8601ac` first.** This branch currently has two commits: `aa8601ac` (broken worker-thread first attempt) and `cbc4621c` (the working redesign). The PR should show only `cbc4621c`. Rebase to drop it:
   ```sh
   cd ~/schwung
   git rebase --onto phase-1-inbound aa8601ac phase-2-ext-worker
   git push fork +phase-2-ext-worker
   ```
2. **Open the PR.** With `gh`:
   ```sh
   cd ~/schwung
   gh pr create \
     --repo charlesvestal/schwung \
     --base main \
     --head legsmechanical:phase-2-ext-worker \
     --title "feat(overtake): audio-thread-safe midi_send_external for overtake DSPs" \
     --body-file /Users/josh/schwung-davebox/notes/SCHWUNG_PHASE_2_EXT_MIDI_PR_BODY.md
   ```
   (Body extracted to a separate file so `gh` consumes just the body, not this whole draft.)
