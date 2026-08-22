# Process overview

The course site's
[assessment page](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/#what-you-submit)
is the requirement; this is the reading guide.

## What I built

**Wavefield**: a canvas pad that plays a five-note pentatonic scale.
Position on the pad sets pitch (x) and filter brightness (y) for a mouse or
touch drag; the home row (A–L) plays the same scale on a keyboard, with
Up/Down sweeping brightness live and multiple keys held together forming a
chord. Every voice is a sawtooth through a keytracked lowpass and a
speed-driven vibrato LFO, so a slow glide and a fast flick across the same
path sound different, and no position or key combination is a wrong one to
try.

## The moments that mattered

1. **The brightness filter was inaudible, and a naive check would have
   missed why.** A lowpass "brightness" control barely changed the tone: a
   pure sine has no harmonics for a lowpass to remove at all
   ([`c930e0a`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-bada/commit/c930e0afaa5df37b31ba08e59dfeeec238882e58)),
   and switching to a harmonic-rich wave still barely moved things once
   measured properly. RMS looked fine because it's dominated by the
   fundamental, the loudest partial — the actual perceptual measure is
   spectral centroid, which showed under 4% shift even at the best note. The
   real fix was keytracking the cutoff to each note's own fundamental rather
   than sweeping one fixed Hz range across a multi-octave scale
   ([`981b2f9`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-bada/commit/981b2f9eed49d339099dffeb3e7dff50ca1a7bd1)),
   verified with `BiquadFilterNode.getFrequencyResponse()` against each
   note's theoretical harmonic series until every note in the scale reached
   a consistent ~110% centroid shift.
2. **A silent stranger-test found an expressive asymmetry no code review
   would.** With no source access, a blind pass dragged the pad, then
   chorded the home row — and every keyboard note landed at the same fixed
   brightness, where pointer play already carried pitch, brightness, and
   speed-vibrato. Fixed by giving Up/Down arrows the same live brightness
   dimension, including across keys already held
   ([`58dfda4`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-bada/commit/58dfda4869992c01e7ce966b6c47adbe157ec019)) —
   a gap the brief's own bar names directly ("two people at the same page
   sound different") but that only surfaced by actually playing it like a
   stranger would, not by reading the event handlers.
3. **"No way to get it wrong" is a claim about states a player can reach,
   not just inputs they can give — so I tested leaving, not just playing.**
   Alt-tabbing mid-note never delivers the matching `keyup`; the held-key
   guard then blocked the same key from restarting once focus returned, so
   a stuck drone had no recovery short of reloading
   ([`fc9eb47`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-bada/commit/fc9eb47b2e65a4aadf54ac18fd72c232dea28f7b)).
   A follow-up dispatch of `visibilitychange` without `blur` (the real path
   on mobile backgrounding) showed the first fix wasn't enough on its own
   ([`2542cb7`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-bada/commit/2542cb71917e381b415875bcb4a08b3269bd2e6b)).
   Both verified the same way: monkeypatch `OscillatorNode.stop` via
   `agent-browser`'s `--init-script`, count calls against `.start()`, dispatch
   the event with no real audio output needed.
4. **Walking the brief's own bullets against the live site, one by one,
   found what cold-open play sessions hadn't.** "No wrong way to play"
   turned into a literal check: what happens on a second mouse button while
   the first is still held? A real mouse's pointerId is always `1`, so that
   fires another `pointerdown` on the same id with no `pointerup` between —
   overwriting the voice map orphaned the first oscillator, droning forever
   with no way to stop it. Fixed by stopping any existing voice for a
   pointerId before starting a new one
   ([`6e3e321`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-bada/commit/6e3e32184434f5727d50185fa8457d64bf42a078)),
   confirmed with the same start/stop counter (4 starts against 2 stops
   before, 4 against 4 after).

## Before you ship

`pnpm check:evidence` verifies citations resolve and the reflection file is
present; it doesn't judge the moments themselves. `pnpm check` is 35/35
green as of this run.
