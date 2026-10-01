// Vite must resolve the same Svelte runtime for mounting and compiled components.
import { mount, type ComponentProps } from 'svelte';
import VoiceChat from '../src/lib/features/voice-chat/VoiceChat.svelte';
import VoiceChatSettings from '../src/lib/features/voice-chat/VoiceChatSettings.svelte';

export function mountComponent(name: string, props: Record<string, unknown>) {
	const target = document.createElement('section');
	target.id = 'voice-harness';
	document.body.prepend(target);
	if (name === 'VoiceChat')
		return mount(VoiceChat, { target, props: props as ComponentProps<typeof VoiceChat> });
	if (name === 'VoiceChatSettings')
		return mount(VoiceChatSettings, {
			target,
			props: props as ComponentProps<typeof VoiceChatSettings>
		});
	throw new Error(`Unknown voice chat test component: ${name}`);
}
