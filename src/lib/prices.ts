// Aktuelle Kurse.
// Krypto: CoinGecko (kostenlos, ohne Anmeldung). Übertragen wird nur die Liste der Coin-Kürzel,
// keine Bestände.
// Wertpapiere: onvista (kostenlos, ohne Anmeldung, per ISIN). Übertragen wird nur die ISIN,
// keine Stückzahlen oder Beträge. Bevorzugt wird ein EUR-Kurs von Xetra bzw. Tradegate.

import { type AbakusDB, db as defaultDb } from './db';
import type { Asset } from './types';
import { todayIso } from './num';

export const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  XRP: 'ripple',
  SOL: 'solana',
  LTC: 'litecoin',
  ADA: 'cardano',
  DOT: 'polkadot',
  LINK: 'chainlink',
  DOGE: 'dogecoin',
  BCH: 'bitcoin-cash',
  XLM: 'stellar',
  UNI: 'uniswap',
  AVAX: 'avalanche-2',
  TRX: 'tron',
  POL: 'polygon-ecosystem-token',
  MATIC: 'polygon-ecosystem-token',
  USDC: 'usd-coin',
  USDT: 'tether',
  PEPE: 'pepe',
  SHIB: 'shiba-inu',
};

export async function updateCryptoPrices(assets?: Asset[], database: AbakusDB = defaultDb): Promise<{ updated: number; missing: string[] }> {
  const coins = assets ?? (await database.assets.where('kind').equals('krypto').toArray());
  const ids = new Map<string, string>();
  const missing: string[] = [];
  for (const c of coins) {
    const id = c.symbol ? COINGECKO_IDS[c.symbol] : undefined;
    if (id) ids.set(c.id, id);
    else missing.push(c.symbol ?? c.name);
  }
  if (!ids.size) return { updated: 0, missing };
  const url = `https://api.coingecko.com/api/v3/simple/price?vs_currencies=eur&ids=${[...new Set(ids.values())].join(',')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kursabfrage fehlgeschlagen (${res.status})`);
  const data = (await res.json()) as Record<string, { eur?: number }>;
  let updated = 0;
  const date = todayIso();
  for (const [assetId, cgId] of ids) {
    const eur = data[cgId]?.eur;
    if (eur != null) {
      await database.assets.update(assetId, { currentPrice: eur, priceDate: date, priceSource: 'coingecko' });
      updated++;
    }
  }
  return { updated, missing };
}

const ONVISTA = 'https://api.onvista.de/api/v1';
/** Börsenplätze in dieser Reihenfolge bevorzugen (alle in EUR). */
const MARKET_ORDER = ['_GER', '_GAT', '_TRO', '_LSX', '_FRA', '_STU', '_MUN', '_HAM', '_DUS', '_BER'];

interface OvQuote {
  last?: number;
  isoCurrency?: string;
  datetimeLast?: string;
  market?: { name?: string; codeMarket?: string };
}

/** Besten EUR-Kurs aus einem onvista-Snapshot wählen (reine Funktion, testbar). */
export function pickEurQuote(snapshot: { quote?: OvQuote; quoteList?: { list?: OvQuote[] } }): { price: number; date: string; market: string } | undefined {
  const all = [snapshot.quote, ...(snapshot.quoteList?.list ?? [])].filter(
    (q): q is OvQuote => !!q && q.isoCurrency === 'EUR' && typeof q.last === 'number' && q.last > 0,
  );
  if (!all.length) return undefined;
  const rank = (q: OvQuote) => {
    const i = MARKET_ORDER.indexOf(q.market?.codeMarket ?? '');
    return i < 0 ? MARKET_ORDER.length : i;
  };
  // Ein Kurs, der mehr als 7 Tage älter ist als der neueste, wird nur genommen, wenn es nichts anderes gibt.
  const newest = Math.max(...all.map((q) => Date.parse(q.datetimeLast ?? '') || 0));
  const fresh = all.filter((q) => newest - (Date.parse(q.datetimeLast ?? '') || 0) < 7 * 864e5);
  const best = (fresh.length ? fresh : all).sort((a, b) => rank(a) - rank(b))[0];
  return { price: best.last!, date: (best.datetimeLast ?? todayIso()).slice(0, 10), market: best.market?.name ?? '' };
}

async function onvistaQuote(isin: string) {
  const s = await fetch(`${ONVISTA}/instruments/search/facet?searchValue=${encodeURIComponent(isin)}`);
  if (!s.ok) throw new Error(`Kursabfrage fehlgeschlagen (${s.status})`);
  const found = (await s.json()) as { facets?: { results?: { isin?: string; entityType?: string; entityValue?: string }[] }[] };
  const hit = (found.facets ?? []).flatMap((f) => f.results ?? []).find((r) => r.isin === isin);
  if (!hit?.entityType || !hit.entityValue) return undefined;
  const r = await fetch(`${ONVISTA}/instruments/${hit.entityType}/${hit.entityValue}/snapshot`);
  if (!r.ok) return undefined;
  return pickEurQuote(await r.json());
}

/** Kurse für alle offenen Wertpapiere mit ISIN holen. */
export async function updateSecurityPrices(
  assets?: Asset[],
  database: AbakusDB = defaultDb,
): Promise<{ updated: number; missing: string[] }> {
  const list = (assets ?? (await database.assets.where('kind').equals('wertpapier').toArray())).filter((a) => !a.closedAt);
  let updated = 0;
  const missing: string[] = [];
  for (const a of list) {
    if (!a.isin) {
      missing.push(a.name);
      continue;
    }
    try {
      const q = await onvistaQuote(a.isin);
      if (!q) {
        missing.push(a.name);
        continue;
      }
      await database.assets.update(a.id, { currentPrice: q.price, priceDate: q.date, priceSource: q.market ? `onvista, ${q.market}` : 'onvista' });
      updated++;
    } catch {
      missing.push(a.name);
    }
  }
  return { updated, missing };
}

/** Alle Kurse aktualisieren (Wertpapiere bzw. Krypto). */
export async function updatePrices(kind: 'wertpapier' | 'krypto', assets?: Asset[]) {
  return kind === 'krypto' ? updateCryptoPrices(assets) : updateSecurityPrices(assets);
}
