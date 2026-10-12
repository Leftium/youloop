import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import {
	createVideoMetadataResolver,
	resolveSocialMetadata
} from '../src/lib/server/video-metadata.ts';

const id = 'dt-SqNL4z3w';
const other = 'dQw4w9WgXcQ';
const payload = {
	title: 'Test video',
	author_name: 'Creator',
	thumbnail_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
};
const reply = (data = payload) => Response.json(data);
const url = (query = '', route = '/') => new URL(`https://preview.example${route}?${query}`);

test('fixed oEmbed endpoint, concurrent deduplication, cache reuse and expiry', async () => {
	let calls = 0;
	let time = 0;
	const resolve = createVideoMetadataResolver({
		now: () => time,
		successTtlMs: 100,
		fetcher: async (endpoint, options) => {
			calls++;
			assert.equal(endpoint.origin, 'https://www.youtube.com');
			assert.equal(endpoint.pathname, '/oembed');
			assert.equal(endpoint.searchParams.get('url'), `https://www.youtube.com/watch?v=${id}`);
			assert.equal(endpoint.searchParams.get('format'), 'json');
			assert.equal(options.redirect, 'error');
			assert.ok(options.signal instanceof AbortSignal);
			return reply();
		}
	});
	const results = await Promise.all([resolve(id), resolve(id), resolve(id)]);
	assert.equal(calls, 1);
	assert.deepEqual(results[0], results[1]);
	assert.equal((await resolve(id)).title, 'Test video');
	assert.equal(calls, 1);
	time = 101;
	await resolve(id);
	assert.equal(calls, 2);
});

test('both legacy routes preserve clip identity while ignoring UI flags and request host', async () => {
	let calls = 0;
	const resolve = createVideoMetadataResolver({
		fetcher: async () => {
			calls++;
			return reply();
		}
	});
	for (const route of ['/', '/s']) {
		const result = await resolveSocialMetadata(
			url(`fit=cover&v=${id}&a=031&b=038&orientation=portrait&tracking=x`, route),
			resolve
		);
		assert.equal(result.url, `https://youloop.leftium.com${route}?v=${id}&a=31&b=38`);
		assert.equal(result.title, 'Test video - YouLoop');
		assert.match(result.description, /Creator/);
		assert.equal(result.image, payload.thumbnail_url);
		assert.equal(result.type, 'video.other');
		const zero = await resolveSocialMetadata(url(`v=${id}&a=0&b=0`, route), resolve);
		assert.equal(zero.url, `https://youloop.leftium.com${route}?v=${id}`);
	}
	assert.equal(calls, 1);
});

test('missing, invalid, duplicate and injection IDs never fetch; unrelated routes never fetch', async () => {
	let calls = 0;
	const resolve = createVideoMetadataResolver({
		fetcher: async () => {
			calls++;
			return reply();
		}
	});
	for (const query of [
		'',
		'v=',
		'v=bad',
		'v=https://evil.example',
		'v=%22%3E%3Cscript%3Ealert(1)%3C/script%3E',
		`v=${id}&v=${id}`
	]) {
		const result = await resolveSocialMetadata(url(query), resolve);
		assert.equal(result.title, 'YouLoop');
		assert.equal(result.url, 'https://youloop.leftium.com/');
		assert.equal(result.image, 'https://youloop.leftium.com/icon-512.png');
	}
	await resolveSocialMetadata(url(`v=${id}`, '/about'), resolve);
	await resolveSocialMetadata(url('', `/${id}`), resolve);
	assert.equal(await resolve('bad'), null);
	assert.equal(calls, 0);
});

test('invalid clip values are omitted without suppressing valid video metadata', async () => {
	const resolve = createVideoMetadataResolver({ fetcher: async () => reply() });
	for (const bounds of ['a=bad&b=bad', 'a=-3&b=0', 'a=31&b=20', 'a=31&a=32&b=0']) {
		const result = await resolveSocialMetadata(url(`v=${id}&${bounds}`), resolve);
		assert.equal(result.title, 'Test video - YouLoop');
		assert.ok(!result.url.includes('bad'));
		assert.ok(!result.url.includes('b='));
	}
});

