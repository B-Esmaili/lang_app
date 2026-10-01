import { error } from '@sveltejs/kit';
import { listUserAiConnections } from '$lib/server/ai-user-credentials';
import { getVoiceChatPreferences } from '$lib/server/voice-chat-settings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) error(401, 'Sign in is required.');
	const [aiConnections, voiceChatPreferences] = await Promise.all([
		listUserAiConnections(locals.user.id),
		getVoiceChatPreferences(locals.user.id)
	]);
	return { aiConnections, voiceChatPreferences };
};
