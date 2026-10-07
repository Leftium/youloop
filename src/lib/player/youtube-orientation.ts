export type Orientation = 'landscape' | 'portrait';

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
const cache = new Map<string, Orientation>();

export function parseOrientation(value: string | null): Orientation | null {
	return value === 'portrait' || value === 'landscape' ? value : null;
}

export function createOrientationController(
	publish: (orientation: Orientation, override: Orientation | null) => void,
	request: Fetch = fetch,
	results = cache,
	originalAspect = loadOriginalAspect
) {
	let currentId: string | null = null;
	let version = 0;
	let disposed = false;

	async function detect(videoId: string, ticket: number) {
		let orientation: Orientation = 'landscape';
		const cached = results.get(videoId);
		if (cached) {
			if (!disposed && ticket === version) publish(cached, null);
			return;
		}
		let successful = false;
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
			orientation = height > width ? 'portrait' : 'landscape';
			successful = true;
		} catch {
			// Direct browser requests can fail; manual controls remain available.
		}
		if (orientation === 'landscape') {
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
					orientation = dimensions.height > dimensions.width ? 'portrait' : 'landscape';
					successful = true;
				}
			} catch {
				// Image loading is optional and must not affect playback.
			}
		}
		if (successful) results.set(videoId, orientation);
		if (!disposed && ticket === version) publish(orientation, null);
	}

	return {
		setSource(videoId: string, override: Orientation | null = null, force = false) {
			if (disposed || (videoId === currentId && !force)) return;
			currentId = videoId;
			const ticket = ++version;
			publish(override ?? 'landscape', override);
			if (!override) void detect(videoId, ticket);
		},
		choose(orientation: Orientation) {
			if (disposed) return;
			version += 1;
			publish(orientation, orientation);
		},
		dispose() {
			disposed = true;
			version += 1;
		}
	};
}
