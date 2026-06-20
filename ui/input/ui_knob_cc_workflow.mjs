/* Knob-turn CC handlers (CCs 71-78) split out of _onCC_knobs.
 *
 * Relative encoder: d2 1-63 = CW (+1), d2 64-127 = CCW (-1). Each knob has
 * per-knob acceleration state (knobAccum / knobLastDir / knobLocked); pm.sens
 * accumulates that many ticks before firing one unit change.
 *
 * _onCC_knobs runs a shared preamble (overlay-swallow + knobTouched bookkeeping)
 * then dispatches through these handlers in order. Each handler:
 *   - returns false when its bank/mode guard doesn't match (fall through to the
 *     next handler), and
 *   - returns true when it consumed the CC (mirrors the original `return;` out
 *     of _onCC_knobs).
 * The drum-CLIP handler is the one exception that falls through for knob 5
 * (K6 has no drum-clip binding), landing on the generic handler — preserved.
 *
 * Handlers take everything via deps so they can be unit-tested without the host. */

/* Shared overlays: heldStep + exclusive dialogs swallow knob turns. Runs before
 * the knobTouched bookkeeping, exactly like the original early returns. */
export function handleUiKnobOverlaySwallow(S, deps, d1, d2) {
    if (d1 < 71 || d1 > 78) return false;
    if (S.heldStep >= 0) return true;
    if (S.globalMenuOpen || S.tapTempoOpen || S.confirmBake || S.confirmClearSession || S.confirmConvertToDrum || S.confirmExport || S.exportDoneDialog || S.recordBlockedDialog || S.confirmStateWipe) return true;
    return false;
}

export function handleUiKnobSchwungSoundPage(S, deps, d1, d2) {
    if (d1 < 71 || d1 > 78) return false;
    if (!S.schwungSoundPage || !S.schwungSoundPage.paramDetail) return false;
    const delta = deps.decodeDelta ? deps.decodeDelta(d2) : (d2 >= 1 && d2 <= 63 ? 1 : (d2 >= 65 && d2 <= 127 ? -1 : 0));
    if (delta === 0) return true;
    deps.adjustSchwungSoundVisibleParam(d1 - 71, delta);
    deps.forceRedraw();
    return true;
}

/* Arp Steps interval-mode overlay: K1-K8 set per-step scale-degree offset (±24)
 * for SEQ ARP (bank 4, per-clip) or TARP (bank 5, per-track). Fires for both
 * track types, ahead of the drum/melodic branches. */
export function handleUiKnobStepInterval(S, deps, d1, d2) {
    if (d1 < 71 || d1 > 78) return false;
    const knobIdx = d1 - 71;
    const bank = S.activeBank;
    if (!(S.stepIntervalMode && (bank === 4 || bank === 5))) return false;
    const t   = S.activeTrack;
    const dir = (d2 >= 1 && d2 <= 63) ? 1 : -1;
    if (dir !== S.knobLastDir[knobIdx]) { S.knobAccum[knobIdx] = 0; S.knobLastDir[knobIdx] = dir; }
    S.knobAccum[knobIdx]++;
    if (S.knobAccum[knobIdx] >= 2) {
        S.knobAccum[knobIdx] = 0;
        if (bank === 4) {
            const ac = deps.effectiveClip(t);
            const cur = S.seqArpStepInt[t][ac][knobIdx] | 0;
            const nxt = Math.max(-24, Math.min(24, cur + dir));
            if (nxt !== cur) {
                S.seqArpStepInt[t][ac][knobIdx] = nxt;
                /* Writes to active-clip pfx_params via pfx_set; matches the
                 * tN_seq_arp_step_vel routing. */
                if (deps.setParam)
                    deps.setParam('t' + t + '_seq_arp_step_int', knobIdx + ' ' + nxt);
            }
        } else {
            const cur = S.tarpStepInt[t][knobIdx] | 0;
            const nxt = Math.max(-24, Math.min(24, cur + dir));
            if (nxt !== cur) {
                S.tarpStepInt[t][knobIdx] = nxt;
                if (deps.setParam)
                    deps.setParam('t' + t + '_tarp_step_int', knobIdx + ' ' + nxt);
            }
        }
    }
    return true;
}

/* Drum CLIP bank (bank 0): K1=Res K2=Stch K3=Shft K4=Lgto K5=Eucl K7=Dir K8=SqFl.
 * K6 (knob 5) has no binding here — falls through to the generic handler. */
