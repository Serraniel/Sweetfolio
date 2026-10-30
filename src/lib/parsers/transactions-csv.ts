/**
 * Transaction CSV import for Parqet exports and broker exports (EX-2, EX-3).
 * Columns are matched through aliases, so the same engine handles Parqet's
 * export, Trade Republic, Scalable Capital, ING and generic CSVs.
 */
import type { TransactionType } from '#lib/domain/types.ts';
import { detectDelimiter, guessDecimal, parseCSV, parseNumber } from './csv.ts';
import { detectDateFormat, parseDate } from './dates.ts';
import type { ExternalImport, ExternalSecurity, ExternalSource, ExternalTransaction } from './external.ts';
import { isValidISIN } from './identifiers.ts';

type Field =
	| 'date'
	| 'type'
	| 'name'
	| 'isin'
	| 'wkn'
	| 'ticker'
	| 'shares'
	| 'price'
	| 'amount'
	| 'fee'
	| 'tax'
	| 'currency'
	| 'note'
	| 'status'
	| 'id';

const ALIASES: Record<Field, string[]> = {
	date: ['datetime', 'date', 'datum', 'buchungstag', 'valuta', 'handelstag', 'ausführungsdatum', 'transaction date'],
	type: ['type', 'typ', 'ordertyp', 'transaktionstyp', 'transaction type', 'art', 'buchungsart', 'activity'],
	name: ['holdingname', 'holdingnickname', 'wertpapier', 'name', 'security', 'description', 'bezeichnung', 'titel'],
	isin: ['isin', 'identifier'],
	wkn: ['wkn'],
	ticker: ['symbol', 'ticker'],
	shares: ['shares', 'stück', 'stueck', 'stücke', 'stuecke', 'anzahl', 'quantity', 'nominale', 'stk'],
	price: ['price', 'kurs', 'preis', 'ausführungskurs'],
	amount: ['amount', 'betrag', 'wert', 'value', 'total', 'gesamtbetrag'],
	fee: ['fee', 'fees', 'gebühren', 'gebuehren', 'gebühr', 'kosten', 'ordergebühren', 'provision'],
	tax: ['tax', 'taxes', 'steuern', 'steuer', 'quellensteuer'],
	currency: ['currency', 'währung', 'waehrung', 'originalcurrency'],
	note: ['note', 'notes', 'notiz', 'kommentar', 'comment'],
	status: ['status'],
	id: ['reference', 'referenz', 'id', 'holding']
};

/** Header fingerprints used to name the detected source. */
const PROFILES: Array<{ source: ExternalSource; required: string[] }> = [
	{ source: 'parqet', required: ['datetime', 'type', 'shares', 'holdingname'] },
	{ source: 'parqet', required: ['datum', 'typ', 'wertpapier', 'isin', 'stück', 'kurs', 'währung', 'betrag'] },
	{ source: 'ing', required: ['buchungstag', 'transaktionstyp', 'wkn'] },
	{ source: 'scalable-capital', required: ['ordertyp', 'stücke'] },
	{ source: 'scalable-capital', required: ['date', 'time', 'status', 'reference', 'assettype', 'type', 'isin', 'shares'] },
	{ source: 'trade-republic', required: ['datum', 'typ', 'wertpapier', 'isin', 'stück', 'gebühren'] }
];

const TYPE_WORDS: Array<[RegExp, TransactionType | 'transfer-in' | 'transfer-out' | 'interest' | 'skip']> = [
	[/^(transferin|einbuchung|deliveryinbound|wertpapiereingang|eingang)/, 'transfer-in'],
	[/^(transferout|ausbuchung|deliveryoutbound|wertpapierausgang|ausgang)/, 'transfer-out'],
	[/^(buy|kauf|purchase|savingsplan|sparplan|ankauf|zeichnung)/, 'buy'],
	[/^(sell|verkauf|sale|tilgung|rückzahlung|ruckzahlung)/, 'sell'],
	[/^(dividend|dividende|distribution|ausschüttung|ausschuttung|ausschuettung|ertrag|ertragsgutschrift)/, 'dividend'],
	[/^(interest|zins|zinsen)/, 'interest'],
	[/^(deposit|einzahlung|einlage|gutschrift|cashin)/, 'deposit'],
	[/^(withdrawal|auszahlung|entnahme|removal|cashout)/, 'withdrawal'],
	[/^(feestaxes|fees|fee|gebühr|gebuhr|gebuehr|kosten)/, 'fee'],
	[/^(taxes|tax|steuer|steuern|vorabpauschale)/, 'tax']
];

