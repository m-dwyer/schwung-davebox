import { defineConfig } from "vitest/config";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Pure UI-module unit tests for the tool: import ui/*.mjs directly and drive them
// with mock deps — no WASM, no emulator, no DOM. (The real seq8-WASM + emulator
// integration tests live in the web workspace, which owns that infra.)
const here = dirname(fileURLToPath(import.meta.url));
const TOOL_UI = resolve(here, "ui");

// A handful of ui/*.mjs import schwung shared modules by their absolute on-device
// path; remap those to the schwung dev checkout exactly as web/vite.config does.
// Override with SCHWUNG_SRC=/abs/path.
const SCHWUNG_SHARED =
  process.env.SCHWUNG_SRC ||
  [resolve(here, "../schwung/src/shared"), resolve(here, "../../schwung/src/shared")].find(existsSync) ||
  resolve(here, "../schwung/src/shared");
const ON_DEVICE_SHARED = "/data/UserData/schwung/shared/";

function moveDeviceImports() {
  return {
    name: "move-device-imports",
    enforce: "pre" as const,
    resolveId(source: string) {
      if (source.startsWith(ON_DEVICE_SHARED))
        return resolve(SCHWUNG_SHARED, source.slice(ON_DEVICE_SHARED.length));
      return null;
    },
  };
}

export default defineConfig({
  plugins: [moveDeviceImports()],
  // Build-time flag for dev-only debug logging. Defined true here so the
  // `OVERTURE_DEBUG_LOG && dlog(...)` call sites execute under test (the logger
  // is then exercised via its in-memory ring; the default level is OFF + there's
  // no host_write_file off-device, so nothing is written). Production defines it false.
  define: { OVERTURE_DEBUG_LOG: "true" },
  // @overture-ui -> ./ui so the relocated test files keep their import specifiers verbatim.
  resolve: { alias: { "@overture-ui": TOOL_UI } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      // The unit tier drives the decomposed ui/*.mjs factory modules directly with
      // mock deps. The composition root ui/ui.js is exercised in the behavior tier
      // (real ui.js + wasm), not here, so it's excluded from this tier's numbers.
      // all:true so modules with NO unit test still appear as 0% — that's the gap map.
      include: ["ui/**/*.mjs"],
      exclude: ["ui/ui.js"],
      all: true,
      reporter: ["text", "json-summary", "json", "html"],
      reportsDirectory: "coverage",
    },
  },
});
