import { beforeEach, describe, expect, test } from "vitest";
import { S } from "@overture-ui/core/ui_state.mjs";
import { CC_SCRATCH_PALETTE_BASE, TRACK_COLORS } from "@overture-ui/core/ui_constants.mjs";
import { invalidateLEDCache, updateStepLEDs, updateTrackLEDs } from "@overture-ui/render/ui_leds.mjs";
import { DarkGrey, LightGrey, VividYellow } from "/data/UserData/schwung/shared/constants.mjs";
import { setButtonLED, setLED } from "/data/UserData/schwung/shared/input_filter.mjs";

type MidiPacket = number[];

function packetsFor(kind: 0x09 | 0x0b, log: MidiPacket[]) {
  return new Map(log.filter((p) => p[0] === kind).map(([, , id, color]) => [id, color]));
}

function sysexBytes(pkt: MidiPacket) {
  const bytes: number[] = [];
  for (let i = 0; i < pkt.length; i += 4) {
    const cin = pkt[i] & 0x0f;
    const count = cin === 0x05 ? 1 : cin === 0x06 ? 2 : cin === 0x07 || cin === 0x04 ? 3 : 0;
    for (let j = 0; j < count; j++) bytes.push(pkt[i + 1 + j] ?? 0);
  }
  return bytes;
}

function paletteWrites(log: MidiPacket[]) {
  return log.map(sysexBytes)
    .filter((b) => b[0] === 0xf0 && b[6] === 0x03)
    .map((b) => ({
      index: b[7],
      r: (b[8] & 0x7f) | ((b[9] & 0x7f) << 7),
      g: (b[10] & 0x7f) | ((b[11] & 0x7f) << 7),
      b: (b[12] & 0x7f) | ((b[13] & 0x7f) << 7),
    }));
}

describe("Schwung Sound page LEDs", () => {
  let log: MidiPacket[];

  beforeEach(() => {
    log = [];
    (globalThis as typeof globalThis & { move_midi_internal_send: (packet: MidiPacket) => void }).move_midi_internal_send =
      (packet: MidiPacket) => log.push(packet);

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

  test("encoder LEDs use white brightness from visible Sound param values", () => {
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
          { key: "tone", type: "float", value: "0.75", min: 0, max: 1 },
          { key: "enabled", type: "bool", value: "1", default: "1" },
          { key: "preset", type: "file", value: "x.wav" },
        ],
        [],
        [],
      ],
      chainParams: [],
    };

    updateTrackLEDs();

    const leds = packetsFor(0x0b, log);
    expect(leds.get(71)).toBe(CC_SCRATCH_PALETTE_BASE);
    expect(leds.get(72)).toBe(CC_SCRATCH_PALETTE_BASE + 1);
    expect(leds.get(73)).toBe(CC_SCRATCH_PALETTE_BASE + 2);
    expect(leds.get(74)).toBe(0);
    expect(leds.get(78)).toBe(0);

    const firstWrites = paletteWrites(log);
    expect(firstWrites).toEqual(expect.arrayContaining([
      { index: CC_SCRATCH_PALETTE_BASE, r: 144, g: 144, b: 144 },
      { index: CC_SCRATCH_PALETTE_BASE + 1, r: 199, g: 199, b: 199 },
      { index: CC_SCRATCH_PALETTE_BASE + 2, r: 255, g: 255, b: 255 },
    ]));

    log = [];
    S.schwungSoundPage.componentParams[1][0].value = "0.75";
    updateTrackLEDs();

    expect(paletteWrites(log)).toContainEqual({ index: CC_SCRATCH_PALETTE_BASE, r: 199, g: 199, b: 199 });
  });
});
