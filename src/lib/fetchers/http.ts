/** fetch with timeout and readable errors (SC-4). */

export class HttpError extends Error {
	constructor(
		message: string,
		readonly status: number | null
	) {
		super(message);
		this.name = 'HttpError';
	}
}

export interface RequestOptions extends RequestInit {
	timeoutMs?: number;
}

export async function request(url: string, options: RequestOptions = {}): Promise<Response> {
	const { timeoutMs = 20_000, signal, ...init } = options;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs);
	const onAbort = () => controller.abort(signal?.reason);
	signal?.addEventListener('abort', onAbort, { once: true });
	try {
		const res = await fetch(url, { ...init, signal: controller.signal });
		if (!res.ok) throw new HttpError(`${new URL(url).host} responded with ${res.status} ${res.statusText}`.trim(), res.status);
		return res;
	} catch (err) {
		if (err instanceof HttpError) throw err;
		if (controller.signal.aborted && !signal?.aborted) throw new HttpError(`${new URL(url).host} did not respond in time`, null);
		if (signal?.aborted) throw err;
		throw new HttpError(`Could not reach ${new URL(url).host} (network or CORS error)`, null);
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener('abort', onAbort);
	}
}

export async function getJSON<T>(url: string, options?: RequestOptions): Promise<T> {
	return (await request(url, options)).json() as Promise<T>;
}

export async function getText(url: string, options?: RequestOptions): Promise<string> {
	return (await request(url, options)).text();
}

/** Prefix a URL with a user-configured CORS proxy (`https://proxy.example/` + url). */
export function viaProxy(url: string, proxy?: string): string {
	if (!proxy) return url;
	if (proxy.includes('{url}')) return proxy.replace('{url}', encodeURIComponent(url));
	return (proxy.endsWith('/') ? proxy : `${proxy}/`) + url;
}
