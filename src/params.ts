import { defineParams } from '@sveltejs/kit/params';

// Static app routes win; reject assets, reserved names and malformed video IDs.
export const params = defineParams({
	videoId: (value) => (/^[A-Za-z0-9_-]{11}$/.test(value) ? value : undefined)
});
