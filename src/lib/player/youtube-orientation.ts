export type Orientation = 'landscape' | 'portrait';
export type SourceGeometry = { orientation: Orientation; aspectRatio: number | null };

type Fetch = typeof fetch;
type Dimensions = { width: number; height: number };

export function loadOriginalAspect(videoId: string): Promise<Dimensions | null> {
	return new Promise((resolve) => {
		const image = new Image();
		const finish = (dimensions: Dimensions | null) => {
			clearTimeout(timer);
			image.onload = image.onerror = null;
			resolve(dimensions);
		};
		const timer = setTimeout(() => finish(null), 5000);
		image.onload = () => finish({ width: image.naturalWidth, height: image.naturalHeight });
		image.onerror = () => finish(null);
		// Original-aspect frames avoid custom thumbnail crops and padded 16:9 covers.
		image.src = `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/oar2.jpg`;
	});
}
const cache = new Map<string, SourceGeometry>();

export function parseOrientation(value: string | null): Orientation | null {
	return value === 'portrait' || value === 'landscape' ? value : null;
}

export function createOrientationController(
	publish: (
		orientation: Orientation,
		override: Orientation | null,
		source?: SourceGeometry
	) => void,
	request: Fetch = fetch,
	results = cache,
	originalAspect = loadOriginalAspect
) {
	let currentId: string | null = null;
	let version = 0;
	let disposed = false;
	let frameOverride: Orientation | null = null;

	function publishSource(source: SourceGeometry, ticket: number, cacheId?: string) {
		if (!disposed && ticket === version) {
			if (cacheId !== undefined) results.set(cacheId, source);
			publish(frameOverride ?? source.orientation, frameOverride, source);
		}
	}

	async function detectEmbed(videoId: string): Promise<Orientation | null> {
		try {
			const url = new URL('https://www.youtube.com/oembed');
			url.searchParams.set('url', `https://www.youtube.com/shorts/${videoId}`);
			url.searchParams.set('format', 'json');
			const response = await request(url);
			if (!response.ok) throw new Error('oEmbed unavailable');
			const { width, height } = await response.json();
			if (
				typeof width !== 'number' ||
				typeof height !== 'number' ||
				!Number.isFinite(width) ||
				!Number.isFinite(height) ||
				width <= 0 ||
				height <= 0
			) {
				throw new Error('Invalid oEmbed dimensions');
			}
			return height > width ? 'portrait' : 'landscape';
		} catch {
			// Direct browser requests can fail; manual controls remain available.
			return null;
		}
	}

	async function detect(videoId: string, ticket: number) {
		const cached = results.get(videoId);
		if (cached) {
			publishSource(cached, ticket);
			if (cached.aspectRatio !== null) return;
		}
		// Either lookup can stall. Publish confirmed geometry without waiting for the other.
		let thumbnailConfirmed = false;
		const embed = cached ? Promise.resolve(cached.orientation) : detectEmbed(videoId);
		void embed.then((orientation) => {
			if (orientation === 'portrait' && !thumbnailConfirmed) {
				publishSource({ orientation, aspectRatio: null }, ticket, videoId);
			}
		});
		try {
			const dimensions = await originalAspect(videoId);
			// Missing original-aspect frames can load a 120x90 placeholder.
			if (
				dimensions &&
				dimensions.width > 120 &&
				dimensions.height > 90 &&
				Number.isFinite(dimensions.width) &&
				Number.isFinite(dimensions.height)
			) {
				thumbnailConfirmed = true;
				publishSource(
					{
						orientation: dimensions.height > dimensions.width ? 'portrait' : 'landscape',
						aspectRatio: dimensions.width / dimensions.height
					},
					ticket,
					videoId
				);
				return;
			}
		} catch {
			// Image loading is optional and must not affect playback.
		}
		const orientation = (await embed) ?? 'landscape';
		// Landscape embed dimensions are inconclusive and must not be cached alone.
		if (orientation !== 'portrait') publishSource({ orientation, aspectRatio: null }, ticket);
	}

	return {
		setSource(videoId: string, override: Orientation | null = null, force = false) {
			if (disposed || (videoId === currentId && !force)) return;
			currentId = videoId;
			const ticket = ++version;
			frameOverride = override;
			publish(override ?? 'landscape', override, { orientation: 'landscape', aspectRatio: null });
			void detect(videoId, ticket);
		},
		choose(orientation: Orientation) {
			if (disposed) return;
			frameOverride = orientation;
			publish(orientation, orientation);
		},
		dispose() {
			disposed = true;
			version += 1;
		}
	};
}
