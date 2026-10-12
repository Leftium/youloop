import assert from 'node:assert/strict';
import test from 'node:test';
import { createTimelineMode, timelineRange } from '../src/lib/player/watch-timeline.ts';
import {
	playbackBounds,
	scopeSwitchTarget,
	playbackBoundaryAction
} from '../src/lib/player/watch-playback-scope.ts';

test('restricted clips default to A:B regardless of length, including open ends', () => {
	for (const [a, b] of [
		[0, 24],
		[0, 25],
		[0, 99],
		[1, 99999],
		[50, 51]
	]) {
		const choice = createTimelineMode();
		assert.equal(choice.choose(undefined, a, b), 'video');
		assert.equal(choice.choose(NaN, a, b), 'video');
		assert.equal(choice.choose(100, a, b), 'clip');
	}
	for (const b of [100, 99999, Infinity]) {
		assert.equal(createTimelineMode().choose(100, 0, b), 'video');
	}
});

test('timeline and playback use the same bounds with finite, open and complete clips', () => {
	for (const [a, b] of [
		[20, 80],
		[20, 99999],
		[0, 99999],
		[150, 200]
	]) {
		for (const scope of ['clip', 'video']) {
			const bounds = playbackBounds(100, a, b, scope);
			assert.ok(bounds.start >= 0 && bounds.end <= 100 && bounds.start < bounds.end);
			if (scope === 'video') assert.deepEqual(bounds, { start: 0, end: 100 });
			else if (a < 100) {
				const range = timelineRange(100, a, b, a);
				assert.deepEqual(bounds, { start: range.start, end: range.end });
			}
		}
	}
	assert.deepEqual(playbackBounds(undefined, 20, 99999, 'video'), { start: 20, end: 99999 });
});

test('switching preserves an in-scope position, including endpoints, otherwise starts at A', () => {
	const clip = playbackBounds(100, 20, 80, 'clip');
	const video = playbackBounds(100, 20, 80, 'video');
	for (const time of [0, 19, 20, 50, 80, 81, 100]) {
		assert.equal(scopeSwitchTarget(time, video), time);
		assert.equal(scopeSwitchTarget(time, clip), time >= 20 && time <= 80 ? time : 20);
	}
	assert.equal(scopeSwitchTarget(NaN, clip), 20);
});

test('duration updates retain viewer choice; resetting a source chooses its own default', () => {
	const choice = createTimelineMode();
	assert.equal(choice.choose(100, 20, 80), 'clip');
	assert.equal(choice.toggle(), 'video');
	assert.equal(choice.choose(100.1, 20, 80), 'video');
	choice.reset();
	assert.equal(choice.choose(100, 20, 80), 'clip');
	choice.reset();
	assert.equal(choice.choose(100, 0, 99999), 'video');
	choice.reset();
	assert.equal(choice.choose(100, 50, 99999), 'clip');
});

test('Loop/Once use the selected end, including open clips and provider end events', () => {
	for (const b of [80, 99999]) {
		for (const scope of ['clip', 'video']) {
			const bounds = playbackBounds(100, 20, b, scope);
			for (const loop of [true, false]) {
				assert.equal(playbackBoundaryAction(bounds.end - 1, bounds, loop, true), 'continue');
				assert.equal(playbackBoundaryAction(bounds.end, bounds, loop, false), 'continue');
				assert.equal(
					playbackBoundaryAction(bounds.end, bounds, loop, true),
					loop ? 'repeat' : 'stop'
				);
				assert.equal(
					playbackBoundaryAction(bounds.end + 1, bounds, loop, false),
					loop ? 'repeat' : 'stop'
				);
				assert.equal(
					playbackBoundaryAction(0, bounds, loop, false, true),
					loop ? 'repeat' : 'stop'
				);
				assert.equal(scopeSwitchTarget(bounds.end + 1, bounds), bounds.start);
			}
		}
	}
	assert.equal(
		playbackBoundaryAction(90, playbackBounds(100, 20, 80, 'video'), true, true),
		'continue'
	);
	assert.equal(
		playbackBoundaryAction(10, playbackBounds(100, 20, 80, 'clip'), true, true),
		'clamp-start'
	);
});
