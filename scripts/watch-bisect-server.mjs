import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

/** Serve ignored historical builds only in Vite dev, on the same host as the phone preview. */
export function watchBisectServer() {
	const directory = resolve('.watch-bisect');
	const types = {
		'.html': 'text/html',
		'.js': 'text/javascript',
		'.css': 'text/css',
		'.json': 'application/json',
		'.svg': 'image/svg+xml',
		'.png': 'image/png',
		'.ico': 'image/x-icon',
		'.webp': 'image/webp',
		'.woff2': 'font/woff2'
	};
	return {
		name: 'watch-bisect-diagnostics',
		configureServer(server) {
			server.middlewares.use(async (request, response, next) => {
				const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
				if (!pathname.startsWith('/__bisect/')) return next();
				const file = resolve(directory, '.' + pathname.slice('/__bisect'.length));
				if (!file.startsWith(directory + '/')) {
					response.statusCode = 400;
					response.end();
					return;
				}
				try {
					let target = file;
					try {
						if ((await stat(target)).isDirectory()) target += '/index.html';
					} catch {
						target += '.html';
					}
					const data = await readFile(target);
					response.setHeader('Content-Type', types[extname(target)] ?? 'application/octet-stream');
					response.setHeader('Cache-Control', 'no-store');
					response.end(data);
				} catch {
					response.statusCode = 404;
					response.end('Prepare this revision with scripts/prepare-watch-bisect.mjs');
				}
			});
		}
	};
}
