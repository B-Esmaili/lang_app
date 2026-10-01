<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import UserRoundCogIcon from '@lucide/svelte/icons/user-round-cog';
	import {
		AppShell,
		type AppShellAccountAction,
		type AppShellBreadcrumb
	} from '$lib/features/app-shell';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	let signingOut = $state(false);

	const accountActions: AppShellAccountAction[] = [
		{ id: 'account', label: 'Account settings', href: '/account', icon: UserRoundCogIcon },
		{ id: 'sign-out', label: 'Sign out', icon: LogOutIcon, destructive: true }
	];

	const pageTitle = $derived(resolveTitle(page.url.pathname, page.data));
	const breadcrumbs = $derived(resolveBreadcrumbs(page.url.pathname, pageTitle));
	const contentWidth = $derived(
		page.url.pathname.startsWith('/builder/') || page.url.pathname === '/templates'
			? 'fluid'
			: 'wide'
	);

	async function accountAction(action: AppShellAccountAction) {
		if (action.id !== 'sign-out' || signingOut) return;
		signingOut = true;
		try {
			await fetch('/api/auth/sign-out', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: '{}'
			});
			await goto(resolve('/login'), { invalidateAll: true });
		} finally {
			signingOut = false;
		}
	}

	function resolveTitle(pathname: string, routeData: Record<string, unknown>) {
		if (pathname.startsWith('/builder/')) {
			const builderData = routeData.builder as { course?: { title?: string } } | undefined;
			return builderData?.course?.title ?? 'Course builder';
		}
		if (pathname === '/dashboard') return 'Overview';
		if (pathname === '/courses') return 'Courses';
		if (pathname === '/templates') return 'Template studio';
		if (pathname === '/stt') return 'Speech to text';
		if (pathname === '/admin/users') return 'People & access';
		if (pathname === '/learn') return 'My learning';
		if (pathname === '/account') return 'Account settings';
		return 'Learning studio';
	}

	function resolveBreadcrumbs(pathname: string, title: string): AppShellBreadcrumb[] {
		if (pathname.startsWith('/builder/')) {
			return [
				{ label: 'Courses', href: '/courses' },
				{ label: title, current: true }
			];
		}
		if (pathname === '/admin/users') {
			return [{ label: 'Administration' }, { label: 'Users', current: true }];
		}
		return [];
	}
</script>

<AppShell
	user={data.viewer}
	title={pageTitle}
	currentPath={page.url.pathname}
	{breadcrumbs}
	{accountActions}
	{contentWidth}
	onAccountAction={accountAction}
>
	{@render children()}
</AppShell>
