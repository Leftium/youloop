<script lang="ts">
	import type { MediaPlayerElement } from 'vidstack/elements';
	import 'vidstack/bundle';
	import 'vidstack/icons';
	import { onMount } from 'svelte';

	let player: MediaPlayerElement;

	const framerate = 30;
	const repeatA = 25;
	const repeatB = 40;

	onMount(() => {
		if (!player) {
			return;
		}

		const unsubscribe = player.subscribe((e) => {
			if (e.currentTime < repeatA || e.currentTime > repeatB) {
				player.currentTime = repeatA;
			}
		});

		return function () {
			unsubscribe();
		};
	});

	function onclick(e: MouseEvent) {
		if (e.shiftKey) {
			player.currentTime += 1 / framerate;
		} else {
			player.paused = !player.paused;
		}
	}
</script>

<media-player bind:this={player} playsInline src="youtube/dt-SqNL4z3w">
	<media-provider {onclick} role="none"></media-provider>

	<media-controls class="vds-controls">
		<div class="vds-controls-spacer"></div>
		<media-controls-group class="vds-controls-group">
			<media-fullscreen-button class="vds-button">
				<media-icon type="fullscreen" class="fs-enter-icon vds-icon"></media-icon>
				<media-icon type="fullscreen-exit" class="fs-exit-icon vds-icon"></media-icon>
			</media-fullscreen-button>
		</media-controls-group>
	</media-controls>
</media-player>

<style>
	.vds-controls-group {
		display: flex;
		flex-direction: row-reverse;
	}

	:global(.vds-button[data-active] .fs-enter-icon),
	.vds-button:not([data-active]) .fs-exit-icon {
		display: none;
	}
</style>
