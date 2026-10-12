import { mdsvex } from 'mdsvex';
import { env } from 'node:process';
import vercelAdapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { sveltekit } from '@sveltejs/kit/vite';
import Icons from 'unplugin-icons/vite';

import { defineConfig } from 'vite';

// Query-based video previews require a server; reject obsolete static build requests.
const target = env.DEPLOY_TARGET ?? 'vercel';
if (target !== 'vercel') {
	throw new Error(`Unsupported DEPLOY_TARGET: ${target}`);
}

export default defineConfig({
	define: {
		'import.meta.env.YOULOOP_RUNTIME_PROOF': JSON.stringify(env.YOULOOP_RUNTIME_PROOF === '1')
	},
	plugins: [
		sveltekit({
			extensions: ['.svelte', '.svx'],
			preprocess: [vitePreprocess(), mdsvex()],
			adapter: vercelAdapter({ runtime: 'nodejs24.x' })
		}),
		Icons({
			compiler: 'svelte',
			autoInstall: true
		})
	]
});
