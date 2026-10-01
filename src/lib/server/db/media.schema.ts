import {
	type AnyPgColumn,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { user } from './auth.schema';

/** A user-owned directory in the media manager's nested namespace. */
export const mediaFolder = pgTable(
	'media_folder',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		parentId: text('parent_id').references((): AnyPgColumn => mediaFolder.id, {
			onDelete: 'cascade'
		}),
		name: text('name').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('media_folder_owner_id_idx').on(table.ownerId),
		index('media_folder_parent_id_idx').on(table.parentId),
		uniqueIndex('media_folder_owner_parent_name_idx').on(table.ownerId, table.parentId, table.name)
	]
);

/** A stable, addressable media leaf. The file itself is held by its source URL. */
export const mediaAsset = pgTable(
	'media_asset',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		folderId: text('folder_id').references(() => mediaFolder.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		kind: text('kind').notNull(),
		sourceUrl: text('source_url').notNull(),
		mimeType: text('mime_type'),
		metadata: jsonb('metadata').$type<Record<string, unknown>>(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('media_asset_owner_id_idx').on(table.ownerId),
		index('media_asset_folder_id_idx').on(table.folderId),
		uniqueIndex('media_asset_owner_folder_name_idx').on(table.ownerId, table.folderId, table.name)
	]
);
