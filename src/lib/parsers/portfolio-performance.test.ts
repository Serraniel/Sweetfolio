// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parsePortfolioPerformanceXML, ppToSweetfolioExport } from './portfolio-performance';
import { CURRENT_VERSION } from '$lib/io/schema';

let uuidCounter = 0;
beforeEach(() => {
	uuidCounter = 0;
	vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
		uuidCounter++;
		return `mock-uuid-${uuidCounter}` as ReturnType<typeof crypto.randomUUID>;
	});
});

function xml(body: string): string {
	return `<?xml version="1.0" encoding="UTF-8"?><client>${body}</client>`;
}

function securityXml(opts: { uuid?: string; name?: string; isin?: string; wkn?: string; currency?: string } = {}): string {
	return `<security>
		<uuid>${opts.uuid ?? 'sec-1'}</uuid>
		<name>${opts.name ?? 'Test ETF'}</name>
		<isin>${opts.isin ?? 'IE00B4L5Y983'}</isin>
		<wkn>${opts.wkn ?? 'A0RPWH'}</wkn>
		<currencyCode>${opts.currency ?? 'EUR'}</currencyCode>
	</security>`;
}

function portfolioTxXml(opts: {
	uuid?: string;
	date?: string;
	amount?: number;
	shares?: number;
	type?: string;
	fees?: number;
	taxes?: number;
	secRef?: string;
	currency?: string;
}): string {
	return `<portfolio-transaction>
		<uuid>${opts.uuid ?? 'ptx-1'}</uuid>
		<date>${opts.date ?? '2024-01-15T00:00'}</date>
		<currencyCode>${opts.currency ?? 'EUR'}</currencyCode>
		<amount>${opts.amount ?? 100000}</amount>
		<shares>${opts.shares ?? 5000000000}</shares>
		<security reference="${opts.secRef ?? '../../../securities/security'}"/>
		<type>${opts.type ?? 'BUY'}</type>
		<fees>${opts.fees ?? 0}</fees>
		<taxes>${opts.taxes ?? 0}</taxes>
	</portfolio-transaction>`;
}

function wrapPortfolio(txs: string, name = 'Test Portfolio'): string {
	return `<portfolios><portfolio>
		<name>${name}</name>
		<uuid>pf-1</uuid>
		<transactions>${txs}</transactions>
	</portfolio></portfolios>`;
}

