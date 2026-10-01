<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import {
		ChevronLeft,
		ChevronRight,
		Plus,
		RefreshCw,
		Search,
		ShieldCheck,
		UsersRound
	} from '@lucide/svelte';
	import type { IColumnConfig } from '@svar-ui/svelte-grid';
	import { Button } from '$lib/components/ui/button';
	import { AppDataGrid } from '$lib/features/data-grid';
	import ActionsCell from './cells/ActionsCell.svelte';
	import RoleCell from './cells/RoleCell.svelte';
	import StatusCell from './cells/StatusCell.svelte';
	import UserIdentityCell from './cells/UserIdentityCell.svelte';
	import UserEditorDialog from './UserEditorDialog.svelte';
	import {
		EMPTY_USER_DRAFT,
		draftFromUser,
		normalizeManagedUser,
		type ManagedUser,
		type ManagedUsersResponse,
		type UserDraft
	} from './model';

	type Props = {
		initial?: ManagedUsersResponse | null;
		currentUserId?: string;
	};

	let { initial = null, currentUserId = '' }: Props = $props();
	const initialState = untrack(() => initial);
	let users = $state<ManagedUser[]>(initialState?.users ?? []);
	let total = $state(initialState?.total ?? 0);
	let page = $state(initialState?.page ?? 1);
	let pageSize = $state(initialState?.pageSize ?? 25);
	let query = $state('');
	let loading = $state(initialState === null);
	let mutating = $state(false);
	let loadError = $state<string | null>(null);
	let formError = $state<string | null>(null);
	let editorMode = $state<'create' | 'edit'>('create');
	let editorDraft = $state<UserDraft>({ ...EMPTY_USER_DRAFT });
	let editorOpen = $state(false);
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	const pageCount = $derived(Math.max(1, Math.ceil(total / pageSize)));
	const rangeStart = $derived(total === 0 ? 0 : (page - 1) * pageSize + 1);
	const rangeEnd = $derived(Math.min(total, page * pageSize));

	const desktopColumns: IColumnConfig[] = [
		{
			id: 'name',
			header: 'User',
			width: 210,
			flexgrow: 1.45,
			sort: true,
			cell: UserIdentityCell
		},
		{ id: 'email', header: 'Email', width: 190, flexgrow: 1.25, sort: true },
		{ id: 'role', header: 'Role', width: 118, sort: true, cell: RoleCell },
		{ id: 'banned', header: 'Status', width: 126, sort: true, cell: StatusCell },
		{ id: 'createdLabel', header: 'Joined', width: 132, sort: true },
		{ id: 'actions', header: '', width: 116, cell: ActionsCell }
	];

	const compactColumns: IColumnConfig[] = [
		{ id: 'name', header: 'User', width: 190, flexgrow: 1, cell: UserIdentityCell },
		{ id: 'role', header: 'Role', width: 105, cell: RoleCell },
		{ id: 'banned', header: 'Status', width: 115, cell: StatusCell },
		{ id: 'actions', header: '', width: 110, cell: ActionsCell }
	];

	const phoneColumns: IColumnConfig[] = [
		{ id: 'name', header: 'User', width: 174, flexgrow: 1, cell: UserIdentityCell },
		{ id: 'actions', header: '', width: 108, cell: ActionsCell }
	];

	const gridRows = $derived(
		users.map((user) => ({
			...user,
			createdLabel: formatDate(user.createdAt),
			actions: ''
		}))
	);

	function formatDate(value: string) {
		const date = new Date(value);
		if (Number.isNaN(date.valueOf())) return '—';
		return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
	}

	function errorMessage(error: unknown) {
		if (error instanceof Error) return error.message;
		return 'Something went wrong. Please try again.';
	}

	async function requestJson(url: string, init?: RequestInit) {
		const response = await fetch(url, init);
		const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
		if (!response.ok) {
			const message =
				typeof body?.message === 'string'
					? body.message
					: typeof body?.error === 'string'
						? body.error
						: `Request failed (${response.status})`;
			throw new Error(message);
		}
		return body;
	}

	async function loadUsers(targetPage = page) {
		loading = true;
		loadError = null;
		try {
			const params = new SvelteURLSearchParams({
				page: String(targetPage),
				pageSize: String(pageSize)
			});
			if (query.trim()) params.set('q', query.trim());
			const body = await requestJson(`/api/admin/users?${params}`);
			const response = body as unknown as ManagedUsersResponse;
			users = Array.isArray(response.users)
				? response.users.map((user) =>
						normalizeManagedUser(user as unknown as Record<string, unknown>)
					)
				: [];
			total = Number(response.total) || 0;
			page = Number(response.page) || targetPage;
			pageSize = Number(response.pageSize) || pageSize;
		} catch (error) {
			loadError = errorMessage(error);
		} finally {
			loading = false;
		}
	}

	function searchChanged(value: string) {
		query = value;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => void loadUsers(1), 260);
	}

	function createUser() {
		editorMode = 'create';
		editorDraft = { ...EMPTY_USER_DRAFT };
		formError = null;
		editorOpen = true;
	}

	function editUser(payload?: { id?: string }) {
		const user = users.find((candidate) => candidate.id === payload?.id);
		if (!user) return;
		editorMode = 'edit';
		editorDraft = draftFromUser(user);
		formError = null;
		editorOpen = true;
	}

	async function saveUser(draft: UserDraft) {
		mutating = true;
		formError = null;
		try {
			if (editorMode === 'create') {
				await requestJson('/api/admin/users', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						username: draft.username,
						name: draft.name,
						email: draft.email,
						password: draft.password,
						role: draft.role
					})
				});
			} else {
				const payload: Record<string, unknown> = {
					id: draft.id,
					username: draft.username,
					name: draft.name,
					email: draft.email,
					role: draft.role,
					banned: draft.banned,
					banReason: draft.banned ? draft.banReason || undefined : undefined
				};
				if (draft.password) payload.password = draft.password;
				await requestJson('/api/admin/users', {
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(payload)
				});
			}
			editorOpen = false;
			await loadUsers(editorMode === 'create' ? 1 : page);
		} catch (error) {
			formError = errorMessage(error);
		} finally {
			mutating = false;
		}
	}

	async function toggleBan(payload?: { id?: string }) {
		const user = users.find((candidate) => candidate.id === payload?.id);
		if (!user || user.id === currentUserId) return;
		mutating = true;
		loadError = null;
		try {
			await requestJson('/api/admin/users', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: user.id, banned: !user.banned })
			});
			await loadUsers();
		} catch (error) {
			loadError = errorMessage(error);
		} finally {
			mutating = false;
		}
	}

	async function deleteUser(payload?: { id?: string }) {
		const user = users.find((candidate) => candidate.id === payload?.id);
		if (!user || user.id === currentUserId) return;
		if (!window.confirm(`Delete ${user.name}? This also removes their sessions and account data.`))
			return;
		mutating = true;
		loadError = null;
		try {
			await requestJson(`/api/admin/users?id=${encodeURIComponent(user.id)}`, { method: 'DELETE' });
			await loadUsers(users.length === 1 && page > 1 ? page - 1 : page);
		} catch (error) {
			loadError = errorMessage(error);
		} finally {
			mutating = false;
		}
	}

	onMount(() => {
		if (!initialState) void loadUsers(1);
		return () => {
			if (searchTimer) clearTimeout(searchTimer);
		};
	});
