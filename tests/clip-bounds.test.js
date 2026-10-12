import assert from 'node:assert/strict';
import test from 'node:test';
import { clampClipBounds } from '../src/lib/player/clip-bounds.ts';

test('duration clamps open ends and out-of-duration ranges without an empty loop', () => {
	assert.deepEqual(clampClipBounds(24.5, 32.75, 65), { start: 24.5, end: 32.75 });
	assert.deepEqual(clampClipBounds(24, 99999, 65), { start: 24, end: 65 });
	const outside = clampClipBounds(90, 100, 65);
	assert.equal(outside.end, 65);
	assert.ok(outside.start < outside.end);
	assert.ok(outside.start >= 0);
	assert.deepEqual(clampClipBounds(31, 31.01, 65), { start: 31, end: 31.01 });
	assert.deepEqual(clampClipBounds(0, 0, 65), { start: 0, end: 1 / 30 });
	assert.deepEqual(clampClipBounds(0, 0.01, 0.01), { start: 0, end: 0.01 });
});
