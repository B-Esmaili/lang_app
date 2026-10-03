import type { AuthSession } from '$lib/server/auth';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	/** Selected at Vite startup/build from WEB_STT. */
	const __WEB_STT__: 'moonshine' | 'whisper';
	namespace App {
		interface Locals {
			user?: AuthSession['user'];
			session?: AuthSession['session'];
		}

		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