function classifyType(raw: string): (typeof TYPE_WORDS)[number][1] | null {
	const v = raw.toLowerCase().replace(/[^a-zäöüß]/g, '');
	if (!v) return null;
	for (const [re, t] of TYPE_WORDS) if (re.test(v)) return t;
	return null;
}

function findColumns(headers: string[]): Partial<Record<Field, number>> {
	const lower = headers.map((h) => h.toLowerCase().trim());
	const out: Partial<Record<Field, number>> = {};
	const used = new Set<number>();
	for (const field of Object.keys(ALIASES) as Field[]) {
		for (const alias of ALIASES[field]) {
			const idx = lower.findIndex((h, i) => !used.has(i) && h === alias);
			if (idx >= 0) {
				out[field] = idx;
				used.add(idx);
				break;
			}
		}
	}
	return out;
}

export function detectTransactionSource(headers: string[]): ExternalSource | null {
	const lower = new Set(headers.map((h) => h.toLowerCase().trim()));
	for (const p of PROFILES) if (p.required.every((r) => lower.has(r))) return p.source;
	const cols = findColumns(headers);
	return cols.date !== undefined && cols.type !== undefined ? 'generic-csv' : null;
}

export function looksLikeTransactionCSV(text: string): boolean {
	const rows = parseCSV(text, detectDelimiter(text), 1);
	return !!rows[0] && detectTransactionSource(rows[0]) !== null;
}

function hashKey(parts: Array<string | number | null>): string {
	let h = 2166136261;
	for (const ch of parts.join('|')) {
		h ^= ch.charCodeAt(0);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0).toString(36);
}

