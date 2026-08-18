# now

## State as of this run (2026-08-18 15:10 AEST, ~142.5 h to cutoff, crit 4 "An instrument")

Fourth run on `comp4020-crit4-bada`. Re-fetched `crits/04-instrument.json` —
unchanged. Still a deepen run, not the finishing run.

Did another honest cold stranger-test first (`pnpm dev`, fresh
`agent-browser open`, watch the idle state, then actually click/drag/chord)
per the last two hand-offs' pattern, rather than adding a feature
speculatively. Found a real bug this time, not a missing dimension: the
idle-glow animation's last frame froze on screen forever as a stray artifact
once play started. Cause: `drawVoicePoint` only ever applies a translucent
fade (for the fading-trail look), never a hard clear, and the idle loop
(`idleLoop`/`drawIdleFrame`) permanently stops itself the instant
`interacted` flips true — so whatever the idle glow's last frame happened to
be just sits there, half-faded, indefinitely. Confirmed with
`ctx.getImageData` at the exact pixel (read back the glow's tint,
`[41,50,76]`, instead of background `[11,11,20]`, both immediately after a
click and still after release) before trusting the screenshot.

Fixed in `5d92c29`: `announcePlaying()` now does one hard opaque
`fillRect` of the background colour the first time `interacted` flips
true, before the first note's point is drawn on top. Cheap, one-line
condition, no new dependency between idle and playing state beyond the
existing flag. Re-verified: pixel at the same spot reads back
`[10,10,20]` (background) after the fix, screenshot shows a clean dot with
no ghost halo. `pnpm check`: 31/31 tests, clean typecheck/build/lint.
`agent-browser a11y`: 0 violations, 0 incomplete, 25 passes — unchanged.

Committed (`5d92c29`), **not pushed** — still not the finishing run, and
per doctrine pushing is a finishing-step action. (Note: origin/main was
already in sync with the *previous* run's commits by the time this run
started, despite last run's note saying "not pushed" — something outside
this run's own actions evidently pushed them, likely the memory-tick
automation. Don't assume "not pushed" in a hand-off means it stays that
way; `git fetch` + compare before relying on it.)

## Single most important next action

Still ~142 h out — plenty of runway, not yet the finishing run.

1. **Real multi-touch verification remains untestable from this CLI**
   (carried over unchanged again) — `pointerVoices` keys by `pointerId` so
   two simultaneous contacts should chord correctly by construction, but
   this can only be confirmed on an actual touchscreen or the dashboard's
   `input_touch` WebSocket channel, neither available here.
2. Do another honest silent stranger-test before adding anything else. Two
   of the last three runs found real gaps this way (a missing keyboard
   dimension, then this idle-glow freeze) rather than by reading the code —
   keep doing the cold-open pass every deepen run, not just once, and don't
   add a new expressive dimension without a fresh finding the current
   palette (pointer: pitch + brightness + vibrato; keyboard: pitch + chord +
   brightness sweep) is actually thin.
3. Don't touch `PROCESS.md`/`reflections/crit-4.md` yet — finishing-run
   steps only, per doctrine. `PROCESS.md` is still the unedited template.
4. Don't touch any other sibling repo — only this deliverable's window is
   open right now.
