<script lang="ts">
	import { onMount, tick, type Snippet } from 'svelte';
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
	let ready = $state(false);
	onMount(() => {
		ready = true;
		const viewport = window.visualViewport;
		function resize() {
			dialog.style.setProperty('--range-height', `${viewport?.height ?? window.innerHeight}px`);
			dialog.style.setProperty('--range-top', `${(viewport?.offsetTop ?? 0) + 12}px`);
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
	async function open() {
		opened = true;
		await tick();
		dialog.showModal();
	}
</script>

<fieldset>
	<legend>Clip range</legend>
	<div class="range-summary">
		<dl>
			<div>
				<dt><span class="marker">A</span> Start</dt>
				<dd>{duration === undefined ? '?:??' : editorTime(start, false)}</dd>
			</div>
			<div>
				<dt><span class="marker end">B</span> End</dt>
				<dd>{duration === undefined ? '?:??' : editorTime(end, false)}</dd>
			</div>
		</dl>
		<button
			class="inline secondary outline"
			aria-label="Edit clip range"
			disabled={!ready}
			bind:this={opener}
			onclick={open}>Edit</button
		>
	</div>
</fieldset>
<dialog
	bind:this={dialog}
	aria-labelledby="range-heading"
	onclose={() => {
		opened = false;
		opener.focus({ preventScroll: true });
	}}
>
	<h2 id="range-heading">Edit clip range</h2>
	{#if opened}{@render controls()}{/if}
	<button class="close-range" onclick={() => dialog.close()}>Close</button>
</dialog>

<style>
	fieldset {
		min-width: 0;
		border: 1px solid var(--nc-border, #777);
		border-radius: 8px;
		padding: 8px 12px 12px;
		margin: 0 0 12px;
	}
	legend {
		padding-inline: 4px;
	}
	.range-summary {
		display: flex;
		align-items: center;
		gap: 12px;
		justify-content: space-between;
	}
	dl {
		margin: 0;
		flex: 1;
		min-width: 0;
		font-size: 0.85rem;
	}
	dl > div {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
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
	.marker {
		border: 1px solid currentColor;
		border-radius: 50%;
		width: 24px;
		height: 24px;
		display: inline-grid;
		place-items: center;
		color: #79c0ff;
	}
	.marker.end {
		color: #b0a3e8;
	}
	button {
		margin: 0;
		min-height: 44px;
		flex-shrink: 0;
	}
	dialog {
		position: fixed;
		top: var(--range-top, 12px);
		bottom: auto;
		margin-block: 0;
		box-sizing: border-box;
		width: min(620px, calc(100% - 24px));
		max-height: calc(min(100dvh, var(--range-height, 100dvh)) - 24px);
		overflow: auto;
		overscroll-behavior: contain;
		padding: 16px;
		border: 1px solid var(--nc-border, #777);
		border-radius: 8px;
		background: var(--nc-surface-1, Canvas);
		color: var(--nc-text);
		container: clip-settings / inline-size;
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 60%);
	}
	h2 {
		margin: 0 0 12px;
		font-size: 1.15rem;
	}
	.close-range {
		margin-top: 12px;
	}
</style>
