import type { KnipConfig } from 'knip';

const config: KnipConfig = {
	entry: [
		// SvelteKit 3's centralized parameter matchers are loaded by the framework.
		'src/params.ts',
		// Playwright computes these import URLs; README also invokes them in DevTools.
		'src/lib/player/*.browser-test.ts'
	]
};

export default config;
