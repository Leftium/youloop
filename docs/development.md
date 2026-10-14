# Development and verification

Use this guide to choose checks, understand their limits, run DevTools probes,
and maintain code-quality baselines. Test retention and routine gate admission
are governed by [AGENTS.md](../AGENTS.md).

[README](../README.md) | [Development](development.md) | [Player](player.md) | [Mobile Safari](mobile-safari.md) | [Deployment](deployment.md)

## Required verification

See [AGENTS.md](../AGENTS.md) for the test-lifecycle and retirement policy.

Run `pnpm check`, `pnpm lint`, `pnpm test:clip`, `pnpm test:share-url`,
`pnpm test:metadata`, `pnpm build` and `pnpm test:browser`. Hosting CI also
builds with `YOULOOP_RUNTIME_PROOF=1` and runs `test:hosting` and `test:social`
against the production-mode server with `HOSTING_URL` set to its origin.

Install browsers once with `pnpm exec playwright install chromium webkit`.
The default browser command runs a deliberately small, deterministic selection:
Chromium cases tagged `@routine` or `@youtube-mock`, and eight WebKit executions
selected by `@webkit-smoke` or `@youtube-mock`. WebKit samples responsive layout,
resize during playback, scroll containment, dialog focus/Escape and touch targets.
The routine server uses port 5174 and never reuses a running development server.
Chromium uses full headless Chromium with `--mute-audio`.