export function handleUiKnobDrumClip(S, deps, d1, d2) {
    if (d1 < 71 || d1 > 78) return false;
    const knobIdx = d1 - 71;
    const bank = S.activeBank;
    if (!(S.trackPadMode[S.activeTrack] === deps.padModeDrum && bank === 0)) return false;
    const t    = S.activeTrack;
    const ac   = deps.effectiveClip(t);
    const lane = S.activeDrumLane[t];
    const dir  = (d2 >= 1 && d2 <= 63) ? 1 : -1;
    if (dir !== S.knobLastDir[knobIdx]) { S.knobAccum[knobIdx] = 0; S.knobLastDir[knobIdx] = dir; }

    if (knobIdx === 0) {
        /* K1 = Res (normal=proportional rescale; alt=zoom, sens=16) */
        S.knobAccum[knobIdx]++;
        if (S.knobAccum[knobIdx] >= 16) {
            S.knobAccum[knobIdx] = 0;
            const curIdx = Math.max(0, deps.tpsValues.indexOf(S.drumLaneTPS[t]));
            const nv = Math.max(0, Math.min(5, curIdx + dir));
            if (nv !== curIdx) {
                if (S.altMode) {
                    const newTps = deps.tpsValues[nv];
                    const newLen = Math.ceil(S.drumLaneLength[t] * S.drumLaneTPS[t] / newTps);
                    if (newLen > 256) {
                        deps.showActionPopup('NOTES OUT', 'OF RANGE');
                        deps.forceRedraw();
                    } else if (S.heldStep >= 0) {
                        /* blocked during step edit */
                    } else {
                        S.drumLaneTPS[t]    = newTps;
                        S.drumLaneLength[t] = newLen;
                        S.bankParams[t][0][knobIdx] = nv;
                        const maxPage = Math.max(0, Math.ceil(newLen / 16) - 1);
                        if (S.drumStepPage[t] > maxPage) S.drumStepPage[t] = maxPage;
                        if (deps.setParam)
                            deps.setParam('t' + t + '_l' + lane + '_clip_resolution_zoom', String(nv));
                        S.pendingDrumLaneResync = 2; S.pendingDrumLaneResyncTrack = t; S.pendingDrumLaneResyncLane = lane;
                        deps.forceRedraw();
                    }
                } else {
                    S.drumLaneTPS[t] = deps.tpsValues[nv];
                    S.bankParams[t][0][knobIdx] = nv;
                    if (deps.setParam)
                        deps.setParam('t' + t + '_l' + lane + '_clip_resolution', String(nv));
                    S.pendingDrumResync = 2; S.pendingDrumResyncTrack = t;
                }
            }
            S.screenDirty = true;
        }
        return true;
    }
    if (knobIdx === 1) {
        /* K2 = Stch (beat stretch, lock, sens=16) */
        if (S.knobLocked[knobIdx]) return true;
        const len = S.drumLaneLength[t];
        const canFire = dir === 1 ? (len * 2 <= 256) : (len >= 2);
        if (!canFire) return true;
        S.knobAccum[knobIdx]++;
        if (S.knobAccum[knobIdx] >= 16) {
            S.knobAccum[knobIdx] = 0;
            if (deps.setParam)
                deps.setParam('t' + t + '_l' + lane + '_beat_stretch', String(dir));
            S.knobLocked[knobIdx] = true;
            const blocked = deps.getParam('t' + t + '_beat_stretch_blocked') === '1';
            if (dir === -1 && blocked) {
                S.stretchBlockedEndTick = S.tickCount + deps.stretchBlockedTicks;
            } else {
                S.drumLaneLength[t] = dir === 1 ? len * 2 : Math.floor(len / 2);
                const maxPage = Math.max(0, Math.ceil(S.drumLaneLength[t] / 16) - 1);
                if (S.drumStepPage[t] > maxPage) S.drumStepPage[t] = maxPage;
                S.bankParams[t][0][1] = dir;
                S.pendingDrumResync = 2; S.pendingDrumResyncTrack = t;
            }
            S.screenDirty = true;
        }
        return true;
    }
    if (knobIdx === 2) {
        /* K3 = Shft (clock shift, sens=8). Alt = Nudge (sens=4, faster). */
        S.knobAccum[knobIdx]++;
        if (S.knobAccum[knobIdx] >= (S.altMode ? 4 : 8)) {
            S.knobAccum[knobIdx] = 0;
            if (S.altMode) {
                S.bankParams[t][0][knobIdx] += dir;
                if (deps.setParam)
                    deps.setParam('t' + t + '_l' + lane + '_nudge', String(dir));
            } else {
                S.clockShiftTouchDelta += dir;
                S.bankParams[t][0][knobIdx] = S.clockShiftTouchDelta;
                if (deps.setParam)
                    deps.setParam('t' + t + '_l' + lane + '_clock_shift', String(dir));
            }
            S.pendingDrumLaneResync = 2; S.pendingDrumLaneResyncTrack = t; S.pendingDrumLaneResyncLane = lane;
            S.screenDirty = true;
        }
        return true;
    }
    if (knobIdx === 3) {
        /* K4 = Lgto: destructive one-shot. Right-turn opens confirm dialog. */
        if (S.knobLocked[knobIdx]) return true;
        if (dir !== 1) return true;
        S.knobAccum[knobIdx]++;
        if (S.knobAccum[knobIdx] >= 16) {
            S.knobAccum[knobIdx] = 0;
            S.confirmLgto       = true;
            S.confirmLgtoSel    = 0;
            S.confirmLgtoIsDrum = true;
            S.knobLocked[knobIdx] = true;
            deps.forceRedraw();
        }
        return true;
    }
    if (knobIdx === 4) {
        /* K5 = Eucl (Bjorklund hit count, sens=8) */
        S.knobAccum[knobIdx]++;
        if (S.knobAccum[knobIdx] >= 8) {
            S.knobAccum[knobIdx] = 0;
            const len  = S.drumLaneLength[t];
            const prev = Math.min(S.drumLaneEuclidN[t][lane] | 0, len);
            const nv   = Math.max(0, Math.min(len, prev + dir));
            if (nv !== prev) {
                const vel = deps.stepEntryVelocity(t, -1, true);
                if (deps.setParam)
                    deps.setParam('t' + t + '_l' + lane + '_euclid_stamp',
                                          prev + ' ' + nv + ' ' + vel);
                S.drumLaneEuclidN[t][lane] = nv;
                S.bankParams[t][0][4] = nv;
                S.pendingDrumLaneResync = 2; S.pendingDrumLaneResyncTrack = t; S.pendingDrumLaneResyncLane = lane;
            }
            S.screenDirty = true;
        }
        return true;
    }
    if (knobIdx === 6) {
        /* K7 = Dir (per-lane playback direction, sens=16).
         * AltMode flips this to Step / Audio playback style (sens=4). */
        S.knobAccum[knobIdx]++;
        const _k7Sens = S.altMode ? 4 : 16;
        if (S.knobAccum[knobIdx] >= _k7Sens) {
            S.knobAccum[knobIdx] = 0;
            if (S.altMode) {
                const _cur = S.drumLanePlaybackAudioReverse[t][lane] | 0;
                const _nv  = Math.max(0, Math.min(1, _cur + dir));
                if (_nv !== _cur) {
                    S.drumLanePlaybackAudioReverse[t][lane] = _nv;
                    if (deps.setParam)
                        deps.setParam('t' + t + '_l' + lane + '_playback_audio_reverse', String(_nv));
                }
            } else {
                const _cur = S.drumLanePlaybackDir[t][lane] | 0;
                const _nv  = Math.max(0, Math.min(3, _cur + dir));
                if (_nv !== _cur) {
                    S.drumLanePlaybackDir[t][lane] = _nv;
                    S.bankParams[t][0][6] = _nv;
                    if (deps.setParam)
                        deps.setParam('t' + t + '_l' + lane + '_playback_dir', String(_nv));
                }
            }
            S.screenDirty = true;
        }
        return true;
    }
    if (knobIdx === 7) {
        /* K8 = SqFl: sens=16 — matches melodic */
        S.knobAccum[knobIdx]++;
        if (S.knobAccum[knobIdx] >= 16) {
            S.knobAccum[knobIdx] = 0;
            const _cur = S.clipSeqFollow[t][ac] ? 1 : 0;
            const _nv  = Math.max(0, Math.min(1, _cur + dir));
            if (_nv !== _cur) {
                S.clipSeqFollow[t][ac] = _nv !== 0;
                S.bankParams[t][0][7]  = _nv;
                S.screenDirty = true;
            }
        }
        return true;
    }
    return false;
}

