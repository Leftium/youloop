import assert from 'node:assert/strict';
import test from 'node:test';
import {
	normalizeShareUrl,
	parseShareUrl,
	parsePlayerUrl,
	resolveClipRange,
	serializeEditorUrl,
	serializeShareUrl
} from '../src/lib/share-url.ts';

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
	if (parameter) assert.ok(result.errors.some((error) => error.parameter === parameter));
};

for (const [range, bounds] of [
	['', {}],
	['120', { start: 120 }],
	['-60', { start: -60 }],
	['120~240', { start: 120, end: 240 }],
	['~60', { end: 60 }],
	['-120~-30', { start: -120, end: -30 }],
	['120~-30', { start: 120, end: -30 }],
	['-30.5~-5.25', { start: -30.5, end: -5.25 }],
	['-60~0', { start: -60, end: 0 }]
]) {
	test(`watch/editor round trip: ${range || 'full video'}`, () => {
		const state = {
			videoId,
			...bounds,
			once: true,
			mute: true,
			speed: 2,
			vertical: false,
			fill: true
		};
		const url = `${path}${range ? '/' + range : ''}?once&mute&speed=2&vertical=0&fill`;
		assert.deepEqual(parse(url), state);
		assert.equal(serializeShareUrl(state), url);
		assert.deepEqual(parse(serializeEditorUrl(state)), state);
	});
}

test('canonical aliases, zero, numeric spelling and default omission', () => {
	for (const [alias, canonical] of [
		['120~', '120'],
		['0', ''],
		['0~60', '~60'],
		['00.000~060.00', '~60'],
		['-0', ''],
		['-0~60', '~60'],
		['-030.500~-005.250', '-30.5~-5.25']
	])
		assert.equal(
			serializeShareUrl(parse(`${path}/${alias}`)),
			`${path}${canonical ? '/' + canonical : ''}`
		);
	assert.equal(
		serializeShareUrl(parse(`${path}/024.50~032.750?fill=1&speed=1&once=0&tracking=x#edit`)),
		`${path}/24.5~32.75?fill`
	);
	assert.deepEqual(parse('/%44xvrvfyicp0'), { videoId });
	assert.deepEqual(parse(new URL(`https://example.com${path}`)), { videoId });
});

test('signed resolution uses each provider duration and never mutates intent', () => {
	const state = Object.freeze({ start: -120, end: -30 });
	for (const duration of [300, 600])
		assert.deepEqual(resolveClipRange(state, duration), {
			ok: true,
			start: duration - 120,
			end: duration - 30
		});
	assert.deepEqual(resolveClipRange({ start: 120, end: -30 }, 600), {
		ok: true,
		start: 120,
		end: 570
	});
	assert.deepEqual(resolveClipRange({ start: -30.5, end: -5.25 }, 600), {
		ok: true,
		start: 569.5,
		end: 594.75
	});
	assert.deepEqual(resolveClipRange({ start: -1000 }, 600), { ok: true, start: 0, end: 600 });
	assert.deepEqual(resolveClipRange({ start: 120, end: 1000 }, 600), {
		ok: true,
		start: 120,
		end: 600
	});
	assert.deepEqual(resolveClipRange({}, 600), { ok: true, start: 0, end: 600 });
	for (const bounds of [
		{ start: 590, end: -30 },
		{ start: 600 },
		{ start: 700 },
		{ end: -600 },
		{ start: -60, end: 0 },
		{ start: 60, end: 60 },
		{ start: NaN },
		{ end: Infinity }
	])
		assert.deepEqual(resolveClipRange(bounds, 600), { ok: false }, JSON.stringify(bounds));
	for (const duration of [0, -1, NaN, Infinity])
		assert.deepEqual(resolveClipRange({}, duration), { ok: false });
});

test('malformed watch paths and ranges fail without silently playing the full video', () => {
	for (const input of ['https://[', 'not a URL', '?v=' + videoId, 'ftp://example.com/' + videoId])
		invalid(input, 'url');
	for (const input of [
		'/',
		'/s',
		'/about',
		'/short',
		'/abcdefghijkl',
		'/abcdefghij!',
		'/%ZZ',
		'/%2Fabcdefghij',
		'/?v='
	])
		invalid(input, 'videoId');
	for (const range of [
		'',
		'~',
		'~~',
		'~0',
		'0~0',
		'32~24',
		'-30~-60',
		'24-32',
		'24:32',
		'1~2~3',
		'+1~2',
		'.5~2',
		'1.~2',
		'NaN',
		'Infinity',
		'1e2',
		'1/2',
		'%2F',
		' 1~2',
		'1~2%20',
		'9'.repeat(400),
		'0.' + '0'.repeat(400) + '1'
	])
		invalid(`${path}/${range}`);
	for (const query of ['t=120-240', 't=bad', 't=', 'a=120', 'b=240']) invalid(`${path}?${query}`);
});

