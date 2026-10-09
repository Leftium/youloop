<script lang="ts">
	import Player from '#lib/player/Player.svelte';
	import { onMount, untrack } from 'svelte';
	import {
		createOrientationController,
		parseOrientation,
		type Orientation
	} from '#lib/player/youtube-orientation.ts';

	const defaultVideo = 'dt-SqNL4z3w';

	let repeatA = $state(31);
	let repeatB = $state(38);
	let youtubeId = $state(defaultVideo);
	let orientation = $state<Orientation>('landscape');
	let orientationOverride = $state<Orientation | null>(null);
	let fillFrame = $state(false);
	let orientationController: ReturnType<typeof createOrientationController>;
	let urlLoaded = $state(false);

	onMount(() => {
		const url = new URL(window.location.href);
		const video = url.searchParams.get('v');
		const override = parseOrientation(url.searchParams.get('orientation'));
		fillFrame = url.searchParams.get('fit') === 'cover';

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

		const a = Math.floor(repeatA);
		const b = Math.floor(repeatB);
		const url = new URL(window.location.href);
		url.searchParams.set('v', youtubeId);
		url.searchParams.set('a', String(a));
		if (repeatB !== 99999) url.searchParams.set('b', String(b));
		else url.searchParams.delete('b');
		if (orientationOverride) url.searchParams.set('orientation', orientationOverride);
		else url.searchParams.delete('orientation');
		if (fillFrame) url.searchParams.set('fit', 'cover');
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
		bind:fillFrame
		onorientationchange={(value) => orientationController.choose(value)}
		onsourcechange={(videoId) => orientationController.setSource(videoId, null, true)}
	></Player>

	<hr />
</main>
