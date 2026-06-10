/*
 * SEQ8 clip/note helper routines.
 *
 * Included by seq8.c inside the single translation unit. These helpers keep
 * the dual step-array and note-array clip representations in sync.
 */
#ifndef SEQ8_CLIP_H
#define SEQ8_CLIP_H

/* Logical step for an absolute clip tick using midpoint assignment.
 * Modulo is against SEQ_STEPS (storage capacity), not clip_len: with a
 * non-zero loop_start, clip_len is the window *size* and a note at an
 * absolute tick outside the window must still report its true step index
 * so the playhead (also absolute) can match it. The `clip_len` argument
 * is kept for source compatibility but ignored. */
static uint16_t note_step(uint32_t tick, uint16_t clip_len, uint16_t tps) {
    (void)clip_len;
    uint32_t shifted = tick + (uint32_t)(tps / 2);
    return (uint16_t)((shifted / (uint32_t)tps) % (uint32_t)SEQ_STEPS);
}

/* Find all active note indices in step S; returns count. */
static int notes_in_step(clip_t *cl, uint16_t s, uint16_t *idxs, int max_out) {
    int count = 0;
    uint16_t i;
    for (i = 0; i < cl->note_count && count < max_out; i++) {
        if (!cl->notes[i].active) continue;
        if (note_step(cl->notes[i].tick, cl->length, cl->ticks_per_step) == s)
            idxs[count++] = i;
    }
    return count;
}

/* Rebuild the 256-bit occupancy cache from notes[]. */
static void clip_occ_update(clip_t *cl) {
    memset(cl->occ_cache, 0, sizeof(cl->occ_cache));
    uint16_t i;
    for (i = 0; i < cl->note_count; i++) {
        if (!cl->notes[i].active) continue;
        uint16_t s = note_step(cl->notes[i].tick, cl->length, cl->ticks_per_step);
        cl->occ_cache[s >> 3] |= (uint8_t)(1u << (s & 7));
    }
    cl->occ_dirty = 0;
}

static void clip_clear_suppress(clip_t *cl) {
    uint16_t i;
    for (i = 0; i < cl->note_count; i++)
        cl->notes[i].suppress_until_wrap = 0;
}

/* Finalize gates for notes still held in rec_pending at disarm time.
 * Must be called BEFORE clip_clear_suppress so suppress_until_wrap is still set. */
static void finalize_pending_notes(clip_t *cl, seq8_track_t *tr) {
    uint16_t tps = cl->ticks_per_step;
    uint32_t clip_ticks = (uint32_t)cl->length * tps;
    if (clip_ticks == 0) { tr->rec_pending_count = 0; return; }
    /* Window-anchored; see record_note_on. */
    uint32_t off_tick = tr->current_clip_tick;
    uint32_t gmax = (uint32_t)SEQ_STEPS * tps;
    if (gmax > 65535) gmax = 65535;
    int ri;
    for (ri = 0; ri < (int)tr->rec_pending_count; ri++) {
        uint32_t on_tick = tr->rec_pending[ri].tick_at_on;
        uint32_t gate_ticks = (off_tick >= on_tick) ? off_tick - on_tick
                                                     : clip_ticks - on_tick + off_tick;
        if (gate_ticks < 1) gate_ticks = 1;
        if (gate_ticks > gmax) gate_ticks = gmax;
        /* Update matching note in notes[]; scan newest first. */
        uint16_t ni;
        for (ni = (cl->note_count > 0 ? cl->note_count - 1 : 0);
             ni < cl->note_count; ni--) {
            note_t *n = &cl->notes[ni];
            if (n->active
                    && n->pitch == tr->rec_pending[ri].pitch
                    && n->tick  == on_tick) {
                n->gate = (uint16_t)gate_ticks;
                uint16_t sidx = (uint16_t)(on_tick / tps);
                if (sidx < SEQ_STEPS && cl->steps[sidx])
                    cl->step_gate[sidx] = (uint16_t)gate_ticks;
                break;
            }
            if (ni == 0) break;
        }
    }
    tr->rec_pending_count = 0;
}

