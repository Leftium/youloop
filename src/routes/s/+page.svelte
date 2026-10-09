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

		let previousScrollY = window.scrollY;
		function recycleScroll() {
			const scrollY = window.scrollY;
			const movingDown = scrollY > previousScrollY;
			previousScrollY = scrollY;
			if (!movingDown) return;

			const root = document.scrollingElement;
			const viewportHeight = window.innerHeight;
			if (!root || viewportHeight <= 0) return;
			const maxScrollY = root.scrollHeight - root.clientHeight;
			const recycleAt = maxScrollY - 7 * viewportHeight;
			// Keep the landing below the trigger even if rotation leaves less scroll room.
			const resetTo = Math.min(4 * viewportHeight, recycleAt - viewportHeight);
			if (scrollY < recycleAt || resetTo <= 0) return;

			// The jump's scroll event must not count as new downward progress.
			previousScrollY = resetTo;
			window.scrollTo({ top: resetTo, behavior: 'instant' });
		}
		window.addEventListener('scroll', recycleScroll, { passive: true });
		return () => {
			window.removeEventListener('scroll', recycleScroll);
			controller.dispose();
		};
	});
</script>

<svelte:head>
	<title>YouLoop - Share player prototype</title>
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

<div class="share-prototype bleed-full">
	<div class="stage">
		<Player
			minimal
			bind:youtubeId
			bind:repeatA
			bind:repeatB
			{orientation}
			{sourceAspectRatio}
			{fillFrame}
		/>
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
		/* Use the expanded viewport from first paint to avoid toolbar-driven resizing. */
		height: 100lvh;
		min-height: 1px;
		background: #000;
		overflow: hidden;
	}
	.scroll-runway {
		/* Bounded scroll room is recycled before its end; no UI lives below. */
		height: 2000svh;
		pointer-events: none;
	}
</style>
