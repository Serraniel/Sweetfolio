// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parsePortfolioPerformanceXML } from './portfolio-performance.ts';

// XStream XPath-reference style: the portfolio and its transaction are first
// serialized inside the account's crossEntry and referenced from <portfolios>.
const XPATH_XML = `<?xml version="1.0" encoding="UTF-8"?>
<client>
  <version>66</version>
  <baseCurrency>EUR</baseCurrency>
  <securities>
    <security>
      <uuid>sec-world</uuid>
      <name>iShares Core MSCI World</name>
      <currencyCode>EUR</currencyCode>
      <isin>IE00B4L5Y983</isin>
      <wkn>A0RPWH</wkn>
      <prices>
        <price t="2024-01-15" v="8050000000"/>
        <price t="2024-01-16" v="8100000000"/>
      </prices>
    </security>
    <security>
      <uuid>sec-unused</uuid>
      <name>Unused</name>
      <currencyCode>EUR</currencyCode>
    </security>
  </securities>
  <watchlists/>
  <accounts>
    <account>
      <uuid>acc-1</uuid>
      <name>Cash</name>
      <currencyCode>EUR</currencyCode>
      <transactions>
        <account-transaction>
          <uuid>dep-1</uuid>
          <date>2024-01-01T00:00</date>
          <currencyCode>EUR</currencyCode>
          <amount>100000</amount>
          <shares>0</shares>
          <type>DEPOSIT</type>
        </account-transaction>
        <account-transaction>
          <uuid>buy-cash</uuid>
          <date>2024-01-15T00:00</date>
          <currencyCode>EUR</currencyCode>
          <amount>80600</amount>
          <security reference="../../../../../securities/security"/>
          <crossEntry class="buysell">
            <portfolio>
              <uuid>pf-1</uuid>
              <name>Depot</name>
              <referenceAccount reference="../../../../.."/>
              <transactions>
                <portfolio-transaction reference="../../../portfolioTransaction"/>
              </transactions>
            </portfolio>
            <portfolioTransaction>
              <uuid>buy-1</uuid>
              <date>2024-01-15T00:00</date>
              <currencyCode>EUR</currencyCode>
              <amount>80600</amount>
              <security reference="../../../../../../../securities/security"/>
              <units>
                <unit type="FEE"><amount currency="EUR" amount="100"/></unit>
              </units>
              <shares>1000000000</shares>
              <type>BUY</type>
            </portfolioTransaction>
            <account reference="../../../.."/>
            <accountTransaction reference="../.."/>
          </crossEntry>
          <shares>1000000000</shares>
          <type>BUY</type>
        </account-transaction>
        <account-transaction>
          <uuid>div-1</uuid>
          <date>2024-06-15T00:00</date>
          <currencyCode>EUR</currencyCode>
          <amount>1000</amount>
          <security reference="../../../../../securities/security"/>
          <units>
            <unit type="TAX"><amount currency="EUR" amount="250"/></unit>
          </units>
          <shares>0</shares>
          <type>DIVIDENDS</type>
        </account-transaction>
      </transactions>
    </account>
  </accounts>
  <portfolios>
    <portfolio reference="../../accounts/account/transactions/account-transaction[2]/crossEntry/portfolio"/>
  </portfolios>
</client>`;

const ID_XML = `<client id="1">
  <baseCurrency>EUR</baseCurrency>
  <securities id="2">
    <security id="3"><uuid>s</uuid><name>Apple</name><currencyCode>USD</currencyCode><isin>US0378331005</isin></security>
  </securities>
  <accounts id="4">
    <account id="5"><uuid>a</uuid><name>Cash</name><currencyCode>EUR</currencyCode><transactions id="6"/></account>
  </accounts>
  <portfolios id="7">
    <portfolio id="8">
      <uuid>p</uuid><name>US</name><referenceAccount reference="5"/>
      <transactions id="9">
        <portfolio-transaction id="10">
          <uuid>t1</uuid><date>2024-02-01T00:00</date><currencyCode>USD</currencyCode><amount>50000</amount>
          <security reference="3"/><shares>250000000</shares><type>DELIVERY_INBOUND</type>
        </portfolio-transaction>
        <portfolio-transaction id="11">
          <uuid>t2</uuid><date>2024-03-01T00:00</date><currencyCode>USD</currencyCode><amount>19900</amount>
          <security reference="3"/><shares>100000000</shares><type>SELL</type>
          <units><unit type="TAX"><amount currency="USD" amount="100"/></unit></units>
        </portfolio-transaction>
      </transactions>
    </portfolio>
  </portfolios>
</client>`;

describe('EX-1 Portfolio Performance XML', () => {
	it('resolves XPath references, inline portfolios and uses correct units', () => {
		const r = parsePortfolioPerformanceXML(XPATH_XML);
		expect(r.warnings).toEqual([]);
		expect(r.portfolios).toEqual([{ key: 'pf-1', name: 'Depot', currency: 'EUR', trackCash: true }]);
		expect(r.securities).toHaveLength(1);
		expect(r.securities[0]).toMatchObject({ isin: 'IE00B4L5Y983', wkn: 'A0RPWH' });
		expect(r.securities[0]!.prices[0]).toEqual({ date: '2024-01-15', close: 80.5 });
		const types = r.transactions.map((t) => t.type);
		expect(types.sort()).toEqual(['buy', 'deposit', 'dividend']);
		const buy = r.transactions.find((t) => t.type === 'buy')!;
		expect(buy).toMatchObject({ quantity: 10, fee: 1, date: '2024-01-15', externalId: 'buy-1' });
		expect(buy.price).toBeCloseTo(80.5);
		const div = r.transactions.find((t) => t.type === 'dividend')!;
		expect(div).toMatchObject({ amount: 12.5, withholdingTax: 2.5 });
		expect(r.transactions.find((t) => t.type === 'deposit')!.amount).toBe(1000);
	});
	it('resolves id references and deliveries', () => {
		const r = parsePortfolioPerformanceXML(ID_XML);
		expect(r.transactions).toHaveLength(2);
		expect(r.transactions[0]).toMatchObject({ type: 'buy', quantity: 2.5, price: 200, notes: 'Delivery in', currency: 'USD' });
		expect(r.transactions[1]).toMatchObject({ type: 'sell', quantity: 1, price: 200, fee: 1 });
	});
	it('rejects non-PP files', () => {
		expect(parsePortfolioPerformanceXML('<foo/>').warnings[0]).toMatch(/Save as/);
	});
});
