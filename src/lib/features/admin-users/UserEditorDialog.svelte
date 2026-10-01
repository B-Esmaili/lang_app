<script lang="ts">
	import { X } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { APP_ROLES, type UserDraft } from './model';

	type Props = {
		mode: 'create' | 'edit';
		draft: UserDraft;
		busy?: boolean;
		error?: string | null;
		onclose: () => void;
		onsave: (draft: UserDraft) => void | Promise<void>;
	};

	let { mode, draft, busy = false, error = null, onclose, onsave }: Props = $props();
	let form = $derived<UserDraft>({ ...draft });

	function submit(event: SubmitEvent) {
		event.preventDefault();
		void onsave({
			...form,
			name: form.name.trim(),
			email: form.email.trim(),
			username: form.username.trim().toLowerCase(),
			banReason: form.banReason.trim()
		});
	}

	function backdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget && !busy) onclose();
	}
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape' && !busy) onclose();
	}}
/>

<div class="dialog-backdrop" role="presentation" onclick={backdropClick}>
	<div
		class="dialog-card"
		role="dialog"
		aria-modal="true"
		aria-labelledby="user-dialog-title"
		tabindex="-1"
		dir="auto"
	>
		<header>
			<div>
				<p class="eyebrow">{mode === 'create' ? 'New account' : 'Account settings'}</p>
				<h2 id="user-dialog-title">{mode === 'create' ? 'Add a user' : 'Edit user'}</h2>
			</div>
			<Button variant="ghost" size="icon" aria-label="Close" disabled={busy} onclick={onclose}>
				<X />
			</Button>
		</header>

		<form onsubmit={submit}>
			<div class="field-grid">
				<label>
					<span>Display name</span>
					<input bind:value={form.name} name="name" autocomplete="name" required maxlength="90" />
				</label>
				<label>
					<span>Username</span>
					<div class="input-prefix">
						<b aria-hidden="true">@</b><input
							bind:value={form.username}
							name="username"
							autocomplete="username"
							required
							minlength="3"
							maxlength="30"
							pattern="[a-zA-Z0-9._]+"
						/>
					</div>
				</label>
			</div>

			<label>
				<span>Email address</span>
				<input bind:value={form.email} name="email" type="email" autocomplete="email" required />
			</label>

			<div class="field-grid">
				<label>
					<span>{mode === 'create' ? 'Temporary password' : 'New password (optional)'}</span>
					<input
						bind:value={form.password}
						name="password"
						type="password"
						autocomplete="new-password"
						required={mode === 'create'}
						minlength="8"
					/>
				</label>
				<label>
					<span>Role</span>
					<select bind:value={form.role} name="role">
						{#each APP_ROLES as role (role)}
							<option value={role}>{role[0].toUpperCase() + role.slice(1)}</option>
						{/each}
					</select>
				</label>
			</div>

			{#if mode === 'edit'}
				<div class="access-panel">
					<label class="switch-row">
						<span>
							<strong>Suspend access</strong>
							<small>The account remains available to restore later.</small>
						</span>
						<input bind:checked={form.banned} type="checkbox" name="banned" />
					</label>
					{#if form.banned}
						<label>
							<span>Reason shown to administrators</span>
							<input bind:value={form.banReason} name="banReason" maxlength="180" />
						</label>
					{/if}
				</div>
			{/if}

			{#if error}
				<p class="form-error" role="alert">{error}</p>
			{/if}

			<footer>
				<Button type="button" variant="ghost" disabled={busy} onclick={onclose}>Cancel</Button>
				<Button type="submit" disabled={busy}>
					{busy ? 'Saving…' : mode === 'create' ? 'Create account' : 'Save changes'}
				</Button>
			</footer>
		</form>
	</div>
</div>

<style>
	.dialog-backdrop {
		position: fixed;
		z-index: 80;
		inset: 0;
		display: grid;
		place-items: center;
		padding: clamp(1rem, 4vw, 3rem);
		background: color-mix(in oklab, oklch(0.15 0.02 290) 43%, transparent);
		backdrop-filter: blur(0.4rem);
	}

	.dialog-card {
		inline-size: min(100%, 41rem);
		max-block-size: min(90dvh, 52rem);
		overflow: auto;
		border: 0.0625rem solid color-mix(in oklab, var(--border) 80%, transparent);
		border-radius: 1.4rem;
		background: var(--card);
		box-shadow: 0 2rem 5rem -2rem color-mix(in oklab, oklch(0.1 0.03 290) 60%, transparent);
	}

	header,
	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	header {
		padding: 1.45rem 1.55rem 1.1rem;
	}

	h2,
	.eyebrow,
	.form-error {
		margin: 0;
	}

	h2 {
		font-size: clamp(1.2rem, 3vw, 1.55rem);
		font-weight: 720;
		letter-spacing: -0.025em;
	}

	.eyebrow {
		margin-block-end: 0.2rem;
		color: var(--editor-selection);
		font-size: 0.68rem;
		font-weight: 760;
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}

	form {
		display: grid;
		gap: 1.05rem;
		padding: 0.5rem 1.55rem 1.45rem;
	}

	.field-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.9rem;
	}

	label {
		display: grid;
		gap: 0.42rem;
		color: var(--foreground);
		font-size: 0.78rem;
		font-weight: 650;
	}

	input,
	select,
	.input-prefix {
		inline-size: 100%;
		min-block-size: 2.7rem;
		border: 0.0625rem solid var(--input);
		border-radius: 0.75rem;
		background: color-mix(in oklab, var(--background) 75%, var(--card));
		color: var(--foreground);
		font: inherit;
		font-weight: 480;
		outline: none;
		transition:
			border-color 140ms ease,
			box-shadow 140ms ease;
	}

	input,
	select {
		padding-inline: 0.8rem;
	}

	input:focus,
	select:focus,
	.input-prefix:focus-within {
		border-color: color-mix(in oklab, var(--editor-selection) 70%, var(--input));
		box-shadow: 0 0 0 0.2rem color-mix(in oklab, var(--editor-selection-soft) 80%, transparent);
	}

	.input-prefix {
		display: flex;
		align-items: center;
		padding-inline-start: 0.75rem;
		color: var(--muted-foreground);
	}

	.input-prefix input {
		min-block-size: 2.55rem;
		border: 0;
		background: transparent;
		box-shadow: none;
	}

	.access-panel {
		display: grid;
		gap: 0.9rem;
		border-radius: 0.9rem;
		padding: 0.9rem;
		background: color-mix(in oklab, var(--muted) 62%, transparent);
	}

	.switch-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.switch-row span {
		display: grid;
		gap: 0.15rem;
	}

	.switch-row small {
		color: var(--muted-foreground);
		font-weight: 450;
	}

	.switch-row input {
		inline-size: 1.2rem;
		min-block-size: 1.2rem;
		accent-color: var(--editor-selection);
	}

	.form-error {
		border-radius: 0.7rem;
		padding: 0.72rem 0.8rem;
		background: color-mix(in oklab, var(--destructive) 10%, transparent);
		color: var(--destructive);
		font-size: 0.78rem;
	}

	footer {
		justify-content: flex-end;
		padding-block-start: 0.25rem;
	}

	@media (max-width: 38rem) {
		.dialog-backdrop {
			align-items: end;
			padding: 0;
		}

		.dialog-card {
			max-block-size: 94dvh;
			border-end-start-radius: 0;
			border-end-end-radius: 0;
		}

		.field-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
