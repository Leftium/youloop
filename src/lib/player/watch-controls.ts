import { controlsFeature, playbackFeature } from '@videojs/core/dom';
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
	container: HTMLElement
) {
	// Only the chrome lives inside this provider. Attach the existing media explicitly,
	// without moving it or replacing YouLoop's playback state machine.
	const detach = root.store.attach({ media, container });
	return detach;
}