describe('parsePortfolioPerformanceXML', () => {
	it('parses valid XML with 1 security + 1 buy transaction', () => {
		const input = xml(`
			<securities>${securityXml()}</securities>
			${wrapPortfolio(portfolioTxXml({ amount: 100000, shares: 5000000000 }))}
		`);

		const result = parsePortfolioPerformanceXML(input);

		expect(result.assets).toHaveLength(1);
		expect(result.assets[0].name).toBe('Test ETF');
		expect(result.assets[0].isin).toBe('IE00B4L5Y983');
		expect(result.assets[0].wkn).toBe('A0RPWH');
		expect(result.assets[0].currency).toBe('EUR');

		expect(result.transactions).toHaveLength(1);
		expect(result.transactions[0].type).toBe('buy');
		expect(result.transactions[0].date).toBe('2024-01-15');
		expect(result.transactions[0].assetId).toBe(result.assets[0].id);
	});

	it('parses dividend transaction with taxes', () => {
		const input = xml(`
			<securities>${securityXml()}</securities>
			${wrapPortfolio(portfolioTxXml({
				type: 'DIVIDEND',
				amount: 2500,
				shares: 0,
				taxes: 500,
			}))}
		`);

		const result = parsePortfolioPerformanceXML(input);

		expect(result.transactions).toHaveLength(1);
		const tx = result.transactions[0];
		expect(tx.type).toBe('dividend');
		expect(tx.amount).toBe(25.0);
		expect(tx.withholdingTax).toBe(5.0);
		expect(tx.quantity).toBeNull();
		expect(tx.price).toBeNull();
	});

	it('converts amounts from cents to euros', () => {
		const input = xml(`
			<securities>${securityXml()}</securities>
			${wrapPortfolio(portfolioTxXml({ amount: 123456, shares: 1000000000, fees: 990 }))}
		`);

		const result = parsePortfolioPerformanceXML(input);
		const tx = result.transactions[0];

		// price = 1234.56 / 1.0 = 1234.56
		expect(tx.price).toBeCloseTo(1234.56, 2);
		expect(tx.fee).toBeCloseTo(9.90, 2);
	});

	it('converts shares from billionths to decimal', () => {
		const input = xml(`
			<securities>${securityXml()}</securities>
			${wrapPortfolio(portfolioTxXml({ amount: 100000, shares: 2500000000 }))}
		`);

		const result = parsePortfolioPerformanceXML(input);
		const tx = result.transactions[0];

		expect(tx.quantity).toBeCloseTo(2.5, 9);
		// price = 1000.00 / 2.5 = 400
		expect(tx.price).toBeCloseTo(400, 2);
	});

	it('parses multiple securities and transactions', () => {
		const sec1 = securityXml({ uuid: 'sec-1', name: 'ETF A', isin: 'IE00A' });
		const sec2 = securityXml({ uuid: 'sec-2', name: 'ETF B', isin: 'IE00B' });

		const tx1 = portfolioTxXml({ uuid: 'ptx-1', secRef: '../../../securities/security' });
		const tx2 = portfolioTxXml({ uuid: 'ptx-2', secRef: '../../../securities/security[2]' });

		const input = xml(`
			<securities>${sec1}${sec2}</securities>
			${wrapPortfolio(`${tx1}${tx2}`)}
		`);

		const result = parsePortfolioPerformanceXML(input);

		expect(result.assets).toHaveLength(2);
		expect(result.transactions).toHaveLength(2);
		expect(result.transactions[0].assetId).toBe(result.assets[0].id);
		expect(result.transactions[1].assetId).toBe(result.assets[1].id);
	});

	it('handles DELIVERY_INBOUND as buy with note', () => {
		const input = xml(`
			<securities>${securityXml()}</securities>
			${wrapPortfolio(portfolioTxXml({ type: 'DELIVERY_INBOUND', amount: 50000, shares: 10000000000 }))}
		`);

		const result = parsePortfolioPerformanceXML(input);
		const tx = result.transactions[0];

		expect(tx.type).toBe('buy');
		expect(tx.price).toBe(0);
		expect(tx.quantity).toBeCloseTo(10.0, 9);
		expect(tx.notes).toContain('Transfer in');
		expect(tx.notes).toContain('delivery inbound');
	});

	it('handles DELIVERY_OUTBOUND as sell with note', () => {
		const input = xml(`
			<securities>${securityXml()}</securities>
			${wrapPortfolio(portfolioTxXml({ type: 'DELIVERY_OUTBOUND', amount: 50000, shares: 10000000000 }))}
		`);

		const result = parsePortfolioPerformanceXML(input);
		const tx = result.transactions[0];

		expect(tx.type).toBe('sell');
		expect(tx.price).toBe(0);
		expect(tx.notes).toContain('Transfer out');
	});

	it('returns warnings for unsupported transaction types', () => {
		const input = xml(`
			<securities>${securityXml()}</securities>
			<portfolios><portfolio>
				<name>P</name><uuid>pf-1</uuid>
				<transactions>
					<portfolio-transaction>
						<uuid>bad-1</uuid>
						<date>2024-01-01T00:00</date>
						<currencyCode>EUR</currencyCode>
						<amount>1000</amount>
						<shares>0</shares>
						<security reference="../../../securities/security"/>
						<type>FEES_REFUND</type>
						<fees>0</fees>
						<taxes>0</taxes>
					</portfolio-transaction>
				</transactions>
			</portfolio></portfolios>
		`);

		const result = parsePortfolioPerformanceXML(input);

		expect(result.transactions).toHaveLength(0);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toContain('FEES_REFUND');
	});

	it('handles empty/missing fields gracefully', () => {
		const input = xml(`
			<securities>
				<security>
					<uuid>sec-x</uuid>
					<name>Minimal</name>
					<currencyCode>USD</currencyCode>
				</security>
			</securities>
			${wrapPortfolio(portfolioTxXml({ amount: 0, shares: 0 }))}
		`);

		const result = parsePortfolioPerformanceXML(input);

		expect(result.assets).toHaveLength(1);
		expect(result.assets[0].isin).toBeNull();
		expect(result.assets[0].wkn).toBeNull();
		expect(result.transactions).toHaveLength(1);
	});

	it('uses portfolio name from XML', () => {
		const input = xml(`
			<securities>${securityXml()}</securities>
			${wrapPortfolio(portfolioTxXml({}), 'My Custom Portfolio')}
		`);

		const result = parsePortfolioPerformanceXML(input);
		expect(result.portfolioName).toBe('My Custom Portfolio');
	});
});

describe('ppToSweetfolioExport', () => {
	it('converts PPImportResult to SweetfolioExport format', () => {
		const input = xml(`
			<securities>${securityXml()}</securities>
			${wrapPortfolio(portfolioTxXml({ amount: 100000, shares: 5000000000, fees: 990 }))}
		`);

		const parsed = parsePortfolioPerformanceXML(input);
		const exported = ppToSweetfolioExport(parsed);

		expect(exported.format).toBe('sweetfolio');
		expect(exported.version).toBe(CURRENT_VERSION);
		expect(exported.scopes).toContain('assets');
		expect(exported.scopes).toContain('portfolios');
		expect(exported.scopes).toContain('transactions');

		// Assets
		expect(exported.data.assets).toHaveLength(1);
		const asset = exported.data.assets![0];
		expect(asset.classification).toBe('unknown');
		expect(asset.prices).toEqual([]);
		expect(asset.formatConfig).toBeNull();
		expect(asset.rawCSV).toBeNull();

		// Portfolio
		expect(exported.data.portfolios).toHaveLength(1);
		const portfolio = exported.data.portfolios![0];
		expect(portfolio.name).toBe('Test Portfolio');
		expect(portfolio.mode).toBe('tracked');
		expect(portfolio.trackCash).toBe(false);

		// Transactions
		expect(exported.data.transactions).toHaveLength(1);
		const tx = exported.data.transactions![0];
		expect(tx.portfolioId).toBe(portfolio.id);
		expect(tx.assetId).toBe(asset.id);
		expect(tx.type).toBe('buy');
		expect(tx.fee).toBeCloseTo(9.90, 2);
	});
});
