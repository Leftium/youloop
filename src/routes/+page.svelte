<script lang="ts">
	import '../app.scss';
	import Player from '$lib/player/Player.svelte';

	let { data } = $props();

	let repeatA = $state(data.repeatA);
	let repeatB = $state(data.repeatB);
	let youtubeId = $state(data.youtubeId);

	$effect(() => {
		const a = Math.floor(repeatA);
		const b = Math.floor(repeatB);
		history.replaceState(null, '', `/?v=${youtubeId}&a=${a}&b=${b}`);
	});
</script>

<main class="container">
	<pre hidden>{JSON.stringify({ repeatA, repeatB }, null, 4)}</pre>

	<a href="https://youtu.be/{youtubeId}">youtu.be/{youtubeId}</a>

	<Player bind:youtubeId bind:repeatA bind:repeatB></Player>
</main>
