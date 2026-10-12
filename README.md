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
Vercel server artifact in `.vercel/output/`. Query-based social previews require
a server; the static build and its CI check have been retired.

Run the automated real-YouTube browser suite with `pnpm test:browser` after
`pnpm exec playwright install chromium`. Chromium launches with `--mute-audio`,
so playback is silent even while tests verify unmuted state and `mute=0`.
The runner uses `channel: 'chromium'` for full Chromium's headless mode, avoiding
the separate headless-shell binary that produced macOS renderer crash reports.
Production playback defaults are unchanged. Console watch regressions mute the
media before playing and leave it muted afterward; their unmute assertions pause
the provider first unless browser output is already suppressed.

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

## Editor workspace and mobile Safari

The editor keeps video, timeline, transport, and splitter in the preview while
controls scroll in their own pane. Layout and scrolling never replace the mounted
YouTube provider or reset playback/clip state. Video-first mode is unchanged.

On small touch viewports, the top of settings offers **Video swipe scrolling
(experimental)** and **Snap document scrolling (experimental)**. Both start checked
on mobile at the owner's request. Unchecking Video swipe scrolling restores the
bounded editor; unchecking snapping keeps native document scrolling without snap
points. Reset split disables both for the current visit. Reload starts both checked
again. These switches never enter URLs or session layout preferences; desktop
uses the bounded workspace.

With video scrolling active, the complete grid is sticky over a native document
runway. Controls retain their own `overflow-y: auto` scroller, with
`overscroll-behavior-y: none` to suppress boundary chaining/bouncing where supported.
Only the document scrollbar indicator is hidden; the controls scrollbar remains.
The experimental grid uses `100lvh`, matching watch mode's stable large viewport,
to avoid shortening the panes during toolbar animation. This is a follow-up trial
for the owner's report that controls were clipped above the minimized address bar.
The owner found the expanded bars covering controls acceptable, but reported that
the landscape bottom gap remained even before collapse. The next trial scopes
`viewport-fit=cover` to the editor, allowing Safari to render to the screen edges
while retaining safe-area padding on controls. Physical Safari must verify the
gap and provider framing; `lvh` alone did not fix the gap. The bounded editor
still uses `100dvh`. In portrait, the experimental settings pane adds a scrollable
bottom reserve of `100lvh - 100svh` plus its normal safe-area padding, so the last
controls can be raised above expanded bars without changing the grid height.
Existing split ratios and provider identity remain unchanged.

The runway starts at 25 small viewports and freezes its height in pixels. Passive
scroll/resize listeners add 25 current viewports before fewer than nine remain.
Rotation never shrinks the runway. Snapping uses invisible 20px-spaced document
points with `scroll-snap-stop: always`; points extend with the runway. Controls
have no snap rules. There is no programmatic scrolling, synthetic gesture, global
touch interception, or momentum lock. Splitters own their resize gestures with
pointer capture and `touch-action: none`; splitter-triggered chrome collapse is
not implemented. The temporary scroll-offset overlay was removed after testing.

### Owner-reported physical Safari results

These observations came from the owner's iPhone Safari testing. The iOS version
and exact viewport were not recorded; timings and offsets are approximate.

| Comparison                                                        | Observed result                                                                                                                                             |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bounded editor                                                    | Chrome did not shrink.                                                                                                                                      |
| First native-page variant                                         | Video and controls shared a document scrollbar; chrome reacted in both directions. Rejected.                                                                |
| Sticky whole workspace with nested controls                       | Video scrolling could minimize chrome. Runway extension worked and landscape regions grew to fill newly freed height.                                       |
| Immediate controls drag after a video flick                       | First gesture could remain coupled to the document until finger release; the controls scrollbar did not appear.                                             |
| Wait for coasting to stop, or stop it with a separate tap/release | Controls scrolled independently. This supports a momentum/latching hypothesis without proving its mechanism.                                                |
| Fixed workspace instead of sticky                                 | Coupling persisted. Rejected.                                                                                                                               |
| Brief root overflow lock after video swipe                        | Coupling persisted with the trial on or off. Rejected and removed.                                                                                          |
| No snapping vs 160px snapping                                     | Document offset kept changing for about 3 seconds without snapping, versus about 1 second or less with snapping. Coupling followed the moving offset.       |
| 80px and 40px snapping                                            | Further improvement at 80px; 40px increments worked.                                                                                                        |
| 20px snapping                                                     | Worked; stronger swipes could cross multiple points. Selected for the final candidate.                                                                      |
| 10px snapping                                                     | Worked inconsistently; returned to 20px.                                                                                                                    |
| Slow video drag                                                   | Chrome animated toward collapse around 30-40px of travel and could settle partially collapsed around 30px. A strict velocity threshold was not established. |

