import { error } from '@sveltejs/kit';
import { AdminUserError, rethrowAdminUserError } from './admin-users';

export function assertSameOrigin(request: Request, url: URL): void {
	const fetchSite = request.headers.get('sec-fetch-site');
	if (fetchSite === 'cross-site') throw error(403, 'Cross-site requests are not allowed.');

	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) throw error(403, 'Request origin is not allowed.');
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
	try {
		const body: unknown = await request.json();
		if (!body || typeof body !== 'object' || Array.isArray(body)) {
			throw new AdminUserError(400, 'Request body must be a JSON object.');
		}
		return body as Record<string, unknown>;
	} catch (caught) {
		if (caught instanceof AdminUserError) throw caught;
		throw new AdminUserError(400, 'Request body must contain valid JSON.');
	}
}

export function throwHttpAdminError(caught: unknown): never {
	try {
		rethrowAdminUserError(caught);
	} catch (normalized) {
		if (normalized instanceof AdminUserError) {
			throw error(normalized.status, normalized.message);
		}
		throw normalized;
	}
}

export const PRIVATE_JSON_HEADERS = {
	'cache-control': 'private, no-store'
} as const;
