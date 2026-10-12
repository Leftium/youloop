<script lang="ts">
	import '../app.scss';
	import SocialHead from '#lib/SocialHead.svelte';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<svelte:head>
	<!-- viewport-fit=cover clipped the centered YouTube iframe on physical iPhone Safari. -->
	<meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

{#if data.social}
	<SocialHead metadata={data.social} />
{/if}

{#if page.route.id === '/s' || page.route.id === '/[videoId=videoId]'}
	{@render children()}
{:else if page.route.id === '/'}
	<main class="editor-page">{@render children()}</main>
{:else}
	<main>
		{@render children()}

		<nav>
			<h1>
				<a class="brand" href="/" data-sveltekit-reload
					><img src="/logo.svg" alt="" class="brand-logo" /><span class="title-text">YouLoop</span
					></a
				>
			</h1>
		</nav>
	</main>
{/if}

<style>
	:global(:root) {
		--nc-content-width: 1200px;
	}

	:global(html:has(.editor-page)),
	:global(body:has(.editor-page)) {
		margin: 0;
		padding: 0;
		max-width: none;
		scrollbar-gutter: auto;
	}

	:global(body:has(.editor-page)) {
		display: block;
		/* Keep exposed document edges in the editor's theme during Safari UI changes. */
		background: var(--nc-surface-1);
	}

	:global(html:has(.editor-page .video-scroll)),
	:global(body:has(.editor-page .video-scroll)) {
		/* Match native scroll room to controls so Safari UI transitions do not
		   expose a contrasting document strip below the pinned workspace. */
		background: var(--nc-surface-2);
	}

	.editor-page {
		width: 100%;
		max-width: none;
		height: 100dvh;
		margin: 0;
		padding: 0;
		overflow: hidden;
	}

	.editor-page:has(:global(.video-scroll)) {
		height: auto;
		overflow: visible;
	}
	/* Hide the runway indicator while keeping native scrolling and the pane scrollbar. */
	:global(html:has(.video-scroll)) {
		scrollbar-width: none;
	}
	:global(html:has(.video-scroll)::-webkit-scrollbar) {
		display: none;
	}

	nav h1 {
		font-size: 1.75rem;
		margin: 0;
	}

	.brand-logo {
		height: 1em;
		width: auto;
		vertical-align: middle;
		margin-right: 0.25em;
	}

	.brand {
		color: #646b79; /* Pico $zinc-550 — original YouLoop brand color */
		text-decoration: none;
	}

	.brand:hover {
		color: #4d535e; /* Pico $zinc-650 */
	}
</style>
