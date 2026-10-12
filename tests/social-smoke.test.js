import assert from 'node:assert/strict';
import { test } from 'node:test';

const origin = process.env.HOSTING_URL;
assert.ok(origin, 'Set HOSTING_URL to a local server or public deployment');
const id = 'dt-SqNL4z3w';
const requireVideo = process.env.REQUIRE_VIDEO_METADATA === '1';

for (const route of ['/', '/s', `/${id}`]) {
	test(`crawler direct request and reload contain social head: ${route}`, async () => {
		for (let attempt = 0; attempt < 2; attempt++) {
			const response = await fetch(new URL(`${route}?v=${id}&a=31&b=38&fit=cover`, origin), {
				headers: { 'user-agent': 'facebookexternalhit/1.1', 'cache-control': 'no-cache' },
				signal: AbortSignal.timeout(30_000),
				redirect: 'error'
			});
			assert.equal(response.status, 200);
			const html = await response.text();
			const head = html.slice(0, html.indexOf('</head>'));
			for (const tag of [
				'og:title',
				'og:description',
				'og:image',
				'og:url',
				'og:type',
				'twitter:title',
				'twitter:description',
				'twitter:image',
				'twitter:card'
			]) {
				assert.ok(head.includes(`"${tag}"`), tag);
			}
			assert.ok(head.includes(`content="https://youloop.leftium.com/${id}?t=31-38"`));
			assert.equal((head.match(/<title>/g) ?? []).length, 1);
			if (requireVideo) {
				assert.match(head, /property="og:title" content="[^"<>]+ - YouLoop"/);
				assert.match(head, /property="og:type" content="video.other"/);
				assert.ok(head.includes(`https://i.ytimg.com/vi/${id}/`));
			}
			assert.match(html, /media-canvas/);
		}
	});
	if (route !== `/${id}`)
		test(`invalid ID safely falls back: ${route}`, async () => {
			const response = await fetch(
				new URL(`${route}?v=%22%3E%3Cscript%3Eevil()%3C/script%3E`, origin)
			);
			assert.equal(response.status, 200);
			const html = await response.text();
			const head = html.slice(0, html.indexOf('</head>'));
			assert.match(head, /property="og:title" content="YouLoop"/);
			assert.ok(!head.includes('evil()'));
			assert.match(
				head,
				/property="og:image" content="https:\/\/youloop.leftium.com\/icon-512.png"/
			);
		});
}

test('full-video sentinel is omitted from server-rendered OG URLs', async () => {
	for (const route of ['/', '/s', `/${id}`]) {
		const response = await fetch(new URL(`${route}?v=${id}&a=31&b=99999`, origin));
		assert.equal(response.status, 200);
		const head = (await response.text()).split('</head>')[0];
		assert.ok(head.includes(`property="og:url" content="https://youloop.leftium.com/${id}?t=31-"`));
	}
});

test('bare root is generic and new-style editor URLs keep video-specific SSR identity', async () => {
	const root = await fetch(new URL('/', origin));
	const generic = (await root.text()).split('</head>')[0];
	assert.match(generic, /property="og:title" content="YouLoop"/);
	assert.match(generic, /property="og:type" content="website"/);
	assert.match(generic, /property="og:url" content="https:\/\/youloop.leftium.com\/"/);
	for (const route of [`/?v=${id}`, `/${id}`]) {
		const response = await fetch(
			new URL(
				`${route}${route.includes('?') ? '&' : '?'}t=24.5-32.75&once&mute&vertical=0&fill=0`,
				origin
			)
		);
		assert.equal(response.status, 200);
		const html = await response.text();
		const head = html.split('</head>')[0];
		assert.match(
			head,
			new RegExp(`property="og:url" content="https://youloop.leftium.com/${id}\\?t=24.5-32.75"`)
		);
		if (requireVideo) assert.match(head, /property="og:type" content="video.other"/);
		assert.equal(/class="brand(?: |")/.test(html), route.startsWith('/?'));
	}
});

test('reserved paths and invalid video paths remain 404s', async () => {
	for (const path of ['/about', '/v1', '/bad', '/abcdefghijkl']) {
		assert.equal((await fetch(new URL(path, origin))).status, 404);
	}
});

test('unrelated root query keys keep generic SSR and the demo editor', async () => {
	for (const query of ['?utm_source=test', '?foo=1&foo=2']) {
		const response = await fetch(new URL('/' + query, origin));
		assert.equal(response.status, 200);
		const html = await response.text();
		const head = html.split('</head>')[0];
		assert.match(head, /property="og:title" content="YouLoop"/);
		assert.match(head, /property="og:url" content="https:\/\/youloop.leftium.com\/"/);
		assert.match(html, /media-canvas/);
		assert.ok(!html.includes('Invalid link'));
	}
	for (const query of ['?v=bad', '?utm_source=test&t=bad']) {
		const html = await (await fetch(new URL('/' + query, origin))).text();
		assert.match(html, /Invalid link/);
		assert.doesNotMatch(html, /class="media-canvas(?: |")/);
	}
});
