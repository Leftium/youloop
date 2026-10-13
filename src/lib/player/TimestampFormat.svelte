<script lang="ts">
	import { tick } from 'svelte';
	import type { TimestampPolicy } from '../share-url.ts';
	import IcRoundKeyboardArrowDown from '~icons/ic/round-keyboard-arrow-down';
	let {
		value,
		options,
		disabled,
		onchange
	}: {
		value: TimestampPolicy;
		options: { value: TimestampPolicy; label: string; preview?: string }[];
		disabled: boolean;
		onchange: (value: TimestampPolicy) => void;
	} = $props();
	let open = $state(false);
	let root: HTMLDivElement;
	let trigger: HTMLButtonElement;
	let list = $state<HTMLDivElement>();
	let selected = $derived(options.find((option) => option.value === value));
	async function expand() {
		open = true;
		await tick();
		list?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
	}
	function close(restore = false) {
		open = false;
		if (restore) void tick().then(() => trigger.focus());
	}
	function choose(policy: TimestampPolicy) {
		onchange(policy);
		close(true);
	}
	function navigate(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			close(true);
			return;
		}
		const buttons = Array.from(list?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
		const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
		const index =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? buttons.length - 1
					: event.key === 'ArrowDown'
						? (current + 1) % buttons.length
						: event.key === 'ArrowUp'
							? (current + buttons.length - 1) % buttons.length
							: undefined;
		if (index !== undefined) {
			event.preventDefault();
			buttons[index]?.focus();
		}
	}
	$effect(() => {
		if (!open) return;
		const outside = (event: PointerEvent) => {
			if (!root.contains(event.target as Node)) close();
		};
		document.addEventListener('pointerdown', outside);
		return () => document.removeEventListener('pointerdown', outside);
	});
</script>

<div
	class="timestamp-format"
	bind:this={root}
	onfocusout={(event) => {
		if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close();
	}}
>
	<button
		class="format-trigger"
		bind:this={trigger}
		role="combobox"
		aria-label="URL timestamp format"
		aria-describedby="timestamp-current"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-controls="timestamp-options"
		data-value={value}
		{disabled}
		onclick={() => (open ? close() : expand())}
		onkeydown={(event) => {
			if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
				event.preventDefault();
				void expand();
			}
		}}
	>
		<span id="timestamp-current">{selected?.label}</span><IcRoundKeyboardArrowDown />
	</button>
	{#if open}
		<div
			id="timestamp-options"
			class="format-options"
			role="listbox"
			aria-label="URL timestamp formats"
			bind:this={list}
		>
			{#each options as option (option.value)}
				<button
					role="option"
					tabindex="-1"
					aria-selected={value === option.value}
					data-policy={option.value}
					onclick={() => choose(option.value)}
					onkeydown={navigate}
				>
					<span>{option.label}</span><small
						>{option.preview ?? 'Waiting for valid bounds and video duration'}</small
					>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.timestamp-format {
		position: relative;
		flex: 1;
		min-width: 150px;
	}
	.format-trigger {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		width: 100%;
		min-height: 44px;
		margin: 0;
		padding: 6px 8px;
		border: 1px solid var(--nc-border);
		border-radius: var(--nc-radius);
		background: var(--nc-surface-1);
		color: var(--nc-text);
		font-size: 0.85rem;
	}
	.format-trigger :global(svg) {
		width: 20px;
		height: 20px;
		flex-shrink: 0;
	}
	.format-options {
		position: absolute;
		z-index: 5;
		top: calc(100% + 4px);
		inset-inline: 0;
		padding: 4px;
		border: 1px solid var(--nc-border);
		border-radius: var(--nc-radius);
		background: var(--nc-surface-1);
		box-shadow: 0 4px 12px rgb(0 0 0 / 15%);
		max-height: min(20rem, 60dvh);
		overflow-y: auto;
	}
	.format-options button {
		display: block;
		width: 100%;
		margin: 0;
		padding: 8px;
		text-align: left;
		background: transparent;
		color: var(--nc-text);
		border: 1px solid transparent;
		border-radius: var(--nc-radius);
		font-size: 0.85rem;
	}
	.format-options button[aria-selected='true'],
	.format-options button:hover {
		background: var(--nc-surface-3);
	}
	.format-options button:focus-visible {
		outline: 2px solid var(--nc-primary);
		outline-offset: -2px;
	}
	small {
		display: block;
		margin-top: 3px;
		font-size: 0.7rem;
		font-weight: normal;
		opacity: 0.65;
		overflow-wrap: anywhere;
		line-height: 1.35;
		font-variant-numeric: tabular-nums;
	}
</style>
