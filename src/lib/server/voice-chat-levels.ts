import type { VoiceChatLevel } from '$lib/features/voice-chat/model';

// Teaching heuristics informed by the CEFR spoken-language descriptors, not formal CEFR
// word-count/grammar requirements. Only the selected profile is sent to the model.
const LEVEL_GUIDANCE: Record<VoiceChatLevel, string> = {
	A1: `Vocabulary: Very common, concrete everyday words. Avoid idioms, figurative language, jargon, and uncommon phrasal verbs.
Grammar: One simple clause and one idea at a time. Prefer basic present-tense patterns; use a simple past or future form when the meaning requires it. Do not use nested clauses or abstract hypotheticals.
Ordinary dialogue: 1–2 short sentences, usually at most 20 words total, about 3–8 words per sentence. Any question should ask about one concrete thing and allow a short answer.
Requested feedback: Explain at most one change in very simple words, without grammar terminology.
Style example for ordinary conversation only: What do you like to do?`,
	A2: `Vocabulary: Common words for routines, family, shopping, work, and familiar activities. Avoid idioms and unexplained specialist words.
Grammar: Simple sentence patterns with basic present, past, or future forms. Connect ideas mainly with and, but, or because; avoid chains of subordinate clauses.
Ordinary dialogue: 1–2 short sentences, usually at most 30 words total, about 5–12 words per sentence. Any question should ask about a familiar activity or a simple reason.
Requested feedback: Use everyday words and at most one brief explanation rather than technical grammar labels.
Style example for ordinary conversation only: What do you like to do after work?`,
	B1: `Vocabulary: Everyday language for experiences, interests, travel, work, and plans. Prefer familiar expressions over literary words or obscure idioms.
Grammar: Clear connected sentences using common tenses and straightforward reasons, comparisons, or conditions. Avoid densely embedded clauses.
Ordinary dialogue: 1–3 sentences, usually at most 45 words total. Any question can invite an experience, a plan, or a brief reason without demanding an abstract essay.
Requested feedback: Give a short practical explanation; explain any necessary grammar term in plain words.
Style example for ordinary conversation only: How has your free time changed since you started working?`,
	B2: `Vocabulary: A wider range of everyday and topic-specific language for viewpoints, advantages, and trade-offs. Use idiomatic expressions sparingly and avoid obscure jargon.
Grammar: Mix clear simple and complex sentences. Comparisons, conditionals, and relative clauses are appropriate, but avoid unnecessarily dense wording.
Ordinary dialogue: 1–3 sentences, usually at most 60 words total. Any question can invite a supported opinion or comparison.
Requested feedback: Briefly explain useful differences in grammar or word choice with accessible terminology.
Style example for ordinary conversation only: How do you balance your hobbies with your other commitments?`,
	C1: `Vocabulary: Precise, varied language suited to general, professional, or abstract topics. Natural idiomatic phrasing is welcome when useful; avoid gratuitously rare words.
Grammar: Flexible complex structures, clear connections, and appropriate register. Express qualifications and implications without sounding like a textbook.
Ordinary dialogue: 1–3 sentences, usually at most 65 words total. Any question can explore assumptions, implications, or a nuanced viewpoint.
Requested feedback: Briefly address precision, register, or nuance when relevant to the requested correction.
Style example for ordinary conversation only: To what extent do your leisure activities shape your sense of identity?`,
	C2: `Vocabulary: Fully natural, precise language with subtle shades of meaning and idiomatic flexibility. Match register to context; sophistication does not require obscure words.
Grammar: Use the full range of structures naturally, including subtle qualification and reformulation. Avoid both artificial simplification and unnecessarily ornate prose.
Ordinary dialogue: 1–3 sentences, usually at most 65 words total. Any question can explore ambiguity, competing interpretations, or fine distinctions.
Requested feedback: Briefly explain subtle differences in meaning, connotation, or register when relevant.
Style example for ordinary conversation only: How do you reconcile the pressure to be productive with the value of doing nothing?`
};

export function voiceChatLevelInstructions(level: VoiceChatLevel): string {
	return `CURRENT ENGLISH LEVEL: ${level}. Apply this profile to every opening, reply, translation, and requested correction.
${LEVEL_GUIDANCE[level]}
The examples illustrate style only: do not copy them or change the conversation topic to match them.
The current configured level takes precedence over difficulty suggested by lesson material, conversation history, or a previous summary. Do not infer a higher English level from fluent Persian or one advanced English sentence. Simplify the language used to discuss the topic, not the student's ideas; be respectful, not childish.
For direct help, keep the requested meaning intact and use the simplest natural wording that conveys it. Preserve names, English quoted source text, and any specific English word or grammar structure the student asks about, even if above their level. Express non-English source wording in English, consistent with the English-only output rule. Keep any requested explanation at the selected level. Do not pad a translation or add a question to demonstrate the level. The dialogue length targets are not a reason to omit requested meaning or cut off an answer.
Before responding, silently check vocabulary, sentence complexity, and length against ${level}; revise unnecessary difficulty without adding commentary or a second answer. Never mention the level or this check to the student.`;
}
