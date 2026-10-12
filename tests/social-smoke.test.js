import assert from 'node:assert/strict';
import { test } from 'node:test';

const origin = process.env.HOSTING_URL;
assert.ok(origin, 'Set HOSTING_URL to a local server or public deployment');
const id = 'dt-SqNL4z3w';
const requireVideo = process.env.REQUIRE_VIDEO_METADATA === '1';

for (const route of ['/', '/s']) {
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
			assert.ok(
				head.includes(`content="https://youloop.leftium.com${route}?v=${id}&amp;a=31&amp;b=38"`)
			);
			assert.equal((head.match(/<title>/g) ?? []).length, 1);
			if (requireVideo) {
				assert.match(head, /property="og:title" content="[^"<>]+ - YouLoop"/);
				assert.match(head, /property="og:type" content="video.other"/);
				assert.ok(head.includes(`https://i.ytimg.com/vi/${id}/`));
			}
			assert.match(html, /media-canvas/);
		}
	});
	test(`invalid ID safely falls back: ${route}`, async () => {
		const response = await fetch(
			new URL(`${route}?v=%22%3E%3Cscript%3Eevil()%3C/script%3E`, origin)
		);
		assert.equal(response.status, 200);
		const html = await response.text();
		const head = html.slice(0, html.indexOf('</head>'));
		assert.match(head, /property="og:title" content="YouLoop"/);
		assert.ok(!head.includes('evil()'));
		assert.match(head, /property="og:image" content="https:\/\/youloop.leftium.com\/icon-512.png"/);
	});
}

test('full-video sentinel is omitted from server-rendered OG URLs', async () => {
	for (const route of ['/', '/s']) {
		const response = await fetch(new URL(`${route}?v=${id}&a=31&b=99999`, origin));
		assert.equal(response.status, 200);
		const head = (await response.text()).split('</head>')[0];
		assert.ok(
			head.includes(
				`property="og:url" content="https://youloop.leftium.com${route}?v=${id}&amp;a=31"`
			)
		);
	}
});
