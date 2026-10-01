<script lang="ts">
	import { Grid, Willow, type IColumnConfig } from '@svar-ui/svelte-grid';
	import type { ComponentProps } from 'svelte';

	type GridProps = ComponentProps<typeof Grid>;

	type Props = Omit<GridProps, 'columns'> & {
		columns: IColumnConfig[];
		emptyMessage?: string;
		label?: string;
	};

	let {
		data = [],
		columns,
		emptyMessage = 'No records found',
		label = 'Data table',
		...gridProps
	}: Props = $props();
</script>

<section class="data-grid" aria-label={label}>
	{#if data.length > 0}
		<Willow fonts={false}>
			<Grid {data} {columns} {...gridProps} />
		</Willow>
	{:else}
		<div class="empty-state">
			<span class="empty-mark" aria-hidden="true"></span>
			<p>{emptyMessage}</p>
		</div>
	{/if}
</section>

<style>
	.data-grid {
		min-block-size: 20rem;
		inline-size: 100%;
		overflow: hidden;
		border: 0.0625rem solid color-mix(in oklab, var(--border) 78%, transparent);
		border-radius: 1.15rem;
		background: color-mix(in oklab, var(--card) 96%, transparent);
		box-shadow: 0 1.3rem 3.5rem -2.75rem color-mix(in oklab, var(--foreground) 28%, transparent);
	}

	.data-grid :global(.wx-willow-theme) {
		--wx-color-primary: oklch(0.56 0.17 296);
		--wx-color-primary-selected: oklch(0.5 0.18 296);
		--wx-color-font: var(--foreground);
		--wx-color-font-alt: var(--muted-foreground);
		--wx-background: var(--card);
		--wx-background-alt: color-mix(in oklab, var(--muted) 56%, var(--card));
		--wx-table-header-background: color-mix(in oklab, var(--muted) 58%, var(--card));
		--wx-table-border: 0.0625rem solid color-mix(in oklab, var(--border) 70%, transparent);
		--wx-table-header-cell-border: var(--wx-table-border);
		--wx-table-cell-border: var(--wx-table-border);
		--wx-table-select-background: color-mix(
			in oklab,
			var(--editor-selection-soft) 62%,
			var(--card)
		);
		--wx-table-select-color: var(--foreground);
		--wx-table-select-border: inset 0.2rem 0 var(--editor-selection);
		font-family: var(--font-content);
		font-size: 0.875rem;
	}

	.data-grid :global(.wx-grid) {
		border: 0;
	}

	.data-grid :global(.wx-header) {
		color: var(--muted-foreground);
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.empty-state {
		display: grid;
		min-block-size: 20rem;
		place-items: center;
		align-content: center;
		gap: 0.9rem;
		color: var(--muted-foreground);
		text-align: center;
	}

	.empty-mark {
		inline-size: 2.75rem;
		block-size: 2.75rem;
		border: 0.12rem dashed color-mix(in oklab, var(--editor-selection) 50%, transparent);
		border-radius: 50%;
		background: var(--editor-selection-soft);
	}

	.empty-state p {
		margin: 0;
		font-size: 0.9rem;
	}
</style>
