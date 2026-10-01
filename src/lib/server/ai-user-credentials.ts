import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, count, desc, eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { userAiConnection } from '$lib/server/db/ai-credential.schema';
import { user } from '$lib/server/db/auth.schema';
import { getAiServiceOptions } from './ai-config';
import type { NineRouterOptions } from './nine-router';

const CIPHER = 'aes-256-gcm';
const CREDENTIAL_VERSION = 'v1';
const OPENAI_COMPATIBLE_PROVIDER = 'openai-compatible';
const MAX_CONNECTIONS_PER_USER = 20;
const MAX_LABEL_LENGTH = 80;
const MAX_API_KEY_LENGTH = 1_000;
const MAX_BASE_URL_LENGTH = 2_000;
const MAX_MODEL_LENGTH = 500;

export class UserAiCredentialError extends Error {
	constructor(
		message: string,
		public readonly status: number
	) {
		super(message);
		this.name = 'UserAiCredentialError';
	}
}

export type UserAiConnectionSummary = Readonly<{
	id: string;
	label: string;
	provider: 'openai-compatible';
	baseUrl: string;
	model: string;
	isAssistant: boolean;
	updatedAt: string;
}>;

export type UserAiConnectionList = Readonly<{
	connections: UserAiConnectionSummary[];
	assistantConnectionId?: string;
}>;

type ConnectionInput = {
	label: unknown;
	provider: unknown;
	baseUrl: unknown;
	model: unknown;
	apiKey: unknown;
};

/** Returns connection metadata only; encrypted keys are never returned. */
export async function listUserAiConnections(userId: string): Promise<UserAiConnectionList> {
	const rows = await db
		.select({
			id: userAiConnection.id,
			label: userAiConnection.label,
			provider: userAiConnection.provider,
			baseUrl: userAiConnection.baseUrl,
			model: userAiConnection.model,
			isAssistant: userAiConnection.isAssistant,
			updatedAt: userAiConnection.updatedAt
		})
		.from(userAiConnection)
		.where(eq(userAiConnection.userId, userId))
		.orderBy(desc(userAiConnection.isAssistant), desc(userAiConnection.updatedAt));
	const connections = rows.map(toSummary);
	return {
		connections,
		assistantConnectionId: connections.find((connection) => connection.isAssistant)?.id
	};
}

export async function createUserAiConnection(
	userId: string,
	value: ConnectionInput
): Promise<UserAiConnectionSummary> {
	const connection = parseConnectionInput(value, { requireApiKey: true });
	if (!connection.apiKey) throw new UserAiCredentialError('An AI API key is required.', 400);
	const [{ connectionCount }] = await db
		.select({ connectionCount: count() })
		.from(userAiConnection)
		.where(eq(userAiConnection.userId, userId));
	if (connectionCount >= MAX_CONNECTIONS_PER_USER) {
		throw new UserAiCredentialError(
			`You can save up to ${MAX_CONNECTIONS_PER_USER} AI connections.`,
			409
		);
	}

	const now = new Date();
	const [created] = await db
		.insert(userAiConnection)
		.values({
			id: randomUUID(),
			userId,
			label: connection.label,
			provider: OPENAI_COMPATIBLE_PROVIDER,
			baseUrl: connection.baseUrl,
			model: connection.model,
			encryptedApiKey: encryptApiKey(connection.apiKey),
			isAssistant: connectionCount === 0,
			createdAt: now,
			updatedAt: now
		})
		.returning({
			id: userAiConnection.id,
			label: userAiConnection.label,
			provider: userAiConnection.provider,
			baseUrl: userAiConnection.baseUrl,
			model: userAiConnection.model,
			isAssistant: userAiConnection.isAssistant,
			updatedAt: userAiConnection.updatedAt
		});
	return toSummary(created);
}

/** Updates metadata and only replaces the encrypted key when a new value is supplied. */
export async function updateUserAiConnection(
	userId: string,
	connectionId: string,
	value: ConnectionInput
): Promise<UserAiConnectionSummary> {
	const [existing] = await db
		.select({ encryptedApiKey: userAiConnection.encryptedApiKey })
		.from(userAiConnection)
		.where(and(eq(userAiConnection.id, connectionId), eq(userAiConnection.userId, userId)))
		.limit(1);
	if (!existing) throw new UserAiCredentialError('AI connection not found.', 404);

	const connection = parseConnectionInput(value, { requireApiKey: false });
	const [updated] = await db
		.update(userAiConnection)
		.set({
			label: connection.label,
			provider: OPENAI_COMPATIBLE_PROVIDER,
			baseUrl: connection.baseUrl,
			model: connection.model,
			encryptedApiKey: connection.apiKey
				? encryptApiKey(connection.apiKey)
				: existing.encryptedApiKey,
			updatedAt: new Date()
		})
		.where(and(eq(userAiConnection.id, connectionId), eq(userAiConnection.userId, userId)))
		.returning({
			id: userAiConnection.id,
			label: userAiConnection.label,
			provider: userAiConnection.provider,
			baseUrl: userAiConnection.baseUrl,
			model: userAiConnection.model,
			isAssistant: userAiConnection.isAssistant,
			updatedAt: userAiConnection.updatedAt
		});
	return toSummary(updated);
}

