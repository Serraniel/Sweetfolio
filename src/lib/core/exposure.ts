/**
 * Economic exposure of an asset (CR-1): what it is invested in, not the
 * wrapper. Derived from the Onvista snapshot (fund type, investment focus,
 * region, benchmark index, ETC underlying) or, without one, from the name.
 */
import type { Asset, BondMaturity, EquityStyle, Exposure, ExposureClass, ExposureRegion } from '#lib/domain/types.ts';

/** The parts of an Onvista snapshot the derivation reads. */
export interface ExposureSnapshot {
	instrument?: { entityType?: string; name?: string };
	fundsDetails?: {
		nameTypeFund?: string | null;
		nameInvestmentFocus?: string | null;
		fundsInvestmentRegion?: { name?: string } | null;
	} | null;
	fundsBenchmarkList?: { list?: Array<{ instrument?: { name?: string; entityType?: string } }> } | null;
	derivativesUnderlyingList?: { list?: Array<{ instrument?: { name?: string; entityType?: string } }> } | null;
	company?: { isoCountry?: string | null } | null;
}

export function exposure(assetClass: ExposureClass, partial: Partial<Exposure> = {}): Exposure {
	return { assetClass, region: 'world', style: 'broad', maturity: 'intermediate', leverage: 1, source: 'auto', ...partial };
}

const EUROPE_ISO = new Set('AT BE CH DK ES FI FR GB IE IT LU NL NO PT SE'.split(' '));
const EMERGING_ISO = new Set('BR CL CN CO CZ EG GR HU ID IN KR KW MX MY PE PH PL QA SA TH TR TW ZA AE'.split(' '));

function regionFromCountry(iso: string | null | undefined): ExposureRegion {
	if (!iso) return 'other';
	if (iso === 'US') return 'us';
	if (iso === 'DE') return 'germany';
	if (iso === 'JP') return 'japan';
	if (EUROPE_ISO.has(iso)) return 'europe';
	if (EMERGING_ISO.has(iso)) return 'emerging';
	return 'other';
}

function regionFromText(text: string): ExposureRegion | null {
	if (/EMERGING|SCHWELLEN/.test(text)) return 'emerging';
	if (/S&P 500|S&P500|MSCI USA|NASDAQ|DOW JONES|RUSSELL|U\.?S\.? TREASUR|\bUSA\b|\bUS\b|USD TREASURY|AMERICA/.test(text)) return 'us';
	if (/\bDAX\b|GERMANY|DEUTSCHLAND|BUND\b/.test(text)) return 'germany';
	if (/JAPAN|NIKKEI|TOPIX/.test(text)) return 'japan';
	if (/EURO|EMU|STOXX EUROPE|MSCI EUROPE|EUROZONE|EUROPA/.test(text)) return 'europe';
	if (/WORLD|ACWI|GLOBAL|ALL.COUNTRY|INTERNATIONAL/.test(text)) return 'world';
	return null;
}

const FUND_REGIONS: Record<string, ExposureRegion> = {
	Nordamerika: 'us',
	USA: 'us',
	International: 'world',
	Welt: 'world',
	Schwellenländer: 'emerging',
	Europa: 'europe',
	Euroland: 'europe',
	Deutschland: 'germany',
	Japan: 'japan'
};

function maturityFromText(text: string): BondMaturity {
	if (/(20|25|15|10)\s?\+|LONG|LANGL/.test(text)) return 'long';
	if (/\b(0|1)\s?-\s?(1|3|5)\b|SHORT|KURZ|ULTRASHORT|MONEY MARKET/.test(text)) return 'short';
	return 'intermediate';
}

