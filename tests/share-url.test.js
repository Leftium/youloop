import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeShareUrl, parseShareUrl, serializeShareUrl } from '../src/lib/share-url.ts';

const videoId = 'Dxvrvfyicp0';
const path = `/${videoId}`;
const parse = (input) => {
	const result = parseShareUrl(input);
	assert.equal(result.ok, true, JSON.stringify(result));
	return result.value;
};
const invalid = (input, parameter) => {
	const result = parseShareUrl(input);
	assert.equal(result.ok, false, input);
	assert.ok(
		result.errors.some((error) => error.parameter === parameter),
		JSON.stringify(result)
	);
};

const examples = [
	[path, { videoId }],
	[`${path}?t=24-32`, { videoId, start: 24, end: 32 }],
	[`${path}?t=24-`, { videoId, start: 24 }],
	[`${path}?t=-32`, { videoId, end: 32 }],
	[`${path}?t=24.5-32.75`, { videoId, start: 24.5, end: 32.75 }],
	[`${path}?t=24-32&once`, { videoId, start: 24, end: 32, once: true }],
	[
		`${path}?t=24-32&once&mute&speed=1.5&vertical&fill`,
		{ videoId, start: 24, end: 32, once: true, mute: true, speed: 1.5, vertical: true, fill: true }
	],
	[`${path}?vertical=0&fill=0`, { videoId, vertical: false, fill: false }],
	[`${path}?mute=0`, { videoId, mute: false }]
];
for (const [url, state] of examples) {
	test(`contract example round trip: ${url}`, () => {
		assert.deepEqual(parse(url), state);
		assert.equal(serializeShareUrl(state), url);
	});
}

test('canonical omission, ordering, decimal normalization, and input aliases', () => {
	assert.equal(
		serializeShareUrl(
			parse(`${path}?fill=1&vertical=0&speed=1.50&mute=&once=1&t=024.50%3A032.750&tracking=x#edit`)
		),
		`${path}?t=24.5-32.75&once&mute&speed=1.5&vertical=0&fill`
	);
	for (const query of ['t=-', 't=:', 't=0-', 'once=0&speed=1', 't=00.000-&once=0&speed=01.00']) {
		assert.deepEqual(parse(`${path}?${query}`), { videoId });
		assert.equal(serializeShareUrl(parse(`${path}?${query}`)), path);
	}
	assert.equal(serializeShareUrl(parse(`${path}?t=0-32`)), `${path}?t=-32`);
	assert.deepEqual(parse(new URL(`https://example.com${path}`)), { videoId });
});

test('boolean grammar preserves meaningful false overrides', () => {
	for (const flag of ['once', 'mute', 'vertical', 'fill']) {
		for (const suffix of ['', '=', '=1', '=0']) {
			const enabled = suffix !== '=0';
			const state = parse(`${path}?${flag}${suffix}`);
			assert.deepEqual(
				state,
				flag === 'once' && !enabled ? { videoId } : { videoId, [flag]: enabled }
			);
			assert.equal(
				serializeShareUrl(state),
				flag === 'once' && !enabled ? path : `${path}?${flag}${enabled ? '' : '=0'}`
			);
		}
		for (const value of ['true', 'false', '2', '-1', '01', 'yes', ' '])
			invalid(`${path}?${flag}=${encodeURIComponent(value)}`, flag);
	}
});

test('legacy root/watch aliases and zero end sentinel', () => {
	for (const route of ['/', '/s']) {
		assert.equal(
			serializeShareUrl(
				parse(`${route}?v=${videoId}&a=24.5&b=32.75&orientation=portrait&fit=cover`)
			),
			`${path}?t=24.5-32.75&vertical&fill`
		);
		assert.deepEqual(parse(`${route}?v=${videoId}&a=0&b=0&orientation=landscape&fit=contain`), {
			videoId,
			vertical: false,
			fill: false
		});
		assert.deepEqual(parse(`${route}?v=${videoId}&a=24&b=0`), { videoId, start: 24 });
		assert.deepEqual(parse(`${route}?v=${videoId}&b=32`), { videoId, end: 32 });
	}
});

test('canonical fields win as a unit, including explicit false and empty range', () => {
	assert.deepEqual(
		parse(`${path}?v=bad&t=-32&a=24&b=25&vertical=0&orientation=portrait&fill=0&fit=cover`),
		{ videoId, end: 32, vertical: false, fill: false }
	);
	assert.deepEqual(parse(`${path}?v=bad&t=-&a=bad&b=bad&vertical&orientation=bad&fill&fit=bad`), {
		videoId,
		vertical: true,
		fill: true
	});
	invalid(`/bad?v=${videoId}`, 'videoId');
	invalid(`${path}?t=bad&a=24&b=32`, 't');
	invalid(`${path}?vertical=bad&orientation=portrait`, 'vertical');
	invalid(`${path}?fill=bad&fit=cover`, 'fill');
});

test('all recognized duplicates fail, including identical and shadowed values', () => {
	for (const [key, value] of Object.entries({
		v: videoId,
		t: '24-32',
		a: '24',
		b: '32',
		once: '',
		mute: '0',
		speed: '1',
		vertical: '1',
		fill: '0',
		orientation: 'portrait',
		fit: 'cover'
	})) {
		const result = parseShareUrl(`${path}?${key}=${value}&${key}=${value}`);
		assert.deepEqual(result, { ok: false, errors: [{ parameter: key, code: 'duplicate' }] });
	}
	invalid(`${path}?mute=0&mute`, 'mute');
	invalid(`${path}?t=-&a=1&a=2`, 'a');
	assert.deepEqual(parse(`${path}?unknown=1&unknown=2`), { videoId });
});