</script>

<div class="users-page">
	<header class="page-heading">
		<div class="heading-copy">
			<span class="heading-icon"><UsersRound size={19} strokeWidth={1.8} /></span>
			<div>
				<p class="eyebrow">Administration</p>
				<h1>People & access</h1>
				<p>Invite teachers and students, assign roles, and control account access.</p>
			</div>
		</div>
		<Button onclick={createUser}><Plus data-icon="inline-start" /> Add user</Button>
	</header>

	<section class="summary-strip" aria-label="User summary">
		<div><span>All accounts</span><strong>{total}</strong></div>
		<div>
			<span>Teachers</span><strong
				>{users.filter((user) => user.role === 'teacher').length}<small> on page</small></strong
			>
		</div>
		<div>
			<span>Students</span><strong
				>{users.filter((user) => user.role === 'student').length}<small> on page</small></strong
			>
		</div>
		<div class="security-note">
			<ShieldCheck size={18} /><span>Role changes take effect on the next authorized request.</span>
		</div>
	</section>

	<div class="table-toolbar">
		<label class="search-box">
			<Search size={17} aria-hidden="true" />
			<span class="sr-only">Search users</span>
			<input
				type="search"
				value={query}
				placeholder="Search by name or email…"
				oninput={(event) => searchChanged(event.currentTarget.value)}
			/>
		</label>
		<Button
			variant="outline"
			size="icon"
			aria-label="Refresh users"
			disabled={loading || mutating}
			onclick={() => loadUsers()}
		>
			<RefreshCw class={loading ? 'spinning' : undefined} />
		</Button>
	</div>

	{#if loadError}
		<div class="error-banner" role="alert">
			<span>{loadError}</span>
			<Button size="sm" variant="ghost" onclick={() => loadUsers()}>Try again</Button>
		</div>
	{/if}

	<div class:loading class="grid-wrap" aria-busy={loading || mutating}>
		<AppDataGrid
			label="User accounts"
			data={gridRows}
			columns={desktopColumns}
			responsive={{
				760: { columns: phoneColumns },
				1080: { columns: compactColumns }
			}}
			sizes={{ rowHeight: 60, headerHeight: 46 }}
			select={true}
			emptyMessage={loading
				? 'Loading accounts…'
				: query
					? 'No users match this search.'
					: 'No user accounts yet.'}
			onedituser={editUser}
			ontoggleuserban={toggleBan}
			ondeleteuser={deleteUser}
		/>
	</div>

	<footer class="pagination">
		<p>Showing {rangeStart}–{rangeEnd} of {total}</p>
		<div>
			<Button
				variant="outline"
				size="icon"
				aria-label="Previous page"
				disabled={page <= 1 || loading}
				onclick={() => loadUsers(page - 1)}><ChevronLeft /></Button
			>
			<span>Page {page} of {pageCount}</span>
			<Button
				variant="outline"
				size="icon"
				aria-label="Next page"
				disabled={page >= pageCount || loading}
				onclick={() => loadUsers(page + 1)}><ChevronRight /></Button
			>
		</div>
	</footer>
</div>

{#if editorOpen}
	<UserEditorDialog
		mode={editorMode}
		draft={editorDraft}
		busy={mutating}
		error={formError}
		onclose={() => (editorOpen = false)}
		onsave={saveUser}
	/>
{/if}

<style>
	.users-page {
		display: grid;
		gap: clamp(1rem, 2vw, 1.5rem);
		inline-size: min(100%, 92rem);
		margin-inline: auto;
	}

	.page-heading,
	.heading-copy,
	.table-toolbar,
	.pagination,
	.pagination > div {
		display: flex;
		align-items: center;
	}

	.page-heading,
	.table-toolbar,
	.pagination {
		justify-content: space-between;
		gap: 1rem;
	}

	.heading-copy {
		min-inline-size: 0;
		align-items: flex-start;
		gap: 0.9rem;
	}

	.heading-icon {
		display: grid;
		flex: 0 0 auto;
		inline-size: 2.6rem;
		block-size: 2.6rem;
		place-items: center;
		border-radius: 0.88rem;
		background: var(--editor-selection-soft);
		color: var(--editor-selection);
	}

	h1,
	.eyebrow,
	.heading-copy p,
	.pagination p {
		margin: 0;
	}

	h1 {
		font-size: clamp(1.55rem, 3vw, 2.2rem);
		font-weight: 740;
		letter-spacing: -0.04em;
	}

	.eyebrow {
		margin-block-end: 0.18rem;
		color: var(--editor-selection);
		font-size: 0.68rem;
		font-weight: 760;
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}

	.heading-copy p:last-child {
		margin-block-start: 0.28rem;
		color: var(--muted-foreground);
		font-size: 0.85rem;
	}

	.summary-strip {
		display: grid;
		grid-template-columns: repeat(3, minmax(7.5rem, 0.55fr)) minmax(14rem, 1.5fr);
		gap: 0.5rem;
		border-radius: 1rem;
		padding: 0.45rem;
		background: color-mix(in oklab, var(--muted) 64%, transparent);
	}

	.summary-strip > div {
		display: grid;
		gap: 0.16rem;
		border-radius: 0.75rem;
		padding: 0.72rem 0.85rem;
		background: color-mix(in oklab, var(--card) 72%, transparent);
	}

	.summary-strip span {
		color: var(--muted-foreground);
		font-size: 0.68rem;
	}

	.summary-strip strong {
		font-size: 1.05rem;
		font-weight: 720;
	}

	.summary-strip small {
		color: var(--muted-foreground);
		font-size: 0.65rem;
		font-weight: 480;
	}

	.summary-strip .security-note {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		color: color-mix(in oklab, var(--editor-selection) 78%, var(--foreground));
	}

	.security-note span {
		color: inherit;
		line-height: 1.4;
	}

	.search-box {
		display: flex;
		inline-size: min(100%, 29rem);
		min-block-size: 2.45rem;
		align-items: center;
		gap: 0.62rem;
		border: 0.0625rem solid var(--input);
		border-radius: 0.78rem;
		padding-inline: 0.75rem;
		background: var(--card);
		color: var(--muted-foreground);
		box-shadow: 0 0.7rem 2rem -1.6rem color-mix(in oklab, var(--foreground) 24%, transparent);
	}

	.search-box:focus-within {
		border-color: color-mix(in oklab, var(--editor-selection) 60%, var(--input));
		box-shadow: 0 0 0 0.2rem color-mix(in oklab, var(--editor-selection-soft) 74%, transparent);
	}

	.search-box input {
		inline-size: 100%;
		border: 0;
		background: transparent;
		color: var(--foreground);
		font-size: 0.82rem;
		outline: none;
	}

	.grid-wrap {
		position: relative;
		min-inline-size: 0;
		transition: opacity 150ms ease;
	}

	.grid-wrap.loading {
		opacity: 0.62;
		pointer-events: none;
	}

	.error-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		border-radius: 0.8rem;
		padding: 0.68rem 0.8rem;
		background: color-mix(in oklab, var(--destructive) 9%, transparent);
		color: var(--destructive);
		font-size: 0.78rem;
	}

	.pagination {
		color: var(--muted-foreground);
		font-size: 0.75rem;
	}

	.pagination > div {
		gap: 0.65rem;
	}

	.pagination span {
		min-inline-size: 6rem;
		text-align: center;
	}

	.sr-only {
		position: absolute;
		inline-size: 0.0625rem;
		block-size: 0.0625rem;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}

	:global(.spinning) {
		animation: spin 700ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 62rem) {
		.summary-strip {
			grid-template-columns: repeat(3, 1fr);
		}

		.summary-strip .security-note {
			grid-column: 1 / -1;
		}
	}

	@media (max-width: 42rem) {
		.page-heading {
			align-items: flex-start;
		}

		.heading-icon,
		.heading-copy p:last-child {
			display: none;
		}

		.summary-strip {
			grid-template-columns: repeat(3, 1fr);
		}

		.summary-strip > div {
			padding: 0.65rem;
		}

		.security-note {
			display: none !important;
		}

		.table-toolbar {
			align-items: stretch;
		}

		.pagination p {
			display: none;
		}

		.pagination {
			justify-content: center;
		}
	}
</style>
