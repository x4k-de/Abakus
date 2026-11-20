// Berechnungen: Bestand, Ø-Kaufkurs, Ø-Preis nach Ausschüttungen, Gewinne, Gebühren und Erstattung.
//
// Methode: Durchschnittskosten (gleitender Durchschnitt).
//  - Kauf:      Bestand +Menge, Einstand +(Kurswert + Gebühren)
//  - Verkauf:   Einstand -(Ø-Einstand × Menge), realisierter Gewinn = Erlös − Gebühren − anteiliger Einstand
//  - Dividende: Ertrag +(Betrag − Steuer − Gebühren); senkt den "effektiven Ø-Preis"
//  - Transfer:  ändert nur, auf welchem Konto der Bestand liegt
// Krypto zusätzlich: FIFO-Lose, um die Haltedauer (> 1 Jahr = steuerfrei) zu zeigen.

import { type Asset, type AssetKind, type Booking, type Settings, priceFactor } from './types';

export interface Lot {
  date: string;
  quantity: number;
  costPerUnit: number;
}

export interface Position {
  asset: Asset;
  quantity: number;
  /** Einstand inkl. Kaufgebühren für den aktuellen Bestand */
  costBasis: number;
  /** Ø-Kaufkurs je Stück (inkl. Gebühren) */
  avgPrice: number;
  /** Ø-Preis nach Abzug der erhaltenen Netto-Erträge */
  effAvgPrice: number;
  /** Netto-Erträge (Dividenden, Ausschüttungen, Zinsen nach Steuern und Gebühren) */
  incomeNet: number;
  incomeGross: number;
  /** Alle Gebühren dieser Position (Kauf, Verkauf, sonstige) */
  fees: number;
  /** Separat gebuchte Gebühren/Steuern dieser Position, die nicht im Einstand stecken */
  extraCosts: number;
  realized: number;
  price?: number;
  priceIsFallback: boolean;
  marketValue?: number;
  unrealized?: number;
  unrealizedPct?: number;
  /** Gesamtergebnis: Kursgewinn + realisiert + Erträge − separate Kosten */
  totalReturn?: number;
  perKonto: Record<string, number>;
  lots: Lot[];
  /** Krypto: Menge, die länger als ein Jahr gehalten wird */
  taxFreeQty: number;
  /** Krypto: Datum, ab dem der nächste Teil steuerfrei wird */
  nextTaxFreeDate?: string;
  bookingCount: number;
  /** Mehr verkauft als gekauft – vermutlich fehlen Kaufabrechnungen */
  missingBuys: boolean;
  firstDate?: string;
  lastDate?: string;
}

const EPS = 1e-9;

export function sortBookings(bookings: Booking[]): Booking[] {
  return [...bookings].sort((a, b) =>
    a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date),
  );
}

function addYears(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y + years, m - 1, d));
  return dt.toISOString().slice(0, 10);
}

function addYear(iso: string): string {
  return addYears(iso, 1);
}

function consumeLots(lots: Lot[], qty: number): void {
  let rest = qty;
  while (rest > EPS && lots.length) {
    const lot = lots[0];
    if (lot.quantity <= rest + EPS) {
      rest -= lot.quantity;
      lots.shift();
    } else {
      lot.quantity -= rest;
      rest = 0;
    }
  }
}

export interface CalcOptions {
  /** true: Kauf-/Verkaufsgebühren fließen in den Ø-Kaufkurs ein. false: werden separat als Kosten geführt. */
  feesInCost: boolean;
}

