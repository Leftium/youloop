<script lang="ts">
	import { onMount } from 'svelte';
	import IcRoundContentPaste from '~icons/ic/round-content-paste';
	import IcRoundClose from '~icons/ic/round-close';
	import VideoExamples from './VideoExamples.svelte';
	import { parseEditorSource, type EditorSource } from './editor-source';
	let { onapply }: { onapply: (source: EditorSource) => void } = $props();
	let dialog: HTMLDialogElement;
	let input: HTMLInputElement;
	let heading: HTMLHeadingElement;
	let draft = $state('');
	let message = $state('');
	let clipboardPending = $state(false);
	let opener: HTMLElement | null;
	let opening = 0;
	let opened = $state(false);
	let composing = false;
	let backdropDown = false;
	let candidate = $derived(parseEditorSource(draft)?.videoId);
	let preview = $state<{ title: string; image: string }>();
	let previewState = $state<'loading' | 'ready' | 'unavailable'>('loading');

	$effect(() => {
		const videoId = candidate;
		preview = undefined;
		if (!opened || !videoId) return;
		previewState = 'loading';
		let active = true;
		const controller = new AbortController();
		let timeout: ReturnType<typeof setTimeout>;
		const debounce = setTimeout(async () => {
			timeout = setTimeout(() => controller.abort(), 5000);
			try {
				const response = await fetch(`/api/video-metadata?v=${encodeURIComponent(videoId)}`, {
					signal: controller.signal
				});
				if (!response.ok) throw new Error('Metadata unavailable');
				const result = await response.json();
				if (!active || candidate !== videoId || !opened) return;
				if (typeof result.title === 'string' && typeof result.image === 'string') {
					preview = { title: result.title, image: result.image };
					previewState = 'ready';
				} else previewState = 'unavailable';
			} catch {
				if (active && candidate === videoId && opened) previewState = 'unavailable';
			} finally {
				clearTimeout(timeout);
			}
		}, 300);
		return () => {
			active = false;
			clearTimeout(debounce);
			clearTimeout(timeout);
			controller.abort();
		};
	});

	export function open(trigger?: HTMLElement) {
		draft = '';
		opener = trigger ?? (document.activeElement as HTMLElement);
		message = '';
		opening += 1;
		opened = true;
		dialog.showModal();
		updateViewport();
		if (window.matchMedia('(min-width: 661px) and (pointer: fine)').matches)
			input.focus({ preventScroll: true });
		else heading.focus({ preventScroll: true });
	}
	function close() {
		opening += 1;
		opened = false;
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
	async function pasteClipboard() {
		const request = opening;
		clipboardPending = true;
		try {
			const text = await navigator.clipboard.readText();
			if (dialog.open && request === opening) {
				draft = text.trim();
				message = parseEditorSource(draft)
					? ''
					: 'Enter a valid YouTube ID, YouTube URL, or YouLoop clip link.';
			}
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
		// Capture before input/browser handlers can turn the first Escape into a blur.
		function escape(event: KeyboardEvent) {
			if (!dialog.open || event.key !== 'Escape' || event.isComposing || composing) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			close();
		}
		window.addEventListener('keydown', escape, true);
		const viewport = window.visualViewport;
		viewport?.addEventListener('resize', updateViewport);
		viewport?.addEventListener('scroll', updateViewport);
		window.addEventListener('resize', updateViewport);
		return () => {
			window.removeEventListener('keydown', escape, true);
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
	oncancel={(event) => {
		event.preventDefault();
		if (!composing) close();
	}}
	oncompositionstart={() => {
		composing = true;
	}}
	oncompositionend={() => {
		composing = false;
	}}
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
			close();
		backdropDown = false;
	}}
	onclose={() => {
		opened = false;
		composing = false;
		if (opener?.isConnected) opener.focus({ preventScroll: true });
	}}
>
	<!-- Focus a non-input first so mobile users can choose without opening the keyboard. -->
	<div class="picker-heading">
		<h2 id="video-picker-title" tabindex="-1" bind:this={heading}>Choose video</h2>
		<button class="plain-action close" aria-label="Close video picker" onclick={close}
			><IcRoundClose aria-hidden="true" /></button
		>
	</div>
	<form
		onsubmit={(event) => {
			event.preventDefault();
			apply();
		}}
	>
		<label for="video-picker-source">YouTube URL, ID, or YouLoop link</label>
		<div class="nc-join source-entry">
			<input
				id="video-picker-source"
				bind:this={input}
				bind:value={draft}
				placeholder="Paste a video link..."
				autocomplete="off"
				autocapitalize="none"
				spellcheck="false"
			/>
			<button type="submit">Load</button>
		</div>
		<button
			class="plain-action clipboard"
			type="button"
			disabled={clipboardPending}
			onclick={pasteClipboard}
			><IcRoundContentPaste aria-hidden="true" /><span>Paste from clipboard</span></button
		>
		{#if message}<p role="status">{message}</p>{/if}
	</form>
	{#if candidate}
		<div class="candidate-preview" aria-live="polite">
			{#if previewState === 'ready' && preview}
				<img
					src={preview.image}
					alt="Candidate video thumbnail"
					onerror={() => {
						previewState = 'unavailable';
					}}
				/>
				<p>{preview.title}</p>
			{:else if previewState === 'loading'}<p>Finding video details...</p>
			{:else}<p>Preview unavailable. You can still load this video.</p>{/if}
		</div>
	{/if}
	<hr />
	<h3>Try an example</h3>
	<VideoExamples
		onchoose={(href) => {
			draft = href;
			message = '';
		}}
	/>
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
	.picker-heading {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 12px;
	}
	.plain-action {
		all: unset;
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		color: inherit;
		cursor: pointer;
	}
	.plain-action:focus-visible {
		outline: 2px solid var(--nc-primary-focus);
		outline-offset: 4px;
	}
	.plain-action:hover {
		opacity: 0.7;
	}
	.plain-action:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.close {
		padding: 4px;
		line-height: 1;
		flex-shrink: 0;
	}
	.close :global(svg) {
		width: 18px;
		height: 18px;
	}
	.clipboard {
		padding-block: 4px;
	}
	.clipboard :global(svg) {
		width: 1em;
		height: 1em;
	}
	.source-entry {
		display: flex;
		width: 100%;
		margin-block: 8px 12px;
	}
	.source-entry input {
		min-width: 0;
		flex: 1;
	}
	.source-entry button {
		flex-shrink: 0;
	}
	.candidate-preview {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		margin-top: 16px;
		border: 1px solid var(--nc-border);
		border-radius: 8px;
	}
	.candidate-preview img {
		width: 96px;
		max-height: 80px;
		object-fit: contain;
		border-radius: 4px;
	}
	.candidate-preview p {
		margin: 0;
		font-size: 0.85rem;
		overflow-wrap: anywhere;
	}
	hr {
		margin-block: 24px;
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
	@media (pointer: coarse) {
		.plain-action::after {
			content: '';
			position: absolute;
			inset: 50% auto auto 50%;
			width: max(100%, 44px);
			height: max(100%, 44px);
			transform: translate(-50%, -50%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		dialog {
			animation: none;
			transition: none;
		}
	}
</style>
