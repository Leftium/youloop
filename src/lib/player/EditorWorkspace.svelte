<script lang="ts">
	import { onMount, untrack, type Snippet } from 'svelte';

	let { preview, settings }: { preview: Snippet; settings: Snippet } = $props();
	type Layout = 'columns' | 'rows';
	const storageKey = 'youloop.editor-workspace';
	const dividerSize = 24;
	let grid: HTMLDivElement;
	let width = $state(0);
	let height = $state(0);
	let preference = $state<Layout | null>(null);
	let ratios = $state({ columns: 0.62, rows: 0.42 });
	let layout = $derived(width >= 660 ? (preference ?? 'columns') : 'rows');
	let available = $derived(Math.max(0, (layout === 'columns' ? width : height) - dividerSize));
	let minimum = $derived(Math.min(layout === 'columns' ? 240 : 100, available / 2));
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
		const observer = new ResizeObserver(() => {
			endDrag();
			width = grid.clientWidth;
			height = grid.clientHeight;
		});
		observer.observe(grid);
		return () => {
			observer.disconnect();
			endDrag();
		};
	});

	$effect(() => {
		void layout;
		untrack(endDrag);
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
		target.focus();
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
		preference = null;
		ratios = { columns: 0.62, rows: 0.42 };
		remember();
	}
</script>

<section class="editor-workspace" aria-label="Editor workspace">
	<div class="workspace-toolbar" role="group" aria-label="Workspace layout">
		<button
			aria-pressed={layout === 'columns'}
			disabled={width < 660}
			onclick={() => choose('columns')}>Side by side</button
		>
		<button aria-pressed={layout === 'rows'} onclick={() => choose('rows')}>Stacked</button>
		<button onclick={reset}>Reset split</button>
	</div>
	<div
		class="workspace-grid"
		class:dragging
		data-layout={layout}
		bind:this={grid}
		style:--preview-size={`${size}px`}
		style:--divider-size={`${dividerSize}px`}
	>
		<div id="editor-preview" class="preview-pane" role="region" aria-label="Video preview">
			{@render preview()}
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
		</div>
	</div>
</section>

<style>
	.editor-workspace {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: 0.5rem;
		height: calc(100dvh - 6rem);
		min-height: 240px;
	}
	.workspace-toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.workspace-toolbar button {
		margin: 0;
		padding: 0.4rem 0.6rem;
		min-height: 44px;
		font-size: 0.85rem;
	}
	.workspace-toolbar button[aria-pressed='true'] {
		outline: 2px solid currentColor;
		outline-offset: -4px;
	}
	.workspace-grid {
		display: grid;
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
		overflow-y: auto;
		overflow-x: hidden;
		padding: 0.5rem;
		padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
		overflow-wrap: anywhere;
		scrollbar-gutter: stable;
	}
	.splitter {
		display: grid;
		place-items: center;
		cursor: col-resize;
		touch-action: none;
	}
	.splitter::after {
		content: '';
		width: 4px;
		height: 36px;
		border-radius: 2px;
		background: #646b79;
	}
	[data-layout='rows'] .splitter {
		cursor: row-resize;
	}
	[data-layout='rows'] .splitter::after {
		width: 36px;
		height: 4px;
	}
	.splitter:focus-visible,
	.splitter:hover,
	.dragging .splitter {
		outline: 2px solid #01aaff;
		outline-offset: -2px;
	}
	.dragging {
		user-select: none;
	}
	.dragging :global(.preview-pane) {
		pointer-events: none;
	}
</style>
