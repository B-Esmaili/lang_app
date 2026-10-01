import { env } from '$env/dynamic/private';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, username } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { z } from 'zod';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { bootstrapDevelopmentAdmin } from '$lib/server/auth/bootstrap';
import { appRolePermissions } from '$lib/server/auth/roles';
import { nativeLanguageCodes } from '$lib/domain/native-languages';

export const auth = betterAuth({
	baseURL: env.BETTER_AUTH_URL ?? env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	disabledPaths: [
		// User mutations go through /api/admin/users so application invariants such
		// as preserving owned courses and keeping an active admin cannot be bypassed.
		'/admin/create-user',
		'/admin/update-user',
		'/admin/set-role',
		'/admin/ban-user',
		'/admin/unban-user',
		'/admin/remove-user',
		'/admin/set-user-password'
	],
	database: drizzleAdapter(db, { provider: 'pg' }),
	user: {
		additionalFields: {
			freeChatConnectionId: {
				type: 'string',
				required: false,
				input: false,
				fieldName: 'freeChatConnectionId'
			},
			translationConnectionId: {
				type: 'string',
				required: false,
				input: false,
				fieldName: 'translationConnectionId'
			},
			nativeLanguage: {
				type: 'string',
				required: false,
				fieldName: 'nativeLanguage',
				validator: {
					input: z
						.string()
						.refine((value) => nativeLanguageCodes.includes(value), 'Choose a supported language.')
						.nullable()
				}
			}
		}
	},
	emailAndPassword: {
		enabled: true,
		minPasswordLength: 6,
		revokeSessionsOnPasswordReset: true
	},
	plugins: [
		admin({
			roles: appRolePermissions,
			defaultRole: 'student',
			adminRoles: ['admin']
		}),
		username({
			minUsernameLength: 3,
			maxUsernameLength: 30
		}),
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});

export type AuthSession = typeof auth.$Infer.Session;
export type AuthUser = AuthSession['user'];

let developmentAdminBootstrap: Promise<void> | undefined;

export function ensureDevelopmentAdmin(isDevelopment: boolean): Promise<void> {
	if (developmentAdminBootstrap) return developmentAdminBootstrap;

	const bootstrapSetting = env.BETTER_AUTH_BOOTSTRAP_ADMIN;

	if (bootstrapSetting === 'false' || (!isDevelopment && bootstrapSetting !== 'true')) {
		return Promise.resolve();
	}

	if (
		!isDevelopment &&
		(!env.BETTER_AUTH_BOOTSTRAP_ADMIN_USERNAME ||
			!env.BETTER_AUTH_BOOTSTRAP_ADMIN_PASSWORD ||
			!env.BETTER_AUTH_BOOTSTRAP_ADMIN_EMAIL)
	) {
		return Promise.reject(
			new Error(
				'Production admin bootstrap requires explicit username, password, and email environment variables.'
			)
		);
	}

	if (!isDevelopment && env.BETTER_AUTH_BOOTSTRAP_ADMIN_PASSWORD!.length < 12) {
		return Promise.reject(
			new Error('Production admin bootstrap requires a password of at least 12 characters.')
		);
	}

	const options = {
		username: env.BETTER_AUTH_BOOTSTRAP_ADMIN_USERNAME ?? 'admin',
		password: env.BETTER_AUTH_BOOTSTRAP_ADMIN_PASSWORD ?? '123456',
		email: env.BETTER_AUTH_BOOTSTRAP_ADMIN_EMAIL ?? 'admin@local.invalid',
		name: env.BETTER_AUTH_BOOTSTRAP_ADMIN_NAME ?? 'Administrator'
	};

	developmentAdminBootstrap = bootstrapDevelopmentAdmin(options, (input) =>
		auth.api.createUser(input)
	);

	return developmentAdminBootstrap;
}
