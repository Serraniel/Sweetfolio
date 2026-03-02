import { CURRENT_VERSION, type SweetfolioExport } from '$lib/io/schema';
import type { Asset, Transaction, Portfolio } from '$lib/types';

export interface PPImportResult {
	portfolioName: string;
	assets: Array<{
		id: string;
		name: string;
		isin: string | null;
		wkn: string | null;
		currency: string;
	}>;
	transactions: Array<{
		id: string;
		assetId: string;
		type: 'buy' | 'sell' | 'dividend';
		date: string;
		quantity: number | null;
		price: number | null;
		fee: number;
		amount: number | null;
		withholdingTax: number;
		currency: string;
		notes: string;
	}>;
	warnings: string[];
}

const PP_SHARES_DIVISOR = 1_000_000_000;
const PP_AMOUNT_DIVISOR = 100;

type PPTransactionType = 'BUY' | 'SELL' | 'DIVIDEND' | 'DELIVERY_INBOUND' | 'DELIVERY_OUTBOUND';

const TYPE_MAP: Record<PPTransactionType, 'buy' | 'sell' | 'dividend'> = {
	BUY: 'buy',
	SELL: 'sell',
	DIVIDEND: 'dividend',
	DELIVERY_INBOUND: 'buy',
	DELIVERY_OUTBOUND: 'sell',
};

function textOf(el: Element, tag: string): string | null {
	const child = el.querySelector(`:scope > ${tag}`);
	return child?.textContent?.trim() ?? null;
}

function numOf(el: Element, tag: string): number {
	const text = textOf(el, tag);
	if (text === null) return 0;
	const n = Number(text);
	return Number.isFinite(n) ? n : 0;
}

/**
 * Resolve a PP security reference to an index in the securities list.
 *
 * PP uses relative XPath-like paths such as `../../../securities/security`
 * (for the first) or `../../../securities/security[2]` (for the second, 1-indexed).
 */
function resolveSecurityIndex(ref: string): number {
	const match = ref.match(/security(?:\[(\d+)\])?$/);
	if (!match) return 0;
	if (match[1]) return Number(match[1]) - 1; // XPath is 1-indexed
	return 0;
}

interface PPSecurity {
	uuid: string;
	name: string;
	isin: string | null;
	wkn: string | null;
	currency: string;
	sweetfolioId: string;
}

