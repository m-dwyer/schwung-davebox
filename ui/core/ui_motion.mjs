import { S, effectiveClip } from './ui_state.mjs';
import { BANKS, PAD_MODE_DRUM, SCENE_LETTERS, col4, fmtLen, fmtPct, fmtSign } from './ui_constants.mjs';
import { routeScopeShortLabel } from './ui_routes.mjs';

export const PARAM_PEEK_DETAIL_TICKS = 47;               /* ~500ms at 94Hz */

/* Format CC number as a 4-char display label: CC7→"CC7 ", CC74→"CC74", C100→"C100" */
export function fmtCCLabel(cc) {
    const n = (cc | 0);
    return n >= 100 ? 'C' + n : 'CC' + n;
}

export function ccCommonName(cc) {
    switch (cc | 0) {
    case 1:  return 'Mod Wheel';
    case 7:  return 'Volume';
    case 10: return 'Pan';
    case 11: return 'Expression';
    case 64: return 'Sustain';
    case 74: return 'Filter';
    case 91: return 'Reverb';
    case 93: return 'Chorus';
    default: return '';
    }
}

export function tpsDisplay(tps) {
    if (tps === 12) return '1/32';
    if (tps === 24) return '1/16';
    if (tps === 48) return '1/8';
    if (tps === 96) return '1/4';
    if (tps === 192) return '1/2';
    if (tps === 384) return '1bar';
    return String(tps);
}

export function autoLaneLabel(t, k, includeLane) {
    const prefix = includeLane ? ('L' + (k + 1) + ' ') : '';
    const typ = S.trackCCType[t][k] | 0;
    const assign = S.trackCCAssign[t][k] | 0;
    if (typ === 1) return prefix + 'AT';
    if (typ === 2) return prefix + 'Sch' + assign;
    if (assign < 0) return prefix + '--';
    return prefix + fmtCCLabel(assign);
}

export function autoLaneTargetLabel(t, k) {
    const typ = S.trackCCType[t][k] | 0;
    const assign = S.trackCCAssign[t][k] | 0;
    if (typ === 1) return 'Aftertouch';
    if (typ === 2) {
        const name = S.schLabel[t][k];
        return name ? ('Sch K' + assign + ' ' + name) : ('Schwung knob ' + assign);
    }
    if (assign < 0) return 'No target assigned';
    if ((S.trackRoute[t] | 0) === 1) return 'Move target';
    const name = ccCommonName(assign);
    return name ? (fmtCCLabel(assign) + ' ' + name) : fmtCCLabel(assign);
}

export function autoLaneValueLabel(t, ac, k) {
    const rawV = S.playing ? S.trackCCLiveVal[t][k] : S.clipCCVal[t][ac][k];
    return (rawV >= 0 && rawV <= 127) ? ('Value ' + rawV) : 'No value set';
}

export function motionBadges(t, ac) {
    const ccHas = (S.trackCCAutoBits[t][ac] !== 0) ||
                  S.clipCCVal[t][ac].some(function(v) { return v >= 0; });
    const atHas = !!S.clipAtHas[t][ac];
    const schHas = S.trackCCType[t].some(function(tp, k) {
        return tp === 2 && (((S.trackCCAutoBits[t][ac] >> k) & 1) || S.clipCCVal[t][ac][k] >= 0);
    });
    const badges = [];
    if (schHas) badges.push('Sch');
    if (atHas) badges.push('AT');
    if (ccHas) badges.push('CC');
    return badges;
}

export function motionLaneValue(t, ac, k) {
    const rawV = S.playing ? S.trackCCLiveVal[t][k] : S.clipCCVal[t][ac][k];
    return (rawV >= 0 && rawV <= 127) ? String(rawV) : '--';
}

export function motionOverviewModel(t, ac) {
    const lanes = [];
    for (let k = 0; k < 8; k++) {
        const touched = (S.knobTouched === k) || (S.ccActiveLane[t] === k);
        const label = autoLaneLabel(t, k, false);
        const value = motionLaneValue(t, ac, k);
        lanes.push({
            lane: k,
            label: label,
            value: value,
            labelText: col4(label),
            valueText: col4(value),
            touched: touched,
            labelInverted: S.altMode ? true : touched,
            valueInverted: touched
        });
    }
    let footer = '';
    if (S.knobTouched >= 0 && S.trackCCType[t][S.knobTouched] === 2) {
        footer = S.schLabel[t][S.knobTouched] || '';
    }
    return {
        heading: S.altMode ? 'ASSIGN' : BANKS[6].name,
        badges: motionBadges(t, ac),
        lanes: lanes,
        footer: footer
    };
}

