import { error } from '@sveltejs/kit';
import { listManagedUsers } from '$lib/server/auth/admin-users';
import { isAppRole } from '$lib/server/auth/roles';
import type { ManagedUsersResponse } from '$lib/features/admin-users';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, request }) => {
	const { viewer } = await parent();
	if (viewer.role !== 'admin') error(403, 'Administrator access is required.');
	const result = await listManagedUsers(request.headers, { page: 1, pageSize: 25 });
	const initial: ManagedUsersResponse = {
		...result,
		users: result.users.map((item) => {
			const account = item as typeof item & { username?: string | null };
			return {
				id: item.id,
				name: item.name,
				email: item.email,
				username: account.username ?? null,
				role: isAppRole(item.role) ? item.role : 'student',
				banned: item.banned ?? false,
				banReason: item.banReason ?? null,
				banExpires: item.banExpires?.toISOString() ?? null,
				createdAt: item.createdAt.toISOString(),
				updatedAt: item.updatedAt.toISOString()
			};
		})
	};
	return { initial };
};
