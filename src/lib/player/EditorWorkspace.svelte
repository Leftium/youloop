<script lang="ts">
	import { onMount, tick, untrack, type Snippet } from 'svelte';
	import IcRoundViewAgenda from '~icons/ic/round-view-agenda';
	import IcRoundRestartAlt from '~icons/ic/round-restart-alt';

	let { preview, settings }: { preview: Snippet<[Snippet]>; settings: Snippet } = $props();
	type Layout = 'columns' | 'rows';
	const storageKey = 'youloop.editor-workspace';
	const dividerSize = 3;
	let grid: HTMLDivElement;
	let runway: HTMLDivElement;
	let runwayHeight = $state<number>();
	let mobile = $state(false);
	let videoScrollRequested = $state(false);
	let videoScroll = $derived(mobile && videoScrollRequested);
	let width = $state(0);
	let height = $state(0);
	let preference = $state<Layout | null>(null);
	let ratios = $state({ columns: 0.62, rows: 0.55 });
	let layout = $derived(width >= 660 ? (preference ?? 'columns') : 'rows');
	let available = $derived(Math.max(0, (layout === 'columns' ? width : height) - dividerSize));
	let minimum = $derived(layout === 'columns' ? 320 : Math.min(240, Math.max(0, available - 110)));
	let maximum = $derived(Math.max(minimum, available - (layout === 'columns' ? 280 : 110)));
	let size = $derived(Math.max(minimum, Math.min(ratios[layout] * available, maximum)));
	let dragging = $state(false);
	let drag: { id: number; target: HTMLElement; origin: number; size: number } | undefined;

	onMount(() => {
		try {
			const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
			if (saved?.layout === 'columns' || saved?.layout === 'rows') preference = saved.layout;
			for (const axis of ['columns', 'rows'] as const) {
				if (Number.isFinite(saved?.ratios?.[axis])) {
					ratios[axis] = Math.max(0, Math.min(1, saved.ratios[axis]));
				}
			}
		} catch {
			// Storage restrictions must not prevent editing or resizing.
		}
		const query = window.matchMedia(
			'(pointer: coarse) and (max-width: 900px), (pointer: coarse) and (max-height: 500px)'
		);
		const updateMobile = () => (mobile = query.matches);
		updateMobile();
		query.addEventListener('change', updateMobile);
		const observer = new ResizeObserver(() => {
			endDrag();
			width = grid.clientWidth;
			height = grid.clientHeight;
		});
		observer.observe(grid);
		return () => {
			query.removeEventListener('change', updateMobile);
			observer.disconnect();
			endDrag();
		};
	});

	$effect(() => {
		void layout;
		untrack(endDrag);
	});

	$effect(() => {
		if (!videoScroll) return;
		// Freeze each runway budget in pixels: viewport changes must not shrink
		// document scroll room. Only mode changes install/remove these listeners.
		return untrack(() => {
			runwayHeight = Math.max(runwayHeight ?? 0, runway.getBoundingClientRect().height);
			let extending = false;
			function extendRunway() {
				const root = document.scrollingElement;
				const viewportHeight = window.innerHeight;
				if (extending || !root || viewportHeight <= 0) return;
				const remaining = root.scrollHeight - root.clientHeight - window.scrollY;
				if (remaining >= 9 * viewportHeight) return;
				extending = true;
				runwayHeight = (runwayHeight ?? 0) + 25 * viewportHeight;
				void tick().then(() => {
					extending = false;
				});
			}
			window.addEventListener('scroll', extendRunway, { passive: true });
			window.addEventListener('resize', extendRunway);
			extendRunway();
			return () => {
				window.removeEventListener('scroll', extendRunway);
				window.removeEventListener('resize', extendRunway);
			};
		});
	});

	function remember() {
		try {
			sessionStorage.setItem(storageKey, JSON.stringify({ layout: preference, ratios }));
		} catch {
			// The layout still works when session storage is unavailable.
		}
	}

	function resize(next: number) {
		if (!available) return;
		ratios[layout] = Math.max(minimum, Math.min(next, maximum)) / available;
		remember();
	}

	// Ported from Vee Next's assessment splitter. Only grid tracks change: the
	// media snippet stays mounted in the same DOM parent through every reflow.
	function startDrag(event: PointerEvent) {
		if (event.button !== 0 || drag) return;
		const target = event.currentTarget as HTMLElement;
		// Focus must not move the document or couple split position to browser chrome.
		target.focus({ preventScroll: true });
		target.setPointerCapture(event.pointerId);
		drag = {
			id: event.pointerId,
			target,
			origin: layout === 'columns' ? event.clientX : event.clientY,
			size
		};
		dragging = true;
		event.preventDefault();
	}

	function moveDrag(event: PointerEvent) {
		if (drag?.id !== event.pointerId) return;
		const position = layout === 'columns' ? event.clientX : event.clientY;
		resize(drag.size + position - drag.origin);
		event.preventDefault();
	}

	function endDrag(event?: PointerEvent) {
		if (!drag || (event && event.pointerId !== drag.id)) return;
		const previous = drag;
		drag = undefined;
		dragging = false;
		if (previous.target.hasPointerCapture(previous.id)) {
			previous.target.releasePointerCapture(previous.id);
		}
	}

	function resizeWithKeyboard(event: KeyboardEvent) {
		const keys = layout === 'columns' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
		if (event.key === 'Home') resize(minimum);
		else if (event.key === 'End') resize(maximum);
		else if (keys.includes(event.key)) {
			resize(
				size + (event.key === keys[0] ? -1 : 1) * (layout === 'columns' ? 16 : available * 0.02)
			);
		} else return;
		event.preventDefault();
	}

	function choose(next: Layout) {
		endDrag();
		preference = next;
		remember();
	}

	function reset() {
		endDrag();
		videoScrollRequested = false;
		preference = null;
		ratios = { columns: 0.62, rows: 0.55 };
		remember();
	}
