<script lang="ts">
	import { X } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import MediaPicker from './MediaPicker.svelte';
	import type { MediaPickerFolder, MediaPickerItem } from './model';

	type MediaPickerDialogProps = {
		open: boolean;
		items: readonly MediaPickerItem[];
		folders?: readonly MediaPickerFolder[];
		selectedId?: string | null;
		onSelect: (id: string) => void;
		onClose: () => void;
		title?: string;
		description?: string;
		pickerLabel?: string;
		searchPlaceholder?: string;
		emptyMessage?: string;
		closeOnSelect?: boolean;
		disabled?: boolean;
	};

	let {
		open,
		items,
		folders = [],
		selectedId = null,
		onSelect,
		onClose,
		title = 'Select media',
		description = 'Choose a media item to continue.',
		pickerLabel = 'Available media',
		searchPlaceholder = 'Search media',
		emptyMessage = 'No media matches your search.',
		closeOnSelect = true,
		disabled = false
	}: MediaPickerDialogProps = $props();

	function select(id: string) {
		onSelect(id);
		if (closeOnSelect) onClose();
	}

	function keydown(event: KeyboardEvent) {
		if (open && event.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={keydown} />

{#if open}
	<div
		class="media-picker-backdrop"
		role="presentation"
		onclick={(event) => event.target === event.currentTarget && onClose()}
	>
		<div class="media-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="media-picker-dialog-title" tabindex="-1">
			<header>
				<div><h2 id="media-picker-dialog-title">{title}</h2><p>{description}</p></div>
				<Button type="button" variant="ghost" size="icon-sm" aria-label="Close media picker" onclick={onClose}><X /></Button>
			</header>
			<div class="picker-body">
				<MediaPicker
					{items}
					{folders}
					{selectedId}
					onSelect={select}
					label={pickerLabel}
					{searchPlaceholder}
					{emptyMessage}
					{disabled}
				/>
			</div>
		</div>
	</div>
{/if}

<style>
	.media-picker-backdrop { position: fixed; z-index: 130; inset: 0; display: grid; place-items: center; padding: 1rem; background: color-mix(in oklab, #17141e 52%, transparent); backdrop-filter: blur(0.3rem); }
	.media-picker-dialog { inline-size: min(100%, 45rem); max-block-size: min(38rem, calc(100svh - 2rem)); overflow: auto; border: 0.0625rem solid var(--border); border-radius: 0.9rem; background: var(--background); box-shadow: 0 2rem 5rem -2rem #111018b8; }
	.media-picker-dialog > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; border-block-end: 0.0625rem solid var(--border); padding: 0.95rem 1rem; }
	.media-picker-dialog h2, .media-picker-dialog p { margin: 0; }
	.media-picker-dialog h2 { font-size: 1rem; letter-spacing: -0.02em; }
	.media-picker-dialog p { margin-block-start: 0.15rem; color: var(--muted-foreground); font-size: 0.68rem; line-height: 1.45; }
	.picker-body { padding: 0.9rem 1rem 1rem; }
	@media (max-width: 32rem) { .media-picker-backdrop { align-items: end; padding: 0; } .media-picker-dialog { max-block-size: 92svh; border-end-end-radius: 0; border-end-start-radius: 0; } .media-picker-dialog > header { padding: 0.8rem 0.75rem; } .picker-body { padding: 0.75rem; } }
</style>
