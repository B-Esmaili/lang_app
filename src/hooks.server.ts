import type { Handle } from '@sveltejs/kit';
import { building, dev } from '$app/environment';
import { auth, ensureDevelopmentAdmin } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	if (!building) await ensureDevelopmentAdmin(dev);

	if (
		event.url.pathname === '/api/auth/admin' ||
		event.url.pathname.startsWith('/api/auth/admin/')
	) {
		return new Response(JSON.stringify({ message: 'Use the application admin API.' }), {
			status: 403,
			headers: {
				'content-type': 'application/json; charset=utf-8',
				'cache-control': 'no-store'
			}
		});
	}

	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	// Vite can receive HTTP from a TLS tunnel while the public auth URL is HTTPS.
	// In development, route by path because the helper skips mismatched origins.
	if (dev && !building && event.url.pathname.startsWith('/api/auth/')) {
		return auth.handler(event.request);
	}
	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = handleBetterAuth;
