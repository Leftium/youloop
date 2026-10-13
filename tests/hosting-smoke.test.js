import assert from 'node:assert/strict';
import { test } from 'node:test';

const origin = process.env.HOSTING_URL;
assert.ok(origin, 'Set HOSTING_URL to a proof-enabled local server or staging deployment');

for (const path of [
	'/',
	'/?v=dt-SqNL4z3w&t=31-38',
	'/s?v=dt-SqNL4z3w&a=31&b=38',
	'/dt-SqNL4z3w',
	'/dt-SqNL4z3w/31~38',
	'/dt-SqNL4z3w/-30.5~-5.25'
]) {
	test(`direct request and reload: ${path}`, async () => {
		const ids = new Set();
		for (let attempt = 0; attempt < 2; attempt++) {
			const response = await fetch(new URL(path, origin), {
				headers: { 'cache-control': 'no-cache' },
				redirect: 'error',
				signal: AbortSignal.timeout(30000)
			});
			assert.equal(response.status, 200);
			assert.match(response.headers.get('content-type'), /text\/html/);
			assert.match(response.headers.get('cache-control'), /no-store/);
			const id = response.headers.get('x-youloop-request-id');
			assert.match(id ?? '', /^[0-9a-f-]{36}$/);
			assert.ok(Number.isFinite(Date.parse(response.headers.get('x-youloop-server-time'))));
			ids.add(id);
			const html = await response.text();
			assert.match(html, /width=device-width, initial-scale=1/);
			assert.match(html, path === '/' ? /Find your moment/ : /media-canvas/);
		}
		assert.equal(ids.size, 2, 'Each request must execute the server hook again');
	});
}

test('assets and missing routes do not become an SPA fallback', async () => {
	const asset = await fetch(new URL('/logo.svg', origin));
	assert.equal(asset.status, 200);
	assert.match(asset.headers.get('content-type'), /image\/svg\+xml/);
	const missing = await fetch(new URL('/__hosting_missing_route__', origin));
	assert.equal(missing.status, 404);
});
