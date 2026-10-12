<script lang="ts">
	import type { SocialMetadata } from './server/video-metadata';
	let { metadata }: { metadata: SocialMetadata } = $props();
</script>

<svelte:head>
	<title>{metadata.title}</title>
	<meta name="description" content={metadata.description} />
	<meta property="og:title" content={metadata.title} />
	<meta property="og:description" content={metadata.description} />
	<meta property="og:image" content={metadata.image} />
	<meta property="og:image:alt" content={metadata.title} />
	<meta property="og:url" content={metadata.url} />
	<meta property="og:type" content={metadata.type} />
	<meta property="og:site_name" content="YouLoop" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={metadata.title} />
	<meta name="twitter:description" content={metadata.description} />
	<meta name="twitter:image" content={metadata.image} />
	<meta name="twitter:image:alt" content={metadata.title} />
</svelte:head>
