// Run from the Vite page's browser console:
// await (await import('/src/lib/player/youtube-orientation.browser-test.ts')).run()
import {
	createOrientationController,
	parseOrientation,
	type Orientation
} from './youtube-orientation';

export async function run() {
	const results: string[] = [];
	const pending: Array<{
		url: string;
		resolve: (response: Response) => void;
		reject: (error: Error) => void;
	}> = [];
	let state: { orientation: Orientation; override: Orientation | null };
	const cache = new Map<string, Orientation>();
	const request: typeof fetch = (url) =>
		new Promise((resolve, reject) => pending.push({ url: String(url), resolve, reject }));
	const controller = createOrientationController(
		(orientation, override) => (state = { orientation, override }),
		request,
		cache,
		async () => null
	);
	const assert = (condition: boolean, message: string) => {
		if (!condition) throw new Error(message);
		results.push(message);
	};
	const settle = async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	};
	const respond = async (width: unknown, height: unknown) => {
		pending.shift()!.resolve({ ok: true, json: async () => ({ width, height }) } as Response);
		await settle();
	};

	try {
		assert(parseOrientation('portrait') === 'portrait', 'Portrait URL override');
		assert(parseOrientation('landscape') === 'landscape', 'Landscape URL override');
		assert(parseOrientation('invalid') === null, 'Invalid URL uses automatic detection');
		controller.setSource('portrait');
		assert(
			new URL(pending[0].url).searchParams.get('url') === 'https://www.youtube.com/shorts/portrait',
			'Detect through the shorts oEmbed URL'
		);
		await respond(270, 480);
		assert(state!.orientation === 'portrait' && state!.override === null, 'Automatic portrait');
		controller.setSource('landscape');
		await respond(480, 270);
		assert(state!.orientation === 'landscape', 'Automatic landscape');
		controller.setSource('square');
		await respond(480, 480);
		assert(state!.orientation === 'landscape', 'Square uses landscape');
		controller.setSource('portrait');
		await settle();
		assert(state!.orientation === 'portrait' && pending.length === 0, 'Successful result cached');
		controller.choose('landscape');
		assert(state!.override === 'landscape', 'Manual landscape is an explicit override');
		controller.setSource('explicit', 'portrait');
		assert(pending.length === 0 && state!.orientation === 'portrait', 'URL override skips fetch');
		controller.setSource('explicit-landscape', 'landscape');
		assert(pending.length === 0 && state!.orientation === 'landscape', 'Landscape URL skips fetch');
		controller.setSource('old');
		controller.setSource('new');
		await respond(270, 480);
		assert(state!.orientation === 'landscape', 'Stale source response ignored');
		controller.choose('landscape');
		await respond(270, 480);
		assert(
			state!.override === 'landscape' && state!.orientation === 'landscape',
			'Manual choice wins race'
		);
		controller.setSource('new', null, true);
		await settle();
		assert(
			state!.override === null && state!.orientation === 'portrait',
			'Source reload clears manual choice'
		);
		controller.setSource('failure');
		pending.shift()!.reject(new Error('Network failure'));
		await settle();
		assert(
			state!.orientation === 'landscape' && !cache.has('failure'),
			'Network fallback is not cached'
		);
		for (const [width, height] of [
			[0, 480],
			[480, -1],
			['270', 480],
			[480, null]
		]) {
			controller.setSource('invalid', null, true);
			await respond(width, height);
			assert(
				state!.orientation === 'landscape' && !cache.has('invalid'),
				'Invalid dimensions fall back'
			);
		}
		controller.setSource('http-failure');
		pending.shift()!.resolve(new Response('', { status: 404 }));
		await settle();
		assert(state!.orientation === 'landscape' && !cache.has('http-failure'), 'HTTP fallback');
		controller.setSource('malformed');
		pending.shift()!.resolve({
			ok: true,
			json: async () => {
				throw new Error('Invalid JSON');
			}
		} as unknown as Response);
		await settle();
		assert(
			state!.orientation === 'landscape' && !cache.has('malformed'),
			'Malformed JSON fallback'
		);
		controller.setSource('disposed');
		controller.dispose();
		const before = state!;
		await respond(270, 480);
		assert(state! === before, 'Disposed controller ignores late response');
		const fallbackCache = new Map<string, Orientation>();
		let thumbnail: { width: number; height: number } | null = { width: 1080, height: 1920 };
		const fallback = createOrientationController(
			(orientation, override) => (state = { orientation, override }),
			async () => ({ ok: true, json: async () => ({ width: 200, height: 113 }) }) as Response,
			fallbackCache,
			async () => thumbnail
		);
		fallback.setSource('portrait-frame');
		await settle();
		assert(state!.orientation === 'portrait', 'Original-aspect frame corrects landscape oEmbed');
		thumbnail = { width: 120, height: 90 };
		fallback.setSource('placeholder');
		await settle();
		assert(state!.orientation === 'landscape', 'Missing-frame placeholder ignored');
		thumbnail = null;
		fallback.setSource('missing');
		await settle();
		assert(state!.orientation === 'landscape', 'Missing original-aspect image fallback');
		fallback.dispose();
		const frames: Array<(dimensions: { width: number; height: number } | null) => void> = [];
		const delayedFrame = createOrientationController(
			(orientation, override) => (state = { orientation, override }),
			async () => ({ ok: true, json: async () => ({ width: 200, height: 113 }) }) as Response,
			new Map(),
			() => new Promise((resolve) => frames.push(resolve))
		);
		delayedFrame.setSource('old-frame');
		await settle();
		delayedFrame.setSource('new-frame');
		await settle();
		frames.shift()!({ width: 1080, height: 1920 });
		await settle();
		assert(state!.orientation === 'landscape', 'Stale image response ignored');
		delayedFrame.choose('landscape');
		frames.shift()!({ width: 1080, height: 1920 });
		await settle();
		assert(
			state!.orientation === 'landscape' && state!.override === 'landscape',
			'Manual choice wins image race'
		);
		delayedFrame.dispose();
		return results;
	} finally {
		controller.dispose();
	}
}
