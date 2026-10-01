import { error } from '@sveltejs/kit';
import { CourseServiceError, getCourseBuilderData } from '$lib/server/courses';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, params }) => {
	const { viewer } = await parent();
	if (viewer.role === 'student') error(403, 'Teacher or administrator access is required.');
	if (!params.courseId) error(400, 'Course id is required.');
	try {
		return {
			builder: await getCourseBuilderData(params.courseId, viewer),
			nativeLanguage: viewer.nativeLanguage
		};
	} catch (caught) {
		if (caught instanceof CourseServiceError) error(caught.status, caught.message);
		throw caught;
	}
};
