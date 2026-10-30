import { describe, expect, it } from 'vitest';
import { parseChangelog, render } from './markdown.ts';

describe('UI-8 changelog parsing', () => {
	it('splits releases including patch versions', () => {
		const md =
			'# Changelog\n\n## [1.1.0](https://x/compare/v1.0.0...v1.1.0) (2026-11-01)\n\n### Features\n\n* thing ([abc](https://x))\n\n## [0.5.4](https://x) (2026-06-04)\n\n### Bug Fixes\n\n* fix\n\n# [0.5.0](https://x) (2026-03-01)\n* a';
		const r = parseChangelog(md);
		expect(r.map((x) => x.version)).toEqual(['1.1.0', '0.5.4', '0.5.0']);
		expect(r[0]!.date).toBe('2026-11-01');
	});
	it('escapes HTML', () => {
		expect(render('<script>x</script>')).toBe('<p>&lt;script&gt;x&lt;/script&gt;</p>');
		expect(render('[a](javascript:alert(1))')).not.toContain('href="javascript');
	});
});
