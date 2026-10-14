<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import {
		applyThumbInteraction,
		normalizeRange,
		rangeValueAtPosition,
		rangeValuePercent,
		stepRangeValue,
		type NumericRange,
		type ThumbInteraction,
		type RangeEdge,
		type StepRounding
	} from './range-slider';

	interface Props {
		min?: number;
		max?: number;
		start?: number;
		end?: number;
		step?: number | 'any';
		keyboardIncrement?: number;
		thumbInteraction?: ThumbInteraction;
		keyboardThumbInteraction?: ThumbInteraction;
		pointerStepRounding?: StepRounding;
		keyboardStepMode?: 'grid' | 'relative';
		disabled?: boolean;
		label?: string;
		startLabel?: string;
		endLabel?: string;
		formatValue?: (value: number) => string;
		onChange?: (range: NumericRange) => void;
		onDragStart?: (value: number) => void;
		onDrag?: (value: number) => void;
		onDragEnd?: () => void;
	}
	let {
		min = 0,
		max = 100,
		start = $bindable(min),
		end = $bindable(max),
		step = 'any',
		keyboardIncrement,
		thumbInteraction = 'clamp',
		keyboardThumbInteraction,
		pointerStepRounding = 'nearest',
		keyboardStepMode = 'grid',
		disabled = false,
		label = 'Selected range',
		startLabel = 'Range start',
		endLabel = 'Range end',
		formatValue = String,
		onChange = () => {},
		onDragStart = () => {},
		onDrag = () => {},
		onDragEnd = () => {}
	}: Props = $props();

	let keyboardPreview = $state(false);
	// A plain guard remains writable while Svelte is destroying reactive state.
	let pointerActive = false;
	let track = $state<HTMLDivElement>(undefined!);
	// Physical slots retain focus and pointer capture when semantic roles swap.
	let thumbEdges = $state<RangeEdge[]>(['start', 'end']);
	let focusedSlot = $state<number | null>(null);
	let focusModality = $state<'keyboard' | 'pointer' | null>(null);
	let keyboardSession: {
		slot: number;
		original: NumericRange;
	} | null = null;
	let drag = $state<{
		pointerId: number;
		node: HTMLElement;
		edge: RangeEdge;
		offset: number;
		original: NumericRange;
		interaction: ThumbInteraction;
	} | null>(null);
	let validBounds = $derived(Number.isFinite(min) && Number.isFinite(max) && max > min);
	let lower = $derived(validBounds ? min : 0);
	let upper = $derived(validBounds ? max : 0);
	let inactive = $derived(disabled || !validBounds);
	let range = $derived(normalizeRange({ start, end }, lower, upper));
	let increment = $derived(
		typeof step === 'number' && step > 0 && Number.isFinite(step) ? step : null
	);
	let keyboardStep = $derived(keyboardIncrement ?? increment ?? (upper - lower) / 100);
	let startPercent = $derived(rangeValuePercent(range.start, lower, upper));
	let endPercent = $derived(rangeValuePercent(range.end, lower, upper));
	let collapsed = $derived(range.start === range.end);
	let startYieldsPointer = $derived(
		collapsed &&
			(thumbInteraction === 'push-pull' || (thumbInteraction === 'clamp' && range.start === lower))
	);

	function interact(
		edge: RangeEdge,
		candidate: number,
		original: NumericRange,
		interaction: ThumbInteraction,
		rounding: StepRounding = 'nearest',
		snapStep: number | null = increment
	): RangeEdge {
		const next = applyThumbInteraction(
			range,
			edge,
			candidate,
			lower,
			upper,
			interaction,
			snapStep ?? undefined,
			original,
			rounding
		);
		if (next.edge !== edge)
			thumbEdges = thumbEdges.map((value) => (value === 'start' ? 'end' : 'start'));
		updateRange(next.range);
		if (drag || keyboardPreview) onDrag(next.range[next.edge]);
		return next.edge;
	}

	function updateRange(next: NumericRange) {
		if (next.start === range.start && next.end === range.end) return;
		start = next.start;
		end = next.end;
		onChange(next);
	}

	function beginDrag(event: PointerEvent, edge: RangeEdge) {
		if (inactive || drag || event.button !== 0 || !event.isPrimary) return;
		const node = event.currentTarget as HTMLElement;
		const box = track.getBoundingClientRect();
		if (!box.width) return;
		event.preventDefault();
		node.focus();
		// Explicit pointer state overrides any keyboard ring preserved by the browser.
		endKeyboardPreview();
		focusModality = 'pointer';
		keyboardSession = null;
		node.setPointerCapture(event.pointerId);
		drag = {
			pointerId: event.pointerId,
			node,
			edge,
			offset: event.clientX - box.left - ((range[edge] - lower) / (upper - lower)) * box.width,
			original: { ...range },
			interaction: thumbInteraction
		};
		pointerActive = true;
		onDragStart(range[edge]);
	}

	function moveDrag(event: PointerEvent) {
		if (inactive || !drag || event.pointerId !== drag.pointerId) return;
		const box = track.getBoundingClientRect();
		const edge = interact(
			drag.edge,
			rangeValueAtPosition(event.clientX - box.left - drag.offset, box.width, lower, upper),
			drag.original,
			drag.interaction,
			pointerStepRounding
		);
		if (edge !== drag.edge) drag = { ...drag, edge };
	}

	function finishDrag() {
		if (!pointerActive || !drag) return;
		pointerActive = false;
		const { node, pointerId } = drag;
		drag = null;
		onDragEnd();
		if (node.hasPointerCapture(pointerId)) node.releasePointerCapture(pointerId);
	}

	function endDrag(event: PointerEvent) {
		if (event.pointerId === drag?.pointerId) finishDrag();
	}

	function finishInteraction() {
		finishDrag();
		endKeyboardPreview();
	}
	$effect(() => {
		if (inactive) untrack(finishInteraction);
	});

	function keyDown(event: KeyboardEvent, slot: number) {
		if (inactive) return;
		if (event.key === 'Escape') {
			finishInteraction();
			return;
		}
		const edge = thumbEdges[slot];
		let candidate: number;
		switch (event.key) {
			case 'ArrowLeft':
			case 'ArrowDown':
				candidate = stepRangeValue(
					range[edge],
					-1,
					lower,
					upper,
					keyboardStep,
					1,
					keyboardStepMode
				);
				break;
			case 'ArrowRight':
			case 'ArrowUp':
				candidate = stepRangeValue(range[edge], 1, lower, upper, keyboardStep, 1, keyboardStepMode);
				break;
			case 'PageDown':
				candidate = stepRangeValue(
					range[edge],
					-1,
					lower,
					upper,
					keyboardStep,
					10,
					keyboardStepMode
				);
				break;
			case 'PageUp':
				candidate = stepRangeValue(
					range[edge],
					1,
					lower,
					upper,
					keyboardStep,
					10,
					keyboardStepMode
				);
				break;
			case 'Home':
				candidate = lower;
				break;
			case 'End':
				candidate = upper;
				break;
			default:
				return;
		}
		event.preventDefault();
		focusModality = 'keyboard';
		// After pointer input, the first key starts a fresh focus-session baseline.
		if (keyboardSession?.slot !== slot) keyboardSession = { slot, original: { ...range } };
		if (!keyboardPreview) {
			keyboardPreview = true;
			onDragStart(range[edge]);
		}
		interact(
			edge,
			candidate,
			keyboardSession.original,
			keyboardThumbInteraction ?? thumbInteraction,
			'nearest',
			keyboardStepMode === 'relative' ? null : increment
		);
	}

	function focusThumb(slot: number) {
		focusedSlot = slot;
		// Tab/programmatic focus starts with a ring; beginDrag overrides it synchronously.
		focusModality = 'keyboard';
		keyboardSession = { slot, original: { ...range } };
	}

	function endKeyboardPreview() {
		if (!keyboardPreview) return;
		keyboardPreview = false;
		onDragEnd();
	}

	function keyUp(event: KeyboardEvent) {
		if (
			[
				'ArrowLeft',
				'ArrowDown',
				'ArrowRight',
				'ArrowUp',
				'PageDown',
				'PageUp',
				'Home',
				'End'
			].includes(event.key)
		)
			endKeyboardPreview();
	}

	function blurThumb() {
		finishInteraction();
		focusedSlot = null;
		focusModality = null;
		keyboardSession = null;
	}
	onDestroy(finishInteraction);