/** Daily leverage factor from names such as "MSCI USA LEVERAGED 2X DAILY" or "3x Short". */
export function leverageFromText(text: string): number {
	const m = /(?:^|[^\d.])(\d(?:[.,]\d)?)\s?X\b/.exec(text) ?? /\bX\s?(\d(?:[.,]\d)?)\b/.exec(text);
	const leveraged = /LEVERAGE|DAILY|\bLEV\b|ULTRA|\d\s?X\b|\bX\s?\d\b/.test(text);
	let factor = m ? Number(m[1]!.replace(',', '.')) : leveraged && /LEVERAGE/.test(text) ? 2 : 1;
	if (!(factor > 0) || factor > 5) factor = 1;
	const short = /\bSHORT|INVERSE|\bBEAR\b/.test(text) && (leveraged || /DAILY/.test(text));
	return short ? -factor : factor;
}

function styleFromText(text: string, focus = ''): EquityStyle {
	return /NASDAQ|TECHNOLOG|\bTECH\b|INFORMATION TECH|SEMICONDUCTOR|ROBOTIC|\bIT\b/.test(text + ' ' + focus.toUpperCase())
		? 'tech'
		: 'broad';
}

function classFromText(text: string): ExposureClass | null {
	if (/\bGOLD/.test(text)) return 'gold';
	if (/BITCOIN|ETHEREUM|CRYPTO|\bBTC\b|\bETH\b/.test(text)) return 'crypto';
	if (/SILBER|SILVER|PLATIN|PALLAD|COMMODIT|ROHSTOFF|\bOIL\b|ÖL|BRENT|WTI/.test(text)) return 'commodity';
	if (/MONEY MARKET|GELDMARKT|OVERNIGHT|€STR|ESTR|\bSOFR\b|\bEONIA\b/.test(text)) return 'cash';
	if (/CORPORATE|CORP\b|UNTERNEHMENSANL|HIGH YIELD|CREDIT/.test(text)) return 'corpBond';
	if (/TREASUR|GOVERNMENT|GOVT|STAATSANL|\bBUND\b|SOVEREIGN|GILT|AGGREGATE|BOND|ANLEIHE|RENTEN/.test(text)) return 'govBond';
	if (/MULTI.?ASSET|MISCH|BALANCED|PORTFOLIO|ALLOCATION/.test(text)) return 'mixed';
	if (/MSCI|S&P|FTSE|STOXX|\bDAX\b|NASDAQ|DOW JONES|RUSSELL|NIKKEI|TOPIX|EQUITY|AKTIE|SHARES|DIVIDEND/.test(text)) return 'equity';
	return null;
}

function fromText(text: string, base: Partial<Exposure> = {}): Exposure | null {
	const cls = base.assetClass ?? classFromText(text);
	if (!cls) return null;
	return exposure(cls, {
		region: regionFromText(text) ?? 'world',
		style: cls === 'equity' ? styleFromText(text) : 'broad',
		maturity: cls === 'govBond' || cls === 'corpBond' ? maturityFromText(text) : 'intermediate',
		leverage: leverageFromText(text),
		...base,
		assetClass: cls
	});
}

const FUND_TYPES: Record<string, ExposureClass> = {
	Aktienfonds: 'equity',
	Branchenfonds: 'equity',
	Rentenfonds: 'govBond',
	Geldmarktfonds: 'cash',
	Mischfonds: 'mixed',
	Rohstofffonds: 'commodity',
	Immobilienfonds: 'mixed',
	Dachfonds: 'mixed'
};

