/**
 * Portfolio Performance XML import (EX-1).
 *
 * PP files are XStream serializations: every object is written in full on its
 * first occurrence and referenced afterwards, either by relative XPath
 * (`reference="../../securities/security[3]"`) or by id (`id="12"` /
 * `reference="12"`). All elements are therefore dereferenced before reading.
 * Units: amounts ×100, shares ×10⁸, quotes ×10⁸.
 */
import type { PricePoint } from '#lib/domain/types.ts';
import type { ExternalImport, ExternalPortfolio, ExternalSecurity, ExternalTransaction } from './external.ts';

export const PP_AMOUNT_FACTOR = 100;
export const PP_SHARE_FACTOR = 100_000_000;
export const PP_QUOTE_FACTOR = 100_000_000;

function children(el: Element, tag?: string): Element[] {
	return Array.from(el.children).filter((c) => !tag || c.tagName === tag);
}

function child(el: Element, tag: string): Element | null {
	return children(el, tag)[0] ?? null;
}

class Resolver {
	private ids = new Map<string, Element>();
	constructor(doc: Document) {
		for (const el of Array.from(doc.querySelectorAll('[id]'))) this.ids.set(el.getAttribute('id')!, el);
	}
	resolve(el: Element | null): Element | null {
		if (!el) return null;
		const ref = el.getAttribute('reference');
		if (ref === null) return el;
		const byId = this.ids.get(ref);
		if (byId) return byId;
		let cur: Element | null = el;
		for (const part of ref.split('/')) {
			if (!cur) return null;
			if (part === '' || part === '.') continue;
			if (part === '..') {
				cur = cur.parentElement;
				continue;
			}
			const m = /^([^[\]]+)(?:\[(\d+)\])?$/.exec(part);
			if (!m) return null;
			cur = children(cur, m[1]!)[m[2] ? +m[2] - 1 : 0] ?? null;
		}
		return cur && cur.getAttribute('reference') !== null && cur !== el ? this.resolve(cur) : cur;
	}
}

function text(el: Element | null, tag: string): string | null {
	const c = el ? child(el, tag) : null;
	const t = c?.textContent?.trim();
	return t ? t : null;
}

function num(el: Element | null, tag: string): number {
	const t = text(el, tag);
	const n = t === null ? 0 : Number(t);
	return Number.isFinite(n) ? n : 0;
}

/** Sum of FEE / TAX units in a transaction. */
function units(el: Element): { fee: number; tax: number } {
	let fee = 0;
	let tax = 0;
	const u = child(el, 'units');
	for (const unit of u ? children(u, 'unit') : []) {
		const amountEl = child(unit, 'amount');
		const v = Number(amountEl?.getAttribute('amount') ?? 0) / PP_AMOUNT_FACTOR;
		if (unit.getAttribute('type') === 'FEE') fee += v;
		if (unit.getAttribute('type') === 'TAX') tax += v;
	}
	return { fee, tax };
}

