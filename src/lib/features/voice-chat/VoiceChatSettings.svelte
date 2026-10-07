<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { Mic, Save, Volume2, Square } from '@lucide/svelte';
	import { resolve } from '$app/paths';
	import { createSpeechEngine, speakWith, VoicePlayback, type SpeechEngine } from './tts-engine';
	import {
		desktopTtsLabel,
		desktopVoices,
		getDesktopTts,
		resolveDesktopVoice
	} from './desktop-tts-engine';
	import { VOICE_AGE_GROUPS, VOICE_CHAT_VOICES, type VoiceChatPreferences } from './voices';

	let {
		preferences,
		connections
	}: {
		preferences: VoiceChatPreferences;
		connections: readonly { id: string; label: string; model?: string; isAssistant: boolean }[];
	} = $props();
	let connectionId = $state(untrack(() => preferences.connectionId ?? ''));
	let voiceId = $state(untrack(() => preferences.voiceId));
	let desktopVoiceId = $state<string>(untrack(() => preferences.desktopVoiceId));
	let saving = $state(false);
	let previewing = $state(false);
	let message = $state('');
	let error = $state('');
	let previewStatus = $state('');
	let speaker: SpeechEngine | null = null;
	// Set after mount: SSR and ordinary browsers have no desktop host.
	let desktopGroups = $state<{ label: string; voices: { id: string; label: string }[] }[] | null>(
		null
	);
	onMount(() => {
		const native = getDesktopTts();
		if (!native) return;
		const voices = desktopVoices(native);
		desktopVoiceId = resolveDesktopVoice(native, desktopVoiceId);
		desktopGroups = VOICE_AGE_GROUPS.map((group) => ({
			label: group.label,
			voices: voices.filter((voice) => voice.age === group.id)
		})).filter((group) => group.voices.length > 0);
	});
	let playback: VoicePlayback | null = null;
	let generation = 0;
	let saveController: AbortController | null = null;

	$effect(() => {
		if (connectionId && !connections.some((connection) => connection.id === connectionId))
			connectionId = '';
	});
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (saving) return;
		saving = true;
		message = '';
		error = '';
		const controller = new AbortController();
		saveController = controller;
		try {
			const response = await fetch(resolve('/api/account/voice-chat'), {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				signal: controller.signal,
				body: JSON.stringify({ connectionId: connectionId || null, voiceId, desktopVoiceId })
			});
			const value = await response.json();
			if (!response.ok) throw new Error(value.error ?? 'Could not save voice chat settings.');
			message = 'Voice chat settings saved. They apply to your next conversation.';
		} catch (cause) {
			if (!controller.signal.aborted)
				error = cause instanceof Error ? cause.message : 'Could not save voice chat settings.';
		} finally {
			if (saveController === controller) {
				saving = false;
				saveController = null;
			}
		}
	}
	function stopPreview() {
		generation++;
		speaker?.dispose();
		speaker = null;
		playback?.dispose();
		playback = null;
		previewing = false;
		previewStatus = '';
	}
	async function preview() {
		stopPreview();
		const run = generation;
		previewing = true;
		error = '';
		previewStatus = 'Preparing speaker preview…';
		try {
			playback = new VoicePlayback();
			await playback.unlock();
			if (run !== generation) return;
			// Streaming hosts keep generating after playback starts; keep the playing status.
			let playing = false;
			speaker = createSpeechEngine((status) => {
				if (run === generation && !playing) previewStatus = status.message;
			});
			await speakWith(
				speaker,
				playback,
				'Hello! I am your English conversation partner. What would you like to talk about today?',
				desktopGroups ? desktopVoiceId : voiceId,
				{
					onProgress: () => {
						if (run !== generation || playing) return;
						playing = true;
						previewStatus = 'Playing speaker preview…';
					},
					current: () => run === generation
				}
			);
		} catch (cause) {
			if (run === generation)
				error = cause instanceof Error ? cause.message : 'Could not preview this speaker.';
		} finally {
			if (run === generation) stopPreview();
		}
	}
	onDestroy(() => {
		saveController?.abort();
		stopPreview();
	});
</script>

