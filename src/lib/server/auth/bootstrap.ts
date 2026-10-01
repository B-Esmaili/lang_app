import { and, eq, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth.schema';

export interface DevelopmentAdminBootstrapOptions {
	username: string;
	password: string;
	email: string;
	name: string;
}

interface AdminCreator {
	(input: {
		body: {
			email: string;
			password: string;
			name: string;
			role: 'admin';
			data: {
				username: string;
				displayUsername: string;
				emailVerified: true;
			};
		};
	}): Promise<unknown>;
}

let bootstrapPromise: Promise<void> | undefined;

export function bootstrapDevelopmentAdmin(
	options: DevelopmentAdminBootstrapOptions,
	createAdmin: AdminCreator
): Promise<void> {
	bootstrapPromise ??= runBootstrap(options, createAdmin);
	return bootstrapPromise;
}

async function runBootstrap(
	options: DevelopmentAdminBootstrapOptions,
	createAdmin: AdminCreator
): Promise<void> {
	const createdNewAdmin = await db.transaction(async (transaction) => {
		// Serializes bootstrap attempts from multiple development server workers.
		await transaction.execute(sql`select pg_advisory_xact_lock(1280197211)`);

		const matches = await transaction
			.select({
				id: user.id,
				email: user.email,
				username: user.username,
				role: user.role
			})
			.from(user)
			.where(or(eq(user.email, options.email.toLowerCase()), eq(user.username, options.username)))
			.limit(2);

		if (matches.length > 0) {
			const expectedIdentity = matches.find(
				(candidate) =>
					candidate.email === options.email.toLowerCase() && candidate.username === options.username
			);

			if (matches.length === 1 && expectedIdentity?.role === 'admin') return false;

			throw new Error(
				`Development admin bootstrap refused: username "${options.username}" or email "${options.email}" already belongs to a different or non-admin account.`
			);
		}

		// Better Auth's server-side Admin endpoint hashes the password and links the
		// credential account. Calling it without request headers is its documented
		// bootstrap/CLI path; regular HTTP calls still require an admin session.
		await createAdmin({
			body: {
				email: options.email,
				password: options.password,
				name: options.name,
				role: 'admin',
				data: {
					username: options.username,
					displayUsername: options.username,
					emailVerified: true
				}
			}
		});

		const created = await transaction
			.select({ id: user.id })
			.from(user)
			.where(
				and(
					eq(user.email, options.email.toLowerCase()),
					eq(user.username, options.username),
					eq(user.role, 'admin')
				)
			)
			.limit(1);

		if (created.length !== 1) {
			throw new Error('Development admin bootstrap did not create the expected admin account.');
		}

		return true;
	});

	if (createdNewAdmin) {
		console.info(`[auth] Created temporary development administrator "${options.username}".`);
	}
}
