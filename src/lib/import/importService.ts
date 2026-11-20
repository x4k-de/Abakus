// Import-Ablauf: Dateien lesen -> Umsätze erkennen -> Vorschau (inkl. Duplikat-Prüfung) -> speichern.

import { type AbakusDB, db as defaultDb } from '../db';
import { uid } from '../num';
import type { Asset, Booking } from '../types';
import { detectCsv, parseBisonCsv, parseTradeRepublicCsv } from './crypto';
import { isHvbDocument, parseHvbText } from './hvb';
import type { FileParseResult, ParsedAsset, ParsedRecord } from './model';

export type PreviewStatus = 'neu' | 'duplikat' | 'pruefen';

export interface PreviewRow {
  key: string;
  record: ParsedRecord;
  status: PreviewStatus;
  /** vom Nutzer an-/abgewählt */
  selected: boolean;
  duplicateOf?: string;
}

export async function parseFile(file: File): Promise<FileParseResult> {
  const name = file.name;
  const lower = name.toLowerCase();
  try {
    if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
      const { pdfToText } = await import('./pdfText');
      const text = await pdfToText(await file.arrayBuffer());
      return parsePdfText(text, name);
    }
    if (lower.endsWith('.csv') || file.type.includes('csv') || file.type === 'text/plain') {
      return parseCsvText(await file.text(), name);
    }
    return { fileName: name, records: [], skipped: 0, error: 'Dateityp wird nicht unterstützt (nur PDF und CSV)' };
  } catch (e) {
    return { fileName: name, records: [], skipped: 0, error: `Datei konnte nicht gelesen werden: ${(e as Error).message}` };
  }
}

export function parsePdfText(text: string, fileName: string): FileParseResult {
  if (!text.trim()) return { fileName, records: [], skipped: 0, error: 'Kein Text im PDF gefunden (eingescanntes Dokument?)' };
  if (!isHvbDocument(text)) return { fileName, records: [], skipped: 0, error: 'Keine HVB-Wertpapierabrechnung erkannt' };
  const records = parseHvbText(text, fileName);
  if (!records.length) return { fileName, records, skipped: 0, error: 'Belegart noch nicht unterstützt – bitte manuell erfassen' };
  return { fileName, records, skipped: 0 };
}

export function parseCsvText(text: string, fileName: string): FileParseResult {
  const t = text.replace(/^﻿/, '');
  const kind = detectCsv(t);
  if (kind === 'bison') return parseBisonCsv(t, fileName);
  if (kind === 'traderepublic') return parseTradeRepublicCsv(t, fileName);
  return { fileName, records: [], skipped: 0, error: 'CSV-Format nicht erkannt (unterstützt: BISON, Trade Republic)' };
}

// ---------- Zuordnung zu Wertpapieren ----------

export function findAsset(assets: Asset[], p: ParsedAsset): Asset | undefined {
  if (p.kind === 'krypto') return assets.find((a) => a.kind === 'krypto' && a.symbol === p.symbol);
  return (
    (p.isin && assets.find((a) => a.isin === p.isin)) ||
    (p.wkn && assets.find((a) => a.wkn === p.wkn)) ||
    undefined
  );
}

function sameDayish(a: string, b: string, days: number): boolean {
  const d = Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
  return d <= days;
}

/** Prüft, ob es die Buchung schon gibt: zuerst über die Referenz, sonst über Inhalt. */
export function findDuplicate(existing: Booking[], assetId: string | undefined, r: ParsedRecord): Booking | undefined {
  const b = r.booking;
  if (b.reference) {
    const byRef = existing.find((e) => e.reference === b.reference);
    if (byRef) return byRef;
  }
  return existing.find(
    (e) =>
      e.assetId === assetId &&
      assetId != null &&
      e.type === b.type &&
      e.konto === b.konto &&
      Math.abs(e.quantity - b.quantity) < 1e-6 &&
      Math.abs(e.amount - b.amount) < 0.011 &&
      sameDayish(e.date, b.date, 3),
  );
}

export async function buildPreview(results: FileParseResult[], database: AbakusDB = defaultDb): Promise<PreviewRow[]> {
  const [assets, bookings] = await Promise.all([database.assets.toArray(), database.bookings.toArray()]);
  const rows: PreviewRow[] = [];
  const seenRefs = new Set<string>();
  for (const res of results) {
    res.records.forEach((record, i) => {
      const asset = record.asset ? findAsset(assets, record.asset) : undefined;
      const dup = findDuplicate(bookings, asset?.id, record);
      const ref = record.booking.reference;
      const dupInBatch = ref ? seenRefs.has(ref) : false;
      if (ref) seenRefs.add(ref);
      const status: PreviewStatus = dup || dupInBatch ? 'duplikat' : record.warnings.length ? 'pruefen' : 'neu';
      rows.push({
        key: `${res.fileName}#${i}`,
        record,
        status,
        selected: status !== 'duplikat',
        duplicateOf: dup?.id,
      });
    });
  }
  return rows.sort((a, b) => a.record.booking.date.localeCompare(b.record.booking.date));
}

/** Speichert die ausgewählten Zeilen. Legt fehlende Wertpapiere/Coins automatisch an. */
export async function commitPreview(rows: PreviewRow[], database: AbakusDB = defaultDb): Promise<number> {
  const chosen = rows.filter((r) => r.selected);
  if (!chosen.length) return 0;
  const now = new Date().toISOString();
  return database.transaction('rw', database.assets, database.bookings, async () => {
    const assets = await database.assets.toArray();
    const newBookings: Booking[] = [];
    for (const row of chosen) {
      const { record } = row;
      let assetId: string | undefined;
      if (record.asset) {
        let asset = findAsset(assets, record.asset);
        if (!asset) {
          asset = { id: uid(), ...record.asset };
          assets.push(asset);
          await database.assets.add(asset);
        } else if (record.asset.isin && !asset.isin) {
          asset.isin = record.asset.isin;
          await database.assets.update(asset.id, { isin: asset.isin });
        }
        assetId = asset.id;
      }
      newBookings.push({
        ...record.booking,
        id: uid(),
        assetId,
        hint: [record.booking.hint, ...record.warnings].filter(Boolean).join(' · ') || undefined,
        createdAt: now,
        updatedAt: now,
      });
    }
    await database.bookings.bulkAdd(newBookings);
    return newBookings.length;
  });
}
