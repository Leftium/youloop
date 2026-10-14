# Deployment and social previews

Use this guide for Vercel previews, SSR metadata, runtime checks, and rollback.
Earlier provider comparisons and PR verification reports are collected in the
historical section.

[README](../README.md) | [Development](development.md) | [Player](player.md) | [Mobile Safari](mobile-safari.md) | [Deployment](deployment.md)

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
Canonical `/<videoId>/A~B` watch links are supported; see the
[player URL contract](player.md#clip-links-and-navigation).

YouTube's fixed HTTPS oEmbed endpoint supplies the title and fallback thumbnail
without an API key. The resolver optionally discovers YouTube's own social image
from a bounded crawler-style watch-page prefix and validates its JPEG dimensions. oEmbed normally has no video description, so the preview uses title
and creator attribution plus YouLoop's segment-repeat description. Upstream
embed HTML is ignored. IDs must contain exactly 11 ASCII letters, digits,
hyphens, or underscores; duplicate IDs and malformed values cause no lookup.
Thumbnail URLs must use a known YouTube image host and the requested video path.
Missing or unavailable metadata uses the YouLoop title and PNG icon.

`og:url` uses `https://youloop.leftium.com` and the shared URL codec's canonical
video path and clip bounds. Playback/framing flags and tracking parameters do not
change preview identity. Invalid input keeps safe generic metadata. Preview
deployments also emit the production origin.

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
[hosting CI workflow](../.github/workflows/hosting.yml) checks the server build,
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

## Historical deployment decisions and evidence

The following comparison and verification reports were recorded for PRs #25
and #27 on 2026-10-12. They describe those commits, deployments, commands, and
limits. They are not current verification results or standing merge requirements;
retired commands, removed routes, and temporary preview URLs may no longer work.
Provider prices and quotas are historical and require a fresh check before use.

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
