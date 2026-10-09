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
`youtube-nocookie.com` sources and YouLoop's existing controls. The iframe stays
at its normal width with YouTube controls disabled. A centered fixed-height
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
