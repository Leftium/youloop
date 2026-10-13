<script lang="ts">
	import { videoExamples } from './video-examples';
	let { onchoose }: { onchoose?: (href: string) => void } = $props();
</script>

<nav aria-label="Video examples">
	{#each videoExamples as example (example.label)}
		<a
			href={example.href}
			onclick={(event) => {
				if (
					!onchoose ||
					event.button !== 0 ||
					event.metaKey ||
					event.ctrlKey ||
					event.shiftKey ||
					event.altKey
				)
					return;
				event.preventDefault();
				onchoose(example.href);
			}}>{example.label}</a
		>
	{/each}
</nav>

<style>
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 16px;
	}
	a {
		color: inherit;
		opacity: 0.75;
		font-size: 0.85rem;
	}
	a:hover {
		opacity: 1;
	}
</style>