/* ALL LANES bank (drum, bank 7): K1=Res K2=Stch K3=Shft K4=Qnt K5=VelIn K6=InQ
 * K7=Dir K8=SyncRpt. Swallows everything while unconfirmed. */
export function handleUiKnobDrumAllLanes(S, deps, d1, d2) {
    if (d1 < 71 || d1 > 78) return false;
    const knobIdx = d1 - 71;
    const bank = S.activeBank;
    if (!(S.trackPadMode[S.activeTrack] === deps.padModeDrum && bank === 7)) return false;
    if (!S.allLanesConfirmed) {
        S.screenDirty = true;
        return true;
    }
    const t   = S.activeTrack;
    const dir = (d2 >= 1 && d2 <= 63) ? 1 : -1;
    if (dir !== S.knobLastDir[knobIdx]) { S.knobAccum[knobIdx] = 0; S.knobLastDir[knobIdx] = dir; }
    if (knobIdx === 0) {
        /* K1 = Res: set resolution on all 32 lanes (absolute), sens=16 */
        S.knobAccum[knobIdx]++;
        if (S.knobAccum[knobIdx] >= 16) {
            S.knobAccum[knobIdx] = 0;
            const curIdx = S.bankParams[t][7][0] < 0 ? -1 : S.bankParams[t][7][0];
            const nv = Math.max(0, Math.min(5, curIdx + dir));
            if (nv !== curIdx) {
                S.bankParams[t][7][0] = nv;
                S.drumLaneTPS[t] = deps.tpsValues[nv];
                deps.setParam('t' + t + '_all_lanes_clip_resolution', String(nv));
                S.pendingDrumResync = 2; S.pendingDrumResyncTrack = t;
            }
            S.screenDirty = true;
        }
        return true;
    }
    if (knobIdx === 1) {
        /* K2 = Stch: beat stretch all lanes, lock, sens=16 */
        if (S.knobLocked[knobIdx]) return true;
        S.knobAccum[knobIdx]++;
        if (S.knobAccum[knobIdx] >= 16) {
            S.knobAccum[knobIdx] = 0;
            deps.setParam('t' + t + '_all_lanes_beat_stretch', String(dir));
            S.knobLocked[knobIdx] = true;
            S.bankParams[t][7][1] += dir;
            S.pendingAllLanesStretchCheck = t;
            S.pendingDrumResync = 2; S.pendingDrumResyncTrack = t;
            S.screenDirty = true;
        }
        return true;
    }
    if (knobIdx === 2) {
        /* K3 = Shft: clock shift all lanes, sens=8. Alt = Nudge (sens=1). */
        S.knobAccum[knobIdx]++;
        if (S.knobAccum[knobIdx] >= (S.altMode ? 1 : 8)) {
            S.knobAccum[knobIdx] = 0;
            if (S.altMode) {
                S.bankParams[t][7][2] += dir;
                deps.setParam('t' + t + '_all_lanes_nudge', String(dir));
            } else {
                S.clockShiftTouchDelta += dir;
                S.bankParams[t][7][2] = S.clockShiftTouchDelta;
                deps.setParam('t' + t + '_all_lanes_clock_shift', String(dir));
            }
            S.pendingDrumResync = 2; S.pendingDrumResyncTrack = t;
            S.screenDirty = true;
        }
        return true;
    }
    if (knobIdx === 3) {
        /* K4 = Qnt: quantize all lanes 0-100, sens=1 */
        S.knobAccum[knobIdx]++;
        if (S.knobAccum[knobIdx] >= 1) {
            S.knobAccum[knobIdx] = 0;
            const cur7q = S.bankParams[t][7][3] < 0 ? 0 : S.bankParams[t][7][3];
            const nv = Math.max(0, Math.min(100, cur7q + dir));
            if (nv !== cur7q) {
                S.bankParams[t][7][3] = nv;
                S.drumLaneQnt[t] = nv;
                S.bankParams[t][1][2] = nv;
                deps.setParam('t' + t + '_drum_lanes_qnt', String(nv));
            }
            S.screenDirty = true;
        }
        return true;
    }
    if (knobIdx === 4) {
        /* K5 = VelIn: track velocity override, sens=1 */
        const cur7v = S.trackVelOverride[t];
        const nv = Math.max(0, Math.min(127, cur7v + dir));
        if (nv !== cur7v) deps.applyTrackConfig(t, 'track_vel_override', nv);
        S.screenDirty = true;
        return true;
    }
    if (knobIdx === 5) {
        /* K6 = InQ: per-track drum input quantize, 9 values (0=Off..8=1/4T), sens=8 */
        S.knobAccum[knobIdx]++;
        if (S.knobAccum[knobIdx] >= 8) {
            S.knobAccum[knobIdx] = 0;
            const nv = Math.max(0, Math.min(8, S.drumInpQuant[t] + dir));
            if (nv !== S.drumInpQuant[t]) {
                S.drumInpQuant[t] = nv;
                S.bankParams[t][7][5] = nv;
                deps.setParam('t' + t + '_diq', String(nv));
            }
            S.screenDirty = true;
        }
        return true;
    }
    if (knobIdx === 6) {
        /* K7 = Dir: set playback direction on all 32 lanes, sens=16.
         * Alt = RvSt (audio reverse on all lanes), sens=4. */
        S.knobAccum[knobIdx]++;
        const _k7Sens = S.altMode ? 4 : 16;
        if (S.knobAccum[knobIdx] >= _k7Sens) {
            S.knobAccum[knobIdx] = 0;
            if (S.altMode) {
                const curRv = S.bankParams[t][7][6] < 0 ? -1 : S.bankParams[t][7][6];
                const nvRv = Math.max(0, Math.min(1, curRv + dir));
                if (nvRv !== curRv) {
                    S.bankParams[t][7][6] = nvRv;
                    deps.setParam('t' + t + '_all_lanes_playback_audio_reverse', String(nvRv));
                }
            } else {
                const curDir = S.bankParams[t][7][6] < 0 ? -1 : S.bankParams[t][7][6];
                const nvDir = Math.max(0, Math.min(3, curDir + dir));
                if (nvDir !== curDir) {
                    S.bankParams[t][7][6] = nvDir;
                    deps.setParam('t' + t + '_all_lanes_playback_dir', String(nvDir));
                }
            }
            S.screenDirty = true;
        }
        return true;
    }
    if (knobIdx === 7) {
        /* K8 = SyncRpt: per-track drum repeat sync toggle, bool, sens=8 */
        S.knobAccum[knobIdx]++;
        if (S.knobAccum[knobIdx] >= 8) {
            S.knobAccum[knobIdx] = 0;
            const cur7s = S.bankParams[t][7][7] | 0;
            const nv = Math.max(0, Math.min(1, cur7s + dir));
            if (nv !== cur7s) {
                S.bankParams[t][7][7] = nv;
                deps.setParam('t' + t + '_drum_repeat_sync', String(nv));
            }
            S.screenDirty = true;
        }
        return true;
    }
    return true;
}

