<script lang="ts">
	import { tick } from 'svelte';
	import { resolveClipRange, subtractSeconds, type ShareUrlState } from '../share-url.ts';
	import { editorTime, parseEditorTime } from './editor-time';
	let {
		endpoint,
		value,
		bounds,
		duration,
		precise,
		onchange,
		onset
	}: {
		endpoint: 'start' | 'end';
		value: number;
		bounds: Pick<ShareUrlState, 'start' | 'end'>;
		duration?: number;
		precise: boolean;
		onchange: (value: number | undefined) => void;
		onset: () => void;
	} = $props();
	const label = $derived(endpoint === 'start' ? 'Start' : 'End');
	let editing = $state(false);
	let draft = $state('');
	let original = '';
	let keyboardFocus = false;
	let message = $state('');
	let input = $state<HTMLInputElement>(undefined!);
	let positiveButton = $state<HTMLButtonElement>();
	let negativeButton = $state<HTMLButtonElement>();
	let focusFromEnd = false;
	let relative = $derived(duration === undefined ? undefined : subtractSeconds(value, duration));
	async function edit(fromEnd: boolean) {
		focusFromEnd = fromEnd;
		const expression = fromEnd ? relative : value;
		if (expression === undefined) return;
		if (fromEnd && expression === 0) {
			// There is no signed -0 in the codec. Open end is a separate explicit choice.
			draft = 'End of video';
		} else draft = editorTime(expression, true, 2).replace(/^\u2248/, '');
		original = draft;
		message = '';
		editing = true;
		await tick();
		input.focus();
		input.select();
	}
	function close(restoreFocus = true) {
		editing = false;
		message = '';
		if (restoreFocus)
			void tick().then(() => (focusFromEnd ? negativeButton : positiveButton)?.focus());
	}
	function commit(openEnd = false, restoreFocus = true) {
		if (!openEnd && draft === original) {
			close(restoreFocus);
			return;
		}
		const expression = openEnd ? undefined : parseEditorTime(draft);
		if (!openEnd && expression === undefined) {
			message = 'Enter seconds or a signed clock time. Use End of video instead of -0.';
			return;
		}
		if (!openEnd && (draft.trim().split('.')[1]?.length ?? 0) > 2) {
			message = 'Use at most 2 decimal places.';
			return;
		}
		if (!openEnd && !precise && !Number.isInteger(expression)) {
			message = 'Use whole seconds or enable Sub-second times.';
			return;
		}
		const next = { ...bounds, [endpoint]: expression };
		if (
			duration === undefined ||
			!resolveClipRange(next, duration).ok ||
			(expression !== undefined && (expression < -duration || expression > duration))
		) {
			message = 'Choose a time within the video, with End after Start.';
			return;
		}
		onchange(expression);
		close(restoreFocus);
	}
</script>

<!-- The group observes input modality for safe blur commits; its children own all activation. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="bound-row"
	role="group"
	aria-label={`${label} endpoint`}
	data-endpoint={endpoint}
	onkeydown={(event) => {
		keyboardFocus = event.key === 'Tab';
	}}
	onpointerdown={() => {
		keyboardFocus = false;
	}}
	onfocusout={(event) => {
		const target = event.relatedTarget as HTMLElement | null;
		const row = event.currentTarget;
		// Pointer blur can move a target between mousedown and click. Only keyboard exits are safe.
		if (editing && keyboardFocus) {
			// WebKit can omit relatedTarget. Wait for the next focused element to settle.
			void tick().then(() => {
				if (editing && keyboardFocus && !row.contains(target ?? document.activeElement))
					commit(false, false);
			});
		}
	}}
>
	<div class="bound-label">
		<span class="marker">{endpoint === 'start' ? 'A' : 'B'}</span>{label}
	</div>
	{#if !editing}
		<button
			class="set-bound"
			aria-label={`Set ${endpoint} at playhead`}
			onclick={onset}
			disabled={duration === undefined}>Set at playhead</button
		>
	{/if}
	<div class="bound-values" class:editing>
		{#if editing}
			<div class="draft-actions">
				<input
					bind:this={input}
					bind:value={draft}
					aria-label={`Edit ${endpoint}`}
					aria-invalid={!!message}
					aria-describedby={message ? `${endpoint}-error` : undefined}
					onkeydown={(event) => {
						if (event.key === 'Enter') {
							event.preventDefault();
							commit();
						} else if (event.key === 'Escape') {
							event.preventDefault();
							close();
						}
					}}
				/>
				<button onclick={() => commit()}>Apply</button><button
					onpointerdown={(event) => event.preventDefault()}
					onclick={() => close()}>Cancel</button
				>
			</div>
			{#if endpoint === 'end'}<button class="open-end" onclick={() => commit(true)}
					>End of video</button
				>{/if}
		{:else}
			<button
				class="time-display"
				bind:this={positiveButton}
				aria-label={`Edit ${endpoint} from start`}
				disabled={duration === undefined}
				onclick={() => edit(false)}
				>{duration === undefined ? '?:??' : editorTime(value, precise, 2)}</button
			>
			<button
				class="time-display secondary"
				bind:this={negativeButton}
				aria-label={`Edit ${endpoint} from end`}
				disabled={duration === undefined}
				onclick={() => edit(true)}
				>{relative === undefined
					? '(?:??)'
					: relative === 0
						? 'End of video'
						: `(${editorTime(relative, precise, 2)})`}</button
			>
		{/if}
	</div>
	{#if message}<p id={`${endpoint}-error`} role="alert">{message}</p>{/if}
</div>

<style>
	.bound-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 4px 8px;
		margin-block: 8px;
	}
	.bound-label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 600;
		min-height: 44px;
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
	[data-endpoint='end'] .marker {
		color: #b0a3e8;
	}
	button {
		margin: 0;
		min-height: 44px;
		padding: 6px 10px;
	}
	.set-bound {
		font-size: 0.8rem;
	}
	.bound-values {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: max-content max-content;
		align-items: center;
		gap: 4px;
	}
	.time-display {
		background: transparent;
		color: inherit;
		border-color: transparent;
		font-variant-numeric: tabular-nums;
		padding-inline: 6px;
		white-space: nowrap;
		font-size: 0.85rem;
	}
	.secondary {
		opacity: 0.75;
	}
	.time-display:hover,
	.time-display:focus-visible {
		border-color: var(--nc-border);
	}
	.draft-actions {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		gap: 4px;
		width: 100%;
		align-items: center;
	}
	input {
		min-width: 0;
		width: 100%;
		flex: 1;
		margin: 0;
		padding: 8px;
	}
	.bound-values.editing {
		display: flex;
		flex-direction: column;
		align-items: stretch;
	}
	.open-end {
		align-self: flex-start;
		font-size: 0.8rem;
	}
	p {
		grid-column: 1 / -1;
		font-size: 0.8rem;
		margin: 0;
	}
	@container clip-settings (min-width: 400px) {
		.bound-row {
			grid-template-columns: 70px minmax(0, 1fr) auto;
			align-items: center;
		}
		.bound-values {
			grid-column: 2;
			grid-row: 1;
		}
		.set-bound {
			grid-column: 3;
			grid-row: 1;
		}
		.bound-values.editing {
			grid-column: 2 / -1;
		}
	}
</style>
