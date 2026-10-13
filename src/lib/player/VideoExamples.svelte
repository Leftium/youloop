<script lang="ts">
	import { videoExamples } from './video-examples';
	import { parseEditorSource, type EditorSource } from './editor-source';
	let { onchoose }: { onchoose?: (source: EditorSource) => void } = $props();
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
				onchoose(parseEditorSource(example.href)!);
			}}>{example.label}</a
		>
	{/each}
</nav>

<style>
	nav {
		display: grid;
		gap: 4px;
	}
	a {
		display: flex;
		align-items: center;
		min-height: 44px;
	}
</style>
