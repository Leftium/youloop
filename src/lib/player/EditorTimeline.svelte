<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import RangeSlider from '../components/RangeSlider.svelte';
	import { timelineRange } from './watch-timeline';
	import {
		rangeValueAtPosition,
		stepRangeValue,
		type NumericRange
	} from '../components/range-slider';
	let {
		duration,
		currentTime,
		transportTime,
		start,
		end,
		disabled = false,
		onseek,
		onrangechange,
		onpreviewstart,
		onpreview,
		onpreviewend
	}: {
		duration: number;
		currentTime: number;
		transportTime: number;
		start: number;
		end: number;
		disabled?: boolean;
		onseek: (time: number) => void;
		onrangechange: (range: NumericRange) => void;
		onpreviewstart: (time: number) => void;
		onpreview: (time: number) => void;
		onpreviewend: () => void;
	} = $props();
	let axis = $state<HTMLDivElement>(undefined!);
	let drag: { pointerId: number; node: HTMLElement } | undefined;
	let range = $derived(timelineRange(duration, start, end, transportTime));
	let progress = $derived(range.videoProgress * 100);
	function move(event: PointerEvent) {
		if (!drag || event.pointerId !== drag.pointerId) return;
		const box = axis.getBoundingClientRect();
		onseek(rangeValueAtPosition(event.clientX - box.left, box.width, 0, duration));
	}
	function begin(event: PointerEvent) {
		if (disabled || drag || event.button !== 0 || !event.isPrimary) return;
		event.preventDefault();
		const node = event.currentTarget as HTMLElement;
		node.focus();
		node.setPointerCapture(event.pointerId);
		drag = {
			pointerId: event.pointerId,
			node
		};
		move(event);
	}
	function finish(event?: PointerEvent) {
		if (!drag || (event && event.pointerId !== drag.pointerId)) return;
		const { node, pointerId } = drag;
		drag = undefined;
		if (node.hasPointerCapture(pointerId)) node.releasePointerCapture(pointerId);
	}
	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			finish();
			return;
		}
		if (disabled) return;
		let time: number;
		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowUp':
				time = stepRangeValue(currentTime, 1, 0, duration, 0.1, 1, 'relative');
				break;
			case 'ArrowLeft':
			case 'ArrowDown':
				time = stepRangeValue(currentTime, -1, 0, duration, 0.1, 1, 'relative');
				break;
			case 'PageUp':
				time = stepRangeValue(currentTime, 1, 0, duration, 0.1, 10, 'relative');
				break;
			case 'PageDown':
				time = stepRangeValue(currentTime, -1, 0, duration, 0.1, 10, 'relative');
				break;
			case 'Home':
				time = 0;
				break;
			case 'End':
				time = duration;
				break;
			default:
				return;
		}
		event.preventDefault();
		onseek(time);
	}
	$effect(() => {
		if (disabled) untrack(() => finish());
	});
	onDestroy(() => finish());
</script>

<svelte:window onblur={() => finish()} />
<div class="editor-timeline" data-transport-time={transportTime} data-current-time={currentTime}>
	<div class="editor-axis" bind:this={axis}>
		<div
			class="navigation"
			role="slider"
			aria-label="Current time"
			aria-orientation="horizontal"
			tabindex={disabled ? -1 : 0}
			aria-disabled={disabled}
			aria-valuemin="0"
			aria-valuemax={duration}
			aria-valuenow={currentTime}
			aria-valuetext={`${currentTime.toFixed(2)} seconds`}
			onpointerdown={begin}
			onpointermove={move}
			onpointerup={finish}
			onpointercancel={finish}
			onlostpointercapture={finish}
			onkeydown={keydown}
			onblur={() => finish()}
		>
			<div class="progress" style:width={`${progress}%`}></div>
			<div
				class="selection"
				style:left={`${range.selectionStart * 100}%`}
				style:width={`${range.selectionWidth * 100}%`}
			>
				<div class="overlap" style:width={`${range.clipProgress * 100}%`}></div>
			</div>
		</div>
		<div class="endpoints">
			<RangeSlider
				min={0}
				max={duration}
				{start}
				{end}
				{disabled}
				step="any"
				keyboardIncrement={0.1}
				keyboardStepMode="relative"
				thumbInteraction="swap"
				thumbShape="triangles"
				label="Timeline clip range"
				startLabel="Repeat start"
				endLabel="Repeat end"
				formatValue={(time) => `${time.toFixed(2)} seconds`}
				onChange={onrangechange}
				onDragStart={onpreviewstart}
				onDrag={onpreview}
				onDragEnd={onpreviewend}
			/>
		</div>
	</div>
</div>

<style>
	.editor-timeline {
		padding-bottom: 16px;
	}
	.editor-axis {
		position: relative;
		height: 20px;
	}
	.navigation {
		position: absolute;
		inset: 0;
		background: #aaa;
		cursor: crosshair;
		touch-action: none;
		outline-offset: 2px;
	}
	.progress,
	.selection,
	.overlap {
		position: absolute;
		top: 0;
		height: 100%;
		pointer-events: none;
	}
	.progress {
		background: #f33;
	}
	.selection {
		background: #fc3;
	}
	.overlap {
		background: #f90;
	}
	.endpoints {
		position: absolute;
		inset: 0;
		pointer-events: none;
		--range-slider-inset: 0;
		--range-slider-height: 20px;
		--range-slider-thumb-size: 20px;
		--range-slider-track: transparent;
		--range-slider-selection: transparent;
		--range-slider-thumb: white;
		--range-slider-color: #b58900;
		--range-slider-end-thumb: #c65a00;
	}
</style>
