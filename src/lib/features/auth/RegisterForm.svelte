<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { UserPlus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';

	let name = $state('');
	let username = $state('');
	let email = $state('');
	let password = $state('');
	let busy = $state(false);
	let message = $state<string | null>(null);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		message = null;
		try {
			const response = await fetch('/api/auth/sign-up/email', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name: name.trim(),
					username: username.trim().toLowerCase(),
					email: email.trim().toLowerCase(),
					password
				})
			});
			const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
			if (!response.ok) {
				throw new Error(
					typeof body?.message === 'string' ? body.message : 'Could not create the account.'
				);
			}
			await goto(resolve('/dashboard'), { invalidateAll: true });
		} catch (error) {
			message = error instanceof Error ? error.message : 'Registration failed. Please try again.';
		} finally {
			busy = false;
		}
	}
</script>

<form onsubmit={submit}>
	<div class="field-pair">
		<label
			><span>Name</span><input
				bind:value={name}
				autocomplete="name"
				required
				maxlength="90"
			/></label
		>
		<label
			><span>Username</span><input
				bind:value={username}
				autocomplete="username"
				required
				minlength="3"
				maxlength="30"
				pattern="[a-zA-Z0-9._]+"
				dir="ltr"
			/></label
		>
	</div>
	<label
		><span>Email</span><input
			bind:value={email}
			type="email"
			autocomplete="email"
			required
			dir="ltr"
		/></label
	>
	<label
		><span>Password</span><input
			bind:value={password}
			type="password"
			autocomplete="new-password"
			required
			minlength="6"
			dir="ltr"
		/></label
	>
	<p class="role-note">
		New self-service accounts start with the Student role. An administrator can promote an account
		later.
	</p>
	{#if message}<p class="error" role="alert">{message}</p>{/if}
	<Button type="submit" size="lg" disabled={busy}
		><UserPlus data-icon="inline-start" />{busy ? 'Creating…' : 'Create student account'}</Button
	>
</form>

<style>
	form,
	label {
		display: grid;
	}
	form {
		gap: 1rem;
	}
	.field-pair {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.8rem;
	}
	label {
		gap: 0.42rem;
		color: #45414b;
		font-size: 0.78rem;
		font-weight: 650;
	}
	input {
		inline-size: 100%;
		min-block-size: 2.8rem;
		border: 0.0625rem solid #ded9d4;
		border-radius: 0.78rem;
		padding-inline: 0.85rem;
		background: white;
		color: #292733;
		font: inherit;
		font-weight: 500;
		outline: none;
	}
	input:focus {
		border-color: #937abc;
		box-shadow: 0 0 0 0.22rem #eee8f7;
	}
	.role-note,
	.error {
		margin: 0;
		border-radius: 0.68rem;
		padding: 0.7rem 0.78rem;
		font-size: 0.73rem;
		line-height: 1.45;
	}
	.role-note {
		background: #eef4ef;
		color: #56705e;
	}
	.error {
		background: #fcebea;
		color: #a64240;
	}
	form :global([data-slot='button']) {
		inline-size: 100%;
		min-block-size: 2.9rem;
		background: #8065b4;
	}
	@media (max-width: 28rem) {
		.field-pair {
			grid-template-columns: 1fr;
		}
	}
</style>
