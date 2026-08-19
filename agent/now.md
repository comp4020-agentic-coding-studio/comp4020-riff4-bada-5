# now

## State as of this run (2026-08-19 ~21:10 AEST, 112.5 h to cutoff, crit 4 "An instrument")

Opened to find `agent/now.md` stale relative to the actual git history: it
still listed "check `visibilitychange` vs. `blur` divergence" as an untried
idea, but that had already been fixed two commits earlier in `2542cb7`
("release held voices on visibilitychange too, not just blur"). The two
`memory: tick` commits sitting on top of that fix (`f71e77a`, `50e58d8`)
apparently didn't re-derive the hand-off from current state — see the new
`MEMORY.md` entry. Lesson applied: don't trust a `now.md` hand-off's "next
action" list without cross-checking it against `git log` first.

`git fetch` + `git status` confirmed `origin/main` matched local `HEAD`
exactly before starting, and `pnpm check` was clean (33/33 tests,
typecheck/build fine) as a baseline.

Found and fixed a real, previously-uncaught bug in `main.ts`/`synth.ts`: the
oscillator was `type = "sine"`, but a pure sine has no harmonics for the
"brightness" lowpass filter to remove. Below the filter's cutoff, a sine's
*fundamental* is what gets attenuated — so the pad's dark edge silenced
notes rather than muffling them, and `MIN_CUTOFF` (200) sat well below most
of the scale's notes (261–1046 Hz). Confirmed empirically two ways before
touching code:

- `BiquadFilterNode.getFrequencyResponse()` against the pad's actual filter
  params showed the top note (1047 Hz) attenuated -28.6dB at the darkest
  setting (cutoff 200), and the filter doing essentially nothing (0.0–0.3dB)
  for any cutoff above ~440 — i.e. the brightness knob was dead across most
  of its range and destructive at the rest.
- An `OfflineAudioContext` end-to-end render of the top note confirmed it:
  -26.8dB relative to unfiltered at the old sine+200Hz config.

Fixed in `c930e0a` by switching the oscillator to `type = "triangle"` (real
harmonic content for the filter to act on) and raising `MIN_CUTOFF` to 1200
— safely above the scale's highest note (1046.5) so the fundamental itself
is never attenuated (re-verified: same render came back +1.5dB, i.e. full
volume, after the fix). `pnpm check` stayed green (33/33, no test pinned the
old constant values). Verified live in `agent-browser`: dragged across the
pad, hint text hides correctly on first contact, no console errors. Pushed
as `c930e0a`.

**Known residual limitation, not fixed this run**: the brightness sweep is
much weaker for low notes than high ones. At `MIN_CUTOFF` (1200), a low note
(262 Hz) already has most of its near harmonics passing (1200 ≫ 262), so
sweeping to `MAX_CUTOFF` (8000) barely changes its timbre (~-0.3dB measured
on harmonic-only content) — the fix mainly helps notes in the upper half of
the scale, which is also where the old bug was worst. This is "less
expressive for some notes," not "broken" (nothing goes silent now), so it
wasn't chased further this run given the time already spent, but a future
run could consider filter-keyboard-tracking (scale the cutoff relative to
each note's own frequency, not one absolute Hz range for the whole scale) if
this is worth the added complexity.

## Single most important next action

Still ~112 h out — not the finishing run.

1. Consider filter-keyboard-tracking for the brightness/cutoff mapping (see
   residual limitation above) if a future run wants the brightness control
   to feel equally expressive across the whole scale, not just the top half.
2. The stale hand-off's other still-untried idea is still untried: whether
   holding a key down for a very long time causes any drift/CPU issue in the
   LFO graph. Worth a real check (e.g. sample `AudioContext.currentTime` vs.
   wall clock, or watch for accumulating scheduled-event backlog) before
   assuming it's fine.
3. Do another cold-stranger pass focused on the *musical* experience rather
   than mechanics — is the pentatonic scale genuinely forgiving to an
   untrained visitor, does the vibrato ever read as glitchy rather than
   expressive at extreme speeds — these are judgement calls, possibly better
   raised at the crit than solved unilaterally, but worth trying to form an
   opinion on before then.
4. Real multi-touch verification remains untestable from this CLI (carried
   over unchanged again) — `pointerVoices` keys by `pointerId` so two
   simultaneous contacts should chord correctly by construction, but this
   needs an actual touchscreen or the dashboard's `input_touch` WebSocket
   channel, neither available here.
5. Don't touch `PROCESS.md`/`reflections/crit-4.md` yet — finishing-run
   steps only, per doctrine. `PROCESS.md` is still the unedited template.
6. Re-check `package.json`'s `check` script and `spec/README.md` each run
   before assuming what the checks cover — course automation can rewrite
   the course-owned surface between runs without this repo's own commits
   changing (see `MEMORY.md`). Unchanged again this run.
7. Don't touch any other sibling repo — only this deliverable's window is
   open right now.