/* Insert a note; write all fields before incrementing note_count (render-thread safe). */
static int clip_insert_note(clip_t *cl, uint32_t tick, uint16_t gate,
                             uint8_t pitch, uint8_t vel) {
    if (cl->note_count >= MAX_NOTES_PER_CLIP) return -1;
    int idx = (int)cl->note_count;
    cl->notes[idx].tick              = tick;
    cl->notes[idx].gate              = gate;
    cl->notes[idx].pitch             = pitch;
    cl->notes[idx].vel               = vel;
    cl->notes[idx].suppress_until_wrap = 0;
    cl->notes[idx].pad[0]            = 0;
    cl->notes[idx].pad[1]            = 0;
    cl->notes[idx].active            = 1;   /* activate last */
    cl->note_count++;
    cl->occ_dirty = 1;
#if SEQ8_DEBUG_PROBES
    /* Z4 probe: log every insertion into t1/c0 with caller-trace stub.
     * HOT PATH; fires on every clip note insert (e.g. step-edit rebuilds). */
    if (g_inst && cl == &g_inst->tracks[1].clips[0]) {
        char _zb[160]; snprintf(_zb, sizeof(_zb),
            "Z4 INSERT t1/c0 tick=%u pitch=%u vel=%u gate=%u nc_after=%u rec=%d cit=%d",
            (unsigned)tick, (unsigned)pitch, (unsigned)vel, (unsigned)gate,
            (unsigned)cl->note_count, (int)g_inst->tracks[1].recording,
            (int)g_inst->count_in_ticks);
        seq8_ilog(g_inst, _zb);
    }
#endif
    return idx;
}

/* Distribute 'hits' evenly across 'len' steps; returns count placed (<= hits, <= len).
 * Positions written ascending to out[]. First hit always at step 0.
 * Integer Bresenham distribution (pos[i] = (i * len) / hits); yields the same
 * 0-anchored even spacing as classic Bjorklund for musical use. */
static int bjorklund_positions(int hits, int len, int *out) {
    if (hits <= 0 || len <= 0) return 0;
    if (hits > len) hits = len;
    int i;
    for (i = 0; i < hits; i++) out[i] = (i * len) / hits;
    return hits;
}

/* Rebuild step arrays from notes[]; used after v=11 state load. */
static void clip_build_steps_from_notes(clip_t *cl) {
    int s;
    for (s = 0; s < SEQ_STEPS; s++) {
        cl->steps[s] = 0;
        memset(cl->step_notes[s], 0, 8);
        cl->step_note_count[s] = 0;
        cl->step_vel[s]  = (uint8_t)SEQ_VEL;
        cl->step_gate[s] = (uint16_t)GATE_TICKS;
        memset(cl->note_tick_offset[s], 0, 8 * sizeof(int16_t));
    }
    cl->active = 0;
    cl->occ_dirty = 1;
    uint16_t ni;
    for (ni = 0; ni < cl->note_count; ni++) {
        note_t *n = &cl->notes[ni];
        if (!n->active) continue;
        uint16_t sidx = note_step(n->tick, cl->length, cl->ticks_per_step);
        if (sidx >= SEQ_STEPS || cl->step_note_count[sidx] >= 8) continue;
        int idx = (int)cl->step_note_count[sidx];
        if (idx == 0) {
            cl->step_vel[sidx]  = n->vel;
            cl->step_gate[sidx] = n->gate;
        }
        cl->step_notes[sidx][idx] = n->pitch;
        cl->note_tick_offset[sidx][idx] =
            (int16_t)((int32_t)n->tick - (int32_t)sidx * cl->ticks_per_step);
        cl->step_note_count[sidx]++;
        cl->steps[sidx] = 1;
        cl->active = 1;
    }
}

/* Derive notes[] from step arrays. Called after state load so both representations exist. */
static void clip_migrate_to_notes(clip_t *cl) {
    int s, ni;
    cl->note_count = 0;
    memset(cl->notes, 0, sizeof(cl->notes));
    cl->occ_dirty = 1;
    int tps = (int)cl->ticks_per_step;
    /* Iterate full storage extent, not just the loop window: with a non-zero
     * loop_start the window is a playback subset and step_notes[] outside it
     * must still rebuild into cl->notes[] to preserve out-of-window content. */
    int clip_ticks = SEQ_STEPS * tps;
    for (s = 0; s < SEQ_STEPS; s++) {
        if (cl->step_note_count[s] == 0) continue;
        for (ni = 0; ni < (int)cl->step_note_count[s]; ni++) {
            int32_t abs_tick = (int32_t)s * tps
                               + (int32_t)cl->note_tick_offset[s][ni];
            if (abs_tick < 0) abs_tick += clip_ticks;
            if (abs_tick >= clip_ticks) abs_tick = clip_ticks - 1;
            clip_insert_note(cl, (uint32_t)abs_tick, cl->step_gate[s],
                             cl->step_notes[s][ni], cl->step_vel[s]);
            if (cl->note_count >= MAX_NOTES_PER_CLIP) return;
        }
    }
}

#endif /* SEQ8_CLIP_H */
