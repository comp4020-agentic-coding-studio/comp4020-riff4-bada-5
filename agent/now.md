# now

## State as of this run (2026-08-20 ~15:15 AEST, 94.5 h to cutoff, crit 4 "An instrument")

Seventh run on `comp4020-crit4-bada`. Re-fetched `crits/04-instrument.json` —
unchanged. `git fetch` + `git status` confirmed `origin/main` matched local
`HEAD` before starting.

Opened to find the outer `memory/now.md`/`memory/MEMORY.md` (these files)
stale — still describing a run from ~09:15 the previous day, missing a real
finding and fix a later run had made (`c930e0a`, the sine-vs-filter bug).
Traced it: that run edited the repo's `agent/MEMORY.md`/`agent/now.md`
directly instead of these outer files, and the next "memory: tick" commit
(`3501a88`) synced outer→repo and silently reverted the good edit back to
stale content. Recovered the lost finding from `git show 1a8fb22` and wrote
it into `MEMORY.md` properly this time, along with the actual root-cause
lesson (`agent/` is harness-synced *from* the outer files, so editing it
directly is a no-op after the next tick — always write to the outer
`memory/` files, this repo's own `CLAUDE.md` already says `agent/` is
harness-owned).

Then did this run's cold-stranger pass, picking up the previous hand-off's
"known residual limitation" note (brightness sweep weaker for low notes) —
and found it undersold the problem. Measuring with RMS-via-OfflineAudioContext
(the previous run's method) showed almost no change project-wide; switching
to spectral centroid (the right proxy — RMS is dominated by the fundamental
and hides changes in the harmonics a lowpass actually shapes) showed the
brightness control was under 4% audible *everywhere* in the scale, not just
weaker at the bottom. Root cause: a fixed Hz cutoff range doesn't scale with
a multi-octave scale's own harmonic spacing. Fixed by keytracking the filter
(cutoff = note frequency × ratio, `DARK_RATIO`–`BRIGHT_RATIO`) and switching
triangle → sawtooth for richer harmonics — now a consistent ~110% centroid
shift across every note, confirmed both in isolated filter-response math and
live in `agent-browser` (traced the real `BiquadFilterNode.frequency` value
at all four pad corners; ratios landed correctly once I found the canvas's
actual `getBoundingClientRect()` — an early pass used `y=100`, which was
above the canvas in the header, giving nonsense identical readings that
looked like a bug in the app but were a bug in the test). `pnpm check`:
35/35 (added 2 new contract tests for the keytracking + fundamental-safety
invariants). Pushed as `981b2f9`.

## Single most important next action

Still ~94.5 h out — not yet the finishing run, but getting closer.

1. **Always write to the outer `memory/now.md`/`memory/MEMORY.md`
   (`/home/ben/projects/comp4020/agents/bada/memory/`), never to a repo's own
   `agent/` copy** — see the new `MEMORY.md` entry. If `agent/` in a repo
   ever looks newer than what you just read from outer `memory/`, that's the
   sync running backwards (a prior run made this exact mistake); diff them
   and reconstruct from `git log`/`git show` if so.
2. The brightness-control fix (`981b2f9`) is the main thing to sanity-check
   live at the next deepen run if there's a spare moment — I verified it via
   traced filter values and isolated math, but never actually *listened* to
   it (no audio output in this sandbox). If a run ever has access to real
   audio output, confirm the dark end sounds meaningfully duller, not just
   measurably so.
3. Real multi-touch verification remains untestable from this CLI (carried
   over unchanged) — `pointerVoices` keys by `pointerId` so two simultaneous
   contacts should chord correctly by construction, but needs a real
   touchscreen or the dashboard's `input_touch` WebSocket channel.
4. Untried cold-stranger angles for a future run: holding a key down for a
   very long time (LFO/vibrato drift, `AudioContext` node-count growth);
   whether the pentatonic scale is genuinely forgiving to a musically
   untrained visitor (a judgement call, maybe better raised at the crit than
   solved unilaterally).
5. Don't touch `PROCESS.md`/`reflections/crit-4.md` yet — finishing-run
   steps only, per doctrine. `PROCESS.md` is still the unedited template.
6. Re-check `package.json`'s `check` script and `spec/README.md` each run —
   unchanged again this run, but course automation can rewrite the
   course-owned surface between runs without this repo's own commits
   changing.
7. Don't touch any other sibling repo — only this deliverable's window is
   open right now.
