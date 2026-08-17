# MEMORY

Durable self-knowledge, curated run by run; ephemeral state belongs in
`now.md`, not here.

## Environment quirks (this sandbox)

- `mise`-shimmed `pnpm`/`node` fail with "config.local.toml ... not trusted"
  until `mise trust /home/ben/.config/mise/config.local.toml` is run once per
  environment. That file holds Ben's real API tokens — read it only to
  confirm it's the expected, pre-existing secrets file before trusting it,
  never copy its contents anywhere, especially not into a course repo.
  `corepack pnpm <cmd>` works as a fallback before trust is established, but
  only for the initial `pnpm install` — `corepack pnpm check` (or any script
  that shells out to bare `pnpm` internally, as this template's `check` does)
  fails with a version-mismatch error, because corepack won't switch pnpm
  versions mid-script once it's already invoked one. Once `mise trust` has
  run, drop `corepack` entirely and call plain `pnpm` for everything else.
  Confirmed in `comp4020-crit2-bada` week 3.
- `agent-browser` needs `agent-browser install` once (downloads Chrome), and
  every `agent-browser open` needs `--args "--no-sandbox"` — Chromium's
  zygote sandbox doesn't work in this container and the browser otherwise
  fails to launch at all.
- `agent-browser screenshot <path> --full` — the flag is `--full` (or `-f`),
  NOT `--full-page`. The wrong flag gets silently treated as a second
  positional arg, and a stray file literally named `--full-page` lands in
  the cwd. Check `git status` for it before the first commit of a session.
- `agent-browser open <url> --viewport WxH` is not a real flag — `open --help`
  doesn't list it, and passing it doesn't error, it's just silently ignored,
  so two screenshots taken "at" 1920×1080 and 390×844 came back byte-identical
  (both at whatever the default viewport was) until I diffed the file sizes
  and noticed. The real command is `agent-browser set viewport <w> <h>`, kept
  for the rest of the browser session. Confirmed in `comp4020-crit1-bada`
  week 2: always sanity-check a "different viewport" screenshot pair actually
  differs (dimensions or at least file size) before trusting it as evidence a
  layout was checked at both marking viewports.
- Ordering matters for the above: call `set viewport` *after* the first
  `agent-browser open --args "--no-sandbox"`, not before. With no page open
  yet, `set viewport` tries to launch its own throwaway browser without the
  sandbox flag and dies on the same zygote error as an unflagged `open`.
  Confirmed in `comp4020-crit1-bada` week 2, ~46.5h-to-cutoff verification
  run: `open` first, then `set viewport`, then `screenshot`.
- Re-running the full `pnpm check` locally (not just CI) needs `CHROME_PATH`
  exported to the `agent-browser`-downloaded Chrome, or the Lighthouse spec
  errors outright (`chrome-launcher` can't auto-detect a system Chrome that
  doesn't exist in this sandbox) rather than being skipped:
  `export CHROME_PATH=$(find ~/.agent-browser/browsers -maxdepth 2 -iname
  'chrome*' -type d | head -1)/chrome`. CI doesn't need this — it has a real
  system Chrome. Confirmed in `comp4020-crit1-bada` week 2.
- `agent-browser`'s dark-mode/reduced-motion emulation is `set media dark`,
  not `media dark` — `--help` lists it under the `set` block (`media
  [dark|light] [reduced-motion]`) but a bare `agent-browser media dark`
  returns "Unknown command" without erroring loudly in a way that's easy to
  miss in a longer command chain. Same shape as the `set viewport` gotcha
  above: always confirm the subcommand needs the `set` prefix before trusting
  a one-off flag from the top-level help summary. Confirmed in
  `comp4020-ass1-bada` week 4.
- A real keyboard-only pass is checkable directly, not just inferable from
  markup: `agent-browser eval "document.activeElement.tagName + '#' +
  document.activeElement.id"` before/after repeated `agent-browser press Tab`
  reconstructs the actual tab order (and shows whether a `role="img"`/no-
  `tabindex` element is correctly skipped, vs. accidentally reachable or
  trapping focus); `agent-browser press ArrowRight` (or Left/Home/End) after
  focusing a specific element, then `eval` on the state it should have
  changed, confirms a native control's keyboard path actually drives the
  page rather than assuming "it's an `<input type=range>` so keyboard works
  for free." Used to confirm a pointer-drag affordance layered on top of an
  already-keyboard-accessible slider didn't need its own keyboard handling —
  a real check that turned up nothing to fix, which is a legitimate outcome,
  not a wasted one. Confirmed in `comp4020-ass1-bada` week 4.
- A hand-built `new PointerEvent(...)` dispatched via `agent-browser eval`
  with `document.dispatchEvent`/`window.dispatchEvent` does NOT route through
  a prior `element.setPointerCapture(pointerId)` call — the listener actually
  bound to that element never fires, so a synthetic "drag" silently does
  nothing while looking like it ran (no error, a plausible-looking readout
  left over from an earlier real event). This gave a false pass when
  re-testing a pointer-capture-based drag interaction mid-viewport-resize in
  `comp4020-ass1-bada` — the fix was to drive it with `agent-browser mouse
  move <x> <y>` / `mouse down` / `mouse up` instead, which are real synthetic
  input events the browser routes normally through pointer capture. Any test
  of a `setPointerCapture`-based drag must use `agent-browser mouse ...`, not
  a constructed-and-dispatched `PointerEvent`. Confirmed in
  `comp4020-ass1-bada` week 4, re-verifying against the production build
  (`vite preview`) rather than the dev server.
- `agent-browser mouse move/down/up` always dispatches with
  `event.pointerType === "mouse"`, even with `set device <touch-capable-name>`
  active first — device emulation changes viewport/UA/`hasTouch`, not what
  kind of pointer event the `mouse` commands generate. There is no CLI-level
  touch/swipe dispatch; the only touch-capable channel is a WebSocket
  `input_touch` message meant for the dashboard/MCP streaming surface, not a
  plain subcommand. So "does this actually work with a real touch drag" is
  not checkable from this CLI without building a client for that channel —
  confirmed by adding a temporary `pointerdown` listener recording
  `e.pointerType` before driving a `mouse` drag, at 390×844 against a
  production build, in `comp4020-ass1-bada` week 4. Don't spend time trying
  `set device` + `mouse` again expecting a touch-typed event.
- `gh` has no stored auth in this sandbox (`gh repo view`/`gh run list` both
  fail with "please run gh auth login", exit code 4) — so repo visibility and
  CI-run status aren't checkable that way here. `curl -s -o /dev/null -w
  "%{http_code}"` on the live Pages URL is the fallback for "has this repo
  shipped (gone public) and deployed yet" — a 404 there is expected and not a
  bug for as long as the repo is still private (doctrine: CI/Pages stays
  skipped pre-ship). Confirmed `comp4020-ass1-bada` week 4, 21h-to-cutoff run.
- `agent-browser screenshot --full` resizes the page to capture the full
  scrollable height, which fires a real `resize` event on `window` — if a
  `<canvas>`-based page has a resize handler that recomputes `canvas.width`/
  `canvas.height` from the element's layout box (the normal, correct way to
  keep a canvas crisp across viewport changes), setting those attributes
  clears the canvas's drawn content as a side effect of the HTML canvas spec,
  not a bug in the page. A `--full` screenshot taken right after drawing to a
  canvas can come back showing an empty canvas even though the draw call
  worked. Don't conclude "nothing rendered" from a `--full` screenshot of a
  canvas alone — cross-check with a plain `screenshot` (no `--full`, no
  resize) or with `ctx.getImageData(...)` on the specific pixel first. Found
  and confirmed this way in `comp4020-crit4-bada` week 5: `getImageData`
  showed the correct drawn colour at the exact drag coordinate while a
  `--full` screenshot taken moments later showed nothing, and a same-moment
  non-`--full` screenshot showed the dot correctly.
- A synthetic `PointerEvent` dispatched via `agent-browser eval` with a
  pointerId other than the real mouse's own makes
  `element.setPointerCapture(pointerId)` throw `NotFoundError: No active
  pointer with the given id is found` — Chromium's real mouse pointer is
  always pointerId `1` (so events built with `pointerId: 1` route through
  capture fine), but any other id (`2`, `3`, ...) isn't a real "active"
  pointer from the browser's perspective and throws. Use pointerId `1` when
  simulating the actual pointer via synthetic events. This also surfaces a
  production-code risk worth checking on any page that calls
  `setPointerCapture`: if it throws and runs *before* the code that actually
  starts the effect it's guarding (a sound, a drag, a draw), the whole
  handler aborts silently — wrap the capture call in try/catch so a capture
  failure degrades gracefully instead of eating the interaction. Found and
  fixed this way in `comp4020-crit4-bada` week 5 (`de810ef`): `setPointerCapture`
  ran before `startVoice` in the pointerdown handler, so a throw there would
  have hidden the hint text (already unconditional) while producing no sound
  at all — the exact silent-failure shape the crit's brief rules out.
- Reading a live `AudioParam.value` right after scheduling a
  `setTargetAtTime`/ramp doesn't confirm the automation is doing anything in
  this headless sandbox — `AudioContext.currentTime` never advances here
  without a real audio output device, so `.value` reads back as its initial
  value forever even when the scheduled automation is completely correct.
  Verify automation by tracing the *call* instead: monkey-patch
  `AudioParam.prototype.setTargetAtTime` (or whichever method) via an
  `--init-script`, same technique as patching `window.AudioContext` to count
  node creation, and read back the `target` argument each call was scheduled
  with. Confirmed in `comp4020-crit4-bada` week 5 (`de810ef`) verifying a
  speed-driven vibrato-depth parameter: `.gain.value` read `0` at every
  check, but the traced calls showed the correct target (~0.8 cents for a
  slow move, clamped to 40 cents for a fast one) — the feature worked, the
  read-back method was just the wrong probe.

## Repo-independent lessons

- stylelint-config-standard rejects BEM double-underscore class names
  (`selector-class-pattern` wants plain kebab-case) and flags a lower-
  specificity selector (e.g. bare `a`) that comes *after* a higher-specificity
  one targeting overlapping elements (`no-descending-specificity`) — write
  generic element rules before scoped/attribute-selector rules that touch the
  same elements, not after.
- Before trusting a commit message, run `git show --stat HEAD` (or check
  `git status --short` immediately before committing). A `git add` with a
  stale pathspec can silently stage far less than intended while the commit
  message you'd already drafted describes the full intended diff — the
  message and the diff can drift apart without any command erroring loudly.
  Caught this once in `comp4020-crit1-bada` week 1
  (`5fedd84` vs the corrective `bfd0d1c`); worth the extra `git show --stat`
  every time from now on, not just when something feels off.
- A visual layout that looks reasonable in the diff can still be wrong at the
  marking viewport — a 2-column CSS grid gallery had an ugly reflow gap next
  to a tall image that was only obvious from an actual `agent-browser`
  screenshot at 1920×1080, not from reading the CSS. Always screenshot at
  both marking viewports before calling a layout done, not just after
  finishing all the CSS.
- `agent-browser eval --stdin` accepts a multi-KB script via heredoc — piping
  a whole minified library (e.g. `axe-core/axe.min.js`) followed by an
  `(async () => { ...; return JSON.stringify(...); })()` IIFE is how to run a
  real accessibility audit in an actual browser from the CLI, when the
  library is too big for a plain `eval "<js>"` positional arg. `eval` awaits a
  returned promise automatically.
- axe-core's `color-contrast` rule can't resolve inside jsdom (no layout
  engine) — it reports `incomplete`, never pass/fail, especially behind any
  gradient/pattern background. An axe-in-jsdom test should assert zero
  *violations*, not zero `incomplete`; verify contrast separately, either a
  real-browser axe run (see the `agent-browser eval --stdin` trick above) or
  by hand via the WCAG relative-luminance formula. Also sanity-check any such
  harness against a deliberately broken fixture (missing `alt`, empty link)
  before trusting a clean result on the real site — confirmed useful in
  `comp4020-crit1-bada` week 1.
- A prior run's memory claiming work is "not yet pushed" can be stale — one
  run in `comp4020-crit1-bada` recorded that note, but the next run's
  `git fetch` + `git status` showed `origin/main` already matched `HEAD`
  exactly. `git status`'s "up to date" line only reflects the locally cached
  `refs/remotes/origin/*`, which doesn't update without a fetch — always
  `git fetch` before trusting any claim (including your own memory's) about
  what has or hasn't been pushed.
- Doctrine says a reflection is headed with the course source's *title*,
  never a week number, since week counts drift but the title doesn't — but
  `reflections/crit-1.md` sat headed "Week 1: the forgotten web" through
  several verification-only runs before one actually re-read the doctrine
  line against the file instead of just checking it existed and cited real
  commits. `pnpm check:evidence` only checks the filename and that citations
  resolve — it does not check the heading text, so this class of drift is
  invisible to the automated sensor and only catchable by re-reading the
  doctrine text against the file by hand. Fixed in `comp4020-crit1-bada`
  week 1 (`368d730`). Worth doing once per deliverable: re-read the doctrine's
  reflection rules against the actual reflection file, not just confirm the
  check passes — a repeated "screenshot + pnpm check" verification loop can
  run green for many cycles while missing a plain-text doctrine violation the
  tooling was never built to catch.
- Wiring a real Lighthouse check (`lighthouse` + `chrome-launcher` npm
  packages, serving `dist/` with vite's own `preview()` API): `chrome-launcher`
  auto-detects a system Chrome on Linux by running `which` for
  `google-chrome-stable`/`google-chrome`/`chromium-browser`/`chromium`, which
  GitHub's `ubuntu-latest` runner has preinstalled — no extra CI setup needed.
  This sandbox has no system Chrome, only `agent-browser`'s downloaded copy at
  `~/.agent-browser/browsers/chrome-*/chrome`; pass that as `chromePath` (or
  via `CHROME_PATH` env, which `chrome-launcher` also reads) for a local run,
  leave it unset for CI. Confirmed in `comp4020-crit1-bada` week 1: the first
  real run of the sensor failed on real SEO gaps (missing meta description,
  and — subtler — vite preview's SPA-style fallback answering a `/robots.txt`
  request with the `index.html` body, which Lighthouse then tried and failed
  to parse as robots syntax line by line). That before/after failure was
  itself the sanity-check that the sensor isn't a rubber stamp, cheaper than
  building a separate deliberately-broken fixture.
- A live re-render that does `element.innerHTML = "<template string>"` on a
  container silently deletes any static children that container held before
  — including a `<title>`/`<desc>` an `aria-labelledby` elsewhere points at.
  jsdom-based spec tests didn't catch this (they mount a bare fixture, not the
  real `index.html`), only a real-browser axe-core audit against the actual
  page did (`svg-img-alt` violation, "aria-labelledby references elements
  that do not exist"). Fixed in `comp4020-ass1-bada` week 4 (`9a95b1a`) by
  re-emitting the title/desc inside the template string on every render, and
  added a jsdom regression test asserting they survive a render — but the
  bug itself was only findable by running axe against the live DOM, not by
  reading the diff. Worth checking any `innerHTML =` on a long-lived element
  for referenced children before trusting a static a11y annotation on it.
- A repo can be provisioned late enough that the normal week-long clock never
  applies — `comp4020-crit2-bada` opened with ~30 minutes of wall clock left
  before the crit itself, not 168 hours. What held up under that compression:
  picking a real target fast (a couple of `WebFetch` passes, not a deep
  crawl), building the smallest honest version of the brief rather than an
  ambitious one, running the check suite exactly once at the end rather than
  iteratively, and writing PROCESS.md/reflection content that names the one
  real judgement call made (here: refusing to fabricate opening hours two
  real sub-pages 404'd on) rather than padding out several. Confirmed in
  `comp4020-crit2-bada` week 3.
- This `agent-browser` build has no bandwidth/latency throttle (`network
  --help` only lists `route --abort`/`--body`, `har`, and request listing —
  no `emulate`/`throttle`/CDP network-conditions command). The working proxy
  for "what does a slow connection see" is `agent-browser network route
  "**/main.ts" --abort"` (swap the pattern for whatever script the page
  defers on) then reload: whatever renders with the script permanently
  blocked *is* what a slow connection sees for however long the real request
  takes. Found a real bug this way in `comp4020-ass1-bada` week 4 (`c009c90`):
  `<output>` elements and an interactive row/chart were blank/garbled
  ("a -chunk context") until JS ran — fixed by giving the static HTML
  defaults that match what the render function computes for the inputs' own
  default attribute values, so first paint is already correct. A citation
  check the same run showed the flip side of the same discipline: don't stop
  at the paper's abstract when checking a specific claim against it — one
  clause ("worse as more documents were added") wasn't abstract-supported but
  was true in the paper's body, findable only with a further search past the
  abstract text.
- A green test suite can still be asserting the wrong contract: a spec test
  in `comp4020-ass1-bada` was literally named "is symmetric around the
  middle of the context" and passed reliably, but a web search on the cited
  paper's actual figures (Liu et al. 2023) showed the real effect is
  asymmetric — primacy (start) recall edges out recency (end) recall, not a
  clean symmetric U. The test had encoded an unverified simplifying
  assumption from the model's first draft as if it were a real invariant.
  Fixed in `comp4020-ass1-bada` week 4 (`cdd57e9`) by changing the model to
  match the source and replacing the test with one asserting the verified
  asymmetry — a case where the correction was rewriting a test, not just
  editing the implementation to keep passing it. Worth treating any test
  whose name asserts a property of the *domain* (symmetric, monotonic,
  linear, etc.), rather than a property of the code's own behaviour, as a
  claim to verify against the real source before trusting it as a fixed
  contract.
- A page's own copy can describe an affordance that was never actually built
  — same failure mode as the domain-property test above, but in prose instead
  of a test name. `comp4020-ass1-bada`'s lede said "Drag it around" from the
  very first commit; the only control was ever a range slider, never real
  dragging, and it survived several later "interaction review" passes because
  each one read the markup rather than trying to drag the thing. Only caught
  by actually loading the live page in `agent-browser` and attempting the
  literal action the copy promised. Fixed week 4 (`0dd2315`) by wiring real
  pointer drag onto the row so the copy became true instead of editing the
  copy down to match the weaker mechanic — worth treating any second-person
  imperative in a page's own copy ("drag", "click", "type") as a claim to
  physically test, not just proofread.
- Self-review of your own prose is weaker than it looks once you've read the
  file with full context loaded --- you already know why each line is there,
  which makes it hard to see it as a first-time reader would. Spawning a
  fresh subagent with *only* the passage in question plus the grading bar
  text (no other page context, no history of prior edits) got a genuinely
  different read in `comp4020-ass1-bada` week 4: it caught that a lede opened
  on a definition before earning the reader's attention, and that the
  sentence's one surprising clause was grammatically subordinate rather than
  the main point --- the same failure mode a previous run had already fixed
  elsewhere on the same page, invisible to self-review because self-review
  keeps re-confirming what it already decided was fine. Don't skip
  fact-checking the subagent's proposed rewrite before adopting it, though:
  its rewrite claimed a mid-context fact "may as well not have been supplied
  at all," and a web search on the actual cited paper (Liu et al. 2023)
  showed this undersold the real finding (GPT-3.5-turbo scores *below* its
  no-context baseline with the fact mid-context) rather than oversold it ---
  lucky this time, but the check was still necessary before treating a
  fluent-sounding claim as verified. Confirmed in `comp4020-ass1-bada` week 4
  (`6c144dc`).
- jsdom has no layout engine, so `getBoundingClientRect()` on any element
  always returns zeros — a test for pointer-drag-to-nearest-element math
  needs to stub `getBoundingClientRect` on each candidate element by hand
  (return a fixed rect per index) rather than relying on real layout; test
  the actual coordinate math as a separate pure function so most of the logic
  is verifiable without any DOM at all. Also, plain jsdom (via the `JSDOM`
  import, not the `jsdom` vitest environment) has no global `PointerEvent`
  constructor — construct via `doc.defaultView.PointerEvent` (falling back to
  `MouseEvent`) and set `pointerId` with `Object.defineProperty` if the
  fallback doesn't carry one. Confirmed in `comp4020-ass1-bada` week 4
  (`0dd2315`).
- A subagent's proposed prose rewrite can read as strictly better while
  silently dropping a live-bound element it wasn't told mattered. A blind
  fresh-eyes reviewer in `comp4020-ass1-bada` week 4 proposed a figcaption
  rewrite that improved the prose but deleted the `<output>` element bound to
  a length slider, which would have quietly killed a working live-update
  mechanic — caught by grepping `main.ts` for the element's id
  (`length-value-2`) before accepting the text, not by reading the HTML diff
  alone, since the surrounding markup still looked plausible on its own.
  Adapted the rewrite to keep the binding rather than taking it verbatim.
  Worth checking any subagent-proposed markup change for `id`/`for`
  attributes referenced elsewhere before adopting it, same discipline as
  fact-checking a subagent's prose claim against its source (`deb8dd4`).
- The blind-fresh-eyes-subagent technique (give it only the artefact plus the
  grading bar, no conversation history) generalises past prose to interaction
  *logic*: pointed at `comp4020-ass1-bada`'s explainer with the actual spec
  bullets, it found that stretching a context length left the fact's raw
  array index untouched, so a fact pinned at "the end" of a short context
  silently drifted toward "the middle" of a longer one — the opposite of what
  the page's own copy promised ("stretch the context without moving the fact
  at all"). Confirmed empirically in a real browser before trusting the
  report (`agent-browser eval` toggling the sliders and reading the output
  text), then fixed by rescaling position proportionally on length change.
  Fixing it surfaced a second, general HTML gotcha worth keeping outside any
  one project: an `<input type="range">` clamps an assigned `.value` to its
  *current* `.max` at assignment time, so code that widens the range and
  moves the value in the same handler must set `.max` first — setting value
  first silently clamps it back to the old range with no error. Confirmed in
  `comp4020-ass1-bada` week 4 (`2b174bc`).
- A drag/click surface's coordinate *math* being correct doesn't mean the
  surface is correct — the pointer-drag row in `comp4020-ass1-bada` had fixed-
  width flex children with no `flex-grow`, so the visible bordered box was
  mostly empty at low item counts (89% dead space at the minimum setting) and
  any click there silently snapped to the last item instead of responding
  proportionally. `indexOfNearestCenter` was never wrong; the DOM just didn't
  fill the container it looked like it should. Only found by comparing
  `getBoundingClientRect()` of the last child against the container at more
  than one item count (`agent-browser eval`), not by reading the CSS or
  screenshotting only the default state — the ratio only looks obviously
  broken away from the default. Fixed with `flex: 1 1 0` on the children
  (`3fc1f1d`). General check: for any container a user clicks/drags across
  proportionally, measure filled-extent vs. container-extent at more than one
  configuration before trusting the interaction.
- A further variant of the blind-fresh-eyes-subagent technique: point it at a
  brief's own cited exemplar quote, not just the grading-bar text, when the
  brief names a specific standard for what "good" looks like. Assignment 1's
  brief calls Ciechanowski's *Mechanical Watch* the genre's ceiling because
  "every part is manipulable and the explanation *is* the interaction" — given
  only `comp4020-ass1-bada`'s page text plus that quote, a blind subagent
  found the lede pre-stated the entire finding the interactive section was
  supposed to teach, so the interaction was purely confirmatory, never
  load-bearing. Fixed with a copy-only edit (moved the explicit claim past the
  interactive section, left the lede as a hook), no interaction/scope change
  (`8f12b20`, `comp4020-ass1-bada` week 4). Worth trying on any future
  deliverable whose brief names a specific ceiling exemplar with a stated
  reason it's the ceiling — that reason is a checkable claim about your own
  page, not just flavour text.
- When a spec caps `PROCESS.md` at three or four moments and separately asks
  for a reflection breakthrough, a strong late-arriving finding doesn't have
  to displace one of the capped moments — it can carry its full weight in the
  reflection instead, if the existing moments are each a distinct failure
  mode and the new one would either duplicate one (two "copy" moments here)
  or leave no clearly-weakest one to cut. `comp4020-ass1-bada`'s four
  PROCESS.md moments (a11y bug, slow-connection defaults, domain-property
  test, copy-vs-build mismatch) stayed untouched at the assignment-1
  finishing pass; the lede-catch (`8f12b20`) became the reflection's
  breakthrough instead, since it's also the one finding driven by checking
  the brief's own language rather than a testing technique — a genuine fit
  for "response to the brief" as well as "process." Confirmed
  `comp4020-ass1-bada` week 4 (`8e7c202`). Worth revisiting explicitly at the
  finishing pass with the full candidate set in view, not deciding early or
  by default.
