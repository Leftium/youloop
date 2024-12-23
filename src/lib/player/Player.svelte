<script lang="ts">
	import type { MediaPlayerElement } from 'vidstack/elements';
	import 'vidstack/bundle';
	import { onMount } from 'svelte';

	import IcRoundPlayArrow from '~icons/ic/round-play-arrow';
	import IcRoundPause from '~icons/ic/round-pause';

	import IcRoundSpeed from '~icons/ic/round-speed';

	import IcRoundVolumeOff from '~icons/ic/round-volume-off';
	import IcRoundVolumeUp from '~icons/ic/round-volume-up';

	import IcRoundSkipNext from '~icons/ic/round-skip-next';
	import IcRoundSkipPrevious from '~icons/ic/round-skip-previous';

	import FluentArrowRepeat from '~icons/fluent/arrow-repeat-all-24-filled';
	import FluentArrowRepeatOff from '~icons/fluent/arrow-repeat-all-off-24-filled';

	import IcRoundFullscreen from '~icons/ic/round-fullscreen';
	import IcRoundFullscreenExit from '~icons/ic/round-fullscreen-exit';

	let player: MediaPlayerElement;

	const framerate = 30;

	let repeatA = 25;
	let repeatB = 38;

	let currentTime = 0;
	let paused = true;
	let muted = false;
	let loop = true;
	let playbackRate = 100;

	let fullscreen = false;

	onMount(() => {
		if (!player) {
			alert('No Player');
		}
		const unsubscribe = player.subscribe((e) => {
			currentTime = e.currentTime;
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
			fullscreen = false;
		} else {
			player.requestFullscreen();
			fullscreen = true;
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
			paused = player.paused = true;
			player.currentTime += (numFrames * 1) / framerate;
		};
	}

	function oninput() {
		player.currentTime = currentTime;
		if (currentTime < repeatA) {
			repeatA = currentTime;
		}
		if (currentTime > repeatB) {
			repeatB = currentTime;
		}
	}
</script>

<media-player bind:this={player} playsinline src="youtube/dt-SqNL4z3w">
	<media-provider onclick={togglePaused} role="none"></media-provider>

	<media-controls class="vds-controls">
		<div class="vds-controls-spacer"></div>
		<media-controls-group class="vds-controls-group">
			<button onclick={toggleFullscreen}>
				{#if fullscreen}
					<IcRoundFullscreenExit />
				{:else}
					<IcRoundFullscreen />
				{/if}
			</button>
		</media-controls-group>
	</media-controls>
</media-player>

<div class="controls">
	<div role="group">
		{#key paused}
			<button onclick={togglePaused}>
				{#if paused}
					<IcRoundPlayArrow />
				{:else}
					<IcRoundPause />
				{/if}
			</button>
		{/key}
	</div>

	<div role="group">
		<button onclick={makeStepFrame(-1)}><IcRoundSkipPrevious /></button>
		<button onclick={makeStepFrame(1)}><IcRoundSkipNext /></button>
	</div>

	<div role="group">
		{#key loop}
			<button onclick={toggleLoop}>
				{#if loop}
					<FluentArrowRepeat />
				{:else}
					<FluentArrowRepeatOff />
				{/if}
			</button>
		{/key}
	</div>

	<div role="group">
		{#key muted}
			<button onclick={toggleMute}>
				{#if muted}
					<IcRoundVolumeOff />
				{:else}
					<IcRoundVolumeUp />
				{/if}
			</button>
		{/key}
	</div>

	<div role="group">
		<button onclick={makeTogglePlaybackRate()}> <IcRoundSpeed /></button>
		<button onclick={makeTogglePlaybackRate(25)} class:active={playbackRate === 25}
			>&frac14;x</button
		>
		<button onclick={makeTogglePlaybackRate(50)} class:active={playbackRate === 50}
			>&frac12;x</button
		>
		<button onclick={makeTogglePlaybackRate(100)} class:active={playbackRate === 100}>1x</button>
		<button onclick={makeTogglePlaybackRate(200)} class:active={playbackRate === 200}>2x</button>
	</div>

	<input
		type="range"
		name=""
		id=""
		min="0"
		step="0.01"
		{oninput}
		bind:value={currentTime}
		max={player?.duration || 0}
	/>
	{currentTime}

	<input
		type="range"
		name=""
		id=""
		min="0"
		step="0.01"
		bind:value={repeatA}
		max={player?.duration || 999}
	/>
	{repeatA}

	<input
		type="range"
		name=""
		id=""
		min="0"
		step="0.01"
		bind:value={repeatB}
		max={player?.duration || 999}
	/>
	{repeatB}
</div>

<style>
	media-controls:global([role='group']) {
		display: flex;
		position: absolute;

		media-controls-group.vds-controls-group {
			display: flex;
			flex-direction: row-reverse;
			flex-grow: 0;

			button {
				padding: 4px;
				border: none;
				background-color: rgba(0, 0, 0, 0);
			}
		}
	}

	/* Fix extra height on iOS: https://github.com/vidstack/player/issues/1445 */
	:global([data-media-player]) {
		contain: layout;
	}

	div [role='group'] {
		width: auto;

		button {
			padding-inline: 20px;
			padding-block: 16px;
			margin-left: 1px;

			:global(svg) {
				vertical-align: -0.23em;
			}

			&:global(.active) {
				font-weight: bold;
			}
		}
	}
</style>