/* Drum NOTE FX bank (bank 1): K1=LaneOct K2=LaneNote K3=Vel K4=Qnt K5=Len K6=Gate;
 * K7/K8 blocked. */
export function handleUiKnobDrumNoteFX(S, deps, d1, d2) {
    if (d1 < 71 || d1 > 78) return false;
    const knobIdx = d1 - 71;
    const bank = S.activeBank;
    if (!(S.trackPadMode[S.activeTrack] === deps.padModeDrum && bank === 1)) return false;
    if (knobIdx >= 6) return true;
    const t    = S.activeTrack;
    const lane = S.activeDrumLane[t];
    const dir  = (d2 >= 1 && d2 <= 63) ? 1 : -1;
    if (dir !== S.knobLastDir[knobIdx]) { S.knobAccum[knobIdx] = 0; S.knobLastDir[knobIdx] = dir; }
    if (knobIdx === 0 || knobIdx === 1) {
        /* K1 = LaneOct (±12 semitones), K2 = LaneNote (±1 semitone), sens=16 */
        S.knobAccum[knobIdx]++;
        if (S.knobAccum[knobIdx] >= 16) {
            S.knobAccum[knobIdx] = 0;
            const delta = knobIdx === 0 ? dir * 12 : dir;
            const nv = Math.max(0, Math.min(127, S.drumLaneNote[t][lane] + delta));
            if (nv !== S.drumLaneNote[t][lane]) {
                S.drumLaneNote[t][lane] = nv;
                if (deps.setParam)
                    deps.setParam('t' + t + '_l' + lane + '_lane_note', String(nv));
                /* PHASE-1: DSP padmap caches the resolved lane notes; re-push
                 * so on_midi dispatches the new note for this lane's pads. */
                if (t === S.activeTrack) deps.computePadNoteMap();
                S.screenDirty = true;
            }
        }
        return true;
    }
    if (knobIdx === 2) {
        /* K3 = Vel: -127..127, sens=1 */
        S.knobAccum[knobIdx]++;
        if (S.knobAccum[knobIdx] >= 1) {
            S.knobAccum[knobIdx] = 0;
            const nv = Math.max(-127, Math.min(127, (S.bankParams[t][1][1] | 0) + dir));
            if (nv !== S.bankParams[t][1][1]) {
                S.bankParams[t][1][1] = nv;
                if (deps.setParam)
                    deps.setParam('t' + t + '_l' + lane + '_pfx_set', 'velocity_offset ' + nv);
            }
            S.screenDirty = true;
        }
        return true;
    }
    if (knobIdx === 3) {
        /* K4 = Qnt — per-lane quantize, sens=1 */
        S.knobAccum[knobIdx]++;
        if (S.knobAccum[knobIdx] >= 1) {
            S.knobAccum[knobIdx] = 0;
            const nv = Math.max(0, Math.min(100, S.drumLaneQnt[t] + dir));
            if (nv !== S.drumLaneQnt[t]) {
                S.drumLaneQnt[t] = nv;
                S.bankParams[t][1][2] = nv;
                if (deps.setParam)
                    deps.setParam('t' + t + '_l' + lane + '_pfx_set', 'quantize ' + nv);
            }
            S.screenDirty = true;
        }
        return true;
    }
    if (knobIdx === 4) {
        /* K5 = Len: 0..8 (--/.25/.5/.75/1/2/4/8/16), sens=8 */
        S.knobAccum[knobIdx]++;
        if (S.knobAccum[knobIdx] >= 8) {
            S.knobAccum[knobIdx] = 0;
            const cur = S.drumLaneLenMode[t][lane] | 0;
            const nv  = Math.max(0, Math.min(8, cur + dir));
            if (nv !== cur) {
                S.drumLaneLenMode[t][lane] = nv;
                if (deps.setParam)
                    deps.setParam('t' + t + '_l' + lane + '_pfx_set', 'note_length_mode ' + nv);
            }
            S.screenDirty = true;
        }
        return true;
    }
    if (knobIdx === 5) {
        /* K6 = Gate: 0-400, sens=2 */
        S.knobAccum[knobIdx]++;
        if (S.knobAccum[knobIdx] >= 2) {
            S.knobAccum[knobIdx] = 0;
            const nv = Math.max(0, Math.min(400, (S.bankParams[t][1][0] | 0) + dir));
            if (nv !== S.bankParams[t][1][0]) {
                S.bankParams[t][1][0] = nv;
                if (deps.setParam)
                    deps.setParam('t' + t + '_l' + lane + '_pfx_set', 'gate_time ' + nv);
            }
            S.screenDirty = true;
        }
        return true;
    }
    return true;
}

