<script lang="ts">
	import { AccountSettings } from '$lib/features/account';
	let { data } = $props();
</script>

<svelte:head><title>Account settings · Learning studio</title></svelte:head>
<AccountSettings
	user={data.viewer}
	aiConnections={data.aiConnections}
	voiceChatPreferences={data.voiceChatPreferences}
/>
