/*
 * SEQ8 defaulting and runtime-parameter sync helpers.
 *
 * This header is included by seq8.c inside the single translation unit. Keep
 * lifecycle, file I/O, and render scheduling in seq8.c.
 */
#ifndef SEQ8_INIT_H
#define SEQ8_INIT_H

static void pfx_init_defaults(play_fx_t *fx) {
    pfx_reset(fx);                     /* explicit zero of all stages */
    fx->cached_bpm = (double)BPM_DEFAULT;
    fx->rng        = 12345;
    fx->route      = ROUTE_SCHWUNG;    /* default: Schwung chains */
}

static void clip_pfx_params_init(clip_pfx_params_t *p) {
    p->octave_shift    = 0;
    p->note_offset     = 0;
    p->gate_time       = 100;
    p->velocity_offset = 0;
    p->quantize        = 0;
    p->octaver         = 0;
    p->harmonize_1     = 0;
    p->harmonize_2     = 0;
    p->harmonize_3     = 0;
    p->delay_time_idx  = DEFAULT_DELAY_TIME_IDX;
    p->delay_level     = 127;
    p->repeat_times    = 0;
    p->fb_velocity     = 0;
    p->fb_note         = 0;
    p->fb_note_random      = 0;
    p->fb_note_random_mode = 2;  /* default Walk */
    p->fb_gate_time    = 0;
    p->fb_clock        = 0;
    p->delay_retrig    = 1;
    p->note_random      = 0;
    p->note_random_mode = 2;     /* default Walk */
    p->seq_arp_style     = 0;
    p->seq_arp_rate      = ARP_RATE_DEFAULT;
    p->seq_arp_octaves   = 0;
    p->seq_arp_gate      = 100;
    p->seq_arp_steps_mode = 1;
    p->seq_arp_retrigger = 1;
    p->seq_arp_sync      = 1;
    int i;
    for (i = 0; i < 8; i++) p->seq_arp_step_vel[i] = 4;
    for (i = 0; i < 8; i++) p->seq_arp_step_int[i] = 0;
    p->seq_arp_step_loop_len = 8;
    p->note_length_mode = 0;  /* `--` passthrough */
}

static void drum_pfx_params_init(drum_pfx_params_t *p) {
    p->gate_time       = 100;
    p->velocity_offset = 0;
    p->quantize        = 0;
    p->delay_time_idx  = DEFAULT_DRUM_DELAY_TIME_IDX;
    p->delay_level     = 127;
    p->repeat_times    = 0;
    p->fb_velocity     = 0;
    p->fb_gate_time    = 0;
    p->fb_clock        = 0;
    p->delay_retrig    = 1;
    p->note_length_mode = 0;  /* `--` passthrough */
}

static void drum_pfx_init_defaults(drum_pfx_t *px, uint8_t t_idx, uint8_t l_idx) {
    memset(px, 0, sizeof(*px));
    px->gate_time   = 100;
    px->delay_time_idx = DEFAULT_DRUM_DELAY_TIME_IDX;
    px->cached_bpm  = (double)BPM_DEFAULT;
    px->rng         = 12345;
    px->route       = ROUTE_SCHWUNG;
    px->looper_on   = 1;
    px->track_idx   = t_idx;
    px->lane_idx    = l_idx;
}

/* Copy per-lane drum pfx params into the lane's runtime drum_pfx_t surface.
 * Call this whenever the active clip changes (analogous to pfx_apply_params). */
static void drum_pfx_apply_params(drum_pfx_t *px, const drum_pfx_params_t *p) {
    px->gate_time       = p->gate_time;
    px->velocity_offset = p->velocity_offset;
    px->quantize        = p->quantize;
    px->delay_time_idx  = p->delay_time_idx;
    px->delay_level     = p->delay_level;
    px->repeat_times    = p->repeat_times;
    px->fb_velocity     = p->fb_velocity;
    px->fb_gate_time    = p->fb_gate_time;
    px->fb_clock        = p->fb_clock;
    px->delay_retrig    = p->delay_retrig;
}

/* Copy per-clip pfx params from active clip into tr->pfx (the render surface).
 * Call this whenever active_clip changes so the render path always sees the
 * correct clip's params via tr->pfx. */
