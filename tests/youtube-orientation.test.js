import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrientationController } from '../src/lib/player/youtube-orientation.ts';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
function fixture() {
	const requests = [];
	const frames = [];
	let state;
	const controller = createOrientationController(
		(orientation, override, source) => (state = { orientation, override, source }),
		() => new Promise((resolve) => requests.push(resolve)),
		new Map(),
		() => new Promise((resolve) => frames.push(resolve))
	);
	return { controller, requests, frames, state: () => state };
}

test('Auto restores latest geometry behind an override without detecting again', async () => {
	const f = fixture();
	try {
		f.controller.setSource('portrait', 'landscape');
		f.frames[0]({ width: 1080, height: 1350 });
		await settle();
		assert.equal(f.state().orientation, 'landscape');
		assert.equal(f.state().source.aspectRatio, 4 / 5);
		f.controller.clearOverride();
		assert.deepEqual(f.state(), {
			orientation: 'portrait',
			override: null,
			source: { orientation: 'portrait', aspectRatio: 4 / 5 }
		});
		f.controller.choose('portrait');
		f.controller.clearOverride();
		assert.equal(f.state().override, null);
		assert.equal(f.frames.length, 1);
		assert.equal(f.requests.length, 1);
	} finally {
		f.controller.dispose();
	}
});

test('Auto before late metadata uses default then accepts the pending result', async () => {
	const f = fixture();
	try {
		f.controller.setSource('late');
		f.controller.choose('portrait');
		f.controller.clearOverride();
		assert.equal(f.state().orientation, 'landscape');
		assert.equal(f.state().override, null);
		f.requests[0]({ ok: true, json: async () => ({ width: 270, height: 480 }) });
		await settle();
		assert.equal(f.state().orientation, 'portrait');
		f.controller.choose('landscape');
		f.controller.clearOverride();
		assert.equal(f.state().orientation, 'portrait');
		f.frames[0]({ width: 1920, height: 1080 });
		await settle();
		assert.equal(f.state().orientation, 'landscape');
		assert.equal(f.state().source.aspectRatio, 16 / 9);
		assert.equal(f.frames.length, 1);
		assert.equal(f.requests.length, 1);
	} finally {
		f.controller.dispose();
	}
});

test('same-ID history/import changes reuse pending detection and resolved geometry', async () => {
	const f = fixture();
	try {
		f.controller.setSource('same', 'portrait');
		f.controller.setSource('same', 'landscape');
		f.controller.setSource('same');
		assert.equal(f.state().override, null);
		f.frames[0]({ width: 1080, height: 1920 });
		await settle();
		f.controller.setSource('same', 'landscape');
		assert.equal(f.state().source.aspectRatio, 9 / 16);
		f.controller.setSource('same');
		assert.equal(f.state().orientation, 'portrait');
		assert.equal(f.frames.length, 1);
		assert.equal(f.requests.length, 1);
		f.controller.setSource('new');
		assert.equal(f.state().source.aspectRatio, null);
		f.requests[0]({ ok: true, json: async () => ({ width: 270, height: 480 }) });
		await settle();
		assert.equal(f.state().orientation, 'landscape');
		f.controller.dispose();
		const before = f.state();
		f.controller.clearOverride();
		f.controller.choose('portrait');
		f.frames[1]({ width: 1080, height: 1920 });
		await settle();
		assert.equal(f.state(), before);
	} finally {
		f.controller.dispose();
	}
});
