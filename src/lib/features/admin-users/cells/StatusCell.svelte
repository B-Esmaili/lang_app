<script lang="ts">
	import type { ICellProps } from '@svar-ui/svelte-grid';

	let { row }: ICellProps = $props();
</script>

<span class="status" class:is-banned={row.banned === true}>
	<span class="status-dot" aria-hidden="true"></span>
	{row.banned === true ? 'Suspended' : 'Active'}
</span>

<style>
	.status {
		display: inline-flex;
		align-items: center;
		gap: 0.42rem;
		color: oklch(0.42 0.1 158);
		font-size: 0.75rem;
		font-weight: 640;
	}

	.status-dot {
		inline-size: 0.46rem;
		block-size: 0.46rem;
		border-radius: 50%;
		background: oklch(0.66 0.14 157);
		box-shadow: 0 0 0 0.2rem oklch(0.91 0.055 157);
	}

	.status.is-banned {
		color: var(--destructive);
	}

	.status.is-banned .status-dot {
		background: var(--destructive);
		box-shadow: 0 0 0 0.2rem color-mix(in oklab, var(--destructive) 14%, transparent);
	}
</style>
