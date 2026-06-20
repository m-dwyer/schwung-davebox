import { beforeEach, describe, expect, test } from "vitest";
import { S, resetUiState } from "@overture-ui/core/ui_state.mjs";
import { BANKS, LED_OFF, TRACK_COLORS, TRACK_PAD_BASE } from "@overture-ui/core/ui_constants.mjs";
import {
  invalidateLEDCache,
  melodicPadBaseLEDColor,
  updateTrackLEDs,
} from "@overture-ui/render/ui_leds.mjs";
import { DarkGrey, VividYellow } from "/data/UserData/schwung/shared/constants.mjs";
import { setLED } from "/data/UserData/schwung/shared/input_filter.mjs";

type MidiPacket = number[];

function packetsFor(kind: 0x09 | 0x0b, log: MidiPacket[]) {
  return new Map(log.filter((p) => p[0] === kind).map(([, , id, color]) => [id, color]));
}

function makeBankParams() {
  return Array.from({ length: 8 }, () =>
    BANKS.map((bank) => bank.knobs.map((knob) => knob.def ?? 0))
  );
}

function arrangeMelodicTrack(track: number, bank: number) {
  resetUiState();
  S.ledInitComplete = true;
  S.sessionView = false;
  S.shiftHeld = false;
  S.tapTempoOpen = false;
  S.stepIntervalMode = false;
  S.schwungCoRunSlot = -1;
  S.moveCoRunTrack = -1;
  S.activeTrack = track;
  S.activeBank = bank;
  S.trackPadMode[track] = 0;
  S.trackOctave[track] = 0;
  S.padKey = 0;
  S.xposePrevKey = null;
  S.padLayoutChromatic[track] = true;
  S.bankParams = makeBankParams();
  S.padScaleSet.clear();
  for (const semitone of [0, 2, 4, 5, 7, 9, 11]) S.padScaleSet.add(semitone);
  S.padNoteMap.fill(0xff);
  S.padNoteMap[0] = 60; // C root
  S.padNoteMap[1] = 62; // in-scale, non-root
  S.padNoteMap[2] = 61; // chromatic, out-of-scale
  S.liveActiveNotes.clear();
  S.seqActiveNotes.clear();
  S.heldStep = -1;
  S.heldStepNotes = [];
  invalidateLEDCache();
}

describe("Track View melodic pad LEDs", () => {
  let log: MidiPacket[];

  beforeEach(() => {
    log = [];
    (globalThis as typeof globalThis & { move_midi_internal_send: (packet: MidiPacket) => void }).move_midi_internal_send =
      (packet: MidiPacket) => log.push(packet);
    for (let i = 0; i < 32; i++) setLED(TRACK_PAD_BASE + i, VividYellow, true);
    log = [];
  });

  test("normal banks use shared melodic language for root, in-scale, and out-of-scale pads", () => {
    arrangeMelodicTrack(4, 0);

    updateTrackLEDs();

    const leds = packetsFor(0x09, log);
    expect(leds.get(TRACK_PAD_BASE)).toBe(TRACK_COLORS[4]);
    expect(leds.get(TRACK_PAD_BASE + 1)).toBe(DarkGrey);
    expect(leds.get(TRACK_PAD_BASE + 2)).toBe(LED_OFF);
  });

  test("AUTO keeps root pads in track color instead of neutral grayscale", () => {
    arrangeMelodicTrack(4, 6);

    updateTrackLEDs();

    const leds = packetsFor(0x09, log);
    expect(leds.get(TRACK_PAD_BASE)).toBe(TRACK_COLORS[4]);
    expect(leds.get(TRACK_PAD_BASE + 1)).toBe(DarkGrey);
    expect(leds.get(TRACK_PAD_BASE + 2)).toBe(LED_OFF);
  });

  test("melodic pad helper is the single source for root and scale membership colors", () => {
    expect(melodicPadBaseLEDColor({
      track: 4,
      isRoot: true,
      inScale: true,
      chromatic: true,
      inCoRun: false,
    })).toBe(TRACK_COLORS[4]);

    expect(melodicPadBaseLEDColor({
      track: 4,
      isRoot: false,
      inScale: false,
      chromatic: true,
      inCoRun: false,
    })).toBe(LED_OFF);
  });
});