export function computePosition(asset: Asset, bookings: Booking[], today: string, opts: CalcOptions = { feesInCost: false }): Position {
  const f = priceFactor(asset);
  let qty = 0;
  let cost = 0;
  let incomeNet = 0;
  let incomeGross = 0;
  let fees = 0;
  let extraCosts = 0;
  let realized = 0;
  let lastTradePrice: number | undefined;
  let missingBuys = false;
  const perKonto: Record<string, number> = {};
  const lots: Lot[] = [];
  const move = (konto: string, q: number) => {
    perKonto[konto] = (perKonto[konto] ?? 0) + q;
  };

  const sorted = sortBookings(bookings);
  for (const b of sorted) {
    fees += b.fee || 0;
    switch (b.type) {
      case 'kauf':
      case 'einlieferung': {
        const c = (b.amount || 0) + (opts.feesInCost ? b.fee || 0 : 0);
        if (!opts.feesInCost) extraCosts += b.fee || 0;
        qty += b.quantity;
        cost += c;
        move(b.konto, b.quantity);
        lots.push({ date: b.date, quantity: b.quantity, costPerUnit: b.quantity ? c / b.quantity : 0 });
        if (b.type === 'kauf' && b.price) lastTradePrice = b.price;
        break;
      }
      case 'verkauf':
      case 'auslieferung': {
        const avg = qty > EPS ? cost / qty : 0;
        const q = Math.min(b.quantity, qty);
        if (b.quantity > qty + 1e-6) missingBuys = true;
        const costOut = avg * q;
        cost -= costOut;
        qty -= b.quantity;
        move(b.konto, -b.quantity);
        consumeLots(lots, b.quantity);
        if (b.type === 'verkauf') {
          realized += (b.amount || 0) - (opts.feesInCost ? b.fee || 0 : 0) - (b.tax || 0) - costOut;
          if (!opts.feesInCost) extraCosts += b.fee || 0;
          if (b.price) lastTradePrice = b.price;
        }
        break;
      }
      case 'dividende':
      case 'zinsen':
        incomeGross += b.amount || 0;
        incomeNet += (b.amount || 0) - (b.tax || 0) - (b.fee || 0);
        break;
      case 'transfer': {
        move(b.konto, -b.quantity);
        if (b.zielKonto) move(b.zielKonto, b.quantity);
        extraCosts += b.fee || 0;
        break;
      }
      case 'gebuehr': {
        extraCosts += (b.fee || 0) + (b.amount || 0);
        fees += b.amount || 0;
        if (b.quantity > 0) {
          // Gebühr in Stück/Coins (z. B. Netzwerkgebühr): Bestand sinkt, Einstand bleibt
          qty -= b.quantity;
          move(b.konto, -b.quantity);
          consumeLots(lots, b.quantity);
        }
        break;
      }
      case 'steuer':
        extraCosts += (b.amount || 0) + (b.tax || 0);
        break;
    }
    if (Math.abs(qty) < EPS) {
      qty = 0;
      cost = 0;
    }
  }

  for (const k of Object.keys(perKonto)) if (Math.abs(perKonto[k]) < 1e-10) delete perKonto[k];

  const price = asset.currentPrice ?? lastTradePrice;
  const priceIsFallback = asset.currentPrice == null && lastTradePrice != null;
  const avgPrice = qty > EPS ? cost / qty / f : 0;
  const effAvgPrice = qty > EPS ? (cost - incomeNet) / qty / f : 0;
  const marketValue = qty <= EPS ? 0 : price != null ? qty * price * f : undefined;
  const unrealized = marketValue != null ? marketValue - cost : undefined;
  const unrealizedPct = unrealized != null && cost > EPS ? unrealized / cost : undefined;
  const totalReturn = unrealized != null ? unrealized + realized + incomeNet - extraCosts : undefined;

  // Haltefrist (§ 23 EStG): steuerfrei, wenn der Kauf mehr als ein Jahr zurückliegt
  const limit = addYears(today, -1);
  let taxFreeQty = 0;
  let nextTaxFreeDate: string | undefined;
  for (const lot of lots) {
    if (lot.date < limit) taxFreeQty += lot.quantity;
    else if (!nextTaxFreeDate) nextTaxFreeDate = addYear(lot.date);
  }

  return {
    asset,
    quantity: qty,
    costBasis: cost,
    avgPrice,
    effAvgPrice,
    incomeNet,
    incomeGross,
    fees,
    extraCosts,
    realized,
    price,
    priceIsFallback,
    marketValue,
    unrealized,
    unrealizedPct,
    totalReturn,
    perKonto,
    lots,
    taxFreeQty,
    nextTaxFreeDate,
    bookingCount: sorted.length,
    missingBuys,
    firstDate: sorted[0]?.date,
    lastDate: sorted[sorted.length - 1]?.date,
  };
}

export interface YearRow {
  year: string;
  fees: number;
  /** Gebühren des Erstattungskontos */
  refundableFees: number;
  refund: number;
  refundIsOverride: boolean;
  incomeNet: number;
  realized: number;
  invested: number;
}

/** Erstattung je Jahr: höchstens die tatsächlichen Gebühren, maximal erstattungMax. */
export function refundForYear(refundableFees: number, settings: Settings, year: string): { value: number; override: boolean } {
  const o = settings.erstattungOverrides?.[year];
  if (o != null && Number.isFinite(o)) return { value: o, override: true };
  return { value: Math.min(settings.erstattungMax, Math.max(0, refundableFees)), override: false };
}

