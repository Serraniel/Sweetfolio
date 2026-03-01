import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const envVersion = process.env.APP_VERSION?.replace(/^v/, '');

export default defineConfig({
	plugins: [sveltekit()],
	define: {
		__APP_VERSION__: JSON.stringify(envVersion || pkg.version)
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
