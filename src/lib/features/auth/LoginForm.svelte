<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { untrack } from 'svelte';
	import { Eye, EyeOff, LogIn } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';

	let {
		redirectTo = '/dashboard',
		defaultUsername = '',
		defaultPassword = ''
	}: { redirectTo?: string; defaultUsername?: string; defaultPassword?: string } = $props();

	let username = $state(untrack(() => defaultUsername));
	let password = $state(untrack(() => defaultPassword));
	let reveal = $state(false);
	let busy = $state(false);
	let message = $state<string | null>(null);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		message = null;
		try {
			const response = await fetch('/api/auth/sign-in/username', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ username: username.trim().toLowerCase(), password })
			});
			const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
			if (!response.ok) {
				throw new Error(
					typeof body?.message === 'string'
						? body.message
						: 'The username or password is incorrect.'
				);
			}
			// The server has already restricted this value to an internal absolute path.
			await goto(resolve(redirectTo as '/dashboard'), { invalidateAll: true });
		} catch (error) {
			message = error instanceof Error ? error.message : 'Sign in failed. Please try again.';
		} finally {
			busy = false;
		}
	}
</script>

<form onsubmit={submit}>
	<label>
		<span>Username</span>
		<input bind:value={username} name="username" autocomplete="username" required dir="ltr" />
	</label>
	<label>
		<span>Password</span>
		<div class="password-field">
			<input
				bind:value={password}
				name="password"
				type={reveal ? 'text' : 'password'}
				autocomplete="current-password"
				required
				minlength="6"
				dir="ltr"
			/>
			<button
				type="button"
				aria-label={reveal ? 'Hide password' : 'Show password'}
				onclick={() => (reveal = !reveal)}
			>
				{#if reveal}<EyeOff size={17} />{:else}<Eye size={17} />{/if}
			</button>
		</div>
	</label>
	{#if message}<p class="error" role="alert">{message}</p>{/if}
	<Button type="submit" size="lg" disabled={busy}>
		<LogIn data-icon="inline-start" />
		{busy ? 'Signing in…' : 'Sign in'}
	</Button>
</form>

<style>
	form,
	label {
		display: grid;
	}
	form {
		gap: 1rem;
	}
	label {
		gap: 0.42rem;
		color: #45414b;
		font-size: 0.78rem;
		font-weight: 650;
	}
	input {
		inline-size: 100%;
		min-block-size: 2.85rem;
		border: 0.0625rem solid #ded9d4;
		border-radius: 0.78rem;
		padding-inline: 0.85rem;
		background: white;
		color: #292733;
		font: inherit;
		font-weight: 500;
		outline: none;
		transition: 140ms ease;
	}
	input:focus {
		border-color: #937abc;
		box-shadow: 0 0 0 0.22rem #eee8f7;
	}
	.password-field {
		position: relative;
	}
	.password-field input {
		padding-inline-end: 3rem;
	}
	.password-field button {
		position: absolute;
		inset-block: 0;
		inset-inline-end: 0.35rem;
		display: grid;
		inline-size: 2.35rem;
		place-items: center;
		border: 0;
		background: transparent;
		color: #87818b;
		cursor: pointer;
	}
	form :global([data-slot='button']) {
		inline-size: 100%;
		min-block-size: 2.9rem;
		margin-block-start: 0.25rem;
		background: #8065b4;
	}
	.error {
		margin: 0;
		border-radius: 0.68rem;
		padding: 0.7rem 0.78rem;
		background: #fcebea;
		color: #a64240;
		font-size: 0.76rem;
		line-height: 1.45;
	}
</style>
