# now

## State as of this run (2026-08-18 08:10 AEST, ~149.5 h to cutoff, crit 4 "An instrument")

Third run on `comp4020-crit4-bada`. Re-fetched `crits/04-instrument.json` —
unchanged. Still a deepen run, not the finishing run.

Did a genuine silent stranger-test first (open cold in `agent-browser`,
drag/click the pad, chord the home row, check mobile viewport, run
`agent-browser a11y`) before touching anything, per the last hand-off's
item 2 ("only add a texture dimension if a stranger-test finds the palette
thin"). It did: pointer play carries three expressive dimensions (pitch,
brightness, speed-vibrato) but keyboard play only ever varied pitch — every
keyboard note landed at a fixed mid-height cutoff regardless of which keys
were held, chords included. That's a real thinness specific to the keyboard
modality the brief names explicitly ("playable with whatever is at hand").

Fixed in `58dfda4`:

- **Keyboard brightness via arrow keys, live even on held notes.** Up/Down
  now sweep a shared `keyboardBrightness` (0–1) that maps through a new
  `filterFreqForT` in `synth.ts` (extracted so the pointer's `filterFreqForY`
  and the keyboard's arrow control share one scale rather than diverging).
  Held keyboard voices' filter cutoffs update live via
  `setTargetAtTime` — so a keyboard-only player can hold a chord and sweep
  it from dark to bright, not just pick a fixed pitch. `e.preventDefault()`
  on the arrow keys stops page scroll from competing.
- Updated the pad's `aria-label` to mention the arrow control (screen-reader
  users have no visual pad to experiment on, so the control needs to be
  named, unlike sighted pointer exploration).
- Added `spec/instrument.test.ts` coverage: `filterFreqForT` agrees with
  `filterFreqForY` at the same fraction, clamps like before;
  `KEYBOARD_BRIGHTNESS_STEP` is nonzero. `pnpm check`: 31/31 tests, clean
  typecheck/build/lint.
- Verified for real, not just by reading the diff: screenshotted a held
  note's trail climbing from mid-green to top-yellow as Up was pressed
  repeatedly (visual confirms the y-position and hue both moved); then
  monkey-patched `AudioParam.prototype.setTargetAtTime` via `agent-browser
  eval` (same technique as last run, since `.value` reads back as 0 in this
  headless sandbox — see `MEMORY.md`) and confirmed the *held* voice's
  filter actually receives new target frequencies on each ArrowDown
  (7220 Hz → 6596 Hz), not just a redraw. `agent-browser a11y`: 0
  violations, 0 incomplete, 25 passes, both before and after the change.
- Committed (`58dfda4`), **not pushed** — still not the finishing run, and
  per Ben's global CLAUDE.md pushing is a deliberate separate step.

## Single most important next action

Still ~149 h out — plenty of runway, not yet the finishing run.

1. **Real multi-touch verification remains untestable from this CLI**
   (carried over unchanged again) — `pointerVoices` keys by `pointerId` so
   two simultaneous contacts should chord correctly by construction, but
   this can only be confirmed on an actual touchscreen or the dashboard's
   `input_touch` WebSocket channel, neither available here.
2. Do another honest silent stranger-test before adding anything else —
   the palette is now reasonably rich on both input paths (pointer: pitch +
   brightness + vibrato; keyboard: pitch + chord + brightness sweep). Don't
   add a fourth dimension without a fresh finding that the current one is
   thin; the last two runs both found and fixed a real gap this way rather
   than padding features speculatively.
3. Don't touch `PROCESS.md`/`reflections/crit-4.md` yet — finishing-run
   steps only, per doctrine. `PROCESS.md` is still the unedited template.
4. Don't touch any other sibling repo — only this deliverable's window is
   open right now.
