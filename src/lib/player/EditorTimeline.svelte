<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import RangeSlider from '../components/RangeSlider.svelte';
	import {
		rangeValueAtPosition,
		rangeValuePercent,
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
	let drag: { pointerId: number; node: HTMLElement; offset: number } | undefined;
	let progress = $derived(rangeValuePercent(transportTime, 0, duration));
	let displayed = $derived(rangeValuePercent(currentTime, 0, duration));
	function move(event: PointerEvent) {
		if (!drag || event.pointerId !== drag.pointerId) return;
		const box = axis.getBoundingClientRect();
		onseek(rangeValueAtPosition(event.clientX - box.left - drag.offset, box.width, 0, duration));
	}
	function begin(event: PointerEvent) {
		if (disabled || drag || event.button !== 0 || !event.isPrimary) return;
		event.preventDefault();
		const node = event.currentTarget as HTMLElement;
		node.focus();
		node.setPointerCapture(event.pointerId);
		const box = axis.getBoundingClientRect();
		drag = {
			pointerId: event.pointerId,
			node,
			offset: (event.target as Element).closest('.playhead')
				? event.clientX - box.left - (displayed / 100) * box.width
				: 0
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
			<div class="playhead" style:left={`${displayed}%`} aria-hidden="true"></div>
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
		padding-inline: var(--editor-axis-inset, 22px);
	}
	.editor-axis {
		position: relative;
		height: 72px;
	}
	.navigation {
		position: absolute;
		inset: 0;
		cursor: crosshair;
		touch-action: none;
		outline-offset: 2px;
	}
	.navigation::before {
		content: '';
		position: absolute;
		top: 18px;
		height: 6px;
		width: 100%;
		background: #e2e8f0;
		pointer-events: none;
	}
	.progress {
		position: absolute;
		top: 18px;
		height: 6px;
		background: #64748b;
		pointer-events: none;
	}
	.playhead {
		position: absolute;
		top: 0;
		width: 24px;
		height: 25px;
		transform: translateX(-50%);
		cursor: grab;
	}
	.playhead::after {
		content: '';
		position: absolute;
		left: 7px;
		top: 6px;
		border-inline: 5px solid transparent;
		border-top: 10px solid #ef4444;
	}
	.endpoints {
		position: absolute;
		inset: 24px 0 0;
		pointer-events: none;
		--range-slider-inset: 0;
		--range-slider-track: #e2e8f0;
		--range-slider-selection: rgb(38 139 210 / 45%);
		--range-slider-end-thumb: #6366f1;
	}
</style>