Snapping mitigates coasting and the coupling window; it does not guarantee gesture
handoff or full toolbar collapse. Safari owns snap physics and toolbar visibility.
A small/slow gesture can leave bars partially collapsed, and reverse scrolling or
snapping backward may reveal them. Waiting for document momentum to stop or using
a separate tap/release remains the confirmed workaround. More snap points also
add DOM elements as the runway grows; 20px is a device-tested compromise, not a
universal optimum.

### Remaining physical iPhone Safari checks

Use a normal Safari tab, record phone/iOS version, address-bar position, orientation,
and starting toolbar state. Chromium verifies geometry and provider identity,
not actual Safari toolbar collapse, momentum handoff, or native resize animation.

1. Reload `/?v=dt-SqNL4z3w&t=5-50&mute`; confirm both switches start checked at
   the top of controls. Uncheck both for the bounded baseline, then re-enable them.
   The controls scrollbar should belong only to its pane.
2. Compare strong/weak and slow/fast video swipes, including similar travel at
   different speeds. Check partial/full collapse, reverse gestures, and the
   immediate/wait/separate-tap controls handoff. Compare snapping on/off.
3. Repeat both splitter directions in portrait and landscape, both layouts, with
   bars expanded and minimized. Keep preview, timeline, and all actions reachable;
   watch for viewport jitter and unwanted page movement.
4. Keep playing the muted clip while scrolling controls at both boundaries,
   extending the runway repeatedly, resizing, switching layouts, changing Fit/Fill,
   and rotating. Repeat while paused; swipes must not toggle playback or reload
   the provider. Inspect root `scrollY` and pane `scrollTop` remotely if needed.
5. Check bottom spacing, safe areas, Safari's address-bar keyboard opening/closing,
   external-keyboard focus, and all settings' reachability. Reset disables both
   switches for this visit; reload restores mobile defaults without changing URLs
   or session layout preferences. Compare editor/watch Back/Forward and the
   unchanged video-first `/dt-SqNL4z3w?t=5-50&mute`.

**Remaining device verification:** detailed safe-area/keyboard coverage, viewport
resize smoothness, and broader iOS versions remain manual. The owner confirmed the
observations above; a completely uncoupled first gesture is not claimed.

## Clip links and navigation

`/` is the existing editor, including its demo player. Both `/?v=ID&a=...&b=...`
and `/?v=ID&t=A-B` open that editor. `/<videoId>?t=A-B` opens the immersive watch
view; `/s?v=...` still works and remains a watch route during migration.
Open video and Copy Link in the editor use current clip state. The watch view
provides an icon-only Edit link within the existing Mute/Theater/Fullscreen
action group; it has no Copy Link control. Edit preserves current clip state. Copy Link emits canonical
video paths. Local edits replace the current history entry through SvelteKit;
view navigation adds entries for Back/Forward. Loading bare `/` leaves its URL
and generic social metadata intact.

The shared URL codec rejects duplicate recognized parameters and malformed
selected values. Path IDs and `t`, `vertical`, and `fill` win over their legacy
aliases. Boolean flags accept bare, `=1`, and `=0`; explicit false mute/framing
values survive copying. Legacy `b=0` and `b=99999` mean video end, while canonical
`t` endpoints are literal seconds. Open ends remain open after duration settles.
Out-of-duration bounds clamp to a nonempty range using the actual provider
duration. Invalid links show an error without starting a different video.

Default clips repeat; `once` pauses at B. `mute` and `speed` apply to real media
after the existing silent first-frame bootstrap. Browser autoplay policy and
YouTube's supported playback rates still govern playback. Fit/Fill and orientation
retain automatic detection unless overridden. SSR social cards use canonical
video paths and clip bounds, omit playback/framing flags, and fall back safely
when input or upstream metadata is invalid.

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

The watch route retains one `width=device-width, initial-scale=1` viewport.
The editor now trials `viewport-fit=cover` for its separate bottom-gap report. It preserves the editor's viewport, native zoom,
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
The static rollback build was retired when video-specific server metadata was
added. A prerendered page cannot resolve a video from request query parameters.

