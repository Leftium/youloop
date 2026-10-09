# YouLoop

YouLoop is a browser-based YouTube segment repeater, published at
[youloop.leftium.com](https://youloop.leftium.com).

## Development

Install dependencies and start the Vite development server:

```bash
pnpm install
pnpm dev
```

Use `pnpm check` for Svelte and TypeScript validation, and `pnpm build` to create
the static production artifact in `build/`.

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

### Physical iPhone bisection and overlay isolation

The owner confirms deployed `/s` at `af18e43` does not pan horizontally,
while the PR candidate `c3af539` still does. Keep the same video, phone
orientation, zoom, and toolbar state when comparing revisions. Classify panning
and picture/timeline alignment separately; automated geometry is not the device
oracle. The owner tested the same-server baseline `af18e43`, midpoint
`b9c2402`, and current `isolate=overlay`: none panned horizontally. All showed
a landscape video-centering concern, with the provider play icon apparently
off-center; a literal one-sided gap has not yet been confirmed. The normal current view still needs a
same-server good/bad result before those tests identify a bisection interval.
Do not label the width issue as introduced by this PR from those observations.

With dependencies installed, prepare the baseline and first midpoint:

```bash
node scripts/prepare-watch-bisect.mjs
pnpm dev --host 0.0.0.0
```

On the same dev-server hostname used by the iPhone, open:

- `/__bisect/af18e43/s?v=dt-SqNL4z3w&a=0&b=15` (deployed baseline).
- `/__bisect/b9c2402/s?v=dt-SqNL4z3w&a=0&b=15` (first midpoint).
- `/s?v=dt-SqNL4z3w&a=0&b=15` (current candidate).

First confirm the historical baseline is good and current is bad on this same
server. If `b9c2402` is bad, test `a75f98c`; if it is good, test `96bbc3d`.
Continue halving the remaining first-parent range until adjacent commits have
physical good/bad results. Record observations rather than inferring results
from commit titles. Build another selected revision with
`node scripts/prepare-watch-bisect.mjs <commit>`; its URL uses the first seven
SHA characters. The sequence is `af18e43`, `b92cf51`, `a75f98c`, `b9c2402`,
`ef7d41f`, `96bbc3d`, `467728f`, `c3af539`.

Snapshots are built from `git archive` without switching or modifying the
worktree. They reuse installed dependencies. Resolved package versions match across
this range; the PR adds the already-transitive Video.js core 10.0.1 as a direct
dependency. Only a URL base prefix and full-SHA meta tag are injected. Snapshot
prerendering ignores historical root-relative link errors so the URL prefix does
not require changing application markup. Check that the watch page hydrates and
plays before accepting a device result. `revision.json` and the
`youloop-bisect-head` meta identify the tested SHA. Ignored `.watch-bisect`
artifacts are served only by Vite dev middleware and are excluded from the
production build.

To isolate the current watch chrome, append one query parameter and reload:

- `&isolate=timeline`: remove only the timeline DOM.
- `&isolate=controls`: remove the title and inline control row, keep the timeline.
- `&isolate=overlay`: remove the whole overlay, retain the provider, tap playback,
  keyboard Play/Pause and native vertical scrolling. Video.js stays attached,
  allowing layout/chrome effects to be tested separately from interaction code.

These are opt-in diagnostics, not fixes. No clipping or touch cancellation is
introduced. Without `isolate`, watch behavior is unchanged; the editor ignores
it. Recheck black-background swipes, reload and rotation on each variant, and
report panning independently from alignment. Remove the parameter to restore
the normal watch view. Keep the PR Draft until the device bisection is complete.

### Required physical verification

The whole-page horizontal-panning issue reported on physical iPhone Safari is
**not yet confirmed resolved**. Desktop Chromium and mobile headless WebKit did
not reproduce it before the correction. The owner also reports no reproduction
on Android Firefox or Chrome at the prior head; compare them again with the
candidate changes. The watch route now uses a plain,
viewport-wide body instead of Nimble's editor grid, with no bleed utility or
body-child gutters. One route-aware viewport meta preserves `viewport-fit=cover`
for `/s` and the original editor's viewport settings. These are candidate
corrections; neither blocked gestures nor document clipping masks overflow.

The owner confirmed that `467728f` still fails alignment on physical iPhone
Safari: a portrait source shrinks from the left after loading with the phone
held landscape. Landscape-source timeline width/alignment also remains wrong;
horizontal panning at that exact head has not been established. The next
candidate explicitly anchors the watch canvas center with `left/top:50%` and
translation, removing reliance on absolute flex static positioning during
source detection. Its dimensions, provider crop, and editor positioning remain
unchanged. Delayed detection stayed centered even before this change in headless
WebKit, so this is a candidate stabilization, not a confirmed device diagnosis.

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

Pushes to `main` deploy the static artifact to GitHub Pages through
[the Pages workflow](.github/workflows/pages.yml). The GitHub repository must
use GitHub Actions as its Pages source and have `youloop.leftium.com` configured
as its custom domain. The production site is served from the domain root, so no
SvelteKit base path is configured.

Set up and verify GitHub Pages before routing `youloop.leftium.com` away from
Vercel. The application reads YouTube and repeat-range query parameters in the
browser so shared URLs such as `/?v=dt-SqNL4z3w&a=31&b=38` work from the static
deployment.

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
