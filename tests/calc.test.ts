import { describe, expect, it } from 'vitest';
import { computePosition, computeSummary, refundForYear } from '../src/lib/calc';
import { type Asset, type Booking, DEFAULT_SETTINGS } from '../src/lib/types';

const etf: Asset = { id: 'a1', kind: 'wertpapier', typ: 'etf', name: 'Muster ETF', currentPrice: 12 };
let n = 0;
const b = (p: Partial<Booking>): Booking => ({
  id: `b${++n}`,
  assetId: 'a1',
  type: 'kauf',
  date: '2025-01-01',
  konto: 'HVB',
  quantity: 0,
  price: 0,
  amount: 0,
  fee: 0,
  tax: 0,
  source: 'manuell',
  createdAt: `2025-01-01T00:00:${String(n).padStart(2, '0')}Z`,
  updatedAt: '',
  ...p,
});

describe('Durchschnittskurs', () => {
  const list = [
    b({ date: '2025-01-01', quantity: 10, price: 10, amount: 100, fee: 2 }),
    b({ date: '2025-02-01', quantity: 10, price: 8, amount: 80, fee: 2 }),
    b({ date: '2025-03-01', type: 'dividende', quantity: 20, amount: 10, tax: 1 }),
    b({ date: '2025-04-01', type: 'verkauf', quantity: 5, price: 11, amount: 55, fee: 1 }),
  ];

  it('ohne Gebühren im Einstand (wie bisherige Tabelle)', () => {
    const p = computePosition(etf, list, '2026-01-01', { feesInCost: false });
    expect(p.quantity).toBe(15);
    expect(p.avgPrice).toBeCloseTo(9, 6); // 180 / 20
    expect(p.costBasis).toBeCloseTo(135, 6);
    expect(p.realized).toBeCloseTo(55 - 45, 6);
    expect(p.incomeNet).toBeCloseTo(9, 6);
    expect(p.effAvgPrice).toBeCloseTo((135 - 9) / 15, 6);
    expect(p.extraCosts).toBeCloseTo(5, 6);
    expect(p.marketValue).toBeCloseTo(180, 6);
    expect(p.unrealized).toBeCloseTo(45, 6);
    expect(p.totalReturn).toBeCloseTo(45 + 10 + 9 - 5, 6);
  });

  it('mit Gebühren im Einstand ergibt dasselbe Gesamtergebnis', () => {
    const a = computePosition(etf, list, '2026-01-01', { feesInCost: false });
    const c = computePosition(etf, list, '2026-01-01', { feesInCost: true });
    expect(c.avgPrice).toBeCloseTo(184 / 20, 6);
    expect(c.totalReturn).toBeCloseTo(a.totalReturn!, 6);
  });

  it('Übertrag ändert den Bestand nicht, nur das Konto', () => {
    const coin: Asset = { id: 'c', kind: 'krypto', typ: 'krypto', name: 'Bitcoin', symbol: 'BTC' };
    const p = computePosition(coin, [
      b({ assetId: 'c', konto: 'BISON', quantity: 1, price: 100, amount: 100 }),
      b({ assetId: 'c', konto: 'BISON', zielKonto: 'Ledger', type: 'transfer', quantity: 0.6, date: '2025-02-01' }),
    ], '2026-06-01');
    expect(p.quantity).toBe(1);
    expect(p.perKonto).toEqual({ BISON: 0.4, Ledger: 0.6 });
    expect(p.taxFreeQty).toBe(1);
    expect(p.priceIsFallback).toBe(true);
  });

  it('Haltefrist: nur Käufe älter als ein Jahr sind steuerfrei (FIFO)', () => {
    const coin: Asset = { id: 'c', kind: 'krypto', typ: 'krypto', name: 'Bitcoin', symbol: 'BTC' };
    const p = computePosition(coin, [
      b({ assetId: 'c', konto: 'BISON', quantity: 1, amount: 100, date: '2024-01-01' }),
      b({ assetId: 'c', konto: 'BISON', quantity: 1, amount: 100, date: '2025-10-01' }),
      b({ assetId: 'c', konto: 'BISON', type: 'verkauf', quantity: 0.5, amount: 80, date: '2025-11-01' }),
    ], '2026-01-01');
    expect(p.taxFreeQty).toBeCloseTo(0.5, 9);
    expect(p.nextTaxFreeDate).toBe('2026-10-01');
  });
});

