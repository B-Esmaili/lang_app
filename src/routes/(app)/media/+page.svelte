<script lang="ts">
	import { MediaManagerPage } from '$lib/features/media-manager';
	let { data } = $props();
</script>

<svelte:head><title>Media manager · Learning studio</title></svelte:head>
<MediaManagerPage initialLibrary={data.mediaLibrary} />
