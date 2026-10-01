import { type RequestHandler } from '@sveltejs/kit';
import { deleteCourseBookmark } from '$lib/server/courses';
import {
	apiFailure,
	assertSameOrigin,
	requireRouteParam,
	requireViewer
} from '$lib/server/api-request';

export const DELETE: RequestHandler = async ({ locals, params, request, url }) => {
	try {
		assertSameOrigin(request, url);
		await deleteCourseBookmark(
			requireRouteParam(params.courseId, 'Course ID'),
			requireRouteParam(params.bookmarkId, 'Bookmark ID'),
			requireViewer(locals)
		);
		return new Response(null, { status: 204 });
	} catch (error) {
		return apiFailure(error);
	}
};
