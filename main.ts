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
  companion: OscillatorNode;
  companionGain: GainNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  panner: StereoPannerNode;
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
const eraserButton = required(
  document.querySelector<HTMLButtonElement>("#eraser"),
  "missing #eraser button",
);
const replayButton = required(
  document.querySelector<HTMLButtonElement>("#replay"),
  "missing #replay button",
);
const clearButton = required(
  document.querySelector<HTMLButtonElement>("#clear-recording"),
  "missing #clear-recording button",
);
const recordingStatus = required(
  document.querySelector<HTMLElement>("#recording-status"),
  "missing #recording-status",
);

type RecordedKind = "start" | "move" | "end";

interface RecordedEvent {
  kind: RecordedKind;
  id: string;
  x: number;
  y: number;
  at: number;
  pitchScale: number;
  color: string;
  erased?: boolean;
}

const recording: RecordedEvent[] = [];
const recordingLastSample = new Map<string, RecordedEvent>();
let recordedDuration = 0;
let lastRecordedAt: number | undefined;
let isReplaying = false;
let eraseMode = false;
let replayFrame: number | undefined;
const replayVoices = new Map<string, Voice>();
const replayPoints = new Map<string, { x: number; y: number; color: string }>();
const replayLast = new Map<string, { x: number; y: number; at: number }>();
const replayEchoes: Array<{
  x: number;
  y: number;
  color: string;
  createdAt: number;
}> = [];
const REPLAY_ECHO_LIFETIME_MS = 900;

function updateRecordingControls(message?: string): void {
  const hasRecording = recording.length > 0;
  const hasPlayablePath = recording.some(
    (event) => !event.erased && event.kind !== "end",
  );
  replayButton.disabled = !hasPlayablePath || isReplaying;
  clearButton.disabled = !hasRecording || isReplaying;
  eraserButton.disabled = !hasRecording || isReplaying;
  recordingStatus.textContent =
    message ??
    (hasRecording
      ? `Recorded path · ${(recordedDuration / 1000).toFixed(1)}s`
      : "Play to record a path");
}

function pitchScaleForModifiers(shift: boolean, control: boolean): number {
  if (shift && !control) return 2;
  if (control && !shift) return 0.5;
  return 1;
}

function colorForSound(frequency: number, brightness: number): string {
  const octavePosition = Math.log2(frequency / (SCALE[0] / 2));
  const hue = (195 + octavePosition * 72) % 360;
  const lightness = 52 + brightness * 16;
  return `hsl(${hue} 92% ${lightness}%)`;
}

function recordEvent(
  kind: RecordedKind,
  id: string,
  x: number,
  y: number,
  pitchScale = 1,
): void {
  if (isReplaying) return;
  const now = performance.now();
  if (lastRecordedAt !== undefined) {
    // Preserve the player's timing while keeping a long pause between gestures
    // from making a replay appear to have stalled.
    const maximumGap = kind === "start" ? 600 : 150;
    recordedDuration += Math.min(now - lastRecordedAt, maximumGap);
  }
  lastRecordedAt = now;
  const normalX = canvas.width > 0 ? x / canvas.width : 0;
  const normalY = canvas.height > 0 ? y / canvas.height : 0;
  const previous = recordingLastSample.get(id);
  const distance = previous
    ? Math.hypot(
        (normalX - previous.x) * canvas.width,
        (normalY - previous.y) * canvas.height,
      )
    : 0;
  const sampleCount =
    kind === "move" && previous ? Math.max(1, Math.ceil(distance / 10)) : 1;

  let finalEvent: RecordedEvent | undefined;
  for (let sample = 1; sample <= sampleCount; sample += 1) {
    const amount = sample / sampleCount;
    const sampleX = previous
      ? previous.x + (normalX - previous.x) * amount
      : normalX;
    const sampleY = previous
      ? previous.y + (normalY - previous.y) * amount
      : normalY;
    const sampleAt = previous
      ? previous.at + (recordedDuration - previous.at) * amount
      : recordedDuration;
    const sampleBrightness = brightnessForY(
      sampleY * canvas.height,
      canvas.height,
    );
    const sampleFrequency =
      frequencyForX(sampleX * canvas.width, canvas.width) * pitchScale;
    finalEvent = {
      kind: sample === sampleCount ? kind : "move",
      id,
      x: sampleX,
      y: sampleY,
      at: sampleAt,
      pitchScale,
      color: colorForSound(sampleFrequency, sampleBrightness),
    };
    recording.push(finalEvent);
  }

  if (kind === "end") recordingLastSample.delete(id);
  else if (finalEvent) recordingLastSample.set(id, finalEvent);
  updateRecordingControls(kind === "end" ? undefined : "Recording path…");
}

