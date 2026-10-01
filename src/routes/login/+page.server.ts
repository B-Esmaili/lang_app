import { dev } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) redirect(303, '/dashboard');
	const requested = url.searchParams.get('redirect');
	const redirectTo =
		requested?.startsWith('/') && !requested.startsWith('//') && !requested.includes('\\')
			? requested
			: '/dashboard';
	return {
		redirectTo,
		developmentCredentials: dev ? { username: 'admin', password: '123456' } : null
	};
};
