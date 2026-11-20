// Zentrales Datenmodell der App.
// Beträge immer in EUR, Mengen in Stück (bzw. Nennwert bei Anleihen, Coins bei Krypto).

export type AssetKind = 'wertpapier' | 'krypto';

export type AssetTyp = 'fonds' | 'etf' | 'aktie' | 'anleihe' | 'krypto' | 'sonstiges';

export interface Asset {
  id: string;
  kind: AssetKind;
  typ: AssetTyp;
  name: string;
  isin?: string;
  wkn?: string;
  /** Krypto-Kürzel, z. B. BTC */
  symbol?: string;
  /** Aktueller Kurs je Stück (bei Anleihen in Prozent) */
  currentPrice?: number;
  priceDate?: string;
  priceSource?: string; // 'manuell', 'coingecko', 'onvista, Xetra' …
  /** Optionale Notiz */
  note?: string;
  /** Position geschlossen (z. B. Fonds aufgelöst oder komplett verkauft) */
  closedAt?: string;
  /** Handelswährung, falls nicht EUR (z. B. USD) */
  currency?: string;
}

export type BookingType =
  | 'kauf'
  | 'verkauf'
  | 'dividende' // Dividende / Ausschüttung
  | 'zinsen'
  | 'einlieferung' // Zugang ohne Kauf (Geschenk, Übertrag von außen, Bonus)
  | 'auslieferung' // Abgang ohne Verkauf (Übertrag nach außen)
  | 'transfer' // Umbuchung zwischen eigenen Konten (z. B. BISON -> Ledger)
  | 'gebuehr' // separate Gebühr (Depotgebühr, Netzwerkgebühr, ...)
  | 'steuer'; // separat gebuchte Steuer (z. B. Kapitalertragsteuer vom Kontoauszug)

export type BookingSource = 'pdf' | 'csv' | 'manuell';

export interface Booking {
  id: string;
  assetId?: string;
  type: BookingType;
  /** ISO-Datum JJJJ-MM-TT */
  date: string;
  /** Konto/Plattform, z. B. HVB, BISON, Trade Republic, Ledger */
  konto: string;
  /** Nur bei transfer: Zielkonto */
  zielKonto?: string;
  /** Menge (immer positiv) */
  quantity: number;
  /** Kurs je Stück in EUR (bei Anleihen in Prozent) */
  price: number;
  /** Fremdwährung der Abrechnung, z. B. USD (Beträge oben sind immer in EUR umgerechnet) */
  currency?: string;
  /** Kurs je Stück in der Fremdwährung */
  priceOriginal?: number;
  /** Devisenkurs laut Abrechnung (Fremdwährung je 1 EUR) */
  fxRate?: number;
  /** Kurswert bzw. Bruttobetrag in EUR (immer positiv) */
  amount: number;
  /** Gebühren in EUR (immer positiv) */
  fee: number;
  /** Steuern in EUR (immer positiv, optional) */
  tax: number;
  note?: string;
  source: BookingSource;
  sourceFile?: string;
  /** Eindeutige Referenz der Bank/Plattform – verhindert doppelte Importe */
  reference?: string;
  /** true, sobald die Buchung von Hand geändert wurde */
  edited?: boolean;
  /** Hinweis aus dem Import, z. B. "bitte prüfen" */
  hint?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  id: 'settings';
  /** Maximale jährliche Gebührenerstattung (Mitarbeiter-Erstattung) */
  erstattungMax: number;
  /** Konto, dessen Gebühren erstattet werden */
  erstattungKonto: string;
  /** Manuelle Abweichung der Erstattung je Jahr */
  erstattungOverrides: Record<string, number>;
  /** Gebühren in den Ø-Kaufkurs einrechnen (false = separat ausweisen, wie in der bisherigen Tabelle) */
  gebuehrenImEinstand: boolean;
  lastBackup?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  erstattungMax: 400,
  erstattungKonto: 'HVB',
  erstattungOverrides: {},
  gebuehrenImEinstand: false,
};

export const BOOKING_TYPE_LABEL: Record<BookingType, string> = {
  kauf: 'Kauf',
  verkauf: 'Verkauf',
  dividende: 'Dividende/Ausschüttung',
  zinsen: 'Zinsen',
  einlieferung: 'Einlieferung',
  auslieferung: 'Auslieferung',
  transfer: 'Übertrag',
  gebuehr: 'Gebühr',
  steuer: 'Steuer',
};

export const ASSET_TYP_LABEL: Record<AssetTyp, string> = {
  fonds: 'Fonds',
  etf: 'ETF',
  aktie: 'Aktie',
  anleihe: 'Anleihe',
  krypto: 'Krypto',
  sonstiges: 'Sonstiges',
};

/** Kursfaktor: Anleihen werden in Prozent vom Nennwert notiert. */
export function priceFactor(asset: Pick<Asset, 'typ'> | undefined): number {
  return asset?.typ === 'anleihe' ? 0.01 : 1;
}
