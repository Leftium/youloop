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
at its normal width with YouTube controls disabled. A centered 10x vertical
overscan (`height: 1000%`) clips 4.5 player-heights at each edge through
`youtube-video::part(iframe)`.
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
Retain centered 10x as the preferred compromise. Shifting the iframe upward
also moved the picture and exposed a black band at the bottom, so no offset is
retained. Temporary comparison controls have been removed.

The central play/pause indicator and some paused-state shading remain. The
shading also persists briefly after playback starts. Cropping hides the tested
bottom captions rather than changing their enabled state. Other caption
positions, viewer-selected font sizes, and video aspect ratios may behave
differently; this is not a guarantee that every YouTube overlay is hidden.

Fullscreen uses the same centered 10x crop, with no separate override. The
maintainer manually verified fullscreen operation and selected 10x after the
fullscreen comparisons. T3 automation could not enter native fullscreen;
its geometry simulations are separate from the maintainer's manual checks.
Pointer clicks still reach YouLoop; pure hover/movement was not isolated by
the available automation.

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
