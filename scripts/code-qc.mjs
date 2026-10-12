import { spawnSync } from 'node:child_process';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

// Run both audits even when Knip reports deferred cleanup findings.
const knip = spawnSync(pnpm, ['knip'], { stdio: 'inherit' });
const fallow = spawnSync(pnpm, ['fallow'], { stdio: 'inherit' });

if (knip.error) console.error(knip.error);
if (fallow.error) console.error(fallow.error);
if (fallow.error || fallow.status !== 0) {
	console.warn(
		'Fallow returned a nonzero status; its result is advisory. Inspect the output above.'
	);
}

// Preserve native local Knip diagnostics; this command is never a merge/deploy gate.
process.exitCode = knip.status ?? 2;
