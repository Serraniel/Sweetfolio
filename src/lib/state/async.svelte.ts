/**
 * Reactive async value for component scripts: re-runs when dependencies read
 * inside `fn` change; stale results are discarded.
 */
export function asyncDerived<T>(fn: () => Promise<T> | null) {
	const state = $state<{ value: T | null; loading: boolean; error: string | null }>({ value: null, loading: false, error: null });
	let token = 0;
	$effect(() => {
		const p = fn();
		const mine = ++token;
		if (!p) {
			state.value = null;
			state.loading = false;
			return;
		}
		state.loading = true;
		state.error = null;
		p.then(
			(v) => {
				if (mine !== token) return;
				state.value = v as T;
				state.loading = false;
			},
			(err) => {
				if (mine !== token) return;
				state.error = err instanceof Error ? err.message : String(err);
				state.loading = false;
			}
		);
	});
	return state;
}
