# YouLoop

YouLoop is a browser-based YouTube segment repeater, published at
[youloop.leftium.com](https://youloop.leftium.com).

## Development

Install dependencies and start the Vite development server:

```bash
pnpm install
pnpm dev
```

Use `pnpm check` for Svelte and TypeScript validation. `pnpm build` creates the
Vercel server artifact in `.vercel/output/`. `pnpm build:static` creates an
optional prerendered fallback in `build/`; it is not automatically deployed.
Both builds use the same routes and player.

There is no `pnpm test` script. With `pnpm dev` running, open the app and run
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

## Watch view

`/s` starts in Default with Mute/Unmute, Theater, and a fullscreen button when
native container fullscreen is available. Tap or click bare video space to
Play/Pause in Default or Theater, including over YouTube's center indicator.
YouTube draws that feedback; YouLoop handles the tap through its existing
playback/recovery state machine. The iframe remains noninteractive and there is
no competing lower-left or duplicate center playback icon.

A transparent, named Play/Pause button gives keyboard and assistive users the
same action in both modes. Tab to the player and press Space or Enter; its focus
outline remains visible in Theater. Pointer taps use Video.js's tap recognizer,
with additional travel, cancellation, and wheel guards. Swipes and drags scroll
without toggling playback. Other controls perform only their own actions.

In Default, the actual provider title appears while paused when available. It
cannot select text or intercept taps. Our small controls stay visible while
paused.
Playback starts a short 180ms fade immediately; mouse hover/movement and
keyboard focus reveal the controls again. Video.js's two-second inactivity delay
then hides revealed controls during playback. Vertical scrolling is the main
way to show/hide the cluster by switching Default/Theater; surface taps request
playback rather than toggling control visibility.

`watch-controls.ts` reuses installed Video.js 10.0.1 playback/controls features,
the tap recognizer, and controls element. It attaches to the existing media
without replacing YouLoop's A/B state machine or remounting the iframe.

The persistent three-pixel Default timeline follows the intersection of the
media canvas and `visualViewport`. Viewport changes reposition only the chrome;
they do not resize the `100lvh` stage or the centered `16000px` iframe crop.
Downward document-scroll travel selects Theater; upward travel selects Default,
including after the empty runway grows. Returning from Theater explicitly reveals
faded controls, which may then fade again after inactivity. Theater hides our
title, controls, and timeline. Fullscreen is independent of those modes. Safari owns toolbar collapse;
the Theater button only advances the native document scroll.

The time button at the left of the control row switches between VIDEO and A:B
without seeking or changing playback or the share URL. The blue `A:B` label
follows the duration in clip mode; full-video mode has no visible mode label.
VIDEO shows absolute time and red full-video progress, with the blue selection at its true proportional
position. The elapsed part of A:B is purple where progress overlaps selection.
A:B shows elapsed clip time with purple progress over the blue clip track. Fixed
six-percent dashed tails indicate excluded video: red before A, gray after B.
The tails are inert. Full-video selections have no highlight, tails, or available toggle.

After the actual duration settles, a restricted clip shorter than 25% of the
video starts in A:B; other selections start in VIDEO. The automatic decision is
made once per source. Manual choice survives metadata/time and range updates
until another source loads; nothing is stored. Unknown or degenerate ranges
fall back to a finite VIDEO track.

### Physical iPhone viewport correction

Physical tests localized landscape picture clipping to the watch route introduced
in `af18e43` (PR #18). The original `/` player was unclipped at both `700561c`
and `af18e43`, while `/s` at `af18e43` clipped the left edge. On that same
watch page, removing only `viewport-fit=cover` eliminated the clipping; the owner
confirmed this with a landscape screenshot. Removing the iframe translation
had not fixed it. DOM canvas/frame centers could agree even while the visible
provider picture was clipped, so headless geometry tests alone missed this.

The shared layout now declares one `width=device-width, initial-scale=1`
viewport for both routes. It preserves the editor's viewport, native zoom,
`100lvh` watch stage, explicit canvas centering, 16000px iframe crop and existing
visible-viewport intersection. No touch cancellation or horizontal clipping is
added. The viewport regression guards this exact declaration. Temporary
isolation switches, geometry logging and historical-build middleware have been
removed; locally generated investigation artifacts remain ignored.

The latest normal-view iPhone tests did not reproduce horizontal panning,
including rotation, playback, timeline switching and Default/Theater travel.
Its original cause is not established, so describe this as a passing retest
rather than attributing a separate panning fix to the viewport change. Earlier
Android Firefox/Chrome tests also did not reproduce panning.

### Required physical verification

The owner also confirmed the restored current implementation with full controls
in landscape: picture/timeline aligned, no left clipping and no sideways
dragging. This verifies the tested landscape source and device configuration.
Before merging, extend the physical iPhone Safari check to: landscape and portrait
sources in both phone orientations, reload and source detection, browser chrome
expanded/collapsed, picture/timeline alignment, and independent horizontal swipe
attempts. Record the final tested SHA. The complete device matrix, accessibility
and available fullscreen still require verification; headless WebKit does not
replace those checks.

The source-geometry regression mounts the actual watch Player and orientation
controller, delays landscape-to-portrait detection until after first paint, and
checks both-axis centering, provider iframe bounds/identity, visible overlay and
3px timeline geometry, and document overflow. Run it at both phone viewport
orientations. It measures the iframe, not YouTube's cross-origin internal video
pixels; compare the visible picture separately on device.

For the blocking Safari recheck, use the new PR head and record the iOS/Safari
version, URL, orientation, browser toolbar state, and zoom scale. Swipe left and
right over the black background as well as the video, before/after rotating,
after vertical Default/Theater travel, and after reloading in each orientation.
At initial scale 1, the document must have no horizontal scroll range or lateral
movement. Check that title, controls and timeline overlay the same centered
canvas, rather than a shifted sliver. Repeat with expanded/collapsed toolbars.
Use both landscape-format and portrait-format source videos in both phone
orientations. Reload directly in landscape and record initial paint, pending
orientation detection, and settled geometry; repeat after rotation. Compare the
actual picture with the canvas and provider frame rather than assuming which
width is right. Keep the panning and alignment outcomes separate.
A deliberate pinch zoom is a separate case; do not disable it to obtain a pass.

Capture geometry in Safari's remote Web Inspector before and after each case:

```js
function watchGeometry() {
	const root = document.scrollingElement;
	const viewport = window.visualViewport;
	const media = document.querySelector('youtube-video');
	return {
		scrollX,
		scrollY,
		innerWidth,
		innerHeight,
		root: {
			scrollWidth: root.scrollWidth,
			clientWidth: root.clientWidth,
			scrollLeft: root.scrollLeft
		},
		viewport: {
			width: viewport.width,
			height: viewport.height,
			offsetTop: viewport.offsetTop,
			offsetLeft: viewport.offsetLeft,
			pageLeft: viewport.pageLeft,
			scale: viewport.scale
		},
		bounds: Object.fromEntries(
			[
				'.share-prototype',
				'.stage',
				'.player',
				'.media-canvas',
				'.watch-overlay',
				'.watch-timeline',
				'youtube-video'
			].map((s) => [s, document.querySelector(s)?.getBoundingClientRect().toJSON()])
		),
		iframe: media.shadowRoot?.querySelector('iframe')?.getBoundingClientRect().toJSON()
	};
}
console.log(JSON.stringify(watchGeometry()));
```

On the Vite preview, the same measurements are available from
`(await import('/src/lib/player/watch-viewport.browser-test.ts')).snapshot()`.
The checked regression attempts horizontal document scrolling and verifies
visible-canvas intersection, media identity, native vertical scrolling and zero
horizontal overflow. Run it again after viewport rotation and reload. Injected
visual-viewport offsets and desktop device presets do not reproduce Safari's
physical browser chrome or establish the device fix.

Before merging, verify on a physical iPhone with Safari:

- Compare tapping Theater with a manual downward swipe from expanded browser
  chrome. Record whether each collapses the toolbar; they may differ.
- Check the timeline above expanded and collapsed chrome, in portrait and
  landscape, during playback and rotation. Watch for reframing, jitter, or black
  flashes, and check that up-scrolling returns to Default after runway growth.
- Check background taps before and after auto-hide, paused and playing;
  each tap must toggle playback in Default and Theater, including over the
  center indicator. Swipes, drags, wheel activity, and mute must not toggle
  playback. Check keyboard/assistive activation in Theater and title selection. Verify usable hit targets and
  safe-area placement on short landscape screens.
- Switch the time display by touch and keyboard. Check both progress scales,
  time labels, tails, and narrow-screen layout; switching must preserve playback
  and the video frame. After controls fade in Theater, scroll up and confirm
  they visibly reappear without a mouse movement.
- Exercise native fullscreen where the browser offers it, then exit and confirm
  the prior logical mode and uninterrupted playback state.

Also check desktop fullscreen/hover/keyboard navigation and a physical Android
browser when available. Chromium viewport presets and injected touch events do
not establish physical-device behavior.

## Deployment

Production runs on the [Git-connected `team-leftium/youloop` Vercel project](https://vercel.com/team-leftium/youloop)
at [youloop.leftium.com](https://youloop.leftium.com). Pushes to `main` trigger
Vercel builds using `vercel.json` and the SvelteKit 3 Vercel adapter. The owner
moved the custom-domain DNS from GitHub Pages to Vercel on 2026-10-12,
before [PR #25](https://github.com/Leftium/youloop/pull/25) merged. All routes serve
from the domain root; no SvelteKit base path is configured.

The former GitHub Pages publish workflow has been retired. The GitHub Pages
site/custom-domain configuration may still exist in repository settings;
deleting the workflow does not disable that site or change its settings.
`pnpm build:static` remains available as a rollback artifact and in hosting CI,
but it does not publish automatically.

### Provider decision

Vercel was selected for staging and then production, using the existing account
and first-party Kit 3 adapter. Cloudflare Workers was compared but not deployed.
The old migration [ce364f2](https://github.com/Leftium/youloop/commit/ce364f2a77a4375553736cd09bf06c41f3eb9681)
was reviewed for adapter/prerender history, without reverting its client URL
handling or subsequent Video.js and mobile viewport work.

| Concern       | Vercel                                                                                                                                                                        | Cloudflare Workers                                                                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Compatibility | `@sveltejs/adapter-vercel` 7 supports Kit 3; Node 24 functions built with Vite 8 verified here.                                                                               | First-party `adapter-cloudflare` 8 supports Kit 3. Workers use a different runtime; this project has not been built or tested there.                                           |
| Previews      | Git deploys for the original project; manual CLI previews for the Git-disconnected staging project.                                                                           | Wrangler deploys and version URLs; requires a Cloudflare account, Wrangler configuration, and Workers runtime verification.                                                    |
| Execution     | Regional Node functions, CDN static assets; cold requests can add startup/network latency.                                                                                    | Distributed isolates and static assets; CPU limits matter for SSR, and Node compatibility is not identical to Node.                                                            |
| Cost          | Hobby is free for personal non-commercial use, with hard usage caps; Pro adds paid usage. Monitor actual function CPU/memory, requests, transfer, build and protection usage. | Free: 100,000 dynamic requests/day and 10ms CPU/invocation. Paid starts at $5/month with 10M requests and 30M CPU-ms included; overages apply. Static asset requests are free. |
| Cache         | CDN assets and optional ISR; no ISR or HTML cache policy added here. Staging proof responses are private/no-store.                                                            | Cache API/CDN policies need explicit design for dynamic responses and query keys.                                                                                              |
| Domain/TLS    | The custom domain now points to Vercel; confirm HTTPS/TLS and the assigned deployment in the Vercel dashboard.                                                                | `workers.dev` HTTPS for staging; Workers Custom Domains require an active Cloudflare zone.                                                                                     |
| Rollback      | Restore a known-good deployment in the original `youloop` project without a DNS change.                                                                                       | Wrangler version rollback; bindings/storage changes can prevent safe rollback.                                                                                                 |

Sources checked 2026-10-12: [Kit 3 migration](https://svelte.dev/docs/kit/migrating-to-sveltekit-3),
[Vercel adapter](https://svelte.dev/docs/kit/adapter-vercel),
[Cloudflare adapter](https://svelte.dev/docs/kit/adapter-cloudflare),
[Vercel Hobby](https://vercel.com/docs/plans/hobby),
[Vercel pricing](https://vercel.com/docs/pricing),
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[Workers version URLs](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/),
and [Workers rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).
Provider quotas and prices can change; confirm the account's actual plan.

### Vercel staging

Use the separate `team-leftium/youloop-staging` project. Do not link this checkout
to the existing `youloop` Vercel project or attach the production domain.
The staging project uses Node 24, the `sveltekit` framework, and the committed
install/build commands in `vercel.json`. No application secrets are required.
CLI authentication and project access are required; `.vercel/` and local OIDC
environment files are ignored and must stay out of Git.

```bash
vercel login
vercel link --yes --project youloop-staging --scope team-leftium
vercel deploy --yes --build-env DEPLOY_TARGET=vercel --build-env YOULOOP_RUNTIME_PROOF=1
```

Use the resulting immutable deployment URL for review. Do not pass `--prod`.
Vercel assigns a new project's first deployment to its production environment;
in this isolated project that affects only staging aliases. Later CLI uploads
are previews. `youloop-staging` is not Git-connected, so it is deployed only
through the CLI. The original `team-leftium/youloop` project was reconnected to
Git and unpaused after the initial staging deployment; this shared
`vercel.json` deliberately does not disable its automatic Git deployments.
Staging authentication protection was disabled only on `youloop-staging`,
allowing public HTTP and browser review.

`DEPLOY_TARGET` defaults to `vercel`; `static` selects the static adapter and
prerenders the existing routes for optional rollback. Unknown targets fail the
build. This is a build-time setting, not an environment switch on an already
built artifact.
The Vercel build renders the existing shell per request. Video source creation,
URL parsing, and playback remain in browser mount handlers; this does not
choose the eventual social metadata design or add new share paths.

For a future dual Vercel/Workers deployment, add a `cloudflare` adapter branch
to `vite.config.ts`, a separate Wrangler config and CI build, then repeat the
HTTP/browser suite in Workers. Keep shared hooks on Web APIs and put any
provider bindings behind server-only boundaries. Current shared code has no
Vercel SDK calls, ISR configuration, or route-level vendor settings. Workers
deployment is an extension point, not a verified target in this change.

### Runtime verification

`YOULOOP_RUNTIME_PROOF=1` opts into fresh UUID/time response headers and
`Cache-Control: private, no-store` on ordinary server routes. It is off by
default and ignored for static builds. There is no diagnostic endpoint. Omit
the flag and rebuild for a normal deployment; changing runtime env alone does
not remove a compiled-in proof flag.

```bash
YOULOOP_RUNTIME_PROOF=1 pnpm build
pnpm preview --host 127.0.0.1 --port 4173
# In another terminal:
HOSTING_URL=http://127.0.0.1:4173 pnpm test:hosting
HOSTING_URL=https://YOUR-DEPLOYMENT.vercel.app pnpm test:hosting
```

The smoke suite requests `/`, `/s?v=dt-SqNL4z3w&a=31&b=38`, and `/about`
twice, checks route-specific HTML and distinct server-generated headers, and
checks an SVG asset and a missing-route 404. This distinguishes runtime SSR
from a static SPA fallback. `vite preview` runs the production-built Kit server
locally; hosted checks exercise the actual Vercel function. Browser reload and
YouTube interaction checks are separate from HTTP tests. The
[hosting CI workflow](.github/workflows/hosting.yml) checks both builds, types,
lint, URL codec, production-mode HTTP, and the static fallback HTML/assets.
It does not publish to GitHub Pages or change Vercel domain settings.

### Production operation and rollback

The owner switched the custom domain to the original Vercel `youloop` project
on 2026-10-12. Vercel reported successful deployment of merged PR #25 at
[`e937e7e`](https://github.com/Leftium/youloop/commit/e937e7e9a57a85523f09b3d651ae21e46481ef71).
Normal releases follow the connected `main` branch; the `youloop-staging`
project stays separate and Git-disconnected.

1. For a release, confirm the production deployment's SHA, branch, domain
   assignment, and HTTPS certificate in the Vercel dashboard. Check direct loads
   and reloads of `/`, `/s?v=dt-SqNL4z3w&a=31&b=38`, and `/about`, along
   with assets, playback, and mobile scrolling.
2. For an application regression, promote or redeploy a known-good version in
   the original `youloop` Vercel project, then recheck the domain and routes.
   This rollback normally needs no DNS change.
3. To restore GitHub Pages as an emergency fallback, build the static site with
   `pnpm build:static`, restore the retired publishing workflow from Git
   history, configure GitHub Pages and its custom domain in repository settings,
   and switch DNS to the verified Pages record. Verify HTTPS and direct links
   afterward. This is an explicit owner action, not an automatic rollback.
4. If GitHub Pages remains enabled in repository settings, disable the unused
   site and remove its old domain association separately when no longer needed.
   Removing the workflow alone does not modify Pages settings.

For staging-only rollback, reuse a previously verified Vercel staging deployment
URL. Do not promote a staging build into the original production project without
checking its build flags and intended Git SHA.

### Hosting verification recorded for PR #25

On 2026-10-12, `pnpm check`, `pnpm lint`, `pnpm test:share-url` (20 tests),
`pnpm build`, and `pnpm build:static` passed. The four HTTP smoke tests passed
against both the production-built local server and public Vercel staging.
The PR records the final immutable staging URL and remote SHA. All three pages
also loaded and reloaded in T3's Chromium preview.

Browser regressions passed 39 orientation checks, eight provider-focus checks,
and 35 pure timeline checks. Hosted `/s` bootstrapped the real YouTube iframe,
reported a 65-second duration, sought to 31 seconds, and responded to Play.
An explicit `orientation=portrait&fit=contain` URL survived navigation and
produced a centered portrait canvas. At 390px width, the watch document had no
horizontal overflow; the shared viewport declaration remained unchanged.

The T3 tab remained hidden even when asked to open visibly. A combined
animation-frame geometry run timed out, and the native-scroll viewport test
failed its Theater transition assertion at `scrollY=80`. These are unresolved
browser-verification limits, not passing regressions. The watch-controls run
with hidden-tab scroll notifications also failed `A=0 shows only excluded end
tail`; its full playback/gesture suite did not pass. Sustained playback,
loop completion, native scroll/chrome behavior, full Fit/Fill geometry,
fullscreen, and the physical iPhone Safari matrix still need visible/device
review. No player or mobile geometry code was changed. Cloudflare execution
and rollback were not tested during PR #25; after merge, the owner changed DNS
and Vercel reported a successful production deployment. The live domain and TLS
remain separate operational checks.

## Player migration

The player uses `@videojs/html` and `@videojs/youtube-video` 10.0.1 with explicit
`youtube-nocookie.com` sources and YouLoop's existing controls. The iframe width
follows the selected Fit/Fill framing, with YouTube controls disabled. A centered fixed-height
overscan (`height: 16000px`) clips the excess height equally at each edge through
`youtube-video::part(iframe)`. Keeping the iframe height fixed avoids changing
that oversized height whenever the visible player height changes.
Fullscreen targets the YouLoop container so its click and exit buttons remain
available. Frame stepping requests 1/30-second seeks; YouTube determines the
actual rendered frame.

### Uncropped chrome observations

Observed on 2026-10-06 in T3's Chromium 152 preview with `dt-SqNL4z3w` and
`jNQXAC9IVRw`:

| State                               | Visible YouTube chrome                                                                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial frame, immediate play/pause | Title, channel/avatar, central play/pause indicator, YouTube logo, link icon; dance video also showed "More videos" and captions. No transport bar.             |
| Settled pause and A/B boundary      | Title, branding, and central indicators faded; captions remained on the dance video.                                                                            |
| Playing after interaction           | Transient overlays appeared and faded. Pointer clicks reached YouLoop's overlay; the iframe receives no pointer events. Pure pointer movement was not isolated. |
| Genuine source end                  | An actual `ended` event occurred; YouLoop returned to A and paused with loop off. The end overlay was not observed independently of that reset.                 |
| Fullscreen                          | Manually verified by the maintainer before cropping. T3 automation could not enter fullscreen.                                                                  |

### Crop experiment

Manual testing found the uncropped chrome distracting, so app-owned cropping is
retained. Initial comparisons of `+80px`, `+120px`, `+160px`, and `+400px` found
that `+120px` hid title/channel, logo, link icon, and "More videos" at 390, 960,
and 1280px viewport widths. It still left captions partially clipped, as the
maintainer's screenshot showed, and YouLoop has no caption control.

Smaller fixed crops still exposed caption fragments in actual fullscreen.
Comparisons then covered 5x, 10x, and 20x iframe heights. The white-screen video
`QggJzZdIYPI` made the paused-state gradient easier to see: 20x reduced it
further, but the maintainer observed video artifacts in actual fullscreen.
Centered 10x was selected after those comparisons. Shifting the iframe upward
also moved the picture and exposed a black band at the bottom, so no offset is
retained. The original temporary comparison controls were removed.

The central play/pause indicator and some paused-state shading remain. The
shading also persists briefly after playback starts. Cropping hides the tested
bottom captions rather than changing their enabled state. Other caption
positions, viewer-selected font sizes, and video aspect ratios may behave
differently; this is not a guarantee that every YouTube overlay is hidden.

Fullscreen now uses the same centered `16000px` crop, with no separate override.
The maintainer manually verified fullscreen operation with the earlier 10x
crop; fixed-height fullscreen still needs a manual check. T3 automation could
not enter native fullscreen; geometry checks are separate from manual checks.
Pointer clicks still reach YouLoop; pure hover/movement was not isolated by
the available automation.

### Optional Fit / Fill framing

The Landscape/Portrait buttons still choose the **current display canvas**;
automatic source-orientation detection remains supported. The independent Fill
toggle controls how the actual video is framed inside that canvas:

- **Fit** contains the full video, adding unused black space if the aspects differ.
- **Fill** centers and crops the video to cover the canvas, possibly losing edges.

The default is automatic: when the selected orientation matches the detected
source orientation, Fit is selected; when it differs, Fill is selected. Each
manual Landscape/Portrait choice restores that automatic default. The user may
override it with the Fill button; `fit=cover` stores explicit Fill and
`fit=contain` stores explicit Fit. With no `fit` parameter, a shared URL uses
the automatic default. Clipboard source replacement clears the manual override.

The iframe width is derived from the **actual canvas width/height** and source
aspect ratio, rather than using a fixed zoom multiplier. Original-aspect YouTube
thumbnails (`oar2.jpg`) supply the ratio when available, falling back to the
detected portrait/landscape orientation (9:16 or 16:9). Cropping follows canvas
resizes without resetting playback. The centered iframe retains its fixed
`16000px` height, avoiding the proportional-overscan resize loop.

Users can experiment with removing black bars encoded _inside_ a video by
changing framing and, when the canvas itself becomes responsive, adjusting its
aspect ratio through the window/device layout. Today the player retains a
fixed outer 16:9 footprint and an inner 16:9 or 9:16 canvas; simple window
resizing changes their size but **not** their aspect ratio. The future
responsive player-surface redesign will make this interaction more useful.
Unusual source ratios or embedded black bars may still be impossible to
eliminate automatically; no manual zoom slider is offered.

### Fixed-height overscan

[Issue #13](https://github.com/Leftium/youloop/issues/13) tracks native resize
jitter with proportional overscan. The maintainer first observed the jitter
in YouLoop at 10x and chose to adopt `16000px`, the candidate tested in Vee Next,
without a separate YouLoop A/B experiment. Other crop options can be revisited
if problems appear. Native resize smoothness, fixed-height fullscreen, Chrome's
gray-line artifact, and Safari have not been verified with this YouLoop change.

### Verification status

`pnpm install --frozen-lockfile`, `pnpm check`, and `pnpm build` pass. Real YouTube
smoke checks covered first frame, play/pause, video click, A/B pause/repeat, seek
clamping, all three slider handlers, frame steps, mute, four speeds, query
initialization/update/reload, source changes, same-ID reload, and responsive
sizing at 390, 960, and 1280 pixels. Clipboard parsing used injected read results;
actual clipboard permission and pointer dragging still need manual checks.
Safari/WebKit remains unverified. Keep the migration PR in draft until the
remaining manual checks are complete. The crop changes only CSS; existing lint
failures are outside this change.
