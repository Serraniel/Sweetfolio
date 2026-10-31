import { describe, expect, it } from 'vitest';
import { parseInput } from './format.ts';

describe('number input parsing', () => {
	it('accepts both decimal separators', () => {
		expect(parseInput('1,5')).toBe(1.5);
		expect(parseInput('1.5')).toBe(1.5);
		expect(parseInput('1.234,5')).toBe(1234.5);
		expect(parseInput('1,234.5')).toBe(1234.5);
		expect(parseInput('')).toBeNull();
		expect(parseInput('x')).toBeNull();
	});
});
