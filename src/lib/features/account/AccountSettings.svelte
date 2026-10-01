<script lang="ts">
	import { Check, KeyRound, Save, Sparkles, Trash2, UserRound } from '@lucide/svelte';
	import { Dialog } from 'bits-ui';
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { nativeLanguages } from '$lib/domain/native-languages';
	import VoiceChatSettings from '$lib/features/voice-chat/VoiceChatSettings.svelte';
	import type { VoiceChatPreferences } from '$lib/features/voice-chat/voices';

	type Account = {
		name: string;
		email: string;
		username?: string;
		nativeLanguage?: string;
		freeChatConnectionId?: string;
		translationConnectionId?: string;
		role: 'admin' | 'teacher' | 'student';
	};
	type AiConnection = {
		id: string;
		label: string;
		provider: 'openai-compatible';
		baseUrl?: string;
		model?: string;
		isAssistant: boolean;
		updatedAt?: string;
	};
	type AiConnections = { connections: AiConnection[]; assistantConnectionId?: string };

	function connectionOptionLabel(connection: Pick<AiConnection, 'label' | 'model'>) {
		return `${connection.label}${connection.model ? ` · ${connection.model}` : ''}`;
	}
	let {
		user,
		aiConnections,
		voiceChatPreferences
	}: {
		user: Account;
		aiConnections: AiConnections;
		voiceChatPreferences: VoiceChatPreferences;
	} = $props();
	let name = $state(untrack(() => user.name));
	let savedName = $state(untrack(() => user.name));
	let nativeLanguage = $state(untrack(() => user.nativeLanguage ?? ''));
	let savedNativeLanguage = $state(untrack(() => user.nativeLanguage ?? ''));
	let nativeLanguageQuery = $state(
		untrack(
			() => nativeLanguages.find((language) => language.code === user.nativeLanguage)?.label ?? ''
		)
	);
	let nativeLanguageMenuOpen = $state(false);
	let activeNativeLanguageIndex = $state(-1);
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let profileState = $state<'idle' | 'busy' | 'success' | 'error'>('idle');
	let passwordState = $state<'idle' | 'busy' | 'success' | 'error'>('idle');
	let profileMessage = $state<string | null>(null);
	let passwordMessage = $state<string | null>(null);
	let connections = $state(untrack(() => [...aiConnections.connections]));
	let aiDialogOpen = $state(false);
	let editingConnectionId = $state<string | null>(null);
	let aiLabel = $state('');
	let aiProvider = $state('openai-compatible');
	let aiBaseUrl = $state('');
	let aiModel = $state('');
	let aiModelQuery = $state('');
	let aiApiKey = $state('');
	let aiKeyState = $state<'idle' | 'busy' | 'success' | 'error'>('idle');
	let aiKeyMessage = $state<string | null>(null);
	let aiModels = $state<string[]>([]);
	let loadingAiModels = $state(false);
	let aiModelsError = $state<string | null>(null);
	let aiModelMenuOpen = $state(false);
	let activeAiModelIndex = $state(-1);
	let aiAssistantQuery = $state('');
	let aiAssistantMenuOpen = $state(false);
	let activeAiAssistantIndex = $state(-1);
	let freeChatConnectionId = $state(untrack(() => user.freeChatConnectionId ?? ''));
	let freeChatConnectionQuery = $state('');
	let freeChatConnectionMenuOpen = $state(false);
	let activeFreeChatConnectionIndex = $state(-1);
	let freeChatConnectionState = $state<'idle' | 'busy' | 'success' | 'error'>('idle');
	let freeChatConnectionMessage = $state<string | null>(null);
	let translationConnectionId = $state(untrack(() => user.translationConnectionId ?? ''));
	let translationConnectionState = $state<'idle' | 'busy' | 'success' | 'error'>('idle');
	let translationConnectionMessage = $state<string | null>(null);
	const aiModelOptions = $derived(
		[...new Set([...aiModels, ...(aiModel.trim() ? [aiModel.trim()] : [])])].sort((left, right) =>
			left.localeCompare(right)
		)
	);
	const filteredAiModels = $derived(
		aiModelOptions.filter((model) =>
			model.toLocaleLowerCase().includes(aiModelQuery.trim().toLocaleLowerCase())
		)
	);
	const assistantConnectionId = $derived(
		connections.find((connection) => connection.isAssistant)?.id ?? ''
	);
	const assistantConnection = $derived(
		connections.find((connection) => connection.isAssistant) ?? null
	);
	const filteredAiAssistantConnections = $derived(
		connections.filter((connection) =>
			connectionOptionLabel(connection)
				.toLocaleLowerCase()
				.includes(aiAssistantQuery.trim().toLocaleLowerCase())
		)
	);
	const freeChatConnectionOptions = $derived(connections);
	const selectedFreeChatConnection = $derived(
		freeChatConnectionOptions.find((connection) => connection.id === freeChatConnectionId) ?? null
	);
	const filteredFreeChatConnections = $derived(
		freeChatConnectionOptions.filter((connection) =>
			connectionOptionLabel(connection)
				.toLocaleLowerCase()
				.includes(freeChatConnectionQuery.trim().toLocaleLowerCase())
		)
	);
	const selectedTranslationConnection = $derived(
		connections.find((connection) => connection.id === translationConnectionId) ?? null
	);
	const selectedNativeLanguage = $derived(
		nativeLanguages.find((language) => language.code === nativeLanguage) ?? null
	);
	const nativeLanguageOptions = $derived([
		{ code: '', label: 'Not specified' },
		...nativeLanguages
	]);
	const filteredNativeLanguages = $derived(
		nativeLanguageOptions.filter((language) =>
			`${language.label} ${language.code}`
				.toLocaleLowerCase()
				.includes(nativeLanguageQuery.trim().toLocaleLowerCase())
		)
	);

	$effect(() => {
		if (!aiAssistantMenuOpen)
			aiAssistantQuery = assistantConnection ? connectionOptionLabel(assistantConnection) : '';
	});

	$effect(() => {
		if (!nativeLanguageMenuOpen) nativeLanguageQuery = selectedNativeLanguage?.label ?? '';
	});

	$effect(() => {
		if (!freeChatConnectionMenuOpen) {
			freeChatConnectionQuery = selectedFreeChatConnection
				? connectionOptionLabel(selectedFreeChatConnection)
				: '';
		}
	});

	async function authRequest(path: string, body: Record<string, unknown>) {
		const response = await fetch(`/api/auth/${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		const result = (await response.json().catch(() => null)) as { message?: string } | null;
		if (!response.ok) throw new Error(result?.message ?? 'The update could not be completed.');
	}

	async function saveProfile(event: SubmitEvent) {
		event.preventDefault();
		profileState = 'busy';
		profileMessage = null;
		try {
			await authRequest('update-user', {
				name: name.trim(),
				nativeLanguage: nativeLanguage || null
			});
			savedName = name.trim();
			savedNativeLanguage = nativeLanguage;
			profileState = 'success';
			profileMessage = 'Profile updated';
		} catch (error) {
			profileState = 'error';
			profileMessage = error instanceof Error ? error.message : 'Profile update failed.';
		}
	}

	function closeNativeLanguageMenu() {
		nativeLanguageMenuOpen = false;
		activeNativeLanguageIndex = -1;
		nativeLanguageQuery = selectedNativeLanguage?.label ?? '';
	}

	function updateNativeLanguageQuery(event: Event) {
		nativeLanguageQuery = (event.currentTarget as HTMLInputElement).value;
		nativeLanguageMenuOpen = true;
		activeNativeLanguageIndex = -1;
	}

	function chooseNativeLanguage(code: string) {
		nativeLanguage = code;
		closeNativeLanguageMenu();
	}

	function handleNativeLanguageKeydown(event: KeyboardEvent) {
		if (!filteredNativeLanguages.length) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			nativeLanguageMenuOpen = true;
			activeNativeLanguageIndex = Math.min(
				activeNativeLanguageIndex + 1,
				filteredNativeLanguages.length - 1
			);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			nativeLanguageMenuOpen = true;
			activeNativeLanguageIndex = Math.max(activeNativeLanguageIndex - 1, 0);
		} else if (event.key === 'Enter' && nativeLanguageMenuOpen && activeNativeLanguageIndex >= 0) {
			event.preventDefault();
			chooseNativeLanguage(filteredNativeLanguages[activeNativeLanguageIndex].code);
		} else if (event.key === 'Escape') {
			closeNativeLanguageMenu();
		}
	}

	async function changePassword(event: SubmitEvent) {
		event.preventDefault();
		passwordMessage = null;
		if (newPassword !== confirmPassword) {
			passwordState = 'error';
			passwordMessage = 'The new passwords do not match.';
			return;
		}
		passwordState = 'busy';
		try {
			await authRequest('change-password', {
				currentPassword,
				newPassword,
				revokeOtherSessions: true
			});
			passwordState = 'success';
			passwordMessage = 'Password changed';
			currentPassword = '';
			newPassword = '';
			confirmPassword = '';
		} catch (error) {
			passwordState = 'error';
			passwordMessage = error instanceof Error ? error.message : 'Password update failed.';
		}
	}

	function resetAiForm() {
		editingConnectionId = null;
		aiLabel = '';
		aiProvider = 'openai-compatible';
		aiBaseUrl = '';
		aiModel = '';
		aiModelQuery = '';
		aiApiKey = '';
		aiModels = [];
		aiModelsError = null;
		aiModelMenuOpen = false;
		activeAiModelIndex = -1;
	}

	function openNewAiConnection() {
		resetAiForm();
		aiKeyState = 'idle';
		aiKeyMessage = null;
		aiDialogOpen = true;
	}

	function closeAiDialog() {
		aiDialogOpen = false;
		resetAiForm();
	}

	function editAiConnection(connection: AiConnection) {
		editingConnectionId = connection.id;
		aiLabel = connection.label;
		aiProvider = connection.provider;
		aiBaseUrl = connection.baseUrl ?? '';
		aiModel = connection.model ?? '';
		aiModelQuery = connection.model ?? '';
		aiApiKey = '';
		aiModels = [];
		aiModelsError = null;
		aiKeyState = 'idle';
		aiKeyMessage = null;
		aiDialogOpen = true;
	}

	async function saveAiConnection(event: SubmitEvent) {
		event.preventDefault();
		aiKeyState = 'busy';
		aiKeyMessage = null;
		try {
			const response = await fetch(
				editingConnectionId
					? `/api/account/ai-connections/${editingConnectionId}`
					: '/api/account/ai-connections',
				{
					method: editingConnectionId ? 'PATCH' : 'PUT',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						label: aiLabel,
						provider: aiProvider,
						baseUrl: aiBaseUrl,
						model: aiModel,
						apiKey: aiApiKey
					})
				}
			);
			const result = (await response.json().catch(() => null)) as
				(AiConnection & { error?: string }) | null;
			if (!response.ok) throw new Error(result?.error ?? 'The AI connection could not be saved.');
			if (!result) throw new Error('The AI connection could not be saved.');
			connections = editingConnectionId
				? connections.map((connection) => (connection.id === result.id ? result : connection))
				: [...connections, result];
			const wasEditing = Boolean(editingConnectionId);
			resetAiForm();
			aiDialogOpen = false;
			aiKeyState = 'success';
			aiKeyMessage = wasEditing ? 'AI connection updated.' : 'AI connection added securely.';
		} catch (error) {
			aiKeyState = 'error';
			aiKeyMessage =
				error instanceof Error ? error.message : 'The AI connection could not be saved.';
		}
	}

	async function loadAiModels() {
		loadingAiModels = true;
		aiModelsError = null;
		try {
			const response = await fetch('/api/account/ai-connections', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					connectionId: editingConnectionId,
					provider: aiProvider,
					baseUrl: aiBaseUrl,
					apiKey: aiApiKey
				})
			});
			const payload = (await response.json().catch(() => null)) as {
				data?: unknown;
				error?: string;
			} | null;
			if (!response.ok) throw new Error(payload?.error ?? 'The model list could not be loaded.');
			if (!Array.isArray(payload?.data))
				throw new Error('The provider returned an invalid model list.');

			aiModels = payload.data.flatMap((entry): string[] => {
				if (
					typeof entry === 'object' &&
					entry !== null &&
					'id' in entry &&
					typeof entry.id === 'string' &&
					entry.id.trim()
				) {
					return [entry.id];
				}
				return [];
			});
			if (!aiModels.length) throw new Error('No models are available for this connection.');
			if (!aiModel.trim()) selectAiModel(aiModels[0]);
		} catch (error) {
			aiModels = [];
			aiModelsError =
				error instanceof Error ? error.message : 'The model list could not be loaded.';
		} finally {
			loadingAiModels = false;
		}
	}

	function selectAiModel(model: string) {
		aiModel = model;
		aiModelQuery = model;
		aiModelMenuOpen = false;
		activeAiModelIndex = -1;
	}

	function updateAiModelQuery(event: Event) {
		const query = (event.currentTarget as HTMLInputElement).value;
		aiModelQuery = query;
		aiModel = aiModelOptions.find((model) => model === query) ?? '';
		aiModelMenuOpen = true;
		activeAiModelIndex = -1;
	}

	function handleAiModelKeydown(event: KeyboardEvent) {
		if (!filteredAiModels.length) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			aiModelMenuOpen = true;
			activeAiModelIndex = Math.min(activeAiModelIndex + 1, filteredAiModels.length - 1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			aiModelMenuOpen = true;
			activeAiModelIndex = Math.max(activeAiModelIndex - 1, 0);
		} else if (event.key === 'Enter' && aiModelMenuOpen && activeAiModelIndex >= 0) {
			event.preventDefault();
			selectAiModel(filteredAiModels[activeAiModelIndex]);
		} else if (event.key === 'Escape') {
			aiModelMenuOpen = false;
			activeAiModelIndex = -1;
		}
	}

	async function selectAiAssistant(connectionId: string) {
		aiKeyState = 'busy';
		aiKeyMessage = null;
		try {
			const response = await fetch(`/api/account/ai-connections/${connectionId}/assistant`, {
				method: 'POST'
			});
			const selected = (await response.json().catch(() => null)) as
				| (AiConnection & {
						error?: string;
				  })
				| null;
			if (!response.ok) {
				throw new Error(selected?.error ?? 'The AI assistant connection could not be selected.');
			}
			if (!selected) throw new Error('The AI assistant connection could not be selected.');
			connections = connections.map((connection) => ({
				...connection,
				isAssistant: connection.id === selected.id
			}));
			aiKeyState = 'success';
			aiKeyMessage = `${selected.label} is now used by the AI assistant.`;
		} catch (error) {
			aiKeyState = 'error';
			aiKeyMessage =
				error instanceof Error
					? error.message
					: 'The AI assistant connection could not be selected.';
		}
	}

	function closeAiAssistantMenu() {
		aiAssistantMenuOpen = false;
		activeAiAssistantIndex = -1;
		aiAssistantQuery = assistantConnection ? connectionOptionLabel(assistantConnection) : '';
	}

	function updateAiAssistantQuery(event: Event) {
		aiAssistantQuery = (event.currentTarget as HTMLInputElement).value;
		aiAssistantMenuOpen = true;
		activeAiAssistantIndex = -1;
	}

	function chooseAiAssistantConnection(connectionId: string) {
		closeAiAssistantMenu();
		if (connectionId !== assistantConnectionId) void selectAiAssistant(connectionId);
	}

	function handleAiAssistantKeydown(event: KeyboardEvent) {
		if (!filteredAiAssistantConnections.length) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			aiAssistantMenuOpen = true;
			activeAiAssistantIndex = Math.min(
				activeAiAssistantIndex + 1,
				filteredAiAssistantConnections.length - 1
			);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			aiAssistantMenuOpen = true;
			activeAiAssistantIndex = Math.max(activeAiAssistantIndex - 1, 0);
		} else if (event.key === 'Enter' && aiAssistantMenuOpen && activeAiAssistantIndex >= 0) {
			event.preventDefault();
			chooseAiAssistantConnection(filteredAiAssistantConnections[activeAiAssistantIndex].id);
		} else if (event.key === 'Escape') {
			closeAiAssistantMenu();
		}
	}

	function closeFreeChatConnectionMenu() {
		freeChatConnectionMenuOpen = false;
		activeFreeChatConnectionIndex = -1;
		freeChatConnectionQuery = selectedFreeChatConnection
			? connectionOptionLabel(selectedFreeChatConnection)
			: '';
	}

	function updateFreeChatConnectionQuery(event: Event) {
		freeChatConnectionQuery = (event.currentTarget as HTMLInputElement).value;
		freeChatConnectionMenuOpen = true;
		activeFreeChatConnectionIndex = -1;
	}

	async function chooseFreeChatConnection(connectionId: string) {
		closeFreeChatConnectionMenu();
		if (connectionId === freeChatConnectionId) return;

		freeChatConnectionState = 'busy';
		freeChatConnectionMessage = null;
		try {
			const response = await fetch('/api/account/free-chat-connection', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ connectionId: connectionId || null })
			});
			const payload = (await response.json().catch(() => null)) as {
				connectionId?: unknown;
				error?: string;
			} | null;
			if (!response.ok) {
				throw new Error(payload?.error ?? 'The free chat connection could not be saved.');
			}
			if (payload?.connectionId !== null && typeof payload?.connectionId !== 'string') {
				throw new Error('The free chat connection could not be saved.');
			}
			freeChatConnectionId = payload?.connectionId ?? '';
			freeChatConnectionState = 'success';
			freeChatConnectionMessage = selectedFreeChatConnection
				? `${selectedFreeChatConnection.label} now powers free chat.`
				: 'Free chat now uses the AI assistant connection.';
		} catch (error) {
			freeChatConnectionState = 'error';
			freeChatConnectionMessage =
				error instanceof Error ? error.message : 'The free chat connection could not be saved.';
		}
	}

	function handleFreeChatConnectionKeydown(event: KeyboardEvent) {
		if (!filteredFreeChatConnections.length) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			freeChatConnectionMenuOpen = true;
			activeFreeChatConnectionIndex = Math.min(
				activeFreeChatConnectionIndex + 1,
				filteredFreeChatConnections.length - 1
			);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			freeChatConnectionMenuOpen = true;
			activeFreeChatConnectionIndex = Math.max(activeFreeChatConnectionIndex - 1, 0);
		} else if (
			event.key === 'Enter' &&
			freeChatConnectionMenuOpen &&
			activeFreeChatConnectionIndex >= 0
		) {
			event.preventDefault();
			void chooseFreeChatConnection(filteredFreeChatConnections[activeFreeChatConnectionIndex].id);
		} else if (event.key === 'Escape') {
			closeFreeChatConnectionMenu();
		}
	}

	async function chooseTranslationConnection(connectionId: string) {
		if (connectionId === translationConnectionId) return;

		translationConnectionState = 'busy';
		translationConnectionMessage = null;
		try {
			const response = await fetch('/api/account/translation-connection', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ connectionId: connectionId || null })
			});
			const payload = (await response.json().catch(() => null)) as {
				connectionId?: unknown;
				error?: string;
			} | null;
			if (!response.ok) {
				throw new Error(payload?.error ?? 'The translation model could not be saved.');
			}
			if (payload?.connectionId !== null && typeof payload?.connectionId !== 'string') {
				throw new Error('The translation model could not be saved.');
			}
			translationConnectionId = payload?.connectionId ?? '';
			translationConnectionState = 'success';
			translationConnectionMessage = selectedTranslationConnection
				? `${selectedTranslationConnection.label} now powers course translations.`
				: 'Course translations now use the AI assistant connection.';
		} catch (error) {
			translationConnectionState = 'error';
			translationConnectionMessage =
				error instanceof Error ? error.message : 'The translation model could not be saved.';
		}
	}

	async function deleteAiConnection(connection: AiConnection) {
		aiKeyState = 'busy';
		aiKeyMessage = null;
		try {
			const response = await fetch(`/api/account/ai-connections/${connection.id}`, {
				method: 'DELETE'
			});
			if (!response.ok) {
				const result = (await response.json().catch(() => null)) as { error?: string } | null;
				throw new Error(result?.error ?? 'The AI connection could not be removed.');
			}
			connections = connections.filter(({ id }) => id !== connection.id);
			if (editingConnectionId === connection.id) resetAiForm();
			if (freeChatConnectionId === connection.id) freeChatConnectionId = '';
			if (translationConnectionId === connection.id) translationConnectionId = '';
			aiKeyState = 'success';
			aiKeyMessage = `${connection.label} was removed.`;
		} catch (error) {
			aiKeyState = 'error';
			aiKeyMessage =
				error instanceof Error ? error.message : 'The AI connection could not be removed.';
		}
	}
</script>

<div class="account-page">
	<header>
		<span><UserRound size={20} /></span>
		<div>
			<p>Personal settings</p>
			<h1>Your account</h1>
			<small>Manage your identity and password.</small>
		</div>
	</header>
	<div class="settings-grid">
		<section>
			<div class="section-heading">
				<div>
					<h2>Profile</h2>
					<p>This name appears in courses and learning spaces.</p>
				</div>
				<Badge variant="secondary">{user.role}</Badge>
			</div>
			<form onsubmit={saveProfile}>
				<label
					><span>Display name</span><input
						bind:value={name}
						required
						maxlength="90"
						autocomplete="name"
					/></label
				><label><span>Username</span><input value={user.username ?? ''} readonly dir="ltr" /></label
				><label for="native-language"
					><span>Native language</span>
					<div class="native-language-combobox">
						<input
							id="native-language"
							value={nativeLanguageQuery}
							placeholder="Search languages"
							role="combobox"
							aria-autocomplete="list"
							aria-controls="native-language-listbox"
							aria-expanded={nativeLanguageMenuOpen}
							aria-activedescendant={activeNativeLanguageIndex >= 0
								? `native-language-option-${activeNativeLanguageIndex}`
								: undefined}
							oninput={updateNativeLanguageQuery}
							onfocus={() => {
								nativeLanguageQuery = '';
								nativeLanguageMenuOpen = true;
								activeNativeLanguageIndex = -1;
							}}
							onblur={closeNativeLanguageMenu}
							onkeydown={handleNativeLanguageKeydown}
						/>
						{#if nativeLanguageMenuOpen}
							<div id="native-language-listbox" class="native-language-options" role="listbox">
								{#if filteredNativeLanguages.length}
									{#each filteredNativeLanguages as language, index}
										<button
											id={`native-language-option-${index}`}
											type="button"
											role="option"
											aria-selected={language.code === nativeLanguage}
											class:active={index === activeNativeLanguageIndex}
											onmousedown={(event) => event.preventDefault()}
											onclick={() => chooseNativeLanguage(language.code)}>{language.label}</button
										>
									{/each}
								{:else}
									<p>No matching languages.</p>
								{/if}
							</div>
						{/if}
					</div></label
				><label><span>Email address</span><input value={user.email} readonly dir="ltr" /></label
				>{#if profileMessage}<p class:error={profileState === 'error'}>
						{#if profileState === 'success'}<Check size={14} />{/if}{profileMessage}
					</p>{/if}<Button
					type="submit"
					disabled={profileState === 'busy' ||
						(name.trim() === savedName && nativeLanguage === savedNativeLanguage)}
					><Save data-icon="inline-start" />{profileState === 'busy'
						? 'Saving…'
						: 'Save profile'}</Button
				>
			</form>
		</section>
		<section>
			<div class="section-heading">
				<div>
					<h2>Password</h2>
					<p>Changing it signs out your other sessions.</p>
				</div>
				<KeyRound size={18} />
			</div>
			<form onsubmit={changePassword}>
				<label
					><span>Current password</span><input
						bind:value={currentPassword}
						type="password"
						autocomplete="current-password"
						required
					/></label
				><label
					><span>New password</span><input
						bind:value={newPassword}
						type="password"
						autocomplete="new-password"
						minlength="6"
						required
					/></label
				><label
					><span>Confirm new password</span><input
						bind:value={confirmPassword}
						type="password"
						autocomplete="new-password"
						minlength="6"
						required
					/></label
				>{#if passwordMessage}<p class:error={passwordState === 'error'}>
						{#if passwordState === 'success'}<Check size={14} />{/if}{passwordMessage}
					</p>{/if}<Button type="submit" disabled={passwordState === 'busy'}
					>{passwordState === 'busy' ? 'Updating…' : 'Change password'}</Button
				>
			</form>
		</section>
		<section class="ai-key-settings">
			<div class="section-heading">
				<div>
					<h2>AI key manager</h2>
					<p>Add connections and assign one to each AI feature.</p>
				</div>
				<div class="ai-heading-actions">
					<Button type="button" variant="outline" onclick={openNewAiConnection}
						>Add connection</Button
					>
					<Sparkles size={18} />
				</div>
			</div>
			{#if connections.length}
				<div class="connection-assignments">
					<div class="connection-assignment">
						<div>
							<label for="ai-assistant-connection">AI assistant</label>
							<p>Used for chat and course explanations.</p>
						</div>
						<div class="assistant-combobox">
							<input
								id="ai-assistant-connection"
								value={aiAssistantQuery}
								placeholder="Search connections"
								disabled={aiKeyState === 'busy'}
								role="combobox"
								aria-autocomplete="list"
								aria-controls="ai-assistant-connection-listbox"
								aria-expanded={aiAssistantMenuOpen}
								aria-activedescendant={activeAiAssistantIndex >= 0
									? `ai-assistant-connection-option-${activeAiAssistantIndex}`
									: undefined}
								oninput={updateAiAssistantQuery}
								onfocus={() => {
									aiAssistantQuery = '';
									aiAssistantMenuOpen = true;
									activeAiAssistantIndex = -1;
								}}
								onblur={closeAiAssistantMenu}
								onkeydown={handleAiAssistantKeydown}
							/>
							{#if aiAssistantMenuOpen}
								<div id="ai-assistant-connection-listbox" class="assistant-options" role="listbox">
									{#if filteredAiAssistantConnections.length}
										{#each filteredAiAssistantConnections as connection, index}
											<button
												id={`ai-assistant-connection-option-${index}`}
												type="button"
												role="option"
												aria-selected={connection.id === assistantConnectionId}
												class:active={index === activeAiAssistantIndex}
												onmousedown={(event) => event.preventDefault()}
												onclick={() => chooseAiAssistantConnection(connection.id)}
												>{connectionOptionLabel(connection)}</button
											>
										{/each}
									{:else}
										<p>No matching connections.</p>
									{/if}
								</div>
							{/if}
						</div>
					</div>
					<div class="connection-assignment">
						<div>
							<label for="free-chat-connection">Free chat model</label>
							<p>Used only on <code>/chat</code>; each saved connection supplies its own model.</p>
						</div>
						<div class="free-chat-connection-combobox">
							<input
								id="free-chat-connection"
								value={freeChatConnectionQuery}
								placeholder="Search connections"
								disabled={freeChatConnectionState === 'busy'}
								role="combobox"
								aria-autocomplete="list"
								aria-controls="free-chat-connection-listbox"
								aria-expanded={freeChatConnectionMenuOpen}
								aria-activedescendant={activeFreeChatConnectionIndex >= 0
									? `free-chat-connection-option-${activeFreeChatConnectionIndex}`
									: undefined}
								oninput={updateFreeChatConnectionQuery}
								onfocus={() => {
									freeChatConnectionQuery = '';
									freeChatConnectionMenuOpen = true;
									activeFreeChatConnectionIndex = -1;
								}}
								onblur={closeFreeChatConnectionMenu}
								onkeydown={handleFreeChatConnectionKeydown}
							/>
							{#if freeChatConnectionMenuOpen}
								<div
									id="free-chat-connection-listbox"
									class="free-chat-connection-options"
									role="listbox"
								>
									{#if filteredFreeChatConnections.length}
										{#each filteredFreeChatConnections as connection, index}
											<button
												id={`free-chat-connection-option-${index}`}
												type="button"
												role="option"
												aria-selected={connection.id === freeChatConnectionId}
												class:active={index === activeFreeChatConnectionIndex}
												onmousedown={(event) => event.preventDefault()}
												onclick={() => void chooseFreeChatConnection(connection.id)}
												>{connectionOptionLabel(connection)}</button
											>
										{/each}
									{:else}
										<p>No matching connections.</p>
									{/if}
								</div>
							{/if}
						</div>
					</div>
					{#if user.role !== 'student'}
						<div class="connection-assignment">
							<div>
								<label for="translation-connection">Course translation model</label>
								<p>Used by AI translation in the course authoring workspace.</p>
							</div>
							<select
								id="translation-connection"
								class="connection-select"
								value={translationConnectionId}
								disabled={translationConnectionState === 'busy'}
								onchange={(event) => void chooseTranslationConnection(event.currentTarget.value)}
							>
								<option value="">Use AI assistant model</option>
								{#each connections as connection (connection.id)}
									<option value={connection.id}>{connectionOptionLabel(connection)}</option>
								{/each}
							</select>
						</div>
					{/if}
					{#if freeChatConnectionMessage}<p
							class="free-chat-connection-message"
							class:error={freeChatConnectionState === 'error'}
						>
							{#if freeChatConnectionState === 'success'}<Check
									size={14}
								/>{/if}{freeChatConnectionMessage}
						</p>{/if}
					{#if user.role !== 'student' && translationConnectionMessage}<p
							class="translation-connection-message"
							class:error={translationConnectionState === 'error'}
						>
							{#if translationConnectionState === 'success'}<Check
									size={14}
								/>{/if}{translationConnectionMessage}
						</p>{/if}
				</div>
				<div class="connection-list">
					{#each connections as connection}
						<article class:assistant-connection={connection.isAssistant}>
							<div class="connection-summary">
								<div>
									<h3>{connection.label}</h3>
									<p>{connection.provider} · {connection.model}</p>
									<small dir="ltr">{connection.baseUrl}</small>
								</div>
								<div class="connection-badges">
									{#if connection.isAssistant}<Badge variant="secondary">AI assistant</Badge>{/if}
									{#if user.role !== 'student' && connection.id === translationConnectionId}<Badge
											variant="secondary">Translations</Badge
										>{/if}
								</div>
							</div>
							<div class="connection-actions">
								<Button type="button" variant="outline" onclick={() => editAiConnection(connection)}
									>Edit</Button
								>
								<Button
									type="button"
									variant="outline"
									disabled={aiKeyState === 'busy'}
									onclick={() => void deleteAiConnection(connection)}
									><Trash2 data-icon="inline-start" />Remove</Button
								>
							</div>
						</article>
					{/each}
				</div>
			{/if}
			{#if aiKeyMessage}<p class="ai-key-message" class:error={aiKeyState === 'error'}>
					{#if aiKeyState === 'success'}<Check size={14} />{/if}{aiKeyMessage}
				</p>{/if}
			<Dialog.Root
				open={aiDialogOpen}
				onOpenChange={(open) => {
					if (!open) closeAiDialog();
					else aiDialogOpen = true;
				}}
			>
				<Dialog.Portal>
					<Dialog.Overlay class="fixed inset-0 z-[100] bg-black/30 backdrop-blur-sm" />
					<Dialog.Content
						class="fixed inset-x-0 top-1/2 z-[101] mx-auto grid -translate-y-1/2 overflow-y-auto rounded-2xl border bg-background p-6 shadow-xl focus:outline-none"
						style="inline-size: min(38rem, calc(100% - 2rem)); max-block-size: calc(100dvh - 2rem)"
					>
						<Dialog.Title class="text-lg font-semibold"
							>{editingConnectionId ? 'Edit AI connection' : 'Add AI connection'}</Dialog.Title
						>
						<Dialog.Description class="mt-1 text-sm text-muted-foreground">
							Configure an OpenAI-compatible endpoint. Keys are encrypted before storage.
						</Dialog.Description>
						<form onsubmit={saveAiConnection}>
							<label
								><span>Connection name</span><input
									bind:value={aiLabel}
									placeholder="My OpenAI key"
									maxlength="80"
									required
								/></label
							>
							<label
								><span>Provider</span><select bind:value={aiProvider}>
									<option value="openai-compatible">OpenAI Compatible</option>
								</select></label
							>
							<label
								><span>Base URL</span><input
									bind:value={aiBaseUrl}
									type="url"
									placeholder="https://api.openai.com/v1"
									dir="ltr"
									required
								/></label
							>
							<label
								><span>API key</span><input
									bind:value={aiApiKey}
									type="password"
									autocomplete="off"
									placeholder={editingConnectionId
										? 'Leave blank to keep the saved key'
										: 'Paste your personal key'}
									dir="ltr"
									required={!editingConnectionId}
								/></label
							>
							<div class="model-action">
								<span>Model name</span>
								<Button
									type="button"
									variant="outline"
									disabled={loadingAiModels || !aiBaseUrl.trim()}
									onclick={() => void loadAiModels()}
									>{loadingAiModels ? 'Loading modelsâ€¦' : 'Load models'}</Button
								>
							</div>
							<label
								><span>Search and select model</span>
								<div class="model-combobox">
									<input
										value={aiModelQuery}
										placeholder={aiModelOptions.length ? 'Search models' : 'Load models first'}
										disabled={!aiModelOptions.length}
										dir="ltr"
										required
										role="combobox"
										aria-autocomplete="list"
										aria-controls="ai-model-listbox"
										aria-expanded={aiModelMenuOpen}
										aria-activedescendant={activeAiModelIndex >= 0
											? `ai-model-option-${activeAiModelIndex}`
											: undefined}
										oninput={updateAiModelQuery}
										onfocus={() => {
											aiModelMenuOpen = true;
											activeAiModelIndex = -1;
										}}
										onblur={() => {
											aiModelMenuOpen = false;
											activeAiModelIndex = -1;
										}}
										onkeydown={handleAiModelKeydown}
									/>
									{#if aiModelMenuOpen && aiModelOptions.length}
										<div id="ai-model-listbox" class="model-options" role="listbox">
											{#if filteredAiModels.length}
												{#each filteredAiModels as model, index}
													<button
														id={`ai-model-option-${index}`}
														type="button"
														role="option"
														aria-selected={model === aiModel}
														class:active={index === activeAiModelIndex}
														onmousedown={(event) => event.preventDefault()}
														onclick={() => selectAiModel(model)}>{model}</button
													>
												{/each}
											{:else}
												<p>No matching models.</p>
											{/if}
										</div>
									{/if}
								</div></label
							>
							{#if aiModelsError}<p class="error">{aiModelsError}</p>{/if}
							<p class="key-help">
								Use the API root that exposes <code>/models</code> and
								<code>/chat/completions</code>. Your key is encrypted before storage and is never
								shown again.
							</p>
							<div class="key-actions">
								<Button
									type="submit"
									disabled={aiKeyState === 'busy' ||
										!aiLabel.trim() ||
										!aiBaseUrl.trim() ||
										!aiModel.trim() ||
										(!editingConnectionId && !aiApiKey.trim())}
									><Save data-icon="inline-start" />{aiKeyState === 'busy'
										? 'Saving…'
										: editingConnectionId
											? 'Update connection'
											: 'Add connection'}</Button
								>
								<Button type="button" variant="outline" onclick={closeAiDialog}>Cancel</Button>
							</div>
						</form>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>
		</section>
		<VoiceChatSettings preferences={voiceChatPreferences} {connections} />
	</div>
</div>

<style>
	.account-page {
		display: grid;
		gap: 1.4rem;
		inline-size: min(100%, 64rem);
		margin-inline: auto;
	}
	.account-page > header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.account-page > header > span {
		display: grid;
		inline-size: 2.7rem;
		block-size: 2.7rem;
		place-items: center;
		border-radius: 0.8rem;
		background: var(--editor-selection-soft);
		color: var(--editor-selection);
	}
	header p,
	header h1,
	header small,
	h2,
	.section-heading p,
	form p {
		margin: 0;
	}
	header p {
		color: var(--editor-selection);
		font-size: 0.62rem;
		font-weight: 760;
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}
	header h1 {
		font-size: clamp(1.5rem, 3vw, 2.1rem);
		letter-spacing: -0.04em;
	}
	header small {
		color: var(--muted-foreground);
		font-size: 0.72rem;
	}
	.settings-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.9rem;
	}
	section {
		border: 0.0625rem solid var(--border);
		border-radius: 1rem;
		padding: clamp(1rem, 2.5vw, 1.4rem);
		background: color-mix(in oklab, var(--card) 96%, transparent);
	}
	.section-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.8rem;
	}
	h2 {
		font-size: 1rem;
	}
	.section-heading p {
		margin-block-start: 0.2rem;
		color: var(--muted-foreground);
		font-size: 0.67rem;
	}
	.ai-heading-actions {
		display: flex;
		align-items: center;
		gap: 0.65rem;
	}
	form,
	label {
		display: grid;
	}
	form {
		gap: 0.85rem;
		margin-block-start: 1.2rem;
	}
	label {
		gap: 0.38rem;
		color: var(--foreground);
		font-size: 0.7rem;
		font-weight: 650;
	}
	input,
	select {
		min-block-size: 2.55rem;
		border: 0.0625rem solid var(--input);
		border-radius: 0.7rem;
		padding-inline: 0.75rem;
		background: var(--background);
		color: var(--foreground);
		font: inherit;
		outline: none;
	}
	input:read-only {
		background: var(--muted);
		color: var(--muted-foreground);
	}
	input:focus:not(:read-only),
	select:focus {
		border-color: var(--editor-selection);
		box-shadow: 0 0 0 0.2rem var(--editor-selection-soft);
	}
	form p {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		border-radius: 0.6rem;
		padding: 0.6rem;
		background: #eaf3ec;
		color: #4f795f;
		font-size: 0.68rem;
	}
	form p.error {
		background: color-mix(in oklab, var(--destructive) 10%, transparent);
		color: var(--destructive);
	}
	form :global([data-slot='button']) {
		justify-self: end;
	}
	.ai-key-settings {
		grid-column: 1 / -1;
	}
	.connection-assignments {
		display: grid;
		gap: 0.75rem;
		margin-block-start: 1rem;
		border: 0.0625rem solid var(--border);
		border-radius: 0.8rem;
		padding: 0.85rem;
		background: color-mix(in oklab, var(--muted) 60%, transparent);
	}
	.connection-assignment {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(12rem, 20rem);
		align-items: center;
		gap: 1rem;
	}
	.connection-assignment label {
		display: block;
		font-size: 0.72rem;
	}
	.connection-assignment p {
		margin: 0.25rem 0 0;
		color: var(--muted-foreground);
		font-size: 0.65rem;
	}
	.connection-select {
		inline-size: 100%;
	}
	.connection-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		gap: 0.65rem;
		margin-block-start: 1rem;
	}
	.connection-list article {
		display: grid;
		gap: 0.8rem;
		border: 0.0625rem solid var(--border);
		border-radius: 0.8rem;
		padding: 0.85rem;
		background: var(--background);
	}
	.connection-list article.assistant-connection {
		border-color: var(--editor-selection);
		box-shadow: 0 0 0 0.125rem var(--editor-selection-soft);
	}
	.connection-summary {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.6rem;
	}
	.connection-badges {
		display: flex;
		flex: 0 0 auto;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.3rem;
	}
	.connection-summary h3,
	.connection-summary p,
	.connection-summary small {
		margin: 0;
	}
	.connection-summary h3 {
		font-size: 0.82rem;
	}
	.connection-summary p,
	.connection-summary small {
		display: block;
		margin-block-start: 0.25rem;
		color: var(--muted-foreground);
		font-size: 0.64rem;
		line-height: 1.35;
		word-break: break-all;
	}
	.connection-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.4rem;
	}
	.connection-actions :global([data-slot='button']) {
		justify-self: auto;
	}
	.ai-key-message,
	.free-chat-connection-message,
	.translation-connection-message {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin: 1rem 0 0;
		border-radius: 0.6rem;
		padding: 0.6rem;
		background: #eaf3ec;
		color: #4f795f;
		font-size: 0.68rem;
	}
	.ai-key-message.error,
	.free-chat-connection-message.error,
	.translation-connection-message.error {
		background: color-mix(in oklab, var(--destructive) 10%, transparent);
		color: var(--destructive);
	}
	.key-help {
		border: 0;
		padding: 0;
		background: transparent;
		color: var(--muted-foreground);
		line-height: 1.45;
	}
	.model-action {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		font-size: 0.7rem;
		font-weight: 650;
	}
	.model-action :global([data-slot='button']) {
		justify-self: auto;
	}
	.model-combobox,
	.assistant-combobox,
	.native-language-combobox,
	.free-chat-connection-combobox {
		position: relative;
	}
	.model-combobox input,
	.assistant-combobox input,
	.native-language-combobox input,
	.free-chat-connection-combobox input {
		inline-size: 100%;
	}
	.model-options,
	.assistant-options,
	.native-language-options,
	.free-chat-connection-options {
		position: absolute;
		z-index: 10;
		inset-block-start: calc(100% + 0.3rem);
		inset-inline: 0;
		max-block-size: 14rem;
		overflow-y: auto;
		border: 0.0625rem solid var(--border);
		border-radius: 0.7rem;
		padding: 0.3rem;
		background: var(--popover);
		box-shadow: 0 0.75rem 1.5rem rgb(0 0 0 / 0.12);
	}
	.model-options button,
	.assistant-options button,
	.native-language-options button,
	.free-chat-connection-options button {
		display: block;
		inline-size: 100%;
		border: 0;
		border-radius: 0.45rem;
		padding: 0.5rem 0.6rem;
		background: transparent;
		color: var(--foreground);
		text-align: start;
		font: inherit;
		font-size: 0.72rem;
		cursor: pointer;
	}
	.model-options button:hover,
	.model-options button.active,
	.assistant-options button:hover,
	.assistant-options button.active,
	.native-language-options button:hover,
	.native-language-options button.active,
	.free-chat-connection-options button:hover,
	.free-chat-connection-options button.active {
		background: var(--accent);
		color: var(--accent-foreground);
	}
	.model-options p,
	.assistant-options p,
	.native-language-options p,
	.free-chat-connection-options p {
		padding: 0.5rem 0.6rem;
		background: transparent;
		color: var(--muted-foreground);
	}
	.key-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.45rem;
	}
	.key-actions :global([data-slot='button']) {
		justify-self: auto;
	}
	@media (max-width: 44rem) {
		.settings-grid {
			grid-template-columns: 1fr;
		}
		.connection-assignment {
			grid-template-columns: 1fr;
		}
	}
</style>