export function parsePortfolioPerformanceXML(xml: string): ExternalImport {
	const warnings: string[] = [];
	const result: ExternalImport = { source: 'portfolio-performance', portfolios: [], securities: [], transactions: [], warnings };
	if (!/<client[\s>]/.test(xml)) {
		warnings.push('Not a Portfolio Performance XML file. In Portfolio Performance use "File › Save as › XML".');
		return result;
	}
	const doc = new DOMParser().parseFromString(xml, 'application/xml');
	if (doc.querySelector('parsererror')) {
		warnings.push('The XML file could not be parsed.');
		return result;
	}
	const client = doc.documentElement;
	const r = new Resolver(doc);
	const baseCurrency = text(client, 'baseCurrency') ?? 'EUR';

	// Securities
	const secByEl = new Map<Element, ExternalSecurity>();
	const securitiesEl = child(client, 'securities');
	for (const raw of securitiesEl ? children(securitiesEl, 'security') : []) {
		const el = r.resolve(raw);
		if (!el || secByEl.has(el)) continue;
		const uuid = text(el, 'uuid') ?? `sec-${secByEl.size}`;
		const prices: PricePoint[] = [];
		const pricesEl = child(el, 'prices');
		for (const p of pricesEl ? children(pricesEl, 'price') : []) {
			const t = p.getAttribute('t');
			const v = Number(p.getAttribute('v'));
			if (t && Number.isFinite(v) && v > 0) prices.push({ date: t.slice(0, 10), close: v / PP_QUOTE_FACTOR });
		}
		secByEl.set(el, {
			key: uuid,
			name: text(el, 'name') ?? 'Unknown security',
			isin: text(el, 'isin')?.toUpperCase() ?? null,
			wkn: text(el, 'wkn')?.toUpperCase() ?? null,
			ticker: text(el, 'tickerSymbol'),
			currency: text(el, 'currencyCode') ?? baseCurrency,
			prices
		});
	}
	const securityOf = (txEl: Element): ExternalSecurity | null => {
		const el = r.resolve(child(txEl, 'security'));
		return el ? (secByEl.get(el) ?? null) : null;
	};

	// Portfolios and the cash accounts they reference
	const portfolioByEl = new Map<Element, ExternalPortfolio>();
	const portfolioForAccount = new Map<Element, ExternalPortfolio>();
	const portfoliosEl = child(client, 'portfolios');
	for (const raw of portfoliosEl ? children(portfoliosEl, 'portfolio') : []) {
		const el = r.resolve(raw);
		if (!el || portfolioByEl.has(el)) continue;
		const account = r.resolve(child(el, 'referenceAccount'));
		const p: ExternalPortfolio = {
			key: text(el, 'uuid') ?? `pf-${portfolioByEl.size}`,
			name: text(el, 'name') ?? 'Portfolio Performance',
			currency: (account && text(account, 'currencyCode')) ?? baseCurrency,
			trackCash: !!account
		};
		portfolioByEl.set(el, p);
		if (account && !portfolioForAccount.has(account)) portfolioForAccount.set(account, p);
	}

	const seen = new Set<Element>();
	const add = (t: ExternalTransaction) => result.transactions.push(t);

	for (const [pfEl, pf] of portfolioByEl) {
		const txs = child(pfEl, 'transactions');
		for (const raw of txs ? children(txs, 'portfolio-transaction') : []) {
			const el = r.resolve(raw);
			if (!el || seen.has(el)) continue;
			seen.add(el);
			const type = text(el, 'type') ?? '';
			const sec = securityOf(el);
			if (!sec) {
				warnings.push(`Skipped ${type} on ${text(el, 'date')}: unknown security.`);
				continue;
			}
			const shares = num(el, 'shares') / PP_SHARE_FACTOR;
			const amount = num(el, 'amount') / PP_AMOUNT_FACTOR;
			const { fee, tax } = units(el);
			const inbound = type === 'BUY' || type === 'DELIVERY_INBOUND' || type === 'TRANSFER_IN';
			const outbound = type === 'SELL' || type === 'DELIVERY_OUTBOUND' || type === 'TRANSFER_OUT';
			if (!inbound && !outbound) {
				warnings.push(`Skipped unsupported portfolio transaction type ${type}.`);
				continue;
			}
			if (shares <= 0) continue;
			const gross = inbound ? amount - fee - tax : amount + fee + tax;
			const note = [
				type.startsWith('DELIVERY') ? (inbound ? 'Delivery in' : 'Delivery out') : '',
				type.startsWith('TRANSFER') ? (inbound ? 'Transfer in' : 'Transfer out') : '',
				text(el, 'note') ?? ''
			]
				.filter(Boolean)
				.join(' — ');
			add({
				externalId: text(el, 'uuid'),
				portfolioKey: pf.key,
				securityKey: sec.key,
				type: inbound ? 'buy' : 'sell',
				date: (text(el, 'date') ?? '').slice(0, 10),
				quantity: shares,
				price: gross / shares,
				fee: fee + tax,
				amount: null,
				withholdingTax: 0,
				currency: text(el, 'currencyCode') ?? sec.currency,
				notes: note
			});
		}
	}

	// Account transactions: dividends, interest, deposits, removals, fees, taxes.
	const accountsEl = child(client, 'accounts');
	const fallbackPortfolio = [...portfolioByEl.values()][0];
	for (const raw of accountsEl ? children(accountsEl, 'account') : []) {
		const acc = r.resolve(raw);
		if (!acc) continue;
		const pf = portfolioForAccount.get(acc) ?? fallbackPortfolio;
		if (!pf) continue;
		const txs = child(acc, 'transactions');
		for (const rawTx of txs ? children(txs, 'account-transaction') : []) {
			const el = r.resolve(rawTx);
			if (!el || seen.has(el)) continue;
			seen.add(el);
			const type = text(el, 'type') ?? '';
			const amount = num(el, 'amount') / PP_AMOUNT_FACTOR;
			const { fee, tax } = units(el);
			const date = (text(el, 'date') ?? '').slice(0, 10);
			const currency = text(el, 'currencyCode') ?? pf.currency;
			const note = text(el, 'note') ?? '';
			const base = { externalId: text(el, 'uuid'), portfolioKey: pf.key, date, currency, quantity: null, price: null };
			const sec = securityOf(el);
			switch (type) {
				case 'DIVIDENDS':
				case 'INTEREST':
					if (sec) {
						add({
							...base,
							securityKey: sec.key,
							type: 'dividend',
							fee,
							amount: amount + fee + tax,
							withholdingTax: tax,
							notes: type === 'INTEREST' ? ['Interest', note].filter(Boolean).join(' — ') : note
						});
					} else {
						add({
							...base,
							securityKey: null,
							type: 'deposit',
							fee: 0,
							amount,
							withholdingTax: 0,
							notes: ['Interest', note].filter(Boolean).join(' — ')
						});
					}
					break;
				case 'DEPOSIT':
				case 'FEES_REFUND':
				case 'TAX_REFUND':
				case 'TRANSFER_IN':
					add({
						...base,
						securityKey: null,
						type: 'deposit',
						fee: 0,
						amount,
						withholdingTax: 0,
						notes: [type === 'DEPOSIT' ? '' : type.toLowerCase().replace('_', ' '), note].filter(Boolean).join(' — ')
					});
					break;
				case 'REMOVAL':
				case 'TRANSFER_OUT':
				case 'INTEREST_CHARGE':
					add({
						...base,
						securityKey: null,
						type: 'withdrawal',
						fee: 0,
						amount,
						withholdingTax: 0,
						notes: [type === 'REMOVAL' ? '' : type.toLowerCase().replace('_', ' '), note].filter(Boolean).join(' — ')
					});
					break;
				case 'FEES':
					add({ ...base, securityKey: null, type: 'fee', fee: 0, amount, withholdingTax: 0, notes: note });
					break;
				case 'TAXES':
					add({ ...base, securityKey: null, type: 'tax', fee: 0, amount, withholdingTax: 0, notes: note });
					break;
				case 'BUY':
				case 'SELL':
					// Cash side of a portfolio transaction — already imported.
					break;
				default:
					warnings.push(`Skipped unsupported account transaction type ${type}.`);
			}
		}
	}

	const used = new Set(result.transactions.map((t) => t.securityKey).filter(Boolean));
	result.securities = [...secByEl.values()].filter((s) => used.has(s.key));
	result.portfolios = [...portfolioByEl.values()];
	if (result.portfolios.length === 0) warnings.push('The file contains no portfolios.');
	return result;
}
