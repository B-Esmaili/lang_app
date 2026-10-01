<script lang="ts" module>
	/* eslint-disable svelte/no-navigation-without-resolve -- breadcrumb destinations are supplied by the host app */
</script>

<script lang="ts">
	import BellIcon from '@lucide/svelte/icons/bell';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import MenuIcon from '@lucide/svelte/icons/menu';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import type { Snippet } from 'svelte';
	import AccountMenu from './AccountMenu.svelte';
	import type { AppShellAccountAction, AppShellBreadcrumb, AppShellUser } from './types';

	let {
		title,
		breadcrumbs = [],
		user,
		accountActions = [],
		notificationCount = 0,
		mobileMenuAvailable = true,
		blockSize = $bindable(0),
		actions,
		onOpenNavigation = () => undefined,
		onNotifications = undefined,
		onAccountAction = () => undefined
	}: {
		title: string;
		breadcrumbs?: readonly AppShellBreadcrumb[];
		user: AppShellUser;
		accountActions?: readonly AppShellAccountAction[];
		notificationCount?: number;
		mobileMenuAvailable?: boolean;
		blockSize?: number;
		actions?: Snippet;
		onOpenNavigation?: () => void;
		onNotifications?: (() => void) | undefined;
		onAccountAction?: (action: AppShellAccountAction) => void;
	} = $props();
</script>

<header bind:offsetHeight={blockSize}>
	<div class="header-leading">
		{#if mobileMenuAvailable}
			<Button
				variant="ghost"
				size="icon-lg"
				class="mobile-menu-button"
				aria-label="Open navigation"
				aria-haspopup="dialog"
				onclick={onOpenNavigation}
			>
				<MenuIcon aria-hidden="true" />
			</Button>
		{/if}

		<div class="page-identity">
			{#if breadcrumbs.length > 0}
				<nav aria-label="Breadcrumb">
					<ol>
						{#each breadcrumbs as breadcrumb, index (`${breadcrumb.label}-${index}`)}
							<li>
								{#if index > 0}<ChevronRightIcon aria-hidden="true" />{/if}
								{#if breadcrumb.href && !breadcrumb.current}
									<a href={breadcrumb.href}>{breadcrumb.label}</a>
								{:else}
									<span aria-current={breadcrumb.current ? 'page' : undefined}
										>{breadcrumb.label}</span
									>
								{/if}
							</li>
						{/each}
					</ol>
				</nav>
			{/if}
			<h1>{title}</h1>
		</div>
	</div>

	<div class="header-actions">
		{#if actions}<div class="page-actions">{@render actions()}</div>{/if}

		{#if onNotifications}
			<Button
				variant="ghost"
				size="icon-lg"
				class="notification-button"
				aria-label={notificationCount > 0
					? `Notifications, ${notificationCount} unread`
					: 'Notifications'}
				onclick={onNotifications}
			>
				<BellIcon aria-hidden="true" />
				{#if notificationCount > 0}
					<Badge class="notification-count">
						{notificationCount > 99 ? '99+' : notificationCount}
					</Badge>
				{/if}
			</Button>
		{/if}

		<AccountMenu {user} actions={accountActions} compact onAction={onAccountAction} />
	</div>
</header>

<style>
	header {
		display: flex;
		position: sticky;
		z-index: 25;
		inset-block-start: 0;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		min-inline-size: 0;
		min-block-size: 4.25rem;
		padding: 0.55rem clamp(0.8rem, 2vw, 1.5rem);
		border-block-end: 0.0625rem solid var(--studio-line, #e8e4df);
		background: color-mix(in oklch, var(--studio-paper, #fff), transparent 4%);
		backdrop-filter: blur(0.75rem);
	}

	.header-leading,
	.header-actions,
	.page-actions,
	ol,
	li {
		display: flex;
		align-items: center;
	}

	.header-leading {
		min-inline-size: 0;
		gap: 0.6rem;
	}

	.page-identity {
		min-inline-size: 0;
	}

	ol {
		gap: 0.2rem;
		margin: 0 0 0.08rem;
		padding: 0;
		list-style: none;
	}

	li {
		gap: 0.2rem;
		min-inline-size: 0;
		color: var(--studio-muted, var(--muted-foreground));
		font-size: 0.66rem;
		line-height: 1.35;
	}

	li :global(svg) {
		inline-size: 0.7rem;
		block-size: 0.7rem;
		flex: 0 0 auto;
	}

	li a {
		max-inline-size: 10rem;
		overflow: hidden;
		border-radius: 0.2rem;
		color: inherit;
		text-decoration: none;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	li a:hover {
		color: var(--studio-purple, #8065b4);
	}

	li a:focus-visible {
		outline: 0.125rem solid color-mix(in oklch, var(--studio-purple, #8065b4), transparent 50%);
		outline-offset: 0.125rem;
	}

	h1 {
		max-inline-size: min(42rem, 52vw);
		margin: 0;
		overflow: hidden;
		color: var(--studio-ink, #252736);
		font-size: clamp(0.92rem, 1.4vw, 1.08rem);
		font-weight: 650;
		line-height: 1.35;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.header-actions,
	.page-actions {
		gap: 0.45rem;
		flex: 0 0 auto;
	}

	:global(.mobile-menu-button) {
		display: none;
	}

	:global(.notification-button) {
		position: relative;
		color: var(--studio-muted-strong, #615d69);
	}

	:global(.notification-count) {
		position: absolute;
		inset-block-start: -0.1rem;
		inset-inline-end: -0.25rem;
		min-inline-size: 1.1rem;
		block-size: 1.1rem;
		padding-inline: 0.25rem;
		background: var(--studio-purple, #8065b4);
		font-size: 0.58rem;
	}

	@media (max-width: 56rem) {
		:global(.mobile-menu-button) {
			display: inline-flex;
			inline-size: 2.75rem;
			block-size: 2.75rem;
		}

		:global(.notification-button) {
			inline-size: 2.75rem;
			block-size: 2.75rem;
		}
	}

	@media (max-width: 40rem) {
		header {
			min-block-size: 3.75rem;
			gap: 0.5rem;
			padding-inline: 0.55rem;
		}
		.header-leading,
		.header-actions {
			gap: 0.3rem;
		}

		.page-identity nav {
			display: none;
		}

		h1 {
			max-inline-size: 43vw;
		}

		.page-actions {
			display: none;
		}
	}

	:global([dir='rtl']) li :global(svg) {
		transform: rotate(180deg);
	}
</style>
