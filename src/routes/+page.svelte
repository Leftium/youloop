<script lang="ts">
	import Player from '#lib/player/Player.svelte';
	import { onMount } from 'svelte';

	const defaultVideo = 'dt-SqNL4z3w';

	let repeatA = $state(31);
	let repeatB = $state(38);
	let youtubeId = $state(defaultVideo);
	let urlLoaded = $state(false);

	onMount(() => {
		const url = new URL(window.location.href);
		const video = url.searchParams.get('v');

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
		if (!urlLoaded || repeatB === 99999) return;

		const a = Math.floor(repeatA);
		const b = Math.floor(repeatB);
		history.replaceState(null, '', `/?v=${youtubeId}&a=${a}&b=${b}`);
	});
</script>

<main>
	<pre hidden>{JSON.stringify({ repeatA, repeatB }, null, 4)}</pre>

	<a class="secondary" href="https://youtu.be/{youtubeId}">youtu.be/{youtubeId}</a>

	<Player bind:youtubeId bind:repeatA bind:repeatB></Player>

	<hr />
</main>
