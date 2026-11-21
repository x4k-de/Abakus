// Fondsverschmelzung: Der alte Fonds geht vollständig in einen neuen Fonds über (neue WKN/ISIN, neue Stückzahl).
// Steuerlich neutral – es entsteht kein Gewinn oder Verlust. Abgebildet als
//  - Auslieferung des gesamten Bestands beim alten Fonds (verweist per toAssetId auf den neuen) und
//  - Einlieferung der neuen Stücke beim neuen Fonds (verweist per fromAssetId auf den alten).
// Die Berechnung (calc.ts) übernimmt Einstand und bisherige Erträge des alten Fonds automatisch.

import type { Position } from './calc';
import { round, uid } from './num';
import type { Asset, Booking } from './types';

export interface MergeInput {
  /** Position des alten Fonds */
  from: Position;
  /** Ziel: vorhandener Fonds … */
  toAsset?: Asset;
  /** … oder ein neu anzulegender */
  newAsset?: { name: string; isin?: string; wkn?: string; typ?: Asset['typ'] };
  date: string;
  /** Stückzahl im neuen Fonds */
  quantity: number;
  now?: string;
}

export interface MergeResult {
  createdAsset?: Asset;
  bookings: Booking[];
  /** Datum, an dem der alte Fonds geschlossen wird */
  closeFromAt: string;
}

export function buildMerge(input: MergeInput): MergeResult {
  const { from, date, quantity } = input;
  if (!(quantity > 0)) throw new Error('Bitte die neue Stückzahl angeben.');
  if (!(from.quantity > 0)) throw new Error('Der alte Fonds hat keinen Bestand.');
  const now = input.now ?? new Date().toISOString();
  let target = input.toAsset;
  let createdAsset: Asset | undefined;
  if (!target) {
    const n = input.newAsset;
    if (!n?.name.trim()) throw new Error('Bitte den neuen Fonds auswählen oder einen Namen angeben.');
    createdAsset = {
      id: uid(),
      kind: 'wertpapier',
      typ: n.typ ?? from.asset.typ,
      name: n.name.trim(),
      isin: n.isin?.trim().toUpperCase() || undefined,
      wkn: n.wkn?.trim().toUpperCase() || undefined,
    };
    target = createdAsset;
  }
  if (target.id === from.asset.id) throw new Error('Alter und neuer Fonds müssen verschieden sein.');
  const konto = Object.keys(from.perKonto)[0] ?? 'HVB';
  const cost = round(from.costBasis);
  const base = { date, konto, fee: 0, tax: 0, source: 'manuell' as const, createdAt: now, updatedAt: now };
  const out: Booking = {
    ...base,
    id: uid(),
    assetId: from.asset.id,
    type: 'auslieferung',
    quantity: from.quantity,
    price: 0,
    amount: cost,
    toAssetId: target.id,
    note: `Fondsverschmelzung in ${target.name}`,
  };
  const inn: Booking = {
    ...base,
    id: uid(),
    assetId: target.id,
    type: 'einlieferung',
    quantity,
    price: round(cost / quantity, 4),
    amount: cost,
    fromAssetId: from.asset.id,
    note: `Fondsverschmelzung aus ${from.asset.name}`,
  };
  return { createdAsset, bookings: [out, inn], closeFromAt: date };
}
