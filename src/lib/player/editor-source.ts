import { parseShareUrl, type ShareUrlState } from '../share-url.ts';

export type EditorSource = { videoId: string; clip?: ShareUrlState; startSeconds?: number };

// YouTube share links use seconds or h/m/s timestamps, unlike YouLoop's A~B grammar.
function parseYouTubeStart(raw: string | null): number | undefined {
	if (raw === null) return undefined;
	const seconds = /^(\d+(?:\.\d+)?)(?:s)?$/.exec(raw);
	const units = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(raw);
	if (!seconds && (!units || !units.slice(1).some(Boolean))) return undefined;
	const value = seconds
		? Number(seconds[1])
		: Number(units![1] ?? 0) * 3600 + Number(units![2] ?? 0) * 60 + Number(units![3] ?? 0);
	return Number.isFinite(value) ? value : undefined;
}

/** Plain YouTube sources keep existing source-change defaults; YouLoop links import options. */
export function parseEditorSource(text: string): EditorSource | undefined {
	const input = text.trim();
	const idPattern = /^[A-Za-z0-9_-]{11}$/;
	if (idPattern.test(input)) return { videoId: input };
	let url: URL;
	try {
		const address = /^(?:(?:www|m)\.)?(?:youtube\.com|youtu\.be)\//i.test(input)
			? `https://${input}`
			: input;
		url = new URL(address, 'https://youloop.invalid');
	} catch {
		return undefined;
	}
	if (!['https:', 'http:'].includes(url.protocol)) return undefined;
	if (
		[
			'youtube.com',
			'www.youtube.com',
			'm.youtube.com',
			'youtu.be',
			'www.youtu.be',
			'www.youtube-nocookie.com'
		].includes(url.hostname)
	) {
		const videoId = url.hostname.endsWith('youtu.be')
			? url.pathname.slice(1).split('/')[0]
			: (url.searchParams.get('v') ?? /^\/(?:shorts|embed|v)\/([^/]+)/.exec(url.pathname)?.[1]);
		if (!videoId || !idPattern.test(videoId)) return undefined;
		const startSeconds = parseYouTubeStart(url.searchParams.get('t'));
		return startSeconds === undefined ? { videoId } : { videoId, startSeconds };
	}
	// The canonical codec validates compatible watch/editor paths and all imported options.
	if (!input.startsWith('/') && !/^https?:\/\//i.test(input)) return undefined;
	const parsed = parseShareUrl(input);
	return parsed.ok ? { videoId: parsed.value.videoId, clip: parsed.value } : undefined;
}
