import { controlsFeature, createTapGesture, playbackFeature } from '@videojs/core/dom';
import { createPlayer } from '@videojs/html';
import '@videojs/html/ui/controls';
import type { YouTubeVideoElement } from '@videojs/html/media/youtube-video';

const { PlayerElement } = createPlayer({ features: [playbackFeature, controlsFeature] });
export type WatchControlsPlayer = InstanceType<typeof PlayerElement>;

if (!customElements.get('youloop-controls-player')) {
	customElements.define('youloop-controls-player', PlayerElement);
}

export function attachWatchControls(
	root: WatchControlsPlayer,
	media: YouTubeVideoElement,
	container: HTMLElement,
	surface: HTMLElement,
	togglePlayback: () => void
) {
	// Only the chrome lives inside this provider. Attach the existing media explicitly,
	// without moving it or replacing YouLoop's playback state machine.
	const detach = root.store.attach({ media, container });
	// Video.js handles tap timing and interactive exclusions. Its recognizer does
	// not check travel/cancellation; reject native scrolling and drags without
	// preventing any document gesture or changing touch-action.
	let start: { id: number; x: number; y: number } | undefined;
	const signal = new AbortController();
	const invalidate = () => {
		start = undefined;
	};
	const moved = (event: PointerEvent) =>
		!start ||
		start.id !== event.pointerId ||
		Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8;
	surface.addEventListener(
		'pointerdown',
		(event) => {
			start =
				event.isPrimary && event.button === 0
					? { id: event.pointerId, x: event.clientX, y: event.clientY }
					: undefined;
		},
		{ passive: true, signal: signal.signal }
	);
	surface.addEventListener(
		'pointermove',
		(event) => {
			if (moved(event)) invalidate();
		},
		{ passive: true, signal: signal.signal }
	);
	window.addEventListener('scroll', invalidate, { passive: true, signal: signal.signal });
	surface.addEventListener('pointercancel', invalidate, { passive: true, signal: signal.signal });
	container.addEventListener('wheel', invalidate, { passive: true, signal: signal.signal });
	const stopGesture = createTapGesture(surface, (event) => {
		const genuineTap = !moved(event);
		invalidate();
		if (genuineTap) togglePlayback();
	});
	return () => {
		signal.abort();
		stopGesture();
		detach();
	};
}
