import { parseShareUrl, type ShareUrlState } from '../share-url.ts';

export type EditorSource = { videoId: string; clip?: ShareUrlState };

/** Plain YouTube sources keep existing source-change defaults; YouLoop links import options. */
export function parseEditorSource(text: string): EditorSource | undefined {
	const input = text.trim();
	const idPattern = /^[A-Za-z0-9_-]{11}$/;
	if (idPattern.test(input)) return { videoId: input };
	let url: URL;
	try {
		url = new URL(input, 'https://youloop.invalid');
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
		return videoId && idPattern.test(videoId) ? { videoId } : undefined;
	}
	// The canonical codec validates compatible watch/editor paths and all imported options.
	if (!input.startsWith('/') && !/^https?:\/\//i.test(input)) return undefined;
	const parsed = parseShareUrl(input);
	return parsed.ok ? { videoId: parsed.value.videoId, clip: parsed.value } : undefined;
}
