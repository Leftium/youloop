<script lang="ts">
	import type { YouTubeVideoElement } from '@videojs/html/media/youtube-video';
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

	let player = $state<YouTubeVideoElement>(undefined!);
	let playerContainer: HTMLDivElement;

	const framerate = 30;

	// https://stackoverflow.com/a/27728417/117030
	const YOUTUBE_URL_ID_REGEX =
		/^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/|shorts\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]*).*/;

	// https://webapps.stackexchange.com/a/101153/1530
	const YOUTUBE_ID_REGEX = /[0-9A-Za-z_-]{10}[048AEIMQUYcgkosw]/;

	const YOUTUBE_ORIGINS = ['https://www.youtube-nocookie.com', 'https://www.youtube.com'];
	const YOUTUBE_STATE_UNSTARTED = -1;
	const YOUTUBE_STATE_PLAYING = 1;
	const YOUTUBE_STATE_CUED = 5;

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
	let playerError = $state('');
	let pauseAfterSeek = false;
	let initialFramePending = false;
	let retrySeekTime: number | undefined;
	let sourceVersion = $state(0);
	let playerMounted = $state(false);

	function youtubePlayerState() {
		const engine = player?.engine;
		return typeof engine?.getPlayerState === 'function' ? engine.getPlayerState() : undefined;
	}

	function youtubeStateIsStalled(state: unknown) {
		return state === YOUTUBE_STATE_UNSTARTED || state === YOUTUBE_STATE_CUED;
	}

	function recoverySeekTarget(time = player.currentTime) {
		const finiteTime = Number.isFinite(time) ? time : repeatA;
		const target = Math.max(repeatA, Math.min(repeatB, finiteTime));
		return target >= repeatB ? repeatA : target;
	}

	function pause() {
		retrySeekTime = undefined;
		player.pause();
	}

	function handleProviderMessage(event: MessageEvent) {
		if (!player || !YOUTUBE_ORIGINS.includes(event.origin)) return;
		const iframe = player.shadowRoot?.querySelector('iframe');
		if (!iframe || event.source !== iframe.contentWindow) return;

		try {
			const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
			const providerState = message?.info?.playerState;
			if (!paused && youtubeStateIsStalled(providerState)) {
				retrySeekTime = recoverySeekTarget();
				paused = true;
			}
		} catch {
			// Ignore unrelated or malformed provider messages.
		}
	}

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
		let disposed = false;
		// Register only in the browser; importing the element during SSR needs DOM globals.
		void import('@videojs/html/media/youtube-video').then(() => {
			if (!disposed) playerMounted = true;
		});
		const syncFullscreen = () => {
			fullscreen = document.fullscreenElement === playerContainer;
		};
		document.addEventListener('fullscreenchange', syncFullscreen);
		window.addEventListener('message', handleProviderMessage);
		return () => {
			disposed = true;
			document.removeEventListener('fullscreenchange', syncFullscreen);
			window.removeEventListener('message', handleProviderMessage);
		};
	});

	function seek(time: number, stayPaused = player.paused) {
		pauseAfterSeek = stayPaused;
		currentTime = Math.max(repeatA, Math.min(repeatB, time));
		if (retrySeekTime !== undefined) retrySeekTime = recoverySeekTarget(currentTime);
		player.currentTime = currentTime;
	}

	function handleMetadata() {
		if (!Number.isFinite(player.duration) || player.duration <= 0) return;
		const firstFrame = duration === undefined;
		duration = player.duration;
		repeatB = Math.min(repeatB, player.duration);
		repeatA = Math.max(0, Math.min(repeatA, repeatB));
		if (firstFrame) {
			player.muted = muted;
			player.playbackRate = playbackRate / 100;
			// YouTube needs playback to render a sought frame. Pause once that frame is ready.
			initialFramePending = true;
			seek(Math.max(repeatA, Math.min(1, repeatB)), true);
			void player.play().catch((error) => {
				playerError = `First frame unavailable: ${String(error)}`;
			});
		}
	}

	function handlePlaying() {
		if (retrySeekTime !== undefined) {
			const time = retrySeekTime;
			retrySeekTime = undefined;
			seek(time, false);
			// Reissue after playback starts; a cued-player seek can be ignored while
			// the adapter still caches its target and suppresses the same assignment.
			const engine = player.engine;
			if (typeof engine?.seekTo === 'function') engine.seekTo(time, true);
		}
		if (initialFramePending && !player.seeking) {
			initialFramePending = false;
			pauseAfterSeek = false;
			pause();
		}
	}

	function handleSeeked() {
		if (initialFramePending) {
			if (youtubePlayerState() === YOUTUBE_STATE_PLAYING) handlePlaying();
		} else if (pauseAfterSeek) {
			pauseAfterSeek = false;
			player.pause();
		}
		handleTimeUpdate();
	}

	function handleTimeUpdate() {
		if (duration === undefined || player.seeking) return;
		currentTime = player.currentTime;
		if (
			currentTime < repeatA ||
			currentTime > repeatB ||
			(!player.paused && currentTime >= repeatB)
		) {
			if (!loop) pause();
			seek(repeatA, !loop);
		}
	}

	// Seeking from YouTube's ended state can resume playback even with loop disabled.
	function handleEnded() {
		if (!loop) pause();
		seek(repeatA, !loop);
		if (loop) void play();
	}

	async function play() {
		pauseAfterSeek = false;
		initialFramePending = false;
		try {
			await player.play();
		} catch (error) {
			playerError = `Playback failed: ${String(error)}`;
		}
	}

	function togglePaused() {
		if (!player || duration === undefined) return;
		// The adapter can retain paused=false when YouTube returns to unstarted/cued.
		// Treat those states as a Play request so a stalled startup can be retried.
		const youtubeState = youtubePlayerState();
		if (paused || player.paused || youtubeStateIsStalled(youtubeState)) {
			if (youtubeStateIsStalled(youtubeState)) retrySeekTime = recoverySeekTarget();
			if (player.currentTime < repeatA || player.currentTime >= repeatB) seek(repeatA);
			void play();
		} else {
			pause();
		}
	}

	async function toggleFullscreen() {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else await playerContainer.requestFullscreen();
		} catch (error) {
			playerError = `Fullscreen unavailable: ${String(error)}`;
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
		if (repeatA > repeatB) repeatB = repeatA;
	}

	function setRepeatB() {
		repeatB = currentTime;
		if (repeatB < repeatA) repeatA = repeatB;
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
			pause();
			seek(player.currentTime + numFrames / framerate, true);
		};
	}

	function handleInputCurrentTime(event: Event) {
		currentTime = Number((event.currentTarget as HTMLInputElement).value);
		if (currentTime < repeatA) {
			repeatA = currentTime;
		}
		if (currentTime > repeatB) {
			repeatB = currentTime;
		}
		seek(currentTime);
	}

	function handleInputRepeatA(event: Event) {
		repeatA = Number((event.currentTarget as HTMLInputElement).value);
		if (repeatA > repeatB) {
			repeatB = repeatA;
		}
		seek(repeatA);
	}

	function handleInputRepeatB(event: Event) {
		repeatB = Number((event.currentTarget as HTMLInputElement).value);
		if (repeatB < repeatA) {
			repeatA = repeatB;
		}
		seek(repeatB);
	}

	async function pasteYoutubeId() {
		let clipboardText: string;
		try {
			clipboardText = await navigator.clipboard.readText();
		} catch (error) {
			youtubeIdResultMessage = `Clipboard unavailable: ${String(error)}`;
			return;
		}

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

		// Reset before the keyed media element loads the new source.
		duration = undefined;
		repeatA = 0;
		repeatB = 99999;
		currentTime = 1;
		paused = true;
		playbackRate = 100;
		playerError = '';
		pauseAfterSeek = false;
		initialFramePending = false;
		retrySeekTime = undefined;
		sourceVersion += 1;
	}
