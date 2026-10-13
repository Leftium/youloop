import { spawnSync } from 'node:child_process';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
// Human output gates on aggregate legacy health totals; JSON gates on new findings.
const result = spawnSync(
	pnpm,
	[
		'exec',
		'fallow',
		'--dupes-baseline',
		'fallow-baselines/dupes.json',
		'--health-baseline',
		'fallow-baselines/health.json',
		'--baseline-mode',
		'identity',
		'--quiet',
		'--format',
		'json',
		'--fail-on-issues'
	],
	{ encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
);

if (result.stderr) process.stderr.write(result.stderr);
if (result.error) console.error(result.error);
try {
	const report = JSON.parse(result.stdout);
	if (report.kind !== 'combined' || report.version !== '3.33.1') {
		throw new Error('Unexpected Fallow report; review the runner when upgrading Fallow.');
	}
	// Keep every dead-code category, including warnings, without aggregate/context noise.
	const check = Object.fromEntries(
		Object.entries(report.check).filter(([, value]) => Array.isArray(value) && value.length)
	);
	const findings = {
		check,
		clones: report.dupes.clone_groups,
		health: report.health.findings,
		diagnostics: report.workspace_diagnostics.filter(
			({ kind }) => !['boundaries-not-configured', 'rule-packs-not-configured'].includes(kind)
		)
	};
	const failedGates = Object.fromEntries(
		Object.entries(report.gate_outcomes).filter(([, gate]) => gate.status === 'fail')
	);
	if (
		Object.keys(check).length ||
		findings.clones.length ||
		findings.health.length ||
		findings.diagnostics.length
	) {
		console.log(JSON.stringify(findings, null, 2));
	} else if (Object.keys(failedGates).length) {
		console.error(JSON.stringify(failedGates, null, 2));
	} else {
		console.log('Fallow: no new findings (accepted duplication/health baselines applied).');
	}
	process.exitCode = result.status ?? 2;
} catch (error) {
	console.error('Fallow report could not be read:', error.message);
	if (result.stdout) process.stderr.write(result.stdout);
	process.exitCode = result.status || 2;
}
