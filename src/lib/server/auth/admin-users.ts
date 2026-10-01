import { and, count, eq } from 'drizzle-orm';
import { APIError } from 'better-auth/api';
import { auth, type AuthSession } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth.schema';
import { course } from '$lib/server/db/course.schema';
import { AuthorizationError, requireRoleSession } from './authorization';
import { isAppRole, type AppRole } from './roles';

const MIN_PASSWORD_LENGTH = 8;
const USERNAME_PATTERN = /^[a-zA-Z0-9_.]+$/;

export interface ManagedUserCreateInput {
	username: string;
	name: string;
	email: string;
	password: string;
	role: AppRole;
}

export interface ManagedUserUpdateInput {
	id: string;
	username?: string;
	name?: string;
	email?: string;
	password?: string;
	role?: AppRole;
	banned?: boolean;
	banReason?: string;
	banExpiresIn?: number;
}

export interface ManagedUserListInput {
	page: number;
	pageSize: number;
	query?: string;
}

export class AdminUserError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'AdminUserError';
	}
}

export async function requireAdminSession(headers: Headers): Promise<AuthSession> {
	try {
		return await requireRoleSession(headers, ['admin']);
	} catch (caught) {
		if (caught instanceof AuthorizationError) {
			throw new AdminUserError(
				caught.status,
				caught.status === 401 ? caught.message : 'Administrator access is required.'
			);
		}
		throw caught;
	}
}

export async function listManagedUsers(headers: Headers, input: ManagedUserListInput) {
	await requireAdminSession(headers);

	const searchValue = input.query?.trim();
	const result = await auth.api.listUsers({
		headers,
		query: {
			limit: input.pageSize,
			offset: (input.page - 1) * input.pageSize,
			sortBy: 'createdAt',
			sortDirection: 'desc',
			...(searchValue
				? {
						searchValue,
						searchField: searchValue.includes('@') ? ('email' as const) : ('name' as const),
						searchOperator: 'contains' as const
					}
				: {})
		}
	});

	return {
		users: result.users,
		total: result.total,
		page: input.page,
		pageSize: input.pageSize
	};
}

export async function createManagedUser(headers: Headers, input: ManagedUserCreateInput) {
	await requireAdminSession(headers);
	const validated = validateCreateInput(input);
	await assertUsernameAvailable(validated.username);

	return auth.api.createUser({
		headers,
		body: {
			email: validated.email,
			password: validated.password,
			name: validated.name,
			role: validated.role,
			data: {
				username: validated.username,
				displayUsername: validated.username
			}
		}
	});
}

export async function updateManagedUser(headers: Headers, input: ManagedUserUpdateInput) {
	const session = await requireAdminSession(headers);
	const validated = validateUpdateInput(input);
	let mustRevokeSessions = false;
	const target = await auth.api.getUser({ query: { id: validated.id }, headers });
	if (validated.username !== undefined) {
		await assertUsernameAvailable(validated.username, validated.id);
	}

	if (target.id === session.user.id) {
		if (validated.role && validated.role !== 'admin') {
			throw new AdminUserError(400, 'You cannot remove your own administrator role.');
		}
		if (validated.banned === true) {
			throw new AdminUserError(400, 'You cannot ban your own account.');
		}
	}

	const disablesAdmin =
		target.role === 'admin' &&
		((validated.role !== undefined && validated.role !== 'admin') || validated.banned === true);

	if (disablesAdmin) await assertAnotherActiveAdmin(target.id);

	const profileChanges: Record<string, string> = {};
	if (validated.name !== undefined) profileChanges.name = validated.name;
	if (validated.email !== undefined) profileChanges.email = validated.email;
	if (validated.username !== undefined) {
		profileChanges.username = validated.username;
		profileChanges.displayUsername = validated.username;
	}

	if (Object.keys(profileChanges).length > 0) {
		await auth.api.adminUpdateUser({
			headers,
			body: { userId: validated.id, data: profileChanges }
		});
	}

	if (validated.role !== undefined && validated.role !== target.role) {
		await auth.api.setRole({
			headers,
			body: { userId: validated.id, role: validated.role }
		});
		mustRevokeSessions = true;
	}

	if (validated.banned === true) {
		await auth.api.banUser({
			headers,
			body: {
				userId: validated.id,
				...(validated.banReason ? { banReason: validated.banReason } : {}),
				...(validated.banExpiresIn ? { banExpiresIn: validated.banExpiresIn } : {})
			}
		});
	} else if (validated.banned === false) {
		await auth.api.unbanUser({ headers, body: { userId: validated.id } });
	}

	const updatedUser = await auth.api.getUser({ query: { id: validated.id }, headers });

	if (validated.password !== undefined) {
		await auth.api.setUserPassword({
			headers,
			body: { userId: validated.id, newPassword: validated.password }
		});
		mustRevokeSessions = true;
	}

	if (mustRevokeSessions) {
		await auth.api.revokeUserSessions({ headers, body: { userId: validated.id } });
	}

	return updatedUser;
}

