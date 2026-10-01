import { pgTable, serial, integer, text } from 'drizzle-orm/pg-core';

export const task = pgTable('task', {
	id: serial('id').primaryKey(),
	title: text('title').notNull(),
	priority: integer('priority').notNull().default(1)
});

export * from './auth.schema';
export * from './ai-credential.schema';
export * from './course.schema';
export * from './media.schema';
export * from './transcription.schema';
export * from './voice-chat.schema';
