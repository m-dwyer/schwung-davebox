/* One-shot codemod: group ui/ui_*.mjs into concept folders and rewrite every
 * import specifier — tool relative imports + web @tool-ui/ specifiers — to match.
 * ui.js stays at ui/ as the composition root. Run from tool/:  node scripts/restructure_ui.mjs
 * Deterministic + exact-string replacement; verify with bundle/parse + vitest + tsc. */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

const TOOL = resolve(dirname(new URL(import.meta.url).pathname), '..');
const UI = join(TOOL, 'ui');
const WEB = resolve(TOOL, '..', 'web');

/* basename (with .mjs) -> concept folder. Every file under ui/ except ui.js must appear. */
const FOLDER = {
    // core — foundational shared state, constants, routing tables, helpers
    'ui_state.mjs': 'core', 'ui_constants.mjs': 'core', 'ui_routes.mjs': 'core',
    'ui_route_check.mjs': 'core', 'ui_scene.mjs': 'core', 'ui_motion.mjs': 'core',
    'ui_sound_edit.mjs': 'core', 'ui_note_edit_helpers.mjs': 'core',
    // render — anything whose job is drawing the OLED / LEDs
    'ui_render_surface.mjs': 'render', 'ui_leds.mjs': 'render', 'ui_perf_leds.mjs': 'render',
    'ui_led_init_workflow.mjs': 'render',
    'ui_bank_chrome_render.mjs': 'render', 'ui_track_chrome_render.mjs': 'render',
    'ui_idle_render.mjs': 'render', 'ui_session_overview_render.mjs': 'render',
    'ui_perf_render.mjs': 'render', 'ui_popup_render.mjs': 'render',
    'ui_prompt_render.mjs': 'render', 'ui_modal_render.mjs': 'render',
    'ui_param_peek_render.mjs': 'render', 'ui_loop_render.mjs': 'render',
    'ui_step_edit_render.mjs': 'render', 'ui_cc_step_edit_render.mjs': 'render',
    'ui_step_interval_render.mjs': 'render', 'ui_splash.mjs': 'render',
    'ui_screen_router_workflow.mjs': 'render',
    // input — Move CC / knob / button dispatch
    'ui_input_dispatch_workflow.mjs': 'input', 'ui_input_adapters.mjs': 'input',
    'ui_button_cc_workflow.mjs': 'input', 'ui_transport_cc_workflow.mjs': 'input',
    'ui_navigation_cc_workflow.mjs': 'input', 'ui_jog_cc_workflow.mjs': 'input',
    'ui_knob_cc_workflow.mjs': 'input', 'ui_knob_touch_workflow.mjs': 'input',
    'ui_side_button_workflow.mjs': 'input', 'ui_cc_message_workflow.mjs': 'input',
    // midi — MIDI in/out routing
    'ui_midi_internal_workflow.mjs': 'midi', 'ui_midi_external_workflow.mjs': 'midi',
    'ui_ext_midi_remap_workflow.mjs': 'midi', 'ui_pad_aftertouch_workflow.mjs': 'pad',
    // pad — Pad Surface
    'ui_pad_surface.mjs': 'pad', 'ui_pad_workflow.mjs': 'pad',
    // drum — Drum Lane / Drum Repeat
    'ui_drum_clip_sync.mjs': 'drum', 'ui_drum_lane_workflows.mjs': 'drum',
    'ui_drum_repeat_workflows.mjs': 'drum',
    // bank — Parameter Bank state
    'ui_bank_params.mjs': 'bank', 'ui_bank_state.mjs': 'bank',
    // sync — Track / Clip Sync + DSP mirror readback
    'ui_clip_state_sync.mjs': 'sync', 'ui_clip_track_sync.mjs': 'sync',
    'ui_track_clip_sync_facade.mjs': 'sync', 'ui_polldsp_workflow.mjs': 'sync',
    'ui_sync_adapters.mjs': 'sync', 'ui_clip_edit_ops.mjs': 'sync',
    // view — Session View / Track View
    'ui_session_view_workflow.mjs': 'view', 'ui_track_view_step_workflow.mjs': 'view',
    'ui_track_selection_workflow.mjs': 'view', 'ui_track_convert_workflow.mjs': 'view',
    // perform — performance gestures and modes
    'ui_live_note_workflow.mjs': 'perform', 'ui_recording_workflow.mjs': 'perform',
    'ui_loop_gesture_workflow.mjs': 'perform', 'ui_latch_workflows.mjs': 'perform',
    'ui_mute_solo_workflow.mjs': 'perform', 'ui_transpose_workflow.mjs': 'perform',
    'ui_tap_tempo_workflow.mjs': 'perform',
    // menu — global menu and dialog/menu workflows
    'ui_global_menu.mjs': 'menu', 'ui_dialogs.mjs': 'menu', 'ui_clear_auto_workflow.mjs': 'menu',
    // persist — persistence, export, snapshots, inheritance
    'ui_persistence.mjs': 'persist', 'ui_export.mjs': 'persist',
    'ui_snapshot_workflow.mjs': 'persist', 'ui_inherit_picker_workflow.mjs': 'persist',
    // tick — Tick Pipeline
    'ui_tick_workflow.mjs': 'tick', 'ui_tick_tasks.mjs': 'tick', 'ui_tick_adapters.mjs': 'tick',
    'ui_tick_workflow.test.mjs': 'tick',
    // corun — Move Co-Run
    'ui_corun_workflow.mjs': 'corun',
    // lifecycle — init + entrypoint diagnostics
    'ui_init_workflow.mjs': 'lifecycle', 'ui_entrypoint_diagnostics.mjs': 'lifecycle',
};

