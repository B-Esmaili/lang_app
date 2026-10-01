<script lang="ts">
	import { AdminUsersPage } from '$lib/features/admin-users';
	let { data } = $props();
</script>

<svelte:head><title>People & access · Learning studio</title></svelte:head>
<AdminUsersPage initial={data.initial} currentUserId={data.viewer.id} />
