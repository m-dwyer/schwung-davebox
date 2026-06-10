/*
 * SEQ8 runtime instance state.
 *
 * Kept separate from seq8_types.h because this struct owns runtime resources
 * and audio-thread coordination state, not just portable sequence data.
 */
#ifndef SEQ8_INSTANCE_H
#define SEQ8_INSTANCE_H

#include <stddef.h>
#include <stdio.h>
#include "seq8_types.h"

typedef struct {
    float        sample_rate;
    uint32_t     block_count;
    FILE        *log_fp;

    seq8_track_t tracks[NUM_TRACKS];
    uint8_t      active_track;

    /* Phase 1 / Bundle 2C-Rpt2: global Delete-held flag. JS pushes the
     * edge via a single `t0_delete_held` set_param on every Delete CC
     * edge (per-track-shaped key, but read here at instance level —
     * Delete is a global modifier). drum_pad_event returns 1 at top
     * when set, so on_midi does NOT classify the pad press; mirrors
     * JS's "bail on Delete-held" branches in the drum-mode pad handlers.
     *
     * Why one push, not 8: a tight for-loop fan-out of 8 tN_* writes
     * within one onMidiMessage callback was empirically observed to
     * coalesce (only the last N landed) — likely a host queue depth
     * limit on rapid same-shape pushes. Single push is reliable.
     *
     * Scope today is Delete only. Shift / Copy / Mute / Capture also
     * gate JS-side pad handlers and would need similar mirrors when
     * porting more pad logic into on_midi; see parked memory
     * project-modal-pad-interception-regression. Generalizing to a
     * `modal_pad_block` bitmask at that point is straightforward. */
    uint8_t      delete_held;

    /* Shared transport — all tracks run on the same timing grid */
    uint8_t  playing;
    uint32_t tick_accum;
    uint32_t tick_threshold;        /* sample_rate * 60 */
    uint32_t tick_delta;            /* MOVE_FRAMES_PER_BLOCK * BPM * PPQN */
    uint32_t master_tick_in_step;     /* drives global_tick and launch-quant at master 1/16 boundary */
    uint32_t global_tick;             /* steps elapsed since transport play; bar boundary = global_tick % 16 == 0 */
    uint32_t arp_master_tick;         /* free-running master tick for SEQ ARP; advances even while stopped, resets on transport play / count-in fire */
    int      emit_bypass_swing;       /* set to 1 around live-tap emissions; pfx_send/drum_pfx_send skip swing when nonzero */
    int      in_queue_drain;          /* set inside pfx_q_fire/drum_pfx_q_fire so re-entered pfx_send/drum_pfx_send skip the swing block (preserving arp/looper/merge hooks but preventing re-queue) */
    uint64_t swing_step_delay_offbeat;/* offbeat-step swing offset in samples; kept current independent of which step we're on so schedule-time swing helper doesn't recompute */

    /* DSP-side count-in: counts down in DSP ticks; fires transport+recording when done */
    int32_t  count_in_ticks;        /* remaining ticks; 0 = inactive */
    uint8_t  count_in_track;        /* track to arm for recording on fire */

    /* Metronome: clicks on quarter notes while recording/count-in is active */
    uint8_t  metro_on;              /* 0=off,1=count-in only,2=count+rec,3=always */
    uint8_t  metro_vol;             /* 0-150, default 80 */
    uint16_t metro_beat_count;      /* monotonic counter; incremented on each quarter-note beat */

    /* Metro click: DSP-side WAV playback */
    int      metro_wav_fd;
    void    *metro_wav_map;
    size_t   metro_wav_map_size;
    const int16_t *metro_wav_data;  /* points into mmap; NULL = not loaded */
    uint32_t metro_wav_frames;
    uint32_t metro_click_pos;       /* UINT32_MAX = not playing */

    /* Print mode: bake chain output into step data */
    uint8_t  printing;

    /* Live Merge: multi-track real-time capture of all 8 tracks' pfx-chain
     * output into a deferred-placement buffer. User chooses the destination
     * scene row post-stop via merge_place_row. Per-track pending arrays so
     * each track's captured notes can be written to its own column at the
     * chosen row; tracks with zero captured notes are skipped at placement
     * (existing clips on those tracks at the destination row are preserved). */
#define MERGE_STATE_IDLE      0
#define MERGE_STATE_ARMED     1
#define MERGE_STATE_CAPTURING 2
#define MERGE_STATE_STOPPING  3  /* stop requested; finalize at next 16-step page boundary */
#define MERGE_STATE_CAPTURED  4  /* capture complete, waiting for placement (merge_place_row) */
    uint8_t  merge_state;
    uint32_t merge_start_abs;    /* abs master tick (global_tick*TPS + master_tick_in_step) */
    uint32_t merge_tps;          /* TPS used for captured timing (TICKS_PER_STEP for all tracks) */
    uint32_t merge_end_abs;      /* abs tick at finalize — used to size destination clips */
    /* gate=0 while the note is still held (closed at merge_stop with the
     * elapsed tick); non-zero once the matching note-off arrived during
     * CAPTURING. Both forms are written into clips at merge_place_row time.
     * Slot count must be high enough to cover a long multi-track merge —
     * 32 was insufficient (drum-heavy passes capped after one bar). 512
     * matches MAX_NOTES_PER_CLIP. */
    struct { uint8_t pitch; uint32_t tick_at_on; uint8_t vel; uint16_t gate; } merge_pending[NUM_TRACKS][512];
    uint16_t merge_pending_count[NUM_TRACKS];

    /* Live pad input: global key/scale stored for state persistence */
    uint8_t  pad_key;               /* root key 0-11, default 9 (A) */
    uint8_t  pad_scale;             /* 0=Major (matches JS SCALE_NAMES index) */

    /* Transpose-on-key/scale-change — live preview + commit. Transient: NOT
     * serialized. preview_active gates both the note-emit LUT and the
     * scale-aware tonality reads (eff_pad_key/eff_pad_scale) so harmonies/arps
     * track the candidate while browsing. Cleared defensively on load + suspend. */
    uint8_t  xpose_preview_active;  /* 1=apply xpose_lut at emit + use candidate tonality */
    uint8_t  xpose_preview_key;     /* candidate root 0-11 during preview */
    uint8_t  xpose_preview_scale;   /* candidate scale 0-13 during preview */
    uint8_t  xpose_lut[128];        /* per-pitch remap, rebuilt from the 4-val descriptor */
    uint8_t  launch_quant;          /* 0=Now,1=1/16,2=1/8,3=1/4,4=1/2,5=1-bar; default 5 */
    uint8_t  swing_amt;             /* 0-100 UI; maps to 50%-75% of pair (0=straight, 100=75%) */
    uint8_t  swing_res;             /* 0=1/16 pairs, 1=1/8 pairs */
    uint64_t swing_step_delay;      /* samples to defer notes in current even step; 0=no defer */

    /* External MIDI queue: ROUTE_MOVE note events buffered here; JS drains each tick */
    ext_msg_t ext_queue[EXT_QUEUE_SIZE];
    int       ext_head;             /* next write index */
    int       ext_tail;             /* next read index */

    /* State file path — set by JS via set_param("state_path") before first load/save */
    char state_path[256];

    /* Monotonic nonce: unique per create_instance call; JS polls to detect DSP hot-reload */
    uint32_t instance_nonce;

    /* Set by seq8_load_state when a genuine version mismatch is found (sv>0 && sv!=36).
     * JS reads via get_param, shows confirm dialog. On "Yes" JS sends state_load which
     * re-enters seq8_load_state — flag being set means "delete and start clean". */
    uint8_t state_version_mismatch;

    /* Mute/solo per track: 0=off, 1=on */
    uint8_t mute[NUM_TRACKS];
    uint8_t solo[NUM_TRACKS];

    /* Mute/solo snapshots: 16 slots */
    uint8_t snap_mute[16][NUM_TRACKS];
    uint8_t snap_solo[16][NUM_TRACKS];
    uint8_t snap_valid[16];

    /* Scale-aware play effects: interpret Ofs/Hrm/delay-pitch in scale degrees */
    uint8_t scale_aware;
    /* Input quantize: 1=snap live recording to step grid (zero offset), 0=unquantized */
    uint8_t inp_quant;
    /* External MIDI channel filter: 0=All, 1-16=specific channel */
    uint8_t midi_in_channel;

    /* 1-level undo/redo: up to UNDO_MAX_CLIPS clip snapshots per operation.
     * Row cut+paste needs 8 src + 8 dst = 16 slots. */
#define UNDO_MAX_CLIPS (NUM_TRACKS * 2)
    clip_t  undo_clips[UNDO_MAX_CLIPS];
    cc_auto_t undo_auto_cc[UNDO_MAX_CLIPS];
    at_auto_t undo_auto_at[UNDO_MAX_CLIPS];
    uint8_t undo_clip_tracks[UNDO_MAX_CLIPS];
    uint8_t undo_clip_indices[UNDO_MAX_CLIPS];
    uint8_t undo_clip_count;
    uint8_t undo_valid;
    clip_t  redo_clips[UNDO_MAX_CLIPS];
    cc_auto_t redo_auto_cc[UNDO_MAX_CLIPS];
    at_auto_t redo_auto_at[UNDO_MAX_CLIPS];
    uint8_t redo_clip_tracks[UNDO_MAX_CLIPS];
    uint8_t redo_clip_indices[UNDO_MAX_CLIPS];
    uint8_t redo_clip_count;
    uint8_t redo_valid;

    /* Drum-clip recording undo/redo — mutually exclusive with melodic undo_valid. */
    uint8_t  drum_undo_valid;
    uint8_t  drum_undo_track;
    uint8_t  drum_undo_clip;
    uint8_t  drum_redo_valid;
    uint8_t  drum_redo_track;
    uint8_t  drum_redo_clip;
    char     last_restore_info[64]; /* "d t c" or "m t0 c0 t1 c1 ..." — set by undo/redo restore */

    /* Drum effective-mute bitmask per snapshot slot per track (bit L = lane L muted). */
    uint32_t snap_drum_eff_mute[16][NUM_TRACKS];

    drum_rec_snap_lane_t drum_undo_lanes[DRUM_LANES];
    drum_rec_snap_lane_t drum_redo_lanes[DRUM_LANES];

    /* Drum row undo/redo — active alongside undo_valid for row_copy/cut/clear.
     * valid=1: one row (copy/clear); valid=2: two rows (cut, [0]=dst [1]=src). */
    uint8_t drum_row_undo_valid;
    uint8_t drum_row_redo_valid;
    uint8_t drum_row_undo_clips[2];
    uint8_t drum_row_redo_clips[2];
    uint8_t undo_locked; /* set during scene bake to block individual undo_begin calls */
    drum_rec_snap_lane_t drum_row_undo_lanes[2][NUM_TRACKS][DRUM_LANES];
    drum_rec_snap_lane_t drum_row_redo_lanes[2][NUM_TRACKS][DRUM_LANES];

    /* Global MIDI Looper.
     * State machine: IDLE -> ARMED (waiting for boundary) -> CAPTURING ->
     * LOOPING. Stop drops back to IDLE.
     * Capture/loop window length is in master 96-PPQN ticks. While CAPTURING
     * or LOOPING, looper_pos counts 0..capture_ticks-1.
     * pfx_send hooks: in CAPTURING, mirror note-on/off into looper_events[];
     * in LOOPING, suppress emit from looper_on tracks (the playback path
     * sets looper_emitting=1 to bypass the suppress). */
#define LOOPER_STATE_IDLE      0
#define LOOPER_STATE_ARMED     1
#define LOOPER_STATE_CAPTURING 2
#define LOOPER_STATE_LOOPING   3
#define LOOPER_MAX_EVENTS      1024
/* Performance modifier bitmask — 24 mods across 3 rows (bits 0-7=R1 Pitch, 8-15=R2 Vel/Gate, 16-23=R3 Wild). */
#define PERF_MOD_OCT_UP       (1u <<  0)  /* R1: +12 semitones */
#define PERF_MOD_OCT_DOWN     (1u <<  1)  /* R1: -12 semitones */
#define PERF_MOD_SCALE_UP     (1u <<  2)  /* R1: +1 scale degree (scale-aware) */
#define PERF_MOD_SCALE_DOWN   (1u <<  3)  /* R1: -1 scale degree (scale-aware) */
#define PERF_MOD_FIFTH        (1u <<  4)  /* R1: +7 semitones */
#define PERF_MOD_TRITONE      (1u <<  5)  /* R1: +6 semitones */
#define PERF_MOD_DRIFT        (1u <<  6)  /* R1: random walk ±6st, updates each cycle */
#define PERF_MOD_STORM        (1u <<  7)  /* R1: random ±12st per event */
#define PERF_MOD_DECRSC       (1u <<  8)  /* R2: vel ×(1-0.15*cycle), floor 10% — decrescendo */
#define PERF_MOD_SWELL        (1u <<  9)  /* R2: vel follows 16-cycle triangle (loud→quiet→loud) */
#define PERF_MOD_CRESC        (1u << 10)  /* R2: vel ×(1+0.15*cycle), ceil 127 — crescendo */
#define PERF_MOD_PULSE        (1u << 11)  /* R2: even cycles full vel, odd cycles ×0.2 */
#define PERF_MOD_SIDECHAIN    (1u << 12)  /* R2: vel ×(1-0.15*note_idx), floor 10% per cycle */
#define PERF_MOD_STACCATO     (1u << 13)  /* R2: gate = cap/8, via staccato queue */
#define PERF_MOD_LEGATO       (1u << 14)  /* R2: gate = cap-1, via staccato queue */
#define PERF_MOD_RAMP_GATE    (1u << 15)  /* R2: gate ramps up across note-ons in cycle */
#define PERF_MOD_HALFTIME     (1u << 16)  /* R3: suppress every odd cycle */
#define PERF_MOD_TRIPLET_SKIP (1u << 17)  /* R3: suppress every 3rd cycle */
#define PERF_MOD_PHANTOM      (1u << 18)  /* R3: ghost note at pitch-12, vel/4, short gate */
#define PERF_MOD_SPARSE       (1u << 19)  /* R3: ~50% random suppression */
#define PERF_MOD_GLITCH       (1u << 20)  /* R3: random ±5st per event */
#define PERF_MOD_STAGGER      (1u << 21)  /* R3: note N gets +N semitones chromatic */
#define PERF_MOD_SHUFFLE      (1u << 22)  /* R3: randomise pitch order each cycle (drums: hit order) */
#define PERF_MOD_BACKWARDS    (1u << 23)  /* R3: reverse pitch order each cycle */
    uint8_t  looper_state;
    uint8_t  looper_emitting;       /* set during playback emit; pfx_send skips capture/suppress */
    uint16_t looper_capture_ticks;  /* total length of the loop window in master ticks */
    uint32_t looper_pos;            /* 0..capture_ticks-1; advances each master tick while CAPTURING/LOOPING */
    uint16_t looper_play_idx;       /* next event index during LOOPING playback */
    uint16_t looper_event_count;
    /* Queued rate change: while LOOPING, looper_arm with a different rate sets
     * this; at the next loop boundary we transition LOOPING → ARMED with the
     * new rate so the switch lands cleanly on the beat. 0 = no pending. */
    uint16_t looper_pending_rate_ticks;
    struct {
        uint16_t tick;              /* 0..capture_ticks-1 */
        uint8_t  status;
        uint8_t  d1;
        uint8_t  d2;
        uint8_t  track;
        uint8_t  pad[2];
    } looper_events[LOOPER_MAX_EVENTS];
    /* Performance Mode state.
     * perf_emitted_pitch[t][raw] = emitted pitch (0xFF = not sounding).
     * Replaces the old 128-byte bitmap; carries pitch translation for cross-cycle
     * note-off correctness and staccato pending cleanup. */
    uint32_t perf_mods_active;
    uint32_t looper_cycle;
    uint8_t  looper_sync;               /* 1=wait for clock boundary (default), 0=start immediately */
    uint8_t  looper_pending_silence;    /* 1=call looper_silence_active at next render_block tick (ROUTE_MOVE safe) */
    uint8_t  perf_emitted_pitch[NUM_TRACKS][128];
    struct {
        uint8_t  raw_pitch, emitted_pitch, track;
        uint8_t  _pad;
        uint16_t fire_at;
    } perf_staccato_notes[32];           /* staccato, legato, ramp-gate, phantom note-offs */
    uint8_t  perf_staccato_count;
    int8_t   perf_drift_offset;          /* current Drift pitch offset, ±6 semitones */
    uint16_t perf_cycle_note_idx;        /* note-on count for current cycle (sidechain/ramp/stagger) */
    uint16_t perf_note_on_count;         /* total note-ons in loop (for ramp gate divisor) */
    uint16_t perf_current_event_idx;     /* set before each perf_apply() call (shuffle lookup) */
    uint8_t  perf_shuffle_pitches[LOOPER_MAX_EVENTS]; /* pitch permutation built at cycle start */
    /* Deferred save: JS polls state_full get_param; audio thread only sets state_dirty */
    char    state_buf[131072];
    uint8_t state_dirty;

    /* Result of last all_lanes_beat_stretch: 0=none, 1=ok, -1=blocked */
    int all_lanes_stretch_result;

    /* Phase 1: inbound pad MIDI on the audio thread.
     * dsp_inbound_enabled is flipped by JS during the capability handshake
     * once it's confirmed the patched Schwung shim delivers pad presses to
     * on_midi. While 0, on_midi only logs — JS-side pendingLiveNotes still
     * owns the dispatch (stock-Schwung-compatible path).
     * pad_note_map[t][padIdx] holds the resolved MIDI pitch (post key /
     * scale / scale-aware / layout / octave) for each pad on track t. JS
     * pushes the table via tN_padmap whenever its computePadNoteMap output
     * changes. 0xFF = unmapped (skip dispatch). */
    uint8_t  dsp_inbound_enabled;
    uint8_t  pad_note_map[NUM_TRACKS][32];
    /* Pitch actually emitted at each pad's last note-on, so the note-off uses the
     * same pitch even if pad_note_map was repushed mid-hold (e.g. a Key/Scale
     * preview re-layout). 0xFF = no note held on that pad. */
    uint8_t  pad_live_pitch[NUM_TRACKS][32];

    /* Phase 2: capability mirror for shim-side async ROUTE_EXTERNAL send.
     * When 1, pfx_emit / drum_pfx_emit call g_host->midi_send_external
     * directly (shim drains via ovext_worker thread, off the audio thread).
     * When 0 (stock Schwung), they push to ext_queue and JS drains via
     * get_param("ext_queue"). Set by the tN_padmap handler from an optional
     * 33rd token in the payload — JS appends it whenever
     * shadow_overtake_send_external_async_active is present.
     * PHASE-2: remove when patches upstreamed. */
    uint8_t  ext_send_async_active;
    /* JS-driven modal pad-dispatch mute. Set via the 34th tN_padmap token
     * whenever JS's _padDispatchMutedNow() is true (Shift/Delete/Loop/Mute/
     * Copy/Capture/TapTempo holds, session view, etc.). When set, on_midi
     * skips drum_pad_event so modal gestures don't trigger Rpt1/Rpt2 on
     * the prior active track. */
    uint8_t  pad_dispatch_muted;

    /* Phase 1 / Bundle 2: pad-source intent scratch. Set by on_midi just
     * before calling live_note_on / drum_record_note_on / etc., reset at
     * end of dispatch. Holds a pad_source_t value (declared above on_midi).
     * Consumers (Bundle 2A vel-zone bypass, 2B VelIn application, 2C Rpt
     * classifier) read it to decide whether to apply VelIn or skip it.
     * Per-track because on_midi processes one event at a time on the audio
     * thread and the consumer runs synchronously within the same call. */
    uint8_t  pad_source_scratch[NUM_TRACKS];

    /* Phase 1 / Bundle 2A: drum vel-zone mirror. on_midi arms these in
     * drum_pad_event when a right-half pad is pressed on a drum track in
     * NORMAL perform mode (i.e. Rpt1/Rpt2 not running). Volatile session
     * state — JS S.drumVelZoneArmed owns sidecar persistence; this DSP
     * mirror exists for Bundle 2C consumers and to make the JS↔DSP
     * separation explicit. The two mirrors update in parallel on the same
     * hardware event (JS via _onPadPress, DSP via on_midi). */
    uint8_t  drum_vel_zone_armed[NUM_TRACKS];
    uint8_t  drum_last_vel_zone[NUM_TRACKS];  /* 0..15 */

    /* Phase 1: per-(track,pitch) press/release tick snapshots. on_midi writes
     * these at the actual audio buffer the pad event arrives in (audio-thread,
     * single-buffer precision). record_note_on / record_note_off read them
     * back instead of reading tr->current_clip_tick at handler-arrival time,
     * which is 1-2 audio buffers late (JS → tick → set_param hop). Fixes the
     * "press+release in same buffer → gate=1 tick" bug for short staccato.
     * active flag is set on write, cleared on consume. */
    uint32_t on_midi_press_tick[NUM_TRACKS][128];
    uint32_t on_midi_release_tick[NUM_TRACKS][128];
    uint8_t  on_midi_press_active[NUM_TRACKS][128];
    uint8_t  on_midi_release_active[NUM_TRACKS][128];

    /* Drum equivalent: per-(track,lane) step + tick_in_step at press/release.
     * on_midi looks up lane by matching pitch to lane->midi_note (same as
     * drum_record_note_on). Smaller than per-pitch since DRUM_LANES < 128. */
    uint16_t on_midi_drum_press_step[NUM_TRACKS][DRUM_LANES];
    int16_t  on_midi_drum_press_off[NUM_TRACKS][DRUM_LANES];
    uint8_t  on_midi_drum_press_active[NUM_TRACKS][DRUM_LANES];
    uint16_t on_midi_drum_release_step[NUM_TRACKS][DRUM_LANES];
    int16_t  on_midi_drum_release_off[NUM_TRACKS][DRUM_LANES];
    uint8_t  on_midi_drum_release_active[NUM_TRACKS][DRUM_LANES];
} seq8_instance_t;

#endif /* SEQ8_INSTANCE_H */
