import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth.schema';

/** A named OpenAI-compatible connection owned by one user. */
export const userAiConnection = pgTable(
	'user_ai_connection',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		label: text('label').notNull(),
		provider: text('provider').notNull().default('openai-compatible'),
		baseUrl: text('base_url').notNull(),
		model: text('model').notNull(),
		encryptedApiKey: text('encrypted_api_key').notNull(),
		isAssistant: boolean('is_assistant').notNull().default(false),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(table) => [
		index('user_ai_connection_user_idx').on(table.userId),
		uniqueIndex('user_ai_connection_one_assistant_idx')
			.on(table.userId)
			.where(sql`${table.isAssistant}`)
	]
);
