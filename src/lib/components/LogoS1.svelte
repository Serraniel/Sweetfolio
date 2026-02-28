<script lang="ts">
	let { size = 32 }: { size?: number } = $props();
	const id = `s1-${Math.random().toString(36).slice(2, 8)}`;
	const sPath = "M38 4 C30 2 22 3 18 8 C13 14 15 19 14 22 C13 25 8 28 0 30 C-6 32 -10 32 -14 32.5 L-14 37.5 C-10 37 -6 37 0 35 C8 33 14 30 16 26 C18 22 16 17 20 12 C24 6 31 7 38 9.5 Z";
</script>

<!-- S1: Base V1 + pink S-strand -->
<svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
	<defs>
		<linearGradient id="{id}-bg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
			<stop stop-color="#8dd0c4" /><stop offset="1" stop-color="#1a8a8a" />
		</linearGradient>
		<clipPath id="{id}-clip"><rect width="32" height="32" rx="8" /></clipPath>
		<mask id="{id}-mask">
			<rect width="64" height="64" x="-16" y="-16" fill="white" />
			<path d={sPath} fill="black" />
		</mask>
	</defs>
	<rect width="32" height="32" rx="8" fill="url(#{id}-bg)" />
	<g clip-path="url(#{id}-clip)">
		<g mask="url(#{id}-mask)">
			<path d="M-4 9 C2 7 8 8 14 5 C20 2 28 1 38 0 L38 2 C28 3 20 4 14 7 C8 10 2 9 -4 11 Z" fill="white" opacity="0.45" />
			<path d="M-4 12 C2 10 8 12 14 8 C20 4 28 3 38 2.5 L38 7 C28 7 20 9 14 13 C8 17 2 14 -4 16 Z" fill="white" opacity="0.85" />
			<path d="M-4 16.5 C2 15 8 17 14 13 C20 10 28 8 38 8 L38 10.5 C28 10.5 20 13 14 16 C8 19 2 17 -4 18.5 Z" fill="white" opacity="0.55" />
			<path d="M-4 30 C2 28 8 28 14 24 C20 20 28 16 38 13 L38 15.5 C28 18 20 23 14 27 C8 30 2 30 -4 32 Z" fill="white" opacity="0.55" />
			<path d="M-4 34 C2 32 8 33 14 28 C20 23 28 19 38 16 L38 20 C28 23 20 27 14 32 C8 36 2 35 -4 37 Z" fill="white" opacity="0.85" />
			<path d="M-4 38 C2 36 8 37 14 33 C20 28 28 24 38 22 L38 24 C28 26 20 30 14 35 C8 39 2 38 -4 40 Z" fill="white" opacity="0.45" />
		</g>
		<path d={sPath} fill="#e8175d" />
	</g>
</svg>
