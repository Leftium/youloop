import { spawnSync } from 'node:child_process';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

// Run both audits so one failure does not hide the other tool's diagnostics.
const knip = spawnSync(pnpm, ['knip'], { stdio: 'inherit' });
const fallow = spawnSync(pnpm, ['fallow'], { stdio: 'inherit' });

if (knip.error) console.error(knip.error);
if (fallow.error) console.error(fallow.error);
// Local diagnostics fail visibly; required CI and deployments never invoke this runner.
process.exitCode = Math.max(knip.status ?? 2, fallow.status ?? 2);
