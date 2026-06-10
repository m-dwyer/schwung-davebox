/*
 * SEQ8 data model types.
 *
 * Phase 2 starts with the smallest shared transport type, then moves larger
 * pure data structs here in mechanical slices.
 */
#ifndef SEQ8_TYPES_H
#define SEQ8_TYPES_H

#include <stdint.h>
#include "seq8_constants.h"

typedef struct {
    uint8_t s;
    uint8_t d1;
    uint8_t d2;
} ext_msg_t;

typedef struct {
    uint64_t fire_at;
    uint8_t  msg[3];
    uint8_t  flags;
} pfx_event_t;

typedef struct {
    uint8_t  active;
    uint8_t  channel;
    uint64_t on_time;
    uint64_t gate_override_smp;
    uint8_t  orig_velocity;
    uint8_t  gen_notes[MAX_GEN_NOTES];
    int      gen_count;
    double   spc;
    int      stored_repeat_count;
    struct {
        uint64_t cumul_delay;
        int8_t   pitch_offset;
        uint8_t  velocity;
        double   gate_factor;
    } reps[MAX_REPEATS];
} pfx_active_t;

typedef struct {
    uint32_t tick;
    uint16_t gate;
    uint8_t  pitch;
    uint8_t  vel;
    uint8_t  active;
    uint8_t  suppress_until_wrap;
    uint8_t  pad[2];
} note_t;

typedef struct {
    uint16_t count[8];
    uint16_t ticks[8][CC_AUTO_MAX_POINTS];
    uint8_t  vals[8][CC_AUTO_MAX_POINTS];
    uint8_t  rest_val[8];
    uint16_t lane_loop_start[8];
    uint16_t lane_length[8];
    uint16_t lane_tps[8];
    uint16_t lane_res_tps[8];
} cc_auto_t;

typedef struct {
    uint8_t  pitch[AT_MAX_LANES];
    uint16_t count[AT_MAX_LANES];
    uint16_t ticks[AT_MAX_LANES][AT_MAX_POINTS];
    uint8_t  vals [AT_MAX_LANES][AT_MAX_POINTS];
} at_auto_t;

typedef struct {
    uint8_t  style;
    uint8_t  rate_idx;
    int8_t   octaves;
    uint16_t gate_pct;
    uint8_t  steps_mode;
    uint8_t  retrigger;
    uint8_t  step_vel[8];
    int8_t   step_int[8];
    uint8_t  step_loop_len;
    uint32_t master_anchor;

    uint8_t  held_pitch[ARP_MAX_HELD];
    uint8_t  held_vel[ARP_MAX_HELD];
    uint8_t  held_order[ARP_MAX_HELD];
    uint8_t  held_physical[ARP_MAX_HELD];
    uint8_t  held_count;
    uint8_t  next_order;

    int16_t  cyc_pos;
    int8_t   ud_dir;
    uint16_t cycle_step_count;
    uint64_t random_used;

    uint8_t  step_pos;

    int32_t  ticks_until_next;
    uint8_t  pending_first_note;
    uint8_t  pending_retrigger;

    uint8_t  sounding_active;
    uint8_t  sounding_pitch;
    uint32_t gate_remaining;

    uint16_t fire_count;
} arp_engine_t;

typedef struct {
    int octave_shift;
    int note_offset;
    int gate_time;
    int velocity_offset;
    int quantize;
    int octaver;
    int harmonize_1;
    int harmonize_2;
    int harmonize_3;
    int delay_time_idx;
    int delay_level;
    int repeat_times;
    int fb_velocity;
    int fb_note;
    int fb_note_random;
    int fb_note_random_mode;
    int fb_gate_time;
    int fb_clock;
    int delay_retrig;
    int note_random;
    int note_random_mode;
    int note_random_walk;
    arp_engine_t arp;
    uint8_t      arp_emitting;
    uint8_t      seq_arp_sync;
    uint64_t     sample_counter;
    double       cached_bpm;
    uint32_t     rng;
    pfx_event_t  events[MAX_PFX_EVENTS];
    int          event_count;
    pfx_active_t active_notes[128];
    uint8_t      route;
    uint8_t      looper_on;
    uint8_t      track_idx;
    uint8_t      pitch_refcount[128];
} play_fx_t;

