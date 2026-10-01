import { json, type RequestHandler } from '@sveltejs/kit';
import { deleteCourse, getCourseBuilderData, updateCourse } from '$lib/server/courses';
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
			await getCourseBuilderData(
				requireRouteParam(params.courseId, 'Course id'),
				requireViewer(locals)
			)
		);
	} catch (error) {
		return apiFailure(error);
	}
};

export const PATCH: RequestHandler = async ({ locals, params, request, url }) => {
	try {
		assertSameOrigin(request, url);
		return json(
			await updateCourse(
				requireRouteParam(params.courseId, 'Course id'),
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
		await deleteCourse(requireRouteParam(params.courseId, 'Course id'), requireViewer(locals));
		return new Response(null, { status: 204 });
	} catch (error) {
		return apiFailure(error);
	}
};
