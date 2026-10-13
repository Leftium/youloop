<script lang="ts">
	import { onMount } from 'svelte';
	import VideoExamples from './VideoExamples.svelte';
	import { parseEditorSource, type EditorSource } from './editor-source';
	let { onapply }: { onapply: (source: EditorSource) => void } = $props();
	let dialog: HTMLDialogElement;
	let input: HTMLInputElement;
	let draft = $state('');
	let message = $state('');
	let clipboardPending = $state(false);
	let opener: HTMLElement | null;
	let opening = 0;

	export function open(trigger?: HTMLElement) {
		opener = trigger ?? (document.activeElement as HTMLElement);
		message = '';
		opening += 1;
		dialog.showModal();
		updateViewport();
		if (window.matchMedia('(min-width: 661px) and (pointer: fine)').matches)
			input.focus({ preventScroll: true });
	}
	function close() {
		opening += 1;
		dialog.close();
	}
	function commit(source: EditorSource) {
		close();
		onapply(source);
	}
	function apply(text = draft) {
		const source = parseEditorSource(text);
		if (source) commit(source);
		else message = 'Enter a valid YouTube ID, YouTube URL, or YouLoop clip link.';
	}
	async function loadClipboard() {
		const request = opening;
		clipboardPending = true;
		try {
			const text = await navigator.clipboard.readText();
			if (dialog.open && request === opening) apply(text);
		} catch {
			if (dialog.open && request === opening)
				message = 'Clipboard unavailable. Paste your link into the field, then choose Load.';
		} finally {
			clipboardPending = false;
		}
	}
	function updateViewport() {
		const viewport = window.visualViewport;
		dialog.style.setProperty('--picker-height', `${viewport?.height ?? window.innerHeight}px`);
		dialog.style.setProperty('--picker-top', `${viewport?.offsetTop ?? 0}px`);
	}
	onMount(() => {
		const viewport = window.visualViewport;
		viewport?.addEventListener('resize', updateViewport);
		viewport?.addEventListener('scroll', updateViewport);
		window.addEventListener('resize', updateViewport);
		return () => {
			viewport?.removeEventListener('resize', updateViewport);
			viewport?.removeEventListener('scroll', updateViewport);
			window.removeEventListener('resize', updateViewport);
		};
	});
</script>

<dialog
	class="video-picker"
	bind:this={dialog}
	aria-labelledby="video-picker-title"
	tabindex="-1"
	oncancel={() => {
		opening += 1;
	}}
	onclose={() => {
		if (opener?.isConnected) opener.focus({ preventScroll: true });
	}}
>
	<!-- Focus a non-input first so mobile users can choose without opening the keyboard. -->
	<h2 id="video-picker-title" tabindex="-1" autofocus>Choose video</h2>
	<form
		onsubmit={(event) => {
			event.preventDefault();
			apply();
		}}
	>
		<label for="video-picker-source">YouTube or YouLoop URL or ID</label>
		<input
			id="video-picker-source"
			bind:this={input}
			bind:value={draft}
			placeholder="YouTube ID or video link"
			autocomplete="off"
			autocapitalize="none"
			spellcheck="false"
		/>
		<div class="actions">
			<button type="submit">Load</button><button type="button" onclick={close}>Cancel</button>
		</div>
		<button class="clipboard" type="button" disabled={clipboardPending} onclick={loadClipboard}
			>Load from clipboard</button
		>
		{#if message}<p role="status">{message}</p>{/if}
	</form>
	<h3>Try an example</h3>
	<VideoExamples onchoose={commit} />
</dialog>

<style>
	:global(html:has(dialog.video-picker[open])) {
		overflow: hidden;
	}
	dialog {
		position: fixed;
		inset: calc(var(--picker-top, 0px) + var(--picker-height, 100dvh) / 2) 0 auto;
		transform: translateY(-50%);
		margin: 0 auto;
		width: min(520px, calc(100% - 32px));
		max-height: calc(var(--picker-height, 100dvh) - 32px);
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 24px;
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 60%);
	}
	h2 {
		margin-top: 0;
	}
	input {
		width: 100%;
		font-size: 16px;
	}
	button {
		min-height: 44px;
		margin: 0;
	}
	.actions {
		display: flex;
		gap: 8px;
		margin-block: 12px;
	}
	.clipboard {
		width: 100%;
	}
	@media (max-width: 660px), (pointer: coarse) and (max-height: 500px) {
		dialog {
			inset: auto 0 calc(100% - var(--picker-top, 0px) - var(--picker-height, 100dvh));
			margin: 0;
			transform: none;
			width: 100%;
			max-width: none;
			max-height: calc(var(--picker-height, 100dvh) - 12px);
			border-radius: 16px 16px 0 0;
			padding: 20px max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom))
				max(20px, env(safe-area-inset-left));
		}
	}
	@media (prefers-reduced-motion: reduce) {
		dialog {
			animation: none;
			transition: none;
		}
	}
</style>