typedef struct {
    int octave_shift;
    int note_offset;
    int gate_time;
    int velocity_offset;
    int quantize;
    int octaver;
    int harmonize_1;
    int harmonize_2;
    int harmonize_3;
    int delay_time_idx;
    int delay_level;
    int repeat_times;
    int fb_velocity;
    int fb_note;
    int fb_note_random;
    int fb_note_random_mode;
    int fb_gate_time;
    int fb_clock;
    int delay_retrig;
    int note_random;
    int note_random_mode;
    int seq_arp_style;
    int seq_arp_rate;
    int seq_arp_octaves;
    int seq_arp_gate;
    int seq_arp_steps_mode;
    int seq_arp_retrigger;
    int seq_arp_sync;
    uint8_t seq_arp_step_vel[8];
    int8_t  seq_arp_step_int[8];
    uint8_t seq_arp_step_loop_len;
    uint8_t note_length_mode;
} clip_pfx_params_t;

typedef struct {
    int gate_time;
    int velocity_offset;
    int quantize;
    int delay_time_idx;
    int delay_level;
    int repeat_times;
    int fb_velocity;
    int fb_gate_time;
    int fb_clock;
    int delay_retrig;
    uint8_t note_length_mode;
} drum_pfx_params_t;

typedef struct {
    int gate_time;
    int velocity_offset;
    int quantize;
    int delay_time_idx;
    int delay_level;
    int repeat_times;
    int fb_velocity;
    int fb_gate_time;
    int fb_clock;
    int delay_retrig;
    uint64_t     sample_counter;
    double       cached_bpm;
    uint32_t     rng;
    pfx_event_t  events[DRUM_PFX_MAX_EVENTS];
    int          event_count;
    pfx_active_t active_note;
    uint8_t      route;
    uint8_t      looper_on;
    uint8_t      track_idx;
    uint8_t      lane_idx;
} drum_pfx_t;

typedef struct {
    uint8_t  steps[SEQ_STEPS];
    uint8_t  step_notes[SEQ_STEPS][8];
    uint8_t  step_note_count[SEQ_STEPS];
    uint8_t  step_vel[SEQ_STEPS];
    uint16_t step_gate[SEQ_STEPS];
    int16_t  note_tick_offset[SEQ_STEPS][8];
    uint8_t  step_iter[SEQ_STEPS];
    uint8_t  step_random[SEQ_STEPS];
    uint8_t  step_ratchet[SEQ_STEPS];
    uint16_t loop_cycle;
    uint16_t length;
    uint16_t loop_start;
    uint8_t  active;
    uint16_t clock_shift_pos;
    int8_t   stretch_exp;
    int16_t  nudge_pos;
    uint16_t ticks_per_step;
    clip_pfx_params_t pfx_params;
    note_t   notes[MAX_NOTES_PER_CLIP];
    uint16_t note_count;
    uint8_t  occ_cache[32];
    uint8_t  occ_dirty;
    uint8_t  playback_dir;
    uint8_t  playback_audio_reverse;
    int8_t   pp_dir_state;
} clip_t;

typedef struct {
    clip_t  clip;
    drum_pfx_params_t pfx_params;
    uint8_t midi_note;
    uint8_t _pad[3];
} drum_lane_t;

typedef struct {
    drum_lane_t lanes[DRUM_LANES];
} drum_clip_t;

typedef struct {
    uint8_t  steps[SEQ_STEPS];
    uint8_t  step_notes[SEQ_STEPS][8];
    uint8_t  step_note_count[SEQ_STEPS];
    uint8_t  step_vel[SEQ_STEPS];
    uint16_t step_gate[SEQ_STEPS];
    int16_t  note_tick_offset[SEQ_STEPS][8];
    uint8_t  step_iter[SEQ_STEPS];
    uint8_t  step_random[SEQ_STEPS];
    uint8_t  step_ratchet[SEQ_STEPS];
    uint16_t length;
    uint16_t loop_start;
    uint8_t  active;
    uint8_t  playback_dir;
    uint8_t  playback_audio_reverse;
    drum_pfx_params_t pfx_params;
} drum_rec_snap_lane_t;

#endif /* SEQ8_TYPES_H */
