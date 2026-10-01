<script lang="ts">
	let {
		samples,
		progress = 0,
		color = '#beb3c9',
		playedColor = '#695085'
	}: {
		samples: readonly number[];
		progress?: number;
		color?: string;
		playedColor?: string;
	} = $props();
</script>

<svg
	class="waveform"
	viewBox={`0 0 ${Math.max(1, samples.length) * 5} 40`}
	preserveAspectRatio="none"
	aria-hidden="true"
>
	{#each samples as sample, index (index)}
		{@const amplitude = Math.max(0.08, Math.min(1, Number.isFinite(sample) ? sample : 0)) * 36}
		<rect
			x={index * 5 + 1}
			y={(40 - amplitude) / 2}
			width="2.5"
			height={amplitude}
			rx="1.25"
			fill={index / samples.length < progress ? playedColor : color}
		/>
	{/each}
</svg>

<style>
	.waveform {
		display: block;
		inline-size: 100%;
		block-size: 100%;
	}
</style>
