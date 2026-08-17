import {
  SCALE,
  KEY_NOTES,
  MIN_CUTOFF,
  MAX_CUTOFF,
  frequencyForX,
  filterFreqForY,
} from "./synth";

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  filter: BiquadFilterNode;
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
  osc.connect(filter).connect(gain).connect(bus);
  osc.start();
  gain.gain.linearRampToValueAtTime(0.35, audio.currentTime + 0.04);
  return { osc, gain, filter };
}

function stopVoice(voice: Voice): void {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setTargetAtTime(0, now, 0.08);
  voice.osc.stop(now + 0.5);
}

function announcePlaying(): void {
  hint?.setAttribute("hidden", "");
}

// Pointer (mouse or touch) — one continuous glide per contact point.
// x = pitch, y = brightness, so different paths across the pad sound
// different and there's no position that sounds "wrong".
const pointerVoices = new Map<number, Voice>();

function pointerPosition(e: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
  const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
  return { x, y };
}

canvas.addEventListener("pointerdown", (e) => {
  announcePlaying();
  canvas.setPointerCapture(e.pointerId);
  const { x, y } = pointerPosition(e);
  const freq = frequencyForX(x, canvas.width);
  const cutoff = filterFreqForY(y, canvas.height);
  pointerVoices.set(e.pointerId, startVoice(freq, cutoff));
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
  drawVoicePoint(x, y, cutoff);
});

function releasePointer(e: PointerEvent): void {
  const voice = pointerVoices.get(e.pointerId);
  if (!voice) return;
  stopVoice(voice);
  pointerVoices.delete(e.pointerId);
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
