/** Tiny, safe Markdown renderer for CHANGELOG / notices (headings, lists, links, bold, code). */
function escape(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function inline(text: string): string {
	return escape(text)
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

export function render(md: string): string {
	const out: string[] = [];
	let inList = false;
	for (const raw of md.split(/\r?\n/)) {
		const line = raw.trimEnd();
		const h = /^(#{1,4})\s+(.*)$/.exec(line);
		const li = /^\s*[*-]\s+(.*)$/.exec(line);
		if (!li && inList) {
			out.push('</ul>');
			inList = false;
		}
		if (h) out.push(`<h${h[1]!.length + 1}>${inline(h[2]!)}</h${h[1]!.length + 1}>`);
		else if (li) {
			if (!inList) {
				out.push('<ul>');
				inList = true;
			}
			out.push(`<li>${inline(li[1]!)}</li>`);
		} else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
	}
	if (inList) out.push('</ul>');
	return out.join('\n');
}

export interface Release {
	version: string;
	date: string | null;
	body: string;
}

/** Split a release-please / semantic-release changelog into releases (UI-8). */
export function parseChangelog(md: string): Release[] {
	const releases: Release[] = [];
	let current: Release | null = null;
	for (const line of md.split(/\r?\n/)) {
		const m = /^#{1,3}\s+\[?v?(\d+\.\d+\.\d+[^\]\s]*)\]?(?:\([^)]*\))?\s*(?:\(?(\d{4}-\d{2}-\d{2})\)?)?/.exec(line);
		if (m) {
			current = { version: m[1]!, date: m[2] ?? null, body: '' };
			releases.push(current);
		} else if (current) current.body += `${line}\n`;
	}
	return releases.map((r) => ({ ...r, body: r.body.replace(/^#{3,4}\s/gm, '#### ') }));
}
