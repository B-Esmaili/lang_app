import { json, type RequestHandler } from '@sveltejs/kit';
import {
	createCourseBookmark,
	listCourseBookmarks
} from '$lib/server/courses';
import {
	apiFailure,
	assertSameOrigin,
	readJsonObject,
	requireRouteParam,
	requireViewer
} from '$lib/server/api-request';

export const GET: RequestHandler = async ({ locals, params }) => {
	try {
		return json(
			await listCourseBookmarks(
				requireRouteParam(params.courseId, 'Course ID'),
				requireViewer(locals)
			)
		);
	} catch (error) {
		return apiFailure(error);
	}
};

export const POST: RequestHandler = async ({ locals, params, request, url }) => {
	try {
		assertSameOrigin(request, url);
		return json(
			await createCourseBookmark(
				requireRouteParam(params.courseId, 'Course ID'),
				requireViewer(locals),
				await readJsonObject(request)
			),
			{ status: 201 }
		);
	} catch (error) {
		return apiFailure(error);
	}
};
