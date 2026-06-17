import { describe, expect, test } from "vitest";
import { handleUiCcMessage } from "@overture-ui/input/ui_cc_message_workflow.mjs";

function calls() {
  const log: Array<[string, ...unknown[]]> = [];
  return {
    log,
    fn(name: string, result?: unknown) {
      return (...args: unknown[]) => {
        log.push([name, ...args]);
        return result;
      };
    },
  };
}

describe("CC message workflow", () => {
  test("dispatches CC handlers in ui.js priority order", () => {
    const c = calls();

    handleUiCcMessage({
      onJog: c.fn("jog"),
      onButtons: c.fn("buttons"),
      onTransport: c.fn("transport"),
      onSide: c.fn("side"),
      onStepEdit: c.fn("stepEdit"),
      onKnobs: c.fn("knobs"),
    }, 71, 1);

    expect(c.log).toEqual([
      ["jog", 71, 1],
      ["buttons", 71, 1],
      ["transport", 71, 1],
      ["side", 71, 1],
      ["stepEdit", 71, 1],
      ["knobs", 71, 1],
    ]);
  });

  test("preserves fallthrough when an earlier handler returns a value", () => {
    const c = calls();

    expect(handleUiCcMessage({
      onJog: c.fn("jog", true),
      onButtons: c.fn("buttons", true),
      onTransport: c.fn("transport", true),
      onSide: c.fn("side", true),
      onStepEdit: c.fn("stepEdit", true),
      onKnobs: c.fn("knobs", true),
    }, 78, 127)).toBeUndefined();

    expect(c.log).toEqual([
      ["jog", 78, 127],
      ["buttons", 78, 127],
      ["transport", 78, 127],
      ["side", 78, 127],
      ["stepEdit", 78, 127],
      ["knobs", 78, 127],
    ]);
  });
});