describe('Gebührenerstattung', () => {
  it('höchstens die tatsächlichen Gebühren, maximal 400 €', () => {
    expect(refundForYear(50, DEFAULT_SETTINGS, '2025').value).toBe(50);
    expect(refundForYear(600, DEFAULT_SETTINGS, '2025').value).toBe(400);
    expect(refundForYear(600, { ...DEFAULT_SETTINGS, erstattungOverrides: { '2025': 123 } }, '2025')).toEqual({ value: 123, override: true });
  });

  it('fließt je Jahr in das Gesamtergebnis ein', () => {
    const list = [
      b({ date: '2024-05-01', quantity: 10, amount: 100, fee: 30 }),
      b({ date: '2025-05-01', quantity: 10, amount: 100, fee: 500 }),
      b({ date: '2025-06-01', konto: 'Trade Republic', quantity: 1, amount: 10, fee: 1 }),
    ];
    const s = computeSummary([etf], list, DEFAULT_SETTINGS, 'wertpapier', '2026-01-01');
    const y = Object.fromEntries(s.years.map((r) => [r.year, r]));
    expect(y['2024'].refund).toBe(30);
    expect(y['2025'].refund).toBe(400); // TR-Gebühr zählt nicht
    expect(s.refund).toBe(430);
    expect(s.total).toBeCloseTo(s.unrealized + s.realized + s.incomeNet - s.extraCosts + 430, 6);
  });
});

describe('Geschlossene Positionen', () => {
  it('geschlossene Position landet in der Historie mit Ergebnis', () => {
    const fund: Asset = { id: 'f', kind: 'wertpapier', typ: 'fonds', name: 'Alter Fonds', closedAt: '2025-06-01' };
    const list = [
      b({ assetId: 'f', quantity: 10, amount: 100, date: '2024-01-01' }),
      b({ assetId: 'f', type: 'verkauf', quantity: 9.5, amount: 120, date: '2025-05-01' }),
      b({ assetId: 'f', type: 'auslieferung', quantity: 0.5, amount: 0, date: '2025-06-01' }),
    ];
    const s = computeSummary([fund], list, DEFAULT_SETTINGS, 'wertpapier', '2026-01-01');
    expect(s.positions).toHaveLength(0);
    expect(s.closed).toHaveLength(1);
    expect(s.closed[0].realized).toBeCloseTo(120 - 95, 6);
    expect(s.closed[0].missingBuys).toBe(false);
  });

  it('warnt, wenn mehr verkauft als gekauft wurde', () => {
    const p = computePosition(etf, [b({ type: 'verkauf', quantity: 5, amount: 50 })], '2026-01-01');
    expect(p.missingBuys).toBe(true);
    expect(p.quantity).toBe(0);
    expect(p.realized).toBe(0); // Erlös ohne Kauf ist kein Gewinn
    expect(p.uncoveredProceeds).toBe(50);
  });

  it('bei teilweise fehlenden Käufen zählt nur der gedeckte Anteil', () => {
    const p = computePosition(etf, [
      b({ date: '2025-01-01', quantity: 2, amount: 20 }),
      b({ date: '2025-02-01', type: 'verkauf', quantity: 10, amount: 150 }),
      b({ date: '2025-03-01', quantity: 1, amount: 12 }),
    ], '2026-01-01');
    expect(p.realized).toBeCloseTo(30 - 20, 6);
    expect(p.uncoveredProceeds).toBeCloseTo(120, 6);
    expect(p.quantity).toBe(1);
    expect(p.costBasis).toBeCloseTo(12, 6);
  });
});
