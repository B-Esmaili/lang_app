export type SpeakingPracticeConfiguration = {
	title: string;
	instructions: string;
	sentenceMode: 'lesson' | 'selected';
	sentenceIds: string[];
};

export type SpeakingSentence = {
	id: string;
	text: string;
	language: string;
	direction: 'auto' | 'ltr' | 'rtl';
	sourceLabel: string;
	referenceAudio?: { url: string; startSeconds: number; endSeconds: number };
};

export type WordMatch = {
	kind: 'match' | 'missing' | 'extra' | 'different';
	reference: string | null;
	spoken: string | null;
};

/** Text agreement with ASR output, not an acoustic pronunciation grade. */
export type SentenceMatch = {
	score: number;
	matched: number;
	referenceWords: number;
	missing: number;
	extra: number;
	different: number;
	words: WordMatch[];
};

const contractions: Readonly<Record<string, string>> = {
	"i'm": 'i am',
	"you're": 'you are',
	"we're": 'we are',
	"they're": 'they are',
	"he's": 'he is',
	"she's": 'she is',
	"it's": 'it is',
	"that's": 'that is',
	"i've": 'i have',
	"you've": 'you have',
	"we've": 'we have',
	"they've": 'they have',
	"i'll": 'i will',
	"you'll": 'you will',
	"we'll": 'we will',
	"they'll": 'they will',
	"he'll": 'he will',
	"she'll": 'she will',
	"it'll": 'it will',
	"can't": 'can not',
	cannot: 'can not',
	"won't": 'will not',
	"shan't": 'shall not',
	"don't": 'do not',
	"doesn't": 'does not',
	"didn't": 'did not',
	"isn't": 'is not',
	"aren't": 'are not',
	"wasn't": 'was not',
	"weren't": 'were not',
	"haven't": 'have not',
	"hasn't": 'has not',
	"hadn't": 'had not',
	"wouldn't": 'would not',
	"couldn't": 'could not',
	"shouldn't": 'should not',
	"mustn't": 'must not',
	"let's": 'let us'
};

/** Preserve meaning-bearing apostrophes; normalize common ASR formatting differences. */
export function sentenceWords(text: string): string[] {
	return (
		text
			.normalize('NFKC')
			.toLocaleLowerCase('en')
			.replace(/[’‘]/g, "'")
			.match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? []
	).flatMap((word) => (contractions[word] ?? word).split(' '));
}

export function compareSentence(reference: string, recognized: string): SentenceMatch {
	const expected = sentenceWords(reference);
	const heard = sentenceWords(recognized);
	if (!expected.length) throw new Error('This sentence has no words to practise.');
	if (expected.length > 256 || heard.length > 512) {
		throw new Error('This attempt is too long to compare. Practise a shorter sentence.');
	}
	const width = heard.length + 1;
	const costs = new Uint16Array((expected.length + 1) * width);
	for (let i = 0; i <= expected.length; i += 1) costs[i * width] = i;
	for (let j = 0; j <= heard.length; j += 1) costs[j] = j;
	for (let i = 1; i <= expected.length; i += 1) {
		for (let j = 1; j <= heard.length; j += 1) {
			costs[i * width + j] = Math.min(
				costs[(i - 1) * width + j] + 1,
				costs[i * width + j - 1] + 1,
				costs[(i - 1) * width + j - 1] + (expected[i - 1] === heard[j - 1] ? 0 : 1)
			);
		}
	}
	const words: WordMatch[] = [];
	let i = expected.length;
	let j = heard.length;
	while (i || j) {
		const cost = costs[i * width + j];
		if (i && j && expected[i - 1] === heard[j - 1] && cost === costs[(i - 1) * width + j - 1]) {
			words.push({ kind: 'match', reference: expected[--i], spoken: heard[--j] });
		} else if (i && j && cost === costs[(i - 1) * width + j - 1] + 1) {
			words.push({ kind: 'different', reference: expected[--i], spoken: heard[--j] });
		} else if (i && cost === costs[(i - 1) * width + j] + 1) {
			words.push({ kind: 'missing', reference: expected[--i], spoken: null });
		} else {
			words.push({ kind: 'extra', reference: null, spoken: heard[--j] });
		}
	}
	words.reverse();
	const count = (kind: WordMatch['kind']) => words.filter((word) => word.kind === kind).length;
	const missing = count('missing');
	const extra = count('extra');
	const different = count('different');
	return {
		score: Math.round(Math.max(0, 1 - (missing + extra + different) / expected.length) * 100),
		matched: count('match'),
		referenceWords: expected.length,
		missing,
		extra,
		different,
		words
	};
}