export function computeYears(
  assets: Asset[],
  bookings: Booking[],
  settings: Settings,
  kind: AssetKind,
  opts: CalcOptions = { feesInCost: false },
): YearRow[] {
  const assetKind = new Map(assets.map((a) => [a.id, a.kind]));
  const rel = bookings.filter((b) => (b.assetId ? assetKind.get(b.assetId) === kind : kind === 'wertpapier'));
  const rows = new Map<string, YearRow>();
  const row = (y: string) => {
    let r = rows.get(y);
    if (!r) {
      r = { year: y, fees: 0, refundableFees: 0, refund: 0, refundIsOverride: false, incomeNet: 0, realized: 0, invested: 0 };
      rows.set(y, r);
    }
    return r;
  };
  for (const b of rel) {
    const r = row(b.date.slice(0, 4));
    const fee = (b.fee || 0) + (b.type === 'gebuehr' ? b.amount || 0 : 0);
    r.fees += fee;
    if (kind === 'wertpapier' && b.konto === settings.erstattungKonto) r.refundableFees += fee;
    if (b.type === 'dividende' || b.type === 'zinsen') r.incomeNet += (b.amount || 0) - (b.tax || 0) - (b.fee || 0);
    if (b.type === 'kauf') r.invested += (b.amount || 0) + (b.fee || 0);
  }
  // realisierte Gewinne je Jahr: Positionen chronologisch nachrechnen
  const byAsset = new Map<string, Booking[]>();
  for (const b of rel) if (b.assetId) byAsset.set(b.assetId, [...(byAsset.get(b.assetId) ?? []), b]);
  for (const [, list] of byAsset) {
    let qty = 0;
    let cost = 0;
    for (const b of sortBookings(list)) {
      if (b.type === 'kauf' || b.type === 'einlieferung') {
        qty += b.quantity;
        cost += (b.amount || 0) + (opts.feesInCost ? b.fee || 0 : 0);
      } else if (b.type === 'verkauf' || b.type === 'auslieferung') {
        const avg = qty > EPS ? cost / qty : 0;
        const q = Math.min(b.quantity, qty);
        cost -= avg * q;
        qty -= b.quantity;
        if (b.type === 'verkauf') row(b.date.slice(0, 4)).realized += (b.amount || 0) - (opts.feesInCost ? b.fee || 0 : 0) - (b.tax || 0) - avg * q;
      } else if (b.type === 'gebuehr' && b.quantity > 0) {
        qty -= b.quantity;
      }
      if (Math.abs(qty) < EPS) {
        qty = 0;
        cost = 0;
      }
    }
  }
  for (const r of rows.values()) {
    if (kind === 'wertpapier') {
      const { value, override } = refundForYear(r.refundableFees, settings, r.year);
      r.refund = value;
      r.refundIsOverride = override;
    }
  }
  return [...rows.values()].sort((a, b) => b.year.localeCompare(a.year));
}

export interface Summary {
  positions: Position[];
  closed: Position[];
  marketValue: number;
  costBasis: number;
  unrealized: number;
  realized: number;
  incomeNet: number;
  fees: number;
  refund: number;
  extraCosts: number;
  /** Gesamtergebnis inkl. Erträge und Gebührenerstattung */
  total: number;
  missingPrices: number;
  years: YearRow[];
}

export function computeSummary(
  assets: Asset[],
  bookings: Booking[],
  settings: Settings,
  kind: AssetKind,
  today: string,
): Summary {
  const opts: CalcOptions = { feesInCost: settings.gebuehrenImEinstand };
  const byAsset = new Map<string, Booking[]>();
  for (const b of bookings) if (b.assetId) byAsset.set(b.assetId, [...(byAsset.get(b.assetId) ?? []), b]);
  const all = assets
    .filter((a) => a.kind === kind)
    .map((a) => computePosition(a, byAsset.get(a.id) ?? [], today, opts));
  const isClosed = (p: Position) => !!p.asset.closedAt || (p.quantity <= EPS && p.bookingCount > 0);
  const positions = all
    .filter((p) => !isClosed(p) && p.quantity > EPS)
    .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0));
  const closed = all.filter(isClosed).sort((a, b) => (b.lastDate ?? '').localeCompare(a.lastDate ?? ''));
  const years = computeYears(assets, bookings, settings, kind, opts);

  // Buchungen ohne Wertpapier (z. B. Depotgebühr, Steuer vom Kontoauszug)
  let looseCosts = 0;
  if (kind === 'wertpapier') {
    for (const b of bookings) {
      if (b.assetId) continue;
      if (b.type === 'gebuehr') looseCosts += (b.fee || 0) + (b.amount || 0);
      if (b.type === 'steuer') looseCosts += (b.amount || 0) + (b.tax || 0);
    }
  }

  const sum = (fn: (p: Position) => number | undefined, list = all) => list.reduce((s, p) => s + (fn(p) ?? 0), 0);
  const marketValue = sum((p) => p.marketValue, positions);
  const costBasis = sum((p) => p.costBasis, positions);
  const unrealized = sum((p) => p.unrealized, positions);
  const realized = sum((p) => p.realized);
  const incomeNet = sum((p) => p.incomeNet);
  const fees = sum((p) => p.fees) + looseCosts;
  const extraCosts = sum((p) => p.extraCosts) + looseCosts;
  const refund = years.reduce((s, y) => s + y.refund, 0);
  return {
    positions,
    closed,
    marketValue,
    costBasis,
    unrealized,
    realized,
    incomeNet,
    fees,
    refund,
    extraCosts,
    total: unrealized + realized + incomeNet - extraCosts + refund,
    missingPrices: positions.filter((p) => p.price == null).length,
    years,
  };
}
