// Pure mapping logic for the instrument, kept free of the DOM so it's
// directly unit-testable: position on the pad becomes sound.

// C major pentatonic across ~1.5 octaves — every step is consonant with
// every other, so there's no wrong place to touch the pad.
export const SCALE: readonly number[] = [
  261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0,
  1046.5,
];

// The oscillator is a triangle wave (see main.ts), whose harmonics thin out
// fast above the fundamental — MIN_CUTOFF sits above the scale's highest note
// (1046.5) on purpose, so the lowpass never eats the fundamental itself. A
// pure sine has no harmonics for a filter to shape at all, and a cutoff below
// the fundamental doesn't darken a tone, it just makes it quieter — dragging
// to the "dark" edge of the pad would silence high notes instead of muffling
// them. Confirmed with BiquadFilterNode.getFrequencyResponse() against a pure
// sine before this change: the top note lost -28.6dB at the darkest setting.
export const MIN_CUTOFF = 1200;
export const MAX_CUTOFF = 8000;

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

// Brightness as an abstract 0 (dark) to 1 (bright) fraction of the filter's
// range — shared by the pointer's continuous y-axis and the keyboard's
// discrete arrow-key control below, so both land on the same timbre scale.
export function filterFreqForT(t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  return MIN_CUTOFF + clamped * (MAX_CUTOFF - MIN_CUTOFF);
}

// y-axis: brightness, a continuous lowpass cutoff (top bright, bottom dark).
export function filterFreqForY(y: number, height: number): number {
  if (height <= 0) return MAX_CUTOFF;
  const clamped = Math.min(Math.max(y, 0), height);
  return filterFreqForT(1 - clamped / height);
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
export const VIBRATO_RATE_HZ = 5.5;
const MAX_VIBRATO_CENTS = 40;
const VIBRATO_FULL_SPEED_PX_PER_MS = 1.5;

export function vibratoCentsForSpeed(speedPxPerMs: number): number {
  const t = Math.min(Math.max(speedPxPerMs, 0) / VIBRATO_FULL_SPEED_PX_PER_MS, 1);
  return t * MAX_VIBRATO_CENTS;
}
