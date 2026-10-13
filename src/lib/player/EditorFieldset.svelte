<script lang="ts">
	import type { Snippet } from 'svelte';
	import IcRoundEdit from '~icons/ic/round-edit';
	let {
		label,
		action,
		actionLabel,
		disabled,
		onedit,
		children
	}: {
		label: string;
		action: string;
		actionLabel: string;
		disabled: boolean;
		onedit: (trigger: HTMLButtonElement) => void;
		children: Snippet;
	} = $props();
</script>

<fieldset aria-label={label}>
	<legend>{label}</legend>
	<div class="fieldset-action">
		<button
			class="inline secondary outline"
			aria-label={actionLabel}
			title={actionLabel}
			{disabled}
			onclick={(event) => onedit(event.currentTarget)}
		>
			<IcRoundEdit aria-hidden="true" /><span class="action-label">{action}</span>
		</button>
	</div>
	{@render children()}
</fieldset>

<style>
	fieldset {
		position: relative;
		min-width: 0;
		border: 1px solid var(--nc-border, #777);
		border-radius: 8px;
		padding: 8px 12px 12px;
		margin: 0 0 12px;
	}
	legend {
		padding-inline: 4px;
		line-height: 1.5rem;
	}
	.fieldset-action {
		position: absolute;
		top: -0.75rem;
		right: 12px;
		transform: translateY(-50%);
		padding-inline: 4px;
		background: var(--nc-surface-1);
	}
	button {
		--nc-primary: var(--nc-secondary);
		--nc-primary-hover: var(--nc-secondary-hover);
		--nc-primary-focus: var(--nc-secondary-focus);
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin: 0;
		flex-shrink: 0;
	}
	button :global(svg) {
		width: 1em;
		height: 1em;
	}
	@media (pointer: coarse) {
		button::after {
			content: '';
			position: absolute;
			inset: 50% auto auto 50%;
			width: max(100%, 44px);
			height: max(100%, 44px);
			transform: translate(-50%, -50%);
		}
	}
	@container clip-settings (max-width: 330px) {
		.action-label {
			display: none;
		}
	}
</style>
