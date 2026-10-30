import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

function gitTagVersion(): string | undefined {
	try {
		return execFileSync('git', ['describe', '--tags', '--abbrev=0'], { encoding: 'utf-8' }).trim();
	} catch {
		return undefined;
	}
}

const appVersion = (process.env.APP_VERSION || gitTagVersion() || pkg.version).replace(/^v/, '');

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({ fallback: 'index.html', precompress: false }),
			version: { name: appVersion }
		})
	],
	define: {
		__APP_VERSION__: JSON.stringify(appVersion)
	},
	worker: {
		format: 'es'
	},
	test: {
		include: ['src/**/*.test.ts', 'tools/*/src/**/*.test.ts'],
		environment: 'node',
		setupFiles: ['src/test/setup.ts']
	}
});
