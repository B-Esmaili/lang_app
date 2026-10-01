import { json, type RequestHandler } from '@sveltejs/kit';
import { createLessonTemplate, listLessonTemplates } from '$lib/server/courses';
import {
	apiFailure,
	assertSameOrigin,
	readJsonObject,
	requireViewer
} from '$lib/server/api-request';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		return json({ templates: await listLessonTemplates(requireViewer(locals)) });
	} catch (error) {
		return apiFailure(error);
	}
};

export const POST: RequestHandler = async ({ locals, request, url }) => {
	try {
		assertSameOrigin(request, url);
		return json(await createLessonTemplate(requireViewer(locals), await readJsonObject(request)), {
			status: 201
		});
	} catch (error) {
		return apiFailure(error);
	}
};
