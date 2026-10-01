import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth.schema';
import { userAiConnection } from './ai-credential.schema';

export const userVoiceChatSettings = pgTable('user_voice_chat_settings', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	connectionId: text('connection_id').references(() => userAiConnection.id, {
		onDelete: 'set null'
	}),
	voiceId: text('voice_id').notNull().default('en_US-hfc_female-medium'),
	updatedAt: timestamp('updated_at')
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())
});
