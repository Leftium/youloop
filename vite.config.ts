import { mdsvex } from 'mdsvex';
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { sveltekit } from '@sveltejs/kit/vite';
import Icons from 'unplugin-icons/vite';

import { defineConfig } from 'vite';
import { watchBisectServer } from './scripts/watch-bisect-server.mjs';

export default defineConfig({
	plugins: [
		watchBisectServer(),
		sveltekit({
			extensions: ['.svelte', '.svx'],
			preprocess: [vitePreprocess(), mdsvex()],
			adapter: adapter()
		}),
		Icons({
			compiler: 'svelte',
			autoInstall: true
		})
	]
});
