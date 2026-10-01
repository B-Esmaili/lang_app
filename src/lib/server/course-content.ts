import {
	LESSON_DOCUMENT_VERSION,
	type FrameAppearance,
	type LessonDocument,
	type TemplateDefinition,
	type TemplateLayout,
	type TextDirection,
	type WidgetType
} from '$lib/features/lesson-editor/model';

import { VOICE_CHAT_LEVELS, VOICE_CHAT_LIMITS } from '$lib/features/voice-chat/model';

const DIRECTIONS = new Set<TextDirection>(['auto', 'ltr', 'rtl']);
const GAPS = new Set(['none', 'xs', 'sm', 'md', 'lg', 'xl']);
const BORDERS = new Set(['none', 'subtle', 'accent']);
const SURFACES = new Set(['transparent', 'plain', 'muted', 'accent']);
const SHADOWS = new Set(['none', 'soft', 'raised']);
const RADII = new Set(['none', 'sm', 'md', 'lg']);
const PADDINGS = new Set(['none', 'sm', 'md', 'lg']);
const MAX_CONTENT_BYTES = 1_500_000;

export class CourseContentError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CourseContentError';
	}
}

export function parseTextDirection(
	value: unknown,
	fallback: TextDirection = 'auto'
): TextDirection {
	return DIRECTIONS.has(value as TextDirection) ? (value as TextDirection) : fallback;
}

export function parseLessonDocument(value: unknown): LessonDocument {
	assertContentSize(value);
	const source = record(value, 'Lesson document');
	if (source.schemaVersion !== LESSON_DOCUMENT_VERSION) {
		throw new CourseContentError(
			`Unsupported lesson schema version: ${String(source.schemaVersion)}`
		);
	}

	const frames = array(source.frames, 'Lesson frames', 200).map((frame, frameIndex) => {
		const item = record(frame, `Frame ${frameIndex + 1}`);
		const slots = record(item.slots, `Frame ${frameIndex + 1} slots`);
		const parsedSlots: Record<string, never[]> = {};
		for (const [slotId, widgets] of Object.entries(slots)) {
			const safeSlotId = requiredString(slotId, 'Slot id', 80);
			parsedSlots[safeSlotId] = array(widgets, `Widgets in ${safeSlotId}`, 500).map(
				(widget, widgetIndex) => {
					const instance = record(widget, `Widget ${widgetIndex + 1}`);
					const type = requiredString(instance.type, 'Widget type', 100);
					const content = record(instance.content, 'Widget content');
					if (content.type !== type) {
						throw new CourseContentError(
							'Widget content type must match the widget instance type.'
						);
					}
					if (type === 'language.speaking-practice') validateSpeakingPractice(content);
					if (type === 'language.voice-chat') validateVoiceChat(content);
					return {
						id: requiredString(instance.id, 'Widget id', 120),
						type,
						content: structuredClone(content)
					} as never;
				}
			);
		}

		return {
			id: requiredString(item.id, 'Frame id', 120),
			templateId: requiredString(item.templateId, 'Frame template id', 120),
			title: optionalString(item.title, 180),
			slots: parsedSlots,
			appearance: parseAppearance(item.appearance)
		};
	});

	return {
		schemaVersion: LESSON_DOCUMENT_VERSION,
		id: requiredString(source.id, 'Lesson id', 120),
		title: requiredString(source.title, 'Lesson title', 180),
		description: optionalString(source.description, 2_000),
		language: languageTag(source.language),
		direction: parseTextDirection(source.direction),
		frames
	} as LessonDocument;
}

function validateVoiceChat(content: Record<string, unknown>): void {
	optionalString(content.title, 180);
	optionalString(content.topic, VOICE_CHAT_LIMITS.topic);
	optionalString(content.instructions, VOICE_CHAT_LIMITS.instructions);
	if (!VOICE_CHAT_LEVELS.includes(content.level as (typeof VOICE_CHAT_LEVELS)[number])) {
		throw new CourseContentError('Choose a valid English level for Voice Chat.');
	}
	if (
		typeof content.useLessonContext !== 'boolean' ||
		content.language !== 'en' ||
		content.direction !== 'ltr'
	) {
		throw new CourseContentError(
			'Voice Chat requires English, left-to-right text, and a lesson context choice.'
		);
	}
}

function validateSpeakingPractice(content: Record<string, unknown>): void {
	optionalString(content.title, 180);
	optionalString(content.instructions, 2_000);
	if (content.sentenceMode !== 'lesson' && content.sentenceMode !== 'selected') {
		throw new CourseContentError('Speaking practice must use all lesson sentences or a selection.');
	}
	const ids = array(content.sentenceIds, 'Speaking practice sentence ids', 10_000);
	for (const id of ids) requiredString(id, 'Speaking practice sentence id', 120);
}