/* Repeat Groove bank (bank 5 on drum tracks): vel scale (unshifted) or nudge
 * (Shift), one step per knob, sens=2. */
export function handleUiKnobDrumRepeatGroove(S, deps, d1, d2) {
    if (d1 < 71 || d1 > 78) return false;
    const knobIdx = d1 - 71;
    const bank = S.activeBank;
    if (!(S.trackPadMode[S.activeTrack] === deps.padModeDrum && bank === 5)) return false;
    const t    = S.activeTrack;
    const lane = S.activeDrumLane[t];
    const dir  = (d2 >= 1 && d2 <= 63) ? 1 : -1;
    if (dir !== S.knobLastDir[knobIdx]) { S.knobAccum[knobIdx] = 0; S.knobLastDir[knobIdx] = dir; }
    S.knobAccum[knobIdx]++;
    if (S.knobAccum[knobIdx] >= 2) {
        S.knobAccum[knobIdx] = 0;
        const step = knobIdx;
        deps.editDrumRepeatGrooveStep(t, lane, step, dir, S.altMode);
    }
    return true;
}

/* CC PARAM bank (bank 6, melodic-only): Shift+turn picks type/CC number; normal
 * turn sets the clip's resting value, records automation (armed), or auditions
 * (automated+playing); Delete+turn clears the knob's automation + resting value.
 * See notes/cc-automation-redesign.md §5/§8. */
