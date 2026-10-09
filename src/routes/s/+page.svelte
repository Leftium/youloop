<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Player from '#lib/player/Player.svelte';
	import {
		createOrientationController,
		parseOrientation,
		type Orientation
	} from '#lib/player/youtube-orientation.ts';

	// The editor keeps the main route; this watch view shares its playback state machine.
	let youtubeId = $state('dt-SqNL4z3w');
	let repeatA = $state(31);
	let repeatB = $state(38);
	let orientation = $state<Orientation>('landscape');
	let sourceOrientation = $state<Orientation>('landscape');
	let sourceAspectRatio = $state(16 / 9);
	let fillFrame = $derived(orientation !== sourceOrientation);
	let theater = $state(false);
	let runway: HTMLDivElement;

	function enterTheater() {
		theater = true;
		// This advances the native document, but Safari owns browser-chrome collapse.
		window.scrollBy({ top: Math.max(80, window.innerHeight / 3), behavior: 'smooth' });
	}
	let runwayHeight = $state<number>();

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

		// Freeze the initial CSS height in pixels so rotation never shrinks the runway.
		runwayHeight = runway.getBoundingClientRect().height;
		let extending = false;
		function extendRunway() {
			if (extending) return;
			const root = document.scrollingElement;
			const viewportHeight = window.innerHeight;
			if (!root || viewportHeight <= 0) return;
			const remaining = root.scrollHeight - root.clientHeight - window.scrollY;
			if (remaining >= 9 * viewportHeight) return;

			// Wait for the larger height to reach the DOM before checking the threshold again.
			extending = true;
			runwayHeight = (runwayHeight ?? runway.getBoundingClientRect().height) + 25 * viewportHeight;
			void tick().then(() => {
				extending = false;
			});
		}
		let lastScroll = window.scrollY;
		let travel = 0;
		function handleScroll() {
			const next = Math.max(0, window.scrollY);
			const delta = next - lastScroll;
			lastScroll = next;
			if (!document.fullscreenElement && delta !== 0) {
				// Direction and accumulated travel survive runway extension and arbitrary offsets.
				travel = Math.sign(delta) === Math.sign(travel) ? travel + delta : delta;
				if (Math.abs(travel) >= 32) {
					theater = travel > 0;
					travel = 0;
				}
			}
			extendRunway();
		}
		window.addEventListener('scroll', handleScroll, { passive: true });
		window.addEventListener('resize', extendRunway);
		extendRunway();
		return () => {
			window.removeEventListener('scroll', handleScroll);
			window.removeEventListener('resize', extendRunway);
			controller.dispose();
		};
	});
</script>

<svelte:head>
	<title>YouLoop - Watch</title>
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

<div class="share-prototype bleed-full" data-mode={theater ? 'theater' : 'default'}>
	<div class="stage">
		<Player
			minimal
			{theater}
			ontheater={enterTheater}
			bind:youtubeId
			bind:repeatA
			bind:repeatB
			{orientation}
			{sourceAspectRatio}
			{fillFrame}
		/>
	</div>
	<!-- Native root-document scroll range; not a nested scroll panel. -->
	<div
		class="scroll-runway"
		aria-hidden="true"
		bind:this={runway}
		style:height={runwayHeight === undefined ? undefined : `${runwayHeight}px`}
	></div>
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
		/* Initial scroll room; larger pixel heights are applied in chunks before its end. */
		height: 2000svh;
		pointer-events: none;
	}
</style>
