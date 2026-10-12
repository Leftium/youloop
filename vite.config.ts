import { mdsvex } from 'mdsvex';
import { env } from 'node:process';
import staticAdapter from '@sveltejs/adapter-static';
import vercelAdapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { sveltekit } from '@sveltejs/kit/vite';
import Icons from 'unplugin-icons/vite';

import { defineConfig } from 'vite';

// Keep Pages independently buildable until an approved production cutover.
const target = env.DEPLOY_TARGET ?? 'vercel';
if (!['vercel', 'static'].includes(target)) {
	throw new Error(`Unsupported DEPLOY_TARGET: ${target}`);
}

export default defineConfig({
	define: {
		'import.meta.env.YOULOOP_STATIC': JSON.stringify(target === 'static'),
		'import.meta.env.YOULOOP_RUNTIME_PROOF': JSON.stringify(
			target !== 'static' && env.YOULOOP_RUNTIME_PROOF === '1'
		)
	},
	plugins: [
		sveltekit({
			extensions: ['.svelte', '.svx'],
			preprocess: [vitePreprocess(), mdsvex()],
			adapter: target === 'static' ? staticAdapter() : vercelAdapter({ runtime: 'nodejs24.x' })
		}),
		Icons({
			compiler: 'svelte',
			autoInstall: true
		})
	]
});
