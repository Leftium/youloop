import { defineConfig } from '@playwright/test';

const offlineProof = process.env.YOULOOP_OFFLINE_PROOF === '1';
const port = offlineProof ? 5174 : 5173;

export default defineConfig({
	testDir: './tests/browser',
	workers: 1,
	projects: [
		{ name: 'chromium', use: { browserName: 'chromium', channel: 'chromium' } },
		{
			name: 'webkit',
			testMatch: [
				'**/editor-workspace.spec.ts',
				'**/editor-polish.spec.ts',
				'**/video-picker.spec.ts',
				'**/framing.spec.ts',
				'**/share-footer.spec.ts'
			],
			use: { browserName: 'webkit', channel: undefined }
		}
	],
	timeout: 60_000,
	use: {
		baseURL: `http://localhost:${port}`,
		launchOptions: { args: ['--mute-audio'] },
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
