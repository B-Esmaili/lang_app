<script lang="ts">
	import { Ban, PencilLine, Trash2, UserRoundCheck } from '@lucide/svelte';
	import type { ICellProps } from '@svar-ui/svelte-grid';

	let { row, onaction }: ICellProps = $props();

	function act(event: MouseEvent, action: string) {
		event.preventDefault();
		event.stopPropagation();
		onaction({ action, data: { id: row.id } });
	}
</script>

<div class="row-actions" aria-label={`Actions for ${row.name}`}>
	<button type="button" title="Edit user" onclick={(event) => act(event, 'edit-user')}>
		<PencilLine size={15} strokeWidth={1.8} />
	</button>
	<button
		type="button"
		title={row.banned === true ? 'Restore access' : 'Suspend user'}
		onclick={(event) => act(event, 'toggle-user-ban')}
	>
		{#if row.banned === true}
			<UserRoundCheck size={15} strokeWidth={1.8} />
		{:else}
			<Ban size={15} strokeWidth={1.8} />
		{/if}
	</button>
	<button
		class="destructive"
		type="button"
		title="Delete user"
		onclick={(event) => act(event, 'delete-user')}
	>
		<Trash2 size={15} strokeWidth={1.8} />
	</button>
</div>

<style>
	.row-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.18rem;
	}

	button {
		display: inline-grid;
		inline-size: 1.9rem;
		block-size: 1.9rem;
		place-items: center;
		border: 0;
		border-radius: 0.58rem;
		background: transparent;
		color: var(--muted-foreground);
		cursor: pointer;
		transition: 140ms ease;
	}

	button:hover,
	button:focus-visible {
		background: var(--muted);
		color: var(--foreground);
		outline: none;
	}

	button.destructive:hover,
	button.destructive:focus-visible {
		background: color-mix(in oklab, var(--destructive) 11%, transparent);
		color: var(--destructive);
	}
</style>