export function handleUiKnobCcParam(S, deps, d1, d2) {
    if (d1 < 71 || d1 > 78) return false;
    const knobIdx = d1 - 71;
    const bank = S.activeBank;
    if (bank !== 6) return false;
    const t  = S.activeTrack;
    if (S.trackPadMode[t] === deps.padModeDrum) return true;  /* CC bank is melodic-only */
    const ac = deps.effectiveClip(t);
    const _setp = (k, v) => { if (deps.setParam) deps.setParam("t" + t + "_" + k, v); };
    /* Active lane = last-touched knob; persistent (no timeout). */
    S.ccActiveLane[t] = knobIdx;
    const dir = (d2 >= 1 && d2 <= 63) ? 1 : -1;
    if (dir !== S.knobLastDir[knobIdx]) { S.knobAccum[knobIdx] = 0; S.knobLastDir[knobIdx] = dir; }
    S.knobAccum[knobIdx]++;

    /* alt mode: type/number ladder — Sch1..Sch8 (type 2) ↔ AT (type 1) ↔ CC0..CC127 (type 0).
     * Sch (chain knob) only available when patched Schwung is present.
     * Unified position: CC0..127 = 0..127, AT = -1, Sch1 = -2, Sch2 = -3, ..., Sch8 = -9.
     * When type=2, trackCCAssign holds the chain knob number (1-8). */
    if (S.altMode) {
        if (S.knobAccum[knobIdx] >= 4) {
            S.knobAccum[knobIdx] = 0;
            const hasSch = deps.hasShadowSetParam;
            const cur = (S.trackCCType[t][knobIdx] === 2) ? -(S.trackCCAssign[t][knobIdx] + 1)
                      : (S.trackCCType[t][knobIdx] === 1) ? -1
                      : S.trackCCAssign[t][knobIdx];
            const minVal = hasSch ? -9 : -1;
            const nx  = Math.max(minVal, Math.min(127, cur + dir));
            if (nx <= -2) {
                const schKnob = -(nx + 1);
                S.trackCCType[t][knobIdx] = 2;
                S.trackCCAssign[t][knobIdx] = schKnob;
                S.schLabel[t][knobIdx] = null;
                _setp('cc_type_assign', knobIdx + ' 2 ' + schKnob);
            } else if (nx === -1) {
                S.trackCCType[t][knobIdx] = 1;
                _setp('cc_type_assign', knobIdx + ' 1 ' + S.trackCCAssign[t][knobIdx]);
            } else {
                S.trackCCType[t][knobIdx] = 0;
                S.trackCCAssign[t][knobIdx] = nx;
                _setp('cc_type_assign', knobIdx + ' 0 ' + nx);
            }
            S.screenDirty = true;
        }
        return true;
    }

    /* Held step: the step editor (_onCC_stepedit) is the sole writer. */
    if (S.heldStep >= 0 && S.trackPadMode[t] !== deps.padModeDrum) return true;

    /* Delete+turn: clear this knob's automation AND resting value → "—". */
    if (S.deleteHeld) {
        S.trackCCAutoBits[t][ac] &= ~(1 << knobIdx);
        S.trackCCLiveVal[t][knobIdx] = -1;
        S.clipCCVal[t][ac][knobIdx]  = -1;
        _setp('cc_auto_clear_k', ac + ' ' + knobIdx);
        deps.showActionPopup('CC', 'CLEAR');
        deps.invalidateLEDCache();
        return true;
    }

    /* Normal turn: run-length acceleration (first few clicks ±1, sustained turning ramps up). */
    const accel = deps.ccKnobDelta(d2, knobIdx);
    if (accel === 0) return true;
    const armed   = S.recordArmed && !S.recordCountingIn && S.recordArmedTrack === t;
    const hasAuto = (S.trackCCAutoBits[t][ac] >> knobIdx) & 1;

    if (armed) {
        /* Record automation. */
        const base = (S.trackCCLiveVal[t][knobIdx] >= 0) ? S.trackCCLiveVal[t][knobIdx]
                   : (S.clipCCVal[t][ac][knobIdx] >= 0 ? S.clipCCVal[t][ac][knobIdx] : 0);
        const nv = Math.max(0, Math.min(127, base + accel));
        S.trackCCLiveVal[t][knobIdx] = nv;
        _setp('cc_send', knobIdx + ' ' + nv);
        S.trackCCAutoBits[t][ac] |= (1 << knobIdx);
        S.screenDirty = true;
        return true;
    }
    if (S.playing && hasAuto) {
        /* Automated lane, playing, not armed: transient live audition only. */
        const base = (S.trackCCLiveVal[t][knobIdx] >= 0) ? S.trackCCLiveVal[t][knobIdx] : 0;
        const nv = Math.max(0, Math.min(127, base + accel));
        S.trackCCLiveVal[t][knobIdx] = nv;
        _setp('cc_send', knobIdx + ' ' + nv);
        S.screenDirty = true;
        return true;
    }
    /* Stopped, or playing on an un-automated lane: set the clip resting value.
     * "—" floor: crossing below 0 → "—"; from "—" the first up-step lands on 0. */
    const cur = S.clipCCVal[t][ac][knobIdx];
    let nv;
    if (cur < 0) nv = (accel > 0) ? (accel - 1) : -1;
    else        { nv = cur + accel; if (nv < 0) nv = -1; }
    nv = Math.max(-1, Math.min(127, nv));
    if (nv === cur) return true;
    S.clipCCVal[t][ac][knobIdx]  = nv;
    S.trackCCLiveVal[t][knobIdx] = nv;
    _setp('cc_rest', ac + ' ' + knobIdx + ' ' + (nv < 0 ? 255 : nv));
    S.screenDirty = true;
    return true;
}

/* Alt+K8 on NOTE FX (bank 1) or DELAY (bank 3), melodic: cycle random algorithm
 * (Pure/Gaus/Walk). */
export function handleUiKnobAltRandomMode(S, deps, d1, d2) {
    if (d1 < 71 || d1 > 78) return false;
    const knobIdx = d1 - 71;
    const bank = S.activeBank;
    if (!(S.altMode && S.trackPadMode[S.activeTrack] !== deps.padModeDrum &&
            ((bank === 1 && knobIdx === 7) || (bank === 3 && knobIdx === 7)))) return false;
    const dir = (d2 >= 1 && d2 <= 63) ? 1 : -1;
    if (dir !== S.knobLastDir[knobIdx]) { S.knobAccum[knobIdx] = 0; S.knobLastDir[knobIdx] = dir; }
    S.knobAccum[knobIdx]++;
    if (S.knobAccum[knobIdx] >= 16) {
        S.knobAccum[knobIdx] = 0;
        const t = S.activeTrack;
        const isMidi = bank === 3;
        const cur = isMidi ? (S.midiDlyRandomMode[t] || 0) : (S.noteFXRandomMode[t] || 0);
        const nv = ((cur + dir) % 3 + 3) % 3;
        if (isMidi) { S.midiDlyRandomMode[t] = nv; }
        else        { S.noteFXRandomMode[t]  = nv; }
        if (deps.setParam)
            deps.setParam(isMidi ? 'delay_pitch_random_mode' : 'noteFX_random_mode', String(nv));
        S.screenDirty = true;
    }
    return true;
}

/* Shift+K1 on DELAY bank (melodic): clock feedback. K7 now hosts delay_retrig;
 * clock_fb folds onto the Shift modifier on K1 with a "Rate"↔"ClkF" label flip.
 * Mirror stored in S.delayClockFb since bankParams[t][3][6] now stores retrig. */
