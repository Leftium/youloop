import { resolveSocialMetadata } from '#lib/server/video-metadata.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ url, route }) => ({
	// Route-specific metadata also runs for SvelteKit data navigation.
	social:
		route.id === '/' || route.id === '/s' || route.id === '/[videoId=videoId]/[[range]]'
			? await resolveSocialMetadata(url)
			: null
});
