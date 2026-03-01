import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const envVersion = process.env.APP_VERSION?.replace(/^v/, '');

function getGitTagVersion(): string | undefined {
	try {
		return execFileSync('git', ['describe', '--tags', '--abbrev=0'], { encoding: 'utf-8' })
			.trim()
			.replace(/^v/, '');
	} catch {
		return undefined;
	}
}

const appVersion = envVersion || getGitTagVersion() || pkg.version;

export default defineConfig({
	plugins: [sveltekit()],
	define: {
		__APP_VERSION__: JSON.stringify(appVersion)
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
