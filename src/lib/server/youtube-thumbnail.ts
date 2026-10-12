const imageHosts = new Set(['i.ytimg.com', 'img.youtube.com']);
const maxPrefixBytes = 32 * 1024;

/**
 * Read only enough of a response to identify the metadata/header. YouTube watch
 * pages can exceed 1MB, but their social tags are near the start. Cancel the rest.
 */
async function readPrefix<T>(response: Response, identify: (bytes: Uint8Array) => T | null) {
	const reader = response.body?.getReader();
	if (!reader) return null;
	let bytes = new Uint8Array(0);
	try {
		while (bytes.length < maxPrefixBytes) {
			const chunk = await reader.read();
			if (chunk.done) break;
			const length = Math.min(chunk.value.length, maxPrefixBytes - bytes.length);
			const next = new Uint8Array(bytes.length + length);
			next.set(bytes);
			next.set(chunk.value.subarray(0, length), bytes.length);
			bytes = next;
			const result = identify(bytes);
			if (result !== null) return result;
		}
		return null;
	} finally {
		await reader.cancel().catch(() => {});
	}
}

function nativeImage(bytes: Uint8Array): string | null {
	const html = new TextDecoder().decode(bytes);
	for (const match of html.matchAll(/<meta\s+[^>]*>/gi)) {
		const tag = match[0];
		if (!/\bproperty\s*=\s*(["'])og:image\1/i.test(tag)) continue;
		const content = /\bcontent\s*=\s*(["'])(.*?)\1/i.exec(tag);
		if (content) return content[2].replaceAll('&amp;', '&');
	}
	return null;
}

/** JPEG SOF markers carry actual dimensions, unlike a HEAD response or URL name. */
function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
	if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
	let offset = 2;
	while (offset + 4 <= bytes.length) {
		if (bytes[offset++] !== 0xff) return null;
		while (bytes[offset] === 0xff) offset++;
		const marker = bytes[offset++];
		if (marker === 0xd9 || marker === 0xda) return null;
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
		if (offset + 2 > bytes.length) return null;
		const length = (bytes[offset] << 8) | bytes[offset + 1];
		if (length < 2 || offset + length > bytes.length) return null;
		if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
			return {
				height: (bytes[offset + 3] << 8) | bytes[offset + 4],
				width: (bytes[offset + 5] << 8) | bytes[offset + 6]
			};
		}
		offset += length;
	}
	return null;
}

/**
 * Best-effort native social image discovery; never synthesize signed transforms.
 * Only fixed YouTube endpoints and a same-video JPEG URL are requested. The
 * caller's deadline covers both reads; any failure leaves the oEmbed fallback.
 */
export async function resolveNativeThumbnail(
	videoId: string,
	fetcher: typeof fetch,
	signal: AbortSignal
): Promise<string | null> {
	if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
	try {
		const page = await fetcher(`https://www.youtube.com/watch?v=${videoId}`, {
			signal,
			redirect: 'error',
			// YouTube places social tags near the start for crawler requests; its
			// generic server-client response can put them hundreds of KB later.
			headers: { accept: 'text/html', 'user-agent': 'facebookexternalhit/1.1' }
		});
		if (!page.ok) {
			await page.body?.cancel();
			return null;
		}
		const raw = await readPrefix(page, nativeImage);
		if (!raw || raw.length > 2048) return null;
		const image = new URL(raw);
		if (
			image.protocol !== 'https:' ||
			!imageHosts.has(image.hostname) ||
			image.username ||
			image.password ||
			image.port ||
			!new RegExp(
				`^/vi/${videoId}/(?:hqdefault|mqdefault|sddefault|maxresdefault|hq720|oar2)\\.jpg$`
			).test(image.pathname)
		)
			return null;
		const response = await fetcher(image, {
			signal,
			redirect: 'error',
			headers: { accept: 'image/jpeg' }
		});
		if (!response.ok || !/^image\/jpeg(?:;|$)/i.test(response.headers.get('content-type') ?? '')) {
			await response.body?.cancel();
			return null;
		}
		const dimensions = await readPrefix(response, jpegDimensions);
		// Missing variants can return a 120x90 placeholder with HTTP 200.
		return dimensions && dimensions.width >= 320 && dimensions.height >= 180 ? image.href : null;
	} catch {
		// Native HTML is an optional hint, not a supported metadata API contract.
		return null;
	}
}
