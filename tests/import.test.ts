import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseHvbText } from '../src/lib/import/hvb';
import { itemsToLines } from '../src/lib/import/pdfLines';
import { parseCsvText, parsePdfText } from '../src/lib/import/importService';
import { migrateIncomeToNet } from '../src/lib/db';
import type { Booking } from '../src/lib/types';

// Alle Testdaten sind erfunden – es werden niemals echte Abrechnungen eingecheckt.
const fx = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8');

describe('HVB-Abrechnungen', () => {
  it('erkennt einen Kauf (Sparplan) mit Gebühr', () => {
    const [r] = parseHvbText(fx('hvb-kauf.txt'), 'kauf.pdf');
    expect(r.warnings).toEqual([]);
    expect(r.asset).toMatchObject({ isin: 'LU0000000001', wkn: 'A1B2C3', kind: 'wertpapier' });
    expect(r.asset?.name).toContain('MUSTER FLEXIBLE ALLOCATION');
    expect(r.booking).toMatchObject({
      type: 'kauf',
      date: '2026-07-01',
      konto: 'HVB',
      quantity: 0.829,
      price: 117.92,
      amount: 97.76,
      fee: 2.2,
      reference: '20260702WAB0000000001',
    });
  });

  it('erkennt einen Verkauf ohne Gebühr', () => {
    const [r] = parseHvbText(fx('hvb-verkauf.txt'));
    expect(r.booking).toMatchObject({ type: 'verkauf', date: '2026-01-13', quantity: 2.475, price: 388.09, amount: 960.52, fee: 0 });
    expect(r.asset?.isin).toBe('LU0000000002');
  });

  it('erkennt eine Ausschüttung (Ertragszahlung)', () => {
    const [r] = parseHvbText(fx('hvb-ertrag.txt'));
    expect(r.booking).toMatchObject({ type: 'dividende', date: '2026-10-15', quantity: 76.982, amount: 32.11, tax: 0 });
    expect(r.asset).toMatchObject({ wkn: 'C3D4E5', isin: 'DE0000000003', typ: 'etf' });
    expect(r.booking.reference).toBe('20261014KUP0000000003');
  });

  it('nimmt bei Quellensteuer nur die Gutschrift als Ertrag – ohne Prüf-Hinweis', () => {
    const [r] = parseHvbText(fx('hvb-ertrag-qust.txt'));
    expect(r.warnings).toEqual([]);
    expect(r.booking).toMatchObject({ type: 'dividende', date: '2026-09-09', quantity: 100, amount: 34, tax: 0 });
    expect(r.booking.note).toContain('Quellensteuer 6,00 € einbehalten');
    expect(r.asset).toMatchObject({ wkn: 'H8J9K0', isin: 'NL0000000008' });
  });

  it('USD-Ertrag: EUR-Gutschrift ohne Prüf-Hinweis, mit Umrechnungskurs', () => {
    const [r] = parseHvbText(fx('hvb-ertrag-usd.txt'));
    expect(r.warnings).toEqual([]);
    expect(r.booking).toMatchObject({ amount: 40, tax: 0, currency: 'USD', fxRate: 1.25, date: '2026-10-02' });
    expect(r.booking.note).toContain('brutto 50,00 USD');
  });

  it('Erträge älterer Importe werden auf netto umgestellt', () => {
    const b = {
      id: 'x', assetId: 'a', type: 'dividende', date: '2026-09-09', konto: 'HVB', quantity: 100, price: 0.4,
      amount: 40, fee: 0, tax: 6, source: 'pdf', createdAt: '', updatedAt: '',
      hint: 'Abzüge (z. B. ausländische Quellensteuer) als Steuer übernommen – bitte prüfen',
    } as Booking;
    expect(migrateIncomeToNet(b)).toBe(true);
    expect(b).toMatchObject({ amount: 34, tax: 0, hint: undefined });
    expect(migrateIncomeToNet({ ...b, tax: 5, edited: true })).toBe(false);
  });

  it('erkennt Anleihe-Zinsen mit Nennwert', () => {
    const [r] = parseHvbText(fx('hvb-zinsen.txt'));
    expect(r.booking).toMatchObject({ type: 'zinsen', date: '2026-06-29', quantity: 2000, amount: 13.76 });
    expect(r.asset).toMatchObject({ typ: 'anleihe', isin: 'DE0000000004' });
  });

  it('liest Kaufabrechnungen auch in der Zeilenlage von pdf.js (gesperrter Titel, Stück in eigener Zeile)', () => {
    const r = parsePdfText(fx('hvb-kauf-pdfjs.txt'), 'kauf.PDF');
    expect(r.error).toBeUndefined();
    const [x] = r.records;
    expect(x.warnings).toEqual([]);
    expect(x.asset).toMatchObject({ wkn: 'F6G7H8', isin: 'DE0000000007', name: 'MUSTER.ST.GL.DIV.100 U.ETF DE INHABER-ANTEILE' });
    expect(x.booking).toMatchObject({ type: 'kauf', date: '2026-07-01', quantity: 1.29, price: 38.17, amount: 49.24, fee: 0.74 });
  });

  it('rechnet USD-Abrechnungen in EUR', () => {
    const [r] = parseHvbText(fx('hvb-kauf-usd.txt'));
    expect(r.booking).toMatchObject({ type: 'kauf', quantity: 2, amount: 100, fee: 1.5, currency: 'USD', priceOriginal: 54.1, fxRate: 1.082 });
    expect(r.booking.price).toBeCloseTo(50, 6);
  });

  it('liest USD-Verkäufe mit Umrechnungskurs und Devisenkosten (Titel in zwei Stücken)', () => {
    const r = parsePdfText(fx('hvb-verkauf-usd-pdfjs.txt'), 'v.PDF');
    expect(r.error).toBeUndefined();
    const [x] = r.records;
    expect(x.warnings).toEqual([]);
    expect(x.asset).toMatchObject({ wkn: 'P4Q5R6', isin: 'LU0000000010' });
    expect(x.booking).toMatchObject({ type: 'verkauf', date: '2026-01-13', quantity: 20, currency: 'USD', priceOriginal: 60, fxRate: 1.25, amount: 964, fee: 4 });
  });

  it('erkennt ältere Ertragsmitteilungen ohne Bankangaben auf Seite 1', () => {
    const r = parsePdfText(fx('hvb-ertrag-alt.txt'), 'alt.PDF');
    expect(r.error).toBeUndefined();
    expect(r.records[0].booking).toMatchObject({ type: 'dividende', date: '2025-01-21', quantity: 0.5, amount: 3.5 });
    expect(r.records[0].asset).toMatchObject({ wkn: 'S7T8U9', name: 'MUSTER VALUE FONDS INHABER-ANTEILE C' });
  });

  it('lehnt fremde PDFs ab', () => {
    expect(parsePdfText('Irgendein Brief', 'x.pdf').error).toBeTruthy();
  });
});