</script>

{#snippet layoutControls()}
	<div class="workspace-layout" role="group" aria-label="Workspace layout">
		<div class="nc-join layout-modes">
			<button
				aria-label={width < 660
					? 'Side by side (requires a wider preview workspace)'
					: 'Side by side'}
				title={width < 660
					? 'Side by side requires a workspace at least 660px wide'
					: 'Side by side'}
				aria-pressed={layout === 'columns'}
				disabled={width < 660}
				onclick={() => choose('columns')}><IcRoundViewAgenda class="columns-icon" /></button
			>
			<button
				aria-label="Stacked"
				title="Stacked"
				aria-pressed={layout === 'rows'}
				onclick={() => choose('rows')}><IcRoundViewAgenda /></button
			>
		</div>
		<button aria-label="Reset split" title="Reset split" onclick={reset}
			><IcRoundRestartAlt /></button
		>
	</div>
{/snippet}

<section class="editor-workspace" class:video-scroll={videoScroll} aria-label="Editor workspace">
	<div
		class="workspace-grid"
		class:dragging
		data-layout={layout}
		bind:this={grid}
		style:--preview-size={`${size}px`}
		style:--divider-size={`${dividerSize}px`}
	>
		<div id="editor-preview" class="preview-pane" role="region" aria-label="Video preview">
			{@render preview(layoutControls)}
		</div>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<div
			class="splitter"
			role="separator"
			aria-label="Resize video preview"
			aria-controls="editor-preview editor-settings"
			aria-orientation={layout === 'columns' ? 'vertical' : 'horizontal'}
			aria-valuemin={Math.round(minimum)}
			aria-valuemax={Math.round(maximum)}
			aria-valuenow={Math.round(size)}
			aria-valuetext={`${Math.round(available ? (size / available) * 100 : 0)}% preview`}
			tabindex="0"
			onkeydown={resizeWithKeyboard}
			onpointerdown={startDrag}
			onpointermove={moveDrag}
			onpointerup={endDrag}
			onpointercancel={endDrag}
			onlostpointercapture={endDrag}
		></div>
		<!-- The scroll region must be reachable for keyboard scrolling. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			id="editor-settings"
			class="settings-pane"
			role="region"
			aria-label="Clip settings"
			tabindex="0"
		>
			{@render settings()}
			{#if mobile}
				<label class="video-scroll-option">
					<input type="checkbox" bind:checked={videoScrollRequested} />
					Video swipe scrolling (experimental)
				</label>
				<p class="scroll-hint">
					Swipe upward on the picture to try minimizing Safari's toolbar. Controls scroll
					separately. Safari owns toolbar visibility; Reset split exits the experiment.
				</p>
			{/if}
		</div>
	</div>
	<div
		class="video-scroll-runway"
		aria-hidden="true"
		bind:this={runway}
		style:height={runwayHeight === undefined ? undefined : `${runwayHeight}px`}
	></div>
</section>

<style>
	.editor-workspace {
		height: 100dvh;
		min-height: 0;
	}
	.video-scroll-option {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
		margin-top: 1rem;
	}
	.scroll-hint {
		font-size: 0.8rem;
		margin: 0;
	}
	.video-scroll-runway {
		display: none;
	}
	.video-scroll {
		height: auto;
		overflow-anchor: none;
	}
	.video-scroll .workspace-grid {
		position: sticky;
		top: 0;
		/* Fill space freed by browser chrome. The observer reconciles the split
		   from its existing ratio without remounting the provider. */
		height: 100dvh;
	}
	.video-scroll .video-scroll-runway {
		display: block;
		/* Native picture scroll room grows in pixel chunks before its end,
		   following watch mode. Controls keep their separate scroll container. */
		height: 2500svh;
		pointer-events: none;
	}
	.video-scroll .settings-pane {
		/* Suppress both boundary chaining and rubber-band affordances where
		   supported. Safari can still react to nested gestures independently. */
		overscroll-behavior-y: none;
	}
	.workspace-layout {
		display: flex;
		gap: 0.4rem;
		margin-left: auto;
	}
	.layout-modes {
		display: flex;
	}
	.workspace-layout button {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		padding: 0;
		margin: 0;
		border: 0;
		background: #646b79;
		color: white;
	}
	.workspace-layout button:hover:not(:disabled) {
		background: #5c6370;
	}
	.workspace-layout button:focus-visible {
		outline: 2px solid #646b79;
		outline-offset: 2px;
	}
	.workspace-layout :global(svg) {
		width: 24px;
		height: 24px;
	}
	.workspace-layout :global(.columns-icon) {
		transform: rotate(90deg);
	}
	.workspace-layout button[aria-pressed='false'] :global(svg) {
		opacity: 0.4;
	}
	.workspace-grid {
		display: grid;
		height: 100%;
		min-width: 0;
		min-height: 0;
		grid-template-columns: minmax(0, var(--preview-size)) var(--divider-size) minmax(0, 1fr);
		grid-template-rows: minmax(0, 1fr);
	}
	.workspace-grid[data-layout='rows'] {
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: minmax(0, var(--preview-size)) var(--divider-size) minmax(0, 1fr);
	}
	.preview-pane,
	.settings-pane {
		min-width: 0;
		min-height: 0;
	}
	.settings-pane {
		/* Keep pane boundary gestures from chaining into the document where supported. */
		overscroll-behavior-y: contain;
		overflow-y: auto;
		overflow-x: hidden;
		padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
			max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
		overflow-wrap: anywhere;
		scrollbar-gutter: stable;
	}
	.splitter {
		position: relative;
		z-index: 2;
		cursor: col-resize;
		/* Resizing owns the gesture; native panning would cancel the resize pointers. */
		touch-action: none;
	}
	.splitter::before,
	.splitter::after {
		content: '';
		position: absolute;
	}
	.splitter::before {
		inset: 0;
		background: var(--nc-border, #ababab);
	}
	/* The thin track has a 27px hit area; pane padding keeps controls clear. */
	.splitter::after {
		inset: 0 -12px;
	}
	[data-layout='rows'] .splitter {
		cursor: row-resize;
	}
	[data-layout='rows'] .splitter::after {
		inset: -12px 0;
	}
	.splitter:focus-visible {
		outline: 2px solid #01aaff;
		outline-offset: 0;
	}
	.splitter:focus-visible::before,
	.splitter:hover::before,
	.dragging .splitter::before {
		background: #01aaff;
	}
	.dragging {
		user-select: none;
	}
	.dragging :global(.preview-pane) {
		pointer-events: none;
	}
</style>
