<script lang="ts">
	import { onMount } from 'svelte';
	import EditorFieldset from './EditorFieldset.svelte';
	import IcRoundOpenInNew from '~icons/ic/round-open-in-new';
	import VideoPicker from './VideoPicker.svelte';
	import type { EditorSource } from './editor-source';
	let {
		videoId,
		startSeconds,
		title,
		unavailable,
		onapply
	}: {
		videoId: string;
		startSeconds: number;
		title: string;
		unavailable: boolean;
		onapply: (source: EditorSource) => void;
	} = $props();
	// YouTube accepts absolute seconds; don't include a timestamp at the beginning.
	let sourceUrl = $derived.by(() => {
		const start = Number.isFinite(startSeconds) ? Math.floor(startSeconds) : 0;
		const url = `https://youtu.be/${videoId}`;
		return start > 0 ? `${url}?t=${start}` : url;
	});
	let picker: VideoPicker;
	let ready = $state(false);
	onMount(() => {
		ready = true;
	});
</script>

<EditorFieldset
	label="Video"
	action="Change"
	actionLabel="Change video"
	disabled={!ready}
	onedit={(trigger) => picker.open(trigger)}
>
	<p class="source-title" aria-label="YouTube video title" title={title || undefined}>
		{title || (unavailable ? 'Video title unavailable' : 'Loading video title...')}
	</p>
	<div class="source-link">
		<a href={sourceUrl} target="_blank" rel="noreferrer" aria-describedby="source-new-tab"
			>youtu.be/{videoId}<IcRoundOpenInNew aria-hidden="true" /></a
		>
		<span id="source-new-tab" class="visually-hidden">Opens in a new tab</span>
	</div>
</EditorFieldset>
<VideoPicker bind:this={picker} {onapply} />

<style>
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
</style>