export function parseTransactionCSV(text: string, portfolioName = 'Imported portfolio'): ExternalImport {
	const delimiter = detectDelimiter(text);
	const rows = parseCSV(text, delimiter);
	const warnings: string[] = [];
	const empty: ExternalImport = { source: 'generic-csv', portfolios: [], securities: [], transactions: [], warnings };
	if (rows.length < 2) {
		warnings.push('The file contains no transactions.');
		return empty;
	}
	const headers = rows[0]!;
	const source = detectTransactionSource(headers);
	const cols = findColumns(headers);
	if (!source || cols.date === undefined || cols.type === undefined) {
		warnings.push('Unrecognized format: a date and a type column are required.');
		return empty;
	}
	const data = rows.slice(1);
	const cell = (row: string[], f: Field) => (cols[f] === undefined ? '' : (row[cols[f]!] ?? '').trim());

	// Decimal separator from the numeric columns.
	let comma = 0;
	let dot = 0;
	for (const row of data.slice(0, 50))
		for (const f of ['shares', 'price', 'amount', 'fee', 'tax'] as Field[]) {
			const g = guessDecimal(cell(row, f));
			if (g === ',') comma++;
			if (g === '.') dot++;
		}
	const decimal = comma > dot ? ',' : dot > comma ? '.' : delimiter === ';' ? ',' : '.';
	const dateDet = detectDateFormat(data.map((r) => cell(r, 'date')));
	if (!dateDet) {
		warnings.push('Could not recognize the date format.');
		return { ...empty, source };
	}
	const num = (row: string[], f: Field) => parseNumber(cell(row, f), decimal);

	const securities = new Map<string, ExternalSecurity>();
	const transactions: ExternalTransaction[] = [];
	const currencies = new Map<string, number>();
	data.forEach((row, i) => {
		const line = i + 2;
		const status = cell(row, 'status').toLowerCase();
		if (status && /(cancel|reject|storniert|abgelehnt|pending|failed)/.test(status)) return;
		const date = parseDate(cell(row, 'date'), dateDet.format);
		if (!date) {
			warnings.push(`Row ${line}: invalid date "${cell(row, 'date')}"`);
			return;
		}
		const kind = classifyType(cell(row, 'type'));
		if (!kind || kind === 'skip') {
			warnings.push(`Row ${line}: unsupported type "${cell(row, 'type')}" skipped`);
			return;
		}
		const rawIsin = cell(row, 'isin').toUpperCase();
		const isin = isValidISIN(rawIsin) ? rawIsin : null;
		const wkn = cell(row, 'wkn').toUpperCase() || null;
		const ticker = cell(row, 'ticker').toUpperCase() || null;
		const name = cell(row, 'name');
		const currency = (cell(row, 'currency') || 'EUR').toUpperCase().slice(0, 3);
		currencies.set(currency, (currencies.get(currency) ?? 0) + 1);
		const secKey = isin ?? wkn ?? ticker ?? (name ? `name:${name.toLowerCase()}` : null);

		const shares = Math.abs(num(row, 'shares') ?? 0) || null;
		let price = Math.abs(num(row, 'price') ?? 0) || null;
		const amountRaw = num(row, 'amount');
		const amount = amountRaw === null ? null : Math.abs(amountRaw);
		const fee = Math.abs(num(row, 'fee') ?? 0);
		const tax = Math.abs(num(row, 'tax') ?? 0);
		const note = cell(row, 'note');

		let type: TransactionType;
		let notes = note;
		if (kind === 'transfer-in' || kind === 'transfer-out') {
			type = kind === 'transfer-in' ? 'buy' : 'sell';
			notes = [kind === 'transfer-in' ? 'Transfer in' : 'Transfer out', note].filter(Boolean).join(' — ');
		} else if (kind === 'interest') {
			type = secKey ? 'dividend' : 'deposit';
			notes = ['Interest', note].filter(Boolean).join(' — ');
		} else type = kind;

		const needsSecurity = type === 'buy' || type === 'sell' || type === 'dividend';
		if (needsSecurity && !secKey) {
			warnings.push(`Row ${line}: ${type} without security skipped`);
			return;
		}
		if (type === 'buy' || type === 'sell') {
			if (!shares) {
				warnings.push(`Row ${line}: ${type} without quantity skipped`);
				return;
			}
			if (!price && amount) {
				// Broker amounts usually include costs: buys pay amount = value + fee, sells receive value − fee − tax.
				const gross = type === 'buy' ? amount - fee - tax : amount + fee + tax;
				price = (gross > 0 ? gross : amount) / shares;
			}
			if (!price) {
				warnings.push(`Row ${line}: ${type} without price skipped`);
				return;
			}
		}
		if (secKey && needsSecurity && !securities.has(secKey)) {
			securities.set(secKey, {
				key: secKey,
				name: name || isin || wkn || ticker || secKey,
				isin,
				wkn: wkn && wkn.length === 6 ? wkn : null,
				ticker,
				currency,
				prices: []
			});
		}
		const isCash = type === 'deposit' || type === 'withdrawal' || type === 'fee' || type === 'tax';
		const externalId = cell(row, 'id') && source === 'scalable-capital' ? cell(row, 'id') : null;
		transactions.push({
			externalId: externalId ?? hashKey([source, date, type, secKey, shares, price, amount, fee, tax, i]),
			portfolioKey: 'main',
			securityKey: needsSecurity ? secKey : null,
			type,
			date,
			quantity: type === 'buy' || type === 'sell' ? shares : null,
			price: type === 'buy' || type === 'sell' ? price : null,
			fee: type === 'buy' || type === 'sell' || type === 'dividend' ? fee + (type === 'dividend' ? 0 : tax) : 0,
			amount: type === 'dividend' ? (amount ?? 0) : isCash ? (amount ?? (type === 'fee' ? fee : type === 'tax' ? tax : 0)) : null,
			withholdingTax: type === 'dividend' ? tax : 0,
			currency,
			notes
		});
	});
	const mainCurrency = [...currencies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'EUR';
	const hasCash = transactions.some((t) => t.type === 'deposit' || t.type === 'withdrawal');
	return {
		source,
		portfolios: [{ key: 'main', name: portfolioName, currency: mainCurrency, trackCash: hasCash }],
		securities: [...securities.values()],
		transactions,
		warnings
	};
}
