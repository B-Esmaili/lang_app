import { json, type RequestHandler } from '@sveltejs/kit';
import {
	createCourseNote,
	listCourseNotes,
	upsertCourseTranslationNote
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
			await listCourseNotes(requireRouteParam(params.courseId, 'Course ID'), requireViewer(locals))
		);
	} catch (error) {
		return apiFailure(error);
	}
};

export const POST: RequestHandler = async ({ locals, params, request, url }) => {
	try {
		assertSameOrigin(request, url);
		const courseId = requireRouteParam(params.courseId, 'Course ID');
		const viewer = requireViewer(locals);
		const input = await readJsonObject(request);
		const note =
			input.kind === 'translation' && input.visibility === 'course'
				? await upsertCourseTranslationNote(courseId, viewer, input)
				: await createCourseNote(courseId, viewer, input);
		return json(note, { status: 201 });
	} catch (error) {
		return apiFailure(error);
	}
};
