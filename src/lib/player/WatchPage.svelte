<script lang="ts">
	import { onMount, tick } from 'svelte';
	import ClipPlayer from './ClipPlayer.svelte';

	// Keep production defaults until physical-device toolbar testing supports a change.
	const THEATER_SCROLL_TRIGGER_PX = 32;
	const RUNWAY_EXTENSION_TRIGGER_VIEWPORTS = 9;
	const RUNWAY_EXTENSION_INCREMENT_VIEWPORTS = 25;

	let theater = $state(false);
	let runway: HTMLDivElement;

	function enterTheater() {
		theater = true;
		// This advances the native document, but Safari owns browser-chrome collapse.
		window.scrollBy({ top: Math.max(80, window.innerHeight / 3), behavior: 'smooth' });
	}
	let runwayHeight = $state<number>();

	onMount(() => {
		// Freeze the initial CSS height in pixels so rotation never shrinks the runway.
		runwayHeight = runway.getBoundingClientRect().height;
		let extensionTrigger = RUNWAY_EXTENSION_TRIGGER_VIEWPORTS;
		let extensionIncrement = RUNWAY_EXTENSION_INCREMENT_VIEWPORTS;
		if (import.meta.env.DEV) {
			// Local #34 trials only: ignored by production and excluded from shared clip state.
			const trial = new URLSearchParams(window.location.search).get('watchRunway');
			if (trial === 'small' || trial === 'balanced' || trial === 'coarse') {
				runwayHeight = 4 * window.innerHeight;
				extensionTrigger = 1;
				extensionIncrement = trial === 'small' ? 8 : trial === 'balanced' ? 25 : 50;
			}
		}
		let extending = false;
		function extendRunway() {
			if (extending) return;
			const root = document.scrollingElement;
			const viewportHeight = window.innerHeight;
			if (!root || viewportHeight <= 0) return;
			const remaining = root.scrollHeight - root.clientHeight - window.scrollY;
			if (remaining >= extensionTrigger * viewportHeight) return;

			// Wait for the larger height to reach the DOM before checking the threshold again.
			extending = true;
			runwayHeight =
				(runwayHeight ?? runway.getBoundingClientRect().height) +
				extensionIncrement * viewportHeight;
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
		window.addEventListener('scroll', handleScroll, { passive: true });
		window.addEventListener('resize', extendRunway);
		extendRunway();
		return () => {
			window.removeEventListener('scroll', handleScroll);
			window.removeEventListener('resize', extendRunway);
		};
	});
</script>

<div class="share-prototype" data-mode={theater ? 'theater' : 'default'}>
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
</div>

<style>
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
		/* Initial scroll room; larger pixel heights are applied in chunks before its end. */
		height: 2000svh;
		pointer-events: none;
	}
</style>
