/** Import conflict detection and application plan (DP-3). */
import type { CurrencyRate } from '#lib/domain/types.ts';
import { ALL_SCOPES, type ExportData, type Scope } from './schema.ts';

export type Resolution = 'keep' | 'replace';

export interface Conflict<T = unknown> {
	key: string;
	label: string;
	existing: T;
	incoming: T;
	resolution: Resolution;
}

export interface ScopeReport<T = unknown> {
	added: T[];
	conflicts: Conflict<T>[];
	unchanged: number;
}

export type ImportReport = { [S in Scope]: ScopeReport };

export interface ExistingData {
	assets: Array<{ id: string; name: string }>;
	portfolios: Array<{ id: string; name: string }>;
	strategies: Array<{ id: string; name: string }>;
	transactions: Array<{ id: string; date: string; type: string }>;
	currencies: CurrencyRate[];
	simulations: Array<{ id: string }>;
	settings: Record<string, unknown>;
}

function keyOf(scope: Scope, item: unknown): string {
	const o = item as Record<string, unknown>;
	return String(scope === 'currencies' ? o.pair : o.id);
}

function labelOf(scope: Scope, item: unknown): string {
	const o = item as Record<string, unknown>;
	if (scope === 'currencies') return String(o.pair);
	if (scope === 'transactions') return `${o.date} ${o.type}`;
	return String(o.name ?? o.id);
}

/** Stable JSON (sorted keys) so equal objects with different key order are "unchanged". */
export function stableStringify(v: unknown): string {
	if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
	if (v && typeof v === 'object')
		return `{${Object.keys(v)
			.sort()
			.map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
			.join(',')}}`;
	return JSON.stringify(v ?? null);
}

function compare(scope: Scope, incoming: unknown[], existing: unknown[]): ScopeReport {
	const map = new Map(existing.map((e) => [keyOf(scope, e), e]));
	const report: ScopeReport = { added: [], conflicts: [], unchanged: 0 };
	for (const item of incoming) {
		const key = keyOf(scope, item);
		const match = map.get(key);
		if (!match) report.added.push(item);
		else if (stableStringify(stripVolatile(match)) === stableStringify(stripVolatile(item))) report.unchanged++;
		else report.conflicts.push({ key, label: labelOf(scope, item), existing: match, incoming: item, resolution: 'keep' });
	}
	return report;
}

/** Fields that differ between devices without meaning a real change. */
function stripVolatile(v: unknown): unknown {
	if (!v || typeof v !== 'object') return v;
	const { rawCSV: _a, rawCSVStoredAt: _b, lastRefreshedAt: _c, ...rest } = v as Record<string, unknown>;
	return rest;
}

export function detectConflicts(data: ExportData, existing: ExistingData, scopes: readonly Scope[] = ALL_SCOPES): ImportReport {
	const report = {} as ImportReport;
	for (const scope of ALL_SCOPES) {
		if (!scopes.includes(scope)) {
			report[scope] = { added: [], conflicts: [], unchanged: 0 };
			continue;
		}
		if (scope === 'settings') {
			const incoming = Object.entries(data.settings ?? {}).map(([key, value]) => ({ key, value }));
			const r: ScopeReport = { added: [], conflicts: [], unchanged: 0 };
			for (const s of incoming) {
				if (!(s.key in existing.settings)) r.added.push(s);
				else if (stableStringify(existing.settings[s.key]) === stableStringify(s.value)) r.unchanged++;
				else
					r.conflicts.push({
						key: s.key,
						label: s.key,
						existing: { key: s.key, value: existing.settings[s.key] },
						incoming: s,
						resolution: 'keep'
					});
			}
			report.settings = r;
			continue;
		}
		report[scope] = compare(scope, (data[scope] as unknown[] | undefined) ?? [], existing[scope] as unknown[]);
	}
	return report;
}

export function countReport(report: ImportReport) {
	let added = 0;
	let conflicts = 0;
	let unchanged = 0;
	for (const s of ALL_SCOPES) {
		added += report[s].added.length;
		conflicts += report[s].conflicts.length;
		unchanged += report[s].unchanged;
	}
	return { added, conflicts, unchanged };
}

/** Items to write per scope after the user resolved conflicts. */
export function itemsToWrite(report: ImportReport): { [S in Scope]: unknown[] } {
	const out = {} as { [S in Scope]: unknown[] };
	for (const s of ALL_SCOPES) {
		out[s] = [...report[s].added, ...report[s].conflicts.filter((c) => c.resolution === 'replace').map((c) => c.incoming)];
	}
	return out;
}
