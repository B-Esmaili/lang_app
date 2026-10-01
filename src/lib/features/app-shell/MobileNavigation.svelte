<script lang="ts">
	import MenuIcon from '@lucide/svelte/icons/menu';
	import XIcon from '@lucide/svelte/icons/x';
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { cn } from '$lib/utils';
	import { APP_ROLE_LABELS, flattenVisibleNavigation, isNavigationItemActive } from './navigation';
	import NavigationList from './NavigationList.svelte';
	import type {
		AppRole,
		AppShellBrand,
		AppShellMobileNavigation,
		AppShellNavGroup,
		AppShellNavItem,
		AppShellUser
	} from './types';

	let {
		open = $bindable(false),
		mode = 'tabs',
		brand,
		navigation,
		role,
		user,
		currentPath = '',
		onNavigate = () => undefined
	}: {
		open?: boolean;
		mode?: AppShellMobileNavigation;
		brand: AppShellBrand;
		navigation: readonly AppShellNavGroup[];
		role: AppRole;
		user: AppShellUser;
		currentPath?: string;
		onNavigate?: (item: AppShellNavItem) => void;
	} = $props();

	let dialogElement = $state<HTMLDialogElement>();
	let returnFocusElement: HTMLElement | null = null;
	let restoredFocus = true;

	const visibleItems = $derived(flattenVisibleNavigation(navigation, role));
	const tabItems = $derived(visibleItems.slice(0, visibleItems.length > 4 ? 3 : 4));
	const hasMoreItems = $derived(visibleItems.length > tabItems.length);
	const initials = $derived(
		user.initials ??
			user.name
				.trim()
				.split(/\s+/u)
				.slice(0, 2)
				.map((part) => part[0]?.toLocaleUpperCase() ?? '')
				.join('')
	);

	$effect(() => {
		if (!dialogElement) return;
		if (mode === 'none') {
			open = false;
			if (dialogElement.open) dialogElement.close();
			return;
		}

		if (open && !dialogElement.open) {
			returnFocusElement =
				document.activeElement instanceof HTMLElement ? document.activeElement : null;
			restoredFocus = false;
			dialogElement.showModal();
		} else if (!open && dialogElement.open) {
			dialogElement.close();
		}
	});

	function restoreFocus(): void {
		if (restoredFocus) return;
		restoredFocus = true;
		queueMicrotask(() => returnFocusElement?.focus());
	}

	function closeDrawer(): void {
		open = false;
		if (dialogElement?.open) dialogElement.close();
		restoreFocus();
	}

	function selectItem(item: AppShellNavItem): void {
		if (item.disabled) return;
		onNavigate(item);
		closeDrawer();
	}

	function handleBackdropClick(event: MouseEvent): void {
		if (event.target === event.currentTarget) closeDrawer();
	}
</script>