test('editor positive legacy queries and signed ~ queries keep root intent', () => {
	for (const route of ['/', '/s']) {
		for (const query of ['a=24.5&b=32.75', 't=24.5-32.75', 't=24.5:32.75', 't=24.5~32.75'])
			assert.deepEqual(parse(`${route}?v=${videoId}&${query}`), {
				videoId,
				start: 24.5,
				end: 32.75
			});
		assert.deepEqual(parse(`${route}?v=${videoId}&t=-32`), { videoId, end: 32 });
		assert.deepEqual(parse(`${route}?v=${videoId}&t=-32~`), { videoId, start: -32 });
		assert.deepEqual(parse(`${route}?v=${videoId}&t=-120~-30&a=bad&b=bad`), {
			videoId,
			start: -120,
			end: -30
		});
		for (const end of [0, 99999])
			assert.deepEqual(parse(`${route}?v=${videoId}&a=24&b=${end}`), { videoId, start: 24 });
		assert.deepEqual(parse(`${route}?v=${videoId}&t=24~99999&b=0`), {
			videoId,
			start: 24,
			end: 99999
		});
		for (const range of ['bad', '-1-32', '24--32', '~', '0~0', '32~24'])
			invalid(`${route}?v=${videoId}&t=${range}`);
		for (const key of ['a', 'b'])
			for (const value of ['', '-1', 'NaN', 'Infinity', '1e2', '0x10', ' ', '1:30'])
				invalid(`${route}?v=${videoId}&${key}=${encodeURIComponent(value)}`, key);
	}
});

test('flags, alias precedence, ordering and speed limits', () => {
	assert.equal(
		serializeShareUrl(parse(`/?v=${videoId}&a=24&b=32&orientation=portrait&fit=cover`)),
		`${path}/24~32?vertical&fill`
	);
	assert.deepEqual(parse(`${path}?v=bad&vertical=0&orientation=portrait&fill=0&fit=cover`), {
		videoId,
		vertical: false,
		fill: false
	});
	for (const flag of ['once', 'mute', 'vertical', 'fill']) {
		for (const suffix of ['', '=', '=1', '=0']) {
			const enabled = suffix !== '=0';
			assert.deepEqual(
				parse(`${path}?${flag}${suffix}`),
				flag === 'once' && !enabled ? { videoId } : { videoId, [flag]: enabled }
			);
		}
		for (const value of ['true', 'false', '2', '-1', '01', 'yes', ' '])
			invalid(`${path}?${flag}=${encodeURIComponent(value)}`, flag);
	}
	for (const speed of ['0.25', '0.75', '1', '1.5', '2'])
		assert.equal(parse(`${path}?speed=${speed}`).speed, speed === '1' ? undefined : Number(speed));
	for (const speed of ['', '0', '-1', '0.24', '2.01', 'NaN', 'Infinity', '1e0', '0x1', ' 1'])
		invalid(`${path}?speed=${encodeURIComponent(speed)}`, 'speed');
	invalid(`${path}?vertical=bad&orientation=portrait`, 'vertical');
	invalid(`${path}?fill=bad&fit=cover`, 'fill');
});

test('all recognized duplicates fail, including identical or shadowed aliases', () => {
	for (const [key, value] of Object.entries({
		v: videoId,
		t: '24~32',
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
		assert.deepEqual(parseShareUrl(`${path}?${key}=${value}&${key}=${value}`), {
			ok: false,
			errors: [{ parameter: key, code: 'duplicate' }]
		});
	}
	assert.deepEqual(parse(`${path}?unknown=1&unknown=2`), { videoId });
});

test('typed state validation and signed decimal expansion', () => {
	const state = Object.freeze({ videoId, start: 0, once: false, speed: 1, mute: false });
	assert.deepEqual(normalizeShareUrl(state), { ok: true, value: { videoId, mute: false } });
	for (const override of [
		{ videoId: 'bad' },
		{ start: NaN },
		{ end: Infinity },
		{ end: 0 },
		{ start: 32, end: 24 },
		{ start: -30, end: -60 },
		{ speed: 0 },
		{ mute: 'false' },
		{ once: 1 },
		{ start: '24' }
	]) {
		assert.equal(normalizeShareUrl({ videoId, ...override }).ok, false);
		assert.throws(() => serializeShareUrl({ videoId, ...override }), RangeError);
	}
	for (const start of [undefined, 0, 24.5, -30.5, 1e-7, -1e-7, 1e21, -1e21]) {
		for (const end of [undefined, 32.75, -5.25, 1e22]) {
			for (const mute of [undefined, false, true]) {
				const state = { videoId, start, end, mute, speed: 1.5, fill: false };
				const normalized = normalizeShareUrl(state);
				if (!normalized.ok) continue;
				const url = serializeShareUrl(state);
				assert.deepEqual(parse(url), normalized.value);
				assert.equal(serializeShareUrl(parse(url)), url);
				assert.deepEqual(parse(serializeEditorUrl(state)), normalized.value);
			}
		}
	}
});

test('demo root accepts unrelated queries but never hides invalid clip parameters', () => {
	for (const route of ['/', '/s']) {
		for (const query of ['', '?utm_source=test', '?foo=1&foo=2'])
			assert.deepEqual(parsePlayerUrl(new URL(`https://example.com${route}${query}`)), {
				ok: true,
				value: { videoId: 'dt-SqNL4z3w', start: 31, end: 38 }
			});
		for (const query of ['v=bad', 'v=', 't=bad', 'mute=bad', 'a=1&a=2', 'speed=3'])
			assert.equal(parsePlayerUrl(new URL(`https://example.com${route}?${query}`)).ok, false);
	}
});
