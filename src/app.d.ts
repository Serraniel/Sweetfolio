// See https://svelte.dev/docs/kit/types#app
// for information about these interfaces
declare const __APP_VERSION__: string;

declare module '*.md?raw' {
	const content: string;
	export default content;
}

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
