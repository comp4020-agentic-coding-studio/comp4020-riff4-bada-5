# now

## State as of this run (2026-08-21 ~15:30 AEST, 70.5 h to cutoff, crit 4 "An instrument")

Tenth run. Brief unchanged (re-fetched `crits/04-instrument.json`). `git
status`/`git fetch` confirmed clean and up to date with `origin/main` before
starting. `pnpm check` was 35/35 green at the start (real deepen run, not a
rescue).

**Found and fixed a real gap this run**: spawned another genuinely blind
subagent (no source access, only the live `agent-browser`-rendered page and
the brief's spec bullets) to play the instrument cold — same method as the
last several runs, still earning its keep. It played mouse and keyboard
successfully, including a blind chord, and found no console errors — but
noticed the pad's trail/glow only ever redrew on a new input event, so a
released note's dot froze in place indefinitely until some *unrelated* later
event happened to fade it. Confirmed with `getImageData` on the exact drawn
pixel: bit-identical across a multi-second idle gap.

Root cause: every fade+redraw happened synchronously inside the
pointermove/keydown handlers themselves — there was no continuous animation
loop driving the trail while playing (only the *idle* state, before first
interaction, had one). Fixed (`be24405`) by replacing the per-event
fade-and-draw with a `requestAnimationFrame` loop that fades every frame and
redraws only the currently-active voices (tracked via the existing
`pointerLast`/`keyPositions` maps) on top, so held notes stay lit and
released ones actually decay in real time. Reduced-motion keeps the old
one-shot per-event behaviour (`drawVoicePointStatic`), which is the correct,
gentler effect there, not a bug.

Verified live in `agent-browser`, fresh session each time (learned lesson
from an earlier run: a session that's already dispatched one interaction
isn't a true cold-open for a later screenshot):
- cold idle glow present and correct
- three-key chord (A/D/G) all lit brightly while held
- after releasing all three with zero further input, a screenshot 1.5s later
  shows the pad fully faded back to background — the actual bug, now fixed
- a note held continuously for 1s stays fully bright (doesn't fade while
  still playing) — confirms the fix doesn't make active notes flicker
- `agent-browser errors` clean throughout

`pnpm check` 35/35 green after the fix. Dev server stopped, temp screenshots
cleaned up. Pushed.

## Single most important next action

70.5h out at the start of this run — getting close to the finishing run.
Expect the next run or the one after to be told it's last.

1. **The blind-cold-tester technique found a fourth distinct real bug this
   way** (idle-glow stuck-frame, keyboard-brightness-asymmetry,
   hint-text-discoverability, now trail-freeze-on-idle). Worth one more pass
   on a future deepen run if there is one, but diminishing returns are
   plausible now — the obvious visual/interaction gaps in this instrument
   may be largely exhausted. If a future blind pass comes back clean, that's
   a legitimate result, not a failure to look hard enough.
2. The brightness-control fix (`981b2f9`, week 6) still hasn't been
   *listened to* — carried over, no audio output in this sandbox.
3. Real multi-touch verification remains untestable from this CLI (carried
   over unchanged).
4. The pentatonic-scale-forgiving-to-an-untrained-visitor question is still
   explicitly deferred to the crit, not solved unilaterally (carried over
   unchanged).
5. Don't touch `PROCESS.md`/`reflections/crit-4.md` yet — finishing-run
   steps only, per doctrine. `PROCESS.md` is still the unedited template.
   When the finishing run does come, the real spine of the process is: the
   filter/keytrack fix (`981b2f9`), the blur/visibilitychange release fix
   (`fc9eb47`/`2542cb7`), the idle-glow stuck-frame fix (`5d92c29`), the
   keyboard-brightness-asymmetry fix (`58dfda4`), the hint-text
   discoverability fix (`f2e2185`), and this run's continuous-trail-fade fix
   (`be24405`) — six real, blind-tester-or-cold-open-driven moments to choose
   PROCESS.md's three-or-four and the reflection's breakthrough from, not a
   generic narrative.
6. Don't touch any other sibling repo — only this deliverable's window is
   open right now.
