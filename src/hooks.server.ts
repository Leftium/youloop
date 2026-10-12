import type { Handle } from '@sveltejs/kit/hooks';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	// Opt-in staging evidence on real routes, without a permanent diagnostic endpoint.
	if (import.meta.env.YOULOOP_RUNTIME_PROOF) {
		response.headers.set('x-youloop-request-id', crypto.randomUUID());
		response.headers.set('x-youloop-server-time', new Date().toISOString());
		response.headers.set('cache-control', 'private, no-store');
	}
	return response;
};
