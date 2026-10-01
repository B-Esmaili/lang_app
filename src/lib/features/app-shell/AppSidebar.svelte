<script lang="ts" module>
	/* eslint-disable svelte/no-navigation-without-resolve -- brand destination is supplied by the host app */
</script>

<script lang="ts">
	import PanelLeftCloseIcon from '@lucide/svelte/icons/panel-left-close';
	import PanelLeftOpenIcon from '@lucide/svelte/icons/panel-left-open';
	import { Button } from '$lib/components/ui/button';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import type { Snippet } from 'svelte';
	import NavigationList from './NavigationList.svelte';
	import type { AppRole, AppShellBrand, AppShellNavGroup, AppShellNavItem } from './types';

	let {
		brand,
		navigation,
		role,
		currentPath = '',
		tooltipSide = 'right',
		collapsed = $bindable(false),
		footer,
		onNavigate = () => undefined
	}: {
		brand: AppShellBrand;
		navigation: readonly AppShellNavGroup[];
		role: AppRole;
		currentPath?: string;
		tooltipSide?: 'left' | 'right';
		collapsed?: boolean;
		footer?: Snippet;
		onNavigate?: (item: AppShellNavItem) => void;
	} = $props();

	const brandInitial = $derived(
		brand.shortName?.trim().slice(0, 2) ?? brand.name.trim().slice(0, 1).toLocaleUpperCase()
	);
</script>

<aside class:collapsed aria-label="Application sidebar">
	<div class="brand-row">
		<a class="brand" href={brand.href ?? '/dashboard'} aria-label={brand.name}>
			<span class="brand-mark" aria-hidden="true">{brandInitial}</span>
			{#if !collapsed}<span class="brand-name">{brand.name}</span>{/if}
		</a>
	</div>

	<ScrollArea class="sidebar-scroll">
		<NavigationList {navigation} {role} {currentPath} {collapsed} {tooltipSide} {onNavigate} />
	</ScrollArea>

	<div class="sidebar-footer">
		{#if footer && !collapsed}
			<div class="footer-content">{@render footer()}</div>
		{/if}

		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						size={collapsed ? 'icon-lg' : 'lg'}
						class="collapse-button"
						aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
						aria-expanded={!collapsed}
						onclick={() => (collapsed = !collapsed)}
					>
						{#if collapsed}
							<PanelLeftOpenIcon aria-hidden="true" />
						{:else}
							<PanelLeftCloseIcon aria-hidden="true" />
							<span>Collapse sidebar</span>
						{/if}
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			{#if collapsed}
				<Tooltip.Content side={tooltipSide} sideOffset={8}>Expand sidebar</Tooltip.Content>
			{/if}
		</Tooltip.Root>
	</div>
</aside>

<style>
	aside {
		display: flex;
		position: sticky;
		z-index: 30;
		inset-block-start: 0;
		min-inline-size: 0;
		block-size: 100svh;
		flex-direction: column;
		border-inline-end: 0.0625rem solid var(--studio-line, #e8e4df);
		background: color-mix(
			in oklch,
			var(--studio-paper, #fff),
			var(--studio-workspace, #f5f3ef) 12%
		);
	}

	.brand-row {
		display: flex;
		align-items: center;
		min-block-size: 4.25rem;
		padding-inline: 1rem;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		min-inline-size: 0;
		border-radius: 0.75rem;
		color: var(--studio-ink, #252736);
		text-decoration: none;
	}

	.brand:focus-visible {
		outline: 0.1875rem solid color-mix(in oklch, var(--studio-purple, #8065b4), transparent 55%);
		outline-offset: 0.25rem;
	}

	.brand-mark {
		display: grid;
		inline-size: 2rem;
		block-size: 2rem;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 0.55rem;
		background: var(--studio-purple, #8065b4);
		color: #fff;
		font-size: 0.9rem;
		font-weight: 720;
		letter-spacing: -0.02em;
	}

	.brand-name {
		overflow: hidden;
		font-size: 0.95rem;
		font-weight: 680;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.sidebar-scroll) {
		min-block-size: 0;
		flex: 1 1 auto;
	}

	.sidebar-footer {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		padding: 0.7rem;
		border-block-start: 0.0625rem solid
			color-mix(in oklch, var(--studio-line, #e8e4df), transparent 30%);
	}

	.footer-content {
		padding: 0.3rem;
	}

	:global(.collapse-button) {
		justify-content: flex-start;
		inline-size: 100%;
		min-block-size: 2.75rem;
		color: var(--studio-muted-strong, #615d69);
	}

	.collapsed .brand-row {
		justify-content: center;
		padding-inline: 0.5rem;
	}

	.collapsed .sidebar-footer {
		align-items: center;
		padding-inline: 0.45rem;
	}

	.collapsed :global(.collapse-button) {
		justify-content: center;
		inline-size: 2.75rem;
		padding: 0;
	}

	@media (max-width: 56rem) {
		aside {
			display: none;
		}
	}
</style>
