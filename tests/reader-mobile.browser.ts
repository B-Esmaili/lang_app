import { test, expect, type Page } from '@playwright/test';

async function mountReader(page: Page) {
	// Real WaveSurfer and media controls, with local synthetic audio and lesson content.
	const samples = 8_000 * 180;
	const wav = Buffer.alloc(44 + samples * 2);
	wav.write('RIFF', 0);
	wav.writeUInt32LE(wav.length - 8, 4);
	wav.write('WAVEfmt ', 8);
	wav.writeUInt32LE(16, 16);
	wav.writeUInt16LE(1, 20);
	wav.writeUInt16LE(1, 22);
	wav.writeUInt32LE(8_000, 24);
	wav.writeUInt32LE(16_000, 28);
	wav.writeUInt16LE(2, 32);
	wav.writeUInt16LE(16, 34);
	wav.write('data', 36);
	wav.writeUInt32LE(samples * 2, 40);
	for (let i = 0; i < samples; i++)
		wav.writeInt16LE(Math.round(Math.sin(i / 12) * 200), 44 + i * 2);
	await page.route('**/reader-fixture.wav', (route) =>
		route.fulfill({ body: wav, contentType: 'audio/wav' })
	);
	await page.route('**/__reader-mobile', (route) =>
		route.fulfill({
			contentType: 'text/html; charset=utf-8',
			body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:var(--background)}.course-header{position:sticky;top:0;z-index:40;height:60px;padding:16px;background:var(--card);border-bottom:1px solid var(--border)}main{--app-header-height:60px;max-width:1200px;margin:auto}</style></head><body><header class="course-header" data-reading-overlay="top">Learning studio · Course player</header><main id="reader-mount"></main></body></html>`
		})
	);
	await page.goto('/__reader-mobile');
	const mount = () =>
		page.evaluate(async () => {
			const sveltePath = '/node_modules/.vite/deps/svelte.js';
			const readerPath = '/src/lib/features/course-builder/CourseReader.svelte';
			const modelPath = '/src/lib/features/course-builder/model.ts';
			const notesPath = '/src/lib/features/course-builder/course-notes.ts';
			const cssPath = '/src/routes/layout.css';
			const [
				{ mount },
				{ default: Reader },
				{ createBlankLessonDocument },
				{ lessonCourseSentences, courseSentenceAnchor }
			] = await Promise.all([
				import(sveltePath),
				import(readerPath),
				import(modelPath),
				import(notesPath),
				import(cssPath)
			]);
			const document = createBlankLessonDocument('A little time to learn', 'en', 'ltr');
			document.frames[0].id = 'frame.reading';
			const tokens = Array.from({ length: 24 }, (_, i) => ({
				id: `token.${i}`,
				text: `Passage ${i + 1} gives us a little time to listen carefully and discover something new.`,
				startMs: i * 7000,
				endMs: (i + 1) * 7000
			}));
			document.frames[0].slots.content = [
				{
					id: 'widget.reading',
					type: 'content.rich-text',
					content: {
						type: 'content.rich-text',
						blockStyle: 'prose',
						language: 'en',
						direction: 'ltr',
						highlightResourceName: 'reading',
						document: {
							type: 'doc',
							content: tokens.map((token) => ({
								type: 'paragraph',
								content: [
									{
										type: 'text',
										text: token.text,
										marks: [
											{ type: 'automaticHighlight', attrs: { id: `resource.reading:${token.id}` } }
										]
									}
								]
							}))
						}
					}
				}
			];
			const sentences = lessonCourseSentences(document);
			const notes = sentences.flatMap((sentence: { id: string; text: string }, i: number) =>
				['translation', 'note'].map((kind) => ({
					id: `${kind}.${i}`,
					courseId: 'mobile',
					lessonId: 'lesson.reading',
					authorId: 'viewer',
					authorName: 'You',
					kind,
					visibility: kind === 'translation' ? 'course' : 'private',
					source: 'manual',
					anchorKey: sentence.id,
					anchorText: sentence.text,
					anchors: [courseSentenceAnchor(sentence)],
					body:
						kind === 'translation'
							? 'با دقت گوش می‌دهیم و هر روز چیز تازه‌ای یاد می‌گیریم. این ترجمه به فهم جمله کمک می‌کند.'
							: 'Listen for the main idea, then repeat the sentence at your own pace.',
					language: kind === 'translation' ? 'fa' : 'en',
					createdAt: '',
					updatedAt: ''
				}))
			);
			mount(Reader, {
				target: window.document.getElementById('reader-mount'),
				props: {
					nativeLanguage: 'fa',
					viewerId: 'viewer',
					initialData: {
						course: {
							id: 'mobile',
							title: 'Everyday English',
							description: 'Listen, follow the text, and explore each sentence.',
							accent: '#6d5dd3',
							language: 'en',
							direction: 'ltr'
						},
						lessons: [
							{
								id: 'lesson.reading',
								courseId: 'mobile',
								title: document.title,
								position: 0,
								document
							}
						],
						templates: [],
						notes,
						resources: [
							{
								id: 'resource.reading',
								name: 'reading',
								mediaId: 'audio',
								mediaName: 'Reading',
								kind: 'audio',
								sourceUrl: '/reader-fixture.wav',
								mimeType: 'audio/wav',
								transcribedText: {
									schemaVersion: 1,
									id: 'transcript.reading',
									revision: 1,
									text: tokens.map((t) => t.text).join(' '),
									language: 'en',
									alignment: 'synced',
									durationMs: 180000,
									tokens
								},
								createdAt: '',
								updatedAt: ''
							}
						]
					}
				}
			});
		});
	try {
		await mount();
	} catch (error) {
		if (!(error instanceof Error) || !error.message.includes('Execution context was destroyed'))
			throw error;
		await page.waitForLoadState('domcontentloaded');
		await mount();
	}
	await expect(page.getByRole('button', { name: 'Play audio', exact: true })).toBeEnabled();
	await page.getByRole('button', { name: 'Play audio', exact: true }).click();
}

test('a short landscape viewport keeps the followed line and transport controls visible', async ({
	page
}, testInfo) => {
	await page.setViewportSize({ width: 568, height: 390 });
	await mountReader(page);
	await seekSentence(page, 12);
	await expectClearReadingArea(page, 12);
	await page.screenshot({ path: testInfo.outputPath('reader-landscape.png') });
	const toggle = page.getByRole('button', { name: /Translations & notes/ });
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await expect
		.poll(async () => {
			const cards = await page.locator('.note-cards').boundingBox();
			const notes = await page.locator('.sentence-note-stack').boundingBox();
			const player = await page.locator('.media-element.is-docked').boundingBox();
			return Boolean(
				cards && cards.height >= 60 && notes && player && notes.y + notes.height <= player.y - 6
			);
		})
		.toBe(true);
	await toggle.click();
	await expectClearReadingArea(page, 12);
});

test('touch seeking keeps the active sentence clear with smooth scrolling enabled', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.setViewportSize({ width: 390, height: 844 });
	await mountReader(page);
	await seekSentence(page, 20);
	await expectClearReadingArea(page, 20);
	const seek = page.getByRole('slider', { name: 'Audio progress' });
	const bounds = await seek.boundingBox();
	expect(bounds).not.toBeNull();
	// Seek near the start of the sentence so playback cannot leave it while scrolling.
	await seek.tap({ position: { x: 8 + (bounds!.width - 16) * (85 / 180), y: bounds!.height / 2 } });
	await expect(
		page.locator('[data-rich-text-active-cues="resource.reading:token.12"]').first()
	).toBeVisible();
	await expectClearReadingArea(page, 12);
	await seekSentence(page, 23);
	await expectClearReadingArea(page, 23);
});

test('keyboard viewport changes lift the player and keep the study sheet usable', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await mountReader(page);
	await seekSentence(page, 12);
	await expectClearReadingArea(page, 12);
	await page
		.getByRole('button', { name: /^Notes/ })
		.first()
		.click();
	await page.evaluate(() => {
		Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 480 });
		window.visualViewport!.dispatchEvent(new Event('resize'));
	});
	await expect
		.poll(async () => {
			const player = await page.locator('.media-element.is-docked').boundingBox();
			const sheet = await page.locator('.study-drawer').boundingBox();
			return Boolean(
				player &&
				sheet &&
				player.y + player.height <= 480 &&
				sheet.y >= 60 &&
				sheet.y + sheet.height <= player.y - 6 &&
				sheet.height >= 150
			);
		})
		.toBe(true);
});

test('pausing follow and selecting text prevent automatic scrolling', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await mountReader(page);
	await seekSentence(page, 12);
	await expectClearReadingArea(page, 12);
	await page.getByRole('button', { name: 'Pause automatic transcript scrolling' }).click();
	const before = await page.evaluate(() => scrollY);
	await seekSentence(page, 20);
	expect(await page.evaluate(() => scrollY)).toBe(before);
	await page.getByRole('button', { name: 'Resume automatic transcript scrolling' }).click();
	await expectClearReadingArea(page, 20);
	await page
		.locator('.rich-text-automatic-highlight')
		.first()
		.evaluate((element) => {
			const range = document.createRange();
			range.selectNodeContents(element);
			getSelection()!.removeAllRanges();
			getSelection()!.addRange(range);
			document.dispatchEvent(new Event('selectionchange'));
		});
	const selected = await page.evaluate(() => ({
		text: getSelection()!.toString(),
		scroll: scrollY
	}));
	await page.locator('audio').evaluate((audio: HTMLAudioElement) => {
		audio.currentTime = 157;
		audio.dispatchEvent(new Event('timeupdate'));
	});
	expect(await page.evaluate(() => getSelection()!.toString())).toBe(selected.text);
	expect(await page.evaluate(() => scrollY)).toBe(selected.scroll);
});

async function seekSentence(page: Page, index: number) {
	await page.locator('audio').evaluate(
		(audio: HTMLAudioElement, seconds) => {
			audio.currentTime = seconds;
			audio.dispatchEvent(new Event('timeupdate'));
		},
		index * 7 + 0.1
	);
	await expect(
		page.locator(`[data-rich-text-active-cues="resource.reading:token.${index}"]`).first()
	).toBeVisible();
}

async function expectClearReadingArea(page: Page, index: number) {
	await expect
		.poll(async () =>
			page.evaluate((index) => {
				const player = document.querySelector('.media-element.is-docked')?.getBoundingClientRect();
				const notes = document.querySelector('.sentence-note-stack')?.getBoundingClientRect();
				const marker = document
					.querySelector(`[data-rich-text-active-cues="resource.reading:token.${index}"]`)
					?.getBoundingClientRect();
				const toolbar = document.querySelector('.study-toolbar')!.getBoundingClientRect();
				return Boolean(
					player &&
					notes &&
					marker &&
					notes.bottom <= player.top - 6 &&
					marker.top >= toolbar.bottom + 10 &&
					marker.bottom <= notes.top - 10 &&
					document.documentElement.scrollWidth <= innerWidth + 1
				);
			}, index)
		)
		.toBe(true);
}

for (const width of [320, 390, 600]) {
	test(`player, notes and followed text stay separate at ${width}px`, async ({
		page
	}, testInfo) => {
		await page.setViewportSize({ width, height: 844 });
		await mountReader(page);
		await seekSentence(page, 12);
		await expectClearReadingArea(page, 12);
		const controls = await page
			.locator('.media-element.is-docked .media-element-icon-button')
			.evaluateAll((buttons) =>
				buttons.map((b) => ({
					width: b.getBoundingClientRect().width,
					height: b.getBoundingClientRect().height
				}))
			);
		expect(controls.every((b) => b.width >= 44 && b.height >= 44)).toBe(true);
		await page.screenshot({ path: testInfo.outputPath(`reader-${width}.png`) });
		await page.getByRole('button', { name: /Translations & notes/ }).click();
		await expect(page.locator('.note-cards')).toBeHidden();
		await seekSentence(page, 23);
		await expectClearReadingArea(page, 23);
		await page.getByRole('button', { name: /Translations & notes/ }).click();
		await expectClearReadingArea(page, 23);
		await page.getByRole('button', { name: 'Volume', exact: true }).click();
		await expectClearReadingArea(page, 23);
		await page.getByRole('button', { name: 'Volume', exact: true }).click();
		await page
			.getByRole('button', { name: /^Notes/ })
			.first()
			.click();
		await expect(page.locator('.sentence-note-stack')).toHaveCount(0);
		await expect
			.poll(async () => {
				const drawer = await page.locator('.study-drawer').boundingBox();
				const player = await page.locator('.media-element.is-docked').boundingBox();
				return Boolean(drawer && player && drawer.y + drawer.height <= player.y - 6);
			})
			.toBe(true);
		await page.getByRole('button', { name: 'Close study panel' }).click();
		await expectClearReadingArea(page, 23);
		await page.evaluate(() => document.documentElement.classList.add('dark'));
		await page.screenshot({ path: testInfo.outputPath(`reader-${width}-dark.png`) });
	});
}
