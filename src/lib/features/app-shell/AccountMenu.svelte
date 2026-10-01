<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { cn } from '$lib/utils';
	import { APP_ROLE_LABELS } from './navigation';
	import type { AppShellAccountAction, AppShellUser } from './types';

	let {
		user,
		actions = [],
		compact = false,
		onAction = () => undefined
	}: {
		user: AppShellUser;
		actions?: readonly AppShellAccountAction[];
		compact?: boolean;
		onAction?: (action: AppShellAccountAction) => void;
	} = $props();

	let menuElement: HTMLDetailsElement | undefined;

	const initials = $derived(
		user.initials ??
			user.name
				.trim()
				.split(/\s+/u)
				.slice(0, 2)
				.map((part) => part[0]?.toLocaleUpperCase() ?? '')
				.join('')
	);

	function closeMenu(): void {
		menuElement?.removeAttribute('open');
	}

	function chooseAction(action: AppShellAccountAction): void {
		if (action.disabled) return;
		onAction(action);
		closeMenu();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape' || !menuElement?.open) return;
		event.preventDefault();
		closeMenu();
		menuElement?.querySelector<HTMLElement>('summary')?.focus();
	}

	function handleOutsidePointerDown(event: PointerEvent): void {
		if (!(event.target instanceof Node) || menuElement?.contains(event.target)) return;
		closeMenu();
	}
</script>

<svelte:window onkeydown={handleKeydown} onpointerdown={handleOutsidePointerDown} />

<details bind:this={menuElement} class:compact class="account-menu">
	<summary aria-label={`Open account menu for ${user.name}`}>
		<Avatar size={compact ? 'default' : 'lg'} class="account-avatar">
			{#if user.avatarUrl}<AvatarImage src={user.avatarUrl} alt="" />{/if}
			<AvatarFallback>{initials}</AvatarFallback>
		</Avatar>
		{#if !compact}
			<span class="account-summary-copy">
				<strong>{user.name}</strong>
				<span>{APP_ROLE_LABELS[user.role]}</span>
			</span>
		{/if}
		<ChevronDownIcon class="account-chevron" aria-hidden="true" />
	</summary>

	<section class="account-popover" aria-label="Account">
		<div class="account-identity">
			<Avatar size="lg" class="account-avatar">
				{#if user.avatarUrl}<AvatarImage src={user.avatarUrl} alt="" />{/if}
				<AvatarFallback>{initials}</AvatarFallback>
			</Avatar>
			<div>
				<strong>{user.name}</strong>
				{#if user.email}<span>{user.email}</span>{/if}
			</div>
		</div>
		<div class="role-row">
			<span>Signed in as</span>
			<Badge variant="secondary">{APP_ROLE_LABELS[user.role]}</Badge>
		</div>

		{#if actions.length > 0}
			<Separator />
			<div class="account-actions">
				{#each actions as action (action.id)}
					{@const Icon = action.icon}
					<Button
						href={action.href}
						variant="ghost"
						size="lg"
						class={cn('account-action', action.destructive && 'destructive')}
						disabled={action.disabled}
						onclick={() => chooseAction(action)}
					>
						{#if Icon}<Icon aria-hidden="true" />{/if}
						{action.label}
					</Button>
				{/each}
			</div>
		{/if}
	</section>
</details>

<style>
	.account-menu {
		position: relative;
	}

	summary {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		min-block-size: 2.75rem;
		padding: 0.25rem 0.35rem;
		border-radius: 0.8rem;
		cursor: pointer;
		list-style: none;
		transition: background-color 140ms ease;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary:hover,
	.account-menu[open] > summary {
		background: color-mix(in oklch, var(--studio-lilac, #efe8fa), transparent 48%);
	}

	summary:focus-visible {
		outline: 0.1875rem solid color-mix(in oklch, var(--studio-purple, #8065b4), transparent 55%);
		outline-offset: 0.125rem;
	}

	:global(.account-avatar) {
		background: var(--studio-sage, #e8f1eb);
		color: var(--studio-green, #52816c);
	}

	.account-summary-copy,
	.account-identity > div {
		display: flex;
		min-inline-size: 0;
		flex-direction: column;
		text-align: start;
	}

	.account-summary-copy strong,
	.account-identity strong {
		max-inline-size: 11rem;
		overflow: hidden;
		font-size: 0.8rem;
		font-weight: 650;
		line-height: 1.35;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.account-summary-copy span,
	.account-identity span,
	.role-row {
		color: var(--studio-muted, var(--muted-foreground));
		font-size: 0.7rem;
		line-height: 1.4;
	}

	:global(.account-chevron) {
		inline-size: 0.85rem;
		block-size: 0.85rem;
		color: var(--studio-muted, var(--muted-foreground));
		transition: transform 160ms ease;
	}

	.account-menu[open] :global(.account-chevron) {
		transform: rotate(180deg);
	}

	.compact :global(.account-chevron) {
		display: none;
	}

	.account-popover {
		position: absolute;
		z-index: 60;
		inset-block-start: calc(100% + 0.55rem);
		inset-inline-end: 0;
		inline-size: min(19rem, calc(100vw - 1.5rem));
		padding: 0.65rem;
		border: 0.0625rem solid var(--studio-line, #e8e4df);
		border-radius: 0.9rem;
		background: var(--studio-paper, #fff);
		box-shadow: 0 1rem 2.5rem color-mix(in oklch, var(--studio-ink, #252736), transparent 88%);
	}

	.account-identity {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.35rem;
	}

	.account-identity > div {
		flex: 1 1 auto;
	}

	.account-identity span {
		margin-block-start: 0.08rem;
		overflow-wrap: anywhere;
	}

	.role-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.6rem 0.4rem 0.5rem;
	}

	.account-popover :global([data-slot='separator']) {
		margin-block: 0.35rem;
	}

	.account-actions {
		display: grid;
		gap: 0.15rem;
	}

	.account-actions :global(.account-action) {
		justify-content: flex-start;
		inline-size: 100%;
		min-block-size: 2.75rem;
		padding-inline: 0.65rem;
	}

	.account-actions :global(.account-action.destructive) {
		color: var(--destructive);
	}

	@media (max-width: 40rem) {
		.account-summary-copy,
		:global(.account-chevron) {
			display: none;
		}
	}
</style>
