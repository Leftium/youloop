<script lang="ts">
	import type { WatchControlsPlayer } from './watch-controls';
	import type { YouTubeVideoElement } from '@videojs/html/media/youtube-video';
	import { onMount, untrack, type Snippet } from 'svelte';
	import EditorWorkspace from './EditorWorkspace.svelte';
	import EditorTimeline from './EditorTimeline.svelte';
	import { attachVideoGesture, type VideoScrub } from './video-gesture';
	import type { NumericRange } from '../components/range-slider';
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
	import IcRoundVisibility from '~icons/ic/round-visibility';

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
	let titleMinimumHeight = $state(32);
	let modeToggle = $state<HTMLAnchorElement>();
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
		viewPath?: string;
		editorFeedback?: Snippet;
		editorFooter?: Snippet<[boolean]>;
		once?: boolean;
		mute?: boolean;
		speed?: number;
		ononcechange?: (once: boolean) => void;
		onmutechange?: (mute: boolean) => void;
		onspeedchange?: (speed: number) => void;
		onstartchange?: (start: number | undefined, generated?: boolean) => void;
		onendchange?: (end: number | undefined, generated?: boolean) => void;
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
		viewPath,
		editorFeedback,
		editorFooter,
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
	let transportTime = $state(repeatA);
	let navigationScrub: { time: number; paused: boolean; target: number } | undefined;
	let scrubFrame = 0;
	let cancelVideoGesture: (() => void) | undefined;
	let endpointPreview: { time: number; paused: boolean } | undefined;
	let previewBounds: Pick<ShareUrlState, 'start' | 'end'> | undefined;
	let pendingSeek: { time: number; requestedAt: number } | undefined;
	let previewRoot = $state<HTMLDivElement>();
	let timelineBox = $state<HTMLDivElement>();
	let playheadHeight = $state(0);
	let duration: number | undefined = $state();
	const scopeChoice = createTimelineMode();
	let playbackScope = $state<TimelineMode>('video');
	let range = $derived(timelineRange(duration, repeatA, repeatB, currentTime));
	let activeScope = $derived(range.valid ? playbackScope : 'clip');
	let activeBounds = $derived(playbackBounds(duration, repeatA, repeatB, activeScope));
	let clipTimeline = $derived(range.restricted && activeScope === 'clip');
	let timelineTime = $derived(clipTimeline ? range.elapsed : range.absolute);
	let timelineDuration = $derived(clipTimeline ? range.length : range.total);
	function toggleTimeline() {
		cancelVideoGesture?.();
		if (!range.restricted || !player) return;
		endEndpointPreview();
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
			cancelVideoGesture?.();
			if (
				endpointPreview &&
				previewBounds &&
				(requestedBounds.start !== previewBounds.start || requestedBounds.end !== previewBounds.end)
			)
				endEndpointPreview();
			if (duration !== undefined && !validateBounds()) return;
			if (navigationScrub || endpointPreview || (!minimal && requestedPaused)) return;
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
			discardNavigationScrub();
			endEndpointPreview();
			clearTimeout(durationTimer);
			document.removeEventListener('fullscreenchange', syncFullscreen);
			window.removeEventListener('message', handleProviderMessage);
		};
	});

	$effect(() => {
		if (!minimal || !player || !controlsPlayer || !controlsModule) return;
		return controlsModule.attachWatchControls(controlsPlayer, player, playerContainer);
	});

	$effect(() => {
		if (!videoSurface) return;
		const attachment = attachVideoGesture(
			videoSurface,
			prepareNavigationScrub,
			togglePaused,
			() => {
				// Use the full-width timeline axis in both modes, including watch clip tails.
				const axis = minimal
					? playerContainer.querySelector('.watch-timeline .timeline-track')
					: timelineBox?.querySelector('.editor-axis');
				return (axis ?? (minimal ? mediaCanvas : videoSurface)).getBoundingClientRect();
			}
		);
		cancelVideoGesture = attachment.cancel;
		return () => {
			attachment.destroy();
			if (cancelVideoGesture === attachment.cancel) cancelVideoGesture = undefined;
		};
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
		const modeButton = modeToggle;
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
			const buttonBounds = modeButton?.getBoundingClientRect();
			const reserved = buttonBounds
				? {
						left: buttonBounds.left - regionLeft,
						top: buttonBounds.top - regionTop,
						right: buttonBounds.right - regionLeft,
						bottom: buttonBounds.bottom - regionTop
					}
				: undefined;
			controlsPlacement = placeWatchControls(
				safe,
				video,
				{
					time: time.width,
					actions: actions.width,
					height: Math.max(time.height, actions.height)
				},
				reserved
			);
			if (title) {
				titleMinimumHeight = parseFloat(getComputedStyle(title).minHeight);
				// Measure each candidate at its own width. Reusing the currently rendered
				// height can alternate forever between a one-line fallback and a wrapped gutter.
				const previousWidth = title.style.width;
				const previousMaxHeight = title.style.maxHeight;
				title.style.maxHeight = 'none';
				titlePlacement = placeWatchTitle(
					safe,
					video,
					controlsPlacement,
					(width) => {
						title.style.width = `${width}px`;
						return title.scrollHeight;
					},
					reserved
				);
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
		if (modeButton) observer.observe(modeButton);
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

	// Playback follows the selected VIDEO/A:B scope. Editor navigation and
	// endpoint inspection retain the full source axis.
	function seek(time: number, stayPaused = minimal ? requestedPaused : player.paused) {
		setMediaTime(Math.max(activeBounds.start, Math.min(activeBounds.end, time)), stayPaused);
	}

	function setMediaTime(time: number, stayPaused: boolean, preview = false) {
		pauseAfterSeek = stayPaused;
		currentTime = Math.max(0, Math.min(duration ?? player.duration, time));
		if (!preview || navigationScrub) transportTime = currentTime;
		pendingSeek = { time: currentTime, requestedAt: Date.now() };
		if (retrySeekTime !== undefined && !preview) retrySeekTime = recoverySeekTarget(currentTime);
		player.currentTime = currentTime;
	}

	function navigateSource(time: number) {
		cancelVideoGesture?.();
		endEndpointPreview();
		// In A:B scope, navigation outside the selection pauses for inspection.
		// VIDEO navigation preserves playback anywhere within the source.
		if (time < activeBounds.start || time >= activeBounds.end) pause();
		setMediaTime(time, requestedPaused);
	}

	function prepareNavigationScrub(): VideoScrub | undefined {
		if (!player || duration === undefined || !metadataReceived || boundsError) return;
		const saved = { time: transportTime, paused: requestedPaused, target: transportTime };
		const bounds = minimal ? { ...activeBounds } : { start: 0, end: duration };
		return {
			begin() {
				endEndpointPreview();
				navigationScrub = saved;
				transportTime = saved.time;
				pause();
			},
			move(position) {
				if (navigationScrub !== saved) return;
				saved.target = Math.max(
					bounds.start,
					Math.min(bounds.end, bounds.start + position * (bounds.end - bounds.start))
				);
				currentTime = saved.target;
				transportTime = saved.target;
				// Responsive display; at most one provider seek per animation frame.
				if (!scrubFrame)
					scrubFrame = requestAnimationFrame(() => {
						scrubFrame = 0;
						if (navigationScrub === saved) setMediaTime(saved.target, true, true);
					});
			},
			end(commit) {
				if (navigationScrub !== saved) return;
				if (scrubFrame) cancelAnimationFrame(scrubFrame);
				scrubFrame = 0;
				navigationScrub = undefined;
				const target = commit ? saved.target : saved.time;
				const outside = target < activeBounds.start || target >= activeBounds.end;
				const stayPaused =
					saved.paused || !!boundsError || (commit && outside && (!minimal || !loop));
				setMediaTime(target, stayPaused);
				if (stayPaused) pause();
				else void play();
			}
		};
	}

	function beginEndpointPreview(time: number) {
		cancelVideoGesture?.();
		if (!player || endpointPreview) return;
		endpointPreview = { time: transportTime, paused: requestedPaused };
		previewBounds = { ...requestedBounds };
		pause();
		previewEndpoint(time);
	}

	function previewEndpoint(time: number) {
		if (endpointPreview) setMediaTime(time, true, true);
	}

	function endEndpointPreview() {
		if (!endpointPreview || !player) return;
		const saved = endpointPreview;
		endpointPreview = undefined;
		previewBounds = undefined;
		setMediaTime(saved.time, saved.paused);
		if (saved.paused || boundsError) pause();
		else void play();
	}

	function changeTimelineRange(next: NumericRange) {
		const changedStart = next.start !== repeatA;
		const changedEnd = next.end !== repeatB;
		previewBounds = {
			start: changedStart ? next.start : requestedBounds.start,
			end: changedEnd ? next.end : requestedBounds.end
		};
		if (changedStart) onstartchange?.(next.start, true);
		if (changedEnd) onendchange?.(next.end, true);
		repeatA = next.start;
		repeatB = next.end;
	}

	$effect(() => {
		if (minimal || !previewRoot || !timelineBox) return;
		const root = previewRoot;
		const timeline = timelineBox;
		const measure = () => {
			playheadHeight = timeline.getBoundingClientRect().top - root.getBoundingClientRect().top;
		};
		const observer = new ResizeObserver(measure);
		observer.observe(root);
		observer.observe(timeline);
		observer.observe(mediaCanvas);
		measure();
		return () => observer.disconnect();
	});

	function publishDuration() {
		// YouTube's cued duration can be rounded. Read the post-playback value,
		// and wait for a quiet interval before showing the first timeline.
		const nextDuration = player.engine?.getDuration() ?? player.duration;
		if (!Number.isFinite(nextDuration) || nextDuration <= 0) return;
		const firstDuration = duration === undefined;
		duration = nextDuration;
		ondurationresolved?.(duration);
		if (!validateBounds()) return;
		if (minimal) playbackScope = scopeChoice.choose(nextDuration, repeatA, repeatB);
		if (
			!navigationScrub &&
			!endpointPreview &&
			(minimal || firstDuration || !requestedPaused) &&
			(player.currentTime < activeBounds.start || player.currentTime > activeBounds.end)
		) {
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
			if (!endpointPreview) pause();
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
		transportTime = currentTime;
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
		if (navigationScrub || endpointPreview) {
			player.pause();
			return;
		}
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
		// YouTube observations can arrive from the previous seek. Keep requested
		// display time until acknowledgement, with a bounded recovery window.
		if (navigationScrub || endpointPreview) return;
		const observed = player.currentTime;
		if (
			pendingSeek &&
			Math.abs(observed - pendingSeek.time) > 0.35 &&
			Date.now() - pendingSeek.requestedAt < 2000
		)
			return;
		pendingSeek = undefined;
		currentTime = observed;
		transportTime = observed;
		if (!minimal && requestedPaused) return;
		const action = playbackBoundaryAction(currentTime, activeBounds, loop, !player.paused);
		if (action === 'clamp-start') seek(activeBounds.start);
		else if (action === 'repeat') seek(activeBounds.start, false);
		else if (action === 'stop') {
			pause();
			if (currentTime > activeBounds.end) seek(activeBounds.end, true);
		}
	}

	function handleEnded() {
		if (navigationScrub || endpointPreview || boundsError) return;
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
		cancelVideoGesture?.();
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
		if (endpoint === 'start') onstartchange?.(value, true);
		else onendchange?.(value, true);
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
			if (minimal) seek(player.currentTime + numFrames / framerate, true);
			else navigateSource(currentTime + numFrames / framerate);
		};
	}

	function applySource(source: EditorSource) {
		const changed = source.videoId !== youtubeId;
		onsourcechange?.(source.videoId, source.clip);
		if (changed || !source.clip) sourceVersion += 1;
	}

	function discardNavigationScrub() {
		// Teardown has no provider to restore. Invalidate before gesture cleanup.
		navigationScrub = undefined;
		if (scrubFrame) cancelAnimationFrame(scrubFrame);
		scrubFrame = 0;
		cancelVideoGesture?.();
	}

	function resetSource() {
		// A new provider owns bootstrap; never resume the old source from teardown.
		discardNavigationScrub();
		endpointPreview = undefined;
		previewBounds = undefined;
		pendingSeek = undefined;
		scopeChoice.reset();
		playbackScope = 'video';
		clearTimeout(durationTimer);
		metadataReceived = false;
		firstFrameReady = false;
		bootstrapMuted = false;
		duration = undefined;
		ondurationresolved?.(undefined);
		currentTime = repeatA;
		transportTime = repeatA;
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
						<div
							class="watch-timeline"
							style:left={`${controlsBounds.left - visibleBounds.left}px`}
							style:width={`${controlsBounds.width}px`}
							aria-hidden={theater}
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
								style:visibility={titlePlacement.maxHeight < titleMinimumHeight
									? 'hidden'
									: undefined}
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
			<div class="video-surface" aria-hidden="true" bind:this={videoSurface}></div>
			<button
				class="video-toggle editor-playback"
				aria-label={paused ? 'Play video' : 'Pause video'}
				onclick={togglePaused}
			></button>
		{/if}
		{#if !theater && (minimal ? editorPath : viewPath)}
			<a
				class="mode-toggle"
				bind:this={modeToggle}
				class:view-action={!minimal}
				href={minimal ? editorPath : viewPath}
				aria-label={minimal ? 'Switch to edit-first mode' : 'Switch to view-first mode'}
				data-tooltip={minimal ? 'Switch to edit-first mode' : 'Switch to view-first mode'}
			>
				{#if minimal}<IcRoundEdit />{:else}<IcRoundVisibility />{/if}
			</a>
		{/if}
		{@render editorOverlay?.()}
		{#if minimal && playerError}
			<p class="player-error" role="alert">{playerError}</p>
		{/if}
	</div>
{/snippet}

{#snippet preview(layoutControls: Snippet)}
	<div class="editor-preview-content" bind:this={previewRoot}>
		{#if duration}
			<div
				class="editor-playhead-line"
				class:inside-clip={currentTime >= repeatA && currentTime <= repeatB}
				aria-hidden="true"
				style:left={`${Math.max(0, Math.min(1, currentTime / duration)) * 100}%`}
				style:height={`${playheadHeight}px`}
			></div>
		{/if}
		{#snippet corners()}
			<div class="preview-corners">
				<div class="preview-brand">
					<a class="brand" href="/" data-sveltekit-reload title="YouLoop home">
						<img src="/logo.svg" alt="" />YouLoop
					</a>
				</div>
				{@render layoutControls()}
			</div>
			<div class="timestamps">
				<div>{formatVideoTime(currentTime)} / {formatVideoTime(duration)}</div>
				<div>{editorTime(repeatA, subSeconds, 2)}A - {editorTime(repeatB, subSeconds, 2)}B</div>
			</div>
		{/snippet}
		{@render media(corners)}
		<div class="editor-transport">
			<div class="timeline-box" bind:this={timelineBox}>
				{#if duration}
					<EditorTimeline
						{duration}
						{currentTime}
						{transportTime}
						start={repeatA}
						end={repeatB}
						disabled={!metadataReceived}
						onseek={navigateSource}
						onrangechange={changeTimelineRange}
						onpreviewstart={beginEndpointPreview}
						onpreview={previewEndpoint}
						onpreviewend={endEndpointPreview}
					/>
				{/if}
			</div>

			<div class="preview-actions" inert={!metadataReceived}>
				<div class="preview-playback" role="group" aria-label="Player transport">
					<div class="transport-group nc-join" role="group" aria-label="Playback and frames">
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
							aria-label="Prev Frame"
							data-tooltip="Prev Frame"
							onclick={makeStepFrame(-1)}
							disabled={!!boundsError}
							><IcRoundSkipPrevious /><span class="frame-label">Prev Frame</span></button
						>
						<button
							class="transport-frame"
							aria-label="Next Frame"
							data-tooltip="Next Frame"
							onclick={makeStepFrame(1)}
							disabled={!!boundsError}
							><IcRoundSkipNext /><span class="frame-label">Next Frame</span></button
						>
					</div>
					<div class="transport-group nc-join" role="group" aria-label="Speed">
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
					</div>
					<div
						class="transport-group transport-options nc-join"
						role="group"
						aria-label="Sound and loop"
					>
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
						<button
							class="transport-scope"
							aria-label={`${activeScope === 'clip' ? 'A:B' : 'VIDEO'} playback, switch to ${activeScope === 'clip' ? 'VIDEO' : 'A:B'} playback`}
							aria-pressed={activeScope === 'clip'}
							disabled={!range.restricted}
							data-tooltip={activeScope === 'clip' ? 'Play full video' : 'Play only A:B'}
							onclick={toggleTimeline}
							><span class="scope-icon" aria-hidden="true">A:B</span><span class="secondary-label"
								>Clip Only</span
							></button
						>
						<button class="transport-fill" disabled aria-hidden="true" tabindex="-1"></button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/snippet}

{#snippet settings(layoutReset: Snippet)}
	{#if playerError}<p role="alert">{playerError}</p>{/if}
	<div class="controls">
		<section aria-label="Clip settings and sharing" class="settings-section">
			<SourceEditor
				videoId={youtubeId ?? ''}
				startSeconds={repeatA}
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
			{@render editorFeedback?.()}
		</section>
		<fieldset aria-label="Playback" class="settings-section">
			<legend>Playback</legend>
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
		</fieldset>
		<fieldset aria-label="Framing" class="settings-section">
			<legend>Framing</legend>
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
		</fieldset>
	</div>
	{@render layoutReset()}
{/snippet}

{#if minimal}
	{@render media()}
{:else}
	<EditorWorkspace {preview} {settings}>
		{#snippet footer()}
			{@render editorFooter?.(duration !== undefined && !playerError && !boundsError)}
		{/snippet}
	</EditorWorkspace>
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
		touch-action: pan-y pinch-zoom;
		position: absolute;
		inset: 0;
	}
	.watch-overlay {
		--timeline-progress: #f33;
		--timeline-selection: #ffe66d;
		--timeline-overlap: #f07800;
		--timeline-remaining: #aaa;
		position: absolute;
		pointer-events: none;
	}
	.video-title {
		display: flex;
		align-items: center;
		min-height: var(--youloop-control-size);
		user-select: none;
		pointer-events: none;
		position: absolute;
		box-sizing: border-box;
		overflow: hidden;
		overflow-wrap: anywhere;
		margin: 0;
		padding: var(--youloop-control-padding);
		font-size: 0.85rem;
		line-height: 1.5;
		color: white;
		background: var(--youloop-overlay-background);
		border-radius: var(--youloop-control-radius);
	}
	.video-title[data-placement='above'],
	.video-title[data-placement='below'] {
		justify-content: center;
		text-align: center;
	}
	.watch-controls-region {
		position: absolute;
		container-type: inline-size;
		box-sizing: border-box;
		padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right))
			max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left));
		pointer-events: none;
	}
	.watch-controls {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--youloop-control-gap);
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
		width: var(--youloop-control-size);
		min-width: var(--youloop-control-size);
		flex-shrink: 0;
		height: var(--youloop-control-size);
		min-height: var(--youloop-control-size);
		margin: 0;
		padding: var(--youloop-control-padding);
		border: 0;
		border-radius: var(--youloop-control-radius);
		color: white;
		background: var(--youloop-overlay-background);
		cursor: pointer;
		pointer-events: auto;
	}
	.watch-controls:not(:global([data-visible])):not(.paused):not(:has(:focus-visible))
		:is(button, a) {
		pointer-events: none;
	}
	.watch-actions {
		display: flex;
		gap: var(--youloop-control-gap);
		margin-left: auto;
	}
	.watch-controls .watch-time {
		width: auto;
		min-width: var(--youloop-control-size);
		padding: var(--youloop-control-padding);
		gap: var(--youloop-control-gap);
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.watch-controls :global(svg) {
		width: var(--youloop-control-icon-size);
		height: var(--youloop-control-icon-size);
		flex-shrink: 0;
	}
	.time-value {
		display: inline-flex;
		gap: 0.3em;
	}
	.watch-time .time-label {
		color: #ffe66d;
	}
	.watch-controls .watch-time:disabled {
		opacity: 1;
		cursor: default;
	}
	@container (max-width: 360px) {
		.watch-controls .watch-time {
			flex-direction: column;
			gap: 0;
			height: auto;
			min-height: var(--youloop-control-size);
		}
	}
	@container (max-width: 260px) {
		.watch-controls .watch-time {
			flex: 1;
			min-width: var(--youloop-control-size);
			height: auto;
			min-height: var(--youloop-control-size);
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
		background: rgb(90 90 90 / 90%);
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
		right: auto;
		bottom: 0;
		height: 3px;
		display: flex;
		pointer-events: none;
	}
	// Retain the axis for scrubbing when Theater hides the chrome.
	.watch-overlay.theater .watch-timeline {
		visibility: hidden;
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

	.watch-playback,
	.editor-playback {
		pointer-events: none;
	}
	.watch-playback:focus-visible,
	.editor-playback:focus-visible {
		outline: 2px solid white;
		outline-offset: -4px;
	}

	.editor-preview-content {
		--editor-axis-inset-left: max(8px, env(safe-area-inset-left));
		--editor-axis-inset-right: max(8px, env(safe-area-inset-right));
		position: relative;
		display: grid;
		grid-template-rows: minmax(0, 1fr) auto;
		height: 100%;
		min-width: 0;
		min-height: 0;
	}
	.editor-playhead-line {
		position: absolute;
		top: 0;
		width: 2px;
		transform: translateX(-50%);
		background: #f33;
		pointer-events: none;
		z-index: 5;
	}
	.editor-playhead-line.inside-clip {
		background: #f07800;
	}
	.timeline-box {
		/* Reserve the 20px track and its 16px bottom gap before duration settles. */
		min-height: 36px;
	}
	.editor-transport {
		padding: 0 0 max(1rem, env(safe-area-inset-bottom));
		container: transport / inline-size;
	}
	.preview-actions {
		padding-inline: var(--editor-axis-inset-left) var(--editor-axis-inset-right);
		display: flex;
		align-items: center;
	}
	.preview-playback {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--youloop-control-gap);
		width: 100%;
	}
	.transport-group {
		--nc-radius: var(--youloop-control-radius);
		display: flex;
		flex-shrink: 0;
	}
	.transport-options {
		flex-grow: 1;
	}
	.preview-playback button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--youloop-control-gap);
		height: var(--youloop-control-size);
		width: var(--youloop-control-size);
		min-width: var(--youloop-control-size);
		flex-shrink: 0;
		padding: var(--youloop-control-padding);
		margin: 0;
	}
	.preview-playback .transport-fill {
		flex: 1;
		width: auto;
		min-width: 8px;
		padding: 0;
		opacity: 1;
		cursor: default;
	}
	.scope-icon {
		position: relative;
		width: var(--youloop-control-icon-size);
		display: inline-flex;
		justify-content: center;
		font-size: 0.65rem;
		font-weight: bold;
		letter-spacing: -0.04em;
		white-space: nowrap;
	}

	.transport-scope[aria-pressed='false'] .scope-icon::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		width: calc(100% + 4px);
		height: 2px;
		border-radius: 1px;
		background: currentColor;
		transform: translate(-50%, -50%) rotate(45deg);
	}

	.preview-playback .transport-rate {
		display: none;
		width: auto;
		min-width: 5ch;
	}
	// Hidden presets still count as children of nc-join; round the visible end instead.
	.preview-playback .transport-speed {
		width: auto;
		padding-inline: 8px;
		border-start-end-radius: var(--nc-radius);
		border-end-end-radius: var(--nc-radius);
	}
	@container transport (min-width: 1000px) {
		.preview-playback .transport-rate {
			display: inline-flex;
		}
		.preview-playback .transport-speed {
			border-start-end-radius: 0;
			border-end-end-radius: 0;
		}
		.transport-speed .speed-value {
			display: none;
		}
	}
	.preview-playback :global(svg) {
		width: var(--youloop-control-icon-size);
		height: var(--youloop-control-icon-size);
		flex-shrink: 0;
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
	.play-label {
		min-width: 5ch;
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
		.transport-speed :global(svg) {
			display: none;
		}
	}
	@container transport (min-width: 400px) {
		.play-label {
			display: inline;
		}
		.preview-playback .transport-play {
			width: auto;
		}
	}
	@container transport (min-width: 560px) {
		.secondary-label {
			display: inline;
		}
		.preview-playback .transport-sound,
		.preview-playback .transport-loop,
		.preview-playback .transport-scope {
			width: auto;
		}
	}
	@container transport (min-width: 780px) {
		.frame-label {
			display: inline;
		}
		.preview-playback .transport-frame {
			width: auto;
		}
	}
	.preview-corners {
		position: absolute;
		inset: max(8px, env(safe-area-inset-top))
			calc(
				max(8px, env(safe-area-inset-right)) + var(--youloop-control-size) +
					var(--youloop-control-gap)
			)
			auto max(8px, env(safe-area-inset-left));
		z-index: 1;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
		pointer-events: none;
	}
	.mode-toggle {
		position: absolute;
		top: max(8px, env(safe-area-inset-top));
		right: max(8px, env(safe-area-inset-right));
		z-index: 2;
		display: grid;
		place-items: center;
		box-sizing: border-box;
		width: var(--youloop-control-size);
		height: var(--youloop-control-size);
		padding: var(--youloop-control-padding);
		margin: 0;
		border-radius: var(--youloop-control-radius);
		color: white;
		text-decoration: none;
	}
	.mode-toggle::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: var(--youloop-control-radius);
		background: var(--youloop-overlay-background);
		z-index: -1;
	}
	.mode-toggle:hover::before {
		background: rgb(90 90 90 / 90%);
	}
	.mode-toggle:focus-visible {
		outline: 2px solid white;
		outline-offset: 2px;
	}
	.mode-toggle :global(svg) {
		width: var(--youloop-control-icon-size);
		height: var(--youloop-control-icon-size);
	}
	// The eye spans more of its viewBox than the pencil and layout glyphs.
	.mode-toggle.view-action :global(svg) {
		width: 14px;
		height: 14px;
	}
	.mode-toggle::after {
		content: attr(data-tooltip);
		position: absolute;
		right: 0;
		top: calc(100% + 4px);
		width: max-content;
		max-width: min(
			260px,
			calc(100cqw - max(8px, env(safe-area-inset-left)) - max(8px, env(safe-area-inset-right)))
		);
		box-sizing: border-box;
		overflow-wrap: anywhere;
		padding: 6px 8px;
		border-radius: var(--youloop-control-radius);
		background: #222;
		color: white;
		font-size: 0.8rem;
		text-align: left;
		pointer-events: none;
		opacity: 0;
	}
	.mode-toggle:hover::after,
	.mode-toggle:focus::after {
		opacity: 1;
	}
	.preview-brand {
		min-width: 0;
		color: white;
		font-weight: 700;
		font-size: 0.85rem;
	}
	.preview-brand img {
		height: 1.25em;
		width: auto;
	}
	.brand {
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: var(--youloop-control-gap);
		min-height: var(--youloop-control-size);
		padding: var(--youloop-control-padding);
		border-radius: var(--youloop-control-radius);
		background: var(--youloop-overlay-background);
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
	}
	.settings-section > :global(fieldset:last-of-type) {
		margin-bottom: 0;
	}
	fieldset.settings-section {
		border: 1px solid var(--nc-border, #777);
		border-radius: 8px;
		padding: 8px 12px 12px;
		margin: 0;
	}
	.settings-section legend {
		padding-inline: 4px;
		line-height: 1.5rem;
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
		position: absolute;
		inset: auto var(--editor-axis-inset-right) max(8px, env(safe-area-inset-bottom))
			var(--editor-axis-inset-left);
		z-index: 1;
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 4px 8px;
		pointer-events: none;
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
	}
	.timestamps > div {
		display: inline-flex;
		align-items: center;
		box-sizing: border-box;
		min-height: var(--youloop-control-size);
		padding: var(--youloop-control-padding);
		border-radius: var(--youloop-control-radius);
		color: white;
		background: var(--youloop-overlay-background);
		text-shadow: 0 1px 2px rgb(0 0 0 / 60%);
		white-space: nowrap;
	}

	.nc-join {
		width: auto;
		border-radius: var(--nc-radius);
		button {
			min-height: var(--youloop-control-size);
			min-width: var(--youloop-control-size);
			padding: var(--youloop-control-padding);
			margin: 0;
			background: $zinc-550;
			color: white;
			border: 0;
			font-size: 0.85rem;
		}
		button:hover {
			background: $zinc-600;
		}
		button[aria-pressed='true'] {
			background: #454b55;
			box-shadow: inset 0 0 0 1px #ababab;
		}
		button:focus-visible {
			outline: 2px solid #79c0ff;
			outline-offset: -2px;
		}
	}
</style>
