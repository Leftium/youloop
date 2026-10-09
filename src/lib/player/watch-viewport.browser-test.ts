import type { YouTubeVideoElement } from '@videojs/html/media/youtube-video';

/** Capture this before/after physical Safari gestures; desktop measurements cannot certify iOS. */
export function snapshot() {
	const root = document.scrollingElement!;
	const viewport = window.visualViewport;
	const media = document.querySelector<YouTubeVideoElement>('youtube-video');
	return {
		innerWidth: window.innerWidth,
		innerHeight: window.innerHeight,
		scrollX: window.scrollX,
		scrollY: window.scrollY,
		root: {
			scrollWidth: root.scrollWidth,
			clientWidth: root.clientWidth,
			scrollLeft: root.scrollLeft
		},
		viewport: viewport && {
			width: viewport.width,
			height: viewport.height,
			offsetLeft: viewport.offsetLeft,
			offsetTop: viewport.offsetTop,
			pageLeft: viewport.pageLeft,
			scale: viewport.scale
		},
		bounds: Object.fromEntries(
			[
				'.share-prototype',
				'.stage',
				'.player',
				'.media-canvas',
				'.watch-overlay',
				'.watch-timeline',
				'youtube-video'
			].map((selector) => [
				selector,
				document.querySelector(selector)?.getBoundingClientRect().toJSON()
			])
		),
		iframe: media?.shadowRoot?.querySelector('iframe')?.getBoundingClientRect().toJSON()
	};
}

// Run visibly on /s after metadata settles, at each portrait/landscape size and after reload.
export async function run() {
	const results: string[] = [];
	const check = (condition: boolean, name: string) => {
		if (!condition) throw new Error(`${name}: ${JSON.stringify(snapshot())}`);
		results.push(name);
	};
	const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 100));
	const page = document.querySelector<HTMLElement>('.share-prototype')!;
	const media = document.querySelector<YouTubeVideoElement>('youtube-video')!;
	const iframe = media.shadowRoot?.querySelector('iframe');
	const originalScroll = window.scrollY;
	const originalMode = page.dataset.mode;
	const originalPaused = media.paused;
	const viewport = window.visualViewport!;
	const properties = ['width', 'height', 'offsetLeft', 'offsetTop'] as const;
	const descriptors = properties.map((key) => Object.getOwnPropertyDescriptor(viewport, key));
	function noOverflow() {
		const current = snapshot();
		check(
			current.root.scrollWidth === current.root.clientWidth &&
				current.scrollX === 0 &&
				current.root.scrollLeft === 0,
			'Watch document has no horizontal scroll range'
		);
		for (const selector of ['.share-prototype', '.stage', '.player', '.media-canvas']) {
			const bounds = document.querySelector(selector)!.getBoundingClientRect();
			check(
				bounds.left >= -1 && bounds.right <= current.root.clientWidth + 1,
				`${selector} fits layout viewport`
			);
		}
	}
	function aligned() {
		const canvas = document.querySelector('.media-canvas')!.getBoundingClientRect();
		const overlay = document.querySelector('.watch-overlay')!.getBoundingClientRect();
		const timeline = document.querySelector('.watch-timeline')!.getBoundingClientRect();
		const left = Math.max(canvas.left, viewport.offsetLeft);
		const right = Math.min(canvas.right, viewport.offsetLeft + viewport.width);
		const bottom = Math.min(canvas.bottom, viewport.offsetTop + viewport.height);
		check(
			Math.abs(overlay.left - left) < 1 && Math.abs(overlay.right - right) < 1,
			'Overlay uses visible canvas horizontal coordinates'
		);
		check(
			Math.abs(timeline.left - left) < 1 &&
				Math.abs(timeline.right - right) < 1 &&
				Math.abs(timeline.bottom - bottom) < 1 &&
				timeline.height === 3,
			'Timeline matches visible canvas width and bottom edge'
		);
	}
	try {
		check(
			document.querySelectorAll('meta[name="viewport"]').length === 1,
			'One viewport declaration controls the document'
		);
		check(
			document.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.content ===
				'width=device-width, initial-scale=1',
			'Standard viewport avoids the physical iPhone cover clipping regression'
		);
		check(
			page.getBoundingClientRect().left === 0 &&
				page.getBoundingClientRect().width === document.scrollingElement!.clientWidth,
			'Watch root occupies layout viewport without gutters'
		);
		window.scrollTo({ left: 0, top: originalScroll + 80, behavior: 'instant' });
		await wait();
		const down = window.scrollY;
		check(
			down > originalScroll && page.dataset.mode === 'theater',
			'Vertical native document scrolling still enters Theater'
		);
		for (const left of [200, -200]) {
			window.scrollTo({ left, top: down, behavior: 'instant' });
			await wait();
			noOverflow();
		}
		window.scrollTo({ left: 0, top: originalScroll, behavior: 'instant' });
		await wait();
		check(
			page.dataset.mode === 'default',
			'Up scroll restores Default after horizontal scroll attempts'
		);
		aligned();
		const canvas = document.querySelector('.media-canvas')!.getBoundingClientRect().toJSON();
		const outer = document.querySelector('.player')!.getBoundingClientRect();
		check(
			Math.abs((canvas.left + canvas.right) / 2 - (outer.left + outer.right) / 2) < 1,
			'Canvas remains centered in player'
		);
		// A visual viewport may be narrower and displaced while the layout canvas stays unchanged.
		// This injected case checks coordinates, not Safari's physical panning implementation.
		Object.defineProperties(viewport, {
			width: { configurable: true, value: viewport.width - 40 },
			height: { configurable: true, value: Math.max(100, viewport.height - 60) },
			offsetLeft: { configurable: true, value: 20 },
			offsetTop: { configurable: true, value: 10 }
		});
		viewport.dispatchEvent(new Event('resize'));
		await wait();
		aligned();
		noOverflow();
		check(
			JSON.stringify(document.querySelector('.media-canvas')!.getBoundingClientRect().toJSON()) ===
				JSON.stringify(canvas),
			'Visual viewport changes never resize the media canvas'
		);
		check(
			media.shadowRoot?.querySelector('iframe') === iframe &&
				iframe?.getBoundingClientRect().height === 16000 &&
				media.paused === originalPaused,
			'Viewport and scroll changes preserve media identity, crop and playback state'
		);
		return results;
	} finally {
		properties.forEach((key, index) => {
			if (descriptors[index]) Object.defineProperty(viewport, key, descriptors[index]!);
			else Reflect.deleteProperty(viewport, key);
		});
		viewport.dispatchEvent(new Event('resize'));
		window.scrollTo({ left: 0, top: originalScroll + 80, behavior: 'instant' });
		await wait();
		window.scrollTo({ left: 0, top: originalScroll, behavior: 'instant' });
		await wait();
		if (originalMode === 'theater')
			document.querySelector<HTMLButtonElement>('[aria-label="Theater mode"]')!.click();
	}
}