/** Exposure from an Onvista snapshot; `null` when it says nothing usable. */
export function exposureFromSnapshot(snap: ExposureSnapshot): Exposure | null {
	const type = snap.instrument?.entityType ?? '';
	const name = (snap.instrument?.name ?? '').toUpperCase();
	if (type === 'STOCK') return exposure('equity', { region: regionFromCountry(snap.company?.isoCountry), style: styleFromText(name) });
	if (type === 'CRYPTO') return exposure('crypto');
	if (type === 'PRECIOUS_METAL') return exposure(/GOLD/.test(name) ? 'gold' : 'commodity');
	if (type === 'COMMODITY') return exposure('commodity');
	if (type === 'INDEX') return fromText(name);

	if (type === 'DERIVATIVE') {
		const u = snap.derivativesUnderlyingList?.list?.[0]?.instrument;
		const uName = (u?.name ?? '').toUpperCase();
		const leverage = leverageFromText(name);
		switch (u?.entityType) {
			case 'PRECIOUS_METAL':
				return exposure(/GOLD/.test(uName) ? 'gold' : 'commodity', { leverage });
			case 'CRYPTO':
				return exposure('crypto', { leverage });
			case 'COMMODITY':
				return exposure('commodity', { leverage });
			case 'STOCK':
				return exposure('equity', { region: 'other', leverage });
			default:
				return fromText(`${uName} ${name}`) ?? fromText(name);
		}
	}

	const details = snap.fundsDetails;
	const benchmarks = (snap.fundsBenchmarkList?.list ?? []).map((b) => (b.instrument?.name ?? '').toUpperCase()).join(' | ');
	const text = `${benchmarks} | ${name}`;
	if (details) {
		const focus = details.nameInvestmentFocus ?? '';
		let cls: ExposureClass | undefined = FUND_TYPES[details.nameTypeFund ?? ''];
		if (cls === 'govBond' && /Unternehmen/.test(focus)) cls = 'corpBond';
		if (cls === 'govBond' && !/Staat/.test(focus)) cls = classFromText(text) === 'corpBond' ? 'corpBond' : 'govBond';
		if (cls === 'commodity' && /\bGOLD/.test(text)) cls = 'gold';
		if (!cls) cls = classFromText(text) ?? undefined;
		if (!cls) return null;
		const region = regionFromText(benchmarks) ?? FUND_REGIONS[details.fundsInvestmentRegion?.name ?? ''] ?? regionFromText(name) ?? 'world';
		return exposure(cls, {
			region,
			style: cls === 'equity' ? styleFromText(text, focus) : 'broad',
			maturity: cls === 'govBond' || cls === 'corpBond' ? maturityFromText(text) : 'intermediate',
			leverage: leverageFromText(text)
		});
	}
	return fromText(text);
}

/** Best guess from the asset's name and classification alone (CSV imports, offline). */
export function guessExposure(asset: Pick<Asset, 'name' | 'classification'>): Exposure {
	if (asset.classification === 'crypto') return exposure('crypto', { source: 'guess' });
	const text = asset.name.toUpperCase();
	const found = fromText(text);
	if (found) return { ...found, source: 'guess' };
	if (asset.classification === 'stock') return exposure('equity', { region: 'other', source: 'guess' });
	return exposure('unknown', { source: 'guess' });
}

/** Stored exposure, or a guess from the name. */
export function exposureOf(asset: Pick<Asset, 'name' | 'classification' | 'exposure'>): Exposure {
	return asset.exposure ?? guessExposure(asset);
}

/** Keep a manual exposure; otherwise take the newly derived one. */
export function mergeExposure(current: Exposure | null | undefined, derived: Exposure | null | undefined): Exposure | null {
	if (current?.source === 'manual') return current;
	return derived ?? current ?? null;
}

export function describeExposure(e: Exposure): string {
	const cls: Record<ExposureClass, string> = {
		equity: 'Equities',
		govBond: 'Government bonds',
		corpBond: 'Corporate bonds',
		gold: 'Gold',
		commodity: 'Commodities',
		crypto: 'Crypto',
		cash: 'Cash / money market',
		mixed: 'Mixed',
		unknown: 'Unknown'
	};
	const regions: Record<ExposureRegion, string> = {
		world: 'world',
		us: 'USA',
		europe: 'Europe',
		germany: 'Germany',
		emerging: 'emerging markets',
		japan: 'Japan',
		other: 'other region'
	};
	const parts = [cls[e.assetClass]];
	if (e.assetClass === 'equity' || e.assetClass === 'govBond' || e.assetClass === 'corpBond') parts.push(regions[e.region]);
	if (e.assetClass === 'equity' && e.style === 'tech') parts.push('tech');
	if (e.assetClass === 'govBond' || e.assetClass === 'corpBond') parts.push(`${e.maturity} maturity`);
	if (e.leverage !== 1) parts.push(`${e.leverage}× daily`);
	return parts.join(', ');
}
