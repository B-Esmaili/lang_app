<script lang="ts">
	import { resolve } from '$app/paths';
	import { AuthFrame, LoginForm } from '$lib/features/auth';
	let { data } = $props();
</script>

<svelte:head><title>Sign in · Learning studio</title></svelte:head>

<AuthFrame
	title="Sign in to your studio"
	description="Continue building, teaching, or learning from your personal workspace."
>
	<LoginForm
		redirectTo={data.redirectTo}
		defaultUsername={data.developmentCredentials?.username}
		defaultPassword={data.developmentCredentials?.password}
	/>
	{#snippet footer()}
		New student? <a href={resolve('/register')}>Create an account</a>
		{#if data.developmentCredentials}<span class="dev-note"
				>Temporary development login is prefilled.</span
			>{/if}
	{/snippet}
</AuthFrame>

<style>
	.dev-note {
		display: block;
		margin-block-start: 0.45rem;
		color: #9a7580;
		font-size: 0.68rem;
	}
</style>
