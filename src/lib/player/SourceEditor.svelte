<script lang="ts">
	import { onMount } from 'svelte';
	import IcRoundEdit from '~icons/ic/round-edit';
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
		<a href={`https://youtu.be/${videoId}`} target="_blank" rel="noreferrer">youtu.be/{videoId}</a>
		<button
			disabled={!ready}
			aria-label="Change video"
			title="Change video"
			onclick={(event) => picker.open(event.currentTarget)}><IcRoundEdit /></button
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
	button {
		min-width: 44px;
		min-height: 44px;
		margin: 0;
		padding: 8px;
		flex-shrink: 0;
	}
	button :global(svg) {
		width: 20px;
		height: 20px;
	}
</style>
