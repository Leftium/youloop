// Run from the Vite page's browser console:
// await (await import('/src/lib/player/youtube-orientation.browser-test.ts')).run()
import {
	createOrientationController,
	parseOrientation,
	type Orientation,
	type SourceGeometry
} from './youtube-orientation';

export async function run() {
	const results: string[] = [];
	const pending: Array<{
		url: string;
		resolve: (response: Response) => void;
		reject: (error: Error) => void;
	}> = [];
	let state: { orientation: Orientation; override: Orientation | null };
	let source: SourceGeometry;
	const cache = new Map<string, SourceGeometry>();
	const request: typeof fetch = (url) =>
		new Promise((resolve, reject) => pending.push({ url: String(url), resolve, reject }));
	const controller = createOrientationController(
		(orientation, override, geometry) => {
			state = { orientation, override };
			if (geometry) source = geometry;
		},
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
		await respond(480, 270);
		assert(
			state!.orientation === 'portrait' && source!.orientation === 'landscape',
			'Portrait URL frame preserves independent landscape source detection'
		);
		controller.setSource('explicit-landscape', 'landscape');
		await respond(270, 480);
		assert(
			state!.orientation === 'landscape' &&
				source!.orientation === 'portrait' &&
				source!.aspectRatio === null,
			'Landscape URL frame retains portrait fallback when the thumbnail is unavailable'
		);
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
		assert(source!.orientation === 'portrait', 'Manual choice does not cancel source detection');
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
		const fallbackCache = new Map<string, SourceGeometry>();
		let thumbnail: { width: number; height: number } | null = { width: 1080, height: 1920 };
		const fallback = createOrientationController(
			(orientation, override, geometry) => {
				state = { orientation, override };
				if (geometry) source = geometry;
			},
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
		assert(
			state!.orientation === 'landscape' && !fallbackCache.has('placeholder'),
			'Missing-frame placeholder is not cached'
		);
		thumbnail = null;
		fallback.setSource('missing');
		await settle();
		assert(
			state!.orientation === 'landscape' && !fallbackCache.has('missing'),
			'Transient image failure is not cached'
		);
		thumbnail = { width: 1080, height: 1920 };
		fallback.setSource('missing', null, true);
		await settle();
		assert(
			state!.orientation === 'portrait' && fallbackCache.get('missing')?.orientation === 'portrait',
			'Retry after image failure detects and caches portrait'
		);
		thumbnail = { width: 1920, height: 1080 };
		fallback.setSource('landscape-frame');
		await settle();
		assert(
			state!.orientation === 'landscape' &&
				fallbackCache.get('landscape-frame')?.orientation === 'landscape',
			'Original-aspect frame confirms cacheable landscape'
		);
		thumbnail = { width: 1440, height: 1080 };
		fallback.setSource('four-three');
		await settle();
		assert(source!.aspectRatio === 4 / 3, 'Original source ratio published');
		fallback.choose('portrait');
		fallback.setSource('four-three', null, true);
		await settle();
		assert(
			source!.aspectRatio === 4 / 3 && state!.override === null,
			'Reloading the same source restores its cached ratio and automatic orientation'
		);
		fallback.dispose();
		let portraitThumbnail: { width: number; height: number } | null = null;
		let thumbnailRequests = 0;
		const portrait = createOrientationController(
			(orientation, override, geometry) => {
				state = { orientation, override };
				if (geometry) source = geometry;
			},
			async () => ({ ok: true, json: async () => ({ width: 270, height: 480 }) }) as Response,
			new Map(),
			async () => {
				thumbnailRequests += 1;
				return portraitThumbnail;
			}
		);
		portrait.setSource('portrait-retry', 'landscape');
		await settle();
		portraitThumbnail = { width: 1080, height: 1350 };
		portrait.setSource('portrait-retry', 'landscape', true);
		await settle();
		assert(
			state!.orientation === 'landscape' &&
				source!.orientation === 'portrait' &&
				source!.aspectRatio === 4 / 5 &&
				thumbnailRequests === 2,
			'Cached portrait detection retries a missing thumbnail and refines its ratio'
		);
		portrait.dispose();
		let resolveEmbed: (response: Response) => void;
		const slowEmbedCache = new Map<string, SourceGeometry>();
		const slowEmbed = createOrientationController(
			(orientation, override, geometry) => {
				state = { orientation, override };
				if (geometry) source = geometry;
			},
			() => new Promise((resolve) => (resolveEmbed = resolve)),
			slowEmbedCache,
			async () => ({ width: 1080, height: 1350 })
		);
		slowEmbed.setSource('slow-embed', 'landscape');
		await settle();
		assert(
			state!.orientation === 'landscape' && source!.aspectRatio === 4 / 5,
			'Native thumbnail determines framing without waiting for oEmbed'
		);
		resolveEmbed!({ ok: true, json: async () => ({ width: 270, height: 480 }) } as Response);
		await settle();
		assert(
			source!.aspectRatio === 4 / 5 && slowEmbedCache.get('slow-embed')?.aspectRatio === 4 / 5,
			'Late oEmbed response cannot replace a confirmed native ratio'
		);
		slowEmbed.dispose();
		const slowThumbnail = createOrientationController(
			(orientation, override, geometry) => {
				state = { orientation, override };
				if (geometry) source = geometry;
			},
			async () => ({ ok: true, json: async () => ({ width: 270, height: 480 }) }) as Response,
			new Map(),
			() => new Promise(() => {})
		);
		slowThumbnail.setSource('slow-thumbnail', 'landscape');
		await settle();
		assert(
			state!.orientation === 'landscape' && source!.orientation === 'portrait',
			'Portrait oEmbed supplies fallback geometry without waiting for the thumbnail'
		);
		slowThumbnail.dispose();
		const reloadFrames: Array<(dimensions: { width: number; height: number } | null) => void> = [];
		const reloadCache = new Map<string, SourceGeometry>();
		const reload = createOrientationController(
			() => {},
			async () => ({ ok: true, json: async () => ({ width: 270, height: 480 }) }) as Response,
			reloadCache,
			() => new Promise((resolve) => reloadFrames.push(resolve))
		);
		reload.setSource('same-source');
		reload.setSource('same-source', null, true);
		reloadFrames[1]({ width: 1080, height: 1350 });
		await settle();
		reloadFrames[0](null);
		await settle();
		assert(
			reloadCache.get('same-source')?.aspectRatio === 4 / 5,
			'Stale detection cannot overwrite the ratio cached by a source reload'
		);
		reload.dispose();
		const frames: Array<(dimensions: { width: number; height: number } | null) => void> = [];
		const delayedFrame = createOrientationController(
			(orientation, override, geometry) => {
				state = { orientation, override };
				if (geometry) source = geometry;
			},
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
		assert(source!.aspectRatio === null, 'Stale image does not change source geometry');
		delayedFrame.choose('landscape');
		frames.shift()!({ width: 1080, height: 1920 });
		await settle();
		assert(
			state!.orientation === 'landscape' && state!.override === 'landscape',
			'Manual choice wins image race'
		);
		assert(
			source!.orientation === 'portrait' && source!.aspectRatio === 9 / 16,
			'Manual frame retains the independently detected source geometry'
		);
		delayedFrame.dispose();
		return results;
	} finally {
		controller.dispose();
	}
}
