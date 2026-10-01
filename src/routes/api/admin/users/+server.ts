import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createManagedUser,
	deleteManagedUser,
	listManagedUsers,
	updateManagedUser,
	type ManagedUserCreateInput,
	type ManagedUserUpdateInput
} from '$lib/server/auth/admin-users';
import {
	assertSameOrigin,
	PRIVATE_JSON_HEADERS,
	readJsonObject,
	throwHttpAdminError
} from '$lib/server/auth/http';

export const GET: RequestHandler = async ({ request, url }) => {
	try {
		const page = boundedInteger(url.searchParams.get('page'), 1, 1, 100_000);
		const pageSize = boundedInteger(url.searchParams.get('pageSize'), 25, 1, 100);
		const result = await listManagedUsers(request.headers, {
			page,
			pageSize,
			query: url.searchParams.get('q') ?? undefined
		});

		return json(result, { headers: PRIVATE_JSON_HEADERS });
	} catch (caught) {
		throwHttpAdminError(caught);
	}
};

export const POST: RequestHandler = async ({ request, url }) => {
	try {
		assertSameOrigin(request, url);
		const body = await readJsonObject(request);
		const result = await createManagedUser(
			request.headers,
			body as unknown as ManagedUserCreateInput
		);

		return json(result, { status: 201, headers: PRIVATE_JSON_HEADERS });
	} catch (caught) {
		throwHttpAdminError(caught);
	}
};

export const PATCH: RequestHandler = async ({ request, url }) => {
	try {
		assertSameOrigin(request, url);
		const body = await readJsonObject(request);
		const result = await updateManagedUser(
			request.headers,
			body as unknown as ManagedUserUpdateInput
		);

		return json({ user: result }, { headers: PRIVATE_JSON_HEADERS });
	} catch (caught) {
		throwHttpAdminError(caught);
	}
};

export const DELETE: RequestHandler = async ({ request, url }) => {
	try {
		assertSameOrigin(request, url);
		const result = await deleteManagedUser(request.headers, url.searchParams.get('id') ?? '');

		return json(result, { headers: PRIVATE_JSON_HEADERS });
	} catch (caught) {
		throwHttpAdminError(caught);
	}
};

function boundedInteger(
	value: string | null,
	fallback: number,
	minimum: number,
	maximum: number
): number {
	if (value === null || value === '') return fallback;
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) return fallback;
	return parsed;
}
