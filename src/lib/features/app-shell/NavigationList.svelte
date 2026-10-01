<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { cn } from '$lib/utils';
	import { isNavigationItemActive, visibleNavigation } from './navigation';
	import type { AppRole, AppShellNavGroup, AppShellNavItem } from './types';

	let {
		navigation,
		role,
		currentPath = '',
		collapsed = false,
		tooltipSide = 'right',
		label = 'Primary navigation',
		onNavigate = () => undefined
	}: {
		navigation: readonly AppShellNavGroup[];
		role: AppRole;
		currentPath?: string;
		collapsed?: boolean;
		tooltipSide?: 'left' | 'right';
		label?: string;
		onNavigate?: (item: AppShellNavItem) => void;
	} = $props();

	const groups = $derived(visibleNavigation(navigation, role));

	function selectItem(item: AppShellNavItem): void {
		if (!item.disabled) onNavigate(item);
	}
</script>

<nav class:collapsed aria-label={label}>
	{#each groups as group (group.id)}
		<section class="nav-group" aria-labelledby={collapsed ? undefined : `nav-group-${group.id}`}>
			{#if group.label && !collapsed}
				<h2 id={`nav-group-${group.id}`}>{group.label}</h2>
			{/if}

			<ul>
				{#each group.items as item (item.id)}
					{@const Icon = item.icon}
					{@const active = isNavigationItemActive(item, currentPath)}
					<li>
						{#if collapsed}
							<Tooltip.Root>
								<Tooltip.Trigger>
									{#snippet child({ props })}
										<Button
											{...props}
											href={item.href}
											variant="ghost"
											size="icon-lg"
											class={cn('nav-item nav-item-collapsed', active && 'nav-item-active')}
											disabled={item.disabled}
											aria-current={active ? 'page' : undefined}
											onclick={() => selectItem(item)}
										>
											{#if Icon}<Icon aria-hidden="true" />{/if}
											<span class="sr-only">{item.label}</span>
										</Button>
									{/snippet}
								</Tooltip.Trigger>
								<Tooltip.Content side={tooltipSide} sideOffset={8}>{item.label}</Tooltip.Content>
							</Tooltip.Root>
						{:else}
							<Button
								href={item.href}
								variant="ghost"
								size="lg"
								class={cn('nav-item', active && 'nav-item-active')}
								disabled={item.disabled}
								aria-current={active ? 'page' : undefined}
								onclick={() => selectItem(item)}
							>
								{#if Icon}<Icon aria-hidden="true" />{/if}
								<span class="nav-label">{item.label}</span>
								{#if item.badge !== undefined}
									<Badge variant={active ? 'default' : 'secondary'}>{item.badge}</Badge>
								{/if}
							</Button>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</nav>

<style>
	nav,
	.nav-group,
	ul {
		display: flex;
		flex-direction: column;
	}

	nav {
		gap: 1.4rem;
		padding: 0.4rem 0.75rem 1.5rem;
	}

	nav.collapsed {
		align-items: center;
		gap: 0.75rem;
		padding-inline: 0.45rem;
	}

	.nav-group {
		gap: 0.35rem;
		min-inline-size: 0;
	}

	h2 {
		margin: 0;
		padding-inline: 0.7rem;
		color: var(--studio-muted, var(--muted-foreground));
		font-size: 0.65rem;
		font-weight: 650;
		letter-spacing: 0.09em;
		line-height: 1.5;
		text-transform: uppercase;
	}

	ul {
		gap: 0.18rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	:global(.nav-item) {
		justify-content: flex-start;
		inline-size: 100%;
		min-block-size: 2.75rem;
		padding-inline: 0.7rem;
		border-radius: 0.7rem;
		color: var(--studio-muted-strong, #615d69);
		font-weight: 530;
		text-align: start;
	}

	:global(.nav-item:hover) {
		background: color-mix(in oklch, var(--studio-lilac, #efe8fa), transparent 52%);
		color: var(--studio-ink, #252736);
	}

	:global(.nav-item-active) {
		background: var(--studio-lilac, #efe8fa);
		color: var(--studio-purple, #8065b4);
	}

	:global(.nav-item-active:hover) {
		background: color-mix(in oklch, var(--studio-lilac, #efe8fa), var(--studio-purple, #8065b4) 5%);
		color: var(--studio-purple, #8065b4);
	}

	:global(.nav-item svg) {
		inline-size: 1.05rem;
		block-size: 1.05rem;
	}

	:global(.nav-item-collapsed) {
		justify-content: center;
		inline-size: 2.75rem;
		padding: 0;
	}

	.nav-label {
		min-inline-size: 0;
		flex: 1 1 auto;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
