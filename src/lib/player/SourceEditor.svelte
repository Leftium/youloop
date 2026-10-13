<script lang="ts">
	import { onMount } from 'svelte';
	import IcRoundOpenInNew from '~icons/ic/round-open-in-new';
	import VideoPicker from './VideoPicker.svelte';
	import type { EditorSource } from './editor-source';
	let {
		videoId,
		title,
		unavailable,
		onapply
	}: {
		videoId: string;
		title: string;
		unavailable: boolean;
		onapply: (source: EditorSource) => void;
	} = $props();
	let picker: VideoPicker;
	let ready = $state(false);
	onMount(() => {
		ready = true;
	});
</script>

<fieldset>
	<legend>Video</legend>
	<p class="source-title" aria-label="YouTube video title" title={title || undefined}>
		{title || (unavailable ? 'Video title unavailable' : 'Loading video title...')}
	</p>
	<div class="source-link">
		<a
			href={`https://youtu.be/${videoId}`}
			target="_blank"
			rel="noreferrer"
			aria-describedby="source-new-tab">youtu.be/{videoId}<IcRoundOpenInNew aria-hidden="true" /></a
		>
		<span id="source-new-tab" class="visually-hidden">Opens in a new tab</span>
		<button
			class="inline"
			disabled={!ready}
			aria-label="Change video"
			title="Change video"
			onclick={(event) => picker.open(event.currentTarget)}>Change</button
		>
	</div>
</fieldset>
<VideoPicker bind:this={picker} {onapply} />

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
	.source-title {
		font-size: 0.85rem;
		margin: 0 0 6px;
		overflow-wrap: anywhere;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		line-height: 1.35;
	}
	.source-link {
		/* Contain the hidden description so it cannot extend the mobile scroll runway. */
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
	}
	a {
		width: max-content;
		font-size: 0.85rem;
		overflow-wrap: anywhere;
	}
	button.inline {
		min-height: 32px;
		margin: 0;
		flex-shrink: 0;
	}
	a {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
	}
	a :global(svg) {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
	}
	@media (pointer: coarse) {
		button.inline {
			min-height: 40px;
		}
	}
</style>
