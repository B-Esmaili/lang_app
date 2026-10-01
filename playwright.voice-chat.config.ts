import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests',
	testMatch: ['voice-chat.browser.ts', 'voice-chat-real-speech.browser.ts'],
	fullyParallel: false,
	workers: 1,
	timeout: 45_000,
	reporter: 'list',
	use: {
		baseURL: 'http://127.0.0.1:5175',
		channel: 'chrome',
		headless: true,
		permissions: ['microphone'],
		launchOptions: {
			args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
		}
	},
	webServer: {
		command: 'npm run dev -- --mode desktop --host 127.0.0.1 --port 5175 --strictPort',
		url: 'http://127.0.0.1:5175/en/tts-lab',
		reuseExistingServer: true,
		timeout: 60_000
	}
});
