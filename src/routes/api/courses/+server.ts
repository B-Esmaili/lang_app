import { json, type RequestHandler } from '@sveltejs/kit';
import { createCourse, listCourses } from '$lib/server/courses';
import {
	apiFailure,
	assertSameOrigin,
	readJsonObject,
	requireViewer
} from '$lib/server/api-request';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		return json({ courses: await listCourses(requireViewer(locals)) });
	} catch (error) {
		return apiFailure(error);
	}
};

export const POST: RequestHandler = async ({ locals, request, url }) => {
	try {
		assertSameOrigin(request, url);
		const created = await createCourse(requireViewer(locals), await readJsonObject(request));
		return json(created, { status: 201 });
	} catch (error) {
		return apiFailure(error);
	}
};