export async function removeUserAiConnection(userId: string, connectionId: string): Promise<void> {
	await db.transaction(async (transaction) => {
		const deleted = await transaction
			.delete(userAiConnection)
			.where(and(eq(userAiConnection.id, connectionId), eq(userAiConnection.userId, userId)))
			.returning({ id: userAiConnection.id });
		if (!deleted.length) throw new UserAiCredentialError('AI connection not found.', 404);
		await transaction
			.update(user)
			.set({ freeChatConnectionId: null })
			.where(and(eq(user.id, userId), eq(user.freeChatConnectionId, connectionId)));
		await transaction
			.update(user)
			.set({ translationConnectionId: null })
			.where(and(eq(user.id, userId), eq(user.translationConnectionId, connectionId)));
	});
}

export async function selectUserAiAssistant(
	userId: string,
	connectionId: string
): Promise<UserAiConnectionSummary> {
	return db.transaction(async (transaction) => {
		const [target] = await transaction
			.select({ id: userAiConnection.id })
			.from(userAiConnection)
			.where(and(eq(userAiConnection.id, connectionId), eq(userAiConnection.userId, userId)))
			.limit(1);
		if (!target) throw new UserAiCredentialError('AI connection not found.', 404);

		await transaction
			.update(userAiConnection)
			.set({ isAssistant: false })
			.where(eq(userAiConnection.userId, userId));
		const [selected] = await transaction
			.update(userAiConnection)
			.set({ isAssistant: true, updatedAt: new Date() })
			.where(and(eq(userAiConnection.id, connectionId), eq(userAiConnection.userId, userId)))
			.returning({
				id: userAiConnection.id,
				label: userAiConnection.label,
				provider: userAiConnection.provider,
				baseUrl: userAiConnection.baseUrl,
				model: userAiConnection.model,
				isAssistant: userAiConnection.isAssistant,
				updatedAt: userAiConnection.updatedAt
			});
		return toSummary(selected);
	});
}

/** Validates an OpenAI-compatible model-list request without persisting its key. */
export function validateOpenAiCompatibleConnection(value: {
	provider: unknown;
	baseUrl: unknown;
	apiKey: unknown;
}): { baseUrl: string; apiKey?: string } {
	if (value.provider !== OPENAI_COMPATIBLE_PROVIDER) {
		throw new UserAiCredentialError('Choose a supported AI provider.', 400);
	}

	const baseUrl = parseBaseUrl(value.baseUrl);
	const apiKey = parseApiKey(value.apiKey, false);
	return { baseUrl, apiKey };
}

/** Returns a saved key for an owned connection so its model catalog can be refreshed safely. */
export async function getUserAiConnectionApiKey(
	userId: string,
	value: unknown
): Promise<string | undefined> {
	const connectionId = parseOptionalConnectionId(value);
	if (!connectionId) return undefined;
	const [connection] = await db
		.select({ encryptedApiKey: userAiConnection.encryptedApiKey })
		.from(userAiConnection)
		.where(and(eq(userAiConnection.id, connectionId), eq(userAiConnection.userId, userId)))
		.limit(1);
	if (!connection) throw new UserAiCredentialError('AI connection not found.', 404);
	return decryptApiKey(connection.encryptedApiKey);
}

/** Resolves the one connection selected by the user for AI assistant features. */
export async function getUserAiServiceOptions(
	userId: string,
	fetcher: typeof fetch = fetch
): Promise<NineRouterOptions> {
	const connection = await getAssistantConnection(userId);

	return getAiServiceOptions(fetcher, {
		baseUrl: connection.baseUrl,
		apiKey: decryptApiKey(connection.encryptedApiKey),
		model: connection.model
	});
}

/** Assigns one saved connection to /chat. A blank value uses the AI assistant connection. */
export async function selectUserFreeChatConnection(
	userId: string,
	value: unknown
): Promise<{ connectionId: string | null }> {
	const connectionId = parseOptionalConnectionId(value);
	if (connectionId) await requireUserAiConnection(userId, connectionId);

	await db
		.update(user)
		.set({ freeChatConnectionId: connectionId ?? null })
		.where(eq(user.id, userId));
	return { connectionId: connectionId ?? null };
}

