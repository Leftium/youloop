import assert from 'node:assert/strict';
import test from 'node:test';
import {
	attachFrameHold,
	createFrameStepper,
	frameStepTarget
} from '../src/lib/player/frame-stepping.ts';

test('nominal quanta preserve fractional offsets at supplied FPS and clamp source edges', () => {
	for (const fps of [24, 25, 29.97, 30, 60]) {
		assert.equal(
			frameStepTarget(10.345, 12000, { start: 0, end: 1000 }, 1 / fps),
			10.345 + 12000 / fps
		);
		assert.equal(frameStepTarget(10.345, -2, { start: 0, end: 60 }, 1 / fps), 10.345 - 2 / fps);
	}
	assert.equal(frameStepTarget(0.01, -1, { start: 0, end: 60 }), 0);
	assert.equal(frameStepTarget(59.99, 1, { start: 0, end: 60 }), 60);
	for (const duration of [0, -1, NaN, Infinity])
		assert.equal(frameStepTarget(10, 1, { start: 0, end: duration }), undefined);
});

test('logical requests ignore stale observations, coalesce rapid taps and discard on reset', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
	let observed = 10.345;
	const shown = [];
	const sent = [];
	const stepper = createFrameStepper({
		position: () => observed,
		loop: () => false,
		bounds: () => ({ start: 0, end: 60 }),
		show: (time) => shown.push(time),
		seek: (time) => sent.push(time)
	});
	stepper.step(1);
	observed = 1;
	for (let i = 0; i < 9; i++) stepper.step(1);
	assert.equal(sent.length, 1);
	assert.equal(stepper.target, 10.345 + 10 / 30);
	assert.ok(shown.every((value, i) => i === 0 || value > shown[i - 1]));
	t.mock.timers.tick(200);
	assert.deepEqual(sent, [10.345 + 1 / 30, 10.345 + 10 / 30]);
	stepper.step(-1);
	stepper.reset();
	t.mock.timers.tick(1000);
	assert.equal(sent.length, 2);
	assert.equal(stepper.target, undefined);
	stepper.step(-1);
	assert.equal(stepper.target, 1 - 1 / 30);
	stepper.reset();
});

function setup() {
	globalThis.window = new EventTarget();
	globalThis.document = new EventTarget();
	const buttons = [new EventTarget(), new EventTarget()];
	for (const button of buttons) {
		let capture;
		button.focus = () => {};
		button.isConnected = true;
		button.hasPointerCapture = (id) => capture === id;
		button.setPointerCapture = (id) => (capture = id);
		button.releasePointerCapture = () => (capture = undefined);
	}
	const calls = [];
	const hold = attachFrameHold(buttons, (direction) => {
		calls.push(direction);
		return true;
	});
	function emit(target, type, properties = {}) {
		const event = new Event(type, { cancelable: true });
		Object.assign(event, { pointerId: 1, button: 0, isPrimary: true, ...properties });
		target.dispatchEvent(event);
		return event;
	}
	return { buttons, calls, hold, emit };
}

test('one repeat owner handles pointer and keyboard holds without release clicks or OS repeat', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const { buttons, calls, hold, emit } = setup();
	emit(buttons[1], 'pointerdown');
	assert.deepEqual(calls, [1]);
	t.mock.timers.tick(349);
	assert.equal(calls.length, 1);
	t.mock.timers.tick(1);
	t.mock.timers.tick(200);
	assert.deepEqual(calls, [1, 1, 1]);
	emit(window, 'pointerup');
	emit(buttons[1], 'click', { detail: 1 });
	t.mock.timers.tick(1000);
	assert.equal(calls.length, 3);
	assert.equal(emit(buttons[0], 'keydown', { key: ' ' }).defaultPrevented, true);
	emit(buttons[0], 'keydown', { key: ' ', repeat: true });
	t.mock.timers.tick(350);
	emit(buttons[0], 'keyup', { key: ' ' });
	t.mock.timers.tick(1000);
	assert.deepEqual(calls, [1, 1, 1, -1, -1]);
	emit(buttons[1], 'click', { detail: 0 });
	assert.equal(calls.length, 6);
	hold.destroy();
});

