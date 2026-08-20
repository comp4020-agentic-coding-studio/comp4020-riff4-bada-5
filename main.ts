import {
  SCALE,
  KEY_NOTES,
  VIBRATO_RATE_HZ,
  KEYBOARD_BRIGHTNESS_STEP,
  frequencyForX,
  brightnessForY,
  filterFreqForT,
  vibratoCentsForSpeed,
} from "./synth";

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  freq: number;
}

function required<T>(value: T | null, message: string): T {
  if (value === null) throw new Error(message);
  return value;
}

const canvas = required(
  document.querySelector<HTMLCanvasElement>("#pad"),
  "missing #pad canvas",
);
const ctx = required(canvas.getContext("2d"), "2d context unavailable");
const hint = document.querySelector<HTMLElement>('[data-testid="hint"]');

let audioCtx: AudioContext | undefined;
let master: GainNode | undefined;

// The audio graph can only start after a user gesture, so it's built lazily
// on the first pointerdown/keydown rather than at page load.
function getAudio(): { audio: AudioContext; bus: GainNode } {
  if (!audioCtx || !master) {
    audioCtx = new AudioContext();
    const compressor = audioCtx.createDynamicsCompressor();
    compressor.connect(audioCtx.destination);
    master = audioCtx.createGain();
    master.gain.value = 0.5;
    master.connect(compressor);
  }
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return { audio: audioCtx, bus: master };
}

function resizeCanvas(): void {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width);
  canvas.height = Math.round(rect.height);
  ctx.fillStyle = "#0b0b14";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Before anyone touches it, the pad should look alive rather than dead
// black — a slow drifting glow invites a first touch the way the hint text
// alone can't. Stops for good on first interaction, and never runs at all
// for prefers-reduced-motion.
let interacted = false;
const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

