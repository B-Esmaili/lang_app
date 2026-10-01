import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { viewer } = await parent();
	if (viewer.role === 'student') error(403, 'Teacher or administrator access is required.');
};
