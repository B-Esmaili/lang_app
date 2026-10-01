<script lang="ts">
	import { resolve } from '$app/paths';
	import { AuthFrame, RegisterForm } from '$lib/features/auth';
</script>

<svelte:head><title>Create account · Learning studio</title></svelte:head>

<AuthFrame
	title="Start learning"
	description="Create a student workspace. Teachers and administrators are invited by an admin."
>
	<RegisterForm />
	{#snippet footer()}Already have an account? <a href={resolve('/login')}>Sign in</a>{/snippet}
</AuthFrame>
