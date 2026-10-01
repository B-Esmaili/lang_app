import { defineConfig } from '@playwright/test';

const baseURL = process.env.READER_TEST_URL ?? 'http://127.0.0.1:5175';

export default defineConfig({
	testDir: './tests',
	testMatch: 'reader-mobile.browser.ts',
	workers: 1,
	timeout: 45_000,
	reporter: 'list',
	use: {
		baseURL,
		channel: 'chrome',
		headless: true,
		ignoreHTTPSErrors: true,
		isMobile: true,
		hasTouch: true,
		reducedMotion: 'reduce'
	},
	webServer: {
		command: 'npm run dev -- --host 127.0.0.1 --port 5175',
		url: `${baseURL}/en/tts-lab`,
		ignoreHTTPSErrors: true,
		reuseExistingServer: true,
		timeout: 60_000
	}
});
