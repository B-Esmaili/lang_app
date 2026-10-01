import { json } from '@sveltejs/kit';
import { CourseServiceError, type AppRole, type CourseViewer } from '$lib/server/courses';
import { DeepgramRequestError } from '$lib/server/deepgram';
import { MediaLibraryError } from '$lib/server/media-library';
import { MediaStorageError } from '$lib/server/media-storage';

export class ApiRequestError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'ApiRequestError';
	}
}

export function requireViewer(locals: App.Locals): CourseViewer {
	if (!locals.user) throw new ApiRequestError(401, 'Sign in is required.');
	const candidate = (locals.user as typeof locals.user & { role?: unknown }).role;
	const role: AppRole =
		candidate === 'admin' || candidate === 'teacher' || candidate === 'student'
			? candidate
			: 'student';
	return { id: locals.user.id, role };
}

export function assertSameOrigin(request: Request, url: URL) {
	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin)
		throw new ApiRequestError(403, 'Cross-origin request rejected.');
	if (request.headers.get('sec-fetch-site') === 'cross-site') {
		throw new ApiRequestError(403, 'Cross-site request rejected.');
	}
}

export function requireRouteParam(value: string | undefined, label: string): string {
	if (!value) throw new ApiRequestError(400, `${label} is required.`);
	return value;
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
	if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
		throw new ApiRequestError(415, 'Expected an application/json request.');
	}
	const length = Number(request.headers.get('content-length') ?? 0);
	if (Number.isFinite(length) && length > 1_600_000) {
		throw new ApiRequestError(413, 'Request body is too large.');
	}
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw new ApiRequestError(400, 'Request body contains invalid JSON.');
	}
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		throw new ApiRequestError(400, 'Request body must be a JSON object.');
	}
	return body as Record<string, unknown>;
}

export function apiFailure(error: unknown) {
	if (
		error instanceof ApiRequestError ||
		error instanceof CourseServiceError ||
		error instanceof MediaLibraryError ||
		error instanceof MediaStorageError ||
		error instanceof DeepgramRequestError
	) {
		return json({ error: error.message }, { status: error.status });
	}
	console.error(error);
	return json({ error: 'An unexpected server error occurred.' }, { status: 500 });
}