function drawIdleFrame(tMs: number): void {
  ctx.fillStyle = "#0b0b14";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2 + Math.sin(tMs / 3100) * canvas.width * 0.25;
  const cy = canvas.height / 2 + Math.cos(tMs / 4300) * canvas.height * 0.2;
  const radius = (40 + Math.sin(tMs / 1300) * 10) * 3;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  glow.addColorStop(0, "rgba(138, 180, 255, 0.3)");
  glow.addColorStop(1, "rgba(138, 180, 255, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

function idleLoop(tMs: number): void {
  if (interacted) return;
  drawIdleFrame(tMs);
  requestAnimationFrame(idleLoop);
}

function drawVoicePoint(x: number, y: number, t: number): void {
  ctx.fillStyle = "rgba(11, 11, 20, 0.2)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const hue = 210 - t * 170;
  ctx.beginPath();
  ctx.fillStyle = `hsl(${hue} 90% 60%)`;
  ctx.arc(x, y, 26, 0, Math.PI * 2);
  ctx.fill();
}

function startVoice(freq: number, t: number): Voice {
  const { audio, bus } = getAudio();
  const osc = audio.createOscillator();
  // Sawtooth, not triangle — a triangle's harmonics fall off too fast
  // (1/n^2) to give the keytracked lowpass below anything to shape, so the
  // "brightness" sweep barely moved the spectral centroid (<4% even at the
  // top note). A sawtooth's harmonics fall off more slowly (1/n), giving the
  // filter real material to remove. See synth.ts for the keytracking itself.
  osc.type = "sawtooth";
  osc.frequency.value = freq;
  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.8;
  filter.frequency.value = filterFreqForT(freq, t);
  const gain = audio.createGain();
  gain.gain.value = 0;
  // Vibrato depth (lfoGain, in cents) starts at zero and is driven by
  // pointer speed — a held key or a still pointer stays pure.
  const lfo = audio.createOscillator();
  lfo.frequency.value = VIBRATO_RATE_HZ;
  const lfoGain = audio.createGain();
  lfoGain.gain.value = 0;
  lfo.connect(lfoGain).connect(osc.detune);
  lfo.start();
  osc.connect(filter).connect(gain).connect(bus);
  osc.start();
  gain.gain.linearRampToValueAtTime(0.35, audio.currentTime + 0.04);
  return { osc, gain, filter, lfo, lfoGain, freq };
}

function stopVoice(voice: Voice): void {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setTargetAtTime(0, now, 0.08);
  voice.osc.stop(now + 0.5);
  voice.lfo.stop(now + 0.5);
}

function announcePlaying(): void {
  // The idle glow's last frame would otherwise freeze in place forever —
  // drawVoicePoint only ever applies a translucent fade, and the idle loop
  // stops drawing the instant `interacted` flips true, so nothing else ever
  // erases it. One hard clear right at the transition removes it before the
  // first note's point is drawn on top.
  if (!interacted) {
    ctx.fillStyle = "#0b0b14";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  interacted = true;
  hint?.setAttribute("hidden", "");
}

// Pointer (mouse or touch) — one continuous glide per contact point.
// x = pitch, y = brightness, so different paths across the pad sound
// different and there's no position that sounds "wrong". Speed of travel
// (tracked per contact point below) layers vibrato on top, so the same path
// walked slowly vs. flicked quickly sounds different too.
const pointerVoices = new Map<number, Voice>();
const pointerLast = new Map<number, { x: number; y: number; t: number }>();

function pointerPosition(e: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
  const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
  return { x, y };
}

canvas.addEventListener("pointerdown", (e) => {
  announcePlaying();
  // Capture keeps the glide going if the pointer drifts outside the pad —
  // a nice-to-have, not a requirement for sound, so a capture failure must
  // never silently swallow the voice it's guarding.
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // Continue without capture.
  }
  const { x, y } = pointerPosition(e);
  const freq = frequencyForX(x, canvas.width);
  const brightness = brightnessForY(y, canvas.height);
  pointerVoices.set(e.pointerId, startVoice(freq, brightness));
  pointerLast.set(e.pointerId, { x, y, t: e.timeStamp });
  drawVoicePoint(x, y, brightness);
});

canvas.addEventListener("pointermove", (e) => {
  const voice = pointerVoices.get(e.pointerId);
  if (!voice || !audioCtx) return;
  const { x, y } = pointerPosition(e);
  const freq = frequencyForX(x, canvas.width);
  const brightness = brightnessForY(y, canvas.height);
  const cutoff = filterFreqForT(freq, brightness);
  voice.freq = freq;
  voice.osc.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.03);
  voice.filter.frequency.setTargetAtTime(cutoff, audioCtx.currentTime, 0.03);

  const last = pointerLast.get(e.pointerId);
  if (last) {
    const dt = e.timeStamp - last.t;
    const dist = Math.hypot(x - last.x, y - last.y);
    const speed = dt > 0 ? dist / dt : 0;
    const depth = vibratoCentsForSpeed(speed);
    voice.lfoGain.gain.setTargetAtTime(depth, audioCtx.currentTime, 0.05);
  }
  pointerLast.set(e.pointerId, { x, y, t: e.timeStamp });

  drawVoicePoint(x, y, brightness);
});

function releasePointer(e: PointerEvent): void {
  const voice = pointerVoices.get(e.pointerId);
  if (!voice) return;
  stopVoice(voice);
  pointerVoices.delete(e.pointerId);
  pointerLast.delete(e.pointerId);
}

canvas.addEventListener("pointerup", releasePointer);
canvas.addEventListener("pointercancel", releasePointer);

// Keyboard — home row plays the same scale as the pad, one voice per held
// key, so keys held together become a chord. Without a pointer's y-axis,
// that would leave keyboard play with only pitch to shape — so Up/Down
// arrows drive the same brightness dimension, live, even across keys
// already held down.
const keyVoices = new Map<string, Voice>();
const keyPositions = new Map<string, number>();
let keyboardBrightness = 0.5;

function redrawKeyboardVoices(): void {
  const y = (1 - keyboardBrightness) * canvas.height;
  for (const x of keyPositions.values()) {
    drawVoicePoint(x, y, keyboardBrightness);
  }
}

window.addEventListener("keydown", (e) => {
  if (e.code === "ArrowUp" || e.code === "ArrowDown") {
    e.preventDefault();
    const delta = e.code === "ArrowUp" ? 1 : -1;
    keyboardBrightness = Math.min(
      Math.max(keyboardBrightness + delta * KEYBOARD_BRIGHTNESS_STEP, 0),
      1,
    );
    if (audioCtx) {
      for (const voice of keyVoices.values()) {
        const cutoff = filterFreqForT(voice.freq, keyboardBrightness);
        voice.filter.frequency.setTargetAtTime(cutoff, audioCtx.currentTime, 0.03);
      }
    }
    redrawKeyboardVoices();
    return;
  }
  const index = KEY_NOTES[e.code];
  if (index === undefined || e.repeat || keyVoices.has(e.code)) return;
  announcePlaying();
  const freq = SCALE[index];
  const x = (index / (SCALE.length - 1)) * canvas.width;
  const y = (1 - keyboardBrightness) * canvas.height;
  keyVoices.set(e.code, startVoice(freq, keyboardBrightness));
  keyPositions.set(e.code, x);
  drawVoicePoint(x, y, keyboardBrightness);
});

window.addEventListener("keyup", (e) => {
  const voice = keyVoices.get(e.code);
  if (!voice) return;
  stopVoice(voice);
  keyVoices.delete(e.code);
  keyPositions.delete(e.code);
});

// The browser never delivers keyup for a key released while the window
// isn't focused (alt-tabbing away, say) — without this, a held note drones
// on, and worse, `keyVoices.has` blocks the same key from restarting once
// focus returns, so nothing the player does silences it short of a reload.
// `blur` and `visibilitychange` aren't guaranteed to fire together —
// backgrounding a mobile browser (home button, app switcher) reliably fires
// `visibilitychange` but not always `blur` — so both trigger the same
// release.
function releaseAllVoices(): void {
  for (const voice of keyVoices.values()) stopVoice(voice);
  keyVoices.clear();
  keyPositions.clear();
  for (const voice of pointerVoices.values()) stopVoice(voice);
  pointerVoices.clear();
  pointerLast.clear();
}

window.addEventListener("blur", releaseAllVoices);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) releaseAllVoices();
});

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
if (!reducedMotion) requestAnimationFrame(idleLoop);
