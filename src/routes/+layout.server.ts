import { resolveSocialMetadata } from '#lib/server/video-metadata.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ url, route }) => ({
	// The shared layout performs one lookup for either legacy route, including data navigation.
	social: route.id === '/' || route.id === '/s' ? await resolveSocialMetadata(url) : null
});