</script>

<svelte:window onblur={finishInteraction} />

<div class="range-slider" role="group" aria-label={label} class:disabled={inactive}>
	<div class="track" bind:this={track}>
		<div class="axis"></div>
		<div
			class="selected-range"
			style:left="{startPercent}%"
			style:width="{Math.max(0, endPercent - startPercent)}%"
		></div>
		{#each thumbEdges as edge, slot (slot)}
			<div
				class="thumb {edge}"
				class:dragging={drag?.edge === edge}
				class:keyboard-focus={focusedSlot === slot && focusModality === 'keyboard'}
				class:pointer-yield-start={startYieldsPointer && edge === 'start'}
				role="slider"
				tabindex={inactive ? -1 : 0}
				aria-label={edge === 'start' ? startLabel : endLabel}
				aria-orientation="horizontal"
				aria-disabled={inactive}
				aria-valuemin={thumbInteraction === 'clamp'
					? edge === 'start'
						? lower
						: range.start
					: lower}
				aria-valuemax={thumbInteraction === 'clamp'
					? edge === 'start'
						? range.end
						: upper
					: upper}
				aria-valuenow={range[edge]}
				aria-valuetext={formatValue(range[edge])}
				style:left="{edge === 'start' ? startPercent : endPercent}%"
				onpointerdown={(event) => beginDrag(event, edge)}
				onpointermove={moveDrag}
				onpointerup={endDrag}
				onpointercancel={endDrag}
				onlostpointercapture={endDrag}
				onkeydown={(event) => keyDown(event, slot)}
				onkeyup={keyUp}
				onfocus={() => focusThumb(slot)}
				onblur={blurThumb}
			>
				<span aria-hidden="true">{edge === 'start' ? 'A' : 'B'}</span>
			</div>
		{/each}
	</div>
</div>

<style>
	.range-slider {
		padding-inline: var(--range-slider-inset, 1.375rem);
		color: var(--range-slider-color, #268bd2);
	}
	.track {
		position: relative;
		height: var(--range-slider-height, 2.75rem);
	}
	.axis {
		position: absolute;
		inset-inline: 0;
		top: calc(50% - 18px);
		height: 36px;
		background: var(--range-slider-track, #eeeeee);
	}
	.selected-range {
		position: absolute;
		top: calc(50% - 10px);
		height: 20px;
		background: var(
			--range-slider-selection,
			color-mix(in srgb, currentColor 35%, var(--range-slider-track, #eeeeee))
		);
	}
	.thumb {
		position: absolute;
		top: calc(50% - var(--range-slider-thumb-size, 2.75rem) / 2);
		width: var(--range-slider-thumb-size, 2.75rem);
		height: var(--range-slider-thumb-size, 2.75rem);
		transform: translateX(-50%);
		pointer-events: auto;
		touch-action: none;
		user-select: none;
		cursor: grab;
		border-radius: var(--range-slider-thumb-radius, 0.25rem);
		outline: none;
	}
	.thumb span {
		position: relative;
		z-index: 1;
		display: grid;
		place-items: center;
		height: 100%;
		color: white;
		font-size: 0.7rem;
		font-weight: bold;
		pointer-events: none;
	}
	.thumb::after {
		content: '';
		position: absolute;
		top: calc(50% - 10px);
		left: calc(50% - 10px);
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--range-slider-thumb, currentColor);
	}
	.thumb.end::after {
		background: var(
			--range-slider-end-thumb,
			color-mix(in srgb, var(--range-slider-thumb, currentColor) 65%, white)
		);
	}
	.thumb.start {
		z-index: 2;
	}
	.thumb.end {
		z-index: 1;
	}
	.thumb.keyboard-focus::after {
		outline: 2px solid currentColor;
		outline-offset: 3px;
	}
	.thumb.pointer-yield-start {
		/*
		 * Keep start visually above end while letting end own ambiguous pointer acquisition
		 * when start cannot expand the collapsed range itself.
		 */
		pointer-events: none;
	}
	.thumb.dragging {
		cursor: grabbing;
	}
	.disabled {
		opacity: 0.5;
	}
	.disabled .thumb {
		cursor: default;
	}
</style>
