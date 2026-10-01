import { json, type RequestHandler } from '@sveltejs/kit';
import { transcribeCourseMediaResource } from '$lib/server/courses';
import {
	apiFailure,
	assertSameOrigin,
	requireRouteParam,
	requireViewer
} from '$lib/server/api-request';

export const POST: RequestHandler = async ({ locals, params, request, url }) => {
	try {
		assertSameOrigin(request, url);
		return json(
			await transcribeCourseMediaResource(
				requireRouteParam(params.courseId, 'Course ID'),
				requireRouteParam(params.resourceId, 'Resource ID'),
				requireViewer(locals)
			)
		);
	} catch (error) {
		return apiFailure(error);
	}
};
