import { describe, expect, test, afterEach } from "vitest";
import {
  ENTRYPOINT_ERROR_LOG_PATH,
  createEntrypointErrorWrapper,
} from "@overture-ui/lifecycle/ui_entrypoint_diagnostics.mjs";

const originalHostWriteFile = globalThis.host_write_file;
const mutableGlobal = globalThis as typeof globalThis & {
  host_write_file?: (path: string, body: string) => unknown;
};

afterEach(() => {
  mutableGlobal.host_write_file = originalHostWriteFile;
});

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    tickCount: 42,
    sessionView: true,
    loopHeld: false,
    perfViewLocked: true,
    pendingSuspendSave: false,
    ...overrides,
  };
}

describe("entrypoint diagnostics", () => {
  test("dedupes writes by entrypoint and message while preserving the buffered log", () => {
    const writes: Array<[string, string]> = [];
    mutableGlobal.host_write_file = (path: string, body: string) => {
      writes.push([path, body]);
    };

    const diagnostics = createEntrypointErrorWrapper(makeState());

    diagnostics.captureError("tick", new Error("boom"));
    diagnostics.captureError("tick", new Error("boom"));
    diagnostics.captureError("tick", new Error("other"));

    expect(writes).toHaveLength(2);
    expect(writes[0][0]).toBe(ENTRYPOINT_ERROR_LOG_PATH);
    expect(writes[1][0]).toBe(ENTRYPOINT_ERROR_LOG_PATH);
    expect(writes[0][1]).toContain("[tick=42 sv=1 loop=0 lock=1 susp=0] tick: boom");
    expect(writes[1][1]).toContain("[tick=42 sv=1 loop=0 lock=1 susp=0] tick: boom");
    expect(writes[1][1]).toContain("[tick=42 sv=1 loop=0 lock=1 susp=0] tick: other");
  });

  test("missing host writer is a stock-host no-op", () => {
    delete mutableGlobal.host_write_file;

    const diagnostics = createEntrypointErrorWrapper(makeState());

    expect(() => diagnostics.captureError("init", new Error("no writer"))).not.toThrow();
  });

  test("captures and swallows an entrypoint failure", () => {
    const writes: Array<[string, string]> = [];
    mutableGlobal.host_write_file = (path: string, body: string) => {
      writes.push([path, body]);
    };
    const diagnostics = createEntrypointErrorWrapper(makeState({ tickCount: 7, sessionView: false }));

    const result = diagnostics.runEntrypoint("onMidiInternal", () => {
      throw new Error("input failed");
    });

    expect(result).toBeUndefined();
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toBe(ENTRYPOINT_ERROR_LOG_PATH);
    expect(writes[0][1]).toContain("[tick=7 sv=0 loop=0 lock=1 susp=0] onMidiInternal: input failed");
  });
});
