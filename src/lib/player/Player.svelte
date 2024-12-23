<script lang="ts">
	import type { MediaPlayerElement } from 'vidstack/elements';
	import 'vidstack/bundle';
	import { onMount } from 'svelte';

	let player: MediaPlayerElement;

	const framerate = 30;
	const repeatA = 25;
	const repeatB = 38;

	let paused = true;
	let muted = false;
	let loop = true;
	let playbackRate = 100;

	onMount(() => {
		if (!player) {
			return;
		}

		const unsubscribe = player.subscribe((e) => {
			if (e.currentTime < repeatA || e.currentTime > repeatB) {
				if (!loop) {
					paused = true;
					player.paused = paused;
				} else {
					player.currentTime = repeatA;
				}
			}
		});

		return function () {
			unsubscribe();
		};
	});

	function togglePaused(e: MouseEvent) {
		paused = !paused;
		player.paused = paused;

		if (!paused && (player.currentTime < repeatA || player.currentTime > repeatB)) {
			player.currentTime = repeatA;
		}
	}

	function toggleFullscreen() {
		// TODO: Special case "fullscreen" for iOS on iPhone
		// https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API#browser_compatibility

		if (document.fullscreenElement) {
			document.exitFullscreen();
		} else {
			player.requestFullscreen();
		}
	}

	function toggleMute() {
		muted = !muted;
		player.muted = muted;
	}

	function toggleLoop() {
		loop = !loop;
	}

	function makeTogglePlaybackRate(rate?: number) {
		if (rate) {
			return function () {
				playbackRate = rate;
				player.playbackRate = playbackRate / 100;
			};
		} else {
			return function () {
				playbackRate /= 2;
				if (playbackRate < 25) {
					playbackRate = 200;
				}
				player.playbackRate = playbackRate / 100;
			};
		}
	}

	function makeStepFrame(numFrames: number) {
		return function () {
			player.currentTime += (numFrames * 1) / framerate;
		};
	}
</script>

<media-player bind:this={player} playsinline src="youtube/dt-SqNL4z3w">
	<media-provider onclick={togglePaused} role="none"></media-provider>

	<media-controls class="vds-controls">
		<div class="vds-controls-spacer"></div>
		<media-controls-group class="vds-controls-group">
			<button onclick={toggleFullscreen}>Fullscreen</button>
		</media-controls-group>
	</media-controls>
</media-player>

<div>
	<div role="group"><button onclick={togglePaused}>Play</button></div>

	<div role="group">
		<button onclick={makeStepFrame(-1)}>&lt;</button>
		<button onclick={makeStepFrame(1)}>&gt;</button>
	</div>

	<div role="group"><button onclick={toggleLoop}>Loop={loop}</button></div>

	<div role="group"><button onclick={toggleMute}>Muted={muted}</button></div>

	<div role="group">
		<button onclick={makeTogglePlaybackRate()}>Speed={playbackRate}%</button>
		<button onclick={makeTogglePlaybackRate(25)}>25%</button>
		<button onclick={makeTogglePlaybackRate(50)}>50%</button>
		<button onclick={makeTogglePlaybackRate(100)}>100%</button>
		<button onclick={makeTogglePlaybackRate(200)}>200%</button>
	</div>
</div>

<style>
	media-controls:global([role='group']) {
		display: flex;
		position: absolute;
	}

	media-controls-group.vds-controls-group {
		display: flex;
		flex-direction: row-reverse;
		flex-grow: 0;
	}

	/* Fix extra height on iOS: https://github.com/vidstack/player/issues/1445 */
	:global([data-media-player]) {
		contain: layout;
	}

	div [role='group'] {
		width: auto;

		button {
			margin-left: 1px;
		}
	}
</style>
