# now

## State as of this run (2026-08-22 ~21:07 AEST, 40.5 h to cutoff, crit 4 "An instrument")

Fourteenth run, a deepen run (prompt didn't call it last). Re-fetched
`crits/04-instrument.json` — brief unchanged, no `-retro` in `related`.
`git status`/`git log` confirmed clean and up to date with `origin/main`
before this run started.

Followed up on the previous run's suggested fresh angle (not another blind
cold-open pass, which came back clean on run 12) — checked spec bullets not
yet re-verified line by line against the live site, specifically "no wrong
way to play." Found and fixed a real bug: `main.ts`'s pointerdown handler
overwrote `pointerVoices.set(e.pointerId, ...)` unconditionally. A real
mouse's pointerId is always `1`, and pressing a second button while the
first is still held fires another `pointerdown` on that same pointerId with
no `pointerup` between — confirmed by dispatching two synthetic
`pointerdown`s then one `pointerup` on `pointerId: 1` against a
monkeypatched `OscillatorNode` start/stop counter (same technique as the
blur-mid-note fix from week 6): 4 starts against only 2 stops before the
fix. The first voice's oscillator and LFO were orphaned — droning forever,
unstoppable by the player. Fixed by stopping any existing voice for that
pointerId before starting the new one. Re-verified after the fix: 4 starts
against 4 stops, and a normal single pointerdown/pointerup pair still
produces 2/2 (no regression). Also spot-checked the keyboard's analogous
path (rapid re-`keydown` on an already-held key) — already correctly
guarded by the existing `e.repeat || keyVoices.has(e.code)` check, nothing
to fix there.

`pnpm check` 35/35 green before and after. `pnpm check:evidence` still fails
on the reflection/PROCESS.md/citation checks, as expected — those are
finishing-run work, untouched this run per doctrine. Committed
(`6e3e321`) and pushed. Dev server started for the browser checks, stopped
and verified dead by PID (`ps aux` + `kill` + a `curl` connection-refused
check), same discipline as the run-11 lesson about `jobs -l`/`kill %N` not
being trustworthy for this. Full writeup and the reusable
"Map keyed by a reusable device id needs an overwrite guard" lesson is in
MEMORY.md.

## Single most important next action

40.5h out at the start of this run — realistically one more run, maybe two,
before "last." Expect the finishing-run call soon; watch for it explicitly
in the next prompt rather than inferring it from hours-remaining arithmetic.

1. **When the finishing run *is* called**, `PROCESS.md`'s three-or-four
   moments and the reflection's one breakthrough should be chosen from the
   eight real, blind-tester/cold-open/edge-case-driven fixes now on record:
   the filter/keytrack fix (`981b2f9`), the blur/visibilitychange release
   fix (`fc9eb47`/`2542cb7`), the idle-glow stuck-frame fix (`5d92c29`), the
   keyboard-brightness-asymmetry fix (`58dfda4`), the hint-text
   discoverability-by-content fix (`f2e2185`), the continuous-trail-fade fix
   (`be24405`), the hint-overlay/discoverability-by-layout fix (`2fb9c06`),
   and this run's orphaned-voice-on-reused-pointerId fix (`6e3e321`) — not a
   generic narrative. Eight is more than the cap, so the finishing run will
   need to actually choose the strongest three-or-four rather than just
   listing all of them; the axe/contrast check from run 13 found nothing new
   to add (a verified negative, not a ninth moment).
2. The brightness-control fix (`981b2f9`) still hasn't been *listened to* —
   no audio output in this sandbox, only traced-parameter verification.
   Carried over, likely unresolvable here.
3. Real multi-touch verification remains untestable from this CLI (carried
   over, unchanged — no touch-event dispatch channel exists at the CLI
   level, per MEMORY.md).
4. The pentatonic-scale-forgiving-to-an-untrained-visitor question is still
   explicitly deferred to the crit by the brief itself ("Hold that thought
   for C5") — not something to solve unilaterally.
5. Don't touch `PROCESS.md`/`reflections/crit-4.md` until a run is actually
   told it's last, per doctrine.
6. Don't touch any other sibling repo — only this deliverable's window is
   open right now.
7. If a future deepen run wants a fresh angle: the "walk the spec bullets
   against the live site" approach that found this run's bug worked well —
   other bullets not yet explicitly stress-tested this way: rapid
   window-resize mid-note (does a mid-drag `canvas.width` reset break
   anything visible or just redraw on the next frame, as expected?), two
   tabs open simultaneously (each gets its own `AudioContext`, likely fine
   but unconfirmed), and extreme window sizes below the already-fixed
   1280×577 hint-visibility case.
