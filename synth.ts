// Pure mapping logic for the instrument, kept free of the DOM so it's
// directly unit-testable: position on the pad becomes sound.

// C major pentatonic across ~1.5 octaves — every step is consonant with
// every other, so there's no wrong place to touch the pad.
export const SCALE: readonly number[] = [
  261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0,
  1046.5,
];

export const MIN_CUTOFF = 200;
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

// y-axis: brightness, a continuous lowpass cutoff (top bright, bottom dark).
export function filterFreqForY(y: number, height: number): number {
  if (height <= 0) return MAX_CUTOFF;
  const clamped = Math.min(Math.max(y, 0), height);
  const t = 1 - clamped / height;
  return MIN_CUTOFF + t * (MAX_CUTOFF - MIN_CUTOFF);
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
