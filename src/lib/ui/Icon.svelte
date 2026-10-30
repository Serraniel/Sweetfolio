<script lang="ts">
	import { ICONS, type IconName } from './icons.ts';

	let { name, size = 18, stroke = 2, class: cls = '' }: { name: IconName; size?: number; stroke?: number; class?: string } = $props();
</script>

<svg
	class="icon {cls}"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<path d={ICONS[name]} />
</svg>

<style>
	.icon {
		flex-shrink: 0;
	}
</style>