{#if mode !== 'none'}
	<dialog
		bind:this={dialogElement}
		class="mobile-drawer"
		aria-label="Application navigation"
		onclick={handleBackdropClick}
		oncancel={() => {
			open = false;
			restoreFocus();
		}}
		onclose={() => {
			open = false;
			restoreFocus();
		}}
	>
		<div class="drawer-panel">
			<header>
				<div class="drawer-brand">
					<span aria-hidden="true">{brand.shortName ?? brand.name.slice(0, 1)}</span>
					<strong>{brand.name}</strong>
				</div>
				<Button
					variant="ghost"
					size="icon-lg"
					class="drawer-close"
					aria-label="Close navigation"
					autofocus
					onclick={closeDrawer}
				>
					<XIcon aria-hidden="true" />
				</Button>
			</header>

			<ScrollArea class="drawer-scroll">
				<NavigationList
					{navigation}
					{role}
					{currentPath}
					label="Mobile navigation"
					onNavigate={selectItem}
				/>
			</ScrollArea>

			<footer>
				<Avatar class="drawer-avatar">
					{#if user.avatarUrl}<AvatarImage src={user.avatarUrl} alt="" />{/if}
					<AvatarFallback>{initials}</AvatarFallback>
				</Avatar>
				<div>
					<strong>{user.name}</strong>
					<span>{APP_ROLE_LABELS[user.role]}</span>
				</div>
			</footer>
		</div>
	</dialog>

	{#if mode === 'tabs'}
		<nav class="mobile-tabs" aria-label="Quick navigation">
			{#each tabItems as item (item.id)}
				{@const Icon = item.icon}
				{@const active = isNavigationItemActive(item, currentPath)}
				<Button
					href={item.href}
					variant="ghost"
					class={cn('mobile-tab', active && 'mobile-tab-active')}
					disabled={item.disabled}
					aria-current={active ? 'page' : undefined}
					onclick={() => onNavigate(item)}
				>
					{#if Icon}<Icon aria-hidden="true" />{/if}
					<span>{item.label}</span>
				</Button>
			{/each}
			{#if hasMoreItems}
				<Button
					variant="ghost"
					class="mobile-tab"
					aria-label="Open all navigation"
					aria-haspopup="dialog"
					onclick={() => (open = true)}
				>
					<MenuIcon aria-hidden="true" />
					<span>More</span>
				</Button>
			{/if}
		</nav>
	{/if}
{/if}

<style>
	.mobile-drawer,
	.mobile-tabs {
		display: none;
	}

	@media (max-width: 56rem) {
		.mobile-drawer[open] {
			display: flex;
			inline-size: 100%;
			max-inline-size: none;
			block-size: 100%;
			max-block-size: none;
			margin: 0;
			padding: 0;
			border: 0;
			background: transparent;
		}

		.mobile-drawer::backdrop {
			background: color-mix(in oklch, var(--studio-ink, #252736), transparent 68%);
			backdrop-filter: blur(0.12rem);
		}

		.drawer-panel {
			display: flex;
			inline-size: min(88vw, 20rem);
			block-size: 100%;
			flex-direction: column;
			border-inline-end: 0.0625rem solid var(--studio-line, #e8e4df);
			background: color-mix(
				in oklch,
				var(--studio-paper, #fff),
				var(--studio-workspace, #f5f3ef) 10%
			);
			box-shadow: 1rem 0 3rem color-mix(in oklch, var(--studio-ink, #252736), transparent 86%);
		}

		.mobile-drawer[open] .drawer-panel {
			animation: drawer-in 180ms ease-out;
		}

		.drawer-panel header,
		.drawer-brand,
		.drawer-panel footer {
			display: flex;
			align-items: center;
		}

		.drawer-panel header {
			justify-content: space-between;
			gap: 1rem;
			min-block-size: 4.25rem;
			padding-inline: 1rem 0.65rem;
			border-block-end: 0.0625rem solid var(--studio-line, #e8e4df);
		}

		.drawer-panel :global(.drawer-close) {
			inline-size: 2.75rem;
			block-size: 2.75rem;
		}

		.drawer-brand {
			gap: 0.65rem;
			min-inline-size: 0;
		}

		.drawer-brand > span {
			display: grid;
			inline-size: 2rem;
			block-size: 2rem;
			place-items: center;
			border-radius: 0.55rem;
			background: var(--studio-purple, #8065b4);
			color: #fff;
			font-size: 0.88rem;
			font-weight: 720;
		}

		.drawer-brand strong {
			overflow: hidden;
			font-size: 0.94rem;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		:global(.drawer-scroll) {
			min-block-size: 0;
			flex: 1 1 auto;
			padding-block: 0.8rem;
		}

		.drawer-panel footer {
			gap: 0.7rem;
			padding: 0.85rem 1rem;
			border-block-start: 0.0625rem solid var(--studio-line, #e8e4df);
		}

		:global(.drawer-avatar) {
			background: var(--studio-sage, #e8f1eb);
			color: var(--studio-green, #52816c);
		}

		.drawer-panel footer > div {
			display: flex;
			min-inline-size: 0;
			flex-direction: column;
		}

		.drawer-panel footer strong {
			overflow: hidden;
			font-size: 0.78rem;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.drawer-panel footer span {
			color: var(--studio-muted, var(--muted-foreground));
			font-size: 0.68rem;
		}

		.mobile-tabs {
			display: grid;
			position: fixed;
			z-index: 35;
			inset-inline: 0;
			inset-block-end: 0;
			grid-auto-flow: column;
			grid-auto-columns: minmax(0, 1fr);
			min-block-size: 4.15rem;
			padding-inline: max(0.35rem, env(safe-area-inset-left))
				max(0.35rem, env(safe-area-inset-right));
			padding-block: 0.3rem max(0.3rem, env(safe-area-inset-bottom));
			border-block-start: 0.0625rem solid var(--studio-line, #e8e4df);
			background: color-mix(in oklch, var(--studio-paper, #fff), transparent 3%);
			box-shadow: 0 -0.5rem 1.5rem color-mix(in oklch, var(--studio-ink, #252736), transparent 94%);
			backdrop-filter: blur(0.8rem);
		}

		.mobile-tabs :global(.mobile-tab) {
			display: flex;
			block-size: auto;
			min-block-size: 3.35rem;
			flex-direction: column;
			gap: 0.18rem;
			padding: 0.35rem 0.2rem;
			border-radius: 0.65rem;
			color: var(--studio-muted, var(--muted-foreground));
			font-size: 0.62rem;
			line-height: 1.1;
		}

		.mobile-tabs :global(.mobile-tab svg) {
			inline-size: 1.15rem;
			block-size: 1.15rem;
		}

		.mobile-tabs :global(.mobile-tab span) {
			max-inline-size: 100%;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		.mobile-tabs :global(.mobile-tab-active) {
			background: var(--studio-lilac, #efe8fa);
			color: var(--studio-purple, #8065b4);
		}
	}

	@keyframes drawer-in {
		from {
			transform: translateX(-1rem);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	:global([dir='rtl']) .drawer-panel {
		border-inline-end: 0;
		border-inline-start: 0.0625rem solid var(--studio-line, #e8e4df);
		box-shadow: -1rem 0 3rem color-mix(in oklch, var(--studio-ink, #252736), transparent 86%);
	}

	:global([dir='rtl']) .mobile-drawer[open] .drawer-panel {
		animation-name: drawer-in-rtl;
	}

	@keyframes drawer-in-rtl {
		from {
			transform: translateX(1rem);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	@media (max-width: 40rem) {
		.drawer-panel {
			inline-size: min(90vw, 19rem);
		}
		.drawer-panel header {
			min-block-size: 3.75rem;
			padding-inline: 0.75rem 0.5rem;
		}
		:global(.drawer-scroll) {
			padding-block: 0.55rem;
		}
		.drawer-panel footer {
			padding: 0.65rem 0.75rem calc(0.65rem + env(safe-area-inset-bottom));
		}
		.mobile-tabs {
			min-block-size: 3.9rem;
			padding-block: 0.2rem max(0.2rem, env(safe-area-inset-bottom));
		}
		.mobile-tabs :global(.mobile-tab) {
			min-block-size: 3.1rem;
			padding-block: 0.25rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.mobile-drawer[open] .drawer-panel {
			animation: none;
		}
	}
</style>
