// Round-trip smoke test for the seq8 wasm target (built by scripts/build-wasm.sh).
// Boots the plugin, creates an instance, exercises set/get_param + render through
// the REAL DSP, and confirms a clean teardown. Run: node scripts/seq8-wasm-smoke.mjs
import { createRequire } from "module";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(root + "/");
const Seq8Module = require("./dist/wasm/seq8.js");

const midiOut = [];
const Module = await Seq8Module({
  onSeq8Midi: (tag, b0, b1, b2, b3) => midiOut.push([tag, b0, b1, b2, b3]),
  onSeq8Log: () => {},
});

let ok = true;
const check = (label, val, pass) => { console.log(label.padEnd(16), "->", val, pass ? "OK" : "FAIL"); ok = ok && pass; };

const boot = Module.ccall("seq8_boot", "number", [], []);
check("boot", boot, boot === 0);

const inst = Module.ccall("seq8_create", "number", ["string", "string"], ["", ""]);
check("create (ptr)", inst, inst !== 0);
check("api_version", Module.ccall("seq8_api_version", "number", [], []), Module.ccall("seq8_api_version", "number", [], []) === 2);

function getParam(key) {
  const len = 4096, buf = Module._malloc(len);
  const n = Module.ccall("seq8_get_param", "number", ["number", "string", "number", "number"], [inst, key, buf, len]);
  const s = n >= 0 ? Module.UTF8ToString(buf, Math.min(n, len - 1)) : null;
  Module._free(buf);
  return { n, s };
}

const steps = getParam("t0_c0_steps");
check("steps len", steps.n, steps.n === 256);

Module.ccall("seq8_set_bpm", "null", ["number"], [128]);
Module.ccall("seq8_set_param", "null", ["number", "string", "string"], [inst, "transport", "1"]);
for (let i = 0; i < 400; i++) Module.ccall("seq8_render", "null", ["number"], [inst]);
check("render x400", "no crash", true);
console.log("midi packets    ->", midiOut.length, midiOut.length ? "eg " + JSON.stringify(midiOut[0]) : "(none)");

Module.ccall("seq8_destroy", "null", ["number"], [inst]);
check("destroy", "clean", true);

console.log(ok ? "\nSMOKE TEST PASSED" : "\nSMOKE TEST FAILED");
process.exit(ok ? 0 : 1);
