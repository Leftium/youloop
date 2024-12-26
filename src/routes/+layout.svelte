<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<main class="container">
	{@render children()}

	<nav>
		<h1>
			<a class="brand" href="/" data-sveltekit-reload><span class="title-text">YouLoop</span></a>
			<small><a href="/about">About</a></small>
		</h1>
	</nav>
</main>

<style>
	.brand {
		color: var(--pico-primary);
		text-decoration: none;
	}

	small {
		font-size: 42%;
		font-weight: normal;
	}
</style>
