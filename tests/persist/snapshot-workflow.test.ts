import { describe, expect, test } from "vitest";
import {
  beginSnapshotSaveImpl,
  openLoadSnapshotImpl,
  openSaveSnapshotImpl,
  snapshotPickerClickImpl,
  snapshotPickerRotateImpl,
} from "@overture-ui/persist/ui_snapshot_workflow.mjs";

const STATE_VERSION = 36;
const SNAPSHOT_CAP = 3;

type Snap = { id: string; ts: number; label: string; sv: number };

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    fn(name: string) {
      return (...args: unknown[]) => log.push([name, ...args]);
    },
  };
}

function snap(id: string, sv = STATE_VERSION): Snap {
  return { id, ts: Number(id) || 0, label: `snap-${id}`, sv };
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    currentSetUuid: "set-a",
    pendingSuspendSave: false,
    pendingSnapshotCopy: null as unknown,
    snapshotPicker: null as unknown,
    globalMenuOpen: true,
    screenDirty: false,
    pendingSetLoad: false,
    ...overrides,
  };
}

function deps(c: ReturnType<typeof calls>, snaps: Snap[] = []) {
  return {
    snapshotCap: SNAPSHOT_CAP,
    stateVersion: STATE_VERSION,
    now: () => 123456,
    snapshotLabel: () => {
      c.log.push(["snapshotLabel"]);
      return "06-17 12:34";
    },
    saveState: c.fn("saveState"),
    showActionPopup: c.fn("showActionPopup"),
    loadSnapshotManifest: (uuid: string) => {
      c.log.push(["loadSnapshotManifest", uuid]);
      return snaps.slice();
    },
    dropSnapshots: (uuid: string, ids: string[]) => {
      c.log.push(["dropSnapshots", uuid, ids]);
      return snaps.filter((s) => !ids.includes(s.id));
    },
    applySnapshotToLive: c.fn("applySnapshotToLive"),
  };
}

describe("snapshot workflow - save entry", () => {
  test("beginSnapshotSave queues copy metadata before requesting save", () => {
    const c = calls();
    const S = state();
    beginSnapshotSaveImpl(S, deps(c), "snap-id");
    expect(S.pendingSnapshotCopy).toEqual({ id: "snap-id", label: "06-17 12:34" });
    expect(c.log).toEqual([["snapshotLabel"], ["saveState"]]);
  });

  test("save under cap starts a new timestamped snapshot and closes the global menu", () => {
    const c = calls();
    const S = state();
    openSaveSnapshotImpl(S, deps(c, [snap("1"), snap("2")]));
    expect(S.pendingSnapshotCopy).toEqual({ id: "123456", label: "06-17 12:34" });
    expect(S.snapshotPicker).toBeNull();
    expect(S.globalMenuOpen).toBe(false);
    expect(c.log).toEqual([
      ["loadSnapshotManifest", "set-a"],
      ["snapshotLabel"],
      ["saveState"],
      ["showActionPopup", "STATE", "SAVED"],
    ]);
  });

  test("save at cap opens the overwrite picker without saving", () => {
    const c = calls();
    const snaps = [snap("1"), snap("2"), snap("3")];
    const S = state();
    openSaveSnapshotImpl(S, deps(c, snaps));
    expect(S.snapshotPicker).toEqual({ mode: "overwrite", snaps, sel: 0, confirm: null });
    expect(S.pendingSnapshotCopy).toBeNull();
    expect(S.globalMenuOpen).toBe(false);
    expect(S.screenDirty).toBe(true);
    expect(c.log).toEqual([["loadSnapshotManifest", "set-a"]]);
  });

  test("save request is ignored while another save is pending", () => {
    const c = calls();
    const S = state({ pendingSnapshotCopy: { id: "in-flight", label: "old" } });
    openSaveSnapshotImpl(S, deps(c, [snap("1")]));
    expect(c.log).toEqual([]);
    expect(S.globalMenuOpen).toBe(true);
  });
});

describe("snapshot workflow - load entry", () => {
  test("empty load closes the menu and shows a popup", () => {
    const c = calls();
    const S = state();
    openLoadSnapshotImpl(S, deps(c, []));
    expect(S.snapshotPicker).toBeNull();
    expect(S.globalMenuOpen).toBe(false);
    expect(c.log).toEqual([
      ["loadSnapshotManifest", "set-a"],
      ["showActionPopup", "NO", "SNAPSHOTS"],
    ]);
  });

  test("stale-version snapshots open a wipe confirm defaulting to No", () => {
    const c = calls();
    const snaps = [snap("1"), snap("2", STATE_VERSION - 1), snap("3", 0)];
    const S = state();
    openLoadSnapshotImpl(S, deps(c, snaps));
    expect(S.snapshotPicker).toEqual({
      mode: "load",
      snaps,
      sel: 0,
      confirm: { kind: "wipe", sel: 1, wipeIds: ["2", "3"] },
    });
    expect(S.globalMenuOpen).toBe(false);
    expect(S.screenDirty).toBe(true);
  });
});