static void pfx_apply_params(play_fx_t *fx, const clip_pfx_params_t *p) {
    fx->octave_shift    = p->octave_shift;
    fx->note_offset     = p->note_offset;
    fx->gate_time       = p->gate_time;
    fx->velocity_offset = p->velocity_offset;
    fx->quantize        = p->quantize;
    fx->octaver         = p->octaver;
    fx->harmonize_1     = p->harmonize_1;
    fx->harmonize_2     = p->harmonize_2;
    fx->harmonize_3     = p->harmonize_3;
    fx->delay_time_idx  = p->delay_time_idx;
    fx->delay_level     = p->delay_level;
    fx->repeat_times    = p->repeat_times;
    fx->fb_velocity     = p->fb_velocity;
    fx->fb_note         = p->fb_note;
    fx->fb_note_random      = p->fb_note_random;
    fx->fb_note_random_mode = p->fb_note_random_mode;
    fx->fb_gate_time    = p->fb_gate_time;
    fx->fb_clock        = p->fb_clock;
    fx->delay_retrig    = p->delay_retrig;
    fx->note_random      = p->note_random;
    fx->note_random_mode = p->note_random_mode;
    fx->note_random_walk = 0;   /* reset walk accumulator on clip switch */
    /* SEQ ARP — copy params without disturbing runtime state */
    fx->arp.style      = (uint8_t)clamp_i(p->seq_arp_style,    0, 9);
    fx->arp.rate_idx   = (uint8_t)clamp_i(p->seq_arp_rate,     0, 9);
    fx->arp.octaves = (int8_t)clamp_i(p->seq_arp_octaves, -ARP_MAX_OCTAVES, ARP_MAX_OCTAVES);
    fx->arp.gate_pct   = (uint16_t)clamp_i(p->seq_arp_gate,    1, 200);
    fx->arp.steps_mode = (uint8_t)clamp_i(p->seq_arp_steps_mode, 0, 2);
    fx->arp.retrigger  = (uint8_t)(p->seq_arp_retrigger != 0);
    fx->seq_arp_sync   = (uint8_t)(p->seq_arp_sync != 0);
    int i;
    for (i = 0; i < 8; i++) fx->arp.step_vel[i] = p->seq_arp_step_vel[i];
    for (i = 0; i < 8; i++) fx->arp.step_int[i] = p->seq_arp_step_int[i];
    fx->arp.step_loop_len = (uint8_t)clamp_i((int)p->seq_arp_step_loop_len, 1, 8);
}

static void pfx_sync_from_clip(seq8_track_t *tr) {
    if (tr->pad_mode == PAD_MODE_DRUM) {
        int l;
        for (l = 0; l < DRUM_LANES; l++)
            drum_pfx_apply_params(&tr->drum_lane_pfx[l],
                                  &tr->drum_clips[tr->active_clip]->lanes[l].pfx_params);
        return;
    }
    pfx_apply_params(&tr->pfx, &tr->clips[tr->active_clip].pfx_params);
}

static void tarp_init_defaults(seq8_track_t *tr) {
    tr->tarp_on    = 0;
    tr->tarp_latch = 0;
    tr->tarp_sync  = 1;
    arp_init_defaults(&tr->tarp);
    tr->tarp.style     = 0; /* 0=Off; style drives tarp_on */
    tr->tarp.retrigger = 0; /* TARP default off; arp_init_defaults sets 1 */
}

static void drum_repeat_init_defaults(seq8_track_t *tr) {
    int l, s;
    for (l = 0; l < DRUM_LANES; l++) {
        tr->drum_repeat_gate[l]      = 0xFF;
        tr->drum_repeat_gate_len[l]  = 8;
        tr->drum_repeat2_rate_idx[l] = 2; /* 1/8 default */
        for (s = 0; s < 8; s++) {
            tr->drum_repeat_vel_scale[l][s] = 100;
            tr->drum_repeat_nudge[l][s]     = 0;
        }
    }
}

static void clip_init(clip_t *cl) {
    int s;
    cl->length         = SEQ_STEPS_DEFAULT;
    cl->loop_start     = 0;
    cl->active         = 0;
    cl->clock_shift_pos = 0;
    cl->stretch_exp     = 0;
    cl->nudge_pos       = 0;
    cl->ticks_per_step  = TICKS_PER_STEP;
    clip_pfx_params_init(&cl->pfx_params);
    for (s = 0; s < SEQ_STEPS; s++) {
        cl->steps[s]           = 0;
        memset(cl->step_notes[s], 0, 8);
        cl->step_note_count[s] = 0;
        cl->step_vel[s]        = SEQ_VEL;
        cl->step_gate[s]       = GATE_TICKS;
        memset(cl->note_tick_offset[s], 0, 8 * sizeof(int16_t));
        cl->step_iter[s]       = 0;
        cl->step_random[s]     = 0;
        cl->step_ratchet[s]    = 0;
    }
    cl->loop_cycle = 0;
    cl->note_count = 0;
    memset(cl->notes, 0, sizeof(cl->notes));
    memset(cl->occ_cache, 0, sizeof(cl->occ_cache));
    cl->occ_dirty = 0;
    cl->playback_dir = 0;       /* Forward */
    cl->playback_audio_reverse = 0; /* Step style */
    cl->pp_dir_state = +1;
}

static void drum_track_init(seq8_track_t *tr, int track_idx) {
    int c, l;
    for (c = 0; c < NUM_CLIPS; c++)
        tr->drum_clips[c] = NULL;
    for (l = 0; l < DRUM_LANES; l++) {
        tr->drum_rec_pending_tick[l]   = 0;
        tr->drum_rec_pending_step[l]   = 0;
        tr->drum_rec_pending_active[l] = 0;
        tr->drum_last_rec_step[l]      = -1;
        drum_pfx_init_defaults(&tr->drum_lane_pfx[l], (uint8_t)track_idx, (uint8_t)l);
    }
    tr->active_drum_lane  = 0;  /* Bundle 2A: JS pushes via tN_active_drum_lane */
    tr->drum_perform_mode = 0;  /* Bundle 2A: JS pushes via tN_drum_perform_mode */
}

#endif /* SEQ8_INIT_H */
