import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { userAiConnection } from './db/ai-credential.schema';
import { userVoiceChatSettings } from './db/voice-chat.schema';
import { UserAiCredentialError } from './ai-user-credentials';
import {
	DEFAULT_VOICE_CHAT_VOICE,
	isVoiceChatVoiceId,
	type VoiceChatPreferences
} from '$lib/features/voice-chat/voices';

export async function getVoiceChatPreferences(userId: string): Promise<VoiceChatPreferences> {
	const [row] = await db
		.select()
		.from(userVoiceChatSettings)
		.where(eq(userVoiceChatSettings.userId, userId))
		.limit(1);
	return {
		connectionId: row?.connectionId ?? null,
		voiceId: isVoiceChatVoiceId(row?.voiceId) ? row.voiceId : DEFAULT_VOICE_CHAT_VOICE
	};
}

export async function saveVoiceChatPreferences(
	userId: string,
	value: Record<string, unknown>
): Promise<VoiceChatPreferences> {
	if (
		value.connectionId !== null &&
		(typeof value.connectionId !== 'string' || value.connectionId.length > 255)
	) {
		throw new UserAiCredentialError('Choose a saved AI connection for voice chat.', 400);
	}
	if (!isVoiceChatVoiceId(value.voiceId)) {
		throw new UserAiCredentialError('Choose an available English speaker.', 400);
	}
	const connectionId = value.connectionId?.trim() || null;
	if (connectionId) {
		const [owned] = await db
			.select({ id: userAiConnection.id })
			.from(userAiConnection)
			.where(and(eq(userAiConnection.id, connectionId), eq(userAiConnection.userId, userId)))
			.limit(1);
		if (!owned) throw new UserAiCredentialError('AI connection not found.', 404);
	}
	const preferences = { connectionId, voiceId: value.voiceId };
	await db
		.insert(userVoiceChatSettings)
		.values({ userId, ...preferences })
		.onConflictDoUpdate({
			target: userVoiceChatSettings.userId,
			set: { ...preferences, updatedAt: new Date() }
		});
	return preferences;
}
