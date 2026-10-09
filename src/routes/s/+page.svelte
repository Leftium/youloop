<script lang="ts">
	import { onMount } from 'svelte';
	import Player from '#lib/player/Player.svelte';
	import {
		createOrientationController,
		parseOrientation,
		type Orientation
	} from '#lib/player/youtube-orientation.ts';

	// The old editor continues to own the main route. This page only tests viewport
	// sizing and native document scrolling (particularly Safari's collapsing toolbar).
	let youtubeId = $state('dt-SqNL4z3w');
	let repeatA = $state(31);
	let repeatB = $state(38);
	let orientation = $state<Orientation>('landscape');
	let sourceOrientation = $state<Orientation>('landscape');
	let sourceAspectRatio = $state(16 / 9);
	let fillFrame = $derived(orientation !== sourceOrientation);
	let viewportHeight = $state<'100dvh' | '100svh' | '100lvh'>('100dvh');
	let iframeHeight = $state<'16000px' | '4000px' | '100%'>('16000px');

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		youtubeId = params.get('v') || youtubeId;
		if (params.has('v')) {
			const a = Number(params.get('a'));
			const b = Number(params.get('b'));
			repeatA = Number.isFinite(a) && a >= 0 ? a : 0;
			repeatB = Number.isFinite(b) && b > repeatA ? b : 99999;
		}
		const controller = createOrientationController((frame, _override, source) => {
			orientation = frame;
			if (source) {
				sourceOrientation = source.orientation;
				sourceAspectRatio =
					source.aspectRatio ?? (source.orientation === 'portrait' ? 9 / 16 : 16 / 9);
			}
		});
		controller.setSource(youtubeId, parseOrientation(params.get('orientation')));
		return () => controller.dispose();
	});
</script>

<svelte:head>
	<title>YouLoop - Share player prototype</title>
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

<div class="share-prototype bleed-full">
	<div
		class="stage"
		class:no-crop={iframeHeight === '100%'}
		style:height={viewportHeight}
		style:--youtube-iframe-height={iframeHeight}
	>
		<Player
			minimal
			bind:youtubeId
			bind:repeatA
			bind:repeatB
			{orientation}
			{sourceAspectRatio}
			fillFrame={iframeHeight === '100%' ? false : fillFrame}
		/>
		<!-- Temporary controls stay mounted throughout the physical Safari comparison. -->
		<aside class="diagnostics" aria-label="Safari jitter comparison">
			<label for="viewport-height">Viewport</label>
			<select id="viewport-height" bind:value={viewportHeight}>
				<option value="100dvh">100dvh - dynamic (current)</option>
				<option value="100svh">100svh - stable</option>
				<option value="100lvh">100lvh - stable maximum</option>
			</select>
			<label for="iframe-height">Iframe</label>
			<select id="iframe-height" bind:value={iframeHeight}>
				<option value="16000px">16000px - cropped (current)</option>
				<option value="4000px">4000px - cropped (reduced)</option>
				<option value="100%">100% - no crop</option>
			</select>
			<p>100% disables cropping; YouTube chrome may show.</p>
		</aside>
	</div>
	<!-- Native root-document scroll range; not a nested scroll panel. -->
	<div class="scroll-runway" aria-hidden="true"></div>
</div>

<style>
	:global(html:has(.share-prototype)) {
		margin: 0;
		padding: 0;
		/* Hide the scroll indicator, not the actual document scroll. */
		scrollbar-width: none;
	}
	:global(html:has(.share-prototype)::-webkit-scrollbar) {
		display: none;
	}
	:global(body:has(.share-prototype)) {
		margin: 0;
		padding: 0;
		max-width: none;
		background: #000;
	}
	.share-prototype {
		width: 100%;
		background: #000;
	}
	.stage {
		position: sticky;
		top: 0;
		width: 100%;
		height: 100dvh;
		min-height: 1px;
		background: #000;
		overflow: hidden;
	}
	.stage.no-crop {
		--youtube-iframe-width: 100%;
		--youtube-iframe-position: 0;
		--youtube-iframe-transform: none;
	}
	.diagnostics {
		position: absolute;
		top: max(0.5rem, env(safe-area-inset-top));
		left: max(0.5rem, env(safe-area-inset-left));
		right: max(0.5rem, env(safe-area-inset-right));
		max-width: 24rem;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.375rem 0.5rem;
		padding: 0.5rem;
		color: white;
		background: rgb(0 0 0 / 80%);
		font-size: 0.875rem;
		line-height: 1.2;
	}
	.diagnostics label {
		align-self: center;
	}
	.diagnostics select {
		min-height: 44px;
		margin: 0;
		padding: 0.25rem 0.5rem;
		color: white;
		background: #222;
		border: 1px solid #777;
	}
	.diagnostics p {
		grid-column: 1 / -1;
		margin: 0;
	}
	.scroll-runway {
		/* Temporary scroll room for Safari toolbar testing; no UI lives below. */
		height: 2000svh;
		pointer-events: none;
	}
</style>