export function handleUiKnobAltDelayClockFb(S, deps, d1, d2) {
    if (d1 < 71 || d1 > 78) return false;
    const knobIdx = d1 - 71;
    const bank = S.activeBank;
    if (!(S.altMode && S.trackPadMode[S.activeTrack] !== deps.padModeDrum &&
            bank === 3 && knobIdx === 0)) return false;
    const t   = S.activeTrack;
    const dir = (d2 >= 1 && d2 <= 63) ? 1 : -1;
    if (dir !== S.knobLastDir[knobIdx]) { S.knobAccum[knobIdx] = 0; S.knobLastDir[knobIdx] = dir; }
    S.knobAccum[knobIdx]++;
    if (S.knobAccum[knobIdx] >= 1) {
        S.knobAccum[knobIdx] = 0;
        const nv = Math.max(-100, Math.min(100, (S.delayClockFb[t] | 0) + dir));
        if (nv !== S.delayClockFb[t]) {
            S.delayClockFb[t] = nv;
            if (deps.setParam)
                deps.setParam('t' + t + '_delay_clock_fb', String(nv));
        }
        S.screenDirty = true;
    }
    return true;
}

/* Melodic CLIP K6 = InQ — per-track input quantize, mirrors drum ALL LANES K5.
 * Keeps S.drumInpQuant (the shared JS mirror) in sync with bankParams[t][0][4].
 * The DSP field is `tr->drum_inp_quant` — historical name; now type-agnostic. */
export function handleUiKnobMelodicInQ(S, deps, d1, d2) {
    if (d1 < 71 || d1 > 78) return false;
    const knobIdx = d1 - 71;
    const bank = S.activeBank;
    if (!(S.trackPadMode[S.activeTrack] !== deps.padModeDrum && bank === 0 && knobIdx === 4)) return false;
    const t   = S.activeTrack;
    const dir = (d2 >= 1 && d2 <= 63) ? 1 : -1;
    if (dir !== S.knobLastDir[knobIdx]) { S.knobAccum[knobIdx] = 0; S.knobLastDir[knobIdx] = dir; }
    S.knobAccum[knobIdx]++;
    if (S.knobAccum[knobIdx] >= 8) {
        S.knobAccum[knobIdx] = 0;
        const nv = Math.max(0, Math.min(8, S.drumInpQuant[t] + dir));
        if (nv !== S.drumInpQuant[t]) {
            S.drumInpQuant[t] = nv;
            S.bankParams[t][0][4] = nv;
            if (deps.setParam)
                deps.setParam('t' + t + '_diq', String(nv));
        }
        S.screenDirty = true;
    }
    return true;
}

/* Generic bank-param path: the fallback for any knob/bank not handled above.
 * Reads BANKS[bank].knobs[knobIdx] (pm) and applies a clamped delta, with the
 * action-scope special cases (Lgto confirm, Beat Stretch step rewrite, Clock
 * Shift / Nudge, alt playback-style toggle, alt clip-resolution zoom). */
