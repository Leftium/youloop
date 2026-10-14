# Player and clip contracts

This guide describes editor/watch behavior, shared URLs, timeline modes, and
Fit/Fill framing. Earlier crop experiments and migration evidence are collected
in the historical section.

[README](../README.md) | [Development](development.md) | [Player](player.md) | [Mobile Safari](mobile-safari.md) | [Deployment](deployment.md)

## Editor workspace and mobile Safari

The editor keeps video, timeline, transport, and splitter in the preview while
controls scroll in their own pane. Layout and scrolling never replace the mounted
YouTube provider or reset playback/clip state. Video-first mode is unchanged.

On small touch viewports, video swipes use native document scrolling with 20px

See [Mobile Safari](mobile-safari.md) for scroll layout, device observations, and
verification procedures.

### Editor timeline

The editor's source-wide timeline separates navigation from A/B editing. Click
empty track space or drag the red playhead to seek without changing the selected
clip or its share URL. Seeking outside A:B pauses for inspection; Play returns
to A when the transport is outside the clip. Frame stepping also uses the full
source. Watch playback retains its own VIDEO/A:B scope and progress bar.

A/B handles use the generic range slider's swap policy. Crossing another handle
changes the moving handle's role while retaining its physical focus and pointer
capture. Arrow keys edit by a relative 0.1 seconds, preserving non-grid offsets;
Page keys move ten increments, and Home/End select source bounds. Collapsed
ranges remain editable, although they cannot be played or shared until B is after A.

`transportTime` is the logical playback position; `currentTime` is the displayed
or requested media position. Endpoint inspection saves the transport and playback
state, pauses, and requests the endpoint frame. Release, keyup, cancellation,
Escape, blur, and teardown restore the saved transport and state. A source
replacement clears the old preview before the new provider bootstraps. Pending
seeks protect requested time from stale provider observations for up to two seconds.
YouTube can display a delayed or approximate frame; inspection is not frame-exact.

The noninteractive translucent red line spans the preview and timeline against
the same source-wide axis. Resizing and changing layout or framing reposition
the chrome without adding a provider. The Clip range dialog remains available
for precise signed or absolute entry and explicit Set at playhead actions.

### Video gestures

In editor and watch modes, a horizontal drag on the video jumps to the time at the
cursor position, like the timeline. The left and right edges map to the full
source bounds in the editor or the selected VIDEO/A:B bounds in watch. Editor
dragging uses the timeline axis, including its inset margins, so the red playhead
lines up with the cursor. Direction locks after 8 CSS
pixels: horizontal travel scrubs; vertical travel retains native document scrolling.
The surface uses static `touch-action: pan-y pinch-zoom`, with pointer capture
only after horizontal intent. A stationary tap toggles playback once; controls
and keyboard playback retain separate activation.

Scrubbing pauses playback and updates `currentTime` while `transportTime` stays
at the saved position. Provider seeks are coalesced to one per animation frame.
Release commits the target and restores playback when the scope permits;
cancellation restores the saved position and playback. Source replacement drops
the old session and queued seek. Editor inspection outside A:B stays paused;
watch targets clamp to the selected scope. Neither gesture changes A/B or the
share URL. YouTube may render the requested frame late.

Physical iPhone Safari and Android verification remains manual: check native
vertical scrolling and toolbar collapse, diagonal locking, pinch, stationary
taps, cancellation, and provider latency in both modes.

## Clip links and navigation

`/` is the existing editor, including its demo player. Both `/?v=ID&a=A&b=B`
and `/?v=ID&t=A~B` open the editor. Legacy editor `t=A-B` input is also accepted.
`/<videoId>/A~B` is the canonical watch route; `/s?v=...` remains a supported
legacy watch route.

The editor's Open video action and Share URL link reflect the current clip state.
The watch view provides an icon-only Edit link within the existing
Mute/Theater/Fullscreen action group; it has no Share URL link. Edit preserves
the clip state. The editor's Share URL link targets canonical watch paths.
Local edits replace the current history entry through SvelteKit; view navigation
adds entries for Back/Forward. Loading bare `/` leaves its URL and generic
social metadata intact.

The shared URL codec rejects duplicate recognized parameters and malformed
selected values. Watch-route bounds must appear in the path; `t`, `a`, and `b`
queries are invalid on those routes. In the editor, `t` takes precedence over
legacy `a`/`b` values; `vertical` and `fill` override `orientation` and `fit`. Boolean flags accept bare, `=1`, and `=0`; explicit false mute/framing
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

`watch-controls.ts` reuses installed Video.js playback/controls features,
and controls element. The shared `video-gesture.ts` owns surface taps and scrubbing. It attaches to the existing media
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

## Player migration

The player uses `@videojs/html` and `@videojs/youtube-video` 10.1.0 with explicit
`youtube-nocookie.com` sources and YouLoop's existing controls. The iframe width
follows the selected Fit/Fill framing, with YouTube controls disabled. A centered fixed-height
overscan (`height: 16000px`) clips the excess height equally at each edge through
`youtube-video::part(iframe)`. Keeping the iframe height fixed avoids changing
that oversized height whenever the visible player height changes.
Fullscreen targets the YouLoop container so its click and exit buttons remain
available. Frame stepping requests 1/30-second seeks; YouTube determines the
actual rendered frame.

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

## Historical player experiments

The notes below record the migration and crop experiments begun on 2026-10-06.
They describe earlier candidates and verification limits, not a current test
report or standing merge requirement. The fixed-footprint snapshot and future
redesign note are retained as historical context.

Users can experiment with removing black bars encoded _inside_ a video by
changing framing and, when the canvas itself becomes responsive, adjusting its
aspect ratio through the window/device layout. Today the player retains a
fixed outer 16:9 footprint and an inner 16:9 or 9:16 canvas; simple window
resizing changes their size but **not** their aspect ratio. The future
responsive player-surface redesign will make this interaction more useful.
Unusual source ratios or embedded black bars may still be impossible to
eliminate automatically; no manual zoom slider is offered.

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

### Fixed-height overscan

[Issue #13](https://github.com/Leftium/youloop/issues/13) tracks native resize
jitter with proportional overscan. The maintainer first observed the jitter
in YouLoop at 10x and chose to adopt `16000px`, the candidate tested in Vee Next,
without a separate YouLoop A/B experiment. Other crop options can be revisited
if problems appear. Native resize smoothness, fixed-height fullscreen, Chrome's
gray-line artifact, and Safari have not been verified with this YouLoop change.

### Migration verification recorded at the time

`pnpm install --frozen-lockfile`, `pnpm check`, and `pnpm build` pass. Real YouTube
smoke checks covered first frame, play/pause, video click, A/B pause/repeat, seek
clamping, all three slider handlers, frame steps, mute, four speeds, query
initialization/update/reload, source changes, same-ID reload, and responsive
sizing at 390, 960, and 1280 pixels. Clipboard parsing used injected read results;
actual clipboard permission and pointer dragging still need manual checks.
At that stage, Safari/WebKit and remaining manual checks were unverified, and
the migration PR was to remain in draft. The crop changed only CSS; lint failures
were recorded as outside that change. These are historical limits, not the
status of this documentation PR.
