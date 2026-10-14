<script lang="ts">
	import RangeMarker from '../components/RangeMarker.svelte';
	import './editor-dialog.css';
	import { onMount, tick, type Snippet } from 'svelte';
	import EditorFieldset from './EditorFieldset.svelte';
	import IcRoundClose from '~icons/ic/round-close';
	import { editorTime } from './editor-time';
	let {
		start,
		end,
		duration,
		controls
	}: {
		start: number;
		end: number;
		duration?: number;
		controls: Snippet;
	} = $props();
	let dialog: HTMLDialogElement;
	let opener: HTMLButtonElement;
	let opened = $state(false);
	let backdropDown = false;
	let ready = $state(false);
	onMount(() => {
		ready = true;
		const viewport = window.visualViewport;
		function resize() {
			dialog.style.setProperty('--dialog-height', `${viewport?.height ?? window.innerHeight}px`);
			dialog.style.setProperty('--dialog-top', `${viewport?.offsetTop ?? 0}px`);
		}
		resize();
		viewport?.addEventListener('resize', resize);
		viewport?.addEventListener('scroll', resize);
		window.addEventListener('resize', resize);
		return () => {
			viewport?.removeEventListener('resize', resize);
			viewport?.removeEventListener('scroll', resize);
			window.removeEventListener('resize', resize);
		};
	});
	async function open(trigger: HTMLButtonElement) {
		opener = trigger;
		opened = true;
		await tick();
		dialog.showModal();
	}
</script>

<EditorFieldset
	label="Clip range"
	action="Edit"
	actionLabel="Edit clip range"
	disabled={!ready}
	onedit={open}
>
	<div class="range-summary">
		<dl>
			<div>
				<dt><RangeMarker endpoint="start" /> Start</dt>
				<dd>{duration === undefined ? '?:??' : editorTime(start, false)}</dd>
			</div>
			<div>
				<dt><RangeMarker endpoint="end" /> End</dt>
				<dd>{duration === undefined ? '?:??' : editorTime(end, false)}</dd>
			</div>
		</dl>
	</div>
</EditorFieldset>
<dialog
	class="clip-range-dialog editor-dialog"
	bind:this={dialog}
	aria-labelledby="range-heading"
	onpointerdown={(event) => {
		const box = dialog.getBoundingClientRect();
		backdropDown =
			event.target === dialog &&
			(event.clientX < box.left ||
				event.clientX > box.right ||
				event.clientY < box.top ||
				event.clientY > box.bottom);
	}}
	onclick={(event) => {
		const box = dialog.getBoundingClientRect();
		if (
			backdropDown &&
			event.target === dialog &&
			(event.clientX < box.left ||
				event.clientX > box.right ||
				event.clientY < box.top ||
				event.clientY > box.bottom)
		)
			dialog.close();
		backdropDown = false;
	}}
	onclose={() => {
		opened = false;
		opener.focus({ preventScroll: true });
	}}
>
	<div class="range-heading">
		<h2 id="range-heading">Edit clip range</h2>
		<button class="close-range" aria-label="Close clip range" onclick={() => dialog.close()}
			><IcRoundClose aria-hidden="true" /></button
		>
	</div>
	{#if opened}{@render controls()}{/if}
</dialog>

<style>
	dl {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 8px 24px;
		min-width: 0;
		font-size: 0.85rem;
	}
	dl > div {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1 1 auto;
		padding-block: 4px;
	}
	dt {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	dd {
		margin: 0;
		font-variant-numeric: tabular-nums;
	}
	dialog {
		container: clip-settings / inline-size;
	}
	h2 {
		margin-top: 0;
	}

	.range-heading {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 12px;
	}
	.close-range {
		all: unset;
		position: relative;
		display: inline-flex;
		padding: 4px;
		line-height: 1;
		flex-shrink: 0;
		color: inherit;
		cursor: pointer;
	}
	.close-range :global(svg) {
		width: 18px;
		height: 18px;
	}
	.close-range:hover {
		opacity: 0.7;
	}
	.close-range:focus-visible {
		outline: 2px solid var(--nc-primary-focus);
		outline-offset: 4px;
	}
	@media (pointer: coarse) {
		.close-range::after {
			content: '';
			position: absolute;
			inset: 50% auto auto 50%;
			width: max(100%, 44px);
			height: max(100%, 44px);
			transform: translate(-50%, -50%);
		}
	}
</style>
