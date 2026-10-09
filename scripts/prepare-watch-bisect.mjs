import { execFileSync } from 'node:child_process';
import {
	mkdtempSync,
	readFileSync,
	writeFileSync,
	symlinkSync,
	mkdirSync,
	cpSync,
	rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const refs = process.argv.slice(2);
if (!refs.length) refs.push('af18e43', 'b9c2402');
for (const ref of refs) {
	const sha = execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], {
		cwd: root,
		encoding: 'utf8'
	}).trim();
	const short = sha.slice(0, 7);
	const temporary = mkdtempSync(join(tmpdir(), 'youloop-bisect-'));
	try {
		const archive = execFileSync('git', ['archive', sha], {
			cwd: root,
			maxBuffer: 20 * 1024 * 1024
		});
		execFileSync('tar', ['-x', '-C', temporary], { input: archive });
		symlinkSync(join(root, 'node_modules'), join(temporary, 'node_modules'), 'dir');
		const config = join(temporary, 'vite.config.ts');
		const source = readFileSync(config, 'utf8');
		if (!source.includes('sveltekit({'))
			throw new Error('Snapshot config needs a base-path adapter');
		writeFileSync(
			config,
			source.replace(
				'sveltekit({',
				`sveltekit({\n paths: { base: '/__bisect/${short}' }, prerender: { handleHttpError: 'ignore' },`
			)
		);
		const html = join(temporary, 'src/app.html');
		writeFileSync(
			html,
			readFileSync(html, 'utf8').replace(
				'<head>',
				`<head>\n<meta name="youloop-bisect-head" content="${sha}" />`
			)
		);
		execFileSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build'], {
			cwd: temporary,
			stdio: 'pipe',
			maxBuffer: 10 * 1024 * 1024
		});
		const output = join(root, '.watch-bisect', short);
		mkdirSync(output, { recursive: true });
		cpSync(join(temporary, 'build'), output, { recursive: true });
		writeFileSync(join(output, 'revision.json'), JSON.stringify({ sha, ref }, null, 2));
		console.log(`${sha}: /__bisect/${short}/s?v=dt-SqNL4z3w&a=0&b=15`);
	} catch (error) {
		console.error(
			String(error),
			(error.stdout?.toString() ?? error.stderr?.toString() ?? '').slice(-3000)
		);
		process.exitCode = 1;
	} finally {
		rmSync(temporary, { recursive: true, force: true });
	}
}
