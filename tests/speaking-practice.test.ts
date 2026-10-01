import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareSentence, sentenceWords } from '../src/lib/features/speaking-practice/model';

test('sentence matching ignores punctuation, case, curly apostrophes and common contractions', () => {
	assert.equal(
		compareSentence('I’m ready. We cannot wait!', 'I am ready, we can not wait.').score,
		100
	);
	assert.equal(compareSentence('You’re very kind.', 'You are very kind').score, 100);
	assert.deepEqual(sentenceWords('Well-known words, John’s book.'), [
		'well',
		'known',
		'words',
		"john's",
		'book'
	]);
});

test('alignment distinguishes missing, extra and substituted words without shifting later matches', () => {
	const result = compareSentence(
		'We will meet at the park today.',
		'We meet at the old school today.'
	);
	assert.equal(result.missing, 1);
	assert.equal(result.extra, 1);
	assert.equal(result.different, 1);
	assert.equal(result.matched, 5);
	assert.equal(result.score, 57);
	assert.deepEqual(result.words.at(-1), { kind: 'match', reference: 'today', spoken: 'today' });
});

test('repeated words and negation remain meaningful', () => {
	const repeat = compareSentence('I really really like it', 'I really like it');
	assert.equal(repeat.missing, 1);
	assert.equal(repeat.score, 80);
	assert(compareSentence('I can swim', "I can't swim").score < 100);
	assert(compareSentence("We're here", 'Were here').score < 100);
});

test('empty and unrelated speech do not receive successful matches', () => {
	assert.equal(compareSentence('Please sit down', '').score, 0);
	assert.equal(compareSentence('Please sit down', 'one two three four five six').score, 0);
	assert.throws(() => compareSentence('...', 'hello'), /no words/);
});

test('comparison has bounded memory for oversized inputs', () => {
	assert.throws(() => compareSentence('word '.repeat(257), 'word'), /too long/);
	assert.throws(() => compareSentence('word', 'word '.repeat(513)), /too long/);
});
