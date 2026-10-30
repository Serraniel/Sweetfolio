import type { ExternalImport } from '#lib/parsers/external.ts';

/** Merge several single-portfolio imports into one. */
export function combineImports(list: readonly ExternalImport[]): ExternalImport {
	const securities = new Map<string, ExternalImport['securities'][number]>();
	for (const e of list) for (const s of e.securities) if (!securities.has(s.key)) securities.set(s.key, s);
	return {
		source: list[0]?.source ?? 'parqet-connect',
		portfolios: list.flatMap((e) => e.portfolios),
		securities: [...securities.values()],
		transactions: list.flatMap((e) => e.transactions),
		warnings: list.flatMap((e) => e.warnings)
	};
}
