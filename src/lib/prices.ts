// Aktuelle Kurse.
// Krypto: CoinGecko (kostenlos, ohne Anmeldung). Übertragen wird nur die Liste der Coin-Kürzel,
// keine Bestände.
// Wertpapiere: vorerst manuelle Eingabe (eine automatische Kursquelle folgt in einem späteren Schritt).

import { type AbakusDB, db as defaultDb } from './db';
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

export async function updateCryptoPrices(database: AbakusDB = defaultDb): Promise<{ updated: number; missing: string[] }> {
  const coins = await database.assets.where('kind').equals('krypto').toArray();
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
