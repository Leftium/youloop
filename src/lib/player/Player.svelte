<script lang="ts">
	import type { MediaPlayerElement } from 'vidstack/elements';
	import 'vidstack/bundle';
	import { onMount, tick } from 'svelte';

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

	// https://stackoverflow.com/a/27728417/117030
	const YOUTUBE_URL_ID_REGEX =
		/^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/|shorts\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]*).*/;

	// https://webapps.stackexchange.com/a/101153/1530
	const YOUTUBE_ID_REGEX = /[0-9A-Za-z_-]{10}[048AEIMQUYcgkosw]/;

	interface Props {
		youtubeId: string | null;
		repeatA: number;
		repeatB: number;
	}

	let {
		youtubeId = $bindable('dt-SqNL4z3w'),
		repeatA = $bindable(25),
		repeatB = $bindable(38)
	}: Props = $props();

	if (youtubeId === null) {
		youtubeId = 'dt-SqNL4z3w';
	}

	if (repeatA > repeatB) {
		[repeatA, repeatB] = [repeatB, repeatA];
	}

	if (repeatB <= 0) {
		repeatB = 99999;
	}

	let currentTime = $state(repeatA);
	let duration: number | undefined = $state();
	let paused = $state(true);
	let muted = $state(false);
	let loop = $state(false);
	let playbackRate = $state(100);

	let youtubeIdResultMessage = $state('');

	let percentA = $derived(`${duration === undefined ? 0 : (repeatA / duration) * 100}%`);
	let percentB = $derived(`${100 - (duration === undefined ? 0 : (repeatB / duration) * 100)}%`);

	let fullscreen = $state(false);

	export function formatVideoTime(totalSeconds: number | undefined) {
		if (totalSeconds == undefined) {
			return '?:??';
		}
		const intSeconds = Math.floor(totalSeconds);

		// https://stackoverflow.com/a/34841026/117030
		var hours = Math.floor(intSeconds / 3600);
		var minutes = Math.floor(intSeconds / 60) % 60;
		var seconds = intSeconds % 60;

		return [hours, minutes, seconds]
			.map((v) => (v < 10 ? '0' + v : v))
			.filter((v, i) => v !== '00' || i > 0)
			.join(':')
			.replace(/^0/, '');
	}

	onMount(() => {
		if (!player) {
			alert('No Player');
		}

		player.addEventListener('error', (event) => {
			console.log('PLAYER ERROR');
			console.log(event);
		});

		const unsubscribe = player.subscribe((e) => {
			currentTime = e.currentTime;

			if (e.duration) {
				if (!duration) {
					// Start at non-zero value to force a video frame to show
					// Otherwise weird poster is shown.
					currentTime = player.currentTime = 1;
				}

				duration = e.duration - 1;
				if (repeatB > duration) {
					repeatB = duration;
				}
			}

			if (currentTime < repeatA || currentTime > repeatB) {
				player.currentTime = currentTime = repeatA;
				if (!loop) {
					paused = true;
					player.paused = paused;
				}
			}
		});

		return function () {
			unsubscribe();
		};
	});

	function togglePaused(e: MouseEvent) {
		player.paused = paused = !paused;

		if (!paused && (player.currentTime < repeatA || player.currentTime > repeatB)) {
			player.currentTime = currentTime = repeatA;
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
		player.muted = muted = !muted;
	}

	function toggleLoop() {
		loop = !loop;
	}

	function setRepeatA() {
		repeatA = currentTime;
	}

	function setRepeatB() {
		repeatB = currentTime;
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

	function handleInputCurrentTime() {
		player.currentTime = currentTime;
		if (currentTime < repeatA) {
			repeatA = currentTime;
		}
		if (currentTime > repeatB) {
			repeatB = currentTime;
		}
	}

	function handleInputRepeatA() {
		player.currentTime = currentTime = repeatA;
		if (repeatA > repeatB) {
			repeatB = repeatA;
		}
	}

	function handleInputRepeatB() {
		player.currentTime = currentTime = repeatB;
		if (repeatB < repeatA) {
			repeatA = repeatB;
		}
	}

	async function pasteYoutubeId() {
		const clipboardText = await navigator.clipboard.readText();

		const matchesUrl = clipboardText.match(YOUTUBE_URL_ID_REGEX);
		const matchesId = clipboardText.match(YOUTUBE_ID_REGEX);

		if (matchesUrl?.[1]) {
			youtubeId = matchesUrl[1];
			youtubeIdResultMessage = `Found from URL: ${youtubeId}`;
		} else if (matchesId?.[0]) {
			youtubeId = matchesId[0];
			youtubeIdResultMessage = `Found ID: ${youtubeId}`;
		} else {
			youtubeIdResultMessage = `No matches in "${clipboardText}"`;
			return;
		}

		await tick();
		// Reset and match settings for newly loaded video.
		duration = undefined;
		repeatA = 0;
		repeatB = 99999;
		currentTime = 1;
		player.currentTime = 1;
		paused = true;
		playbackRate = 100;
	}
</script>

<media-player bind:this={player} playsinline crossOrigin src="youtube/{youtubeId}">
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

<div class="timestamps">
	<div>{formatVideoTime(currentTime)} / {formatVideoTime(duration)}</div>
	<div>{formatVideoTime(repeatA)}A - {formatVideoTime(repeatB)}B</div>
</div>

<div class="wrap-sliders">
	<input type="range" />

	<div class="wrap-connector">
		<div class="connector" style:left={percentA} style:right={percentB}></div>
	</div>

	{#if duration}
		<input
			type="range"
			class="current-time"
			min="0"
			step="0.1"
			oninput={handleInputCurrentTime}
			bind:value={currentTime}
			max={duration}
		/>

		<input
			type="range"
			class="repeat-a"
			min="0"
			step="0.1"
			oninput={handleInputRepeatA}
			bind:value={repeatA}
			max={duration}
		/>

		<input
			type="range"
			class="repeat-b"
			min="0"
			step="0.1"
			oninput={handleInputRepeatB}
			bind:value={repeatB}
			max={duration}
		/>
	{/if}
</div>

<center>
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

			<button onclick={makeStepFrame(-1)}><IcRoundSkipPrevious /></button>
			<button onclick={makeStepFrame(1)}><IcRoundSkipNext /></button>
		</div>

		<div class="ab-buttons" role="group">
			<button class="a-button" onclick={setRepeatA}>A</button>
			<button class="b-button" onclick={setRepeatB}>B</button>
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

		<div class="speed-buttons" role="group">
			<button onclick={makeTogglePlaybackRate()}><IcRoundSpeed /></button>

			<button onclick={makeTogglePlaybackRate(200)}>
				<span class:active={playbackRate === 200}>2</span>
			</button>
			<button onclick={makeTogglePlaybackRate(100)}>
				<span class:active={playbackRate === 100}>1</span>
			</button>
			<button onclick={makeTogglePlaybackRate(50)}>
				<span class:active={playbackRate === 50}>&frac12;</span>
			</button>
			<button onclick={makeTogglePlaybackRate(25)}>
				<span class:active={playbackRate === 25}>&frac14;</span>
			</button>
		</div>
	</div>

	<button class="outline paste-button" onclick={pasteYoutubeId}
		>Load YouTube URL/ID from clipboard</button
	>
	<div>{youtubeIdResultMessage}</div>
</center>

<style lang="scss">
	// Pico color values (hardcoded from @picocss/pico v2.0.6 scss/colors/_index.scss)
	$grey-300: #ababab;
	$azure-250: #79c0ff;
	$azure-350: #01aaff;
	$indigo-300: #b0a3e8;
	$red-550: #c52f21;
	// Original youloop used zinc palette for custom player buttons:
	$zinc-550: #646b79; // button bg (Pico zinc theme --pico-primary-background)
	$zinc-600: #5c6370; // button hover
	$slate-100: #dfe3eb; // --pico-range-border-color (track)

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
				background-color: transparent;
			}
		}
	}

	/* Fix extra height on iOS: https://github.com/vidstack/player/issues/1445 */
	media-player:global([data-media-player]) {
		contain: layout;
	}

	/*
	media-provider {
		overflow: hidden;
		width: 100%;
		// Keep it the right aspect-ratio
		aspect-ratio: 16/9;
		// No clicking/hover effects
		pointer-events: none;
	}

	media-provider :global(iframe) {
		// Extend it beyond the viewport...
		width: 300%;
		height: 100%;
		// ...and bring it back again
		margin-left: -100%;
	}
    */

	.controls {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;

		gap: 5px;
	}

	.timestamps {
		display: flex;
		justify-content: space-between;

		font-family: Lato, sans-serif;
	}

	.wrap-sliders {
		position: relative;

		// Pico range slider values:
		height: 1.25rem;
		margin-bottom: var(--nc-spacing);

		.wrap-connector {
			position: absolute;
			top: 0;
			bottom: 0;

			// Shrink width by half of slider thumb on each side.
			left: calc(1.25rem / 2);
			right: calc(1.25rem / 2);

			.connector {
				position: absolute;
				top: 0;
				bottom: 0;
				background-color: $grey-300;
			}
		}

		input[type='range'] {
			// Match Pico's range input dimensions exactly:
			// track: 0.375rem tall, thumb: 1.25rem diameter
			-webkit-appearance: none;
			-moz-appearance: none;
			appearance: none;
			background: none;
			margin: 0;
			padding: 0;
			width: 100%;
			height: 1.25rem; // = thumb height

			// Base track styling (visible on the first slider)
			&::-webkit-slider-runnable-track {
				width: 100%;
				height: 0.375rem;
				border-radius: 0.1875rem;
				background-color: $slate-100; // exact Pico range-border-color
			}
			&::-moz-range-track {
				width: 100%;
				height: 0.375rem;
				border-radius: 0.1875rem;
				background-color: $slate-100;
			}

			// Base thumb styling
			&::-webkit-slider-thumb {
				-webkit-appearance: none;
				width: 1.25rem;
				height: 1.25rem;
				border-radius: 50%;
				border: 2px solid transparent;
				background-color: var(--nc-primary);
				cursor: pointer;
				margin-top: #{(-(1.25rem * 0.5) + (0.375rem * 0.5))}; // center on track
			}
			&::-moz-range-thumb {
				width: 1.25rem;
				height: 1.25rem;
				border-radius: 50%;
				border: 2px solid transparent;
				background-color: var(--nc-primary);
				cursor: pointer;
			}

			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			pointer-events: none; // Prevent direction interaction.

			// Just want track; hide thumb of first slider.
			@mixin hide-thumb-first-slider {
				display: none;
				pointer-events: none;
				background-color: transparent;
			}
			&:first-child::-webkit-slider-thumb {
				@include hide-thumb-first-slider;
			}
			&:first-child::-moz-range-thumb {
				@include hide-thumb-first-slider;
			}

			// Hide tracks of other sliders.
			&:not(:first-child)::-webkit-slider-runnable-track {
				background: transparent;
			}
			&:not(:first-child)::-moz-range-track {
				background: transparent;
			}

			@mixin slider-thumb {
				pointer-events: all; // Re-enable interaction.
				background-color: $azure-250;
				border-color: transparent;
			}
			&::-webkit-slider-thumb {
				@include slider-thumb;
			}
			&::-moz-range-thumb {
				@include slider-thumb;
				width: 1rem;
				height: 1rem;
			}

			@mixin slider-thumb-b {
				background-color: $indigo-300;
			}
			&.repeat-b::-webkit-slider-thumb {
				@include slider-thumb-b;
			}
			&.repeat-b::-moz-range-thumb {
				@include slider-thumb-b;
			}

			@mixin current-time-slider-track {
				pointer-events: all; // Re-enable interaction.
				height: 1.25rem;
			}
			&.current-time::-webkit-slider-runnable-track {
				@include current-time-slider-track;
			}
			&.current-time::-moz-range-track {
				position: relative;
				@include current-time-slider-track;
			}

			@mixin current-time-slider-thumb {
				width: 1rem;
				height: 1rem;
				margin-top: 0.125rem; // center 1rem thumb in 1.25rem track: (1.25 - 1) / 2
				border-color: transparent;
				background-color: $red-550;

				position: relative;
				z-index: 1000 !important;
			}
			&.current-time::-webkit-slider-thumb {
				@include current-time-slider-thumb;
			}
			&.current-time::-moz-range-thumb {
				@include current-time-slider-thumb;
				width: 0.75rem;
				height: 0.75rem;
			}

			// Adjust width of slider to account for smaller thumb radius.
			&.current-time {
				padding-inline: 2px;
			}

			// Scale thumb on drag (matches Pico's :active behavior)
			&:active::-webkit-slider-thumb {
				transform: scale(1.25);
			}
			&:active::-moz-range-thumb {
				transform: scale(1.25);
			}
		}
	}

	div [role='group'] {
		width: auto;
		border-radius: var(--nc-radius);
		overflow: hidden;

		button {
			padding-inline: 18px;
			padding-block: 16px;
			margin: 0;
			background-color: $zinc-550;
			color: white;
			border: none;
			border-radius: 0;

			&:hover {
				background-color: $zinc-600;
			}

			:global(svg) {
				vertical-align: -0.23em;
			}
		}

		&.ab-buttons button {
			font-weight: 600;
		}

		.a-button {
			color: $azure-350;
		}

		.b-button {
			color: $indigo-300;
		}

		&.speed-buttons {
			button:not(:first-child) {
				span {
					font-weight: 900;
					opacity: 40%;
				}
			}

			:global(.active) {
				opacity: 100% !important;
			}
		}
	}

	// Paste button — neutral outline (matching Pico's secondary outline look)
	.paste-button {
		color: var(--nc-text);
		border-color: var(--nc-border);

		&:hover {
			background-color: var(--nc-surface-2);
			color: var(--nc-text);
			border-color: var(--nc-text);
		}
	}
</style>