let audioCtx: AudioContext | undefined;
let master: GainNode | undefined;

// The audio graph can only start after a user gesture, so it's built lazily
// on the first pointerdown/keydown rather than at page load.
function getAudio(): { audio: AudioContext; bus: GainNode } {
  if (!audioCtx || !master) {
    audioCtx = new AudioContext();
    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.24;
    compressor.connect(audioCtx.destination);

    // A short, quiet feedback delay gives quick gestures a little sparkle and
    // makes chords feel wider without washing out the next notes.
    const delay = audioCtx.createDelay(1);
    delay.delayTime.value = 0.19;
    const feedback = audioCtx.createGain();
    feedback.gain.value = 0.17;
    const wet = audioCtx.createGain();
    wet.gain.value = 0.2;
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(compressor);

    master = audioCtx.createGain();
    master.gain.value = 0.62;
    master.connect(compressor);
    master.connect(delay);
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

// A one-shot fade+dot, used only under prefers-reduced-motion (see below):
// with no continuous loop, each input event has to carry its own fade.
function drawVoicePointStatic(
  x: number,
  y: number,
  t: number,
  color?: string,
): void {
  ctx.fillStyle = "rgba(11, 11, 20, 0.2)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawRecordedTrail();
  drawDot(x, y, t, color);
}

function drawDot(x: number, y: number, t: number, color?: string): void {
  const hue = 210 - t * 170;
  ctx.beginPath();
  ctx.fillStyle = color ?? `hsl(${hue} 90% 60%)`;
  ctx.arc(x, y, 26, 0, Math.PI * 2);
  ctx.fill();
}

function drawRecordedTrail(): void {
  if (recording.length === 0) return;
  const lastPoint = new Map<string, { x: number; y: number }>();
  ctx.save();
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const event of recording) {
    if (event.erased) {
      lastPoint.delete(event.id);
      continue;
    }
    const x = event.x * canvas.width;
    const y = event.y * canvas.height;
    if (event.kind === "start") {
      ctx.moveTo(x, y);
      lastPoint.set(event.id, { x, y });
    } else if (event.kind === "move") {
      const previous = lastPoint.get(event.id);
      if (previous) {
        ctx.beginPath();
        ctx.moveTo(previous.x, previous.y);
        ctx.lineTo(x, y);
        ctx.strokeStyle = event.color;
        ctx.stroke();
      }
      lastPoint.set(event.id, { x, y });
    } else {
      lastPoint.delete(event.id);
    }
  }
  ctx.restore();
}

// Redrawing only on input events meant a released note's trail only ever
// faded on the *next* event, anywhere on the pad — a player who stops
// playing got a glow frozen in place indefinitely instead of watching it
// fade. This loop fades every frame instead, and redraws every currently
// active voice on top so held notes stay lit while everything else decays.
// Runs forever once started, same as the idle loop it replaces, so a trail
// left mid-fade is never abandoned. Skipped under reduced motion, where a
// static frame between events is the intended, gentler behaviour.
const TRAIL_FADE_ALPHA = 0.045;
let playLoopRunning = false;

function drawActiveVoices(): void {
  drawRecordedTrail();
  const now = performance.now();
  for (let index = replayEchoes.length - 1; index >= 0; index -= 1) {
    const echo = replayEchoes[index];
    const age = now - echo.createdAt;
    if (age >= REPLAY_ECHO_LIFETIME_MS) {
      replayEchoes.splice(index, 1);
      continue;
    }
    ctx.save();
    ctx.globalAlpha = (1 - age / REPLAY_ECHO_LIFETIME_MS) * 0.62;
    drawDot(echo.x, echo.y, brightnessForY(echo.y, canvas.height), echo.color);
    ctx.restore();
  }
  for (const { x, y, color } of pointerLast.values()) {
    drawDot(x, y, brightnessForY(y, canvas.height), color);
  }
  const y = (1 - keyboardBrightness) * canvas.height;
  for (const x of keyPositions.values()) {
    drawDot(x, y, keyboardBrightness);
  }
  for (const { x, y, color } of replayPoints.values()) {
    drawDot(x, y, brightnessForY(y, canvas.height), color);
  }
}

function playLoop(): void {
  ctx.fillStyle = `rgba(11, 11, 20, ${TRAIL_FADE_ALPHA})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawActiveVoices();
  requestAnimationFrame(playLoop);
}

function startPlayLoop(): void {
  if (playLoopRunning || reducedMotion) return;
  playLoopRunning = true;
  requestAnimationFrame(playLoop);
}

function startVoice(freq: number, t: number): Voice {
  const { audio, bus } = getAudio();
  const osc = audio.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq;

  // A detuned sine an octave above adds a glassy edge whose level follows
  // brightness. Sine waves keep that colour smooth instead of buzzy.
  const companion = audio.createOscillator();
  companion.type = "sine";
  companion.frequency.value = freq * 2;
  companion.detune.value = 7;
  const companionGain = audio.createGain();
  companionGain.gain.value = 0.05 + t * 0.12;

  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.55;
  filter.frequency.value = filterFreqForT(freq, t);
  const gain = audio.createGain();
  gain.gain.value = 0;
  const panner = audio.createStereoPanner();
  const scalePosition =
    (Math.log2(freq / SCALE[0]) / Math.log2(SCALE[SCALE.length - 1] / SCALE[0])) *
      2 -
    1;
  panner.pan.value = Math.min(Math.max(scalePosition * 0.68, -0.68), 0.68);
  // Vibrato depth (lfoGain, in cents) starts at zero and is driven by
  // pointer speed — a held key or a still pointer stays pure.
  const lfo = audio.createOscillator();
  lfo.frequency.value = VIBRATO_RATE_HZ;
  const lfoGain = audio.createGain();
  lfoGain.gain.value = 0;
  lfo.connect(lfoGain).connect(osc.detune);
  lfoGain.connect(companion.detune);
  lfo.start();
  osc.connect(filter);
  companion.connect(companionGain).connect(filter);
  filter.connect(gain).connect(panner).connect(bus);
  osc.start();
  companion.start();
  gain.gain.linearRampToValueAtTime(0.28, audio.currentTime + 0.065);
  return {
    osc,
    companion,
    companionGain,
    gain,
    filter,
    panner,
    lfo,
    lfoGain,
    freq,
  };
}

function updateVoiceTone(voice: Voice, freq: number, brightness: number): void {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  voice.freq = freq;
  voice.osc.frequency.setTargetAtTime(freq, now, 0.035);
  voice.companion.frequency.setTargetAtTime(freq * 2, now, 0.04);
  voice.filter.frequency.setTargetAtTime(
    filterFreqForT(freq, brightness),
    now,
    0.04,
  );
  voice.companionGain.gain.setTargetAtTime(
    0.05 + brightness * 0.12,
    now,
    0.05,
  );
  const scalePosition =
    (Math.log2(freq / SCALE[0]) / Math.log2(SCALE[SCALE.length - 1] / SCALE[0])) *
      2 -
    1;
  voice.panner.pan.setTargetAtTime(
    Math.min(Math.max(scalePosition * 0.68, -0.68), 0.68),
    now,
    0.06,
  );
}

function stopVoice(voice: Voice): void {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setTargetAtTime(0, now, 0.11);
  voice.osc.stop(now + 0.7);
  voice.companion.stop(now + 0.7);
  voice.lfo.stop(now + 0.7);
}

function finishReplay(): void {
  for (const voice of replayVoices.values()) stopVoice(voice);
  replayVoices.clear();
  replayPoints.clear();
  replayLast.clear();
  isReplaying = false;
  replayFrame = undefined;
  updateRecordingControls();
}

function cancelReplay(): void {
  if (replayFrame !== undefined) cancelAnimationFrame(replayFrame);
  if (isReplaying) finishReplay();
}

function replayRecording(): void {
  if (recording.length === 0) return;
  if (eraseMode) setEraser(false);
  cancelReplay();
  releaseAllVoices();
  announcePlaying();
  isReplaying = true;
  replayEchoes.length = 0;
  updateRecordingControls("Replaying recorded path…");
  getAudio();

  let nextEvent = 0;
  const startedAt = performance.now();

  function frame(now: number): void {
    const elapsed = now - startedAt;
    while (
      nextEvent < recording.length &&
      recording[nextEvent].at <= elapsed
    ) {
      const event = recording[nextEvent++];
      const x = event.x * canvas.width;
      const y = event.y * canvas.height;
      const brightness = brightnessForY(y, canvas.height);
      if (event.erased) {
        const erasedVoice = replayVoices.get(event.id);
        if (erasedVoice) stopVoice(erasedVoice);
        replayVoices.delete(event.id);
        replayPoints.delete(event.id);
        replayLast.delete(event.id);
        continue;
      }
      const frequency =
        frequencyForX(x, canvas.width) * event.pitchScale;
      if (event.kind !== "end") {
        // A single animation frame can consume several densely recorded
        // samples. Keep each one as a fading echo instead of displaying only
        // the final Map position and visually skipping everything in between.
        replayEchoes.push({ x, y, color: event.color, createdAt: now });
        if (replayEchoes.length > 1600) replayEchoes.shift();
      }
      if (event.kind === "start") {
        const previousVoice = replayVoices.get(event.id);
        if (previousVoice) stopVoice(previousVoice);
        replayVoices.set(
          event.id,
          startVoice(frequency, brightness),
        );
        replayPoints.set(event.id, { x, y, color: event.color });
        replayLast.set(event.id, { x, y, at: event.at });
      } else if (event.kind === "move") {
        let voice = replayVoices.get(event.id);
        if (!voice) {
          voice = startVoice(frequency, brightness);
          replayVoices.set(event.id, voice);
        } else if (audioCtx) {
          updateVoiceTone(voice, frequency, brightness);
          const previous = replayLast.get(event.id);
          if (previous) {
            const dt = event.at - previous.at;
            const speed =
              dt > 0 ? Math.hypot(x - previous.x, y - previous.y) / dt : 0;
            voice.lfoGain.gain.setTargetAtTime(
              vibratoCentsForSpeed(speed),
              audioCtx.currentTime,
              0.05,
            );
          }
        }
        replayPoints.set(event.id, { x, y, color: event.color });
        replayLast.set(event.id, { x, y, at: event.at });
      } else {
        const voice = replayVoices.get(event.id);
        if (voice) stopVoice(voice);
        replayVoices.delete(event.id);
        replayPoints.delete(event.id);
        replayLast.delete(event.id);
      }
    }

    if (nextEvent < recording.length) {
      replayFrame = requestAnimationFrame(frame);
    } else {
      finishReplay();
    }
  }

  replayFrame = requestAnimationFrame(frame);
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
  startPlayLoop();
}

// Pointer (mouse or touch) — one continuous glide per contact point.
// x = pitch, y = brightness, so different paths across the pad sound
// different and there's no position that sounds "wrong". Speed of travel
// (tracked per contact point below) layers vibrato on top, so the same path
// walked slowly vs. flicked quickly sounds different too.
const pointerVoices = new Map<number, Voice>();
const pointerLast = new Map<
  number,
  { x: number; y: number; t: number; pitchScale: number; color: string }
>();
const erasingPointers = new Set<number>();

function pointerPosition(e: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
  const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
  return { x, y };
}

function distanceToSegment(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const amount =
    lengthSquared === 0
      ? 0
      : Math.min(
          Math.max(((x - x1) * dx + (y - y1) * dy) / lengthSquared, 0),
          1,
        );
  return Math.hypot(x - (x1 + amount * dx), y - (y1 + amount * dy));
}

function eraseAt(x: number, y: number): void {
  const radius = 28;
  const previous = new Map<string, RecordedEvent>();
  let changed = false;
  for (const event of recording) {
    if (event.kind === "end") {
      previous.delete(event.id);
      continue;
    }
    const eventX = event.x * canvas.width;
    const eventY = event.y * canvas.height;
    const prior = previous.get(event.id);
    const distance = prior
      ? distanceToSegment(
          x,
          y,
          prior.x * canvas.width,
          prior.y * canvas.height,
          eventX,
          eventY,
        )
      : Math.hypot(x - eventX, y - eventY);
    if (distance <= radius) {
      event.erased = true;
      changed = true;
    }
    previous.set(event.id, event);
  }
  if (changed) {
    updateRecordingControls("Path edited · erase more or resume play");
    if (reducedMotion) {
      ctx.fillStyle = "#0b0b14";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawRecordedTrail();
    }
  }
}

function setEraser(enabled: boolean): void {
  cancelReplay();
  releaseAllVoices();
  eraseMode = enabled;
  eraserButton.setAttribute("aria-pressed", String(enabled));
  canvas.classList.toggle("eraser-active", enabled);
  updateRecordingControls(
    enabled ? "Eraser on · drag across a line to remove it" : undefined,
  );
}

function updatePointerModifierTones(shift: boolean, control: boolean): void {
  const pitchScale = pitchScaleForModifiers(shift, control);
  for (const [pointerId, voice] of pointerVoices) {
    const last = pointerLast.get(pointerId);
    if (!last || last.pitchScale === pitchScale) continue;
    const brightness = brightnessForY(last.y, canvas.height);
    const frequency = frequencyForX(last.x, canvas.width) * pitchScale;
    const color = colorForSound(frequency, brightness);
    updateVoiceTone(voice, frequency, brightness);
    recordEvent("move", `pointer-${pointerId}`, last.x, last.y, pitchScale);
    pointerLast.set(pointerId, { ...last, pitchScale, color });
  }
}

canvas.addEventListener("pointerdown", (e) => {
  cancelReplay();
  // Capture keeps the glide going if the pointer drifts outside the pad —
  // a nice-to-have, not a requirement for sound, so a capture failure must
  // never silently swallow the voice it's guarding.
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // Continue without capture.
  }
  const { x, y } = pointerPosition(e);
  if (eraseMode) {
    erasingPointers.add(e.pointerId);
    eraseAt(x, y);
    return;
  }
  announcePlaying();
  // A second button pressed while the first is still held fires another
  // pointerdown for the *same* pointerId with no pointerup between them —
  // without this, overwriting the map entry orphans the first voice's
  // oscillators, which then drone on with no way for the player to stop
  // them (the map only ever points at the latest voice).
  const existing = pointerVoices.get(e.pointerId);
  if (existing) stopVoice(existing);
  const pitchScale = pitchScaleForModifiers(e.shiftKey, e.ctrlKey);
  const freq = frequencyForX(x, canvas.width) * pitchScale;
  const brightness = brightnessForY(y, canvas.height);
  const color = colorForSound(freq, brightness);
  recordEvent("start", `pointer-${e.pointerId}`, x, y, pitchScale);
  pointerVoices.set(e.pointerId, startVoice(freq, brightness));
  pointerLast.set(e.pointerId, {
    x,
    y,
    t: e.timeStamp,
    pitchScale,
    color,
  });
  if (reducedMotion) drawVoicePointStatic(x, y, brightness, color);
});

canvas.addEventListener("pointermove", (e) => {
  if (erasingPointers.has(e.pointerId)) {
    const { x, y } = pointerPosition(e);
    eraseAt(x, y);
    return;
  }
  const voice = pointerVoices.get(e.pointerId);
  if (!voice || !audioCtx) return;
  const { x, y } = pointerPosition(e);
  const pitchScale = pitchScaleForModifiers(e.shiftKey, e.ctrlKey);
  const freq = frequencyForX(x, canvas.width) * pitchScale;
  const brightness = brightnessForY(y, canvas.height);
  const color = colorForSound(freq, brightness);
  recordEvent("move", `pointer-${e.pointerId}`, x, y, pitchScale);
  updateVoiceTone(voice, freq, brightness);

  const last = pointerLast.get(e.pointerId);
  if (last) {
    const dt = e.timeStamp - last.t;
    const dist = Math.hypot(x - last.x, y - last.y);
    const speed = dt > 0 ? dist / dt : 0;
    const depth = vibratoCentsForSpeed(speed);
    voice.lfoGain.gain.setTargetAtTime(depth, audioCtx.currentTime, 0.05);
  }
  pointerLast.set(e.pointerId, { x, y, t: e.timeStamp, pitchScale, color });

  if (reducedMotion) drawVoicePointStatic(x, y, brightness, color);
});

function releasePointer(e: PointerEvent): void {
  if (erasingPointers.delete(e.pointerId)) {
    updateRecordingControls(eraseMode ? "Eraser on · path updated" : undefined);
    return;
  }
  const voice = pointerVoices.get(e.pointerId);
  if (!voice) return;
  const last = pointerLast.get(e.pointerId);
  if (last) {
    recordEvent(
      "end",
      `pointer-${e.pointerId}`,
      last.x,
      last.y,
      last.pitchScale,
    );
  }
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

// Only needed under reduced motion: with the continuous play loop, held
// keys already redraw at the new brightness on the very next frame.
function redrawKeyboardVoicesStatic(): void {
  const y = (1 - keyboardBrightness) * canvas.height;
  for (const x of keyPositions.values()) {
    drawVoicePointStatic(x, y, keyboardBrightness);
  }
}

window.addEventListener("keydown", (e) => {
  if (
    e.code === "ShiftLeft" ||
    e.code === "ShiftRight" ||
    e.code === "ControlLeft" ||
    e.code === "ControlRight"
  ) {
    if (!e.repeat) updatePointerModifierTones(e.shiftKey, e.ctrlKey);
    return;
  }
  if (e.code === "ArrowUp" || e.code === "ArrowDown") {
    e.preventDefault();
    const delta = e.code === "ArrowUp" ? 1 : -1;
    keyboardBrightness = Math.min(
      Math.max(keyboardBrightness + delta * KEYBOARD_BRIGHTNESS_STEP, 0),
      1,
    );
    if (audioCtx) {
      for (const voice of keyVoices.values()) {
        updateVoiceTone(voice, voice.freq, keyboardBrightness);
      }
    }
    if (reducedMotion) redrawKeyboardVoicesStatic();
    return;
  }
  const index = KEY_NOTES[e.code];
  if (index === undefined || e.repeat || keyVoices.has(e.code)) return;
  cancelReplay();
  announcePlaying();
  const freq = SCALE[index];
  const x = (index / (SCALE.length - 1)) * canvas.width;
  const y = (1 - keyboardBrightness) * canvas.height;
  recordEvent("start", `key-${e.code}`, x, y);
  keyVoices.set(e.code, startVoice(freq, keyboardBrightness));
  keyPositions.set(e.code, x);
  if (reducedMotion) drawVoicePointStatic(x, y, keyboardBrightness);
});

window.addEventListener("keyup", (e) => {
  if (
    e.code === "ShiftLeft" ||
    e.code === "ShiftRight" ||
    e.code === "ControlLeft" ||
    e.code === "ControlRight"
  ) {
    updatePointerModifierTones(e.shiftKey, e.ctrlKey);
    return;
  }
  const voice = keyVoices.get(e.code);
  if (!voice) return;
  const x = keyPositions.get(e.code);
  if (x !== undefined) {
    recordEvent(
      "end",
      `key-${e.code}`,
      x,
      (1 - keyboardBrightness) * canvas.height,
    );
  }
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

replayButton.addEventListener("click", replayRecording);
eraserButton.addEventListener("click", () => setEraser(!eraseMode));
clearButton.addEventListener("click", () => {
  if (eraseMode) setEraser(false);
  cancelReplay();
  recording.length = 0;
  recordingLastSample.clear();
  recordedDuration = 0;
  lastRecordedAt = undefined;
  ctx.fillStyle = "#0b0b14";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  updateRecordingControls();
});

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
updateRecordingControls();
if (!reducedMotion) requestAnimationFrame(idleLoop);