export function parsePortfolioPerformanceXML(xmlString: string): PPImportResult {
	const parser = new DOMParser();
	const doc = parser.parseFromString(xmlString, 'text/xml');

	const parseError = doc.querySelector('parsererror');
	if (parseError) {
		throw new Error(`Invalid XML: ${parseError.textContent}`);
	}

	const warnings: string[] = [];

	// --- Parse securities ---
	const securityEls = Array.from(doc.querySelectorAll('client > securities > security'));
	const securities: PPSecurity[] = securityEls.map((el) => ({
		uuid: textOf(el, 'uuid') ?? '',
		name: textOf(el, 'name') ?? 'Unknown Security',
		isin: textOf(el, 'isin') || null,
		wkn: textOf(el, 'wkn') || null,
		currency: textOf(el, 'currencyCode') ?? 'EUR',
		sweetfolioId: crypto.randomUUID(),
	}));

	// Build lookup by uuid and by index
	const secByUuid = new Map<string, PPSecurity>();
	for (const sec of securities) {
		if (sec.uuid) secByUuid.set(sec.uuid, sec);
	}

	function resolveSecurity(txEl: Element): PPSecurity | null {
		const secEl = txEl.querySelector(':scope > security');
		if (!secEl) return null;

		// Check for reference attribute (XPath-style)
		const ref = secEl.getAttribute('reference');
		if (ref) {
			return securities[resolveSecurityIndex(ref)] ?? null;
		}

		// Inline security: try uuid match
		const uuid = textOf(secEl, 'uuid');
		if (uuid) return secByUuid.get(uuid) ?? null;

		return null;
	}

	// --- Determine portfolio name ---
	const portfolioEl = doc.querySelector('client > portfolios > portfolio');
	const portfolioName = portfolioEl ? (textOf(portfolioEl, 'name') ?? 'Portfolio Performance Import') : 'Portfolio Performance Import';

	// --- Parse portfolio transactions ---
	const transactions: PPImportResult['transactions'] = [];
	const portfolioEls = Array.from(doc.querySelectorAll('client > portfolios > portfolio'));

	for (const pfEl of portfolioEls) {
		const txEls = Array.from(pfEl.querySelectorAll('transactions > portfolio-transaction'));

		for (const txEl of txEls) {
			const ppType = textOf(txEl, 'type') as PPTransactionType | null;
			if (!ppType || !(ppType in TYPE_MAP)) {
				warnings.push(`Skipping unsupported transaction type: ${ppType ?? 'unknown'}`);
				continue;
			}

			const security = resolveSecurity(txEl);
			if (!security) {
				warnings.push(`Skipping transaction: could not resolve security reference`);
				continue;
			}

			const rawAmount = numOf(txEl, 'amount');
			const rawShares = numOf(txEl, 'shares');
			const rawFees = numOf(txEl, 'fees');
			const rawTaxes = numOf(txEl, 'taxes');

			const amount = rawAmount / PP_AMOUNT_DIVISOR;
			const shares = rawShares / PP_SHARES_DIVISOR;
			const fees = rawFees / PP_AMOUNT_DIVISOR;
			const taxes = rawTaxes / PP_AMOUNT_DIVISOR;

			const type = TYPE_MAP[ppType];
			const isDelivery = ppType === 'DELIVERY_INBOUND' || ppType === 'DELIVERY_OUTBOUND';

			let price: number | null = null;
			let quantity: number | null = null;

			if (type === 'dividend') {
				quantity = null;
				price = null;
			} else if (isDelivery) {
				quantity = shares > 0 ? shares : null;
				price = 0;
			} else {
				quantity = shares > 0 ? shares : null;
				price = shares > 0 ? amount / shares : null;
			}

			let notes = '';
			if (ppType === 'DELIVERY_INBOUND') {
				notes = 'Transfer in (delivery inbound from Portfolio Performance)';
			} else if (ppType === 'DELIVERY_OUTBOUND') {
				notes = 'Transfer out (delivery outbound from Portfolio Performance)';
			}

			const dateStr = textOf(txEl, 'date') ?? '';
			// PP dates look like "2024-01-15T00:00" — normalize to ISO date
			const date = dateStr.slice(0, 10);

			transactions.push({
				id: textOf(txEl, 'uuid') ?? crypto.randomUUID(),
				assetId: security.sweetfolioId,
				type,
				date,
				quantity,
				price,
				fee: fees,
				amount: type === 'dividend' ? amount : null,
				withholdingTax: taxes,
				currency: textOf(txEl, 'currencyCode') ?? security.currency,
				notes,
			});
		}
	}

	// --- Only include securities that are referenced by transactions ---
	const referencedIds = new Set(transactions.map((t) => t.assetId));
	const assets = securities
		.filter((s) => referencedIds.has(s.sweetfolioId))
		.map((s) => ({
			id: s.sweetfolioId,
			name: s.name,
			isin: s.isin,
			wkn: s.wkn,
			currency: s.currency,
		}));

	return { portfolioName, assets, transactions, warnings };
}

export function ppToSweetfolioExport(result: PPImportResult): SweetfolioExport {
	const now = new Date().toISOString();
	const portfolioId = crypto.randomUUID();

	const assets: Asset[] = result.assets.map((a) => ({
		id: a.id,
		name: a.name,
		isin: a.isin,
		wkn: a.wkn,
		currency: a.currency,
		classification: 'unknown',
		prices: [],
		formatConfig: null,
		rawCSV: null,
		rawCSVStoredAt: null,
		createdAt: now,
		updatedAt: now,
		lastRefreshedAt: null,
	}));

	const portfolio: Portfolio = {
		id: portfolioId,
		name: result.portfolioName,
		mode: 'tracked',
		allocations: [],
		isBenchmark: false,
		trackCash: false,
		cashCurrency: 'EUR',
		sourceStrategyId: null,
		createdAt: now,
		updatedAt: now,
	};

	const transactions: Transaction[] = result.transactions.map((t) => ({
		id: t.id,
		portfolioId,
		type: t.type,
		assetId: t.assetId,
		date: t.date,
		quantity: t.quantity,
		price: t.price,
		fee: t.fee,
		amount: t.amount,
		withholdingTax: t.withholdingTax,
		currency: t.currency,
		notes: t.notes,
		createdAt: now,
		updatedAt: now,
	}));

	return {
		format: 'sweetfolio',
		version: CURRENT_VERSION,
		exportedAt: now,
		scopes: ['assets', 'portfolios', 'transactions'],
		data: {
			assets,
			portfolios: [portfolio],
			transactions,
		},
	};
}
