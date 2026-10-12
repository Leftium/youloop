const siteOrigin = 'https://youloop.leftium.com';
const defaultDescription = 'Watch and repeat YouTube segments with YouLoop.';
const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;

export interface SocialMetadata {
	title: string;
	description: string;
	image: string;
	url: string;
	type: 'website' | 'video.other';
}

interface VideoMetadata {
	title: string;
	description: string;
	image: string;
}

function text(value: unknown, limit: number): string {
	return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function thumbnail(value: unknown, videoId: string): string {
	const fallback = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
	if (typeof value !== 'string') return fallback;
	try {
		const url = new URL(value);
		if (
			url.protocol === 'https:' &&
			['i.ytimg.com', 'img.youtube.com'].includes(url.hostname) &&
			!url.username &&
			!url.password &&
			!url.port &&
			url.pathname.startsWith(`/vi/${videoId}/`)
		)
			return url.href;
	} catch {
		/* Untrusted thumbnail URLs use the known YouTube image path. */
	}
	return fallback;
}

/**
 * Cache lives only in a warm server instance. Concurrent requests for a video share
 * one lookup; failures have a short TTL. Limits apply per instance, not globally.
 */
export function createVideoMetadataResolver({
	fetcher = fetch,
	now = Date.now,
	timeoutMs = 2000,
	successTtlMs = 60 * 60 * 1000,
	failureTtlMs = 60 * 1000,
	maxEntries = 1000,
	maxConcurrent = 8,
	maxLookupsPerMinute = 60
} = {}) {
	const cache = new Map<string, { value: VideoMetadata | null; expires: number }>();
	const pending = new Map<string, Promise<VideoMetadata | null>>();
	let windowStart = now();
	let lookups = 0;

	async function lookup(videoId: string): Promise<VideoMetadata | null> {
		const endpoint = new URL('https://www.youtube.com/oembed');
		endpoint.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`);
		endpoint.searchParams.set('format', 'json');
		try {
			const response = await fetcher(endpoint, {
				signal: AbortSignal.timeout(timeoutMs),
				redirect: 'error',
				headers: { accept: 'application/json' }
			});
			if (!response.ok) return null;
			const data: unknown = await response.json();
			if (!data || typeof data !== 'object') return null;
			const fields = data as Record<string, unknown>;
			const title = text(fields.title, 300);
			if (!title) return null;
			const author = text(fields.author_name, 200);
			return {
				title,
				// YouTube oEmbed has no video description; attribution is a useful fallback.
				description:
					text(fields.description, 1000) ||
					(author
						? `Watch ${title} by ${author} and repeat segments with YouLoop.`
						: defaultDescription),
				image: thumbnail(fields.thumbnail_url, videoId)
			};
		} catch {
			return null;
		}
	}

	return async (videoId: string): Promise<VideoMetadata | null> => {
		if (!videoIdPattern.test(videoId)) return null;
		const time = now();
		const hit = cache.get(videoId);
		if (hit && hit.expires > time) {
			cache.delete(videoId);
			cache.set(videoId, hit);
			return hit.value;
		}
		cache.delete(videoId);
		const existing = pending.get(videoId);
		if (existing) return existing;
		if (time - windowStart >= 60_000) {
			windowStart = time;
			lookups = 0;
		}
		// Do not queue work when saturated: the page can still render safe defaults.
		if (pending.size >= maxConcurrent || lookups >= maxLookupsPerMinute) return null;
		lookups++;
		const request = lookup(videoId).then((value) => {
			cache.set(videoId, {
				value,
				expires: now() + (value ? successTtlMs : failureTtlMs)
			});
			while (cache.size > maxEntries) cache.delete(cache.keys().next().value!);
			pending.delete(videoId);
			return value;
		});
		pending.set(videoId, request);
		return request;
	};
}

const resolveVideo = createVideoMetadataResolver();

/** Keep legacy playable routes and clip bounds; UI flags do not define preview identity. */
export async function resolveSocialMetadata(
	requestUrl: URL,
	resolve = resolveVideo
): Promise<SocialMetadata> {
	const url = new URL(requestUrl.pathname, siteOrigin);
	const result: SocialMetadata = {
		title: 'YouLoop',
		description: defaultDescription,
		image: `${siteOrigin}/icon-512.png`,
		url: url.href,
		type: 'website'
	};
	if (!['/', '/s'].includes(requestUrl.pathname)) return result;
	const ids = requestUrl.searchParams.getAll('v');
	if (ids.length !== 1 || !videoIdPattern.test(ids[0])) return result;
	const videoId = ids[0];
	url.searchParams.set('v', videoId);
	const seconds = (key: string) => {
		const values = requestUrl.searchParams.getAll(key);
		if (values.length !== 1 || !/^\d+(?:\.\d+)?$/.test(values[0])) return undefined;
		const value = Number(values[0]);
		return Number.isFinite(value) ? value : undefined;
	};
	const start = seconds('a');
	const end = seconds('b');
	if (start !== undefined && start > 0) url.searchParams.set('a', String(start));
	if (end !== undefined && end > (start ?? 0)) url.searchParams.set('b', String(end));
	result.url = url.href;
	const video = await resolve(videoId);
	if (video) {
		result.title = `${video.title} - YouLoop`;
		result.description = video.description;
		result.image = video.image;
		result.type = 'video.other';
	}
	return result;
}
