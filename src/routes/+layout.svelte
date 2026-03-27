<script lang="ts">
	import '../app.scss';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<main>
	{@render children()}

	<nav>
		<h1>
			<a class="brand" href="/" data-sveltekit-reload><span class="title-text">YouLoop</span></a>
			<small><a class="secondary" href="/about">About</a></small>
		</h1>
	</nav>
</main>

<style>
	:global(:root) {
		--nc-content-width: 1200px;
	}

	nav h1 {
		font-size: 1.75rem;
		margin: 0;
	}

	.brand {
		color: #646b79; /* Pico $zinc-550 — original YouLoop brand color */
		text-decoration: none;
	}

	.brand:hover {
		color: #4d535e; /* Pico $zinc-650 */
	}

	small {
		font-size: 42%;
		font-weight: normal;
	}
</style>