test('upstream failures and malformed metadata use negative cache and retry after expiry', async () => {
	for (const fetcher of [
		async () => new Response('', { status: 404 }),
		async () => {
			throw new Error('network');
		},
		async () => new Response('invalid json'),
		async () => reply(null),
		async () => reply({ title: '' })
	]) {
		let time = 0;
		let calls = 0;
		const resolve = createVideoMetadataResolver({
			now: () => time,
			failureTtlMs: 10,
			fetcher: async (...args) => {
				calls++;
				return fetcher(...args);
			}
		});
		const result = await resolveSocialMetadata(url(`v=${id}`), resolve);
		assert.equal(result.title, 'YouLoop');
		assert.equal(result.url, `https://youloop.leftium.com/?v=${id}`);
		assert.equal(await resolve(id), null);
		assert.equal(calls, 1);
		time = 11;
		await resolve(id);
		assert.equal(calls, 2);
	}
});

test('timeout covers metadata fetch and body consumption', async () => {
	for (const bodyOnly of [false, true]) {
		const resolve = createVideoMetadataResolver({
			timeoutMs: 20,
			fetcher: async (_url, { signal }) => {
				const wait = () =>
					new Promise((_resolve, reject) =>
						signal.addEventListener('abort', () => reject(signal.reason), { once: true })
					);
				return bodyOnly ? { ok: true, json: wait } : wait();
			}
		});
		// AbortSignal.timeout does not keep Node alive on its own.
		const keepAlive = setInterval(() => {}, 1000);
		try {
			assert.equal(await resolve(id), null);
		} finally {
			clearInterval(keepAlive);
		}
	}
});

test('cache capacity, concurrency and lookup budget bound work', async () => {
	let calls = 0;
	let release;
	const resolve = createVideoMetadataResolver({
		maxConcurrent: 1,
		fetcher: async () => {
			calls++;
			await new Promise((done) => {
				release = done;
			});
			return reply();
		}
	});
	const first = resolve(id);
	assert.equal(await resolve(other), null);
	release();
	await first;
	assert.equal(calls, 1);
	let time = 0;
	const limited = createVideoMetadataResolver({
		now: () => time,
		maxEntries: 1,
		maxLookupsPerMinute: 2,
		fetcher: async () => {
			calls++;
			return reply();
		}
	});
	await limited(id);
	await limited(other);
	assert.equal(await limited(id), null);
	assert.equal(calls, 3);
	time = 60_000;
	await limited(id);
	assert.equal(calls, 4);
});

test('untrusted thumbnails are rejected, optional descriptions and lengths are handled', async () => {
	for (const image of [
		'javascript:alert(1)',
		'http://i.ytimg.com/vi/' + id + '/x.jpg',
		'https://evil.example/a.jpg',
		'https://i.ytimg.com.evil.example/a.jpg',
		'https://user@i.ytimg.com/vi/' + id + '/x.jpg',
		'https://i.ytimg.com/vi/' + other + '/x.jpg'
	]) {
		const resolve = createVideoMetadataResolver({
			fetcher: async () =>
				reply({ ...payload, thumbnail_url: image, description: 'Video description' })
		});
		const result = await resolve(id);
		assert.equal(result.image, payload.thumbnail_url);
		assert.equal(result.description, 'Video description');
	}
	const resolve = createVideoMetadataResolver({
		fetcher: async () => reply({ title: 'x'.repeat(1000), description: 'y'.repeat(2000) })
	});
	assert.equal((await resolve(id)).title.length, 300);
	assert.equal((await resolve(id)).description.length, 1000);
});

test('Svelte renders escaped OG and Twitter tags in server head, with no upstream HTML', async () => {
	const attack = '"><script>alert(1)</script>&';
	const resolve = createVideoMetadataResolver({
		fetcher: async () =>
			reply({ ...payload, title: attack, description: attack, html: '<script>upstream()</script>' })
	});
	const metadata = await resolveSocialMetadata(url(`v=${id}`), resolve);
	const source = await readFile(new URL('../src/lib/SocialHead.svelte', import.meta.url), 'utf8');
	const compiled = compile(source, { generate: 'server' }).js.code.replace(
		/from (["'])(svelte[^"']+)\1/g,
		(_match, _quote, specifier) => `from ${JSON.stringify(import.meta.resolve(specifier))}`
	);
	const { default: Head } = await import(
		`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
	);
	const { head } = render(Head, { props: { metadata } });
	assert.match(head, /property="og:title"/);
	assert.match(head, /name="twitter:title"/);
	assert.match(head, /name="twitter:card" content="summary_large_image"/);
	assert.match(head, /&quot;>&lt;script>alert\(1\)&lt;\/script>&amp;/);
	assert.ok(!head.includes('<script>'));
	assert.ok(!head.includes('upstream()'));
	assert.equal((head.match(/<title>/g) ?? []).length, 1);
});