describe("snapshot workflow - picker confirm handling", () => {
  test("wipe no keeps stale snapshots and returns to the picker", () => {
    const c = calls();
    const snaps = [snap("1"), snap("old", 0)];
    const S = state({
      snapshotPicker: { mode: "load", snaps, sel: 0, confirm: { kind: "wipe", sel: 1, wipeIds: ["old"] } },
    });
    snapshotPickerClickImpl(S, deps(c, snaps));
    expect(S.snapshotPicker).toEqual({ mode: "load", snaps, sel: 0, confirm: null });
    expect(c.log).toEqual([]);
    expect(S.screenDirty).toBe(true);
  });

  test("wipe yes drops stale snapshots and closes when none remain", () => {
    const c = calls();
    const snaps = [snap("old", 0)];
    const S = state({
      snapshotPicker: { mode: "load", snaps, sel: 0, confirm: { kind: "wipe", sel: 0, wipeIds: ["old"] } },
    });
    snapshotPickerClickImpl(S, deps(c, snaps));
    expect(S.snapshotPicker).toBeNull();
    expect(c.log).toEqual([["dropSnapshots", "set-a", ["old"]]]);
    expect(S.screenDirty).toBe(true);
  });

  test("load confirm no closes without applying", () => {
    const c = calls();
    const S = state({
      snapshotPicker: { mode: "load", snaps: [snap("1")], sel: 0, confirm: { kind: "load", sel: 1, targetId: "1" } },
    });
    snapshotPickerClickImpl(S, deps(c));
    expect(S.snapshotPicker).toBeNull();
    expect(S.pendingSetLoad).toBe(false);
    expect(c.log).toEqual([]);
  });

  test("load confirm yes applies snapshot, triggers set load, and shows popup", () => {
    const c = calls();
    const S = state({
      snapshotPicker: { mode: "load", snaps: [snap("1")], sel: 0, confirm: { kind: "load", sel: 0, targetId: "1" } },
    });
    snapshotPickerClickImpl(S, deps(c));
    expect(S.snapshotPicker).toBeNull();
    expect(S.pendingSetLoad).toBe(true);
    expect(c.log).toEqual([
      ["applySnapshotToLive", "set-a", "1"],
      ["showActionPopup", "STATE", "LOADED"],
    ]);
  });

  test("overwrite confirm no closes without saving", () => {
    const c = calls();
    const S = state({
      snapshotPicker: { mode: "overwrite", snaps: [snap("1")], sel: 0, confirm: { kind: "overwrite", sel: 1, targetId: "1" } },
    });
    snapshotPickerClickImpl(S, deps(c));
    expect(S.snapshotPicker).toBeNull();
    expect(S.pendingSnapshotCopy).toBeNull();
    expect(c.log).toEqual([]);
  });

  test("overwrite confirm yes reuses the selected id and shows popup", () => {
    const c = calls();
    const S = state({
      snapshotPicker: { mode: "overwrite", snaps: [snap("1")], sel: 0, confirm: { kind: "overwrite", sel: 0, targetId: "1" } },
    });
    snapshotPickerClickImpl(S, deps(c));
    expect(S.snapshotPicker).toBeNull();
    expect(S.pendingSnapshotCopy).toEqual({ id: "1", label: "06-17 12:34" });
    expect(c.log).toEqual([
      ["snapshotLabel"],
      ["saveState"],
      ["showActionPopup", "STATE", "SAVED"],
    ]);
  });
});

describe("snapshot workflow - picker selection", () => {
  test("rotation wraps through snapshot entries and toggles confirm yes/no", () => {
    const S = state({ snapshotPicker: { mode: "load", snaps: [snap("1"), snap("2")], sel: 0, confirm: null } });
    snapshotPickerRotateImpl(S, -1);
    expect(S.snapshotPicker.sel).toBe(1);
    snapshotPickerRotateImpl(S, 1);
    expect(S.snapshotPicker.sel).toBe(0);
    S.snapshotPicker.confirm = { kind: "load", sel: 1, targetId: "1" };
    snapshotPickerRotateImpl(S, 1);
    expect(S.snapshotPicker.confirm.sel).toBe(0);
  });

  test("compatible snapshot click arms load confirm defaulting to No", () => {
    const c = calls();
    const S = state({ snapshotPicker: { mode: "load", snaps: [snap("1")], sel: 0, confirm: null } });
    snapshotPickerClickImpl(S, deps(c));
    expect(S.snapshotPicker.confirm).toEqual({ kind: "load", sel: 1, targetId: "1" });
    expect(S.screenDirty).toBe(true);
  });

  test("incompatible snapshot click is a no-op", () => {
    const c = calls();
    const S = state({ snapshotPicker: { mode: "load", snaps: [snap("old", 0)], sel: 0, confirm: null } });
    snapshotPickerClickImpl(S, deps(c));
    expect(S.snapshotPicker.confirm).toBeNull();
    expect(S.screenDirty).toBe(false);
    expect(c.log).toEqual([]);
  });

  test("overwrite snapshot click arms overwrite confirm defaulting to No", () => {
    const c = calls();
    const S = state({ snapshotPicker: { mode: "overwrite", snaps: [snap("1")], sel: 0, confirm: null } });
    snapshotPickerClickImpl(S, deps(c));
    expect(S.snapshotPicker.confirm).toEqual({ kind: "overwrite", sel: 1, targetId: "1" });
    expect(S.screenDirty).toBe(true);
  });
});