/** Resolves the connection selected for /chat, falling back to the AI assistant connection. */
export async function getUserFreeChatServiceOptions(
	userId: string,
	fetcher: typeof fetch = fetch
): Promise<NineRouterOptions> {
	const [preference] = await db
		.select({ freeChatConnectionId: user.freeChatConnectionId })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	const connection = preference?.freeChatConnectionId
		? await requireUserAiConnection(userId, preference.freeChatConnectionId)
		: await getAssistantConnection(userId);

	return getAiServiceOptions(fetcher, {
		baseUrl: connection.baseUrl,
		apiKey: decryptApiKey(connection.encryptedApiKey),
		model: connection.model
	});
}

/** Assigns one saved connection to AI translation in the course authoring workspace. */
export async function selectUserTranslationConnection(
	userId: string,
	value: unknown
): Promise<{ connectionId: string | null }> {
	const connectionId = parseOptionalConnectionId(value);
	if (connectionId) await requireUserAiConnection(userId, connectionId);

	await db
		.update(user)
		.set({ translationConnectionId: connectionId ?? null })
		.where(eq(user.id, userId));
	return { connectionId: connectionId ?? null };
}

/** Resolves the course-translation connection, falling back to the AI assistant connection. */
export async function getUserTranslationServiceOptions(
	userId: string,
	fetcher: typeof fetch = fetch
): Promise<NineRouterOptions> {
	const [preference] = await db
		.select({ translationConnectionId: user.translationConnectionId })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	const connection = preference?.translationConnectionId
		? await requireUserAiConnection(userId, preference.translationConnectionId)
		: await getAssistantConnection(userId);

	return getAiServiceOptions(fetcher, {
		baseUrl: connection.baseUrl,
		apiKey: decryptApiKey(connection.encryptedApiKey),
		model: connection.model
	});
}

/** Resolves an owned saved connection; an empty selection uses the assistant default. */
export async function getUserSelectedAiServiceOptions(
	userId: string,
	connectionId: string | null,
	fetcher: typeof fetch = fetch
): Promise<NineRouterOptions> {
	if (!connectionId) return getUserAiServiceOptions(userId, fetcher);
	const connection = await requireUserAiConnection(userId, connectionId);
	return getAiServiceOptions(fetcher, {
		baseUrl: connection.baseUrl,
		apiKey: decryptApiKey(connection.encryptedApiKey),
		model: connection.model
	});
}

async function requireUserAiConnection(
	userId: string,
	connectionId: string
): Promise<{
	baseUrl: string;
	model: string;
	encryptedApiKey: string;
}> {
	const [connection] = await db
		.select({
			baseUrl: userAiConnection.baseUrl,
			model: userAiConnection.model,
			encryptedApiKey: userAiConnection.encryptedApiKey
		})
		.from(userAiConnection)
		.where(and(eq(userAiConnection.id, connectionId), eq(userAiConnection.userId, userId)))
		.limit(1);
	if (!connection) throw new UserAiCredentialError('AI connection not found.', 404);
	if (!connection.baseUrl.trim() || !connection.model.trim()) {
		throw new UserAiCredentialError(
			'Complete the selected free chat connection in Account settings before using chat.',
			403
		);
	}
	return connection;
}

async function getAssistantConnection(userId: string): Promise<{
	baseUrl: string;
	model: string;
	encryptedApiKey: string;
}> {
	const [connection] = await db
		.select({
			baseUrl: userAiConnection.baseUrl,
			model: userAiConnection.model,
			encryptedApiKey: userAiConnection.encryptedApiKey
		})
		.from(userAiConnection)
		.where(and(eq(userAiConnection.userId, userId), eq(userAiConnection.isAssistant, true)))
		.limit(1);
	if (!connection) {
		throw new UserAiCredentialError(
			'Add an AI connection and assign it to the AI assistant in Account settings.',
			403
		);
	}
	if (!connection.baseUrl.trim() || !connection.model.trim()) {
		throw new UserAiCredentialError(
			'Complete the AI assistant connection in Account settings before using AI features.',
			403
		);
	}
	return connection;
}

function parseConnectionInput(
	value: ConnectionInput,
	options: { requireApiKey: boolean }
): { label: string; baseUrl: string; model: string; apiKey?: string } {
	if (value.provider !== OPENAI_COMPATIBLE_PROVIDER) {
		throw new UserAiCredentialError('Choose a supported AI provider.', 400);
	}
	return {
		label: parseLabel(value.label),
		baseUrl: parseBaseUrl(value.baseUrl),
		model: parseModel(value.model),
		apiKey: parseApiKey(value.apiKey, options.requireApiKey)
	};
}

