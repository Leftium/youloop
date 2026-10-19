import assert from 'node:assert/strict';
import test from 'node:test';
import { attachVideoGesture } from '../src/lib/player/video-gesture.ts';

function setup(left = 0, pointerType = 'mouse', position) {
	globalThis.window = new EventTarget();
	window.innerWidth = 200;
	const surface = new EventTarget();
	let captured;
	surface.getBoundingClientRect = () => ({ left, width: 200 });
	surface.setPointerCapture = (id) => {
		captured = id;
	};
	surface.hasPointerCapture = (id) => captured === id;
	surface.releasePointerCapture = () => {
		captured = undefined;
	};
	const calls = [];
	const attachment = attachVideoGesture(
		surface,
		() => ({
			position,
			begin: () => calls.push('begin'),
			move: (position) => calls.push(position),
			end: (commit) => calls.push(commit ? 'commit' : 'cancel')
		}),
		() => calls.push('tap')
	);
	function emit(type, x = 0, y = 0, id = 1, primary = true) {
		const event = new Event(type, { cancelable: true });
		Object.assign(event, {
			pointerId: id,
			pointerType,
			isPrimary: primary,
			button: 0,
			clientX: x,
			clientY: y
		});
		if (type === 'pointerdown' || type === 'click' || type === 'lostpointercapture')
			surface.dispatchEvent(event);
		if (type !== 'click' && type !== 'lostpointercapture') window.dispatchEvent(event);
		return event;
	}
	function touch(type, x = 0, y = 0, count = 1, cancelable = true) {
		const event = new Event(type, { cancelable });
		Object.assign(event, {
			touches: Array.from({ length: count }, (_, identifier) => ({
				identifier,
				clientX: x,
				clientY: y
			}))
		});
		surface.dispatchEvent(event);
		window.dispatchEvent(event);
		return event;
	}
	return { emit, touch, calls, attachment };
}

test('tap has no down seek and synthetic click cannot toggle twice', () => {
	const { emit, calls, attachment } = setup();
	emit('pointerdown', 30);
	assert.deepEqual(calls, []);
	emit('pointerup', 32);
	assert.equal(emit('click').defaultPrevented, true);
	assert.deepEqual(calls, ['tap']);
	attachment.destroy();
});

test('horizontal direction stays locked and commits absolute surface position without a tap', () => {
	const { emit, calls, attachment } = setup(20);
	emit('pointerdown', 50);
	assert.equal(emit('pointermove', 70, 2).defaultPrevented, true);
	emit('pointermove', 90, 100);
	emit('pointerup', 90, 100);
	assert.deepEqual(calls, ['begin', 0.25, 0.35, 0.35, 'commit']);
	attachment.destroy();
});

test('vertical and diagonal ties stay native; release-only travel is not a tap', () => {
	for (const [x, y] of [
		[2, 20],
		[20, 20]
	]) {
		const { emit, calls, attachment } = setup();
		emit('pointerdown');
		assert.equal(emit('pointermove', x, y).defaultPrevented, false);
		emit('pointermove', 100, y);
		emit('pointerup', 100, y);
		assert.deepEqual(calls, []);
		attachment.destroy();
	}
	const { emit, calls, attachment } = setup();
	emit('pointerdown');
	emit('pointerup', 50);
	assert.deepEqual(calls, []);
	attachment.destroy();
});

test('cancel, lost capture, scrolling, blur and teardown end exactly once', () => {
	for (const reason of [
		'pointercancel',
		'lostpointercapture',
		'scroll',
		'wheel',
		'blur',
		'destroy',
		'source'
	]) {
		const { emit, calls, attachment } = setup();
		emit('pointerdown');
		emit('pointermove', 20);
		if (reason === 'destroy') attachment.destroy();
		else if (reason === 'source') attachment.cancel();
		else emit(reason);
		emit('pointerup', 20);
		assert.deepEqual(calls, ['begin', 0.1, 'cancel'], reason);
		attachment.destroy();
	}
});

test('second pointer cancels scrub and neither finger becomes a tap', () => {
	const { emit, calls, attachment } = setup();
	emit('pointerdown');
	emit('pointermove', 20);
	emit('pointerdown', 30, 0, 2, false);
	emit('pointerup', 30, 0, 2, false);
	emit('pointerup', 20);
	assert.deepEqual(calls, ['begin', 0.1, 'cancel']);
	attachment.destroy();
});

// Permanent: cheap ownership/cancellation contracts protect touch playback restoration.
test('touch horizontal lock cancels native movement through vertical travel and residual scroll', () => {
	const { emit, touch, calls, attachment } = setup(0, 'touch');
	emit('pointerdown', 40);
	touch('touchstart', 40);
	assert.equal(touch('touchmove', 44, 1).defaultPrevented, false);
	emit('pointermove', 60, 2);
	assert.equal(touch('touchmove', 60, 2).defaultPrevented, true);
	emit('scroll');
	emit('pointermove', 80, 150);
	assert.equal(touch('touchmove', 80, 150).defaultPrevented, true);
	emit('pointerup', 80, 150);
	assert.equal(touch('touchmove', 80, 160).defaultPrevented, false);
	assert.deepEqual(calls, ['begin', 0.3, 0.4, 0.4, 'commit']);
	attachment.destroy();
});

