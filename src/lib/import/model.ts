import type { AssetKind, AssetTyp, Booking } from '../types';

export interface ParsedAsset {
  kind: AssetKind;
  typ: AssetTyp;
  name: string;
  isin?: string;
  wkn?: string;
  symbol?: string;
}

export type ParsedBooking = Omit<Booking, 'id' | 'assetId' | 'createdAt' | 'updatedAt'>;

/** Ein erkannter Umsatz aus einer Datei, noch nicht gespeichert. */
export interface ParsedRecord {
  booking: ParsedBooking;
  /** fehlt z. B. bei reinen Geldbewegungen */
  asset?: ParsedAsset;
  warnings: string[];
}

export interface FileParseResult {
  fileName: string;
  records: ParsedRecord[];
  /** Fehlermeldung, wenn die Datei gar nicht verstanden wurde */
  error?: string;
  /** Zeilen/Einträge, die bewusst übersprungen wurden (z. B. Einzahlungen in EUR) */
  skipped: number;
}
