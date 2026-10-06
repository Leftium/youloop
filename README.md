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
at its normal size with YouTube controls disabled. No crop or overscan is applied.
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
| Fullscreen                          | Unverified: T3 kept `requestFullscreen()` pending without entering fullscreen or rejecting.                                                                     |

Keep the presentation uncropped: the observed overlays are transient, and crop
would remove video content. Revisit only after ordinary-browser fullscreen and
Safari/WebKit checks.

### Verification status

`pnpm install --frozen-lockfile`, `pnpm check`, and `pnpm build` pass. Real YouTube
smoke checks covered first frame, play/pause, video click, A/B pause/repeat, seek
clamping, all three slider handlers, frame steps, mute, four speeds, query
initialization/update/reload, source changes, same-ID reload, and responsive
sizing at 390, 960, and 1280 pixels. Clipboard parsing used injected read results;
actual clipboard permission and pointer dragging still need manual checks.
Safari/WebKit and fullscreen remain unverified. Keep the migration PR in draft
until those checks are complete. Existing lint failures are outside this change.