export function motionIdleModel(t, ac) {
    const lane = S.ccActiveLane[t];
    const effLen = S.ccLaneLength[t][ac][lane] || S.clipLength[t][ac];
    const dispTps = S.ccLaneTps[t][ac][lane] || (S.clipTPS[t][ac] || 24);
    const resTps = S.ccLaneResTps[t][ac][lane] || dispTps;
    const param = S.trackCCType[t][lane] === 2 ? (S.schLabel[t][lane] || '') : '';
    const paramText = param.length > 12 ? param.substring(0, 12) : param;
    return {
        heading: BANKS[6].name,
        badges: motionBadges(t, ac),
        lane: lane,
        laneLabel: autoLaneLabel(t, lane, true),
        value: motionLaneValue(t, ac, lane),
        valueUnderline: true,
        param: param,
        paramText: paramText,
        resText: 'Res: ' + tpsDisplay(resTps),
        zoomText: 'Zoom: ' + tpsDisplay(dispTps),
        effectiveLength: effLen,
        graphKey: 'g_' + t + '_' + ac + '_' + lane,
        graphPages: Math.ceil(effLen / 16)
    };
}

export function paramPeekInfo() {
    const t = S.activeTrack;
    const bank = S.activeBank;
    const k = S.knobTouched;
    const ac = effectiveClip(t);
    const clipLabel = SCENE_LETTERS[ac] || String(ac + 1);
    if (bank === 6 && S.trackPadMode[t] === PAD_MODE_DRUM) {
        return {
            header: 'AUTO T' + (t + 1) + ' Drum',
            target: 'Melodic AUTO only',
            value: 'Use DRUM/NOTE banks',
            detail: 'Drum track',
            route: 'Route: ' + routeScopeShortLabel(t)
        };
    }
    if (bank === 6 && S.trackPadMode[t] !== PAD_MODE_DRUM) {
        const heldTicks = S.knobTouchStartTick >= 0 ? (S.tickCount - S.knobTouchStartTick) : 0;
        if (heldTicks >= PARAM_PEEK_DETAIL_TICKS) {
            const clipTps = S.clipTPS[t][ac] || 24;
            const loopLen = S.ccLaneLength[t][ac][k] || S.clipLength[t][ac];
            const zoomTps = S.ccLaneTps[t][ac][k] || clipTps;
            const resTps = S.ccLaneResTps[t][ac][k] || zoomTps;
            return {
                header: autoLaneTargetLabel(t, k),
                target: 'Lane ' + (k + 1) + ' / Clip ' + clipLabel,
                value: 'Route: ' + routeScopeShortLabel(t),
                detail: 'Loop ' + loopLen + ' steps',
                route: 'Res ' + tpsDisplay(resTps) + ' Zoom ' + tpsDisplay(zoomTps)
            };
        }
        return {
            header: 'AUTO T' + (t + 1) + ' Clip ' + clipLabel,
            target: autoLaneTargetLabel(t, k),
            value: autoLaneValueLabel(t, ac, k),
            detail: 'Clip ' + clipLabel + ', Lane ' + (k + 1),
            route: 'Route: ' + routeScopeShortLabel(t)
        };
    }
    if (bank === 1 && S.trackPadMode[t] === PAD_MODE_DRUM) {
        const lane = S.activeDrumLane[t] | 0;
        const drumNoteTargets = [
            { target: 'Lane Octave', value: 'Note ' + (S.drumLaneNote[t][lane] | 0), detail: 'Lane ' + (lane + 1) + ', octave jumps' },
            { target: 'Lane Note', value: 'Note ' + (S.drumLaneNote[t][lane] | 0), detail: 'Lane ' + (lane + 1) + ', semitone' },
            { target: 'Velocity Offset', value: fmtSign(S.bankParams[t][1][1] | 0), detail: 'Lane ' + (lane + 1) },
            { target: 'Quantize', value: fmtPct(S.drumLaneQnt[t] | 0), detail: 'Lane ' + (lane + 1) },
            { target: 'Note Length', value: fmtLen(S.drumLaneLenMode[t][lane] | 0), detail: 'Lane ' + (lane + 1) },
            { target: 'Gate Time', value: fmtPct(S.bankParams[t][1][0] | 0), detail: 'Lane ' + (lane + 1) },
        ];
        const info = drumNoteTargets[k];
        if (info) {
            return {
                header: 'NOTE FX T' + (t + 1) + ' Drum',
                target: info.target,
                value: 'Value ' + info.value,
                detail: info.detail,
                route: 'Route: ' + routeScopeShortLabel(t)
            };
        }
    }
    const pm = (BANKS[bank] && BANKS[bank].knobs) ? BANKS[bank].knobs[k] : null;
    const bankName = BANKS[bank] ? BANKS[bank].name : 'BANK';
    if (!pm || !pm.full) {
        return {
            header: bankName + ' T' + (t + 1),
            target: 'No target assigned',
            value: 'Value --',
            detail: 'Knob ' + (k + 1),
            route: 'Route: ' + routeScopeShortLabel(t)
        };
    }
    const val = S.bankParams[t][bank][k];
    const scope = pm.scope === 'clip' ? ('Clip ' + clipLabel)
               : pm.scope === 'track' ? ('Track T' + (t + 1))
               : pm.scope === 'action' ? 'Action'
               : pm.scope === 'seqfollow' ? ('Clip ' + clipLabel)
               : pm.scope;
    return {
        header: bankName + ' T' + (t + 1),
        target: pm.full,
        value: 'Value ' + (pm.fmt ? pm.fmt(val) : String(val)),
        detail: scope,
        route: 'Route: ' + routeScopeShortLabel(t)
    };
}