describe('Krypto-CSV', () => {
  it('BISON: Käufe, Verkäufe und Überträge zum Ledger', () => {
    const r = parseCsvText(fx('bison.csv'), 'bison.csv');
    expect(r.error).toBeUndefined();
    expect(r.skipped).toBe(1); // EUR-Einzahlung
    const types = r.records.map((x) => x.booking.type);
    expect(types).toEqual(['kauf', 'kauf', 'verkauf', 'transfer', 'transfer', 'kauf']);
    const w = r.records[3].booking;
    expect(w).toMatchObject({ konto: 'BISON', zielKonto: 'Ledger', quantity: 0.015 });
    const d = r.records[4].booking;
    expect(d).toMatchObject({ konto: 'Ledger', zielKonto: 'BISON', quantity: 0.005 });
    expect(r.records[0].asset).toMatchObject({ symbol: 'BTC', name: 'Bitcoin' });
    // Referenzen sind eindeutig
    expect(new Set(r.records.map((x) => x.booking.reference)).size).toBe(r.records.length);
  });

  it('Trade Republic: nur Krypto, Gebühr und Übertrag', () => {
    const r = parseCsvText(fx('traderepublic.csv'), 'tr.csv');
    expect(r.records).toHaveLength(3);
    expect(r.skipped).toBe(2);
    expect(r.records[0].booking).toMatchObject({ type: 'kauf', konto: 'Trade Republic', quantity: 0.001, amount: 78, fee: 1, reference: 'TR|aaaa-1111' });
    expect(r.records[1].booking).toMatchObject({ type: 'transfer', konto: 'Ledger', zielKonto: 'Trade Republic' });
    expect(r.records[2].booking).toMatchObject({ type: 'transfer', konto: 'Trade Republic', zielKonto: 'Ledger', quantity: 0.003 });
  });

  it('erkennt unbekannte CSV', () => {
    expect(parseCsvText('a;b;c\n1;2;3', 'x.csv').error).toBeTruthy();
  });
});

describe('PDF-Zeilen', () => {
  it('zieht gesperrte Titel zusammen und trennt Spalten', () => {
    const t = itemsToLines([
      { str: 'W e r t p a p i e r - A b r e c h n u n g', x: 63, y: 772.8, w: 176 },
      { str: 'K a u f', x: 247.4, y: 772.8, w: 32 },
      { str: 'Kurswert', x: 63, y: 700, w: 30 },
      { str: 'EUR', x: 400, y: 700.5, w: 15 },
    ]);
    expect(t.split('\n')).toEqual(['Wertpapier-Abrechnung Kauf', 'Kurswert   EUR']);
  });
});