### Provider decision

Vercel was selected for staging and then production, using the existing account
and first-party Kit 3 adapter. Cloudflare Workers was compared but not deployed.
The old migration [ce364f2](https://github.com/Leftium/youloop/commit/ce364f2a77a4375553736cd09bf06c41f3eb9681)
was reviewed for adapter/prerender history, without reverting its client URL
handling or subsequent Video.js and mobile viewport work.

| Concern       | Vercel                                                                                                                                                                        | Cloudflare Workers                                                                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Compatibility | `@sveltejs/adapter-vercel` 7 supports Kit 3; Node 24 functions built with Vite 8 verified here.                                                                               | First-party `adapter-cloudflare` 8 supports Kit 3. Workers use a different runtime; this project has not been built or tested there.                                           |
| Previews      | Automatic Preview deployments for pull requests and non-`main` branches; production deploys from `main`.                                                                      | Wrangler deploys and version URLs; requires a Cloudflare account, Wrangler configuration, and Workers runtime verification.                                                    |
| Execution     | Regional Node functions, CDN static assets; cold requests can add startup/network latency.                                                                                    | Distributed isolates and static assets; CPU limits matter for SSR, and Node compatibility is not identical to Node.                                                            |
| Cost          | Hobby is free for personal non-commercial use, with hard usage caps; Pro adds paid usage. Monitor actual function CPU/memory, requests, transfer, build and protection usage. | Free: 100,000 dynamic requests/day and 10ms CPU/invocation. Paid starts at $5/month with 10M requests and 30M CPU-ms included; overages apply. Static asset requests are free. |
| Cache         | CDN assets and optional ISR; proof-enabled builds use private/no-store HTML responses. No HTML cache policy added.                                                            | Cache API/CDN policies need explicit design for dynamic responses and query keys.                                                                                              |
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

### Vercel previews

The Git-connected [`team-leftium/youloop`](https://vercel.com/team-leftium/youloop)
project deploys `main` to production. Pushes to other branches and pull requests
receive Preview deployments in the same project. Review the commit-specific
Preview URL in the GitHub PR or Vercel dashboard, and confirm its commit SHA and
environment before merging. `vercel.json` keeps automatic Git deployments enabled.

PR #25 used a temporary, Git-disconnected `team-leftium/youloop-staging`
project while the original project was paused. That separate project is no longer
needed and can be deleted manually from the Vercel dashboard. Deleting it also
removes its historical deployment URLs and project-specific configuration; it
does not remove the separately configured production `youloop` project.

The app uses Node 24, the `sveltekit` framework, and the committed install/build
commands in `vercel.json`. No application secrets are currently required. Local
`.vercel/` and OIDC environment files must remain untracked.

`DEPLOY_TARGET` accepts only `vercel` (the default). Other targets, including
`static`, fail the build. The Vercel build renders the player shell and social
metadata per request. Video source creation, player URL parsing, and playback
remain in browser mount handlers.

For a future dual Vercel/Workers deployment, add a `cloudflare` adapter branch
to `vite.config.ts`, a separate Wrangler config and CI build, then repeat the
HTTP/browser suite in Workers. Keep shared hooks on Web APIs and put any
provider bindings behind server-only boundaries. Current shared code has no
Vercel SDK calls, ISR configuration, or route-level vendor settings. Workers
deployment is an extension point, not a verified target in this change.

### Video-specific social previews

Direct requests and reloads of `/?v=VIDEO_ID&a=31&b=38` and
`/s?v=VIDEO_ID&a=31&b=38` render Open Graph and Twitter Card tags in the initial
HTML. A shared server layout calls `src/lib/server/video-metadata.ts` once and
passes plain data to `SocialHead.svelte`; Svelte escapes it during rendering.
The Video.js custom element and watch controls still load inside browser mount.
The future `/<videoId>?t=A-B` grammar remains tracked by issue #21.

YouTube's fixed HTTPS oEmbed endpoint supplies the title and fallback thumbnail
without an API key. The resolver optionally discovers YouTube's own social image
from a bounded crawler-style watch-page prefix and validates its JPEG dimensions. oEmbed normally has no video description, so the preview uses title
and creator attribution plus YouLoop's segment-repeat description. Upstream
embed HTML is ignored. IDs must contain exactly 11 ASCII letters, digits,
hyphens, or underscores; duplicate IDs and malformed values cause no lookup.
Thumbnail URLs must use a known YouTube image host and the requested video path.
Missing or unavailable metadata uses the YouLoop title and PNG icon.

`og:url` uses `https://youloop.leftium.com`, the requested legacy route, and
normalized `v`, `a`, and `b` parameters. Zero/default or invalid bounds, including the editor's `b=99999` full-video
sentinel, are omitted; unrelated UI flags and tracking parameters do not change preview
identity. `/` and `/s` retain their separate playable routes but share metadata
for the same video. Preview deployments also emit the production origin.

Each warm server instance keeps at most 1,000 cached videos: successful lookups
last one hour and failures one minute. Concurrent requests for the same video
share a pending lookup. One two-second deadline covers oEmbed, optional native
image discovery, and JPEG-header validation; redirects are disabled throughout.
There are at most three outbound requests per cache miss (180/minute per
instance at the lookup budget), rather than three separate timeout windows.
Native discovery parses at most 32 KiB of HTML and 32 KiB of JPEG headers and
cancels the remaining streams. At most eight lookups run at once and
60 new lookups start per minute per instance; excess requests render defaults
without queueing. Cold starts and multiple instances have independent caches
and budgets. These limits reduce upstream traffic but are not a distributed
rate limiter.

Normal SvelteKit SSR keeps the metadata in the usual route/head pipeline.
The player shell is small and media initialization already happens in the
browser, so a custom metadata-injection hook has no demonstrated cost benefit.
Vercel Fluid Compute meters active CPU, provisioned memory, and invocations
([pricing](https://vercel.com/docs/functions/usage-and-pricing)). Caching reduces
repeat upstream work; it does not eliminate function invocations or measure
savings. HTML CDN caching is deferred: query-dependent clip identity, default
responses during upstream failures, and SvelteKit data-navigation variants
need a deliberate cache policy before enabling it. Static assets keep their
normal hosting cache behavior.

Run `pnpm test:metadata` for deterministic cache, timeout, limits, URL safety,
fallback, and server-head escaping checks. With a built server running:

```bash
HOSTING_URL=http://127.0.0.1:4173 pnpm test:social
# Require successful live YouTube metadata rather than accepting safe defaults:
HOSTING_URL=https://YOUR-PUBLIC-PREVIEW.vercel.app REQUIRE_VIDEO_METADATA=1 pnpm test:social
```

The social smoke suite sends crawler-style HTTP requests without executing JS.
CI permits upstream fallback because YouTube availability is external; release
verification should also use `REQUIRE_VIDEO_METADATA=1` on the public preview.
Real social platforms cache unfurls independently; a successful HTTP check
does not prove that a platform has refreshed its preview.

### Social-preview verification recorded for PR #27

On 2026-10-12, `pnpm check`, `pnpm lint`, 20 URL tests, nine metadata tests,
and the Vercel build passed. Four hosting smoke tests and four social smoke
tests passed against the production-built local server, with live YouTube
metadata required for the social checks. GitHub hosting CI passed too.

The public [Vercel preview](https://youloop-82wwdiy08-team-leftium.vercel.app)
for implementation commit `1bdfe3cbca8b57f4bf6e1a8fe4d3a145c04eb85a` passed all
four social smoke tests with `REQUIRE_VIDEO_METADATA=1`. Both legacy routes
returned the requested video's title, description, thumbnail, and clip URL in
initial HTML on direct fetch and reload. About, SVG assets, and missing-route
404 behavior also passed on that deployment.

[OpenGraph.xyz's external validator](https://www.opengraph.xyz/url/https%3A%2F%2Fyouloop-82wwdiy08-team-leftium.vercel.app%2Fs%3Fv%3Ddt-SqNL4z3w%26a%3D31%26b%3D38)
retrieved the video title and creator description, loaded the YouTube thumbnail,
and recognized the Twitter large-image card. It flagged the sample's 73-character
title and 480x360 thumbnail as possible truncation/crop issues. These are display
recommendations; custom social artwork remains a follow-up. Actual Facebook,
X, LinkedIn, Discord, and messaging-app unfurls were not tested.

T3 Chromium loaded the public watch and editor routes. The watch player created
the real YouTube iframe, reported the 65-second duration, sought to 31 seconds,
and played after a gesture. At 390px width the watch document had no horizontal
overflow and retained its native scroll runway. Physical-device Safari and
platform cache refresh behavior remain unverified.

### Native YouTube thumbnail investigation for PR #27

The placeholder `/about` route and its navigation link were removed at the
owner's request during review. Existing smoke checks no longer request it;
no regression tests were added for its removal.

On 2026-10-12, direct YouTube watch-page fetches with Facebook crawler, Twitter
crawler, and desktop user agents exposed the same social image for each sample.
The native `og:image` and `twitter:image` agree. Downloaded JPEG pixels explain
the reported differences without requiring messaging-app-specific processing:

| Video         | Plain `hqdefault`                                  | Native social image                                                       | Other variants                                                                                                                                                                  |
| ------------- | -------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dt-SqNL4z3w` | 480x360 with black top/bottom strips               | Signed `maxresdefault`, 1280x720, no strips                               | `mqdefault` 320x180 and plain `maxresdefault` 1280x720 also lack strips; `sddefault` 640x480 has strips; `oar2` returns 404 and a 120x90 placeholder                            |
| `IF_7SLHdreQ` | 480x360 with dark enlarged side imagery            | Signed `hqdefault`, 480x360, with brown side fill already in the pixels   | `mqdefault` 320x180 keeps dark side imagery; `sddefault` 640x480 has black side bars; `maxresdefault`/`hq720` return 404 and a 120x90 placeholder; `oar2` is 1080x1920 portrait |
| `PVVA-_wvKks` | 480x360 with top/bottom padding in the source file | Plain `maxresdefault`, 1280x720, same native artwork at higher resolution | `mqdefault` 320x180 and `maxresdefault`/`hq720` 1280x720 are unpadded; `sddefault` 640x480 is padded; `oar2` returns 404 and a 120x90 placeholder                               |

For BFX, the top tenth of plain `hqdefault` is effectively black, while the
native image contains the room scene. For Grace & Nick, the native image's
left-side average RGB is approximately (112, 69, 52), versus (35, 25, 20) for
plain `hqdefault` and (0, 0, 0) for `sddefault`. The acceptable video's native
image and plain `maxresdefault` are byte-identical. These are image observations,
not proof of how any messaging app renders its cards.

Native-image discovery preserves YouTube's signed `sqp`/`rs` query exactly;
these parameters affect composition, not merely size. It requests only a
fixed YouTube watch URL and an allowlisted HTTPS, same-video JPEG variant.
It rejects redirects, missing variants, incorrect MIME, unparseable JPEG
headers, and dimensions below 320x180 (including 120x90 placeholders). The
oEmbed thumbnail remains the fallback if this optional step fails. No native URLs
are guessed, signed transforms synthesized, video-specific exceptions added,
or images generated by our server.

YouTube's HTML is not a supported metadata API contract and can change or be
blocked. That trade-off buys a close match to native portrait fill as well as
landscape framing; blindly preferring max resolution or medium resolution
does not solve both cases. Supported oEmbed still owns video metadata. The
selected image, including an oEmbed fallback after failed discovery, shares
the existing one-hour successful-metadata cache. A transient discovery failure
can therefore keep the old image until that entry expires. YouTube's own
[thumbnail documentation](https://developers.google.com/youtube/v3/docs/thumbnails)
also cautions that variants and resolutions vary and fitting may add bars.

For physical messaging-app verification, send fresh links from the latest public
PR preview for `/?v=ID` and `/s?v=ID` for each of these three IDs, next to
`https://youtu.be/ID`, in the same conversation. If the app caches cards, use
a fresh preview hostname or add an ignored `preview_check` query value and
confirm the app actually refetched it; `og:url` stays on the production origin.
Check that BFX has no source top/bottom strips, Grace & Nick retains the whole
portrait with brown side fill, and the chess image retains its composition and
readable text. Open each YouLoop link to confirm the player still works.
Record the app/version, device, screenshots, and whether a new unfurl occurred.
A reused cached card is inconclusive. Actual cards and physical Safari remain
unverified until this check is performed.

### Review follow-up verification for PR #27

Implementation commit `d8f664f1cedd7aab05cf6e11e7f2cef8b25d220b` passed types,
lint, 20 URL tests, 15 metadata/thumbnail tests, the server build, and GitHub CI.
The production-built local server passed three hosting and five social smoke
tests with live video metadata required. The
[public Vercel preview](https://youloop-keaw4g9ug-team-leftium.vercel.app) passed
all five social smoke tests, including direct loads/reloads and sentinel
normalization. Additional crawler requests to both legacy routes for all three
comparison videos returned exactly the native YouTube image URLs recorded
in the investigation above.

OpenGraph.xyz loaded BFX's signed 1280x720 image and Grace & Nick's signed
480x360 image, plus the chess video's native 1280x720 image, from this public
preview, and recognized their video titles,
descriptions, and Twitter cards. Its recommendations about card aspect ratios
and title length still apply; matching native pixels does not control an app's
card cropping. Actual messaging-app unfurls remain unverified.

Hosted Chromium playback passed for Grace & Nick (86-second duration, seek/play
at 10 seconds), and BFX in the editor (65-second duration, seek/play at 31 seconds).
The watch view had no horizontal overflow at 390px width. The editor preserved
portrait/contain settings and removed `b=99999` from its URL, matching the
server's OG normalization. Physical Safari behavior was not tested.

### Runtime verification

`YOULOOP_RUNTIME_PROOF=1` opts into fresh UUID/time response headers and
`Cache-Control: private, no-store` on ordinary server routes. It is off by
default. There is no diagnostic endpoint. Omit
the flag and rebuild for a normal deployment; changing runtime env alone does
not remove a compiled-in proof flag.

```bash
YOULOOP_RUNTIME_PROOF=1 pnpm build
pnpm preview --host 127.0.0.1 --port 4173
# In another terminal:
HOSTING_URL=http://127.0.0.1:4173 pnpm test:hosting
# Requires a Vercel deployment built with YOULOOP_RUNTIME_PROOF=1:
HOSTING_URL=https://YOUR-PROOF-ENABLED-DEPLOYMENT.vercel.app pnpm test:hosting
```

The smoke suite requests `/` and `/s?v=dt-SqNL4z3w&a=31&b=38` twice, checks route-specific HTML and distinct server-generated headers, and
checks an SVG asset and a missing-route 404. This distinguishes runtime SSR
from a static SPA fallback. `vite preview` runs the production-built Kit server
locally; hosted checks exercise the actual Vercel function. Browser reload and
YouTube interaction checks are separate from HTTP tests. The
[hosting CI workflow](.github/workflows/hosting.yml) checks the server build,
types, lint, URL codec, metadata resolver, and production-mode HTTP.
It does not publish to GitHub Pages or change Vercel domain settings.

### Production operation and rollback

The owner switched the custom domain to the original Vercel `youloop` project
on 2026-10-12. Vercel reported successful deployment of merged PR #25 at
[`e937e7e`](https://github.com/Leftium/youloop/commit/e937e7e9a57a85523f09b3d651ae21e46481ef71).
Normal releases follow the connected `main` branch. The same Vercel project
creates Preview deployments for pull requests and other branches.

1. For a release, confirm the production deployment's SHA, branch, domain
   assignment, and HTTPS certificate in the Vercel dashboard. Check direct loads
   and reloads of `/` and `/s?v=dt-SqNL4z3w&a=31&b=38`, along with assets,
   playback, and mobile scrolling.
2. For an application regression, promote or redeploy a known-good version in
   the original `youloop` Vercel project, then recheck the domain and routes.
   This rollback normally needs no DNS change.
3. An emergency GitHub Pages rollback requires checking out a pre-metadata
   version (for example, PR #26), restoring its static build and retired
   publishing workflow, and changing Pages settings and DNS. It loses
   video-specific server previews. Prefer a known-good Vercel deployment.
4. If GitHub Pages remains enabled in repository settings, disable the unused
   site and remove its old domain association separately when no longer needed.
   Removing the workflow alone does not modify Pages settings.

For preview comparisons, open a commit-specific Vercel Preview deployment. To
roll back production, restore a known-good deployment in the original `youloop`
project; do not promote an unverified Preview build.

### Hosting verification recorded for PR #25

On 2026-10-12, `pnpm check`, `pnpm lint`, `pnpm test:share-url` (20 tests),
`pnpm build`, and `pnpm build:static` passed. The four HTTP smoke tests passed
against both the production-built local server and public Vercel staging.
PR #25 records the historical manual staging URL and remote SHA. That URL will
stop working if the temporary project is deleted. All three pages were loaded
and reloaded in T3's Chromium preview.

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
override it with the Fill button; `fill` stores explicit Fill and `fill=0` stores
explicit Fit. Legacy `fit=cover` and `fit=contain` are accepted on input. With
no framing parameter, a shared URL uses the automatic default. Clipboard source replacement clears the manual override.

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
