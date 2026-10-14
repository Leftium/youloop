<script lang="ts">
	import { rangeMarkerColors } from './range-marker-colors';
	let { endpoint }: { endpoint: 'start' | 'end' } = $props();
</script>

<svg
	class="range-marker"
	viewBox="0 0 23.094 20"
	role="img"
	aria-label={endpoint === 'start' ? 'A' : 'B'}
>
	<polygon points="11.547,0 23.094,20 0,20" fill={rangeMarkerColors[endpoint]} />
	<text x="11.547" y="14" text-anchor="middle" dominant-baseline="middle"
		>{endpoint === 'start' ? 'A' : 'B'}</text
	>
</svg>

<style>
	.range-marker {
		width: 23.094px;
		height: 20px;
		flex-shrink: 0;
	}
	text {
		fill: white;
		font-size: 8px;
		font-weight: bold;
	}
</style>
