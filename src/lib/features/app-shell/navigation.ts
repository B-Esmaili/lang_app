import BookOpenCheckIcon from '@lucide/svelte/icons/book-open-check';
import AudioLinesIcon from '@lucide/svelte/icons/audio-lines';
import GraduationCapIcon from '@lucide/svelte/icons/graduation-cap';
import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
import ShapesIcon from '@lucide/svelte/icons/shapes';
import UsersRoundIcon from '@lucide/svelte/icons/users-round';
import type { AppRole, AppShellNavGroup, AppShellNavItem } from './types';

export const DEFAULT_APP_NAVIGATION = [
	{
		id: 'workspace',
		label: 'Workspace',
		items: [
			{
				id: 'media',
				label: 'Media',
				href: '/media',
				icon: FolderOpenIcon
			},
			{
				id: 'overview',
				label: 'Overview',
				href: '/dashboard',
				icon: LayoutDashboardIcon,
				roles: ['admin', 'teacher', 'student']
			},
			{
				id: 'courses',
				label: 'Courses',
				href: '/courses',
				icon: GraduationCapIcon,
				roles: ['admin', 'teacher']
			},
			{
				id: 'my-learning',
				label: 'My learning',
				href: '/learn',
				icon: BookOpenCheckIcon,
				roles: ['student']
			}
		]
	},
	{
		id: 'create',
		label: 'Create',
		roles: ['admin', 'teacher'],
		items: [
			{
				id: 'templates',
				label: 'Templates',
				href: '/templates',
				icon: ShapesIcon
			},
			{
				id: 'speech-to-text',
				label: 'Speech to text',
				href: '/stt',
				icon: AudioLinesIcon
			}
		]
	},
	{
		id: 'manage',
		label: 'Manage',
		roles: ['admin'],
		items: [
			{
				id: 'users',
				label: 'Users',
				href: '/admin/users',
				icon: UsersRoundIcon
			}
		]
	}
] as const satisfies readonly AppShellNavGroup[];

export function canRoleAccess(roles: readonly AppRole[] | undefined, role: AppRole): boolean {
	return roles === undefined || roles.includes(role);
}

export function visibleNavigation(
	navigation: readonly AppShellNavGroup[],
	role: AppRole
): AppShellNavGroup[] {
	return navigation
		.filter((group) => canRoleAccess(group.roles, role))
		.map((group) => ({
			...group,
			items: group.items.filter((item) => canRoleAccess(item.roles, role))
		}))
		.filter((group) => group.items.length > 0);
}

function normalizePath(path: string): string {
	const withoutQuery = path.split(/[?#]/u, 1)[0] ?? '/';
	if (withoutQuery === '/') return withoutQuery;
	return withoutQuery.replace(/\/+$/u, '');
}

export function isNavigationItemActive(item: AppShellNavItem, currentPath: string): boolean {
	if (!item.href) return false;

	const itemPath = normalizePath(item.href);
	const activePath = normalizePath(currentPath);
	if (item.match === 'exact' || itemPath === '/') return activePath === itemPath;

	return activePath === itemPath || activePath.startsWith(`${itemPath}/`);
}

export function flattenVisibleNavigation(
	navigation: readonly AppShellNavGroup[],
	role: AppRole
): AppShellNavItem[] {
	return visibleNavigation(navigation, role).flatMap((group) => group.items);
}

export const APP_ROLE_LABELS: Record<AppRole, string> = {
	admin: 'Admin',
	teacher: 'Teacher',
	student: 'Student'
};
