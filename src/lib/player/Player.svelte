<script lang="ts">
	import type { WatchControlsPlayer } from './watch-controls';
	import type { YouTubeVideoElement } from '@videojs/html/media/youtube-video';
	import { onMount } from 'svelte';
	import { excludeYouTubeProviderFocus } from './youtube-provider-focus';
	import { calculateFrameVideoWidth } from './video-framing';
	import { placeWatchControls, placeWatchTitle } from './watch-controls-placement';
	import { createTimelineMode, timelineRange, type TimelineMode } from './watch-timeline';

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
	import IcRoundCropLandscape from '~icons/ic/round-crop-landscape';
	import IcRoundCropPortrait from '~icons/ic/round-crop-portrait';

	let player = $state<YouTubeVideoElement>(undefined!);
	let playerContainer: HTMLDivElement;
	let mediaCanvas: HTMLDivElement;
	let videoSurface = $state<HTMLDivElement>(undefined!);
	let controlsPlayer = $state<WatchControlsPlayer>();
	let controlsModule = $state<typeof import('./watch-controls')>();
	let nativeFullscreen = $state(false);
	let videoTitle = $state('');
	let watchTitle = $state<HTMLHeadingElement>();
	let titlePlacement = $state({ left: 0, top: 0, width: 0, maxHeight: 0, mode: 'video' });
	let controlsRegion = $state<HTMLDivElement>();
	let watchControls = $state<HTMLElement>();
	let controlsBounds = $state({ left: 0, top: 0, width: 0, height: 0 });
	let controlsPlacement = $state({ left: 0, top: 0, width: 0, height: 44, mode: 'video' });
	let visibleBounds = $state({ left: 0, top: 0, width: 0, height: 0 });

	const framerate = 30;

	// https://stackoverflow.com/a/27728417/117030
	const YOUTUBE_URL_ID_REGEX =
		/^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/|shorts\/)|(?:(?:watch)?\?v(?:i)?=|&v(?:i)?=))([^#&?]*).*/;

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
		orientation?: 'landscape' | 'portrait';
		fillFrame?: boolean;
		sourceAspectRatio?: number;
		minimal?: boolean;
		theater?: boolean;
		controlPageVisible?: boolean;
		ontheater?: () => void;
		onfillchange?: (fill: boolean) => void;
		onorientationchange?: (orientation: 'landscape' | 'portrait') => void;
		onsourcechange?: (videoId: string) => void;
	}

	let {
		youtubeId = $bindable('dt-SqNL4z3w'),
		repeatA = $bindable(25),
		repeatB = $bindable(38),
		orientation = $bindable('landscape'),
		fillFrame = false,
		sourceAspectRatio = 16 / 9,
		minimal = false,
		theater = false,
		controlPageVisible = false,
		ontheater,
		onfillchange,
		onorientationchange,
		onsourcechange
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
	const timelineChoice = createTimelineMode();
	let timelineMode = $state<TimelineMode>('video');
	let range = $derived(timelineRange(duration, repeatA, repeatB, currentTime));
	let clipTimeline = $derived(range.restricted && timelineMode === 'clip');
	let timelineTime = $derived(clipTimeline ? range.elapsed : range.absolute);
	let timelineDuration = $derived(clipTimeline ? range.length : range.total);
	function toggleTimeline() {
		if (range.restricted) timelineMode = timelineChoice.toggle();
	}
	let paused = $state(true);
	let requestedPaused = true;
	let providerStalled = false;
	let muted = $state(false);
	let loop = $state(false);
	let playbackRate = $state(100);

	let youtubeIdResultMessage = $state('');

	let percentA = $derived(`${duration === undefined ? 0 : (repeatA / duration) * 100}%`);
	let percentB = $derived(`${100 - (duration === undefined ? 0 : (repeatB / duration) * 100)}%`);

	let fullscreen = $state(false);
	let canvasWidth = $state(0);
	let canvasHeight = $state(0);
	let frameVideoWidth = $derived(
		calculateFrameVideoWidth(canvasWidth, canvasHeight, sourceAspectRatio, fillFrame)
	);
	let playerError = $state('');
	let pauseAfterSeek = false;
	let initialFramePending = false;
	let bootstrapMuted = false;
	let metadataReceived = $state(false);
	let firstFrameReady = false;
	let durationTimer: ReturnType<typeof setTimeout> | undefined;
	let retrySeekTime: number | undefined;
	let sourceVersion = $state(0);
	let playerMounted = $state(false);

	$effect(() => {
		// Source identity, not time/range updates, resets the viewer's visual choice.
		void youtubeId;
		void sourceVersion;
		timelineChoice.reset();
		timelineMode = 'video';
	});

	let wasTheater = false;
	$effect(() => {
		if (minimal && wasTheater && !theater) controlsPlayer?.store.toggleControls(true);
		wasTheater = theater;
	});

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
		initialFramePending = false;
		requestedPaused = true;
		providerStalled = false;
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
			if (!requestedPaused && youtubeStateIsStalled(providerState)) {
				providerStalled = true;
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
		if (minimal) {
			void import('./watch-controls').then((module) => {
				if (!disposed) controlsModule = module;
			});
		}
		nativeFullscreen = !!(
			document.fullscreenEnabled &&
			typeof playerContainer.requestFullscreen === 'function' &&
			typeof document.exitFullscreen === 'function'
		);
		const syncFullscreen = () => {
			fullscreen = document.fullscreenElement === playerContainer;
		};
		document.addEventListener('fullscreenchange', syncFullscreen);
		window.addEventListener('message', handleProviderMessage);
		return () => {
			disposed = true;
			clearTimeout(durationTimer);
			document.removeEventListener('fullscreenchange', syncFullscreen);
			window.removeEventListener('message', handleProviderMessage);
		};
	});

	$effect(() => {
		if (!minimal || !player || !controlsPlayer || !controlsModule) return;
		return controlsModule.attachWatchControls(
			controlsPlayer,
			player,
			playerContainer,
			videoSurface,
			togglePaused
		);
	});

	$effect(() => {
		if (!minimal || !controlsPlayer) return;
		const root = controlsPlayer;
		const store = root.store;
		let release: (() => void) | undefined;
		const focusIn = (event: FocusEvent) => {
			// Keep controls visible for keyboard navigation, without locking them after a pointer click.
			if ((event.target as Element).matches(':focus-visible')) {
				release?.();
				release = store.requestControlsLock();
			}
		};
		const focusOut = () => {
			release?.();
			release = undefined;
		};
		root.addEventListener('focusin', focusIn);
		root.addEventListener('focusout', focusOut);
		return () => {
			focusOut();
			root.removeEventListener('focusin', focusIn);
			root.removeEventListener('focusout', focusOut);
		};
	});

	$effect(() => {
		if (!minimal || !controlsRegion || !watchControls) return;
		const region = controlsRegion;
		const controls = watchControls;
		const title = watchTitle;
		let frame = 0;
		function measureVisibleVideo() {
			frame = 0;
			const canvas = mediaCanvas.getBoundingClientRect();
			const outer = playerContainer.getBoundingClientRect();
			const viewport = window.visualViewport;
			const left = Math.max(canvas.left, viewport?.offsetLeft ?? 0);
			const top = Math.max(canvas.top, viewport?.offsetTop ?? 0);
			const right = Math.min(
				canvas.right,
				(viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth)
			);
			const bottom = Math.min(
				canvas.bottom,
				(viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight)
			);
			visibleBounds = {
				left: left - outer.left,
				top: top - outer.top,
				width: Math.max(0, right - left),
				height: Math.max(0, bottom - top)
			};
			const regionLeft = Math.max(outer.left, viewport?.offsetLeft ?? 0);
			const regionTop = Math.max(outer.top, viewport?.offsetTop ?? 0);
			controlsBounds = {
				left: regionLeft - outer.left,
				top: regionTop - outer.top,
				width: Math.max(
					0,
					Math.min(
						outer.right,
						(viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth)
					) - regionLeft
				),
				height: Math.max(
					0,
					Math.min(
						outer.bottom,
						(viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight)
					) - regionTop
				)
			};
			const padding = getComputedStyle(region);
			const time = controls.querySelector('.watch-time')!.getBoundingClientRect();
			const actions = controls.querySelector('.watch-actions')!.getBoundingClientRect();
			const safe = {
				left: parseFloat(padding.paddingLeft),
				top: parseFloat(padding.paddingTop),
				right: controlsBounds.width - parseFloat(padding.paddingRight),
				bottom: controlsBounds.height - parseFloat(padding.paddingBottom)
			};
			const video = {
				left: left - regionLeft,
				top: top - regionTop,
				right: right - regionLeft,
				bottom: bottom - regionTop
			};
			controlsPlacement = placeWatchControls(safe, video, {
				time: time.width,
				actions: actions.width,
				height: Math.max(time.height, actions.height)
			});
			if (title) {
				// Measure each candidate at its own width. Reusing the currently rendered
				// height can alternate forever between a one-line fallback and a wrapped gutter.
				const previousWidth = title.style.width;
				const previousMaxHeight = title.style.maxHeight;
				title.style.maxHeight = 'none';
				titlePlacement = placeWatchTitle(safe, video, controlsPlacement, (width) => {
					title.style.width = `${width}px`;
					return title.scrollHeight;
				});
				title.style.width = previousWidth;
				title.style.maxHeight = previousMaxHeight;
			}
		}
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(measureVisibleVideo);
		};
		const observer = new ResizeObserver(schedule);
		observer.observe(mediaCanvas);
		observer.observe(playerContainer);
		observer.observe(region);
		if (title) observer.observe(title);
		observer.observe(controls.querySelector('.watch-time')!);
		observer.observe(controls.querySelector('.watch-actions')!);
		window.addEventListener('resize', schedule);
		window.addEventListener('scroll', schedule, { passive: true });
		window.visualViewport?.addEventListener('resize', schedule);
		window.visualViewport?.addEventListener('scroll', schedule);
		schedule();
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			window.removeEventListener('resize', schedule);
			window.removeEventListener('scroll', schedule);
			window.visualViewport?.removeEventListener('resize', schedule);
			window.visualViewport?.removeEventListener('scroll', schedule);
		};
	});

	function readVideoTitle() {
		if (!minimal) return;
		const engine = player?.engine as
			{ getVideoData?: () => { title?: string } | undefined; videoTitle?: string } | undefined;
		const title = engine?.getVideoData?.()?.title || engine?.videoTitle;
		if (typeof title === 'string') videoTitle = title;
	}

	function seek(time: number, stayPaused = player.paused) {
		pauseAfterSeek = stayPaused;
		currentTime = Math.max(repeatA, Math.min(repeatB, time));
		if (retrySeekTime !== undefined) retrySeekTime = recoverySeekTarget(currentTime);
		player.currentTime = currentTime;
	}

	function publishDuration() {
		// YouTube's cued duration can be rounded. Read the post-playback value,
		// and wait for a quiet interval before showing the first timeline.
		const nextDuration = player.engine?.getDuration() ?? player.duration;
		if (!Number.isFinite(nextDuration) || nextDuration <= 0) return;
		duration = nextDuration;
		repeatB = Math.min(repeatB, nextDuration);
		repeatA = Math.max(0, Math.min(repeatA, repeatB));
		if (minimal) timelineMode = timelineChoice.choose(nextDuration, repeatA, repeatB);
	}

	function scheduleDuration() {
		clearTimeout(durationTimer);
		if (!firstFrameReady || initialFramePending || bootstrapMuted) return;
		durationTimer = setTimeout(publishDuration, 250);
	}

	function restoreBootstrapMute() {
		if (!bootstrapMuted) return;
		bootstrapMuted = false;
		player.muted = muted;
		scheduleDuration();
	}

	function handlePause() {
		paused = true;
		// pauseVideo() is asynchronous. Keep the bootstrap silent until the
		// provider confirms it has stopped, including its final audio samples.
		if (!initialFramePending) restoreBootstrapMute();
	}

	function handleError() {
		initialFramePending = false;
		pause();
		if (player.paused) restoreBootstrapMute();
		playerError = player.error?.message ?? 'YouTube playback failed';
	}

	function handleVolumeChange() {
		if (!bootstrapMuted) muted = player.muted;
	}

	function handleMetadata() {
		readVideoTitle();
		if (!Number.isFinite(player.duration) || player.duration <= 0) return;
		if (metadataReceived) {
			scheduleDuration();
			return;
		}
		metadataReceived = true;
		initialFramePending = true;
		bootstrapMuted = true;
		player.muted = true;
		player.playbackRate = playbackRate / 100;
		// YouTube needs playback to render a sought frame. Pause once that frame is ready.
		seek(Math.max(repeatA, Math.min(1, repeatB)), true);
		const version = sourceVersion;
		void player.play().catch((error) => {
			if (version !== sourceVersion) return;
			initialFramePending = false;
			pause();
			if (player.paused) restoreBootstrapMute();
			playerError = `First frame unavailable: ${String(error)}`;
		});
	}

	function handlePlaying() {
		readVideoTitle();
		providerStalled = false;
		paused = false;
		// Begin the short fade on playback rather than waiting for the idle timeout.
		// Video.js still owns hover/activity and keyboard-focus visibility.
		if (minimal && !theater) controlsPlayer?.store.toggleControls(false);
		if (!player.seeking) {
			firstFrameReady = true;
			if (duration === undefined) scheduleDuration();
		}
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
			pause();
		}
		if (!firstFrameReady && youtubePlayerState() === YOUTUBE_STATE_PLAYING) {
			firstFrameReady = true;
			scheduleDuration();
		}
		handleTimeUpdate();
	}

	function handleTimeUpdate() {
		if (!videoTitle) readVideoTitle();
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
		requestedPaused = false;
		pauseAfterSeek = false;
		initialFramePending = false;
		restoreBootstrapMute();
		try {
			await player.play();
		} catch (error) {
			playerError = `Playback failed: ${String(error)}`;
		}
	}

	function togglePaused() {
		if (!player || !metadataReceived) return;
		// The adapter can retain paused=false when YouTube returns to unstarted/cued.
		// Treat those states as a Play request so a stalled startup can be retried.
		const youtubeState = youtubePlayerState();
		if (paused || player.paused || providerStalled || youtubeStateIsStalled(youtubeState)) {
			if (youtubeStateIsStalled(youtubeState)) {
				providerStalled = true;
				retrySeekTime = recoverySeekTarget();
			}
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
		muted = !muted;
		player.muted = bootstrapMuted || muted;
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
		orientation = 'landscape';
		onsourcechange?.(youtubeId);
		clearTimeout(durationTimer);
		metadataReceived = false;
		firstFrameReady = false;
		bootstrapMuted = false;
		duration = undefined;
		repeatA = 0;
		repeatB = 99999;
		currentTime = 1;
		paused = true;
		requestedPaused = true;
		providerStalled = false;
		playbackRate = 100;
		playerError = '';
		videoTitle = '';
		pauseAfterSeek = false;
		initialFramePending = false;
		retrySeekTime = undefined;
		sourceVersion += 1;
	}
</script>

<div
	class="player"
	class:minimal
	style:--media-ratio={orientation === 'portrait' ? 9 / 16 : 16 / 9}
	style:--video-width={frameVideoWidth === null ? '100%' : `${frameVideoWidth}px`}
	style:--video-source-ratio={sourceAspectRatio}
	bind:this={playerContainer}
>
	<div
		class="media-canvas"
		bind:this={mediaCanvas}
		bind:clientWidth={canvasWidth}
		bind:clientHeight={canvasHeight}
	>
		{#if playerMounted}
			{#key `${youtubeId}:${sourceVersion}`}
				<youtube-video
					{@attach excludeYouTubeProviderFocus}
					bind:this={player}
					src={`https://www.youtube-nocookie.com/embed/${youtubeId}`}
					playsinline
					onloadedmetadata={handleMetadata}
					ondurationchange={handleMetadata}
					ontimeupdate={handleTimeUpdate}
					onseeked={handleSeeked}
					onended={handleEnded}
					onplay={() => (paused = providerStalled)}
					onplaying={handlePlaying}
					onpause={handlePause}
					onvolumechange={handleVolumeChange}
					onratechange={() => (playbackRate = player.playbackRate * 100)}
					onerror={handleError}
				></youtube-video>
			{/key}
		{/if}
	</div>

	{#if minimal}
		<div class="video-surface" aria-hidden="true" bind:this={videoSurface}></div>
		<!-- Separate keyboard/AT activation from pointer recognition so scroll-generated clicks cannot play. -->
		<button
			class="video-toggle watch-playback"
			aria-label={paused ? 'Play video' : 'Pause video'}
			aria-keyshortcuts="Space Enter"
			disabled={!metadataReceived}
			onclick={togglePaused}
		></button>
		{#if controlsModule}
			<youloop-controls-player bind:this={controlsPlayer}>
				<div
					class="watch-overlay"
					class:theater
					style:left={`${visibleBounds.left}px`}
					style:top={`${visibleBounds.top}px`}
					style:width={`${visibleBounds.width}px`}
					style:height={`${visibleBounds.height}px`}
				>
					{#if !theater}
						<div
							class="watch-timeline"
							class:clip={clipTimeline}
							data-mode={clipTimeline ? 'clip' : 'video'}
							role="progressbar"
							aria-label={clipTimeline ? 'A:B progress' : 'Video progress'}
							aria-valuemin="0"
							aria-valuemax={timelineDuration}
							aria-valuenow={timelineTime}
							aria-valuetext={`${range.valid ? formatVideoTime(timelineTime) : '?:??'} / ${range.valid ? formatVideoTime(timelineDuration) : '?:??'}`}
						>
							{#if clipTimeline && range.leftTail}<div
									class="timeline-tail left"
									aria-hidden="true"
								></div>{/if}
							<div class="timeline-track">
								{#if !clipTimeline && range.restricted}
									<div
										class="timeline-selection"
										style:left={`${range.selectionStart * 100}%`}
										style:width={`${range.selectionWidth * 100}%`}
									>
										<div
											class="timeline-overlap"
											style:width={`${range.clipProgress * 100}%`}
										></div>
									</div>
								{/if}
								<div
									class="timeline-fill"
									style:width={`${(clipTimeline ? range.clipProgress : range.videoProgress) * 100}%`}
								></div>
							</div>
							{#if clipTimeline && range.rightTail}<div
									class="timeline-tail right"
									aria-hidden="true"
								></div>{/if}
						</div>
					{/if}
				</div>
				<div
					class="watch-controls-region"
					bind:this={controlsRegion}
					style:left={`${controlsBounds.left}px`}
					style:top={`${controlsBounds.top}px`}
					style:width={`${controlsBounds.width}px`}
					style:height={`${controlsBounds.height}px`}
				>
					{#if paused && videoTitle && !theater && !controlPageVisible}
						<h1
							class="video-title"
							bind:this={watchTitle}
							data-placement={titlePlacement.mode}
							style:left={`${titlePlacement.left}px`}
							style:top={`${titlePlacement.top}px`}
							style:width={`${titlePlacement.width}px`}
							style:max-height={`${titlePlacement.maxHeight}px`}
						>
							{videoTitle}
						</h1>
					{/if}
					<media-controls
						class="watch-controls"
						class:paused
						class:suppressed={theater || controlPageVisible}
						inert={theater || controlPageVisible}
						bind:this={watchControls}
						data-placement={controlsPlacement.mode}
						style:left={`${controlsPlacement.left}px`}
						style:top={`${controlsPlacement.top}px`}
						style:width={`${controlsPlacement.width}px`}
						style:height={`${controlsPlacement.height}px`}
					>
						<button
							class="watch-time"
							class:clip={clipTimeline}
							disabled={!range.restricted}
							aria-label={range.restricted
								? `${clipTimeline ? 'A:B' : 'VIDEO'} progress, switch to ${clipTimeline ? 'full-video' : 'A:B'} progress`
								: 'VIDEO progress, full video selected'}
							onclick={toggleTimeline}
						>
							<span class="time-value"
								><span>{range.valid ? formatVideoTime(timelineTime) : '?:??'}</span><span
									>/ {range.valid ? formatVideoTime(timelineDuration) : '?:??'}</span
								></span
							>
							{#if clipTimeline}<span class="time-label">A:B</span>{/if}
						</button>
						<div class="watch-actions">
							<button
								aria-label={muted ? 'Unmute video' : 'Mute video'}
								disabled={!metadataReceived}
								onclick={toggleMute}
							>
								{#if muted}<IcRoundVolumeOff />{:else}<IcRoundVolumeUp />{/if}
							</button>
							<button aria-label="Theater mode" disabled={fullscreen} onclick={ontheater}
								><IcRoundCropLandscape /></button
							>
							{#if nativeFullscreen}
								<button
									aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
									onclick={toggleFullscreen}
								>
									{#if fullscreen}<IcRoundFullscreenExit />{:else}<IcRoundFullscreen />{/if}
								</button>
							{/if}
						</div>
					</media-controls>
				</div>
			</youloop-controls-player>
		{/if}
	{:else}
		<button
			class="video-toggle"
			aria-label={paused ? 'Play video' : 'Pause video'}
			onclick={togglePaused}
		></button>
	{/if}
	{#if !minimal}
		<button
			class="fullscreen"
			aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
			onclick={toggleFullscreen}
		>
			{#if fullscreen}<IcRoundFullscreenExit />{:else}<IcRoundFullscreen />{/if}
		</button>
	{/if}
	{#if minimal && playerError}
		<p class="player-error" role="alert">{playerError}</p>
	{/if}
</div>
{#if !minimal && playerError}<p role="alert">{playerError}</p>{/if}

{#if !minimal}
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
		<div class="controls" inert={!metadataReceived}>
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

			<div class="nc-join" role="group" aria-label="Media orientation">
				<button
					aria-label="Landscape"
					aria-pressed={orientation === 'landscape'}
					onclick={() => {
						orientation = 'landscape';
						onorientationchange?.('landscape');
					}}
				>
					<span class:active={orientation === 'landscape'}><IcRoundCropLandscape /></span>
				</button>
				<button
					aria-label="Portrait"
					aria-pressed={orientation === 'portrait'}
					onclick={() => {
						orientation = 'portrait';
						onorientationchange?.('portrait');
					}}
				>
					<span class:active={orientation === 'portrait'}><IcRoundCropPortrait /></span>
				</button>
			</div>
			<div class="nc-join" role="group" aria-label="Video framing">
				<button
					aria-label="Crop to fill"
					aria-pressed={fillFrame}
					title="Zoom into the center to fill the frame (crops edges)"
					onclick={() => onfillchange?.(!fillFrame)}
				>
					<span class:active={fillFrame}>Fill</span>
				</button>
			</div>
		</div>

		<button class="outline paste-button" onclick={pasteYoutubeId}
			>Load YouTube URL/ID from clipboard</button
		>
		<div>{youtubeIdResultMessage}</div>
	</center>
{/if}

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
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		aspect-ratio: 16 / 9;
		contain: size layout;
		background: black;
		overflow: hidden;
	}

	.player.minimal {
		height: 100%;
		aspect-ratio: auto;
		container-type: size;
	}

	.player.minimal .media-canvas {
		// Source detection can resize this absolute child after first paint.
		// Anchor its center independently of flex static-position recalculation.
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(100%, calc(100cqh * var(--media-ratio)));
		height: min(100%, calc(100cqw / var(--media-ratio)));
		aspect-ratio: var(--media-ratio);
	}

	.player-error {
		position: absolute;
		inset: auto 0 0;
		margin: 0;
		padding: 1rem;
		color: white;
		background: rgb(0 0 0 / 80%);
		pointer-events: none;
	}

	.media-canvas {
		position: absolute;
		// Fit the selected media ratio inside the fixed 16:9 page footprint.
		width: calc(100% * var(--media-ratio) * 9 / 16);
		aspect-ratio: var(--media-ratio);
		// Explicit geometry prevents provider intrinsic sizes from feeding back into layout.
		contain: size layout;
		overflow: hidden;
		flex-shrink: 0;
	}

	.player:fullscreen {
		width: 100%;
		height: 100%;
		aspect-ratio: auto;
	}

	.player:fullscreen .media-canvas {
		width: min(100%, calc(100vh * var(--media-ratio)));
	}

	youtube-video {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
	}

	// Hide edge chrome and bottom captions, and reduce the paused-state gradient.
	// A fixed height avoids resizing the oversized iframe whenever the player height changes.
	// The video frame's width depends on its real canvas dimensions and source aspect.
	// Keep the iframe's overscan height fixed, and center both contain/cover framing.
	youtube-video::part(iframe) {
		position: absolute;
		top: 50%;
		left: 50%;
		width: var(--video-width);
		height: 16000px;
		transform: translate(-50%, -50%);
	}

	youloop-controls-player {
		display: contents;
	}
	.video-surface {
		position: absolute;
		inset: 0;
	}
	.watch-overlay {
		--timeline-progress: #f33;
		--timeline-selection: #39f;
		--timeline-overlap: #a855f7;
		--timeline-remaining: #aaa;
		position: absolute;
		pointer-events: none;
	}
	.video-title {
		user-select: none;
		pointer-events: none;
		position: absolute;
		box-sizing: border-box;
		overflow: hidden;
		overflow-wrap: anywhere;
		margin: 0;
		padding: 8px 12px;
		font-size: clamp(1rem, 3vw, 1.4rem);
		line-height: 1.3;
		color: white;
		background: rgb(0 0 0 / 45%);
		border-radius: 8px;
	}
	.video-title[data-placement='above'],
	.video-title[data-placement='below'] {
		text-align: center;
	}
	.watch-controls-region {
		position: absolute;
		container-type: inline-size;
		box-sizing: border-box;
		padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))
			max(14px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
		pointer-events: none;
	}
	.watch-controls {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		opacity: 0;
		transition: opacity 180ms;
		pointer-events: none;
	}
	.watch-controls:global([data-visible]),
	.watch-controls.paused,
	.watch-controls:has(:focus-visible) {
		opacity: 1;
	}
	.watch-controls button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		min-width: 44px;
		flex-shrink: 0;
		height: 44px;
		margin: 0;
		padding: 10px;
		border: 0;
		border-radius: 10px;
		color: white;
		background: rgb(90 90 90 / 65%);
		cursor: pointer;
		pointer-events: auto;
	}
	.watch-controls:not(:global([data-visible])):not(.paused):not(:has(:focus-visible)) button {
		pointer-events: none;
	}
	.watch-actions {
		display: flex;
		gap: 6px;
		margin-left: auto;
	}
	.watch-controls .watch-time {
		width: auto;
		min-width: 44px;
		padding: 6px 8px;
		gap: 6px;
		font-size: clamp(0.7rem, 2.5vw, 0.9rem);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.time-value {
		display: inline-flex;
		gap: 0.3em;
	}
	.watch-time .time-label {
		color: #39f;
	}
	.watch-controls .watch-time:disabled {
		opacity: 1;
		cursor: default;
	}
	@container (max-width: 360px) {
		.watch-controls {
			gap: 4px;
		}
		.watch-actions {
			gap: 4px;
		}
		.watch-controls .watch-time {
			flex-direction: column;
			gap: 0;
			padding: 4px;
		}
	}
	@container (max-width: 260px) {
		.watch-controls .watch-time {
			flex: 1;
			min-width: 44px;
			height: auto;
			min-height: 44px;
			font-size: 0.7rem;
		}
		.time-value {
			flex-direction: column;
			gap: 0;
			line-height: 1.1;
		}
		.watch-actions {
			flex-shrink: 0;
		}
	}
	.watch-controls button:focus-visible {
		outline: 2px solid white;
		outline-offset: 3px;
	}
	.watch-controls button:hover {
		background: rgb(120 120 120 / 80%);
	}
	.watch-controls button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.watch-controls.suppressed {
		visibility: hidden;
	}
	.watch-timeline {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 3px;
		display: flex;
		pointer-events: none;
	}
	.timeline-track {
		position: relative;
		flex: 1;
		height: 100%;
		background: var(--timeline-remaining);
	}
	.timeline-fill {
		position: absolute;
		left: 0;
		top: 0;
		height: 100%;
		background: var(--timeline-progress);
	}
	.timeline-selection {
		position: absolute;
		top: 0;
		height: 100%;
		background: var(--timeline-selection);
		z-index: 1;
	}
	.timeline-overlap {
		height: 100%;
		background: var(--timeline-overlap);
	}
	.watch-timeline.clip .timeline-track {
		background: var(--timeline-selection);
	}
	.watch-timeline.clip .timeline-fill {
		background: var(--timeline-overlap);
	}
	.timeline-tail {
		flex: 0 0 6%;
		height: 100%;
		background: repeating-linear-gradient(to right, var(--tail-color) 0 4px, transparent 4px 7px);
	}
	.timeline-tail.left {
		--tail-color: var(--timeline-progress);
	}
	.timeline-tail.right {
		--tail-color: var(--timeline-remaining);
	}
	@media (prefers-reduced-motion: reduce) {
		.watch-controls {
			transition: none;
		}
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

	.watch-playback {
		pointer-events: none;
	}
	.watch-playback:focus-visible {
		outline: 2px solid white;
		outline-offset: -4px;
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

			span {
				opacity: 40%;
			}

			:global(.active) {
				opacity: 100% !important;
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
				}
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
