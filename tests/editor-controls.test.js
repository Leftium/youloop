import assert from 'node:assert/strict';
import test from 'node:test';
import { editorTime, parseEditorTime } from '../src/lib/player/editor-time.ts';
import { parseEditorSource } from '../src/lib/player/editor-source.ts';
import {
	applyThumbInteraction,
	ensureRangeSpan,
	rangeValueAtPosition,
	rangeValuePercent,
	stepRangeValue
} from '../src/lib/components/range-slider.ts';

test('swap range edits retain the stationary endpoint, role and fractional offsets', () => {
	const swapped = applyThumbInteraction(
		{ start: 12.345, end: 20.125 },
		'start',
		22.25,
		0,
		60.25,
		'swap'
	);
	assert.deepEqual(swapped, { range: { start: 20.125, end: 22.25 }, edge: 'end' });
	assert.deepEqual(applyThumbInteraction(swapped.range, swapped.edge, 10.375, 0, 60.25, 'swap'), {
		range: { start: 10.375, end: 20.125 },
		edge: 'start'
	});
	assert.equal(stepRangeValue(12.345, 1, 0, 60.25, 0.1, 1, 'relative'), 12.445);
	assert.equal(stepRangeValue(60.245, 1, 0, 60.25, 0.1, 1, 'relative'), 60.25);
	assert.deepEqual(applyThumbInteraction({ start: 0, end: 0 }, 'start', 0.1, 0, 60.25, 'swap'), {
		range: { start: 0, end: 0.1 },
		edge: 'end'
	});
	assert.equal(rangeValueAtPosition(-10, 100, 0, 60.25), 0);
	assert.equal(rangeValueAtPosition(110, 100, 0, 60.25), 60.25);
	assert.equal(rangeValueAtPosition(10, 0, 0, 60.25), 0);
	assert.equal(rangeValuePercent(20, 0, 0), 0);
	assert.deepEqual(applyThumbInteraction({ start: 60, end: 30.25 }, 'start', 5, 0, 60.25, 'swap'), {
		range: { start: 5, end: 30.25 },
		edge: 'start'
	});
});

test('clock editing preserves signed fractional precision and marks whole-second approximations', () => {
	for (const [value, expected] of [
		[12.5, '0:12.5'],
		[-587.5, '-9:47.5'],
		[593.25, '9:53.25'],
		[-6.75, '-0:06.75'],
		[3600.001, '1:00:00.001'],
		[0.00000001, '0:00.00000001']
	]) {
		assert.equal(editorTime(value), expected);
		assert.equal(parseEditorTime(expected), value);
	}
	assert.equal(editorTime(51.72639455782313, true, 2), '0:51.73');
	assert.equal(editorTime(-51.72639455782313, true, 2), '-0:51.73');
	assert.equal(editorTime(59.9999, true, 2), '1:00');
	assert.equal(editorTime(12.5, true, 2), '0:12.5');
	assert.equal(editorTime(12.5, false), '0:13');
	assert.equal(editorTime(-6.75, false), '-0:07');
	assert.equal(parseEditorTime('-30.25'), -30.25);
	for (const text of ['', '-', '-0', '-0:00', '0:60', '1e3', 'abc', '1:2', '1.'])
		assert.equal(parseEditorTime(text), undefined);
});

test('source parser supports plain sources and imports YouLoop range/options with validation', () => {
	const videoId = 'Dxvrvfyicp0';
	for (const text of [
		videoId,
		`youtu.be/${videoId}`,
		`www.youtube.com/watch?v=${videoId}`,
		`https://youtu.be/${videoId}?t=10`,
		`https://www.youtube.com/watch?v=${videoId}`,
		`https://m.youtube.com/shorts/${videoId}`,
		`https://www.youtube-nocookie.com/embed/${videoId}`
	])
		assert.deepEqual(parseEditorSource(text), { videoId });
	for (const text of [
		`https://youloop.app/${videoId}/-30.25~-5.5?once&mute&speed=0.5`,
		`/?v=${videoId}&t=-30.25~-5.5&once&mute&speed=0.5`
	])
		assert.deepEqual(parseEditorSource(text), {
			videoId,
			clip: { videoId, start: -30.25, end: -5.5, once: true, mute: true, speed: 0.5 }
		});
	for (const text of [
		'bad',
		'https://youtube.com/watch?v=bad',
		'javascript:alert(1)',
		`/${videoId}/bad`,
		`/${videoId}/30~5`
	])
		assert.equal(parseEditorSource(text), undefined);
});

test('minimum timeline span remains inside source bounds while preserving the stationary endpoint', () => {
	const gap = 1 / 30;
	for (const edge of ['start', 'end']) {
		for (const time of [0, 10, 60.25]) {
			const range = ensureRangeSpan({ start: time, end: time }, edge, 0, 60.25, gap);
			assert.ok(range.start >= 0 && range.end <= 60.25);
			assert.ok(Math.abs(range.end - range.start - gap) < 1e-10);
			if (time === 10) assert.equal(range[edge === 'start' ? 'end' : 'start'], time);
		}
	}
	assert.deepEqual(ensureRangeSpan({ start: 0, end: 0 }, 'end', 0, 0.01, gap), {
		start: 0,
		end: 0.01
	});
	assert.deepEqual(ensureRangeSpan({ start: 10, end: 11 }, 'start', 0, 60.25, gap), {
		start: 10,
		end: 11
	});
});