test('cancellation and teardown leave no repeat, including disabled/disconnected controls', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	for (const reason of [
		'pointercancel',
		'lostpointercapture',
		'blur',
		'visibilitychange',
		'pagehide',
		'pointerdown',
		'keydown',
		'disabled',
		'disconnected',
		'cancel',
		'destroy'
	]) {
		const { buttons, calls, hold, emit } = setup();
		emit(buttons[1], 'pointerdown');
		if (reason === 'cancel') hold.cancel();
		else if (reason === 'destroy') hold.destroy();
		else if (reason === 'disabled') buttons[1].disabled = true;
		else if (reason === 'disconnected') buttons[1].isConnected = false;
		else
			emit(
				reason === 'visibilitychange'
					? document
					: reason === 'lostpointercapture'
						? buttons[1]
						: window,
				reason
			);
		t.mock.timers.tick(2000);
		assert.deepEqual(calls, [1], reason);
		hold.destroy();
	}
});

test('source boundaries stop and reverse immediately without accumulating overshoot', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
	const stepper = createFrameStepper({
		position: () => 0.01,
		loop: () => false,
		bounds: () => ({ start: 0, end: 1 }),
		show() {},
		seek() {}
	});
	assert.equal(stepper.step(-1), false);
	assert.equal(stepper.target, 0);
	assert.equal(stepper.step(1), true);
	assert.equal(stepper.target, 1 / 30);
	for (let i = 0; i < 50; i++) stepper.step(1);
	assert.equal(stepper.target, 1);
	stepper.step(-1);
	assert.equal(stepper.target, 1 - 1 / 30);
	stepper.reset();
});

// Permanent: both directions must stop at the selected scope, even outside it.
test('clip bounds clamp both directions, reverse without overshoot and discard on scope change', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
	let bounds = { start: 10.345, end: 20.125 };
	let position = 10.35;
	const sent = [];
	const stepper = createFrameStepper({
		position: () => position,
		loop: () => false,
		bounds: () => bounds,
		show: (time) => {
			position = time;
		},
		seek: (time) => sent.push(time)
	});
	assert.equal(stepper.step(-1), false);
	assert.equal(position, bounds.start);
	assert.equal(stepper.step(1), true);
	assert.equal(position, bounds.start + 1 / 30);
	stepper.reset();
	position = 20.12;
	assert.equal(stepper.step(1), false);
	assert.equal(position, bounds.end);
	stepper.step(-1);
	assert.equal(position, bounds.end - 1 / 30);
	stepper.reset();
	for (const outside of [1, 30]) {
		for (const direction of [-1, 1]) {
			position = outside;
			stepper.step(direction);
			assert.equal(position, outside < bounds.start ? bounds.start : bounds.end);
			stepper.reset();
		}
	}
	position = 15;
	stepper.step(1);
	stepper.step(1);
	stepper.reset();
	const before = sent.length;
	bounds = { start: 0, end: 60 };
	t.mock.timers.tick(1000);
	assert.equal(sent.length, before);
	position = 10.345;
	assert.equal(stepper.step(-1), true);
	assert.equal(position, 10.345 - 1 / 30);
	stepper.reset();
});

// Permanent: Loop/Once must apply symmetrically to frame transport.
test('Loop wraps both directions and keeps repeating; Once stops at the same edges', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
	for (const bounds of [
		{ start: 10.345, end: 20.125 },
		{ start: 0, end: 60.25 }
	]) {
		let looping = true;
		let position = bounds.end;
		const stepper = createFrameStepper({
			position: () => position,
			bounds: () => bounds,
			loop: () => looping,
			show: (time) => {
				position = time;
			},
			seek() {}
		});
		assert.equal(stepper.step(1), true);
		assert.equal(position, bounds.start);
		stepper.step(1);
		assert.equal(position, bounds.start + 1 / 30);
		stepper.step(-1);
		assert.equal(position, bounds.start);
		assert.equal(stepper.step(-1), true);
		assert.equal(position, bounds.end);
		stepper.step(-1);
		assert.equal(position, bounds.end - 1 / 30);
		stepper.reset();
		looping = false;
		position = bounds.start;
		assert.equal(stepper.step(-1), false);
		assert.equal(position, bounds.start);
		stepper.reset();
	}
});
