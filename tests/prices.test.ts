import { describe, expect, it } from 'vitest';
import { pickEurQuote } from '../src/lib/prices';

const q = (codeMarket: string, last: number, isoCurrency = 'EUR', datetimeLast = '2026-11-20T16:35:00Z') => ({
  last,
  isoCurrency,
  datetimeLast,
  market: { codeMarket, name: codeMarket },
});

describe('Kurswahl (onvista)', () => {
  it('bevorzugt Xetra in EUR, ignoriert Fremdwährung', () => {
    const r = pickEurQuote({ quote: q('_LSX', 10.5), quoteList: { list: [q('_LSE', 12, 'USD'), q('_GAT', 10.4), q('_GER', 10.45)] } });
    expect(r).toEqual({ price: 10.45, date: '2026-11-20', market: '_GER' });
  });

  it('nimmt keinen veralteten Kurs, wenn ein aktueller da ist', () => {
    const r = pickEurQuote({ quoteList: { list: [q('_GER', 9, 'EUR', '2026-01-02T10:00:00Z'), q('_STU', 11)] } });
    expect(r?.price).toBe(11);
  });

  it('kein EUR-Kurs: nichts', () => {
    expect(pickEurQuote({ quote: q('_LSE', 12, 'USD') })).toBeUndefined();
  });
});
