<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { FrameBorder, FrameSurface, TextDirection } from '../model/types';

	let {
		border,
		surface,
		contentLanguage,
		contentDirection,
		disabled = false,
		onBorderChange,
		onSurfaceChange,
		onContentLanguageChange,
		onContentDirectionChange
	}: {
		border: FrameBorder;
		surface: FrameSurface;
		contentLanguage: string;
		contentDirection: TextDirection;
		disabled?: boolean;
		onBorderChange: (border: FrameBorder) => void;
		onSurfaceChange: (surface: FrameSurface) => void;
		onContentLanguageChange: (language: string) => void;
		onContentDirectionChange: (direction: TextDirection) => void;
	} = $props();

	const directions: ReadonlyArray<{ value: TextDirection; label: string }> = [
		{ value: 'auto', label: 'Auto' },
		{ value: 'ltr', label: 'LTR' },
		{ value: 'rtl', label: 'RTL' }
	];
</script>

<aside class="inspector" aria-labelledby="inspector-title" dir="ltr" lang="en">
	<div class="inspector-heading">
		<p class="eyebrow">Style</p>
		<h2 id="inspector-title">Frame inspector</h2>
		<p>These choices belong to this frame and its template.</p>
	</div>

	<fieldset {disabled}>
		<legend>Border</legend>
		<div class="choice-grid">
			<Button
				type="button"
				variant={border === 'none' ? 'secondary' : 'ghost'}
				size="sm"
				class={border === 'none' ? 'active' : undefined}
				aria-pressed={border === 'none'}
				onclick={() => onBorderChange('none')}
			>
				<span class="border-preview borderless" aria-hidden="true"></span>
				<span>None</span>
			</Button>
			<Button
				type="button"
				variant={border === 'subtle' ? 'secondary' : 'ghost'}
				size="sm"
				class={border === 'subtle' ? 'active' : undefined}
				aria-pressed={border === 'subtle'}
				onclick={() => onBorderChange('subtle')}
			>
				<span class="border-preview bordered" aria-hidden="true"></span>
				<span>Subtle</span>
			</Button>
		</div>
	</fieldset>

	<fieldset {disabled}>
		<legend>Surface</legend>
		<div class="choice-grid">
			<Button
				type="button"
				variant={surface === 'transparent' ? 'secondary' : 'ghost'}
				size="sm"
				class={surface === 'transparent' ? 'active' : undefined}
				aria-pressed={surface === 'transparent'}
				onclick={() => onSurfaceChange('transparent')}
			>
				<span class="surface-preview transparent" aria-hidden="true"></span>
				<span>Transparent</span>
			</Button>
			<Button
				type="button"
				variant={surface === 'muted' ? 'secondary' : 'ghost'}
				size="sm"
				class={surface === 'muted' ? 'active' : undefined}
				aria-pressed={surface === 'muted'}
				onclick={() => onSurfaceChange('muted')}
			>
				<span class="surface-preview soft" aria-hidden="true"></span>
				<span>Soft</span>
			</Button>
		</div>
	</fieldset>

	<fieldset {disabled}>
		<legend>Content language</legend>
		<label class="language-field">
			<span>Language tag</span>
			<input
				type="text"
				list="lesson-language-tags"
				value={contentLanguage}
				placeholder="e.g. fa"
				spellcheck="false"
				autocomplete="off"
				onchange={(event) =>
					onContentLanguageChange((event.currentTarget as HTMLInputElement).value.trim())}
			/>
		</label>
		<datalist id="lesson-language-tags">
			<option value="en">English</option>
			<option value="fa">Persian</option>
			<option value="ar">Arabic</option>
		</datalist>
		<p class="field-help">Uses a standard language tag such as en, fa, or ar.</p>
	</fieldset>

	<fieldset {disabled}>
		<legend>Text direction</legend>
		<div class="segmented-control" aria-label="Content text direction">
			{#each directions as direction (direction.value)}
				<Button
					type="button"
					variant={contentDirection === direction.value ? 'secondary' : 'ghost'}
					size="sm"
					class={contentDirection === direction.value ? 'active' : undefined}
					aria-pressed={contentDirection === direction.value}
					onclick={() => onContentDirectionChange(direction.value)}
				>
					{direction.label}
				</Button>
			{/each}
		</div>
		<p class="field-help">Auto follows the language and the first strong character.</p>
	</fieldset>
</aside>

<style>
	.inspector {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-inline-size: 0;
		padding: clamp(0.75rem, 1.5vw, 1rem);
	}

	.inspector-heading,
	fieldset {
		min-inline-size: 0;
	}

	.eyebrow,
	h2,
	p {
		margin: 0;
	}

	.eyebrow {
		color: var(--muted-foreground);
		font-size: 0.6875rem;
		font-weight: 650;
		letter-spacing: 0.08em;
		line-height: 1.2;
		text-transform: uppercase;
	}

	h2 {
		margin-block-start: 0.15rem;
		font-size: 1rem;
		font-weight: 650;
	}

	.inspector-heading > p:last-child,
	.field-help {
		color: var(--muted-foreground);
		font-size: 0.75rem;
		line-height: 1.45;
	}

	.inspector-heading > p:last-child {
		display: none;
	}

	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		margin-block-end: 0.35rem;
		padding: 0;
		font-size: 0.75rem;
		font-weight: 625;
	}

	.choice-grid,
	.segmented-control {
		display: grid;
		gap: 0.2rem;
	}

	.choice-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.choice-grid :global([data-slot='button']),
	.segmented-control :global([data-slot='button']) {
		border: 0;
		font: inherit;
		cursor: pointer;
		transition:
			background-color 140ms ease,
			box-shadow 140ms ease,
			color 140ms ease;
	}

	.choice-grid :global([data-slot='button']) {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-block-size: 2.35rem;
		padding: 0.4rem;
		border-radius: 0.55rem;
		background: transparent;
		color: var(--muted-foreground);
		font-size: 0.75rem;
		text-align: start;
	}

	.choice-grid :global([data-slot='button']:hover:not(:disabled)),
	.segmented-control :global([data-slot='button']:hover:not(:disabled)) {
		background: color-mix(in oklch, var(--muted), transparent 20%);
		color: var(--foreground);
	}

	.choice-grid :global([data-slot='button'].active),
	.segmented-control :global([data-slot='button'].active) {
		background: color-mix(in oklch, var(--accent), transparent 8%);
		box-shadow: inset 0 0 0 0.0625rem color-mix(in oklch, var(--ring), transparent 35%);
		color: var(--accent-foreground);
	}

	.choice-grid :global([data-slot='button']:focus-visible),
	.segmented-control :global([data-slot='button']:focus-visible),
	.language-field input:focus-visible {
		outline: 0.125rem solid var(--ring);
		outline-offset: 0.125rem;
	}

	.choice-grid :global([data-slot='button']:disabled),
	.segmented-control :global([data-slot='button']:disabled),
	.language-field input:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}

	.border-preview,
	.surface-preview {
		flex: 0 0 auto;
		inline-size: 1.65rem;
		block-size: 1.25rem;
		border-radius: 0.35rem;
	}

	.border-preview {
		background: color-mix(in oklch, var(--background), var(--muted) 35%);
	}

	.border-preview.borderless {
		box-shadow: inset 0 0 0 0.0625rem transparent;
	}

	.border-preview.bordered {
		box-shadow: inset 0 0 0 0.0625rem var(--muted-foreground);
	}

	.surface-preview.transparent {
		background-image: linear-gradient(
			135deg,
			transparent 0 42%,
			color-mix(in oklch, var(--muted-foreground), transparent 70%) 42% 48%,
			transparent 48% 100%
		);
	}

	.surface-preview.soft {
		background: var(--muted);
	}

	.language-field {
		display: grid;
		gap: 0.25rem;
		color: var(--muted-foreground);
		font-size: 0.7rem;
	}

	.language-field input {
		inline-size: 100%;
		min-block-size: 2rem;
		padding-inline: 0.55rem;
		border: 0.0625rem solid var(--border);
		border-radius: 0.5rem;
		background: color-mix(in oklch, var(--background), transparent 4%);
		color: var(--foreground);
		font: inherit;
		font-size: 0.8125rem;
	}

	.field-help {
		display: none;
	}

	.segmented-control {
		grid-template-columns: repeat(3, minmax(0, 1fr));
		padding: 0.125rem;
		border: 0;
		border-radius: 0.55rem;
		background: color-mix(in oklch, var(--muted) 70%, transparent);
	}

	.segmented-control :global([data-slot='button']) {
		min-block-size: 1.85rem;
		border-radius: 0.42rem;
		background: transparent;
		color: var(--muted-foreground);
		font-size: 0.7rem;
		font-weight: 600;
	}
</style>
