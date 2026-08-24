// Pure mapping logic for the instrument, kept free of the DOM so it's
// directly unit-testable: position on the pad becomes sound.

// C major pentatonic across ~1.5 octaves — every step is consonant with
// every other, so there's no wrong place to touch the pad.
export const SCALE: readonly number[] = [
  261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0,
  1046.5,
];

// The main oscillator is a triangle layered with a quiet sine one octave up
// (see main.ts). This keeps the instrument rounded while leaving enough upper
// colour for the lowpass to shape.
// The filter cutoff is keytracked — scaled relative to each voice's own note
// frequency (cutoff = freq * ratio) rather than one fixed Hz range shared by
// the whole scale. A fixed range mostly sat inside a low note's own harmonic
// spacing already and barely reached a high note's, so the sweep was nearly
// inaudible everywhere (measured via spectral centroid: <4% shift even at
// the top note, using the old triangle+fixed-range approach). Keytracking
// keeps the same *proportional* harmonic content swept regardless of pitch —
// confirmed via the same centroid measurement to land ~110% consistently
// across the whole scale. DARK_RATIO sits safely above 1 (the fundamental
// itself) so the fundamental is never attenuated, only harmonics above it —
// confirmed via BiquadFilterNode.getFrequencyResponse() at DARK_RATIO across
// every note in SCALE: the fundamental gains slightly (~+1.7dB, the filter's
// own resonance peak), never attenuates.
export const DARK_RATIO = 1.45;
export const BRIGHT_RATIO = 8;

// x-axis: pitch, quantized to the scale (left low, right high).
export function frequencyForX(x: number, width: number): number {
  if (width <= 0) return SCALE[0];
  const clamped = Math.min(Math.max(x, 0), width);
  const index = Math.min(
    SCALE.length - 1,
    Math.floor((clamped / width) * SCALE.length),
  );
  return SCALE[index];
}

// Brightness as an abstract 0 (dark) to 1 (bright) fraction — shared by the
// pointer's continuous y-axis and the keyboard's discrete arrow-key control,
// so both land on the same timbre scale regardless of which note is playing.
export function brightnessForY(y: number, height: number): number {
  if (height <= 0) return 1;
  const clamped = Math.min(Math.max(y, 0), height);
  return 1 - clamped / height;
}

// Turns a brightness fraction into an actual filter cutoff for a given
// voice's note frequency — see the keytracking note above.
export function filterFreqForT(freq: number, t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  const ratio = DARK_RATIO + clamped * (BRIGHT_RATIO - DARK_RATIO);
  return freq * ratio;
}

// Home-row keys play the same scale as the pad, one voice per held key, so
// a keyboard-only player can hold several down together as a chord.
const KEY_CODES = [
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyF",
  "KeyG",
  "KeyH",
  "KeyJ",
  "KeyK",
  "KeyL",
] as const;

export const KEY_NOTES: Readonly<Record<string, number>> = Object.fromEntries(
  KEY_CODES.map((code, i) => [code, i]),
);

// Without a pointer's y-axis, keyboard play would only ever vary pitch.
// Up/Down arrows give it the same brightness dimension, live-adjustable even
// while notes are held, so a keyboard-only chord can still be swept from
// dark to bright rather than sounding flat.
export const KEYBOARD_BRIGHTNESS_STEP = 0.08;

// A slow, careful glide across the pad should sound different from a fast
// flick across the same notes — not just faster, but *more textured* — so
// speed of pointer travel drives vibrato depth (in cents) on top of the
// pitch/brightness mapping above.
export const VIBRATO_RATE_HZ = 5.2;
const MAX_VIBRATO_CENTS = 28;
const VIBRATO_FULL_SPEED_PX_PER_MS = 1.5;

export function vibratoCentsForSpeed(speedPxPerMs: number): number {
  const t = Math.min(Math.max(speedPxPerMs, 0) / VIBRATO_FULL_SPEED_PX_PER_MS, 1);
  return t * MAX_VIBRATO_CENTS;
}
