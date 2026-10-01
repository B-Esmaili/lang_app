import { adminAc, defaultAc, userAc } from 'better-auth/plugins/admin/access';

export const APP_ROLES = ['admin', 'teacher', 'student'] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const appAccessControl = defaultAc;

export const appRolePermissions = {
	admin: adminAc,
	teacher: userAc,
	student: userAc
} as const;

export function isAppRole(value: unknown): value is AppRole {
	return typeof value === 'string' && APP_ROLES.includes(value as AppRole);
}

export function parseAppRoles(value: string | null | undefined): AppRole[] {
	if (!value) return [];

	return value
		.split(',')
		.map((role) => role.trim())
		.filter(isAppRole);
}

export function hasAppRole(
	user: { role?: string | null } | null | undefined,
	role: AppRole
): boolean {
	return parseAppRoles(user?.role).includes(role);
}

export function hasAnyAppRole(
	user: { role?: string | null } | null | undefined,
	allowedRoles: readonly AppRole[]
): boolean {
	return allowedRoles.some((role) => hasAppRole(user, role));
}
