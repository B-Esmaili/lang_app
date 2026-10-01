import { redirect } from '@sveltejs/kit';
import { parseAppRoles, type AppRole } from '$lib/server/auth/roles';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		const destination = `${url.pathname}${url.search}`;
		redirect(303, `/login?redirect=${encodeURIComponent(destination)}`);
	}

	const role: AppRole = parseAppRoles(locals.user.role)[0] ?? 'student';
	return {
		viewer: {
			id: locals.user.id,
			name: locals.user.name,
			email: locals.user.email,
			avatarUrl: locals.user.image ?? undefined,
			username: locals.user.username ?? undefined,
			nativeLanguage: locals.user.nativeLanguage ?? undefined,
			freeChatConnectionId: locals.user.freeChatConnectionId ?? undefined,
			translationConnectionId:
				role === 'student' ? undefined : (locals.user.translationConnectionId ?? undefined),
			role
		}
	};
};
