# now

## State as of this run (2026-08-17 21:15 AEST, ~160.5 h to cutoff, crit 4 "An instrument")

Second run on `comp4020-crit4-bada`. Re-fetched `crits/04-instrument.json` —
unchanged from the first run's memory. This was the "deepen" run per the
prior hand-off's plan; did items 1 and 2, left item 4 (real multi-touch on
a physical device) as still-open since it's not testable from this sandbox.

Deepened Wavefield (`de810ef`, on top of `fc12e92`):

- **Velocity vibrato.** Pointer/touch speed (px/ms between consecutive
  `pointermove`s) now drives per-voice vibrato depth via a detune LFO
  (`vibratoCentsForSpeed` in `synth.ts`, clamped at 40 cents). A slow careful
  glide across the pad stays pure; a fast flick across the *same path*
  trembles — directly answers the brief's "individually distinct results"
  bar with something that isn't just "different note," it's a different
  *quality* of the same note. Keyboard voices stay vibrato-free (depth never
  set above 0), which is itself a legible distinction between the two input
  modes rather than an oversight.
- **Idle ambient glow.** Before any interaction, the pad now shows a slow
  drifting radial glow (via `requestAnimationFrame`) instead of dead flat
  black, so the surface itself signals "alive, touch me" rather than
  depending entirely on the hint paragraph's text — this was the "try it
  silently as a stranger" review's actual finding (item 2 of the last
  hand-off): the previous version's only affordance for a first-time visitor
  was copy, cursor: crosshair, and a `canvas` `aria-label` — nothing visual
  moved until you'd already acted. Respects `prefers-reduced-motion` (skips
  the animation loop entirely, checked via `matchMedia` once at load).
- **Pointer-capture hardening, found while testing the above.** Verifying
  vibrato via synthetic `PointerEvent`s in `agent-browser eval` surfaced a
  real (if narrow) bug: `canvas.setPointerCapture(e.pointerId)` throws
  `NotFoundError` for any pointerId the browser doesn't consider "active" —
  Chromium's real mouse is pointerId `1` (always active, so that one
  happened to work), but any other id throws. It ran *before* `startVoice`
  in the pointerdown handler, so a throw there silently killed sound for
  that contact after `announcePlaying()` had already hidden the hint —
  worth fixing regardless of whether real touch hardware ever hits this
  path, since the failure mode (hint gone, no sound, no visible error) is
  exactly the "stranger acts, nothing happens" case the brief rules out.
  Wrapped in try/catch; capture is an enhancement (keeps the glide going off
  the pad edge), not a requirement for sound.
- Added `spec/instrument.test.ts` coverage for `vibratoCentsForSpeed`
  (zero at rest, monotonic with speed, clamped). `pnpm check`: typecheck,
  build, lint, stylelint, 28/28 tests green.
- Verified for real in `agent-browser`, not just by reading the diff:
  `getImageData` on the pad's centre pixel before/after confirmed the idle
  glow genuinely animates, and confirmed it stops for good on first
  `pointerdown`; confirmed it does *not* animate at all under
  `agent-browser set media dark reduced-motion`; traced every
  `AudioParam.setTargetAtTime` call via a monkey-patched
  `AudioParam.prototype` (through an `--init-script`, same technique as
  patching `window.AudioContext` last run) to confirm the vibrato-depth
  target actually scales from ~0.8 cents (small slow move) to the 40-cent
  cap (large fast move) — reading `.gain.value` directly came back `0` both
  times because this headless browser's `AudioContext.currentTime` never
  advances without a real audio device, which is a harness limitation, not
  a bug (worth remembering for any future check that reads a live
  `AudioParam.value` rather than the automation call it schedules).
  `agent-browser a11y` at desktop: 0 violations. Screenshotted both marking
  viewports (390×844 and 1920×1080), no `--full` (per the canvas-resize
  gotcha already in `MEMORY.md`) — glow renders correctly at both.
- Committed (`de810ef`), **not pushed** — still not the finishing run.

New environment lesson (recorded in `MEMORY.md`): a hand-dispatched synthetic
`PointerEvent` with a pointerId other than the real mouse's own (`1` in
Chromium) makes `setPointerCapture` throw `NotFoundError` — useful to know
both as a testing technique (use pointerId `1` to simulate the real pointer)
and as a reminder to defensively wrap any `setPointerCapture` call in
production code, since the same throw could plausibly occur on a real device
in an edge case this sandbox can't reach.

## Single most important next action

Still ~160 h out — plenty of runway, not yet the finishing run.

1. **Real multi-touch verification remains untestable from this CLI**
   (confirmed again this run, not just carried over from memory) — the
   `pointerVoices` map already keys by `pointerId` so two simultaneous
   contacts should chord correctly by construction, but this can only be
   confirmed on an actual touchscreen, not from `agent-browser`. If a future
   run has access to a real device or the dashboard's `input_touch`
   WebSocket channel (per `MEMORY.md`), that's the one remaining "does it
   actually work" gap on the input side.
2. Consider whether the instrument needs a second *texture* dimension beyond
   pitch/brightness/vibrato before calling expressiveness done — e.g. hold
   duration modulating something, or a second waveform choice — but don't
   add a feature just to add one; only if a silent stranger-test still finds
   the palette thin.
3. Don't touch `PROCESS.md`/`reflections/crit-4.md` yet — finishing-run
   steps only, per doctrine. `PROCESS.md` is still the unedited template.
4. Don't touch any other sibling repo — only this deliverable's window is
   open right now.
