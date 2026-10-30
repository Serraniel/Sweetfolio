/** Pure cascade rules for deletions (AM-6, ST-6). */
import type { Asset, BenchmarkRef, Portfolio, Strategy, Transaction } from '#lib/domain/types.ts';
import { removeAsset } from '#lib/core/strategy.ts';

export interface DataSnapshot {
	assets: readonly Asset[];
	portfolios: readonly Portfolio[];
	strategies: readonly Strategy[];
	transactions: readonly Transaction[];
	benchmark: BenchmarkRef | null;
}

export interface ChangeSet {
	put: { assets: Asset[]; portfolios: Portfolio[]; strategies: Strategy[]; transactions: Transaction[] };
	delete: { assets: string[]; portfolios: string[]; strategies: string[]; transactions: string[] };
	/** `undefined` = unchanged. */
	benchmark?: BenchmarkRef | null;
}

export function emptyChangeSet(): ChangeSet {
	return {
		put: { assets: [], portfolios: [], strategies: [], transactions: [] },
		delete: { assets: [], portfolios: [], strategies: [], transactions: [] }
	};
}

const stamp = () => new Date().toISOString();

export function deleteAssetChanges(data: DataSnapshot, assetId: string): ChangeSet {
	const cs = emptyChangeSet();
	cs.delete.assets.push(assetId);
	cs.delete.transactions.push(...data.transactions.filter((t) => t.assetId === assetId).map((t) => t.id));
	const deletedStrategies = new Set<string>();
	for (const s of data.strategies) {
		if (!JSON.stringify(s.root).includes(`"assetId":"${assetId}"`)) continue;
		const root = removeAsset(s.root, assetId);
		if (root) cs.put.strategies.push({ ...s, root, updatedAt: stamp() });
		else {
			cs.delete.strategies.push(s.id);
			deletedStrategies.add(s.id);
		}
	}
	const remainingTx = new Set(data.transactions.filter((t) => t.assetId !== assetId).map((t) => t.portfolioId));
	for (const p of data.portfolios) {
		const hasAsset = p.allocations.some((a) => a.assetId === assetId);
		const unlink = p.sourceStrategyId !== null && deletedStrategies.has(p.sourceStrategyId);
		if (!hasAsset && !unlink) continue;
		const rest = p.allocations.filter((a) => a.assetId !== assetId);
		const total = rest.reduce((s, a) => s + a.weight, 0);
		if (rest.length === 0 && p.mode === 'model' && !remainingTx.has(p.id)) {
			cs.delete.portfolios.push(p.id);
			continue;
		}
		cs.put.portfolios.push({
			...p,
			allocations: rest.map((a) => ({ ...a, weight: total > 0 ? a.weight / total : 1 / rest.length })),
			sourceStrategyId: unlink ? null : p.sourceStrategyId,
			updatedAt: stamp()
		});
	}
	const deletedPortfolios = new Set(cs.delete.portfolios);
	if (deletedPortfolios.size) {
		for (const s of data.strategies) {
			if (deletedStrategies.has(s.id) || !s.generatedPortfolioIds.some((id) => deletedPortfolios.has(id))) continue;
			const existing = cs.put.strategies.find((x) => x.id === s.id) ?? s;
			const updated = { ...existing, generatedPortfolioIds: existing.generatedPortfolioIds.filter((id) => !deletedPortfolios.has(id)) };
			cs.put.strategies = [...cs.put.strategies.filter((x) => x.id !== s.id), updated];
		}
	}
	const b = data.benchmark;
	if (b && ((b.type === 'asset' && b.id === assetId) || (b.type === 'portfolio' && deletedPortfolios.has(b.id)))) cs.benchmark = null;
	return cs;
}

export function deletePortfolioChanges(data: DataSnapshot, portfolioId: string): ChangeSet {
	const cs = emptyChangeSet();
	cs.delete.portfolios.push(portfolioId);
	cs.delete.transactions.push(...data.transactions.filter((t) => t.portfolioId === portfolioId).map((t) => t.id));
	for (const s of data.strategies)
		if (s.generatedPortfolioIds.includes(portfolioId))
			cs.put.strategies.push({ ...s, generatedPortfolioIds: s.generatedPortfolioIds.filter((id) => id !== portfolioId) });
	if (data.benchmark?.type === 'portfolio' && data.benchmark.id === portfolioId) cs.benchmark = null;
	return cs;
}

export function deleteStrategyChanges(data: DataSnapshot, strategyId: string): ChangeSet {
	const cs = emptyChangeSet();
	cs.delete.strategies.push(strategyId);
	for (const p of data.portfolios)
		if (p.sourceStrategyId === strategyId) cs.put.portfolios.push({ ...p, sourceStrategyId: null, updatedAt: stamp() });
	return cs;
}
