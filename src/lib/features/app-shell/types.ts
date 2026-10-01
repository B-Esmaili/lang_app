import type { LucideIcon } from '@lucide/svelte';

export type AppRole = 'admin' | 'teacher' | 'student';
export type AppShellDirection = 'ltr' | 'rtl';

export interface AppShellBrand {
	name: string;
	shortName?: string;
	href?: string;
}

export interface AppShellUser {
	name: string;
	email?: string;
	avatarUrl?: string;
	initials?: string;
	role: AppRole;
}

export interface AppShellNavItem {
	id: string;
	label: string;
	href?: string;
	icon?: LucideIcon;
	badge?: string | number;
	description?: string;
	roles?: readonly AppRole[];
	disabled?: boolean;
	match?: 'exact' | 'prefix';
}

export interface AppShellNavGroup {
	id: string;
	label?: string;
	items: readonly AppShellNavItem[];
	roles?: readonly AppRole[];
}

export interface AppShellBreadcrumb {
	label: string;
	href?: string;
	current?: boolean;
}

export interface AppShellAccountAction {
	id: string;
	label: string;
	href?: string;
	icon?: LucideIcon;
	destructive?: boolean;
	disabled?: boolean;
}

export type AppShellMobileNavigation = 'tabs' | 'drawer' | 'none';