export function handleUiKnobGeneric(S, deps, d1, d2) {
    if (d1 < 71 || d1 > 78) return;
    const knobIdx = d1 - 71;
    const bank = S.activeBank;
    const pm      = deps.banks[bank].knobs[knobIdx];
    if (pm && pm.abbrev && pm.scope !== 'stub' && !S.knobLocked[knobIdx]) {
        const dir = (d2 >= 1 && d2 <= 63) ? 1 : -1;
        if (dir !== S.knobLastDir[knobIdx]) {
            S.knobAccum[knobIdx]   = 0;
            S.knobLastDir[knobIdx] = dir;
        }
        S.knobAccum[knobIdx]++;
        /* Shift+Shft (Nudge mode) fires twice as fast as plain Clock Shift. */
        const _effSens = (pm.dspKey === 'clock_shift' && S.altMode) ? Math.max(1, (pm.sens >> 1))
                       : (pm.dspKey === 'clip_playback_dir' && S.altMode) ? 4
                       : pm.sens;
        if (S.knobAccum[knobIdx] >= _effSens) {
            S.knobAccum[knobIdx] = 0;
            S.screenDirty = true;
            if (pm.scope === 'action') {
                const t   = S.activeTrack;
                const ac  = S.trackActiveClip[t];
                const len = S.clipLength[t][ac];
                /* Lgto knob (CLIP K8): right-turn opens the destructive
                 * confirm dialog. Left-turn is a no-op (one-way action). */
                if (pm.dspKey === 'lgto_apply') {
                    if (dir !== 1) return;
                    S.confirmLgto       = true;
                    S.confirmLgtoSel    = 0;  /* default OK */
                    S.confirmLgtoIsDrum = false;
                    S.knobLocked[knobIdx] = true;
                    deps.forceRedraw();
                    return;
                }
                if (pm.lock) {
                    /* Beat Stretch: one-shot, then lock until touch release */
                    const canFire = dir === 1 ? (len * 2 <= 256) : (len >= 2);
                    if (canFire && deps.setParam) {
                        deps.setParam('t' + t + '_' + pm.dspKey, String(dir));
                        S.knobLocked[knobIdx] = true;
                        /* For compress: check if DSP blocked due to step collision */
                        if (dir === -1 && deps.getParam('t' + t + '_beat_stretch_blocked') === '1') {
                            S.stretchBlockedEndTick = S.tickCount + deps.stretchBlockedTicks;
                        } else {
                            /* Mirror DSP step rewrite in JS S.clipSteps */
                            const steps = S.clipSteps[t][ac];
                            if (dir === 1) {
                                for (let si = len - 1; si >= 1; si--) {
                                    steps[si * 2] = steps[si];
                                    steps[si] = 0;
                                }
                                for (let si = 1; si < len * 2; si += 2) steps[si] = 0;
                                S.clipLength[t][ac] = len * 2;
                            } else {
                                const halfLen = len >> 1;
                                const tmp = new Array(halfLen).fill(0);
                                for (let si = 0; si < len; si++) {
                                    if (steps[si] === 1 && !tmp[si >> 1]) tmp[si >> 1] = 1;
                                }
                                for (let si = 0; si < len; si++) {
                                    if (steps[si] === 2 && !tmp[si >> 1]) tmp[si >> 1] = 2;
                                }
                                for (let si = 0; si < len; si++) steps[si] = 0;
                                for (let si = 0; si < halfLen; si++) steps[si] = tmp[si];
                                S.clipLength[t][ac] = halfLen;
                            }
                            /* Clamp page index to new length */
                            const newPages = Math.max(1, Math.ceil(S.clipLength[t][ac] / 16));
                            if (S.trackCurrentPage[t] >= newPages)
                                S.trackCurrentPage[t] = newPages - 1;
                            /* Per-touch label: dir +1 → fmtStretch shows 'x2', -1 → '/2' */
                            S.bankParams[t][bank][knobIdx] = dir;
                        }
                    }
                } else if (pm.dspKey === 'clock_shift') {
                    if (S.altMode) {
                        /* alt = Nudge — fire DSP, mirror counter for display, schedule re-read */
                        if (deps.setParam) {
                            deps.setParam('t' + t + '_nudge', String(dir));
                            S.bankParams[t][bank][knobIdx] += dir;
                            S.pendingStepsReread      = 2;
                            S.pendingStepsRereadTrack = t;
                            S.pendingStepsRereadClip  = ac;
                        }
                    } else if (len >= 2 && deps.setParam) {
                        /* Clock Shift: continuous rotation, no lock */
                        deps.setParam('t' + t + '_' + pm.dspKey, String(dir));
                        const steps = S.clipSteps[t][ac];
                        if (dir === 1) {
                            const last = steps[len - 1];
                            for (let si = len - 1; si > 0; si--) steps[si] = steps[si - 1];
                            steps[0] = last;
                        } else {
                            const first = steps[0];
                            for (let si = 0; si < len - 1; si++) steps[si] = steps[si + 1];
                            steps[len - 1] = first;
                        }
                        S.clockShiftTouchDelta += dir;
                        S.bankParams[t][bank][knobIdx] = S.clockShiftTouchDelta;
                    }
                }
            } else if (S.altMode && pm && pm.dspKey === 'clip_playback_dir' &&
                       S.trackPadMode[S.activeTrack] !== deps.padModeDrum) {
                /* AltMode CLIP K5: toggle Step / Audio playback style on
                 * the active melodic clip. Values 0..1, clamped. */
                const _t  = S.activeTrack;
                const _ac = deps.effectiveClip(_t);
                const _cur = S.clipPlaybackAudioReverse[_t][_ac] | 0;
                const _nv  = Math.max(0, Math.min(1, _cur + dir));
                if (_nv !== _cur) {
                    S.clipPlaybackAudioReverse[_t][_ac] = _nv;
                    if (deps.setParam)
                        deps.setParam('t' + _t + '_clip_playback_audio_reverse', String(_nv));
                }
            } else {
                const cur  = S.bankParams[S.activeTrack][bank][knobIdx];
                const step = pm.step || 1;
                let nv  = Math.max(pm.min, Math.min(pm.max, cur + dir * step));
                if (nv !== cur) {
                    if (S.altMode && pm.dspKey === 'clip_resolution') {
                        const _t   = S.activeTrack;
                        const _ac  = deps.effectiveClip(_t);
                        const _old_tps = S.clipTPS[_t][_ac];
                        const _new_tps = deps.tpsValues[nv];
                        const _old_ticks = S.clipLength[_t][_ac] * _old_tps;
                        const _new_len = Math.ceil(_old_ticks / _new_tps);
                        if (_new_len > 256) {
                            deps.showActionPopup('NOTES OUT', 'OF RANGE');
                            deps.forceRedraw();
                        } else if (S.heldStep >= 0 || (S.recordArmed && !S.recordCountingIn && S.recordArmedTrack === _t)) {
                            /* blocked — do nothing */
                        } else {
                            S.bankParams[S.activeTrack][bank][knobIdx] = nv;
                            S.clipTPS[_t][_ac]    = _new_tps;
                            S.clipLength[_t][_ac] = _new_len;
                            const _maxPage = Math.max(0, Math.ceil(_new_len / 16) - 1);
                            if (S.trackCurrentPage[_t] > _maxPage) S.trackCurrentPage[_t] = _maxPage;
                            if (deps.setParam)
                                deps.setParam('t' + _t + '_clip_resolution_zoom', String(nv));
                            S.pendingStepsReread      = 2;
                            S.pendingStepsRereadTrack = _t;
                            S.pendingStepsRereadClip  = _ac;
                            deps.refreshPerClipBankParams(_t);
                            deps.forceRedraw();
                        }
                    } else {
                        S.bankParams[S.activeTrack][bank][knobIdx] = nv;
                        deps.applyBankParam(S.activeTrack, bank, knobIdx, nv);
                        if (bank === 5 && knobIdx === 0 && nv !== 0)
                            S.lastTarpStyle[S.activeTrack] = nv;
                    }
                }
            }
        }
    }
}
