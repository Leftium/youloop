import assert from 'node:assert/strict';
import test from 'node:test';
import { attachVideoGesture } from '../src/lib/player/video-gesture.ts';

function setup(left = 0) {
	globalThis.window = new EventTarget();
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
			begin: () => calls.push('begin'),
			move: (position) => calls.push(position),
			end: (commit) => calls.push(commit ? 'commit' : 'cancel')
		}),
		() => calls.push('tap')
	);
	function emit(type, x = 0, y = 0, id = 1, primary = true) {
		const event = new Event(type, { cancelable: true });
		Object.assign(event, { pointerId: id, isPrimary: primary, button: 0, clientX: x, clientY: y });
		if (type === 'pointerdown' || type === 'click' || type === 'lostpointercapture')
			surface.dispatchEvent(event);
		if (type !== 'click' && type !== 'lostpointercapture') window.dispatchEvent(event);
		return event;
	}
	return { emit, calls, attachment };
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
