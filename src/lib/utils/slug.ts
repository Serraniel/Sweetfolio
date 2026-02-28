/**
 * Generate a URL-friendly slug from a string.
 * Lowercases, replaces non-alphanumeric characters with hyphens,
 * collapses consecutive hyphens, and trims leading/trailing hyphens.
 */
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}
