<script lang="ts">
	import type { ICellProps } from '@svar-ui/svelte-grid';

	let { row }: ICellProps = $props();
	const role = $derived(String(row.role || 'student'));
</script>

<span class="role" data-role={role}>{role}</span>

<style>
	.role {
		display: inline-flex;
		align-items: center;
		border-radius: 999rem;
		padding: 0.25rem 0.58rem;
		background: color-mix(in oklab, var(--muted) 74%, transparent);
		color: var(--muted-foreground);
		font-size: 0.68rem;
		font-weight: 720;
		letter-spacing: 0.025em;
		text-transform: capitalize;
	}

	.role[data-role='admin'] {
		background: color-mix(in oklab, var(--editor-selection-soft) 88%, var(--card));
		color: color-mix(in oklab, var(--editor-selection) 82%, var(--foreground));
	}

	.role[data-role='teacher'] {
		background: color-mix(in oklab, var(--editor-slot-hint) 84%, var(--card));
		color: oklch(0.39 0.1 161);
	}
</style>
