<script lang="ts">
	import { onMount } from 'svelte';
	import Player from './Player.svelte';
	import { createOrientationController, type Orientation } from './youtube-orientation';
	let { youtubeId }: { youtubeId: string } = $props();
	let orientation = $state<Orientation>('landscape');
	let sourceAspectRatio = $state(16 / 9);
	let fillFrame = $state(false);
	let theater = $state(false);
	let controlPageVisible = $state(false);

	export function configure(view: {
		orientation?: Orientation;
		fill?: boolean;
		theater?: boolean;
		controlPageVisible?: boolean;
	}) {
		if (view.orientation) {
			orientation = view.orientation;
			sourceAspectRatio = orientation === 'portrait' ? 9 / 16 : 16 / 9;
		}
		if (view.fill !== undefined) fillFrame = view.fill;
		if (view.theater !== undefined) theater = view.theater;
		if (view.controlPageVisible !== undefined) controlPageVisible = view.controlPageVisible;
	}
	let resolveSource: (value: { width: number; height: number }) => void;
	const detected = new Promise<{ width: number; height: number }>((resolve) => {
		resolveSource = resolve;
	});
	export function detectPortrait() {
		resolveSource({ width: 360, height: 640 });
	}
	onMount(() => {
		const controller = createOrientationController(
			(next, _override, source) => {
				orientation = next;
				sourceAspectRatio = source?.aspectRatio ?? (next === 'portrait' ? 9 / 16 : 16 / 9);
			},
			async () => new Response('', { status: 404 }),
			new Map(),
			() => detected
		);
		controller.setSource(youtubeId);
		return () => controller.dispose();
	});
</script>

<Player
	{youtubeId}
	repeatA={0}
	repeatB={15}
	minimal
	{orientation}
	{sourceAspectRatio}
	{fillFrame}
	{theater}
	{controlPageVisible}
/>
