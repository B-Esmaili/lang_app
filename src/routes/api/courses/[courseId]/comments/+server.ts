import { json, type RequestHandler } from '@sveltejs/kit';
import { createCourseComment, listCourseComments } from '$lib/server/courses';
import { apiFailure, assertSameOrigin, readJsonObject, requireRouteParam, requireViewer } from '$lib/server/api-request';

export const GET: RequestHandler = async ({ locals, params }) => {
	try { return json(await listCourseComments(requireRouteParam(params.courseId, 'Course ID'), requireViewer(locals))); }
	catch (error) { return apiFailure(error); }
};

export const POST: RequestHandler = async ({ locals, params, request, url }) => {
	try {
		assertSameOrigin(request, url);
		return json(await createCourseComment(requireRouteParam(params.courseId, 'Course ID'), requireViewer(locals), await readJsonObject(request)), { status: 201 });
	} catch (error) { return apiFailure(error); }
};
