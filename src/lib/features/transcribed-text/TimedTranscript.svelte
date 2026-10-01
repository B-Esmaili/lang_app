<script lang="ts">
	import type {
		TranscriptTokenSnapshot,
		TranscribedTextSnapshot
	} from '$lib/domain/transcribed-text';

	let {
		value,
		activeTokenId = null,
		class: className = '',
		language = 'en',
		direction = 'auto'
	}: {
		value: TranscribedTextSnapshot | null | undefined;
		activeTokenId?: string | null;
		class?: string;
		language?: string;
		direction?: 'auto' | 'ltr' | 'rtl';
	} = $props();

	const tokens = $derived(value?.alignment === 'synced' ? value.tokens : []);
	const fallbackText = $derived(value?.text ?? '');

	function tokenLabel(token: TranscriptTokenSnapshot, index: number) {
		return `${token.text}${index === tokens.length - 1 ? '' : ' '}`;
	}
</script>

<p class={`timed-transcript content-language ${className}`} lang={language} dir={direction}>
	{#if tokens.length}
		{#each tokens as token, index (token.id)}
			<span class:active={token.id === activeTokenId} data-transcript-token={token.id}
				>{tokenLabel(token, index)}</span
			>
		{/each}
	{:else}{fallbackText}{/if}
</p>

<style>
	.timed-transcript {
		margin: 0;
		unicode-bidi: plaintext;
	}

	[data-transcript-token] {
		border-radius: 0.22rem;
		padding-inline: 0.04em;
		transition:
			background-color 100ms ease,
			color 100ms ease,
			box-shadow 100ms ease;
	}

	[data-transcript-token].active {
		background: color-mix(in oklch, var(--editor-selection) 20%, transparent);
		box-shadow: 0 0 0 0.08rem color-mix(in oklch, var(--editor-selection) 18%, transparent);
		color: color-mix(in oklch, var(--editor-selection) 78%, var(--foreground));
	}

	@media (prefers-reduced-motion: reduce) {
		[data-transcript-token] {
			transition: none;
		}
	}
</style>
