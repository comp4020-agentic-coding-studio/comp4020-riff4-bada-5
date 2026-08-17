import {
  SCALE,
  KEY_NOTES,
  MIN_CUTOFF,
  MAX_CUTOFF,
  VIBRATO_RATE_HZ,
  frequencyForX,
  filterFreqForY,
  vibratoCentsForSpeed,
} from "./synth";

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
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

function drawVoicePoint(x: number, y: number, cutoff: number): void {
  ctx.fillStyle = "rgba(11, 11, 20, 0.2)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const hue = 210 - ((cutoff - MIN_CUTOFF) / (MAX_CUTOFF - MIN_CUTOFF)) * 170;
  ctx.beginPath();
  ctx.fillStyle = `hsl(${hue} 90% 60%)`;
  ctx.arc(x, y, 26, 0, Math.PI * 2);
  ctx.fill();
}

function startVoice(freq: number, cutoffHz: number): Voice {
  const { audio, bus } = getAudio();
  const osc = audio.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;
  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.8;
  filter.frequency.value = cutoffHz;
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
  return { osc, gain, filter, lfo, lfoGain };
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
  const cutoff = filterFreqForY(y, canvas.height);
  pointerVoices.set(e.pointerId, startVoice(freq, cutoff));
  pointerLast.set(e.pointerId, { x, y, t: e.timeStamp });
  drawVoicePoint(x, y, cutoff);
});

canvas.addEventListener("pointermove", (e) => {
  const voice = pointerVoices.get(e.pointerId);
  if (!voice || !audioCtx) return;
  const { x, y } = pointerPosition(e);
  const freq = frequencyForX(x, canvas.width);
  const cutoff = filterFreqForY(y, canvas.height);
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

  drawVoicePoint(x, y, cutoff);
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
// key, so keys held together become a chord.
const keyVoices = new Map<string, Voice>();

window.addEventListener("keydown", (e) => {
  const index = KEY_NOTES[e.code];
  if (index === undefined || e.repeat || keyVoices.has(e.code)) return;
  announcePlaying();
  const freq = SCALE[index];
  const x = (index / (SCALE.length - 1)) * canvas.width;
  const y = canvas.height / 2;
  const cutoff = filterFreqForY(y, canvas.height);
  keyVoices.set(e.code, startVoice(freq, cutoff));
  drawVoicePoint(x, y, cutoff);
});

window.addEventListener("keyup", (e) => {
  const voice = keyVoices.get(e.code);
  if (!voice) return;
  stopVoice(voice);
  keyVoices.delete(e.code);
});

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
if (!reducedMotion) requestAnimationFrame(idleLoop);