function parseLabel(value: unknown): string {
	const label = typeof value === 'string' ? value.trim() : '';
	if (!label) throw new UserAiCredentialError('An AI connection name is required.', 400);
	if (label.length > MAX_LABEL_LENGTH) {
		throw new UserAiCredentialError(
			`AI connection names must be ${MAX_LABEL_LENGTH.toLocaleString()} characters or fewer.`,
			400
		);
	}
	return label;
}

function parseBaseUrl(value: unknown): string {
	const raw = typeof value === 'string' ? value.trim() : '';
	if (!raw) throw new UserAiCredentialError('An OpenAI-compatible base URL is required.', 400);
	if (raw.length > MAX_BASE_URL_LENGTH) {
		throw new UserAiCredentialError(
			`Base URLs must be ${MAX_BASE_URL_LENGTH.toLocaleString()} characters or fewer.`,
			400
		);
	}

	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new UserAiCredentialError('Enter a valid OpenAI-compatible base URL.', 400);
	}
	if (
		!['http:', 'https:'].includes(url.protocol) ||
		url.username ||
		url.password ||
		url.search ||
		url.hash
	) {
		throw new UserAiCredentialError('Enter a valid OpenAI-compatible base URL.', 400);
	}

	return url.toString().replace(/\/+$/, '');
}

function parseModel(value: unknown): string {
	const model = typeof value === 'string' ? value.trim() : '';
	if (!model) throw new UserAiCredentialError('An AI model name is required.', 400);
	if (model.length > MAX_MODEL_LENGTH) {
		throw new UserAiCredentialError(
			`AI model names must be ${MAX_MODEL_LENGTH.toLocaleString()} characters or fewer.`,
			400
		);
	}
	return model;
}

function parseApiKey(value: unknown, required: boolean): string | undefined {
	const apiKey = typeof value === 'string' ? value.trim() : '';
	if (!apiKey && required) throw new UserAiCredentialError('An AI API key is required.', 400);
	if (apiKey.length > MAX_API_KEY_LENGTH) {
		throw new UserAiCredentialError(
			`AI API keys must be ${MAX_API_KEY_LENGTH.toLocaleString()} characters or fewer.`,
			400
		);
	}
	return apiKey || undefined;
}

function parseOptionalConnectionId(value: unknown): string | undefined {
	if (value === null || value === undefined) return undefined;
	const connectionId = typeof value === 'string' ? value.trim() : '';
	if (!connectionId) return undefined;
	if (connectionId.length > 255) {
		throw new UserAiCredentialError('The selected AI connection is invalid.', 400);
	}
	return connectionId;
}

function toSummary(connection: {
	id: string;
	label: string;
	provider: string;
	baseUrl: string;
	model: string;
	isAssistant: boolean;
	updatedAt: Date;
}): UserAiConnectionSummary {
	return {
		id: connection.id,
		label: connection.label,
		provider: OPENAI_COMPATIBLE_PROVIDER,
		baseUrl: connection.baseUrl,
		model: connection.model,
		isAssistant: connection.isAssistant,
		updatedAt: connection.updatedAt.toISOString()
	};
}

function encryptApiKey(apiKey: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv(CIPHER, credentialEncryptionKey(), iv);
	const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return [
		CREDENTIAL_VERSION,
		iv.toString('base64url'),
		tag.toString('base64url'),
		ciphertext.toString('base64url')
	].join('.');
}

function decryptApiKey(value: string): string {
	const [version, encodedIv, encodedTag, encodedCiphertext, ...extra] = value.split('.');
	if (
		version !== CREDENTIAL_VERSION ||
		!encodedIv ||
		!encodedTag ||
		!encodedCiphertext ||
		extra.length
	) {
		throw unreadableCredentialError();
	}

	try {
		const decipher = createDecipheriv(
			CIPHER,
			credentialEncryptionKey(),
			Buffer.from(encodedIv, 'base64url')
		);
		decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
		const plaintext = Buffer.concat([
			decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
			decipher.final()
		]).toString('utf8');
		if (!plaintext) throw unreadableCredentialError();
		return plaintext;
	} catch (error) {
		if (error instanceof UserAiCredentialError) throw error;
		throw unreadableCredentialError();
	}
}

function credentialEncryptionKey(): Buffer {
	const secret = env.AI_CREDENTIAL_ENCRYPTION_KEY?.trim() || env.BETTER_AUTH_SECRET?.trim();
	if (!secret) {
		throw new UserAiCredentialError(
			'AI credential encryption is not configured on this server.',
			503
		);
	}
	return createHash('sha256').update(`learning-studio:ai-credential:v1:${secret}`).digest();
}

function unreadableCredentialError(): UserAiCredentialError {
	return new UserAiCredentialError(
		'Your saved AI API key can no longer be read. Replace it in Account settings.',
		409
	);
}
