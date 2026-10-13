import { parseShareUrl, serializeShareUrl } from '../share-url.ts';
import { resolveNativeThumbnail } from './youtube-thumbnail.ts';

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
	maxLookupsPerMinute = 60,
	discoverThumbnail = resolveNativeThumbnail
} = {}) {
	const cache = new Map<string, { value: VideoMetadata | null; expires: number }>();
	const pending = new Map<string, Promise<VideoMetadata | null>>();
	let windowStart = now();
	let lookups = 0;

	async function lookup(videoId: string): Promise<VideoMetadata | null> {
		const endpoint = new URL('https://www.youtube.com/oembed');
		endpoint.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`);
		endpoint.searchParams.set('format', 'json');
		const signal = AbortSignal.timeout(timeoutMs);
		try {
			const response = await fetcher(endpoint, {
				signal,
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
				image:
					(await discoverThumbnail(videoId, fetcher, signal)) ??
					thumbnail(fields.thumbnail_url, videoId)
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

export const resolveVideo = createVideoMetadataResolver();

/** Picker lookups share the social resolver cache and return only validated preview fields. */
export async function videoMetadataResponse(
	videoId: string | null,
	resolve = resolveVideo
): Promise<Response> {
	if (!videoId || !videoIdPattern.test(videoId))
		return Response.json({ error: 'Invalid video ID' }, { status: 400 });
	const video = await resolve(videoId);
	return Response.json(
		video
			? { videoId, title: video.title, image: video.image }
			: { videoId, title: null, image: null },
		{ headers: { 'cache-control': video ? 'private, max-age=60' : 'no-store' } }
	);
}

/** Metadata shares playback's validated URL contract and canonical video identity. */
export async function resolveSocialMetadata(
	requestUrl: URL,
	resolve = resolveVideo
): Promise<SocialMetadata> {
	const result: SocialMetadata = {
		title: 'YouLoop',
		description: defaultDescription,
		image: `${siteOrigin}/icon-512.png`,
		url: new URL(requestUrl.pathname, siteOrigin).href,
		type: 'website'
	};
	const parsed = parseShareUrl(requestUrl);
	if (!parsed.ok) return result;
	const { videoId, start, end } = parsed.value;
	// Framing/playback controls do not define the social card's clip identity.
	result.url = new URL(serializeShareUrl({ videoId, start, end }), siteOrigin).href;
	const video = await resolve(videoId);
	if (video) {
		result.title = `${video.title} - YouLoop`;
		result.description = video.description;
		result.image = video.image;
		result.type = 'video.other';
	}
	return result;
}
