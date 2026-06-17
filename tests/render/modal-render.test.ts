import { describe, expect, test } from "vitest";
import {
  renderBakeConfirm,
  renderBakeSceneConfirm,
  renderClearAutomationMenu,
  renderInheritPicker,
  renderLgtoConfirm,
  renderRecordBlockedDialog,
  renderSnapshotPicker,
  renderStateWipeConfirm,
  renderXposeConfirm,
} from "@overture-ui/render/ui_modal_render.mjs";

type DrawCall = [string, ...unknown[]];

function createDeps(calls: DrawCall[]) {
  return {
    clear_screen: () => calls.push(["clear"]),
    print: (x: number, y: number, text: string, color: number) => calls.push(["print", x, y, text, color]),
    fill_rect: (x: number, y: number, w: number, h: number, color: number) => calls.push(["fill", x, y, w, h, color]),
    drawMenuHeader: (title: string) => calls.push(["header", title]),
  };
}

describe("Modal presentation", () => {
  test("renders bake confirm wrap, multi-loop, and melodic subviews", () => {
    const wrapCalls: DrawCall[] = [];
    renderBakeConfirm(createDeps(wrapCalls), { wrapPhase: true, wrapSel: 2 });
    expect(wrapCalls).toContainEqual(["header", "WRAP TAILS?"]);
    expect(wrapCalls).toContainEqual(["print", 4, 16, "Wrap delay echoes", 1]);
    expect(wrapCalls).toContainEqual(["print", 13, 53, "YES", 1]);
    expect(wrapCalls).toContainEqual(["fill", 86, 50, 38, 13, 1]);
    expect(wrapCalls).toContainEqual(["print", 87, 53, "CANCEL", 0]);

    const multiCalls: DrawCall[] = [];
    renderBakeConfirm(createDeps(multiCalls), { isMultiLoop: true, sel: 3 });
    expect(multiCalls).toContainEqual(["header", "BAKE FX?"]);
    expect(multiCalls).toContainEqual(["print", 4, 14, "Bake N loops of FX", 1]);
    expect(multiCalls).toContainEqual(["fill", 60, 38, 27, 12, 1]);
    expect(multiCalls).toContainEqual(["print", 69, 41, "4x", 0]);
    expect(multiCalls).toContainEqual(["print", 92, 41, "CANCEL", 1]);

    const melodicCalls: DrawCall[] = [];
    renderBakeConfirm(createDeps(melodicCalls), { isDrum: false, sel: 0 });
    expect(melodicCalls).toContainEqual(["header", "BAKE FX?"]);
    expect(melodicCalls).toContainEqual(["print", 4, 34, "clear the settings.", 1]);
    expect(melodicCalls).toContainEqual(["print", 23, 49, "No", 1]);
    expect(melodicCalls).toContainEqual(["fill", 74, 46, 46, 13, 1]);
    expect(melodicCalls).toContainEqual(["print", 88, 49, "Yes", 0]);
  });

  test("renders bake confirm drum choice and loop-count subviews", () => {
    const choiceCalls: DrawCall[] = [];
    renderBakeConfirm(createDeps(choiceCalls), { isDrum: true, sel: 1 });
    expect(choiceCalls).toContainEqual(["header", "BAKE DRUMS?"]);
    expect(choiceCalls).toContainEqual(["print", 4, 16, "Bake FX to clip", 1]);
    expect(choiceCalls).toContainEqual(["print", 11, 53, "CLIP", 1]);
    expect(choiceCalls).toContainEqual(["fill", 45, 50, 38, 13, 1]);
    expect(choiceCalls).toContainEqual(["print", 52, 53, "LANE", 0]);

    const loopCalls: DrawCall[] = [];
    renderBakeConfirm(createDeps(loopCalls), {
      isDrum: true,
      drumLoopOpen: true,
      drumMode: 1,
      drumLoopSel: 0,
    });
    expect(loopCalls).toContainEqual(["header", "BAKE DRUMS?"]);
    expect(loopCalls).toContainEqual(["print", 4, 13, "LANE — loop count:", 1]);
    expect(loopCalls).toContainEqual(["fill", 14, 33, 100, 11, 1]);
    expect(loopCalls).toContainEqual(["print", 45, 36, "CANCEL", 0]);
    expect(loopCalls).toContainEqual(["print", 16, 50, "1x", 1]);
  });

  test("renders bake scene confirm loop-count and wrap-tail subviews", () => {
    const loopCalls: DrawCall[] = [];
    renderBakeSceneConfirm(createDeps(loopCalls), { sel: 2 });
    expect(loopCalls).toContainEqual(["clear"]);
    expect(loopCalls).toContainEqual(["header", "BAKE SCENE?"]);
    expect(loopCalls).toContainEqual(["print", 4, 22, "Loop count:", 1]);
    expect(loopCalls).toContainEqual(["print", 45, 36, "CANCEL", 1]);
    expect(loopCalls).toContainEqual(["print", 16, 50, "1x", 1]);
    expect(loopCalls).toContainEqual(["fill", 46, 47, 36, 11, 1]);
    expect(loopCalls).toContainEqual(["print", 58, 50, "2x", 0]);
    expect(loopCalls).toContainEqual(["print", 100, 50, "4x", 1]);

    const wrapCalls: DrawCall[] = [];
    renderBakeSceneConfirm(createDeps(wrapCalls), { wrapPhase: true, wrapSel: 0 });
    expect(wrapCalls).toContainEqual(["clear"]);
    expect(wrapCalls).toContainEqual(["header", "BAKE SCENE?"]);
    expect(wrapCalls).toContainEqual(["print", 4, 22, "Wrap tails?", 1]);
    expect(wrapCalls).toContainEqual(["fill", 4, 47, 36, 11, 1]);
    expect(wrapCalls).toContainEqual(["print", 13, 50, "YES", 0]);
    expect(wrapCalls).toContainEqual(["print", 59, 50, "NO", 1]);
    expect(wrapCalls).toContainEqual(["print", 87, 50, "CANCEL", 1]);
  });

  test("renders transpose confirm target and selected button inversion", () => {
    const yesCalls: DrawCall[] = [];
    renderXposeConfirm(createDeps(yesCalls), {
      key: 2,
      scale: 1,
      sel: 0,
      noteKeys: ["C", "C#", "D"],
      scaleDisplay: ["Maj", "Min"],
    });
    expect(yesCalls).toContainEqual(["clear"]);
    expect(yesCalls).toContainEqual(["header", "TRANSPOSE CLIPS?"]);
    expect(yesCalls).toContainEqual(["print", 4, 22, "To D Min", 1]);
    expect(yesCalls).toContainEqual(["print", 4, 33, "All melodic clips", 1]);
    expect(yesCalls).toContainEqual(["fill", 4, 50, 50, 11, 1]);
    expect(yesCalls).toContainEqual(["print", 21, 53, "YES", 0]);
    expect(yesCalls).toContainEqual(["print", 94, 53, "NO", 1]);

    const noCalls: DrawCall[] = [];
    renderXposeConfirm(createDeps(noCalls), {
      key: 0,
      scale: 9,
      sel: 1,
      noteKeys: ["C"],
      scaleDisplay: ["Maj"],
    });
    expect(noCalls).toContainEqual(["print", 4, 22, "To C ?", 1]);
    expect(noCalls).toContainEqual(["print", 21, 53, "YES", 1]);
    expect(noCalls).toContainEqual(["fill", 74, 50, 50, 11, 1]);
    expect(noCalls).toContainEqual(["print", 94, 53, "NO", 0]);
  });

  test("renders simple confirm dialogs with selected button inversion", () => {
    const stateCalls: DrawCall[] = [];
    renderStateWipeConfirm(createDeps(stateCalls), 0);
    expect(stateCalls).toContainEqual(["header", "Incompatible State"]);
    expect(stateCalls).toContainEqual(["print", 4, 16, "Session incompatible", 1]);
    expect(stateCalls).toContainEqual(["fill", 6, 46, 46, 13, 1]);
    expect(stateCalls).toContainEqual(["print", 20, 49, "Yes", 0]);
    expect(stateCalls).toContainEqual(["print", 91, 49, "No", 1]);

    const recordCalls: DrawCall[] = [];
    renderRecordBlockedDialog(createDeps(recordCalls), 1);
    expect(recordCalls).toContainEqual(["header", "REC Unavailable"]);
    expect(recordCalls).toContainEqual(["print", 4, 16, "Set Dir to Fwd", 1]);
    expect(recordCalls).toContainEqual(["print", 25, 49, "OK", 1]);
    expect(recordCalls).toContainEqual(["fill", 58, 46, 64, 13, 1]);
    expect(recordCalls).toContainEqual(["print", 64, 49, "BAKE NOW", 0]);

    const lgtoCalls: DrawCall[] = [];
    renderLgtoConfirm(createDeps(lgtoCalls), { isDrum: true, selected: 1 });
    expect(lgtoCalls).toContainEqual(["header", "Lgto (lane)"]);
    expect(lgtoCalls).toContainEqual(["print", 4, 16, "Destructive", 1]);
    expect(lgtoCalls).toContainEqual(["print", 25, 49, "OK", 1]);
    expect(lgtoCalls).toContainEqual(["fill", 58, 46, 64, 13, 1]);
    expect(lgtoCalls).toContainEqual(["print", 72, 49, "CANCEL", 0]);
  });

  test("renders inherit picker selected-row inversion and scroll indicators", () => {
    const calls: DrawCall[] = [];
    renderInheritPicker(createDeps(calls), {
      candidates: [
        { uuid: "a", name: "Alpha" },
        { uuid: "b", name: "Beta" },
        { uuid: "c", name: "Gamma" },
        { uuid: "d", name: "Delta" },
      ],
      selectedIndex: 2,
    });

    expect(calls).toContainEqual(["fill", 2, 47, 124, 8, 1]);
    expect(calls).toContainEqual(["print", 5, 48, "Gamma", 0]);
    expect(calls).toContainEqual(["print", 120, 39, "^", 1]);
    expect(calls).toContainEqual(["print", 120, 57, "v", 1]);
  });

  test("renders snapshot picker list with old-state label, inversion, and scroll indicators", () => {
    const calls: DrawCall[] = [];
    renderSnapshotPicker(createDeps(calls), {
      mode: "load",
      snaps: [
        { id: "a", label: "One", sv: 36 },
        { id: "b", label: "Two", sv: 35 },
        { id: "c", label: "Three", sv: 36 },
        { id: "d", label: "Four", sv: 36 },
        { id: "e", label: "Five", sv: 36 },
        { id: "f", label: "Six", sv: 36 },
      ],
      sel: 2,
      confirm: null,
    });

    expect(calls).toContainEqual(["header", "LOAD STATE"]);
    expect(calls).toContainEqual(["print", 5, 20, "Two (old)", 1]);
    expect(calls).toContainEqual(["fill", 2, 28, 124, 8, 1]);
    expect(calls).toContainEqual(["print", 5, 29, "Three", 0]);
    expect(calls).toContainEqual(["print", 120, 20, "^", 1]);
    expect(calls).toContainEqual(["print", 120, 47, "v", 1]);
  });

  test("renders snapshot confirm subviews with selected Yes/No buttons", () => {
    const calls: DrawCall[] = [];
    renderSnapshotPicker(createDeps(calls), {
      mode: "load",
      snaps: [{ id: "target", label: "Gig", sv: 36 }],
      sel: 0,
      confirm: { kind: "load", targetId: "target", sel: 0 },
    });

    expect(calls).toContainEqual(["header", "LOAD STATE"]);
    expect(calls).toContainEqual(["print", 4, 18, "Load Gig", 1]);
    expect(calls).toContainEqual(["fill", 74, 46, 46, 13, 1]);
    expect(calls).toContainEqual(["print", 88, 49, "Yes", 0]);

    const wipeCalls: DrawCall[] = [];
    renderSnapshotPicker(createDeps(wipeCalls), {
      mode: "load",
      snaps: [],
      sel: 0,
      confirm: { kind: "wipe", wipeIds: ["old-a", "old-b"], sel: 1 },
    });
    expect(wipeCalls).toContainEqual(["header", "STATES UPDATED"]);
    expect(wipeCalls).toContainEqual(["print", 4, 18, "Delete 2 snapshot(s)", 1]);
    expect(wipeCalls).toContainEqual(["fill", 6, 46, 46, 13, 1]);
    expect(wipeCalls).toContainEqual(["print", 23, 49, "No", 0]);
  });

  test("renders clear automation checkbox and action rows", () => {
    const calls: DrawCall[] = [];
    renderClearAutomationMenu(createDeps(calls), { sel: 3, at: true, cc: false });

    expect(calls).toContainEqual(["header", "CLEAR AUTOMATION"]);
    expect(calls).toContainEqual(["print", 5, 18, "[x] Aftertouch (AT)", 1]);
    expect(calls).toContainEqual(["print", 5, 27, "( ) Pitch bend (PB)", 1]);
    expect(calls).toContainEqual(["print", 5, 36, "[ ] Control Change (CC)", 1]);
    expect(calls).toContainEqual(["fill", 2, 44, 124, 8, 1]);
    expect(calls).toContainEqual(["print", 5, 45, "CLEAR", 0]);
    expect(calls).toContainEqual(["print", 5, 54, "Cancel", 1]);
  });
});
