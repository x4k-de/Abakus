import { describe, expect, it } from 'vitest';
import { computeSummary } from '../src/lib/calc';
import { buildMerge } from '../src/lib/merge';
import { type Asset, type Booking, DEFAULT_SETTINGS } from '../src/lib/types';

// erfundene Daten
const alt: Asset = { id: 'alt', kind: 'wertpapier', typ: 'fonds', name: 'Muster Alt-Fonds', wkn: 'ALT001' };
let n = 0;
const b = (p: Partial<Booking>): Booking => ({
  id: `b${++n}`,
  assetId: 'alt',
  type: 'kauf',
  date: '2024-01-01',
  konto: 'HVB',
  quantity: 0,
  price: 0,
  amount: 0,
  fee: 0,
  tax: 0,
  source: 'manuell',
  createdAt: `2024-01-01T00:00:${String(n).padStart(2, '0')}Z`,
  updatedAt: '',
  ...p,
});

const before = [
  b({ date: '2024-01-10', quantity: 10, price: 50, amount: 500, fee: 5 }),
  b({ date: '2024-06-10', quantity: 10, price: 40, amount: 400, fee: 5 }),
  b({ date: '2024-12-01', type: 'dividende', quantity: 20, amount: 30 }),
];

function merged(newPrice?: number) {
  const s0 = computeSummary([alt], before, DEFAULT_SETTINGS, 'wertpapier', '2025-06-01');
  const r = buildMerge({
    from: s0.positions[0],
    newAsset: { name: 'Muster Neu-Fonds', isin: 'de000neu0001', wkn: 'neu001' },
    date: '2025-03-01',
    quantity: 36,
    now: '2025-03-01T10:00:00Z',
  });
  const neu = { ...r.createdAsset!, currentPrice: newPrice };
  const assets = [{ ...alt, closedAt: r.closeFromAt }, neu];
  return { r, neu, s: computeSummary(assets, [...before, ...r.bookings], DEFAULT_SETTINGS, 'wertpapier', '2025-06-01') };
}

describe('Fondsverschmelzung', () => {
  it('legt den neuen Fonds an und verknüpft beide Buchungen', () => {
    const { r, neu } = merged();
    expect(neu.isin).toBe('DE000NEU0001');
    expect(neu.wkn).toBe('NEU001');
    const [out, inn] = r.bookings;
    expect(out).toMatchObject({ assetId: 'alt', type: 'auslieferung', quantity: 20, toAssetId: neu.id });
    expect(inn).toMatchObject({ assetId: neu.id, type: 'einlieferung', quantity: 36, fromAssetId: 'alt', amount: 900 });
  });

  it('überträgt Einstand und Erträge ohne Gewinn oder Verlust', () => {
    const { s, neu } = merged(26);
    const pNeu = s.positions.find((p) => p.asset.id === neu.id)!;
    const pAlt = s.closed.find((p) => p.asset.id === 'alt')!;
    expect(pAlt.quantity).toBe(0);
    expect(pAlt.realized).toBe(0);
    expect(pNeu.quantity).toBe(36);
    expect(pNeu.costBasis).toBeCloseTo(900);
    expect(pNeu.avgPrice).toBeCloseTo(25);
    // Erträge des alten Fonds senken weiter den Ø-Preis, zählen aber nur einmal im Gesamtergebnis
    expect(pNeu.carriedIncome).toBeCloseTo(30);
    expect(pNeu.effAvgPrice).toBeCloseTo((900 - 30) / 36);
    expect(s.incomeNet).toBeCloseTo(30);
    expect(s.realized).toBe(0);
    expect(s.unrealized).toBeCloseTo(36 * 26 - 900);
  });

  it('übernimmt bei „Gebühren im Einstand“ auch die Kaufgebühren', () => {
    const settings = { ...DEFAULT_SETTINGS, gebuehrenImEinstand: true };
    const { r, neu } = merged();
    const s = computeSummary([{ ...alt, closedAt: '2025-03-01' }, neu], [...before, ...r.bookings], settings, 'wertpapier', '2025-06-01');
    expect(s.positions.find((p) => p.asset.id === neu.id)!.costBasis).toBeCloseTo(910);
  });

  it('rechnet einen späteren Verkauf des neuen Fonds mit dem übernommenen Einstand', () => {
    const { r, neu } = merged();
    const sale = b({ assetId: neu.id, type: 'verkauf', date: '2025-05-01', quantity: 18, price: 30, amount: 540 });
    const s = computeSummary([{ ...alt, closedAt: '2025-03-01' }, neu], [...before, ...r.bookings, sale], DEFAULT_SETTINGS, 'wertpapier', '2025-06-01');
    expect(s.realized).toBeCloseTo(540 - 450);
    expect(s.years.find((y) => y.year === '2025')!.realized).toBeCloseTo(90);
  });

  it('meldet fehlende Angaben', () => {
    const s0 = computeSummary([alt], before, DEFAULT_SETTINGS, 'wertpapier', '2025-06-01');
    expect(() => buildMerge({ from: s0.positions[0], newAsset: { name: 'X' }, date: '2025-03-01', quantity: 0 })).toThrow();
    expect(() => buildMerge({ from: s0.positions[0], newAsset: { name: ' ' }, date: '2025-03-01', quantity: 5 })).toThrow();
  });
});
