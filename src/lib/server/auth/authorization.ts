import { auth, type AuthSession } from '$lib/server/auth';
import { hasAnyAppRole, type AppRole } from './roles';

export const COURSE_AUTHOR_ROLES = ['admin', 'teacher'] as const satisfies readonly AppRole[];

export class AuthorizationError extends Error {
	constructor(
		public readonly status: 401 | 403,
		message: string
	) {
		super(message);
		this.name = 'AuthorizationError';
	}
}

export async function getAuthSession(headers: Headers): Promise<AuthSession | null> {
	return auth.api.getSession({ headers });
}

export async function requireAuthSession(headers: Headers): Promise<AuthSession> {
	const session = await getAuthSession(headers);
	if (!session) throw new AuthorizationError(401, 'Authentication is required.');
	return session;
}

export async function requireRoleSession(
	headers: Headers,
	allowedRoles: readonly AppRole[]
): Promise<AuthSession> {
	const session = await requireAuthSession(headers);
	if (!sessionHasAnyRole(session, allowedRoles)) {
		throw new AuthorizationError(403, 'You do not have permission to perform this action.');
	}
	return session;
}

export function sessionHasAnyRole(
	session: Pick<AuthSession, 'user'>,
	allowedRoles: readonly AppRole[]
): boolean {
	return hasAnyAppRole(session.user, allowedRoles);
}
