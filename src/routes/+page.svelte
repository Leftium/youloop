<script lang="ts">
	import Player from '#lib/player/Player.svelte';
	import { onMount, untrack } from 'svelte';
	import {
		createOrientationController,
		loadOriginalAspect,
		parseOrientation,
		type Orientation
	} from '#lib/player/youtube-orientation.ts';

	const defaultVideo = 'dt-SqNL4z3w';

	let repeatA = $state(31);
	let repeatB = $state(38);
	let youtubeId = $state(defaultVideo);
	let orientation = $state<Orientation>('landscape');
	let orientationOverride = $state<Orientation | null>(null);
	let sourceOrientation = $state<Orientation>('landscape');
	let originalAspectRatio = $state<number | null>(null);
	// null means automatic framing; an explicit choice survives page reloads.
	let fillOverride = $state<boolean | null>(null);
	let fillFrame = $derived(fillOverride ?? orientation !== sourceOrientation);
	let sourceAspectRatio = $derived(
		originalAspectRatio ?? (sourceOrientation === 'portrait' ? 9 / 16 : 16 / 9)
	);
	let orientationController: ReturnType<typeof createOrientationController>;
	let urlLoaded = $state(false);

	onMount(() => {
		const url = new URL(window.location.href);
		const video = url.searchParams.get('v');
		const override = parseOrientation(url.searchParams.get('orientation'));
		const requestedFit = url.searchParams.get('fit');
		fillOverride = requestedFit === 'cover' ? true : requestedFit === 'contain' ? false : null;

		if (video) {
			youtubeId = video;
			repeatA = Number(url.searchParams.get('a'));
			repeatB = Number(url.searchParams.get('b'));

			if (repeatB <= 0) {
				repeatB = 99999;
			}
		}

		orientationController = createOrientationController((value, override) => {
			orientation = value;
			orientationOverride = override;
			// Preserve source orientation after the user chooses a different frame.
			// An original-aspect thumbnail can refine this independently.
			if (override === null && originalAspectRatio === null) sourceOrientation = value;
		});
		orientationController.setSource(youtubeId, override);
		urlLoaded = true;
		return () => orientationController.dispose();
	});

	$effect(() => {
		if (!urlLoaded) return;
		const videoId = youtubeId;
		untrack(() => orientationController.setSource(videoId));
	});

	$effect(() => {
		if (!urlLoaded) return;
		const videoId = youtubeId;
		originalAspectRatio = null;
		let active = true;
		void loadOriginalAspect(videoId).then((dimensions) => {
			if (
				!active ||
				!dimensions ||
				dimensions.width <= 120 ||
				dimensions.height <= 90 ||
				!Number.isFinite(dimensions.width) ||
				!Number.isFinite(dimensions.height)
			) {
				return;
			}
			originalAspectRatio = dimensions.width / dimensions.height;
			sourceOrientation = dimensions.height > dimensions.width ? 'portrait' : 'landscape';
		});
		return () => {
			active = false;
		};
	});

	$effect(() => {
		if (!urlLoaded) return;

		const a = Math.floor(repeatA);
		const b = Math.floor(repeatB);
		const url = new URL(window.location.href);
		url.searchParams.set('v', youtubeId);
		url.searchParams.set('a', String(a));
		if (repeatB !== 99999) url.searchParams.set('b', String(b));
		else url.searchParams.delete('b');
		if (orientationOverride) url.searchParams.set('orientation', orientationOverride);
		else url.searchParams.delete('orientation');
		if (fillOverride === true) url.searchParams.set('fit', 'cover');
		else if (fillOverride === false) url.searchParams.set('fit', 'contain');
		else url.searchParams.delete('fit');
		history.replaceState(null, '', url);
	});
</script>

<main>
	<pre hidden>{JSON.stringify({ repeatA, repeatB }, null, 4)}</pre>

	<a class="secondary" href="https://youtu.be/{youtubeId}">youtu.be/{youtubeId}</a>

	<Player
		bind:youtubeId
		bind:repeatA
		bind:repeatB
		{orientation}
		{fillFrame}
		{sourceAspectRatio}
		onfillchange={(value) => (fillOverride = value)}
		onorientationchange={(value) => {
			fillOverride = null;
			orientationController.choose(value);
		}}
		onsourcechange={(videoId) => {
			fillOverride = null;
			originalAspectRatio = null;
			sourceOrientation = 'landscape';
			orientationController.setSource(videoId, null, true);
		}}
	></Player>

	<hr />
</main>
