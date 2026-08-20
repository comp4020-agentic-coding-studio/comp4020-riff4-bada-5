import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  SCALE,
  KEY_NOTES,
  DARK_RATIO,
  BRIGHT_RATIO,
  KEYBOARD_BRIGHTNESS_STEP,
  frequencyForX,
  brightnessForY,
  filterFreqForT,
  vibratoCentsForSpeed,
} from "../synth";

// Contract tests for this week's brief: a client-side Web Audio instrument,
// expressive under pointer/touch and keyboard, with no score or fail state.
// The pure mapping functions are tested directly; the page is tested against
// the built dist/index.html, same as the invariants.

describe("pitch mapping (pointer + touch x-axis)", () => {
  it("only ever returns notes from the instrument's scale", () => {
    for (let x = 0; x <= 400; x += 7) {
      expect(SCALE).toContain(frequencyForX(x, 400));
    }
  });

  it("runs low to high, left to right", () => {
    const freqs = Array.from({ length: 20 }, (_, i) =>
      frequencyForX((i / 19) * 400, 400),
    );
    for (let i = 1; i < freqs.length; i++) {
      expect(freqs[i]).toBeGreaterThanOrEqual(freqs[i - 1]);
    }
  });

  it("clamps to the scale's edges off-canvas", () => {
    expect(frequencyForX(-50, 400)).toBe(SCALE[0]);
    expect(frequencyForX(4000, 400)).toBe(SCALE[SCALE.length - 1]);
  });
});

describe("brightness mapping (pointer + touch y-axis)", () => {
  it("stays within the instrument's filter range, relative to the note's own frequency", () => {
    for (const freq of SCALE) {
      for (let y = 0; y <= 300; y += 5) {
        const cutoff = filterFreqForT(freq, brightnessForY(y, 300));
        expect(cutoff).toBeGreaterThanOrEqual(freq * DARK_RATIO);
        expect(cutoff).toBeLessThanOrEqual(freq * BRIGHT_RATIO);
      }
    }
  });

  it("is brighter at the top of the pad than the bottom", () => {
    expect(brightnessForY(0, 300)).toBeGreaterThan(brightnessForY(300, 300));
  });

  it("keytracks: the same brightness fraction sweeps a proportionally wider Hz range for a higher note", () => {
    // A fixed Hz range mostly sits inside a low note's own harmonic spacing
    // and barely reaches a high note's, so the sweep was nearly inaudible
    // everywhere — keytracking (cutoff = freq * ratio) keeps the same
    // *proportional* harmonic content swept regardless of pitch.
    const low = filterFreqForT(SCALE[0], 1) - filterFreqForT(SCALE[0], 0);
    const high =
      filterFreqForT(SCALE[SCALE.length - 1], 1) -
      filterFreqForT(SCALE[SCALE.length - 1], 0);
    expect(high).toBeGreaterThan(low);
    const lowRatio = filterFreqForT(SCALE[0], 0.5) / SCALE[0];
    const highRatio =
      filterFreqForT(SCALE[SCALE.length - 1], 0.5) / SCALE[SCALE.length - 1];
    expect(lowRatio).toBeCloseTo(highRatio, 10);
  });

  it("never darkens below the note's own fundamental", () => {
    for (const freq of SCALE) {
      expect(filterFreqForT(freq, 0)).toBeGreaterThan(freq);
    }
  });
});

describe("keyboard play", () => {
  it("maps more than one key, so keys held together form a chord", () => {
    expect(Object.keys(KEY_NOTES).length).toBeGreaterThan(1);
  });

  it("every mapped key plays a real note from the scale", () => {
    for (const index of Object.values(KEY_NOTES)) {
      expect(SCALE[index]).toBeGreaterThan(0);
    }
  });

  it("has a nonzero brightness step, so arrow keys audibly change the tone", () => {
    expect(KEYBOARD_BRIGHTNESS_STEP).toBeGreaterThan(0);
  });
});

describe("brightness mapping (keyboard arrow keys)", () => {
  it("agrees with the pointer's y-axis mapping at the same fraction, for the same note", () => {
    const freq = SCALE[0];
    expect(filterFreqForT(freq, 1)).toBe(
      filterFreqForT(freq, brightnessForY(0, 300)),
    );
    expect(filterFreqForT(freq, 0)).toBe(
      filterFreqForT(freq, brightnessForY(300, 300)),
    );
  });

  it("clamps to the filter range rather than growing without bound", () => {
    const freq = SCALE[0];
    expect(filterFreqForT(freq, -1)).toBe(freq * DARK_RATIO);
    expect(filterFreqForT(freq, 2)).toBe(freq * BRIGHT_RATIO);
  });
});

describe("vibrato mapping (pointer speed)", () => {
  it("stays silent — no vibrato — for a still or barely-moving pointer", () => {
    expect(vibratoCentsForSpeed(0)).toBe(0);
  });

  it("grows with speed, so a fast flick trembles more than a slow glide", () => {
    const slow = vibratoCentsForSpeed(0.2);
    const fast = vibratoCentsForSpeed(0.8);
    expect(fast).toBeGreaterThan(slow);
    expect(slow).toBeGreaterThan(0);
  });

  it("clamps to a maximum rather than growing without bound", () => {
    const capped = vibratoCentsForSpeed(1.5);
    expect(vibratoCentsForSpeed(100)).toBe(capped);
    expect(capped).toBeGreaterThan(0);
  });
});

describe("no scoring, no failure state", () => {
  const doc = new JSDOM(readFileSync(resolve("dist/index.html"), "utf8"))
    .window.document;

  it("never mentions score, points, winning, or losing", () => {
    const text = doc.body.textContent ?? "";
    expect(text).not.toMatch(/\bscore\b|\bpoints?\b|\bwin\b|\blose\b|game over/i);
  });

  it("makes sound live rather than playing back a recording", () => {
    expect(doc.querySelectorAll("audio, video").length).toBe(0);
  });

  it("has a play surface reachable by pointer, touch, and keyboard", () => {
    const pad = doc.querySelector("canvas");
    expect(pad).toBeTruthy();
    expect(pad?.hasAttribute("tabindex")).toBe(true);
  });
});
