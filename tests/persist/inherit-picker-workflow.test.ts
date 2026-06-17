import { describe, expect, test } from "vitest";
import {
  maybeShowInheritPickerImpl,
  resolveInheritPickerImpl,
} from "@overture-ui/persist/ui_inherit_picker_workflow.mjs";

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    fn(name: string) {
      return (...args: unknown[]) => log.push([name, ...args]);
    },
  };
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    nameIndexCache: null as unknown,
    pendingInheritPicker: null as unknown,
    pendingSetLoad: false,
    screenDirty: false,
    ...overrides,
  };
}

function deps(
  c: ReturnType<typeof calls>,
  opts: {
    stateExists?: boolean;
    noFileExists?: boolean;
    index?: Record<string, string>;
    candidates?: Array<{ uuid: string; name: string }>;
  } = {},
) {
  return {
    fileExists: opts.noFileExists
      ? null
      : (path: string) => {
          c.log.push(["fileExists", path]);
          return opts.stateExists ?? false;
        },
    uuidToStatePath: (uuid: string) => `/state/${uuid}/seq8-state.json`,
    loadNameIndex: () => {
      c.log.push(["loadNameIndex"]);
      return opts.index ?? { "Original": "src" };
    },
    findInheritCandidates: (name: string, idx: Record<string, string>) => {
      c.log.push(["findInheritCandidates", name, idx]);
      return opts.candidates ?? [];
    },
    copyStateFiles: c.fn("copyStateFiles"),
  };
}

describe("inherit picker workflow - maybeShowInheritPicker", () => {
  test("blank cases do not open the picker", () => {
    const c = calls();
    expect(maybeShowInheritPickerImpl(state(), deps(c), "", "Set Copy")).toBe("blank");
    expect(maybeShowInheritPickerImpl(state(), deps(c), "dst", "")).toBe("blank");
    expect(maybeShowInheritPickerImpl(state(), deps(c, { noFileExists: true }), "dst", "Set Copy")).toBe("blank");

    const S = state();
    expect(maybeShowInheritPickerImpl(S, deps(c, { stateExists: true }), "dst", "Set Copy")).toBe("blank");
    expect(S.pendingInheritPicker).toBeNull();
  });

  test("no candidates returns blank after loading the name index", () => {
    const c = calls();
    const S = state();
    expect(maybeShowInheritPickerImpl(S, deps(c, { candidates: [] }), "dst", "Set Copy")).toBe("blank");
    expect(S.nameIndexCache).toEqual({ Original: "src" });
    expect(S.pendingInheritPicker).toBeNull();
  });

  test("single candidate auto-inherits without opening the picker", () => {
    const c = calls();
    const S = state();
    const result = maybeShowInheritPickerImpl(
      S,
      deps(c, { candidates: [{ uuid: "src", name: "Set" }] }),
      "dst",
      "Set Copy",
    );
    expect(result).toBe("auto");
    expect(S.pendingInheritPicker).toBeNull();
    expect(S.screenDirty).toBe(false);
    expect(c.log).toContainEqual(["copyStateFiles", "src", "dst"]);
  });

  test("multiple candidates open the picker using cached index", () => {
    const c = calls();
    const cached = { Set: "src-a" };
    const S = state({ nameIndexCache: cached });
    const candidates = [
      { uuid: "src-a", name: "Set" },
      { uuid: "src-b", name: "Set Copy 2" },
    ];
    const result = maybeShowInheritPickerImpl(S, deps(c, { candidates }), "dst", "Set Copy");
    expect(result).toBe("picker");
    expect(S.pendingInheritPicker).toEqual({
      dstUuid: "dst",
      dstName: "Set Copy",
      candidates,
      selectedIndex: 0,
    });
    expect(S.screenDirty).toBe(true);
    expect(c.log).not.toContainEqual(["loadNameIndex"]);
    expect(c.log).not.toContainEqual(["copyStateFiles", "src-a", "dst"]);
  });
});

describe("inherit picker workflow - resolveInheritPicker", () => {
  test("resolving a candidate copies state, closes picker, and triggers load", () => {
    const c = calls();
    const S = state({
      pendingInheritPicker: {
        dstUuid: "dst",
        dstName: "Set Copy",
        candidates: [{ uuid: "src-a", name: "Set" }, { uuid: "src-b", name: "Set Copy 2" }],
        selectedIndex: 1,
      },
    });
    resolveInheritPickerImpl(S, deps(c), 1);
    expect(c.log).toEqual([["copyStateFiles", "src-b", "dst"]]);
    expect(S.pendingSetLoad).toBe(true);
    expect(S.pendingInheritPicker).toBeNull();
    expect(S.screenDirty).toBe(true);
  });

  test("start blank closes picker and triggers load without copying", () => {
    const c = calls();
    const S = state({
      pendingInheritPicker: {
        dstUuid: "dst",
        dstName: "Set Copy",
        candidates: [{ uuid: "src-a", name: "Set" }],
        selectedIndex: 0,
      },
    });
    resolveInheritPickerImpl(S, deps(c), -1);
    expect(c.log).toEqual([]);
    expect(S.pendingSetLoad).toBe(true);
    expect(S.pendingInheritPicker).toBeNull();
    expect(S.screenDirty).toBe(true);
  });

  test("ignores stale resolve when picker is not open", () => {
    const c = calls();
    const S = state();
    resolveInheritPickerImpl(S, deps(c), 0);
    expect(c.log).toEqual([]);
    expect(S.pendingSetLoad).toBe(false);
    expect(S.screenDirty).toBe(false);
  });
});