</script>

<div class="player" bind:this={playerContainer}>
	{#if playerMounted}
		{#key `${youtubeId}:${sourceVersion}`}
			<youtube-video
				bind:this={player}
				src={`https://www.youtube-nocookie.com/embed/${youtubeId}`}
				playsinline
				onloadedmetadata={handleMetadata}
				ondurationchange={handleMetadata}
				ontimeupdate={handleTimeUpdate}
				onseeked={handleSeeked}
				onended={handleEnded}
				onplay={() => (paused = false)}
				onplaying={handlePlaying}
				onpause={() => (paused = true)}
				onvolumechange={() => (muted = player.muted)}
				onratechange={() => (playbackRate = player.playbackRate * 100)}
				onerror={() => (playerError = player.error?.message ?? 'YouTube playback failed')}
			></youtube-video>
		{/key}
	{/if}

	<button
		class="video-toggle"
		aria-label={paused ? 'Play video' : 'Pause video'}
		onclick={togglePaused}
	></button>
	<button
		class="fullscreen"
		aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
		onclick={toggleFullscreen}
	>
		{#if fullscreen}<IcRoundFullscreenExit />{:else}<IcRoundFullscreen />{/if}
	</button>
</div>
{#if playerError}<p role="alert">{playerError}</p>{/if}

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
			aria-label="Current time"
			class="current-time"
			min="0"
			step="0.1"
			oninput={handleInputCurrentTime}
			bind:value={currentTime}
			max={duration}
		/>

		<input
			type="range"
			aria-label="Repeat start"
			class="repeat-a"
			min="0"
			step="0.1"
			oninput={handleInputRepeatA}
			bind:value={repeatA}
			max={duration}
		/>

		<input
			type="range"
			aria-label="Repeat end"
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
	<div class="controls" inert={duration === undefined}>
		<div class="nc-join" role="group">
			{#key paused}
				<button aria-label={paused ? 'Play' : 'Pause'} onclick={togglePaused}>
					{#if paused}
						<IcRoundPlayArrow />
					{:else}
						<IcRoundPause />
					{/if}
				</button>
			{/key}

			<button aria-label="Previous frame" onclick={makeStepFrame(-1)}
				><IcRoundSkipPrevious /></button
			>
			<button aria-label="Next frame" onclick={makeStepFrame(1)}><IcRoundSkipNext /></button>
		</div>

		<div class="ab-buttons nc-join" role="group">
			<button class="a-button" onclick={setRepeatA}>A</button>
			<button class="b-button" onclick={setRepeatB}>B</button>
		</div>

		<div class="nc-join" role="group">
			{#key loop}
				<button aria-label="Loop" aria-pressed={loop} onclick={toggleLoop}>
					{#if loop}
						<FluentArrowRepeat />
					{:else}
						<FluentArrowRepeatOff />
					{/if}
				</button>
			{/key}
		</div>

		<div class="nc-join" role="group">
			{#key muted}
				<button aria-label="Mute" aria-pressed={muted} onclick={toggleMute}>
					{#if muted}
						<IcRoundVolumeOff />
					{:else}
						<IcRoundVolumeUp />
					{/if}
				</button>
			{/key}
		</div>

		<div class="speed-buttons nc-join" role="group">
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

	.player {
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 9;
		background: black;
		contain: layout;
		overflow: hidden;
	}

	.player:fullscreen {
		width: 100%;
		height: 100%;
		aspect-ratio: auto;
	}

	youtube-video {
		display: block;
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
	}

	// Hide edge chrome and bottom captions, and reduce the paused-state gradient.
	// Keep the iframe centered: offsets expose letterboxing; 20x caused fullscreen artifacts.
	youtube-video::part(iframe) {
		position: absolute;
		top: 50%;
		left: 0;
		width: 100%;
		height: 1000%;
		transform: translateY(-50%);
	}

	.video-toggle {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		padding: 0;
		margin: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
	}

	.fullscreen {
		position: absolute;
		right: 0;
		bottom: 0;
		padding: 4px;
		margin: 0;
		border: 0;
		background: transparent;
		color: white;
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;

		gap: 5px;
		margin-bottom: 0.25em;
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

	div .nc-join {
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
