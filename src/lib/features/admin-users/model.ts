export const APP_ROLES = ['admin', 'teacher', 'student'] as const;

export type AppRole = (typeof APP_ROLES)[number];

export interface ManagedUser {
	id: string;
	name: string;
	email: string;
	username: string | null;
	role: AppRole;
	banned: boolean;
	banReason: string | null;
	banExpires: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface ManagedUsersResponse {
	users: ManagedUser[];
	total: number;
	page: number;
	pageSize: number;
}

export interface UserDraft {
	id?: string;
	name: string;
	email: string;
	username: string;
	password: string;
	role: AppRole;
	banned: boolean;
	banReason: string;
}

export const EMPTY_USER_DRAFT: UserDraft = {
	name: '',
	email: '',
	username: '',
	password: '',
	role: 'student',
	banned: false,
	banReason: ''
};

export function isAppRole(value: unknown): value is AppRole {
	return typeof value === 'string' && APP_ROLES.includes(value as AppRole);
}

export function normalizeManagedUser(value: Record<string, unknown>): ManagedUser {
	return {
		id: String(value.id ?? ''),
		name: String(value.name ?? ''),
		email: String(value.email ?? ''),
		username: typeof value.username === 'string' ? value.username : null,
		role: isAppRole(value.role) ? value.role : 'student',
		banned: value.banned === true,
		banReason: typeof value.banReason === 'string' ? value.banReason : null,
		banExpires: value.banExpires ? String(value.banExpires) : null,
		createdAt: String(value.createdAt ?? ''),
		updatedAt: String(value.updatedAt ?? '')
	};
}

export function draftFromUser(user: ManagedUser): UserDraft {
	return {
		id: user.id,
		name: user.name,
		email: user.email,
		username: user.username ?? '',
		password: '',
		role: user.role,
		banned: user.banned,
		banReason: user.banReason ?? ''
	};
}
