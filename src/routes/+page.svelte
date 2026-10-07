<script lang="ts">
	import Player from '#lib/player/Player.svelte';
	import { onMount } from 'svelte';

	const defaultVideo = 'dt-SqNL4z3w';

	let repeatA = $state(31);
	let repeatB = $state(38);
	let youtubeId = $state(defaultVideo);
	let orientation = $state<'landscape' | 'portrait'>('landscape');
	let urlLoaded = $state(false);

	onMount(() => {
		const url = new URL(window.location.href);
		const video = url.searchParams.get('v');
		orientation = url.searchParams.get('orientation') === 'portrait' ? 'portrait' : 'landscape';

		if (video) {
			youtubeId = video;
			repeatA = Number(url.searchParams.get('a'));
			repeatB = Number(url.searchParams.get('b'));

			if (repeatB <= 0) {
				repeatB = 99999;
			}
		}

		urlLoaded = true;
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
		if (orientation === 'portrait') url.searchParams.set('orientation', orientation);
		else url.searchParams.delete('orientation');
		history.replaceState(null, '', url);
	});
</script>

<main>
	<pre hidden>{JSON.stringify({ repeatA, repeatB }, null, 4)}</pre>

	<a class="secondary" href="https://youtu.be/{youtubeId}">youtu.be/{youtubeId}</a>

	<Player bind:youtubeId bind:repeatA bind:repeatB bind:orientation></Player>

	<hr />
</main>