export async function deleteManagedUser(headers: Headers, userId: string) {
	const session = await requireAdminSession(headers);
	const id = requiredString(userId, 'User id');

	if (id === session.user.id) {
		throw new AdminUserError(400, 'You cannot delete your own account.');
	}

	const target = await auth.api.getUser({ query: { id }, headers });
	if (target.role === 'admin') await assertAnotherActiveAdmin(target.id);
	await assertUserOwnsNoCourses(id);

	return auth.api.removeUser({ headers, body: { userId: id } });
}

export function rethrowAdminUserError(caught: unknown): never {
	if (caught instanceof AdminUserError) throw caught;

	if (caught instanceof APIError) {
		throw new AdminUserError(caught.statusCode, caught.message || 'The user operation failed.');
	}
	if (isUniqueConstraintError(caught)) {
		throw new AdminUserError(409, 'A user with that email address or username already exists.');
	}

	throw caught;
}

async function assertUsernameAvailable(username: string, excludedUserId?: string): Promise<void> {
	const matches = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.username, username))
		.limit(1);

	if (matches[0] && matches[0].id !== excludedUserId) {
		throw new AdminUserError(409, 'That username is already in use.');
	}
}

function isUniqueConstraintError(caught: unknown): boolean {
	return (
		typeof caught === 'object' &&
		caught !== null &&
		'code' in caught &&
		(caught as { code?: unknown }).code === '23505'
	);
}

async function assertAnotherActiveAdmin(excludedUserId: string): Promise<void> {
	const [result] = await db
		.select({ total: count() })
		.from(user)
		.where(and(eq(user.role, 'admin'), eq(user.banned, false)));

	const target = await db
		.select({ banned: user.banned })
		.from(user)
		.where(eq(user.id, excludedUserId))
		.limit(1);

	const targetIsActive = target[0]?.banned === false;
	if (targetIsActive && result.total <= 1) {
		throw new AdminUserError(409, 'At least one active administrator account must remain.');
	}
}

async function assertUserOwnsNoCourses(userId: string): Promise<void> {
	const [result] = await db
		.select({ total: count() })
		.from(course)
		.where(eq(course.ownerId, userId));

	if (result.total > 0) {
		throw new AdminUserError(
			409,
			'This user owns courses. Transfer or delete those courses before deleting the account.'
		);
	}
}

function validateCreateInput(input: ManagedUserCreateInput): ManagedUserCreateInput {
	return {
		username: validUsername(input.username),
		name: validName(input.name),
		email: validEmail(input.email),
		password: validPassword(input.password),
		role: validRole(input.role)
	};
}

function validateUpdateInput(input: ManagedUserUpdateInput): ManagedUserUpdateInput {
	const output: ManagedUserUpdateInput = { id: requiredString(input.id, 'User id') };

	if (input.username !== undefined) output.username = validUsername(input.username);
	if (input.name !== undefined) output.name = validName(input.name);
	if (input.email !== undefined) output.email = validEmail(input.email);
	if (input.password !== undefined) output.password = validPassword(input.password);
	if (input.role !== undefined) output.role = validRole(input.role);
	if (input.banned !== undefined) {
		if (typeof input.banned !== 'boolean') {
			throw new AdminUserError(400, 'Banned must be true or false.');
		}
		output.banned = input.banned;
	}
	if (input.banReason !== undefined) {
		output.banReason = requiredString(input.banReason, 'Ban reason').slice(0, 500);
	}
	if (input.banExpiresIn !== undefined) {
		if (!Number.isSafeInteger(input.banExpiresIn) || input.banExpiresIn <= 0) {
			throw new AdminUserError(400, 'Ban duration must be a positive number of seconds.');
		}
		output.banExpiresIn = input.banExpiresIn;
	}

	if (Object.keys(output).length === 1) {
		throw new AdminUserError(400, 'Provide at least one user field to update.');
	}

	return output;
}

function validRole(value: unknown): AppRole {
	if (!isAppRole(value)) {
		throw new AdminUserError(400, 'Role must be admin, teacher, or student.');
	}
	return value;
}

function validUsername(value: unknown): string {
	const username = requiredString(value, 'Username').toLowerCase();
	if (username.length < 3 || username.length > 30 || !USERNAME_PATTERN.test(username)) {
		throw new AdminUserError(
			400,
			'Username must be 3–30 characters and use only letters, numbers, underscores, or periods.'
		);
	}
	return username;
}

function validName(value: unknown): string {
	const name = requiredString(value, 'Name');
	if (name.length > 120) throw new AdminUserError(400, 'Name must be 120 characters or fewer.');
	return name;
}

function validEmail(value: unknown): string {
	const email = requiredString(value, 'Email').toLowerCase();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		throw new AdminUserError(400, 'Enter a valid email address.');
	}
	return email;
}

function validPassword(value: unknown): string {
	const password = requiredString(value, 'Password', false);
	if (password.length < MIN_PASSWORD_LENGTH) {
		throw new AdminUserError(
			400,
			`Password must contain at least ${MIN_PASSWORD_LENGTH} characters.`
		);
	}
	if (password.length > 128) {
		throw new AdminUserError(400, 'Password must be 128 characters or fewer.');
	}
	return password;
}

function requiredString(value: unknown, label: string, trim = true): string {
	if (typeof value !== 'string') throw new AdminUserError(400, `${label} is required.`);
	const normalized = trim ? value.trim() : value;
	if (!normalized) throw new AdminUserError(400, `${label} is required.`);
	return normalized;
}
