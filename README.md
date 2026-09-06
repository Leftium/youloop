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
