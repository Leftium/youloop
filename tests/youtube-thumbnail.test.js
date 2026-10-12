import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveNativeThumbnail } from '../src/lib/server/youtube-thumbnail.ts';
import { createVideoMetadataResolver } from '../src/lib/server/video-metadata.ts';

const id = 'IF_7SLHdreQ';
const native = `https://i.ytimg.com/vi/${id}/hqdefault.jpg?sqp=colored-fill&rs=signature`;
const signal = () => AbortSignal.timeout(1000);
const page = (image = native) =>
	new Response(
		`<head><meta property="og:image" content="${image.replaceAll('&', '&amp;')}" /></head>`
	);
// Minimal JPEG header with APP0 followed by baseline/progressive SOF dimensions.
const jpeg = (width = 480, height = 360, marker = 0xc0) =>
	new Uint8Array([
		0xff,
		0xd8,
		0xff,
		0xe0,
		0,
		4,
		0,
		0,
		0xff,
		marker,
		0,
		11,
		8,
		height >> 8,
		height & 255,
		width >> 8,
		width & 255,
		1,
		1,
		0x11,
		0,
		0xff,
		0xd9
	]);
const image = (bytes = jpeg(), status = 200, type = 'image/jpeg') =>
	new Response(bytes, { status, headers: { 'content-type': type } });

test('native social image retains signed composition URL and validates real JPEG dimensions', async () => {
	for (const variant of ['hqdefault', 'maxresdefault', 'mqdefault', 'oar2']) {
		for (const marker of [0xc0, 0xc2]) {
			const expected = native.replace('hqdefault', variant);
			const calls = [];
			const deadline = signal();
			const result = await resolveNativeThumbnail(
				id,
				async (url, options) => {
					calls.push(String(url));
					assert.equal(options.signal, deadline);
					assert.equal(options.redirect, 'error');
					if (calls.length === 1)
						assert.equal(options.headers['user-agent'], 'facebookexternalhit/1.1');
					return calls.length === 1 ? page(expected) : image(jpeg(1280, 720, marker));
				},
				deadline
			);
			assert.equal(result, expected);
			assert.deepEqual(calls, [`https://www.youtube.com/watch?v=${id}`, expected]);
		}
	}
});

test('native image URLs cannot fetch arbitrary hosts, credentials, paths or another video', async () => {
	for (const candidate of [
		'https://evil.example/image.jpg',
		'https://i.ytimg.com.evil.example/image.jpg',
		`http://i.ytimg.com/vi/${id}/hqdefault.jpg`,
		`https://user@i.ytimg.com/vi/${id}/hqdefault.jpg`,
		`https://i.ytimg.com:444/vi/${id}/hqdefault.jpg`,
		'https://i.ytimg.com/vi/dt-SqNL4z3w/hqdefault.jpg',
		`https://i.ytimg.com/vi/${id}/unknown.jpg`,
		`https://i.ytimg.com/vi/${id}/../../image.jpg`,
		'javascript:alert(1)',
		native + '&x=' + 'a'.repeat(2048)
	]) {
		let calls = 0;
		assert.equal(
			await resolveNativeThumbnail(
				id,
				async () => {
					calls++;
					return page(candidate);
				},
				signal()
			),
			null
		);
		assert.equal(calls, 1, candidate);
	}
	let calls = 0;
	await resolveNativeThumbnail(
		'bad',
		async () => {
			calls++;
			return page();
		},
		signal()
	);
	assert.equal(calls, 0);
});

test('missing variants and HTTP 200 placeholders, invalid MIME and malformed JPEGs are rejected', async () => {
	for (const response of [
		image(jpeg(120, 90)),
		image(jpeg(120, 90), 404),
		image(jpeg(), 200, 'text/html'),
		image(new Uint8Array([0xff, 0xd8])),
		image(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1])),
		image(new Uint8Array(33000).fill(1))
	]) {
		let calls = 0;
		assert.equal(
			await resolveNativeThumbnail(id, async () => (++calls === 1 ? page() : response), signal()),
			null
		);
	}
});

test('metadata prefix/body reads are capped and unused response streams are cancelled', async () => {
	let cancelled = false;
	const chunks = [
		new TextEncoder().encode(
			`<head><meta content='${native.replaceAll('&', '&amp;')}' property='og:image'>`
		),
		new Uint8Array(100000)
	];
	const stream = new ReadableStream({
		pull(controller) {
			controller.enqueue(chunks.shift() ?? new Uint8Array(100000));
		},
		cancel() {
			cancelled = true;
		}
	});
	let calls = 0;
	assert.equal(
		await resolveNativeThumbnail(
			id,
			async () => (++calls === 1 ? new Response(stream) : image()),
			signal()
		),
		native
	);
	assert.equal(cancelled, true);
	cancelled = false;
	const huge = new ReadableStream({
		pull(controller) {
			controller.enqueue(new Uint8Array(10000).fill(32));
		},
		cancel() {
			cancelled = true;
		}
	});
	calls = 0;
	assert.equal(
		await resolveNativeThumbnail(
			id,
			async () => {
				calls++;
				return new Response(huge);
			},
			signal()
		),
		null
	);
	assert.equal(cancelled, true);
	assert.equal(calls, 1);
});

test('discovery and validation failures preserve successful oEmbed metadata, cache and deduplication', async () => {
	for (const failure of ['none', 'network', 'missing-tag', 'bad-image', 'placeholder', 'timeout']) {
		let calls = 0;
		const signals = new Set();
		const resolver = createVideoMetadataResolver({
			timeoutMs: 25,
			fetcher: async (url, options) => {
				calls++;
				signals.add(options.signal);
				if (String(url).includes('/oembed'))
					return Response.json({
						title: 'Video title',
						thumbnail_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
					});
				if (String(url).includes('/watch')) {
					if (failure === 'network') throw new Error('unavailable');
					if (failure === 'missing-tag') return new Response('<head>changed markup</head>');
					if (failure === 'timeout')
						return new Promise((_resolve, reject) =>
							options.signal.addEventListener('abort', () => reject(options.signal.reason), {
								once: true
							})
						);
					return page();
				}
				return failure === 'bad-image'
					? image(jpeg(), 404)
					: failure === 'placeholder'
						? image(jpeg(120, 90))
						: image();
			}
		});
		const keepAlive = setInterval(() => {}, 1000);
		try {
			const [a, b] = await Promise.all([resolver(id), resolver(id)]);
			assert.equal(a.title, 'Video title');
			assert.equal(
				a.image,
				failure === 'none' ? native : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
			);
			assert.deepEqual(a, b);
			const before = calls;
			await resolver(id);
			assert.equal(calls, before);
			assert.equal(signals.size, 1, 'one shared deadline covers all fetches');
			assert.ok(calls <= 3, 'at most oEmbed, watch head and image header per cache miss');
		} finally {
			clearInterval(keepAlive);
		}
	}
});
