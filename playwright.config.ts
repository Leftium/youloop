import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests/browser',
	workers: 1,
	projects: [
		{ name: 'chromium', use: { browserName: 'chromium', channel: 'chromium' } },
		{
			name: 'webkit',
			testMatch: '**/editor-polish.spec.ts',
			use: { browserName: 'webkit', channel: undefined }
		}
	],
	timeout: 60_000,
	use: {
		baseURL: 'http://localhost:5173',
		launchOptions: { args: ['--mute-audio'] },
		trace: 'retain-on-failure'
	},
	webServer: {
		command: 'pnpm dev --host 127.0.0.1',
		url: 'http://localhost:5173',
		reuseExistingServer: !process.env.CI
	}
});
