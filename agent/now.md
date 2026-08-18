# now

## State as of this run (2026-08-18 21:15 AEST, ~136.5 h to cutoff, crit 4 "An instrument")

Fifth run on `comp4020-crit4-bada`. Re-fetched `crits/04-instrument.json` —
unchanged. Still a deepen run, not the finishing run.

Found that course automation had landed a commit between runs
(`7da64d2`, "starter: bring the course-owned checks forward to the template
tip", author "COMP4020 course automation") — not something this run did.
It dropped `oxlint`/`stylelint` out of `pnpm check` (now just
typecheck+build+vitest), made `check:evidence` work offline, added a meta
description + `og:image` requirement to `spec/invariants.test.ts`, and
added a placeholder `public/card.png` plus the two meta tags in
`index.html`. `main.ts`/`styles.css`/prose untouched. Confirmed `pnpm check`
still green against the new baseline before touching anything.

Did another honest cold stranger-test first, per the standing pattern —
this time asking "what happens if I leave mid-note" rather than just
clicking and watching. Found a real bug: `main.ts` had `window`-scoped
`keydown`/`keyup` listeners for held notes but no `blur` handler. Alt-
tabbing away (or any focus loss) while a key is held never delivers the
matching `keyup`, so the note drones on forever — and because the keydown
handler guards re-trigger with `keyVoices.has(e.code)`, the player can't
even restart that key to silence it once focus returns. Confirmed with a
monkeypatched `OscillatorNode.prototype.stop` counter (via
`agent-browser open --init-script`): dispatched a real `keydown`, then a
plain `blur` event with no keyup — stop-call count didn't move before the
fix, matched the start-call count after it.

Fixed in `fc9eb47`: a `window` `blur` listener that force-stops and clears
every held key voice (and, defensively, every held pointer voice too).
Re-verified live: after the fix, blur mid-note triggers the stop calls, and
refocus + a fresh press of the same key restarts it correctly.

Also replaced the automation's placeholder `public/card.png` ("Replace this
card") with a real one in `9b4fe3a` — composed from an actual
`agent-browser screenshot` of the instrument mid-chord (a real fading trail
across the pad), dimmed and captioned with ImageMagick, at the 1200×630 the
new `og:image` tag already points at. Kept it PNG rather than AVIF
deliberately — og:image compatibility across link-preview scrapers is
patchy for AVIF; noted as a judgement call in `MEMORY.md`.

`pnpm check`: 33/33 tests, clean typecheck/build. `pnpm check:evidence`
still red on the expected finishing-run items only (no `reflections/crit-4.md`,
`PROCESS.md` still template, its example citations don't resolve) — untouched,
per doctrine and the last two hand-offs.

Committed (`fc9eb47`, `9b4fe3a`), **not pushed** — not the finishing run yet;
pushing is a finishing-step action per doctrine.

## Single most important next action

Still ~136 h out — plenty of runway, not yet the finishing run.

1. Do another honest cold stranger-test before adding anything else. Three
   of the last four runs found real gaps this way (missing keyboard
   dimension, idle-glow freeze, now the blur/stuck-note bug) rather than by
   reading the code — keep doing it every deepen run. Ideas not yet tried:
   rapid double-press/double-release timing edge cases, what happens if the
   canvas resizes mid-drag (a mid-glide pointer whose `pointermove`
   coordinates suddenly land outside the new, smaller canvas bounds), and
   whether `AudioContext` ever needs explicit suspend/cleanup on page
   hide/unload (probably fine — GC handles it — but worth one real check).
2. Real multi-touch verification remains untestable from this CLI (carried
   over unchanged again) — `pointerVoices` keys by `pointerId` so two
   simultaneous contacts should chord correctly by construction, but this
   needs an actual touchscreen or the dashboard's `input_touch` WebSocket
   channel, neither available here.
3. Don't touch `PROCESS.md`/`reflections/crit-4.md` yet — finishing-run
   steps only, per doctrine. `PROCESS.md` is still the unedited template.
4. Re-check `package.json`'s `check` script and `spec/README.md` each run
   before assuming what the checks cover — course automation can rewrite
   the course-owned surface between runs without this repo's own commits
   changing (see `MEMORY.md`).
5. Don't touch any other sibling repo — only this deliverable's window is
   open right now.
