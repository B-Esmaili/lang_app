import { completeAiChat, AiServiceError } from '$lib/server/ai-service';
import { getUserAiServiceOptions, UserAiCredentialError } from '$lib/server/ai-user-credentials';
import { createCourseExplainPrompt, isCourseExplainAction } from '$lib/server/course-explains';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth.schema';
import {
	apiFailure,
	ApiRequestError,
	assertSameOrigin,
	readJsonObject,
	requireViewer
} from '$lib/server/api-request';
import { nativeLanguages } from '$lib/domain/native-languages';
import { eq } from 'drizzle-orm';
import { json, type RequestHandler } from '@sveltejs/kit';

const MAX_EXPLAINED_TEXT_LENGTH = 12_000;

async function getViewerNativeLanguage(userId: string): Promise<{ code: string; label: string }> {
	const [profile] = await db
		.select({ nativeLanguage: user.nativeLanguage })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	const language = nativeLanguages.find((candidate) => candidate.code === profile?.nativeLanguage);
	if (!language) {
		throw new ApiRequestError(
			400,
			'Choose your native language in Account settings before translating a passage.'
		);
	}
	return language;
}

export const POST: RequestHandler = async ({ fetch, locals, request, url }) => {
	try {
		assertSameOrigin(request, url);
		const viewer = requireViewer(locals);

		const body = await readJsonObject(request);
		const text = typeof body.text === 'string' ? body.text.trim() : '';
		if (!isCourseExplainAction(body.action)) {
			throw new ApiRequestError(400, 'Choose a supported explanation action.');
		}
		const action = body.action;
		if (!text) throw new ApiRequestError(400, 'Select text to explain.');
		if (text.length > MAX_EXPLAINED_TEXT_LENGTH) {
			throw new ApiRequestError(
				413,
				`Selected text must be ${MAX_EXPLAINED_TEXT_LENGTH.toLocaleString()} characters or fewer.`
			);
		}
		const nativeLanguage =
			action === 'translate' ? await getViewerNativeLanguage(viewer.id) : undefined;

		const explanation = await completeAiChat(
			{
				messages: [
					{
						role: 'user',
						content: createCourseExplainPrompt({
							action,
							text,
							nativeLanguage: nativeLanguage?.label
						})
					}
				]
			},
			await getUserAiServiceOptions(viewer.id, fetch)
		);

		return json(
			{
				action,
				explanation,
				...(nativeLanguage ? { targetLanguage: nativeLanguage.code } : {})
			},
			{ headers: { 'cache-control': 'no-store' } }
		);
	} catch (error) {
		if (error instanceof AiServiceError || error instanceof UserAiCredentialError) {
			return json({ error: error.message }, { status: error.status });
		}
		return apiFailure(error);
	}
};
