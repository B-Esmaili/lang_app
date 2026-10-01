<script lang="ts">
	import type { ICellProps } from '@svar-ui/svelte-grid';

	let { row }: ICellProps = $props();

	const initials = $derived(
		String(row.name || row.username || '?')
			.trim()
			.split(/\s+/u)
			.slice(0, 2)
			.map((part) => part[0]?.toLocaleUpperCase())
			.join('')
	);
</script>

<div class="identity-cell">
	<span class="avatar" aria-hidden="true">{initials}</span>
	<span class="identity-copy">
		<strong>{row.name}</strong>
		<small>@{row.username || 'no-username'}</small>
	</span>
</div>

<style>
	.identity-cell {
		display: flex;
		min-inline-size: 0;
		align-items: center;
		gap: 0.7rem;
		padding-block: 0.2rem;
	}

	.avatar {
		display: grid;
		flex: 0 0 auto;
		inline-size: 2rem;
		block-size: 2rem;
		place-items: center;
		border-radius: 50%;
		background: linear-gradient(
			145deg,
			var(--editor-selection-soft),
			color-mix(in oklab, var(--editor-slot-hint) 74%, white)
		);
		color: color-mix(in oklab, var(--editor-selection) 78%, var(--foreground));
		font-size: 0.68rem;
		font-weight: 750;
	}

	.identity-copy {
		display: grid;
		min-inline-size: 0;
		line-height: 1.25;
	}

	.identity-copy strong,
	.identity-copy small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.identity-copy strong {
		font-size: 0.84rem;
		font-weight: 680;
	}

	.identity-copy small {
		color: var(--muted-foreground);
		font-size: 0.7rem;
	}
</style>
