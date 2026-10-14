import { defineConfig } from '@playwright/test';

// Routine gates exercise our UI and adapter without depending on YouTube availability.
const advisory = process.env.YOULOOP_BROWSER_ADVISORY === '1';
const timelineProof = process.env.YOULOOP_TIMELINE_PROOF === '1';
const offlineProof = timelineProof || !advisory;
process.env.YOULOOP_OFFLINE_PROOF = offlineProof ? '1' : '0';
const port = offlineProof ? 5174 : 5173;

export default defineConfig({
	testDir: './tests/browser',
	workers: 1,
	projects: [
		{
			name: 'chromium',
			grep: timelineProof ? /@timeline-proof/ : advisory ? undefined : /@routine|@youtube-mock/,
			use: {
				browserName: 'chromium',
				channel: 'chromium',
				launchOptions: { args: ['--mute-audio'] }
			}
		},
		{
			name: 'webkit',
			grep: timelineProof
				? /@timeline-proof/
				: advisory
					? undefined
					: /@webkit-smoke|@youtube-mock/,
			testMatch: [
				'**/editor-workspace.spec.ts',
				'**/editor-polish.spec.ts',
				'**/video-picker.spec.ts',
				'**/framing.spec.ts',
				'**/share-footer.spec.ts',
				'**/editor-timeline.spec.ts'
			],
			use: { browserName: 'webkit', channel: undefined }
		}
	],
	timeout: 60_000,
	use: {
		baseURL: `http://localhost:${port}`,
		trace: 'retain-on-failure'
	},
	webServer: {
		command: offlineProof
			? 'node --import ./tests/browser/offline-server.mjs ./node_modules/vite/bin/vite.js dev --host 127.0.0.1 --port 5174'
			: 'pnpm dev --host 127.0.0.1',
		url: `http://localhost:${port}`,
		reuseExistingServer: !process.env.CI && !offlineProof
	}
});
