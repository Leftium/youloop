import { sveltekit } from '@sveltejs/kit/vite';
import Icons from 'unplugin-icons/vite';

import { vite as vidstack } from 'vidstack/plugins';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		vidstack({ include: /player\// }),
		sveltekit(),
		Icons({
			compiler: 'svelte',
			autoInstall: true
		})
	]
});
