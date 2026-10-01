import { redirect } from '@sveltejs/kit';
import { listCourses } from '$lib/server/courses';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { viewer } = await parent();
	if (viewer.role !== 'student') redirect(303, '/courses');
	return { courses: await listCourses(viewer) };
};
