import { json, type RequestHandler } from '@sveltejs/kit';
import { deleteLesson, updateLesson } from '$lib/server/courses';
import {
	apiFailure,
	assertSameOrigin,
	readJsonObject,
	requireRouteParam,
	requireViewer
} from '$lib/server/api-request';

export const PATCH: RequestHandler = async ({ locals, params, request, url }) => {
	try {
		assertSameOrigin(request, url);
		return json(
			await updateLesson(
				requireRouteParam(params.courseId, 'Course id'),
				requireRouteParam(params.lessonId, 'Lesson id'),
				requireViewer(locals),
				await readJsonObject(request)
			)
		);
	} catch (error) {
		return apiFailure(error);
	}
};

export const DELETE: RequestHandler = async ({ locals, params, request, url }) => {
	try {
		assertSameOrigin(request, url);
		await deleteLesson(
			requireRouteParam(params.courseId, 'Course id'),
			requireRouteParam(params.lessonId, 'Lesson id'),
			requireViewer(locals)
		);
		return new Response(null, { status: 204 });
	} catch (error) {
		return apiFailure(error);
	}
};
