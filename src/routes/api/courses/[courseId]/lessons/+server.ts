import { json, type RequestHandler } from '@sveltejs/kit';
import { createLesson } from '$lib/server/courses';
import {
	apiFailure,
	assertSameOrigin,
	readJsonObject,
	requireRouteParam,
	requireViewer
} from '$lib/server/api-request';

export const POST: RequestHandler = async ({ locals, params, request, url }) => {
	try {
		assertSameOrigin(request, url);
		return json(
			await createLesson(
				requireRouteParam(params.courseId, 'Course id'),
				requireViewer(locals),
				await readJsonObject(request)
			),
			{ status: 201 }
		);
	} catch (error) {
		return apiFailure(error);
	}
};
