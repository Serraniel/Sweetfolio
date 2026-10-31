/** URL slugs from names, unique within a collection (AM-11). */

export function slugify(text: string): string {
	return (
		text
			.normalize('NFKD')
			.replace(/[̀-ͯ]/g, '')
			.replace(/ß/g, 'ss')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'item'
	);
}

/**
 * Map id → slug. The oldest item with a given base slug keeps it, later ones get
 * a short id suffix. Unique slugs are stable as long as names don't change.
 */
export function buildSlugs<T extends { id: string; name: string; createdAt?: string }>(items: readonly T[]): Map<string, string> {
	const sorted = [...items].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id));
	const used = new Set<string>();
	const out = new Map<string, string>();
	for (const item of sorted) {
		const base = slugify(item.name);
		let slug = base;
		if (used.has(slug))
			slug = `${base}-${item.id
				.replace(/[^a-z0-9]/gi, '')
				.slice(0, 6)
				.toLowerCase()}`;
		let n = 2;
		while (used.has(slug)) slug = `${base}-${n++}`;
		used.add(slug);
		out.set(item.id, slug);
	}
	return out;
}

/** Find an item by slug, falling back to its id (old links, AM-11). */
export function findBySlug<T extends { id: string }>(items: readonly T[], slugs: Map<string, string>, slug: string): T | undefined {
	return items.find((i) => slugs.get(i.id) === slug) ?? items.find((i) => i.id === slug);
}
