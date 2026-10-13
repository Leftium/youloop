<script lang="ts">
	import { tick } from 'svelte';
	import { parseEditorSource, type EditorSource } from './editor-source';
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
	let editing = $state(false);
	let draft = $state('');
	let message = $state('');
	let input = $state<HTMLInputElement>(undefined!);
	let editButton = $state<HTMLButtonElement>(undefined!);
	async function edit() {
		draft = `https://youtu.be/${videoId}`;
		message = '';
		editing = true;
		await tick();
		input.focus();
		input.select();
	}
	function cancel() {
		editing = false;
		message = '';
		void tick().then(() => editButton.focus());
	}
	function apply(text = draft) {
		const source = parseEditorSource(text);
		if (!source) {
			message = 'Enter a YouTube ID/address or a valid YouLoop link.';
			return;
		}
		onapply(source);
		editing = false;
		message = 'Video loaded';
	}
	async function paste(load = false) {
		try {
			const text = await navigator.clipboard.readText();
			if (load) apply(text);
			else {
				draft = text.trim();
				message = '';
				input.focus();
			}
		} catch {
			message = 'Clipboard unavailable. Use Edit and paste the link into the input.';
		}
	}
</script>

<div class="source-area">
	{#if editing}
		<label for="source-draft">YouTube source</label>
		<input
			id="source-draft"
			bind:this={input}
			bind:value={draft}
			placeholder="YouTube ID/address or YouLoop link"
			onkeydown={(event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					apply();
				} else if (event.key === 'Escape') cancel();
			}}
		/>
		<div class="source-actions">
			<button onclick={() => apply()}>Load / Apply</button><button onclick={cancel}>Cancel</button
			><button onclick={() => paste()}>Paste</button>
		</div>
	{:else}
		<div class="source-link">
			<a href={`https://youtu.be/${videoId}`} target="_blank" rel="noreferrer">youtu.be/{videoId}</a
			><button bind:this={editButton} onclick={edit}>Edit</button>
		</div>
		<button class="clipboard-load" onclick={() => paste(true)}>Load from clipboard</button>
	{/if}
	<p class="source-title" aria-label="YouTube video title" title={title || undefined}>
		{title || (unavailable ? 'Video title unavailable' : 'Loading video title...')}
	</p>
	{#if message}<p class="source-message" role="status">{message}</p>{/if}
</div>

<style>
	.source-area {
		min-width: 0;
		margin-bottom: 8px;
	}
	.source-link,
	.source-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.source-link a {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
		font-size: 0.9rem;
	}
	button {
		margin: 0;
		min-height: 44px;
		padding: 6px 10px;
		font-size: 0.85rem;
	}
	.clipboard-load {
		margin-top: 4px;
	}
	.source-title {
		font-size: 0.85rem;
		opacity: 0.75;
		margin: 6px 0;
		line-height: 1.35;
		overflow-wrap: anywhere;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.source-message {
		font-size: 0.8rem;
		margin: 4px 0;
	}
	input {
		width: 100%;
		margin: 4px 0;
	}
</style>
