import { controlsFeature, createTapGesture, playbackFeature } from '@videojs/core/dom';
import { createPlayer, PlayButtonElement } from '@videojs/html';
import '@videojs/html/ui/controls';
import type { YouTubeVideoElement } from '@videojs/html/media/youtube-video';

const { PlayerElement } = createPlayer({ features: [playbackFeature, controlsFeature] });
export type WatchControlsPlayer = InstanceType<typeof PlayerElement>;

// Keep Video.js button semantics, but let YouLoop own startup recovery and A/B playback.
class WatchPlayButton extends PlayButtonElement {
	protected override activate(): Promise<void> {
		this.dispatchEvent(new CustomEvent('playbackrequest', { bubbles: true }));
		return Promise.resolve();
	}
}

if (!customElements.get('youloop-controls-player')) {
	customElements.define('youloop-controls-player', PlayerElement);
	customElements.define('youloop-play-button', WatchPlayButton);
}

export function attachWatchControls(
	root: WatchControlsPlayer,
	media: YouTubeVideoElement,
	container: HTMLElement,
	surface: HTMLElement
) {
	// Only the chrome lives inside this provider. Attach the existing media explicitly,
	// without moving it or replacing YouLoop's playback state machine.
	const detach = root.store.attach({ media, container });
	const stopGesture = createTapGesture(surface, (event) => {
		// 10.0.1's controlsFeature marks mouse pointerup active. Let this background
		// gesture own the tap before that ancestor handler can undo its visibility toggle.
		event.stopPropagation();
		root.store.toggleControls();
	});
	return () => {
		stopGesture();
		detach();
	};
}
