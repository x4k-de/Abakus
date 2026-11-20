// Import der Krypto-Umsätze aus CSV-Dateien von BISON und Trade Republic.
// Überträge auf die Ledger-Wallet werden als "Übertrag" gebucht: Sie ändern den Gesamtbestand nicht,
// nur wo die Coins liegen.

import Papa from 'papaparse';
import { parseEn, round } from '../num';
import type { FileParseResult, ParsedAsset, ParsedRecord } from './model';

export const LEDGER_KONTO = 'Ledger';
export const BISON_KONTO = 'BISON';
export const TR_KONTO = 'Trade Republic';

const COIN_NAMES: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  XRP: 'XRP',
  SOL: 'Solana',
  LTC: 'Litecoin',
  ADA: 'Cardano',
  DOT: 'Polkadot',
  LINK: 'Chainlink',
  DOGE: 'Dogecoin',
  BCH: 'Bitcoin Cash',
  XLM: 'Stellar',
  UNI: 'Uniswap',
  AVAX: 'Avalanche',
  TRX: 'Tron',
  POL: 'Polygon',
  MATIC: 'Polygon',
  USDC: 'USD Coin',
  USDT: 'Tether',
  PEPE: 'Pepe',
  SHIB: 'Shiba Inu',
};

export function coinAsset(symbol: string, name?: string): ParsedAsset {
  const s = symbol.trim().toUpperCase();
  return { kind: 'krypto', typ: 'krypto', symbol: s, name: name?.trim() || COIN_NAMES[s] || s };
}

function norm(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function detectCsv(text: string): 'bison' | 'traderepublic' | undefined {
  const head = text.slice(0, 600).toLowerCase();
  if (head.includes('transaction type') && head.includes('asset (amount)')) return 'bison';
  if (head.includes('asset_class') && head.includes('transaction_id')) return 'traderepublic';
  return undefined;
}

export function parseBisonCsv(text: string, fileName = ''): FileParseResult {
  const res = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    delimiter: ';',
    skipEmptyLines: true,
    transformHeader: norm,
    transform: (v) => v.trim(),
  });
  const records: ParsedRecord[] = [];
  let skipped = 0;
  const seen = new Map<string, number>();
  for (const row of res.data) {
    const type = (row['transaction type'] ?? '').toLowerCase();
    const sym = row['asset'] ?? '';
    const eur = parseEn(row['eur (amount)']);
    const qty = parseEn(row['asset (amount)']);
    const price = parseEn(row['asset (market price)']);
    const fee = parseEn(row['fee']);
    const dateRaw = Object.entries(row).find(([k]) => k.startsWith('date'))?.[1] ?? '';
    const date = dateRaw.slice(0, 10);
    if (!sym || !Number.isFinite(qty) || qty === 0) {
      skipped++; // Geld-Ein-/Auszahlungen in EUR oder leere Zeilen
      continue;
    }
    // BISON liefert keine Umsatz-ID: eigene Referenz aus Datum, Art und Menge
    let ref = `BISON|${dateRaw}|${type}|${sym.toUpperCase()}|${qty}`;
    const n = (seen.get(ref) ?? 0) + 1;
    seen.set(ref, n);
    if (n > 1) ref += `|${n}`;
    const warnings: string[] = [];
    const base = {
      date,
      quantity: Math.abs(qty),
      price: Number.isFinite(price) ? price : 0,
      tax: 0,
      source: 'csv' as const,
      sourceFile: fileName,
      reference: ref,
    };
    const asset = coinAsset(sym);
    if (type === 'buy' || type === 'sell') {
      records.push({
        asset,
        booking: {
          ...base,
          type: type === 'buy' ? 'kauf' : 'verkauf',
          konto: BISON_KONTO,
          amount: Number.isFinite(eur) ? Math.abs(eur) : round(Math.abs(qty) * price),
          fee: Number.isFinite(fee) ? Math.abs(fee) : 0,
        },
        warnings,
      });
    } else if (type === 'withdraw' || type === 'deposit') {
      const out = type === 'withdraw';
      records.push({
        asset,
        booking: {
          ...base,
          type: 'transfer',
          konto: out ? BISON_KONTO : LEDGER_KONTO,
          zielKonto: out ? LEDGER_KONTO : BISON_KONTO,
          amount: Number.isFinite(price) ? round(Math.abs(qty) * price) : 0,
          fee: 0,
          hint: out
            ? 'Auszahlung von BISON – als Übertrag auf den Ledger angenommen'
            : 'Einzahlung zu BISON – als Übertrag vom Ledger angenommen',
        },
        warnings,
      });
    } else {
      skipped++;
    }
  }
  return {
    fileName,
    records,
    skipped,
    error: res.errors.length && !records.length ? res.errors[0].message : undefined,
  };
}

export function parseTradeRepublicCsv(text: string, fileName = ''): FileParseResult {
  const res = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: norm,
    transform: (v) => v.trim(),
  });
  const records: ParsedRecord[] = [];
  let skipped = 0;
  for (const row of res.data) {
    if ((row['asset_class'] ?? '').toUpperCase() !== 'CRYPTO') {
      skipped++; // Aktien/Fonds von Trade Republic folgen in einem späteren Schritt
      continue;
    }
    const type = (row['type'] ?? '').toUpperCase();
    const sym = row['symbol'] ?? '';
    const qty = Math.abs(parseEn(row['shares']));
    const price = parseEn(row['price']);
    const amount = Math.abs(parseEn(row['amount']));
    const fee = Math.abs(parseEn(row['fee']));
    const tax = Math.abs(parseEn(row['tax']));
    const date = (row['date'] || row['datetime'] || '').slice(0, 10);
    const reference = row['transaction_id'] ? `TR|${row['transaction_id']}` : `TR|${row['datetime']}|${type}|${sym}|${qty}`;
    if (!sym || !Number.isFinite(qty) || qty === 0) {
      skipped++;
      continue;
    }
    const asset = coinAsset(sym, row['name']);
    const base = {
      date,
      quantity: qty,
      price: Number.isFinite(price) ? price : 0,
      tax: Number.isFinite(tax) ? tax : 0,
      fee: Number.isFinite(fee) ? fee : 0,
      source: 'csv' as const,
      sourceFile: fileName,
      reference,
    };
    if (type === 'BUY' || type === 'SELL') {
      records.push({
        asset,
        booking: {
          ...base,
          type: type === 'BUY' ? 'kauf' : 'verkauf',
          konto: TR_KONTO,
          amount: Number.isFinite(amount) ? amount : round(qty * price),
        },
        warnings: [],
      });
    } else if (type === 'FREE_DELIVERY' || type === 'FREE_RECEIPT') {
      const out = type === 'FREE_DELIVERY';
      records.push({
        asset,
        booking: {
          ...base,
          type: 'transfer',
          konto: out ? TR_KONTO : LEDGER_KONTO,
          zielKonto: out ? LEDGER_KONTO : TR_KONTO,
          amount: Number.isFinite(price) ? round(qty * price) : 0,
          hint: out
            ? 'Auslieferung von Trade Republic – als Übertrag auf den Ledger angenommen'
            : 'Einlieferung zu Trade Republic – als Übertrag vom Ledger angenommen, bitte prüfen',
        },
        warnings: [],
      });
    } else {
      skipped++;
    }
  }
  return {
    fileName,
    records,
    skipped,
    error: res.errors.length && !records.length ? res.errors[0].message : undefined,
  };
}
