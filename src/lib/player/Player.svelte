<script lang="ts">
	import type { MediaPlayerElement } from 'vidstack/elements';
	import 'vidstack/bundle';

	let player: MediaPlayerElement;

	function onclick() {
		player.paused = !player.paused;
	}
</script>

<media-player
	bind:this={player}
	{onclick}
	playsInline
	title="Sprite Fight"
	src="youtube/_cMxraX_5RE"
	role="none"
>
	<media-provider></media-provider>
</media-player>
