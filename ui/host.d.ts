/**
 * Ambient declarations for the Schwung HOST seam — the globals the QuickJS host
 * injects into the UI Runtime at load (NOT JS imports; the host provides them).
 * This is the type surface of the imperative shell's boundary with the platform.
 *
 * Script-style .d.ts (no import/export), so every `declare` below is a global.
 * Signatures are intentionally loose — the host is dynamically typed; tighten a
 * signature only when a caller actually depends on the shape. Add globals here as
 * modules that use them join tsconfig `include`.
 */

// --- Host shared MODULES (imported by on-device absolute path) ---
// Bodyless ambient declaration: the module resolves as `any`, so any named
// import (`import { Red } from '/data/UserData/schwung/shared/constants.mjs'`)
// type-checks as `any`. We only need these imports to RESOLVE for the gate —
// the real modules are bundled by esbuild on-device and remapped to the schwung
// checkout by vitest for tests. This keeps `pnpm typecheck` self-contained: no
// schwung checkout, no tsconfig `paths`/`baseUrl`, runs on any clone.
declare module '/data/UserData/schwung/shared/*';

// --- Build-time feature flag (NOT a host global) ---
// Replaced by a literal at bundle time via esbuild `--define:OVERTURE_DEBUG_LOG=...`
// (false for production, true for `OVERTURE_DEBUG_LOG=1 ./scripts/bundle_ui.sh`;
// vitest defines it true). Declared here only so `tsc`/the source resolve it.
// Every call site is `OVERTURE_DEBUG_LOG && dlog(...)`, so a false define folds
// to `false && ...` and esbuild DCE removes the call AND tree-shakes the logger
// module out of production entirely. See core/ui_debug_log.mjs.
declare const OVERTURE_DEBUG_LOG: boolean;

// --- Module param bridge (UI <-> DSP) ---
declare function host_module_set_param(key: string, val: string): void;
declare function host_module_get_param(key: string): string | null;

// --- Persistence ---
declare function host_write_file(path: string, data: string): void;
declare function host_read_file(path: string): string | null;

// --- Module lifecycle ---
declare function host_exit_module(): void;
declare function host_hide_module(): void;

// --- MIDI / DSP delivery (also commonly passed inward as deps) ---
declare function shadow_send_midi_to_dsp(bytes: number[]): void;
declare function move_midi_external_send(bytes: number[]): void;

// --- OLED draw primitives ---
declare function set_pixel(x: number, y: number, on: number): void;
declare function pixelPrint(...args: any[]): void;
declare function pixelPrintC(...args: any[]): void;
declare function fill_rect(...args: any[]): void;
declare function clear_screen(): void;
declare function print(...args: any[]): void;
