<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import type { Snippet } from 'svelte';

	let {
		title,
		description,
		children,
		footer
	}: { title: string; description: string; children: Snippet; footer?: Snippet } = $props();

	const waveform = [22, 42, 30, 58, 36, 70, 48, 82, 42, 64, 30, 52, 24, 46, 30, 60, 34];
</script>

<main class="auth-page">
	<section class="brand-panel" aria-label="Learning studio preview">
		<div class="brand-mark"><span>L</span><strong>Learning studio</strong></div>
		<div class="brand-copy">
			<Badge variant="secondary">Language learning · زبان‌آموزی</Badge>
			<h1>Teach with words,<br /><em>sound, and space.</em></h1>
			<p>
				A calm, responsive document for lessons that move naturally between text and visual ideas.
			</p>
		</div>

		<div class="lesson-preview" aria-hidden="true">
			<div class="preview-toolbar"><i></i><i></i><i></i><span>Responsive lesson</span></div>
			<article dir="rtl" lang="fa">
				<small>تمرین شنیداری</small>
				<h2>به آهنگ جمله گوش بدهید</h2>
				<p>واژه‌های مهم را <mark>مشخص کنید</mark> و سپس با صدای خودتان بخوانید.</p>
				<div class="waveform">
					<button tabindex="-1">▶</button>
					{#each waveform as height, index (index)}<i style={`--height:${height}%`}></i>{/each}
				</div>
			</article>
			<div class="response-card"><span>Your response</span><b></b><b></b></div>
		</div>
		<p class="writing-note">First-class Persian, Arabic, and bidirectional text</p>
	</section>

	<section class="form-panel">
		<div class="form-card">
			<div class="mobile-brand"><span>L</span><strong>Learning studio</strong></div>
			<header>
				<p class="eyebrow">Welcome</p>
				<h2>{title}</h2>
				<p>{description}</p>
			</header>
			{@render children()}
			{#if footer}<footer>{@render footer()}</footer>{/if}
		</div>
	</section>
</main>

<style>
	.auth-page {
		display: grid;
		grid-template-columns: minmax(24rem, 1.05fr) minmax(24rem, 0.95fr);
		min-block-size: 100svh;
		background: #f7f5f1;
		color: #292733;
	}

	.brand-panel,
	.form-panel {
		position: relative;
		display: grid;
		padding: clamp(2rem, 5vw, 5rem);
	}

	.brand-panel {
		overflow: hidden;
		align-content: space-between;
		gap: 2rem;
		background-color: #252331;
		background-image: radial-gradient(circle, #494456 0.045rem, transparent 0.055rem);
		background-size: 1.4rem 1.4rem;
		color: #f8f4fb;
	}

	.brand-panel::after {
		position: absolute;
		inline-size: 24rem;
		block-size: 24rem;
		border-radius: 50%;
		background: color-mix(in oklab, #826bb4 24%, transparent);
		content: '';
		filter: blur(4.5rem);
		inset-block-start: 28%;
		inset-inline-end: -12rem;
	}

	.brand-mark,
	.mobile-brand {
		display: flex;
		position: relative;
		z-index: 1;
		align-items: center;
		gap: 0.7rem;
		font-size: 0.86rem;
	}

	.brand-mark > span,
	.mobile-brand > span {
		display: grid;
		inline-size: 2rem;
		block-size: 2rem;
		place-items: center;
		border-radius: 0.65rem;
		background: #8a70bc;
		color: white;
		font-weight: 760;
	}

	.brand-copy {
		position: relative;
		z-index: 1;
		max-inline-size: 38rem;
	}

	.brand-copy :global([data-slot='badge']) {
		margin-block-end: 1.2rem;
		background: #3a3647;
		color: #d9d0e6;
	}

	.brand-copy h1 {
		margin: 0;
		font-size: clamp(2.3rem, 5vw, 4.4rem);
		font-weight: 620;
		letter-spacing: -0.055em;
		line-height: 0.98;
	}

	.brand-copy em {
		color: #baa5d9;
		font-family: Georgia, serif;
		font-weight: 450;
	}

	.brand-copy p {
		max-inline-size: 34rem;
		margin: 1.35rem 0 0;
		color: #b9b3c1;
		font-size: clamp(0.9rem, 1.3vw, 1.02rem);
		line-height: 1.65;
	}

	.lesson-preview {
		position: relative;
		z-index: 2;
		inline-size: min(100%, 38rem);
		margin-inline: auto;
		border: 0.0625rem solid #4a4555;
		border-radius: 1.25rem;
		padding: 0.65rem;
		background: #f4f1ec;
		box-shadow: 0 2.5rem 7rem #12111980;
		color: #34313d;
		transform: rotate(-1.5deg);
	}

	.preview-toolbar {
		display: flex;
		align-items: center;
		gap: 0.32rem;
		padding: 0.15rem 0.25rem 0.65rem;
		color: #86808c;
		font-size: 0.62rem;
	}

	.preview-toolbar i {
		inline-size: 0.42rem;
		block-size: 0.42rem;
		border-radius: 50%;
		background: #cbc3ce;
	}

	.preview-toolbar span {
		margin-inline-start: auto;
	}

	.lesson-preview article {
		border-radius: 0.9rem;
		padding: clamp(1rem, 2.5vw, 1.7rem);
		background: white;
		font-family: var(--font-arabic);
		text-align: start;
	}

	.lesson-preview small {
		color: #8065b4;
		font-size: 0.65rem;
	}
	.lesson-preview h2 {
		margin: 0.35rem 0 0.65rem;
		font-size: clamp(1.05rem, 2.4vw, 1.5rem);
	}
	.lesson-preview p {
		margin: 0;
		color: #716c77;
		font-size: 0.76rem;
		line-height: 1.8;
	}
	.lesson-preview mark {
		border-radius: 0.25rem;
		padding-inline: 0.18rem;
		background: #f8edb5;
	}

	.waveform {
		display: flex;
		block-size: 2.8rem;
		align-items: center;
		gap: 0.18rem;
		margin-block-start: 1rem;
		direction: ltr;
	}

	.waveform button {
		inline-size: 2rem;
		block-size: 2rem;
		margin-inline-end: 0.4rem;
		border: 0;
		border-radius: 50%;
		background: #8065b4;
		color: white;
	}

	.waveform i {
		inline-size: 0.2rem;
		block-size: var(--height);
		border-radius: 99rem;
		background: #b6a3d0;
	}

	.response-card {
		display: grid;
		gap: 0.45rem;
		inline-size: 42%;
		margin: -0.8rem 1rem 0 auto;
		border-radius: 0.75rem;
		padding: 0.7rem;
		background: #eef4ef;
		box-shadow: 0 0.8rem 2rem #39323d1c;
		color: #62806d;
		font-size: 0.55rem;
	}

	.response-card b {
		block-size: 0.24rem;
		border-radius: 1rem;
		background: #cadbce;
	}
	.response-card b:last-child {
		inline-size: 72%;
	}
	.writing-note {
		position: relative;
		z-index: 1;
		margin: 0;
		color: #9e97a8;
		font-size: 0.7rem;
	}

	.form-panel {
		place-items: center;
	}

	.form-card {
		inline-size: min(100%, 27rem);
	}
	.mobile-brand {
		display: none;
		margin-block-end: 3rem;
	}
	.form-card header {
		margin-block-end: 1.7rem;
	}
	.form-card h2 {
		margin: 0;
		font-size: clamp(1.75rem, 4vw, 2.35rem);
		letter-spacing: -0.045em;
	}
	.form-card header > p:last-child {
		margin: 0.55rem 0 0;
		color: #7c7782;
		font-size: 0.88rem;
		line-height: 1.6;
	}
	.eyebrow {
		margin: 0 0 0.25rem;
		color: #8065b4;
		font-size: 0.68rem;
		font-weight: 760;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	footer {
		margin-block-start: 1.35rem;
		color: #827d87;
		font-size: 0.78rem;
		text-align: center;
	}
	footer :global(a) {
		color: #72579f;
		font-weight: 650;
		text-decoration: none;
	}

	@media (max-width: 52rem) {
		.auth-page {
			grid-template-columns: 1fr;
		}
		.brand-panel {
			display: none;
		}
		.form-panel {
			padding: clamp(1.25rem, 7vw, 3rem);
		}
		.mobile-brand {
			display: flex;
		}
	}

	@media (max-width: 32rem) {
		.form-panel {
			padding: 0.9rem;
		}
		.mobile-brand {
			margin-block-end: 1.5rem;
		}
		.form-card header {
			margin-block-end: 1.1rem;
		}
		footer {
			margin-block-start: 1rem;
		}
	}
</style>
