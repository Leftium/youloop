<script lang="ts">
	import { onMount, tick, untrack, type Snippet } from 'svelte';
	import IcRoundViewAgenda from '~icons/ic/round-view-agenda';
	import IcRoundRestartAlt from '~icons/ic/round-restart-alt';

	let {
		preview,
		settings,
		footer
	}: {
		preview: Snippet<[Snippet]>;
		settings: Snippet<[Snippet]>;
		footer: Snippet;
	} = $props();
	type Layout = 'columns' | 'rows';
	const storageKey = 'youloop.editor-workspace';
	const dividerSize = 3;
	let grid: HTMLDivElement;
	let settingsScroll: HTMLDivElement;
	let settingsContent: HTMLDivElement;
	let settingsMaxWidth = $state(0);
	let runway: HTMLDivElement;
	let runwayHeight = $state<number>();
	let nativeScroll = $state(false);
	const snapSpacing = 20;
	let width = $state(0);
	let height = $state(0);
	let snapPointCount = $derived(
		nativeScroll ? Math.floor(((runwayHeight ?? 0) + height) / snapSpacing) + 1 : 0
	);
	let preference = $state<Layout | null>(null);
	let ratios = $state({ columns: 0.62, rows: 0.55 });
	let layout = $derived(width >= 660 ? (preference ?? 'columns') : 'rows');
	let available = $derived(Math.max(0, (layout === 'columns' ? width : height) - dividerSize));
	let minimum = $derived(
		layout === 'columns'
			? Math.max(320, settingsMaxWidth ? available - settingsMaxWidth : 320)
			: Math.min(240, Math.max(0, available - 110))
	);
	let maximum = $derived(Math.max(minimum, available - (layout === 'columns' ? 280 : 110)));
	let size = $derived(Math.max(minimum, Math.min(ratios[layout] * available, maximum)));
	let layoutAction = $derived(
		layout === 'columns' ? 'Switch to stacked layout' : 'Switch to side-by-side layout'
	);
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
		const updateScrollMode = () => (nativeScroll = query.matches);
		updateScrollMode();
		query.addEventListener('change', updateScrollMode);
		const observer = new ResizeObserver(() => {
			endDrag();
			width = grid.clientWidth;
			height = grid.clientHeight;
			// Use the same CSS limit for content and splitter bounds, including the pane inset.
			const contentStyle = getComputedStyle(settingsContent);
			const scrollStyle = getComputedStyle(settingsScroll);
			settingsMaxWidth =
				parseFloat(contentStyle.maxWidth) +
				parseFloat(scrollStyle.paddingLeft) +
				parseFloat(scrollStyle.paddingRight);
		});
		observer.observe(grid);
		return () => {
			query.removeEventListener('change', updateScrollMode);
			observer.disconnect();
			endDrag();
		};
	});

	$effect(() => {
		void layout;
		untrack(endDrag);
	});

	$effect(() => {
		if (!nativeScroll) return;
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
		resize(
			drag.size + (layout === 'columns' ? drag.origin - position : position - drag.origin)
		);
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
				size + (event.key === keys[0] ? -1 : 1) * (layout === 'columns' ? -16 : available * 0.02)
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
		ratios = { columns: 0.62, rows: 0.55 };
		remember();
	}
</script>

{#snippet layoutControls()}
	<div class="workspace-layout" role="group" aria-label="Workspace layout">
		<button
			aria-label={layoutAction}
			data-tooltip={width < 660 ? 'Side by side requires at least 660px' : layoutAction}
			aria-describedby={width < 660 ? 'layout-unavailable' : undefined}
			aria-disabled={width < 660}
			onclick={() => {
				if (width >= 660) choose(layout === 'columns' ? 'rows' : 'columns');
			}}><IcRoundViewAgenda class={layout === 'rows' ? 'columns-icon' : undefined} /></button
		>
	</div>
{/snippet}

{#snippet layoutReset()}
	<div class="layout-reset">
		<button
			aria-label="Restore default layout"
			title="Restore default layout and split"
			onclick={reset}
		>
			<IcRoundRestartAlt /> Restore default layout
		</button>
		{#if width < 660}
			<p id="layout-unavailable">Side by side requires a workspace at least 660px wide.</p>
		{/if}
	</div>
{/snippet}

<section
	class="editor-workspace"
	class:video-scroll={nativeScroll}
	class:document-snap={nativeScroll}
	aria-label="Editor workspace"
>
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
		<div id="editor-settings" class="settings-pane">
			<!-- The scroll region must be reachable for keyboard scrolling. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				class="settings-scroll"
				role="region"
				aria-label="Clip settings"
				tabindex="0"
				bind:this={settingsScroll}
			>
				<div class="settings-content" bind:this={settingsContent}>
					{@render settings(layoutReset)}
				</div>
			</div>
			<footer class="settings-footer">{@render footer()}</footer>
		</div>
	</div>
	<span
		class="settings-edge"
		aria-hidden="true"
		style:left="0px"
		style:right={layout === 'columns' ? `${size + dividerSize}px` : '0px'}
	></span>
	<div
		class="video-scroll-runway"
		aria-hidden="true"
		bind:this={runway}
		style:height={runwayHeight === undefined ? undefined : `${runwayHeight}px`}
	></div>
	{#if nativeScroll}
		<div class="document-snap-points" aria-hidden="true">
			{#each Array.from({ length: snapPointCount }, (_, index) => index) as index (index)}
				<span class="document-snap-point" style:top={`${index * snapSpacing}px`}></span>
			{/each}
		</div>
	{/if}
</section>

<style>
	.editor-workspace {
		height: 100dvh;
		min-height: 0;
	}
	:global(html:has(.document-snap)) {
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
	.video-scroll-runway {
		display: none;
	}
	.video-scroll {
		position: relative;
		height: auto;
		overflow-anchor: none;
	}
	.video-scroll .workspace-grid {
		position: sticky;
		top: 0;
		/* Keep the mobile canvas at the collapsed-toolbar height to avoid
		   intermediate dvh clipping and toolbar-animation resize jitter. Expanded
		   Safari bars may cover its bottom edge; verify reachability on device. */
		height: 100lvh;
	}
	.video-scroll .video-scroll-runway {
		display: block;
		/* Native picture scroll room grows in pixel chunks before its end,
		   following watch mode. Controls keep their separate scroll container. */
		height: 2500svh;
		pointer-events: none;
	}
	.video-scroll .settings-scroll {
		/* Suppress both boundary chaining and rubber-band affordances where
		   supported. Safari can still react to nested gestures independently. */
		overscroll-behavior-y: none;
	}
	.workspace-layout {
		position: relative;
		display: flex;
		gap: var(--youloop-control-gap);
		flex-shrink: 0;
		pointer-events: auto;
	}
	.workspace-layout button {
		display: grid;
		place-items: center;
		width: var(--youloop-control-size);
		height: var(--youloop-control-size);
		min-height: var(--youloop-control-size);
		padding: var(--youloop-control-padding);
		margin: 0;
		border: 0;
		border-radius: var(--youloop-control-radius);
		background: transparent;
		color: white;
	}
	.workspace-layout button::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: var(--youloop-control-radius);
		background: var(--youloop-overlay-background);
		z-index: -1;
	}
	.workspace-layout button:hover::before {
		background: rgb(90 90 90 / 90%);
	}
	.workspace-layout button::after {
		content: attr(data-tooltip);
		position: absolute;
		left: 0;
		top: calc(100% + 4px);
		width: max-content;
		max-width: min(260px, calc(100vw - 32px));
		padding: 6px 8px;
		border-radius: var(--youloop-control-radius);
		background: #222;
		color: white;
		font-size: 0.8rem;
		text-align: left;
		pointer-events: none;
		opacity: 0;
	}
	.workspace-layout button:hover::after,
	.workspace-layout button:focus::after {
		opacity: 1;
	}
	.workspace-layout button:focus-visible {
		outline: 2px solid white;
		outline-offset: 2px;
	}
	.workspace-layout :global(svg) {
		width: var(--youloop-control-icon-size);
		height: var(--youloop-control-icon-size);
	}
	.workspace-layout :global(.columns-icon) {
		transform: rotate(90deg);
	}
	.workspace-layout button[aria-disabled='true'] {
		opacity: 0.5;
	}
	.layout-reset {
		text-align: center;
		margin-block: 1rem;
	}
	.layout-reset button {
		min-height: 44px;
		margin: 0;
	}
	.layout-reset p {
		margin-block: 0.5rem 0;
		font-size: 0.85rem;
	}
	.workspace-grid {
		display: grid;
		height: 100%;
		min-width: 0;
		min-height: 0;
		grid-template-columns: minmax(0, 1fr) var(--divider-size) minmax(0, var(--preview-size));
		grid-template-rows: minmax(0, 1fr);
	}
	.workspace-grid[data-layout='columns'] .settings-pane {
		grid-column: 1;
		grid-row: 1;
	}
	.workspace-grid[data-layout='columns'] .splitter {
		grid-column: 2;
		grid-row: 1;
	}
	.workspace-grid[data-layout='columns'] .preview-pane {
		grid-column: 3;
		grid-row: 1;
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
	.preview-pane {
		background: var(--nc-surface-1);
	}
	.settings-pane {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--nc-surface-1);
	}
	.settings-scroll {
		flex: 1;
		min-height: 0;
		/* Keep pane boundary gestures from chaining into the document where supported. */
		overscroll-behavior-y: contain;
		overflow-y: auto;
		overflow-x: hidden;
		padding: max(4px, env(safe-area-inset-top)) max(4px, env(safe-area-inset-right))
			max(4px, env(safe-area-inset-bottom)) max(4px, env(safe-area-inset-left));
		overflow-wrap: anywhere;
	}
	.settings-footer {
		flex-shrink: 0;
		min-width: 0;
		padding: 0.25rem max(4px, env(safe-area-inset-right)) max(0.25rem, env(safe-area-inset-bottom))
			max(4px, env(safe-area-inset-left));
		border-top: 1px solid var(--nc-border);
	}

	.settings-content {
		container: clip-settings / inline-size;
		width: 100%;
		max-width: var(--size-content-2, 45ch);
		margin-inline: 0;
	}
	[data-layout='rows'] .settings-content {
		margin-inline: auto;
	}
	.settings-edge {
		display: none;
		position: fixed;
		/* Anchor directly to the viewport rather than waiting for dvh updates. */
		bottom: 0;
		right: 0;
		height: 1px;
		background: var(--nc-border);
		pointer-events: none;
		z-index: 3;
	}
	@media (orientation: portrait) {
		.video-scroll .settings-edge {
			display: block;
		}
		.video-scroll .settings-pane {
			/* lvh keeps the preview stable. Reserve only the currently covered space
			   so the footer follows collapsing bars without resizing the preview. */
			--browser-chrome-reserve: max(0px, calc(100lvh - 100dvh));
			padding-bottom: var(--browser-chrome-reserve);
		}
	}
	.video-scroll .settings-content {
		/* A tiny native scroll range keeps short controls eligible to own gestures.
		   Safari still decides scroll latching and toolbar behavior. */
		min-height: calc(100% + 1px);
	}
	.settings-content > :global(:last-child) {
		/* The pane owns its safe-area spacing; do not stack a trailing block margin. */
		margin-bottom: 0;
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