test('vertical touch intent remains native and cannot become a scrub later', () => {
	const { emit, touch, calls, attachment } = setup(0, 'touch');
	emit('pointerdown', 40);
	touch('touchstart', 40);
	emit('pointermove', 42, 20);
	assert.equal(touch('touchmove', 42, 20).defaultPrevented, false);
	emit('pointermove', 80, 22);
	assert.equal(touch('touchmove', 80, 22).defaultPrevented, false);
	emit('pointerup', 80, 22);
	assert.deepEqual(calls, []);
	attachment.destroy();
});

test('touch cancellation, browser takeover, multitouch and explicit cleanup release native scrolling', () => {
	for (const reason of [
		'touchcancel',
		'pointercancel',
		'takeover',
		'multitouch',
		'cancel',
		'destroy'
	]) {
		const { emit, touch, calls, attachment } = setup(0, 'touch');
		emit('pointerdown', 40);
		touch('touchstart', 40);
		emit('pointermove', 60);
		if (reason === 'takeover') touch('touchmove', 80, 0, 1, false);
		else if (reason === 'multitouch') touch('touchstart', 80, 0, 2);
		else if (reason === 'cancel' || reason === 'destroy') attachment[reason]();
		else if (reason === 'pointercancel') emit(reason);
		else touch(reason);
		assert.equal(touch('touchmove', 80).defaultPrevented, false, reason);
		emit('pointerup', 80);
		assert.deepEqual(calls, ['begin', 0.3, 'cancel'], reason);
		attachment.destroy();
	}
});

test('touch pickup near either endpoint preserves grab offset on the full axis', () => {
	for (const [position, down, move, expected] of [
		[0, 18, 38, 0.1],
		[1, 182, 162, 0.9],
		[0, 40, 60, 0.1],
		[1, 160, 140, 0.9],
		[0, 44, 64, 0.1],
		[1, 156, 136, 0.9]
	]) {
		const left = 27;
		const { emit, calls, attachment } = setup(left, 'touch', position);
		emit('pointerdown', left + down);
		assert.deepEqual(calls, []);
		emit('pointermove', left + move);
		assert.deepEqual(calls, ['begin', expected]);
		// Returning to the pickup point still reaches the exact original endpoint.
		emit('pointermove', left + down);
		emit('pointerup', left + down);
		assert.deepEqual(calls, ['begin', expected, position, position, 'commit']);
		attachment.destroy();
	}
	for (const [pointerType, down, move, expected] of [
		['touch', 45, 65, 0.325],
		['touch', 155, 135, 0.675],
		['mouse', 44, 64, 0.32]
	]) {
		const { emit, calls, attachment } = setup(0, pointerType, down > 100 ? 1 : 0);
		emit('pointerdown', down);
		emit('pointermove', move);
		emit('pointerup', move);
		assert.deepEqual(calls, ['begin', expected, expected, 'commit']);
		attachment.destroy();
	}
});

test('touchstart reserves only single-finger edge playhead grabs and still taps once', () => {
	for (const [left, position, x, reserved] of [
		[0, 0, 0, true],
		[0, 0, 24, true],
		[0, 0, 25, false],
		[0, 1, 176, true],
		[0, 1, 175, false],
		[0, 0.5, 10, false],
		[0, undefined, 10, false],
		[44, 0, 0, true],
		[45, 0, 0, false]
	]) {
		const { emit, touch, calls, attachment } = setup(left, 'touch', position);
		emit('pointerdown', x);
		assert.equal(touch('touchstart', x).defaultPrevented, reserved);
		assert.deepEqual(calls, []);
		emit('pointerup', x);
		emit('click');
		assert.deepEqual(calls, ['tap']);
		attachment.destroy();
	}
});

test('reserved edge starts release on multitouch and use the visible viewport edges', () => {
	const { emit, touch, calls, attachment } = setup(50, 'touch', 0);
	window.visualViewport = { offsetLeft: 50, width: 100 };
	emit('pointerdown', 55);
	assert.equal(touch('touchstart', 55).defaultPrevented, true);
	emit('pointermove', 75);
	assert.equal(touch('touchmove', 75).defaultPrevented, true);
	emit('pointerdown', 85, 0, 2, false);
	assert.equal(touch('touchstart', 85, 0, 2).defaultPrevented, false);
	assert.equal(touch('touchmove', 85, 0, 2).defaultPrevented, false);
	emit('pointerup', 85, 0, 2, false);
	emit('pointerup', 75);
	assert.deepEqual(calls, ['begin', 0.1, 'cancel']);
	emit('pointerdown', 55);
	assert.equal(touch('touchstart', 55, 0, 1, false).defaultPrevented, false);
	emit('pointercancel', 55);
	emit('pointerdown', 10);
	assert.equal(touch('touchstart', 10).defaultPrevented, false);
	emit('pointercancel', 10);
	attachment.destroy();
});
