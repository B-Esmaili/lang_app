import { type RequestHandler } from '@sveltejs/kit';
import { deleteCourseMediaResource } from '$lib/server/courses';
import {
	apiFailure,
	assertSameOrigin,
	requireRouteParam,
	requireViewer
} from '$lib/server/api-request';

export const DELETE: RequestHandler = async ({ locals, params, request, url }) => {
	try {
		assertSameOrigin(request, url);
		await deleteCourseMediaResource(
			requireRouteParam(params.courseId, 'Course ID'),
			requireRouteParam(params.resourceId, 'Resource ID'),
			requireViewer(locals)
		);
		return new Response(null, { status: 204 });
	} catch (error) {
		return apiFailure(error);
	}
};
