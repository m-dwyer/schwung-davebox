import { beforeEach, describe, expect, test } from "vitest";
import { S } from "@overture-ui/core/ui_state.mjs";
import { TRACK_COLORS } from "@overture-ui/core/ui_constants.mjs";
import { invalidateLEDCache, updateStepLEDs, updateTrackLEDs } from "@overture-ui/render/ui_leds.mjs";
import { DarkGrey, LightGrey, VividYellow, White } from "/data/UserData/schwung/shared/constants.mjs";
import { setButtonLED, setLED } from "/data/UserData/schwung/shared/input_filter.mjs";

type MidiLedPacket = [number, number, number, number];

function packetsFor(kind: 0x09 | 0x0b, log: MidiLedPacket[]) {
  return new Map(log.filter((p) => p[0] === kind).map(([, , id, color]) => [id, color]));
}

describe("Schwung Sound page LEDs", () => {
  let log: MidiLedPacket[];

  beforeEach(() => {
    log = [];
    (globalThis as typeof globalThis & { move_midi_internal_send: (packet: MidiLedPacket) => void }).move_midi_internal_send =
      (packet: MidiLedPacket) => log.push(packet);

    S.ledInitComplete = true;
    S.tickCount = 101;
    S.sessionView = false;
    S.shiftHeld = false;
    S.tapTempoOpen = false;
    S.schwungCoRunSlot = -1;
    S.moveCoRunTrack = -1;
    S.activeTrack = 4;
    S.activeBank = 6;
    S.trackPadMode[4] = 0;
    S.schwungSoundPage = null;
    invalidateLEDCache();
  });

  test("reserves step LEDs 1-4 for Sound component selection and clears the rest", () => {
    for (let i = 0; i < 16; i++) setLED(16 + i, VividYellow, true);
    log = [];
    invalidateLEDCache();

    S.schwungSoundPage = {
      track: 4,
      slot: 0,
      selectedIndex: 2,
      modules: [{ name: "arp" }, null, { name: "freeverb" }, { name: "delay" }],
      names: ["arp", "", "freeverb", "delay"],
    };

    updateStepLEDs();

    const leds = packetsFor(0x09, log);
    expect(leds.get(16)).toBe(LightGrey);
    expect(leds.get(17)).toBe(DarkGrey);
    expect(leds.get(18)).toBe(TRACK_COLORS[4]);
    expect(leds.get(19)).toBe(LightGrey);
    expect(leds.get(20)).toBe(0);
    expect(leds.get(31)).toBe(0);
  });

  test("encoder LEDs follow visible Sound params instead of the Track View bank", () => {
    for (let k = 0; k < 8; k++) setButtonLED(71 + k, VividYellow, true);
    log = [];
    invalidateLEDCache();

    S.schwungSoundPage = {
      track: 4,
      slot: 0,
      selectedIndex: 1,
      browser: false,
      paramDetail: true,
      paramDetailIndex: 0,
      touchedParam: { index: 2 },
      componentParams: [
        [],
        [
          { key: "gain", type: "float", value: "0.5", default: "0" },
          { key: "enabled", type: "bool", value: "1", default: "1" },
          { key: "shape", type: "enum", value: "2", default: "0" },
          { key: "preset", type: "file", value: "x.wav" },
        ],
        [],
        [],
      ],
      chainParams: [],
    };

    updateTrackLEDs();

    const leds = packetsFor(0x0b, log);
    expect(leds.get(71)).toBe(White);
    expect(leds.get(72)).toBe(LightGrey);
    expect(leds.get(73)).toBe(TRACK_COLORS[4]);
    expect(leds.get(74)).toBe(0);
    expect(leds.get(78)).toBe(0);
  });
});