export function parseTemplateDefinition(value: unknown): TemplateDefinition {
	assertContentSize(value);
	const source = record(value, 'Template');
	const slots = array(source.slots, 'Template slots', 24).map((slot, index) => {
		const item = record(slot, `Template slot ${index + 1}`);
		const accepts =
			item.accepts === undefined
				? undefined
				: (array(item.accepts, 'Accepted widget types', 100).map((type) =>
						requiredString(type, 'Widget type', 100)
					) as WidgetType[]);
		return {
			id: requiredString(item.id, 'Slot id', 80),
			label: requiredString(item.label, 'Slot label', 100),
			description: optionalString(item.description, 300),
			accepts
		};
	});

	if (slots.length === 0) throw new CourseContentError('A template needs at least one slot.');
	const slotIds = new Set(slots.map((slot) => slot.id));
	if (slotIds.size !== slots.length)
		throw new CourseContentError('Template slot ids must be unique.');

	const variants = record(source.variants, 'Responsive variants');
	return {
		id: requiredString(source.id, 'Template id', 120),
		name: requiredString(source.name, 'Template name', 120),
		description: optionalString(source.description, 500),
		slots,
		variants: {
			desktop: parseLayout(variants.desktop, slotIds, 'desktop'),
			tablet: parseLayout(variants.tablet, slotIds, 'tablet'),
			phone: parseLayout(variants.phone, slotIds, 'phone')
		}
	};
}

function parseLayout(value: unknown, slotIds: Set<string>, label: string): TemplateLayout {
	const source = record(value, `${label} layout`);
	const columnWeights = array(source.columnWeights, `${label} column weights`, 12).map((weight) => {
		if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0 || weight > 100) {
			throw new CourseContentError(`${label} column weights must be positive numbers.`);
		}
		return weight;
	});
	if (columnWeights.length === 0)
		throw new CourseContentError(`${label} needs at least one column.`);

	const areas = array(source.areas, `${label} layout areas`, 24).map((rowValue) => {
		const row = array(rowValue, `${label} layout row`, 12).map((slot) =>
			requiredString(slot, 'Layout slot id', 80)
		);
		if (row.length !== columnWeights.length) {
			throw new CourseContentError(`${label} layout rows must match its number of columns.`);
		}
		for (const slot of row) {
			if (!slotIds.has(slot))
				throw new CourseContentError(`${label} layout refers to unknown slot "${slot}".`);
		}
		return row;
	});

	const order = array(source.order, `${label} reading order`, 24).map((slot) =>
		requiredString(slot, 'Reading order slot', 80)
	);
	if (new Set(order).size !== order.length || order.some((slot) => !slotIds.has(slot))) {
		throw new CourseContentError(`${label} reading order must contain unique known slots.`);
	}
	const gap = requiredString(source.gap, `${label} gap`, 10);
	if (!GAPS.has(gap)) throw new CourseContentError(`${label} uses an unsupported gap token.`);
	const padding =
		source.padding === undefined
			? undefined
			: requiredString(source.padding, `${label} padding`, 10);
	if (padding !== undefined && !GAPS.has(padding))
		throw new CourseContentError(`${label} uses an unsupported padding token.`);

	return {
		columnWeights,
		areas,
		order,
		gap,
		...(padding === undefined ? {} : { padding })
	} as TemplateLayout;
}

function parseAppearance(value: unknown): FrameAppearance {
	const source = record(value, 'Frame appearance');
	const border = requiredString(source.border, 'Frame border', 20);
	const surface = requiredString(source.surface, 'Frame surface', 20);
	const shadow = requiredString(source.shadow, 'Frame shadow', 20);
	const radius = requiredString(source.radius, 'Frame radius', 20);
	const padding = requiredString(source.padding, 'Frame padding', 20);
	if (
		!BORDERS.has(border) ||
		!SURFACES.has(surface) ||
		!SHADOWS.has(shadow) ||
		!RADII.has(radius) ||
		!PADDINGS.has(padding)
	) {
		throw new CourseContentError('Frame appearance contains an unsupported token.');
	}
	return { border, surface, shadow, radius, padding } as FrameAppearance;
}

function languageTag(value: unknown) {
	const output = requiredString(value, 'Language', 35);
	if (!/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/u.test(output)) {
		throw new CourseContentError('Language must be a valid BCP 47 language tag.');
	}
	return output;
}

function record(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new CourseContentError(`${label} must be an object.`);
	}
	return value as Record<string, unknown>;
}

function array(value: unknown, label: string, maxLength: number): unknown[] {
	if (!Array.isArray(value)) throw new CourseContentError(`${label} must be an array.`);
	if (value.length > maxLength)
		throw new CourseContentError(`${label} exceeds the maximum of ${maxLength}.`);
	return value;
}

function requiredString(value: unknown, label: string, maxLength: number): string {
	if (typeof value !== 'string' || !value.trim())
		throw new CourseContentError(`${label} is required.`);
	const output = value.trim();
	if (output.length > maxLength) throw new CourseContentError(`${label} is too long.`);
	return output;
}

function optionalString(value: unknown, maxLength: number): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value !== 'string' || value.length > maxLength) {
		throw new CourseContentError('A text value is invalid or too long.');
	}
	return value;
}

function assertContentSize(value: unknown) {
	let content: string;
	try {
		content = JSON.stringify(value);
	} catch {
		throw new CourseContentError('Content must be serializable JSON.');
	}
	if (new TextEncoder().encode(content).byteLength > MAX_CONTENT_BYTES) {
		throw new CourseContentError('Content exceeds the 1.5 MB limit.');
	}
}
