import { describe, expect, it } from 'vitest';
import { looksLikeTransactionCSV, parseTransactionCSV } from './transactions-csv.ts';

describe('EX-2 Parqet CSV', () => {
	it('parses the Parqet export format', () => {
		const csv = [
			'datetime;date;time;price;shares;amount;tax;fee;realizedgains;type;broker;isin;wkn;originalcurrency;currency;fxrate;holding;holdingname;holdingnickname;exchange;avgholdingperiod',
			'2024-01-15T09:00:00.000Z;15.01.2024;09:00;80,5;10;805;0;1;0;Buy;Scalable;IE00B4L5Y983;A0RPWH;EUR;EUR;1;h1;iShares Core MSCI World;;XETRA;',
			'2024-06-15T09:00:00.000Z;15.06.2024;09:00;0;0;12,5;2,5;0;0;Dividend;Scalable;IE00B4L5Y983;A0RPWH;EUR;EUR;1;h1;iShares Core MSCI World;;XETRA;',
			'2024-07-01T09:00:00.000Z;01.07.2024;09:00;90;4;360;5;1;30;Sell;Scalable;IE00B4L5Y983;A0RPWH;EUR;EUR;1;h1;iShares Core MSCI World;;XETRA;',
			'2024-01-01T09:00:00.000Z;01.01.2024;09:00;0;0;1000;0;0;0;Deposit;Scalable;;;EUR;EUR;1;;;;;'
		].join('\n');
		expect(looksLikeTransactionCSV(csv)).toBe(true);
		const r = parseTransactionCSV(csv);
		expect(r.source).toBe('parqet');
		expect(r.securities).toHaveLength(1);
		expect(r.securities[0]).toMatchObject({ isin: 'IE00B4L5Y983', wkn: 'A0RPWH', name: 'iShares Core MSCI World' });
		const [buy, div, sell, dep] = r.transactions;
		expect(buy).toMatchObject({ type: 'buy', date: '2024-01-15', quantity: 10, price: 80.5, fee: 1 });
		expect(div).toMatchObject({ type: 'dividend', amount: 12.5, withholdingTax: 2.5, quantity: null });
		expect(sell).toMatchObject({ type: 'sell', quantity: 4, price: 90, fee: 6 });
		expect(dep).toMatchObject({ type: 'deposit', amount: 1000, securityKey: null });
		expect(r.portfolios[0]!.trackCash).toBe(true);
	});
	it('parses the legacy German Parqet layout', () => {
		const csv =
			'Datum;Typ;Wertpapier;ISIN;Stück;Kurs;Währung;Betrag;Gebühren;Steuern;Notiz\n15.01.2024;Kauf;iShares MSCI World;IE00B4L5Y983;5;200,00;EUR;1000,00;1,00;0,00;Sparplan\n';
		const r = parseTransactionCSV(csv);
		expect(r.source).toBe('parqet');
		expect(r.transactions[0]).toMatchObject({ type: 'buy', quantity: 5, price: 200, fee: 1, notes: 'Sparplan' });
	});
});

describe('EX-3 broker CSV', () => {
	it('Trade Republic layout', () => {
		const r = parseTransactionCSV(
			'Datum;Typ;Wertpapier;ISIN;Stück;Kurs;Betrag;Gebühren\n15.01.2024;Kauf;iShares MSCI World;IE00B4L5Y983;5,000;200,00;-1009,90;9,90\n15.06.2024;Dividende;iShares MSCI World;IE00B4L5Y983;;;25,00;0,00\n'
		);
		expect(r.source).toBe('trade-republic');
		expect(r.transactions[0]).toMatchObject({ type: 'buy', quantity: 5, price: 200, fee: 9.9 });
		expect(r.transactions[1]).toMatchObject({ type: 'dividend', amount: 25 });
	});
	it('Scalable Capital layout (legacy and broker export)', () => {
		const legacy = parseTransactionCSV(
			'Datum;Ordertyp;Name;ISIN;Stücke;Kurs;Wert;Kosten\n2024-01-15;Buy;iShares MSCI World;IE00B4L5Y983;5.000;200.00;1000.00;0.99\n'
		);
		expect(legacy.source).toBe('scalable-capital');
		expect(legacy.transactions[0]).toMatchObject({ type: 'buy', quantity: 5, price: 200, fee: 0.99 });
		const broker = parseTransactionCSV(
			'date;time;status;reference;description;assetType;type;isin;shares;price;amount;fee;tax;currency\n' +
				'2024-03-01;10:00:00;Executed;SCAL1;iShares Core MSCI World;Security;Savings plan;IE00B4L5Y983;1,5;100,00;-150,00;0,00;0,00;EUR\n' +
				'2024-03-02;10:00:00;Cancelled;SCAL2;iShares Core MSCI World;Security;Buy;IE00B4L5Y983;1;100,00;-100,00;0,00;0,00;EUR\n' +
				'2024-03-03;10:00:00;Executed;SCAL3;Deposit;Cash;Deposit;;;;500,00;0,00;0,00;EUR\n'
		);
		expect(broker.source).toBe('scalable-capital');
		expect(broker.transactions).toHaveLength(2);
		expect(broker.transactions[0]).toMatchObject({ externalId: 'SCAL1', type: 'buy', quantity: 1.5, price: 100 });
		expect(broker.transactions[1]).toMatchObject({ type: 'deposit', amount: 500 });
	});
	it('ING layout derives price from amount when needed', () => {
		const r = parseTransactionCSV(
			'Buchungstag;Wertpapier;ISIN;WKN;Transaktionstyp;Stück;Kurs;Betrag;Ordergebühren\n15.01.2024;iShares MSCI World;IE00B4L5Y983;A0RPWH;Kauf;5,000;;-1.009,90;9,90\n'
		);
		expect(r.source).toBe('ing');
		expect(r.transactions[0]!.price).toBeCloseTo(200);
		expect(r.securities[0]!.wkn).toBe('A0RPWH');
	});
	it('rejects unknown formats with a warning', () => {
		const r = parseTransactionCSV('foo,bar\n1,2\n');
		expect(r.transactions).toHaveLength(0);
		expect(r.warnings[0]).toMatch(/Unrecognized/);
	});
});
