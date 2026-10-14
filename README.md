# YouLoop

YouLoop repeats a selected segment of a YouTube video in your browser.
Open [youloop.leftium.com](https://youloop.leftium.com), choose a video and its
A/B bounds, then use Copy Link to share the clip. Clips repeat by default;
`once` plays the selection once and pauses at B.

## Clip links

- [Watch a clip](https://youloop.leftium.com/dt-SqNL4z3w?t=31-38):
  `/<videoId>?t=A-B` opens the watch view.
- [Edit the same clip](https://youloop.leftium.com/?v=dt-SqNL4z3w&t=31-38):
  `/?v=ID&t=A-B` opens the editor. The watch view's Edit action preserves the clip.
- Legacy `/s?v=ID&a=A&b=B` watch links and `/?v=ID&a=A&b=B` editor links still work.

See [Player and clip contracts](docs/player.md) for URL validation, playback flags,
timeline modes, and Fit/Fill behavior.

## Development

Use Node 24 and the pnpm version pinned in `package.json`:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

### Required verification

Run `pnpm check`, `pnpm lint`, `pnpm test:clip`, `pnpm test:share-url`,
`pnpm test:metadata`, `pnpm build`, and `pnpm test:browser`.
Install browsers once with `pnpm exec playwright install chromium webkit`.
The routine browser suite blocks external requests; `pnpm test:browser:advisory`
provides broader, on-demand coverage with live YouTube. Knip and Fallow audits
are advisory.

See [AGENTS.md](AGENTS.md) for test lifetimes, routine gate admission, and retirement.
The [development guide](docs/development.md) covers command selection, offline
limitations, DevTools checks, audits, and baseline maintenance.

## Deployment

Pushes to `main` deploy to the Git-connected Vercel project; other branches and
pull requests receive Preview deployments. `pnpm build` produces the server
artifact in `.vercel/output/`. Hosting CI also builds with `YOULOOP_RUNTIME_PROOF=1`
and runs `test:hosting` and `test:social` against the production-mode server.

See [Deployment and social previews](docs/deployment.md) for preview validation,
metadata checks, production operation, and rollback.

## Guides

| Guide                                         | Contents                                                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| [Agent policy](AGENTS.md)                     | Test lifetimes, gate admission, retirement, and soft budgets.                 |
| [Development](docs/development.md)            | Required/advisory checks, browser probes, and code-quality audits.            |
| [Player](docs/player.md)                      | Editor/watch and URL contracts, timeline, framing, and crop history.          |
| [Mobile Safari](docs/mobile-safari.md)        | Scroll layout, device findings, limitations, and verification checklists.     |
| [Deployment](docs/deployment.md)              | Vercel, SSR/social metadata, runtime proof, rollback, and historical reports. |
| [Browser profiling](tests/browser/PROFILE.md) | Measured suite costs, pruning decisions, and accepted gaps.                   |
