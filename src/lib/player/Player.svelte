<script lang="ts">
	import type { WatchControlsPlayer } from './watch-controls';
	import type { YouTubeVideoElement } from '@videojs/html/media/youtube-video';
	import { onMount, untrack, type Snippet } from 'svelte';
	import EditorWorkspace from './EditorWorkspace.svelte';
	import BoundEditor from './BoundEditor.svelte';
	import ClipRange from './ClipRange.svelte';
	import SourceEditor from './SourceEditor.svelte';
	import TimestampFormat from './TimestampFormat.svelte';
	import type { EditorSource } from './editor-source';
	import { editorTime } from './editor-time';
	import type { TimestampPolicy } from '../share-url.ts';
	import { resolveClipRange, subtractSeconds, type ShareUrlState } from '#lib/share-url.ts';
	import {
		playbackBounds,
		scopeSwitchTarget,
		playbackBoundaryAction
	} from './watch-playback-scope';
	import { excludeYouTubeProviderFocus } from './youtube-provider-focus';
	import { calculateFrameVideoWidth } from './video-framing';
	import { placeWatchControls, placeWatchTitle } from './watch-controls-placement';
	import { createTimelineMode, timelineRange, type TimelineMode } from './watch-timeline';

	import IcRoundEdit from '~icons/ic/round-edit';

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

	let player = $state<YouTubeVideoElement>(undefined!);
	let playerContainer: HTMLDivElement;
	let mediaCanvas: HTMLDivElement;
	let videoSurface = $state<HTMLDivElement>(undefined!);
	let controlsPlayer = $state<WatchControlsPlayer>();
	let controlsModule = $state<typeof import('./watch-controls')>();
	let nativeFullscreen = $state(false);
	let videoTitle = $state('');
	let titleUnavailable = $state(false);
	let subSeconds = $state(false);
	let boundEditError = $state('');
	let watchTitle = $state<HTMLHeadingElement>();
	let titlePlacement = $state({ left: 0, top: 0, width: 0, maxHeight: 0, mode: 'video' });
	let controlsRegion = $state<HTMLDivElement>();
	let watchControls = $state<HTMLElement>();
	let controlsBounds = $state({ left: 0, top: 0, width: 0, height: 0 });
	let controlsPlacement = $state({ left: 0, top: 0, width: 0, height: 44, mode: 'video' });
	let visibleBounds = $state({ left: 0, top: 0, width: 0, height: 0 });

	const framerate = 30;

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
		vertical?: boolean;
		fill?: boolean;
		mirror?: boolean;
		onmirrorchange?: (mirror: boolean) => void;
		sourceAspectRatio?: number;
		minimal?: boolean;
		editorPath?: string;
		editorActions?: Snippet;
		once?: boolean;
		mute?: boolean;
		speed?: number;
		ononcechange?: (once: boolean) => void;
		onmutechange?: (mute: boolean) => void;
		onspeedchange?: (speed: number) => void;
		onstartchange?: (start: number | undefined) => void;
		onendchange?: (end: number | undefined) => void;
		requestedBounds: Pick<ShareUrlState, 'start' | 'end'>;
		onboundsresolved?: (valid: boolean) => void;
		theater?: boolean;
		controlPageVisible?: boolean;
		ontheater?: () => void;
		onfillchange?: (fill: boolean | undefined) => void;
		onorientationchange?: (orientation: 'landscape' | 'portrait' | undefined) => void;
		onsourcechange?: (videoId: string, clip?: ShareUrlState) => void;
		ondurationresolved?: (duration: number | undefined) => void;
		timestampPolicy?: TimestampPolicy;
		timestampOptions?: { value: TimestampPolicy; label: string; preview?: string }[];
		onpolicychange?: (policy: TimestampPolicy) => void;
	}

	let {
		youtubeId = $bindable('dt-SqNL4z3w'),
		repeatA = $bindable(25),
		repeatB = $bindable(38),
		orientation = $bindable('landscape'),
		fillFrame = false,
		vertical,
		fill,
		mirror = false,
		onmirrorchange,
		sourceAspectRatio = 16 / 9,
		minimal = false,
		editorPath,
		editorActions,
		once = false,
		mute,
		speed,
		ononcechange,
		onmutechange,
		onspeedchange,
		onstartchange,
		onendchange,
		requestedBounds,
		onboundsresolved,
		theater = false,
		controlPageVisible = false,
		ontheater,
		onfillchange,
		onorientationchange,
		onsourcechange,
		ondurationresolved,
		timestampPolicy = 'preserve',
		timestampOptions = [],
		onpolicychange
	}: Props = $props();

	if (youtubeId === null) {
		youtubeId = 'dt-SqNL4z3w';
	}

	let currentTime = $state(repeatA);
	let duration: number | undefined = $state();
	const scopeChoice = createTimelineMode();
	let playbackScope = $state<TimelineMode>('video');
	let range = $derived(timelineRange(duration, repeatA, repeatB, currentTime));
	let activeScope = $derived(minimal && range.valid ? playbackScope : 'clip');
	let activeBounds = $derived(playbackBounds(duration, repeatA, repeatB, activeScope));
	let clipTimeline = $derived(range.restricted && activeScope === 'clip');
	let timelineTime = $derived(clipTimeline ? range.elapsed : range.absolute);
	let timelineDuration = $derived(clipTimeline ? range.length : range.total);
	function toggleTimeline() {
		if (!range.restricted || !player) return;
		playbackScope = scopeChoice.toggle();
		const target = scopeSwitchTarget(player.currentTime, activeBounds);
		if (target !== player.currentTime) seek(target, requestedPaused);
	}
	let paused = $state(true);
	let requestedPaused = true;
	let providerStalled = false;
	let muted = $state(false);
	let loop = $derived(!once);
	let playbackRate = $state(100);

	let percentA = $derived(`${duration === undefined ? 0 : (repeatA / duration) * 100}%`);
	let percentB = $derived(`${100 - (duration === undefined ? 0 : (repeatB / duration) * 100)}%`);

	let fullscreen = $state(false);
	let canvasWidth = $state(0);
	let canvasHeight = $state(0);
	let frameVideoWidth = $derived(
		calculateFrameVideoWidth(canvasWidth, canvasHeight, sourceAspectRatio, fillFrame)
	);
	let playerError = $state('');
	let boundsError = $state('');
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
		const requested = mute ?? false;
		untrack(() => {
			muted = requested;
			if (player) player.muted = bootstrapMuted || requested;
		});
	});
	$effect(() => {
		const requested = speed ?? 1;
		untrack(() => {
			playbackRate = requested * 100;
			if (player && metadataReceived) player.playbackRate = requested;
		});
	});
	$effect(() => {
		void youtubeId;
		void sourceVersion;
		// Reset on URL/history source changes as well as clipboard selection.
		untrack(resetSource);
	});
	$effect(() => {
		void requestedBounds;
		untrack(() => {
			if (!metadataReceived || !player) return;
			if (duration !== undefined && !validateBounds()) return;
			if (player.currentTime < activeBounds.start || player.currentTime > activeBounds.end) {
				seek(activeBounds.start);
			}
		});
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
		const finiteTime = Number.isFinite(time) ? time : activeBounds.start;
		const target = Math.max(activeBounds.start, Math.min(activeBounds.end, finiteTime));
		return target >= activeBounds.end ? activeBounds.start : target;
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
		const engine = player?.engine as
			| {
					getVideoData?: () => { title?: string; video_id?: string } | undefined;
					videoTitle?: string;
			  }
			| undefined;
		const data = engine?.getVideoData?.();
		if (data?.video_id && data.video_id !== youtubeId) return;
		const title = data?.title || engine?.videoTitle;
		if (typeof title === 'string' && title.trim()) {
			videoTitle = title;
			titleUnavailable = false;
		}
	}

	$effect(() => {
		if (!player || !metadataReceived || videoTitle) return;
		let attempts = 0;
		// Paused/cued sources can receive their title after the last media event.
		const timer = setInterval(() => {
			readVideoTitle();
			if (++attempts >= 10) titleUnavailable = true;
		}, 500);
		return () => clearInterval(timer);
	});

	function seek(time: number, stayPaused = minimal ? requestedPaused : player.paused) {
		pauseAfterSeek = stayPaused;
		currentTime = Math.max(activeBounds.start, Math.min(activeBounds.end, time));
		if (retrySeekTime !== undefined) retrySeekTime = recoverySeekTarget(currentTime);
		player.currentTime = currentTime;
	}

	function publishDuration() {
		// YouTube's cued duration can be rounded. Read the post-playback value,
		// and wait for a quiet interval before showing the first timeline.
		const nextDuration = player.engine?.getDuration() ?? player.duration;
		if (!Number.isFinite(nextDuration) || nextDuration <= 0) return;
		duration = nextDuration;
		ondurationresolved?.(duration);
		if (!validateBounds()) return;
		if (minimal) playbackScope = scopeChoice.choose(nextDuration, repeatA, repeatB);
		if (player.currentTime < activeBounds.start || player.currentTime > activeBounds.end) {
			seek(activeBounds.start);
		}
	}

	function validateBounds() {
		if (duration === undefined) return false;
		const bounds = resolveClipRange(requestedBounds, duration);
		onboundsresolved?.(bounds.ok);
		if (!bounds.ok) {
			const resolve = (value: number) =>
				Math.max(0, Math.min(duration!, value < 0 ? subtractSeconds(duration!, -value) : value));
			repeatA = resolve(requestedBounds.start ?? 0);
			repeatB = requestedBounds.end === undefined ? duration : resolve(requestedBounds.end);
			boundsError = 'Invalid clip: the resolved end must be after the start within this video.';
			pause();
			return false;
		}
		boundsError = '';
		repeatA = bounds.start;
		repeatB = bounds.end;
		return true;
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
		if (!bootstrapMuted && muted !== player.muted) {
			muted = player.muted;
			onmutechange?.(muted);
		}
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
		if (player) player.playbackRate = playbackRate / 100;
		// YouTube needs playback to render a sought frame. Pause once that frame is ready.
		// An out-of-duration A cannot render a first frame. Bootstrap inside the
		// provider first; settled duration then clamps the requested range.
		pauseAfterSeek = true;
		currentTime =
			!resolveClipRange(requestedBounds, player.duration).ok || repeatA >= player.duration - 1
				? Math.min(1, player.duration / 2)
				: Math.max(repeatA, Math.min(1, repeatB));
		player.currentTime = currentTime;
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
		if (boundsError) {
			pause();
			return;
		}
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
		if (duration === undefined || boundsError || player.seeking) return;
		currentTime = player.currentTime;
		const action = playbackBoundaryAction(currentTime, activeBounds, loop, !player.paused);
		if (action === 'clamp-start') seek(activeBounds.start);
		else if (action === 'repeat') seek(activeBounds.start, false);
		else if (action === 'stop') {
			pause();
			if (currentTime > activeBounds.end) seek(activeBounds.end, true);
		}
	}

	function handleEnded() {
		if (boundsError) return;
		if (initialFramePending) {
			firstFrameReady = true;
			pause();
			return;
		}
		if (playbackBoundaryAction(currentTime, activeBounds, loop, false, true) === 'stop') pause();
		else {
			seek(activeBounds.start, false);
			void play();
		}
	}

	async function play() {
		if (boundsError) return;
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
		if (!player || !metadataReceived || boundsError) return;
		// The adapter can retain paused=false when YouTube returns to unstarted/cued.
		// Treat those states as a Play request so a stalled startup can be retried.
		const youtubeState = youtubePlayerState();
		if (paused || player.paused || providerStalled || youtubeStateIsStalled(youtubeState)) {
			if (youtubeStateIsStalled(youtubeState)) {
				providerStalled = true;
				retrySeekTime = recoverySeekTarget();
			}
			if (
				player.ended ||
				player.currentTime < activeBounds.start ||
				player.currentTime >= activeBounds.end
			) {
				seek(activeBounds.start);
			}
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
		onmutechange?.(muted);
		if (player) player.muted = bootstrapMuted || muted;
	}

	function toggleLoop() {
		loop = !loop;
		ononcechange?.(!loop);
	}

	function setAtPlayhead(endpoint: 'start' | 'end') {
		const value = subSeconds ? currentTime : Math.round(currentTime);
		const next = { ...requestedBounds, [endpoint]: value };
		if (duration === undefined || value > duration || !resolveClipRange(next, duration).ok) {
			boundEditError = 'Choose a playhead position with End after Start.';
			return;
		}
		boundEditError = '';
		if (endpoint === 'start') onstartchange?.(value);
		else onendchange?.(value);
	}

	function makeTogglePlaybackRate(rate?: number) {
		if (rate) {
			return function () {
				playbackRate = rate;
				onspeedchange?.(playbackRate / 100);
				if (player) player.playbackRate = playbackRate / 100;
			};
		} else {
			return function () {
				const choices = [200, 100, 50, 25];
				playbackRate = choices[(choices.indexOf(playbackRate) + 1) % choices.length];
				onspeedchange?.(playbackRate / 100);
				if (player) player.playbackRate = playbackRate / 100;
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
			onstartchange?.(repeatA);
		}
		if (currentTime > repeatB) {
			repeatB = currentTime;
			onendchange?.(repeatB);
		}
		seek(currentTime);
	}

	function handleInputRepeatA(event: Event) {
		repeatA = Number((event.currentTarget as HTMLInputElement).value);
		onstartchange?.(repeatA);
		if (repeatA > repeatB) {
			repeatB = repeatA;
			onendchange?.(repeatB);
		}
		seek(repeatA);
	}

	function handleInputRepeatB(event: Event) {
		repeatB = Number((event.currentTarget as HTMLInputElement).value);
		onendchange?.(repeatB);
		if (repeatB < repeatA) {
			repeatA = repeatB;
			onstartchange?.(repeatA);
		}
		seek(repeatB);
	}

	function handleBoundKeydown(event: KeyboardEvent, bound: 'start' | 'end') {
		const direction = ['ArrowRight', 'ArrowUp'].includes(event.key)
			? 1
			: ['ArrowLeft', 'ArrowDown'].includes(event.key)
				? -1
				: 0;
		if (!direction) return;
		event.preventDefault();
		const input = event.currentTarget as HTMLInputElement;
		// step=any retains signed fractions; keyboard edits still move by 0.1 seconds.
		input.value = String(
			Math.max(
				0,
				Math.min(duration ?? repeatB, Number((Number(input.value) + direction * 0.1).toFixed(10)))
			)
		);
		if (bound === 'start') handleInputRepeatA(event);
		else handleInputRepeatB(event);
	}

	function applySource(source: EditorSource) {
		const changed = source.videoId !== youtubeId;
		onsourcechange?.(source.videoId, source.clip);
		if (changed || !source.clip) sourceVersion += 1;
	}

	function resetSource() {
		scopeChoice.reset();
		playbackScope = 'video';
		clearTimeout(durationTimer);
		metadataReceived = false;
		firstFrameReady = false;
		bootstrapMuted = false;
		duration = undefined;
		ondurationresolved?.(undefined);
		currentTime = repeatA;
		paused = true;
		requestedPaused = true;
		providerStalled = false;
		playbackRate = (speed ?? 1) * 100;
		playerError = '';
		boundsError = '';
		videoTitle = '';
		titleUnavailable = false;
		boundEditError = '';
		pauseAfterSeek = false;
		initialFramePending = false;
		retrySeekTime = undefined;
	}
</script>

{#if boundsError}<p role="alert">{boundsError}</p>{/if}

{#snippet media(editorOverlay?: Snippet)}
	<div
		class="player"
		class:workspace={!minimal}
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
						class:mirrored={mirror}
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
						onratechange={() => {
							if (metadataReceived && !bootstrapMuted) {
								playbackRate = player.playbackRate * 100;
								if (player.playbackRate !== (speed ?? 1)) onspeedchange?.(player.playbackRate);
							}
						}}
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
				disabled={!metadataReceived || !!boundsError}
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
									? `${clipTimeline ? 'A:B' : 'VIDEO'} progress, switch to ${clipTimeline ? 'full-video' : 'A:B'} playback`
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
									disabled={!metadataReceived || !!boundsError}
									onclick={toggleMute}
								>
									{#if muted}<IcRoundVolumeOff />{:else}<IcRoundVolumeUp />{/if}
								</button>
								{#if editorPath}
									<a href={editorPath} aria-label="Edit" title="Edit"><IcRoundEdit /></a>
								{/if}
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
		{@render editorOverlay?.()}
		{#if minimal && playerError}
			<p class="player-error" role="alert">{playerError}</p>
		{/if}
	</div>
{/snippet}

{#snippet preview(layoutControls: Snippet)}
	<div class="editor-preview-content">
		{#snippet corners()}
			<div class="preview-corners">
				{@render layoutControls()}
				<div class="preview-brand">
					<a class="brand" href="/" data-sveltekit-reload title="YouLoop home">
						<img src="/logo.svg" alt="" />YouLoop
					</a>
				</div>
			</div>
		{/snippet}
		{@render media(corners)}
		<div class="editor-transport">
			<div class="timestamps">
				<div>{formatVideoTime(currentTime)} / {formatVideoTime(duration)}</div>
				<div>{editorTime(repeatA, subSeconds, 2)}A - {editorTime(repeatB, subSeconds, 2)}B</div>
			</div>

			<div class="wrap-sliders">
				<input type="range" aria-hidden="true" tabindex="-1" />

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
						step="any"
						oninput={handleInputRepeatA}
						onkeydown={(event) => handleBoundKeydown(event, 'start')}
						bind:value={repeatA}
						max={duration}
					/>

					<input
						type="range"
						aria-label="Repeat end"
						class="repeat-b"
						min="0"
						step="any"
						oninput={handleInputRepeatB}
						onkeydown={(event) => handleBoundKeydown(event, 'end')}
						bind:value={repeatB}
						max={duration}
					/>
				{/if}
			</div>

			<div class="preview-actions" inert={!metadataReceived}>
				<div class="preview-playback nc-join" role="group" aria-label="Player transport">
					<button
						class="transport-play"
						aria-label={paused ? 'Play' : 'Pause'}
						onclick={togglePaused}
						disabled={!!boundsError}
					>
						{#if paused}<IcRoundPlayArrow />{:else}<IcRoundPause />{/if}<span class="play-label"
							>{paused ? 'Play' : 'Pause'}</span
						>
					</button>
					<button
						class="transport-frame"
						aria-label="Previous frame"
						data-tooltip="Previous frame"
						onclick={makeStepFrame(-1)}
						disabled={!!boundsError}
						><IcRoundSkipPrevious /><span class="frame-label">Previous frame</span></button
					>
					<button
						class="transport-frame"
						aria-label="Next frame"
						data-tooltip="Next frame"
						onclick={makeStepFrame(1)}
						disabled={!!boundsError}
						><IcRoundSkipNext /><span class="frame-label">Next frame</span></button
					>
					<button
						class="transport-speed"
						aria-label={`Cycle playback speed, current ${playbackRate / 100}x`}
						data-tooltip="Cycle playback speed"
						onclick={makeTogglePlaybackRate()}
						><IcRoundSpeed /><span class="secondary-label">Speed</span><span class="speed-value"
							>{playbackRate / 100}x</span
						></button
					>
					{#each [200, 100, 50, 25] as rate (rate)}<button
							class="transport-rate"
							aria-label={`Set playback speed to ${rate / 100}x`}
							aria-pressed={playbackRate === rate}
							data-tooltip={`${rate / 100}x speed`}
							onclick={makeTogglePlaybackRate(rate)}>{rate / 100}x</button
						>{/each}
					<button
						class="transport-sound"
						aria-label={muted ? 'Sound off, turn on' : 'Sound on, turn off'}
						aria-pressed={!muted}
						data-tooltip={muted ? 'Turn sound on' : 'Turn sound off'}
						onclick={toggleMute}
						>{#if muted}<IcRoundVolumeOff />{:else}<IcRoundVolumeUp />{/if}<span
							class="secondary-label">Sound</span
						></button
					>
					<button
						class="transport-loop"
						aria-label={loop ? 'Loop, switch to Once' : 'Once, switch to Loop'}
						aria-pressed={loop}
						data-tooltip={loop ? 'Switch to Once' : 'Switch to Loop'}
						onclick={toggleLoop}
						>{#if loop}<FluentArrowRepeat />{:else}<FluentArrowRepeatOff />{/if}<span
							class="secondary-label">Loop</span
						></button
					>
					<button class="transport-fill" disabled aria-hidden="true" tabindex="-1"></button>
				</div>
			</div>
		</div>
	</div>
{/snippet}

{#snippet settings(layoutReset: Snippet)}
	{#if playerError}<p role="alert">{playerError}</p>{/if}
	<div class="controls">
		<section aria-labelledby="clip-heading" class="settings-section">
			<h2 id="clip-heading">Clip</h2>
			<SourceEditor
				videoId={youtubeId ?? ''}
				title={videoTitle}
				unavailable={titleUnavailable || !!playerError}
				onapply={applySource}
			/>
			<ClipRange start={repeatA} end={repeatB} {duration}>
				{#snippet controls()}
					<BoundEditor
						endpoint="start"
						value={repeatA}
						bounds={requestedBounds}
						{duration}
						precise={subSeconds}
						onchange={(value) => {
							boundEditError = '';
							onstartchange?.(value);
						}}
						onset={() => setAtPlayhead('start')}
					/>
					<BoundEditor
						endpoint="end"
						value={repeatB}
						bounds={requestedBounds}
						{duration}
						precise={subSeconds}
						onchange={(value) => {
							boundEditError = '';
							onendchange?.(value);
						}}
						onset={() => setAtPlayhead('end')}
					/>
					{#if boundEditError}<p role="alert">{boundEditError}</p>{/if}
					<label class="precision-choice"
						><input type="checkbox" bind:checked={subSeconds} />Sub-second times</label
					>
					<div class="policy-row">
						<span>URL timestamp format</span><TimestampFormat
							value={timestampPolicy}
							options={timestampOptions}
							disabled={duration === undefined || !!boundsError}
							onchange={(value) => onpolicychange?.(value)}
						/>
					</div>
					<p class="policy-help">
						Format keeps this clip, but changes how bounds follow a future video duration.
					</p>
				{/snippet}
			</ClipRange>
			{@render editorActions?.()}
		</section>
		<section aria-labelledby="playback-heading" class="settings-section">
			<h2 id="playback-heading">Playback</h2>
			<div class="setting-row">
				<span>Speed</span>
				<div class="speed-buttons choice-pills" role="group" aria-label="Playback speed">
					{#each [200, 100, 50, 25] as rate (rate)}<button
							aria-label={`${rate / 100}x speed`}
							aria-pressed={playbackRate === rate}
							onclick={makeTogglePlaybackRate(rate)}>{rate / 100}x</button
						>{/each}
				</div>
			</div>
			<label class="setting-row switch-row"
				><span>Sound</span><input
					type="checkbox"
					role="switch"
					aria-label="Sound"
					checked={!muted}
					onchange={toggleMute}
				/></label
			>
			<div class="setting-row">
				<span>Repeat</span><span class="setting-description">Repeat or stop at End</span>
				<div class="choice-pills" role="group" aria-label="Repeat mode">
					<button
						aria-label="Loop"
						aria-pressed={loop}
						onclick={() => {
							if (!loop) toggleLoop();
						}}>Loop</button
					>
					<button
						aria-label="Once"
						aria-pressed={!loop}
						onclick={() => {
							if (loop) toggleLoop();
						}}>Once</button
					>
				</div>
			</div>
		</section>
		<section aria-labelledby="framing-heading" class="settings-section">
			<h2 id="framing-heading">Framing</h2>
			<div class="setting-row">
				<span>Orientation</span>
				<div class="choice-pills orientation-pills" role="group" aria-label="Media orientation">
					{#each [{ label: 'Auto', value: undefined }, { label: 'Landscape', value: false }, { label: 'Portrait', value: true }] as option (option.label)}
						<button
							aria-pressed={vertical === option.value}
							onclick={() =>
								onorientationchange?.(
									option.value === undefined ? undefined : option.value ? 'portrait' : 'landscape'
								)}>{option.label}</button
						>
					{/each}
				</div>
			</div>
			<div class="setting-row">
				<span>Crop</span>
				<div class="choice-pills" role="group" aria-label="Crop">
					{#each [{ label: 'Auto', value: undefined }, { label: 'Fit', value: false }, { label: 'Fill', value: true }] as option (option.label)}
						<button
							aria-pressed={fill === option.value}
							onclick={() => onfillchange?.(option.value)}>{option.label}</button
						>
					{/each}
				</div>
			</div>
			<label class="setting-row switch-row"
				><span>Mirror video</span><input
					type="checkbox"
					role="switch"
					aria-label="Mirror video"
					checked={mirror}
					onchange={(event) => onmirrorchange?.(event.currentTarget.checked)}
				/></label
			>
		</section>
	</div>
	{@render layoutReset()}
{/snippet}

{#if minimal}
	{@render media()}
{:else}
	<EditorWorkspace {preview} {settings} />
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

	.player.minimal,
	.player.workspace {
		height: 100%;
		aspect-ratio: auto;
		container-type: size;
	}

	.player.minimal .media-canvas,
	.player.workspace .media-canvas {
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

	youtube-video.mirrored {
		transform: scaleX(-1);
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
	.watch-controls :is(button, a) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		text-decoration: none;
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
	.watch-controls:not(:global([data-visible])):not(.paused):not(:has(:focus-visible))
		:is(button, a) {
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
			flex-wrap: wrap;
			max-width: 96px;
		}
	}
	.watch-controls :is(button, a):focus-visible {
		outline: 2px solid white;
		outline-offset: 3px;
	}
	.watch-controls :is(button, a):hover {
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

	.editor-preview-content {
		display: grid;
		grid-template-rows: minmax(0, 1fr) auto;
		height: 100%;
		min-width: 0;
		min-height: 0;
	}
	.editor-transport {
		padding: 0.5rem max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom))
			max(1rem, env(safe-area-inset-left));
	}
	.editor-transport .wrap-sliders {
		margin-bottom: 0.5rem;
	}
	.editor-transport {
		container: transport / inline-size;
	}
	.preview-actions {
		display: flex;
		align-items: center;
	}
	.preview-playback.nc-join {
		display: flex;
		flex-wrap: nowrap;
		width: 100%;
	}
	.preview-playback button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 44px;
		width: 44px;
		min-width: 44px;
		flex-shrink: 0;
		padding: 4px;
		margin: 0;
	}
	.preview-playback .transport-rate {
		display: none;
		width: 56px;
	}
	@container transport (min-width: 1000px) {
		.preview-playback .transport-rate {
			display: inline-flex;
		}
		.transport-speed .speed-value {
			display: none;
		}
	}
	.preview-playback .transport-fill {
		flex: 1;
		width: auto;
		min-width: 0;
		padding: 0;
		opacity: 1;
		cursor: default;
	}
	.preview-playback :global(svg) {
		width: 22px;
		height: 22px;
		flex-shrink: 0;
	}
	.preview-playback .transport-speed {
		width: 82px;
	}
	.speed-value {
		min-width: 5ch;
		font-variant-numeric: tabular-nums;
		text-align: center;
	}
	.play-label,
	.frame-label,
	.secondary-label {
		display: none;
	}
	.preview-playback button[data-tooltip] {
		position: relative;
	}
	.preview-playback button[data-tooltip]::after {
		content: attr(data-tooltip);
		position: absolute;
		bottom: calc(100% + 6px);
		left: 50%;
		transform: translateX(-50%);
		padding: 5px 8px;
		border-radius: 5px;
		font-size: 0.75rem;
		white-space: nowrap;
		background: #222;
		color: white;
		pointer-events: none;
		opacity: 0;
		z-index: 5;
	}
	.preview-playback button[data-tooltip]:hover::after,
	.preview-playback button[data-tooltip]:focus-visible::after {
		opacity: 1;
	}
	@container transport (max-width: 320px) {
		.preview-playback .transport-loop {
			display: none;
		}
		.transport-speed :global(svg) {
			display: none;
		}
		.preview-playback .transport-speed {
			width: 72px;
		}
	}
	@container transport (min-width: 400px) {
		.play-label {
			display: inline;
		}
		.preview-playback .transport-play {
			width: 90px;
		}
	}
	@container transport (min-width: 560px) {
		.secondary-label {
			display: inline;
		}
		.preview-playback .transport-speed {
			width: 145px;
		}
		.preview-playback .transport-sound,
		.preview-playback .transport-loop {
			width: 95px;
		}
	}
	@container transport (min-width: 780px) {
		.frame-label {
			display: inline;
		}
		.preview-playback .transport-frame {
			width: 145px;
		}
	}
	.preview-corners {
		position: absolute;
		inset: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) auto
			max(8px, env(safe-area-inset-left));
		z-index: 1;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
		pointer-events: none;
	}
	.preview-brand {
		min-width: 0;
		color: white;
		font-weight: 700;
		font-size: 1rem;
	}
	.preview-brand img {
		height: 1.25em;
		width: auto;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 44px;
		padding-inline: 8px;
		border-radius: 6px;
		background: rgb(0 0 0 / 70%);
		color: inherit;
		text-decoration: none;
		pointer-events: auto;
	}
	.brand:focus-visible {
		outline: 2px solid white;
		outline-offset: 2px;
	}
	.controls {
		display: grid;
		gap: 12px;
		text-align: left;
	}
	.settings-section {
		min-width: 0;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--nc-border);
	}
	.settings-section h2 {
		font-size: 1.2rem;
		margin: 0 0 8px;
	}
	.setting-row {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		margin-block: 4px;
	}
	.setting-row > span:first-child {
		flex-shrink: 0;
		font-size: 0.85rem;
	}
	.setting-description {
		font-size: 0.8rem;
		opacity: 0.7;
	}
	.precision-choice {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		font-size: 0.85rem;
		margin: 4px 0;
	}
	.precision-choice input {
		margin: 0;
	}
	.policy-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		font-size: 0.8rem;
	}
	.policy-help {
		font-size: 0.75rem;
		opacity: 0.7;
		margin: 6px 0;
	}
	@container clip-settings (max-width: 500px) {
		.setting-description {
			display: none;
		}
	}
	.choice-pills {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-inline-start: auto;
		flex-shrink: 0;
	}
	.choice-pills button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 28px;
		min-width: 36px;
		padding: 1px 8px;
		margin: 0;
		border: 1px solid var(--nc-border);
		border-radius: 999px;
		color: var(--nc-text);
		background: var(--nc-surface-2);
		font-size: 0.85rem;
	}
	.choice-pills button[aria-pressed='true'] {
		background: var(--nc-surface-4);
		border-color: var(--nc-text);
	}
	.choice-pills button:hover {
		background: var(--nc-surface-3);
	}
	.choice-pills :global(svg) {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
	}
	.switch-row input {
		margin-inline-start: auto;
	}
	@container clip-settings (max-width: 340px) {
		.setting-row {
			gap: 4px;
		}
		.choice-pills button {
			padding-inline: 4px;
			font-size: 0.75rem;
		}
		.orientation-pills {
			gap: 2px;
		}
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

	.nc-join {
		width: auto;
		border-radius: var(--nc-radius);
		button {
			min-height: 44px;
			min-width: 44px;
			padding: 6px 10px;
			margin: 0;
			background: $zinc-550;
			color: white;
			border: 1px solid transparent;
			font-size: 0.85rem;
		}
		button:hover {
			background: $zinc-600;
		}
		button[aria-pressed='true'] {
			background: #454b55;
			border-color: #ababab;
		}
		button:focus-visible {
			outline: 2px solid #79c0ff;
			outline-offset: -2px;
		}
	}
</style>