<section class="voice-settings" aria-labelledby="voice-chat-settings-title">
	<header>
		<div>
			<h2 id="voice-chat-settings-title">Voice chat</h2>
			<p>Your English conversation partner for lesson activities.</p>
		</div>
		<Mic size={19} />
	</header>
	<form onsubmit={save}>
		<label
			><span>Voice chat AI model</span><select bind:value={connectionId} disabled={saving}>
				<option value="">Use AI assistant model</option>
				{#each connections as connection (connection.id)}<option value={connection.id}
						>{connection.label}{connection.model ? ` · ${connection.model}` : ''}</option
					>{/each}
			</select></label
		>
		<p class="hint">Choose a saved AI connection above. Each connection supplies its own model.</p>
		{#if desktopGroups}
			<label
				><span>Speaker</span><select
					bind:value={desktopVoiceId}
					disabled={saving}
					onchange={stopPreview}
				>
					{#each desktopGroups as group (group.label)}<optgroup label={group.label}
							>{#each group.voices as voice (voice.id)}<option value={voice.id}
									>{voice.label}</option
								>{/each}</optgroup
						>{/each}
				</select></label
			>
			<p class="hint">
				Speaks locally with {desktopTtsLabel()} in the desktop app. Website visits keep their own browser
				speaker.
			</p>
		{:else}
			<label
				><span>Speaker</span><select bind:value={voiceId} disabled={saving} onchange={stopPreview}>
					{#each VOICE_CHAT_VOICES as voice (voice.id)}<option value={voice.id}
							>{voice.label}</option
						>{/each}
				</select></label
			>
			<p class="hint">The selected VITS voice downloads once and speaks on your device.</p>
		{/if}
		<p class="hint">
			Speech recognition uses your browser's speech service when available, which may process audio
			online. Local speech models provide a fallback. Only the transcript is sent to your AI model.
		</p>
		<div class="actions">
			<button type="submit" disabled={saving}
				><Save size={16} />{saving ? 'Saving…' : 'Save voice chat settings'}</button
			><button
				class="secondary"
				type="button"
				onclick={() => (previewing ? stopPreview() : void preview())}
				>{#if previewing}<Square size={16} />Stop preview{:else}<Volume2 size={16} />Preview speaker{/if}</button
			>
		</div>
		{#if previewStatus}<p class="hint" role="status">{previewStatus}</p>{/if}
		{#if message}<p class="message" role="status">{message}</p>{/if}
		{#if error}<p class="error" role="alert">{error}</p>{/if}
	</form>
</section>

<style>
	.voice-settings {
		grid-column: 1 / -1;
		border: 1px solid var(--border);
		border-radius: 1rem;
		padding: clamp(1rem, 2.5vw, 1.4rem);
		background: var(--card);
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: start;
		gap: 0.8rem;
	}
	h2 {
		margin: 0;
		font-size: 1rem;
	}
	header p {
		margin: 0.25rem 0 0;
		color: var(--muted-foreground);
		font-size: 0.78rem;
	}
	form {
		display: grid;
		gap: 0.8rem;
		margin-top: 1.1rem;
	}
	label {
		display: grid;
		gap: 0.4rem;
		font-size: 0.78rem;
		font-weight: 600;
	}
	select {
		width: 100%;
		min-width: 0;
		border: 1px solid var(--border);
		border-radius: 0.55rem;
		padding: 0.75rem;
		font: inherit;
		color: var(--foreground);
		background: var(--background);
	}
	.hint {
		margin: -0.3rem 0 0.2rem;
		font-size: 0.73rem;
		color: var(--muted-foreground);
		line-height: 1.65;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		min-height: 2.65rem;
		border: 1px solid var(--primary);
		border-radius: 0.6rem;
		padding: 0.65rem 0.9rem;
		background: var(--primary);
		color: var(--primary-foreground);
		font: inherit;
		font-size: 0.78rem;
		cursor: pointer;
	}
	button.secondary {
		background: var(--background);
		color: var(--foreground);
		border-color: var(--border);
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	button:focus-visible,
	select:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 3px;
	}
	.message,
	.error {
		margin: 0;
		font-size: 0.78rem;
	}
	.error {
		color: var(--destructive);
	}
</style>
