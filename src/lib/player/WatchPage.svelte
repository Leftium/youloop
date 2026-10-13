<script lang="ts">
	import { onMount, tick } from 'svelte';
	import ClipPlayer from './ClipPlayer.svelte';

	// Match the editor's native 20px snap spacing on coarse-pointer mobile layouts.
	// The short runway and snap points are complementary, independent behaviors.
	const THEATER_SCROLL_TRIGGER_PX = 32;
	const INITIAL_RUNWAY_VIEWPORTS = 4;
	const RUNWAY_EXTENSION_TRIGGER_VIEWPORTS = 1;
	const RUNWAY_EXTENSION_INCREMENT_VIEWPORTS = 25;
	const SNAP_SPACING_PX = 20;

	let theater = $state(false);
	let runway: HTMLDivElement;
	let snapEnabled = $state(false);
	let viewportHeight = $state(0);
	let runwayHeight = $state<number>();
	let snapPointCount = $derived(
		snapEnabled ? Math.floor(((runwayHeight ?? 0) + viewportHeight) / SNAP_SPACING_PX) + 1 : 0
	);

	function enterTheater() {
		theater = true;
		// This advances the native document, but Safari owns browser-chrome collapse.
		window.scrollBy({ top: Math.max(80, window.innerHeight / 3), behavior: 'smooth' });
	}

	onMount(() => {
		const query = window.matchMedia(
			'(pointer: coarse) and (max-width: 900px), (pointer: coarse) and (max-height: 500px)'
		);
		const updateSnapMode = () => (snapEnabled = query.matches);
		updateSnapMode();
		query.addEventListener('change', updateSnapMode);

		// Freeze the runway budget in pixels so rotation never shrinks it.
		viewportHeight = window.innerHeight;
		runwayHeight = INITIAL_RUNWAY_VIEWPORTS * viewportHeight;
		let extending = false;
		function extendRunway() {
			if (extending) return;
			const root = document.scrollingElement;
			const viewportHeight = window.innerHeight;
			if (!root || viewportHeight <= 0) return;
			const remaining = root.scrollHeight - root.clientHeight - window.scrollY;
			if (remaining >= RUNWAY_EXTENSION_TRIGGER_VIEWPORTS * viewportHeight) return;

			// Wait for the larger height to reach the DOM before checking the threshold again.
			extending = true;
			runwayHeight =
				(runwayHeight ?? runway.getBoundingClientRect().height) +
				RUNWAY_EXTENSION_INCREMENT_VIEWPORTS * viewportHeight;
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
				if (Math.abs(travel) >= THEATER_SCROLL_TRIGGER_PX) {
					theater = travel > 0;
					travel = 0;
				}
			}
			extendRunway();
		}
		const handleResize = () => {
			viewportHeight = window.innerHeight;
			extendRunway();
		};
		window.addEventListener('scroll', handleScroll, { passive: true });
		window.addEventListener('resize', handleResize);
		extendRunway();
		return () => {
			query.removeEventListener('change', updateSnapMode);
			window.removeEventListener('scroll', handleScroll);
			window.removeEventListener('resize', handleResize);
		};
	});
</script>

<div
	class="share-prototype"
	class:document-snap={snapEnabled}
	data-mode={theater ? 'theater' : 'default'}
>
	<div class="stage">
		<ClipPlayer minimal {theater} ontheater={enterTheater} />
	</div>
	<!-- Native root-document scroll range; not a nested scroll panel. -->
	<div
		class="scroll-runway"
		aria-hidden="true"
		bind:this={runway}
		style:height={runwayHeight === undefined ? undefined : `${runwayHeight}px`}
	></div>
	{#if snapEnabled}
		<div class="document-snap-points" aria-hidden="true">
			{#each Array.from({ length: snapPointCount }, (_, index) => index) as index (index)}
				<span class="document-snap-point" style:top={`${index * SNAP_SPACING_PX}px`}></span>
			{/each}
		</div>
	{/if}
</div>

<style>
	:global(html:has(.share-prototype.document-snap)) {
		scroll-snap-type: y mandatory;
	}
	.document-snap-points {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.document-snap-point {
		position: absolute;
		left: 0;
		width: 1px;
		height: 1px;
		scroll-snap-align: start;
		scroll-snap-stop: always;
	}
	:global(html:has(.share-prototype)) {
		margin: 0;
		padding: 0;
		scrollbar-gutter: auto;
		/* Hide the scroll indicator, not the actual document scroll. */
		scrollbar-width: none;
	}
	:global(html:has(.share-prototype)::-webkit-scrollbar) {
		display: none;
	}
	:global(body:has(.share-prototype)) {
		/* The immersive document has one viewport-wide column, not the editor's body grid. */
		display: block;
		margin: 0;
		padding: 0;
		width: 100%;
		max-width: none;
		background: #000;
	}
	.share-prototype {
		/* Override Nimble's body-child gutters without a grid-spanning bleed utility. */
		position: relative;
		margin: 0;
		padding: 0;
		width: 100%;
		min-width: 0;
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
		/* Initial four-small-viewport SSR budget; hydration uses four current viewports. */
		height: 400svh;
		pointer-events: none;
	}
</style>
