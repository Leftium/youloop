import { test, expect } from '@playwright/test';
import { placeWatchControls, placeWatchTitle } from '../../src/lib/player/watch-controls-placement';

const safe = { left: 8, top: 8, right: 674, bottom: 1312 };
const tallVideo = { left: 0, top: 70, right: 682, bottom: 1282 };
const rightButton = { left: 642, top: 8, right: 674, bottom: 40 };

test('upper controls reserve the rightmost mode-button column', () => {
	const controls = placeWatchControls(
		safe,
		tallVideo,
		{ time: 100, actions: 112, height: 32 },
		rightButton
	);
	expect(controls.mode).toBe('above');
	expect(controls.left + controls.width).toBeLessThanOrEqual(rightButton.left - 8);
	expect(controls.width).toBeGreaterThan(220);
});

test('upper controls can still avoid a top-left action', () => {
	const leftButton = { left: 8, top: 8, right: 40, bottom: 40 };
	const controls = placeWatchControls(
		safe,
		tallVideo,
		{ time: 100, actions: 112, height: 32 },
		leftButton
	);
	expect(controls.mode).toBe('above');
	expect(controls.left).toBeGreaterThanOrEqual(leftButton.right + 8);
});

test('paused title starts at the top beside an upper-right action', () => {
	const title = placeWatchTitle(
		safe,
		{ left: 0, top: 0, right: 682, bottom: 1320 },
		{ left: 8, top: 1250, width: 666, height: 44 },
		48,
		rightButton
	);
	expect(title.mode).toBe('video');
	expect(title.top).toBe(safe.top);
	expect(title.left + title.width).toBeLessThanOrEqual(rightButton.left - 8);
	expect(title.maxHeight).toBeGreaterThan(48);
});

test('title moves below an upper action when the remaining column is too narrow', () => {
	const title = placeWatchTitle(
		{ left: 8, top: 8, right: 258, bottom: 420 },
		{ left: 0, top: 0, right: 266, bottom: 440 },
		{ left: 8, top: 370, width: 250, height: 44 },
		32,
		{ left: 140, top: 8, right: 172, bottom: 40 }
	);
	expect(title.mode).toBe('video');
	expect(title.top).toBeGreaterThanOrEqual(48);
});