| Command                      | Selection                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm test:browser`          | Required routine suite, with external requests blocked in browser and server.                     |
| `pnpm test:browser:routine`  | Alias for the required routine suite.                                                             |
| `pnpm test:browser:mock`     | Four focused Video.js API/identity and watch Loop/Once proofs, also included in routine.          |
| `pnpm test:browser:advisory` | On-demand broader Chromium/WebKit coverage with live YouTube and metadata. Not a deployment gate. |

For a focused live probe, append Playwright arguments, for example
`pnpm test:browser:advisory --project=webkit --grep 'mirror preserves crop fixture'`.
To compare the four API proofs with the live provider, use
`YOULOOP_LIVE_PROOF=1 pnpm test:browser:advisory --grep @youtube-mock`.
The old extended/provider/UI commands have been replaced by this explicit advisory
command; use `--grep @provider-free` when useful.

Routine coverage retains clip bounds and Loop/Once, signed URL/share semantics,
reload/history, picker commits, modal focus, splitter input and playback/provider
identity during responsive reflow. The five picker presets assert their actual
selection and canonical URL contract without waiting for live duration.
Detailed cosmetic checks, provider orientation/crop detection, live seeking,
source replacement and native CDP swipe matrices are advisory. Their regressions
can reach production without failing the routine gate. Physical Safari toolbar,
momentum and fullscreen behavior still need manual checks.

The API fixture installs `window.YT.Player` before startup; the ordinary player,
`<youtube-video>` and Video.js adapter still own media events and polling. The
mock has a fixed-step clock and cued/post-playback durations of 60/60.25 seconds.
It proves application/adapter contracts, not decoded frames, actual iframe pixels,
buffering, real YouTube durations or provider compatibility. Neither test mock
is imported by production code. Pure logic belongs in the existing Node suites.

Each routine case attaches `youtube-api-metrics`. External requests must be
intercepted; locally fulfilled iframe requests are not live provider starts.
Set `YOULOOP_OFFLINE_METRICS` to a writable NDJSON path to record blocked
server-side URLs. The offline server exercises the application's metadata fallback.
See [browser profiling and accepted gaps](../tests/browser/PROFILE.md) for measured
before/after costs, the full duration rankings and pruning decisions.

With `pnpm dev` running, open the app and run
the browser regressions in its developer console. Wait for the YouTube iframe
and source orientation to settle before running the geometry regression:

```js
await (await import('/src/lib/player/youtube-orientation.browser-test.ts')).run();
await (await import('/src/lib/player/youtube-provider-focus.browser-test.ts')).run();
await (await import('/src/lib/player/media-geometry.browser-test.ts')).run();
```

Run the geometry regression on `/`, where the orientation and Fill controls are
available. To exercise the watch controls, open
`/s?v=dt-SqNL4z3w&a=0&b=15`, wait for the paused first frame, and run:

```js
await (await import('/src/lib/player/watch-controls.browser-test.ts')).run();
(await import('/src/lib/player/watch-timeline.browser-test.ts')).run();
await (await import('/src/lib/player/watch-viewport.browser-test.ts')).run();
await (await import('/src/lib/player/watch-source-geometry.browser-test.ts')).run();
```

For rendered timeline boundary checks, load a fresh `/s` URL with the desired
`a` and `b`, wait for the duration to settle, and run
`await (await import('/src/lib/player/watch-timeline.browser-test.ts')).runView()`.
Cover `a=31&b=38`, `a=50&b=99999`, `a=0&b=99999`, and a very short
`a=31&b=31.05` selection. The pure timeline regression covers the exact 25%
threshold and manual-choice reset independently of provider timing.

If the browser blocks scripted playback, tap the video to Play then Pause once before
running the watch regression.

Keep the browser page visible during these regressions: native scroll events,
ResizeObserver callbacks, animation frames, and transitions may be deferred in a
hidden preview. The watch regression uses real YouTube playback and synthetic
mouse/touch gestures. It temporarily disables the controls' fade transition so
assertions check visibility state rather than animation timing. Hidden automation
can use `{ notifyScroll: true, skipViewportSimulation: true }`; that explicitly
dispatches scroll notifications and omits the viewport-resize simulation. It
does not verify native touch scrolling or Safari chrome.

## Code quality audits

Use Node 24 and the pinned pnpm version in `package.json`. Install with
`pnpm install --frozen-lockfile` before running the audits:

`pnpm knip` first runs `svelte-kit sync` because its TypeScript config loader
needs the generated `$app/tsconfig`, including on a fresh checkout.

| Command            | Purpose                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `pnpm knip`        | Unused files, exports, types, and dependencies; succeeds when clean.                                             |
| `pnpm fallow`      | New dead-code, clone, and health findings after accepted baselines; succeeds when only accepted findings remain. |
| `pnpm code-qc`     | Run both audits even if one fails; return the highest local exit status.                                         |
| `pnpm knip:raw`    | Native Knip output, with the same framework setup and no baseline.                                               |
| `pnpm fallow:full` | Native detailed Fallow output with committed baselines and aggregate context.                                    |
| `pnpm fallow:raw`  | Native unfiltered Fallow summary; use standalone commands below for individual findings.                         |

Knip is the primary dead-code signal. Fallow is a secondary signal; independently
verify reachability before removing anything it flags. Both audits are permanently
advisory for merge and deployment. They supplement `pnpm check`, `pnpm lint`,
tests, and the build. They are not invoked by those commands, the required hosting
workflow, or Vercel. If CI reporting is added, keep it optional and nonrequired,
separate from the deployment job, and report failures visibly. A nonzero local
audit exit status does not make the audit a required check.

The pinned Fallow CLI's human reports return 1 for aggregate historical health
totals, even when baselines remove every known finding. `scripts/fallow.mjs`
uses its baseline-filtered JSON with `--fail-on-issues`, prints new findings and
unexpected workspace diagnostics, and preserves the CLI's exit status. Spawn
failures, unreadable reports, and incompatible versions fail visibly. The native
`fallow:full` and `fallow:raw` commands retain their original exit behavior.
Architecture boundaries and policy packs are not configured; their two known
workspace notices are omitted from the routine report.

The framework/tool plugins discover SvelteKit routes and hooks, SSR metadata,
Node tests, Playwright tests, and build configuration. Both configs explicitly
include `src/params.ts` (SvelteKit 3 parameter matchers) and the eight
`src/lib/player/*.browser-test.ts` modules loaded through computed Playwright URLs
or DevTools. Their fixture imports remain in the graph. No bridge is needed.
Fallow excludes generated `.svelte-kit` and `.vercel` output and exempts only the
`~icons` virtual package, its two installed Iconify collections, and the Nimble
stylesheet bundled by Sass. Revisit those dependency exceptions if the icon or
stylesheet imports change. Knip needs no dependency exceptions.

Fallow's default duplication exclusions omit `*.test.*` and `*.spec.*`; this
project disables those defaults so test cleanup can inspect the
whole suite. Duplication still excludes module wiring by default. Health keeps
the default thresholds and includes tests. CRAP risk estimates use static
coverage estimates, not measured test coverage, so they do not establish that
code is untested. Architecture boundaries and policy rule packs are not
configured; zero counts for those checks do not establish architectural health.

### Maintaining baselines

`fallow-baselines/dupes.json` matches clone content and occurrences, with location
keys retained by Fallow. `fallow-baselines/health.json` was saved in identity mode,
which matches file, function name, and finding category instead of only a file's
finding count. New identities or clone groups remain reportable. Functions with
the same name in one file, including anonymous functions, can share an identity;
identity matching also does not guarantee detection of worsening metrics on an
existing finding. Review full reports when assessing a refactor.

To see the inventory without baseline filtering:

```bash
pnpm exec fallow --summary
pnpm exec fallow health
pnpm exec fallow dupes
```

After reviewing an intentional baseline change, regenerate the relevant file:

```bash
pnpm exec fallow dupes --save-baseline fallow-baselines/dupes.json
pnpm exec fallow health --save-baseline fallow-baselines/health.json --baseline-mode identity
pnpm exec prettier --write fallow-baselines/*.json
pnpm code-qc
```

The standalone health command can exit 1 after successfully writing its baseline
because existing findings exceed thresholds. Review the saved diff and command
output rather than treating that exit status as a failed write. Do not reset
baselines just to hide new findings. Remove resolved entries after cleanup, and
review any growth with its rationale. Dead-code findings have no baseline.

## Historical audit findings: issue #32

These are the accepted findings and cleanup evidence recorded for issue #32,
not a fresh inventory of the repository. Check current reports before changing
baselines or assuming these counts still apply.

The first cleanup for [#32](https://github.com/Leftium/youloop/issues/32)
removes only the unused export exposure of `loadOriginalAspect` and
`ShareUrlError`. Their internally used implementations remain. There are no
accepted Knip findings or Knip suppressions.

Fallow explicitly seeds `src/lib/index.ts` because `package.json` declares it as
the bare `#lib` import entry. Current callers use `#lib/*`; retaining the empty
placeholder preserves the manifest contract without excluding it from analysis.
The duplication baseline retains 12 known clone groups. The health baseline
retains 52 above-threshold findings, including watch-control regressions, player
templates, URL parsing, and orientation logic. These broad refactors are deferred
to keep this pass small. Neither baseline was refreshed to absorb new findings.

The Edit-action matrix checks 320px, 375px, and 1280px widths with fullscreen
available and unavailable by resizing two settled providers. One 320px journey
covers playback pause, provider identity, opening a new tab, keyboard navigation,
and Back/Forward. Every matrix cell retains action order, link state, 44px hit
targets, bounds, focus outline, and Theater visibility checks, with named steps
for failure location. This replaces six complete journeys while leaving all
other playback, signed-range, framing, mobile scroll, and SSR regressions in
place. Broader advisory coverage runs with `pnpm test:browser:advisory`; Chromium does
not verify the [physical Safari checks](mobile-safari.md).
