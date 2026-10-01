import { listCourses } from '$lib/server/courses';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { viewer } = await parent();
	return { courses: await listCourses(viewer) };
};
