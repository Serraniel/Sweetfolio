import { describe, expect, it } from 'vitest';
import { buildSlugs, findBySlug, slugify } from './slugs.ts';

describe('AM-11 slugs', () => {
	it('slugifies names including umlauts', () => {
		expect(slugify('iShares Core MSCI World (Acc)')).toBe('ishares-core-msci-world-acc');
		expect(slugify('Größe & Übersicht')).toBe('grosse-ubersicht');
		expect(slugify('!!!')).toBe('item');
	});
	it('disambiguates duplicates and resolves ids', () => {
		const items = [
			{ id: 'b-222', name: 'World', createdAt: '2' },
			{ id: 'a-111', name: 'World', createdAt: '1' }
		];
		const slugs = buildSlugs(items);
		expect(slugs.get('a-111')).toBe('world');
		expect(slugs.get('b-222')).toBe('world-b222');
		expect(findBySlug(items, slugs, 'world-b222')?.id).toBe('b-222');
		expect(findBySlug(items, slugs, 'a-111')?.id).toBe('a-111');
	});
});
