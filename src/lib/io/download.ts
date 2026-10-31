/** Save files: File System Access API when available (streamed), anchor download otherwise (DP-2). */

interface SavePickerWindow {
	showSaveFilePicker?: (opts: {
		suggestedName: string;
		types?: Array<{ description: string; accept: Record<string, string[]> }>;
	}) => Promise<{
		createWritable: () => Promise<{ write: (data: string | Blob) => Promise<void>; close: () => Promise<void> }>;
	}>;
}

export async function saveChunks(name: string, mime: string, chunks: AsyncIterable<string> | Iterable<string>): Promise<boolean> {
	const w = window as unknown as SavePickerWindow;
	if (w.showSaveFilePicker) {
		let handle;
		try {
			const ext = name.slice(name.lastIndexOf('.'));
			handle = await w.showSaveFilePicker({ suggestedName: name, types: [{ description: name, accept: { [mime]: [ext] } }] });
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return false;
			handle = null;
		}
		if (handle) {
			const writable = await handle.createWritable();
			for await (const c of chunks) await writable.write(c);
			await writable.close();
			return true;
		}
	}
	const parts: string[] = [];
	for await (const c of chunks) parts.push(c);
	saveBlob(name, new Blob(parts, { type: mime }));
	return true;
}

export function saveBlob(name: string, blob: Blob): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function saveText(name: string, text: string, mime = 'text/plain'): void {
	saveBlob(name, new Blob([text], { type: `${mime};charset=utf-8` }));
}

export function safeFileName(name: string): string {
	return (
		name
			.replace(/[\\/:*?"<>|]+/g, '_')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 80) || 'export'
	);
}