/* --- validate the map covers exactly the files present --- */
const present = readdirSync(UI).filter(f => f.endsWith('.mjs') && f !== 'ui.js');
const missing = present.filter(f => !(f in FOLDER));
const extra = Object.keys(FOLDER).filter(f => !present.includes(f));
if (missing.length || extra.length) {
    console.error('MAP MISMATCH\n  unmapped files:', missing, '\n  mapped-but-absent:', extra);
    process.exit(1);
}

/* import targets = every mapped module basename (the .test file is never imported, harmless) */
const TARGETS = Object.keys(FOLDER);

/* rewrite a tool file's `'./ui_X.mjs'` specifiers given the importer's folder (null = ui/ root) */
function rewriteToolImports(text, importerFolder) {
    for (const bn of TARGETS) {
        const g = FOLDER[bn];
        let spec;
        if (importerFolder === null) spec = `./${g}/${bn}`;
        else if (importerFolder === g) spec = `./${bn}`;
        else spec = `../${g}/${bn}`;
        text = text.split(`'./${bn}'`).join(`'${spec}'`).split(`"./${bn}"`).join(`"${spec}"`);
    }
    return text;
}

/* 1. rewrite + relocate every ui_*.mjs */
for (const bn of present.concat(['ui_tick_workflow.test.mjs']).filter((v, i, a) => a.indexOf(v) === i)) {
    const folder = FOLDER[bn];
    const src = join(UI, bn);
    const destDir = join(UI, folder);
    mkdirSync(destDir, { recursive: true });
    const rewritten = rewriteToolImports(readFileSync(src, 'utf8'), folder);
    writeFileSync(src, rewritten);
    execSync(`git -C "${TOOL}" mv "ui/${bn}" "ui/${folder}/${bn}"`);
}

/* 2. rewrite ui.js (stays at ui/ root) */
const uiJs = join(UI, 'ui.js');
writeFileSync(uiJs, rewriteToolImports(readFileSync(uiJs, 'utf8'), null));

/* 3. rewrite web @tool-ui/ specifiers (exact-string, includes .mjs so no prefix collisions) */
function walk(dir, acc = []) {
    for (const e of readdirSync(dir)) {
        if (e === 'node_modules' || e === 'dist' || e === '.git') continue;
        const p = join(dir, e);
        if (statSync(p).isDirectory()) walk(p, acc);
        else if (/\.(ts|tsx|mts|md)$/.test(e)) acc.push(p);
    }
    return acc;
}
let webChanged = 0;
for (const p of walk(WEB)) {
    let text = readFileSync(p, 'utf8');
    const before = text;
    for (const bn of TARGETS) {
        text = text.split(`@tool-ui/${bn}`).join(`@tool-ui/${FOLDER[bn]}/${bn}`);
    }
    if (text !== before) { writeFileSync(p, text); webChanged++; }
}

console.log(`Moved ${present.length} modules into ${new Set(Object.values(FOLDER)).size} folders; rewrote ${webChanged} web files. ui.js stays at ui/.`);
