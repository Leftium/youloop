// Loaded only by Playwright's offline proof server, never by the application.
import { appendFileSync } from 'node:fs';

const fetchOnline = globalThis.fetch;
globalThis.fetch = async (input, init) => {
	const url = new URL(input instanceof Request ? input.url : input);
	if (['localhost', '127.0.0.1'].includes(url.hostname)) return fetchOnline(input, init);
	if (process.env.YOULOOP_OFFLINE_METRICS) {
		appendFileSync(
			process.env.YOULOOP_OFFLINE_METRICS,
			JSON.stringify({ blocked: url.href }) + '\n'
		);
	}
	// Exercise the application's existing metadata fallback without outbound fetches.
	throw new TypeError(`Offline browser proof blocked server fetch: ${url.hostname}`);
};