test('malformed URLs, paths and video IDs fail without legacy fallback', () => {
	for (const input of ['https://[', 'not a URL', '?v=' + videoId, 'ftp://example.com/' + videoId])
		invalid(input, 'url');
	for (const input of [
		'/',
		'/s',
		'/about',
		'/short',
		'/abcdefghijkl',
		'/abcdefghij!',
		`${path}/`,
		`${path}/extra`,
		'/%ZZ',
		'/%2Fabcdefghij',
		'/?v='
	])
		invalid(input, 'videoId');
	assert.deepEqual(parse('/aB0_-123456'), { videoId: 'aB0_-123456' });
	assert.deepEqual(parse('/%44xvrvfyicp0'), { videoId });
});

test('malformed ranges and seconds never silently become full-video playback', () => {
	for (const range of [
		'',
		'24',
		'24to32',
		'1m-2m',
		'-1-32',
		'24--32',
		'1-2-3',
		'1:2:3',
		'NaN-32',
		'Infinity-',
		'1e2-200',
		'.5-2',
		'1.-2',
		' 1-2',
		'1-2 ',
		'0-0',
		'32-24',
		'-0',
		'24-24'
	]) {
		assert.equal(parseShareUrl(`${path}?t=${encodeURIComponent(range)}`).ok, false, range);
	}
	for (const key of ['a', 'b']) {
		for (const value of ['', '-1', 'NaN', 'Infinity', '1e2', '0x10', ' ', '1:30', '9'.repeat(400)])
			invalid(`${path}?${key}=${encodeURIComponent(value)}`, key);
	}
	assert.equal(parseShareUrl(`${path}?a=32&b=24`).ok, false);
	for (const [key, value] of [
		['orientation', 'auto'],
		['fit', 'fit']
	])
		invalid(`${path}?${key}=${value}`, key);
});

test('unrepresentable decimal seconds fail instead of overflowing or underflowing', () => {
	for (const endpoint of ['9'.repeat(400), '0.' + '0'.repeat(400) + '1']) {
		invalid(`${path}?t=${endpoint}-`, 't');
		invalid(`${path}?t=-${endpoint}`, 't');
		invalid(`${path}?a=${endpoint}`, 'a');
		invalid(`${path}?b=${endpoint}`, 'b');
	}
	assert.deepEqual(parse(`${path}?t=0.000-`), { videoId });
});

test('speed bounds match the current control range; decimals are supported', () => {
	for (const speed of ['0.25', '0.75', '1', '1.5', '2']) {
		assert.equal(parse(`${path}?speed=${speed}`).speed, speed === '1' ? undefined : Number(speed));
	}
	for (const speed of ['', '0', '-1', '0.24', '2.01', 'NaN', 'Infinity', '1e0', '0x1', ' 1'])
		invalid(`${path}?speed=${encodeURIComponent(speed)}`, 'speed');
});

test('normalization copies without mutation and serializers reject invalid typed state', () => {
	const state = Object.freeze({
		videoId,
		start: 0,
		once: false,
		speed: 1,
		mute: false,
		vertical: false,
		fill: false
	});
	assert.deepEqual(normalizeShareUrl(state), {
		ok: true,
		value: { videoId, mute: false, vertical: false, fill: false }
	});
	for (const override of [
		{ videoId: 'bad' },
		{ start: -1 },
		{ start: NaN },
		{ end: Infinity },
		{ end: 0 },
		{ start: 32, end: 24 },
		{ speed: 0 },
		{ speed: NaN },
		{ mute: 'false' },
		{ once: 1 },
		{ start: '24' }
	]) {
		const input = { videoId, ...override };
		assert.equal(normalizeShareUrl(input).ok, false);
		assert.throws(() => serializeShareUrl(input), RangeError);
	}
});

test('deterministic state matrix round trips and canonicalization is idempotent', () => {
	for (const start of [undefined, 0, 24.5, 1e-7, 1e21]) {
		for (const end of [undefined, 32.75, 1e22]) {
			if (end !== undefined && end <= (start ?? 0)) continue;
			for (const mute of [undefined, false, true]) {
				for (const vertical of [undefined, false, true]) {
					for (const fill of [undefined, false, true]) {
						for (const once of [undefined, false, true]) {
							for (const speed of [undefined, 0.25, 1, 1.5, 2]) {
								const state = { videoId, start, end, mute, vertical, fill, once, speed };
								const url = serializeShareUrl(state);
								assert.deepEqual(parse(url), normalizeShareUrl(state).value);
								assert.equal(serializeShareUrl(parse(url)), url);
							}
						}
					}
				}
			}
		}
	}
});

test('legacy 99999 sentinel is open-ended, whereas canonical endpoints stay literal', () => {
	for (const route of ['/', '/s', path]) {
		assert.deepEqual(parse(`${route}?v=${videoId}&a=24.5&b=99999`), { videoId, start: 24.5 });
	}
	assert.deepEqual(parse(`${path}?t=24-99999&b=0`), { videoId, start: 24, end: 99999 });
});

test('editor links preserve route intent and all canonical state', async () => {
	const { serializeEditorUrl } = await import('../src/lib/share-url.ts');
	for (const [, state] of examples) {
		const editor = serializeEditorUrl(state);
		assert.ok(editor.startsWith(`/?v=${videoId}`));
		assert.deepEqual(parse(editor), state);
	}
});
