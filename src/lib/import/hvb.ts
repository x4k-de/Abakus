// Erkennung von HypoVereinsbank-Abrechnungen (Text aus dem PDF).
// Unterstützt:
//  - "Wertpapier-Abrechnung Kauf" / "Verkauf" (auch Sparpläne)
//  - "Wertpapiermitteilung - Ertragszahlung" (Ausschüttung Fonds/ETF)
//  - "Wertpapiermitteilung - Dividendengutschrift" (Aktien)
//  - "Wertpapiermitteilung - Zinszahlung" (Anleihen)
// Die Kapitalertragsteuer steht nicht in diesen Belegen (separat auf dem Kontoauszug).

import { deDateToIso, parseDe, round } from '../num';
import type { AssetTyp } from '../types';
import type { ParsedRecord } from './model';

export const HVB_KONTO = 'HVB';

const NUM = '([\\d.]+(?:,\\d+)?)';
const ISIN_RE = /\b([A-Z]{2}[A-Z0-9]{9}\d)\b/;

function match(text: string, re: RegExp): string | undefined {
  const m = re.exec(text);
  return m ? m[1] : undefined;
}

function guessTyp(name: string, nominal: boolean): AssetTyp {
  if (nominal) return 'anleihe';
  const n = name.toUpperCase();
  if (/\bETF\b|UCITS|UC\.ETF|ISH\.|ISHS|XTR|VANECK|AMUNDI|LYXOR|SPDR/.test(n)) return 'etf';
  if (/FONDS|FD\.|FUND|SICAV|ANTEILE|ACT\.PORT|INHABER-ANT|NAMENS-ANT/.test(n)) return 'fonds';
  return 'aktie';
}

/** Ist das überhaupt ein HVB-Wertpapierbeleg? */
export function isHvbDocument(text: string): boolean {
  return /Wertpapi\s*er\s*-\s*Abrechnung|Wertpapiermitteilung/i.test(text) && /HVB|UniCredit|HypoVereinsbank|DE\s*129\s*273\s*380/i.test(text);
}

export function parseHvbText(text: string, fileName = ''): ParsedRecord[] {
  // Mehrere Belege in einem PDF? An den Überschriften trennen.
  const parts = text
    .split(/(?=Wertpapi\s*er\s*-\s*Abrechnung\s+(?:Kauf|Verkauf)|Wertpapiermitteilung\s*-\s*\S)/i)
    .filter((p) => /Wertpapi\s*er\s*-\s*Abrechnung\s+(?:Kauf|Verkauf)|Wertpapiermitteilung\s*-\s*\S/i.test(p));
  const records: ParsedRecord[] = [];
  for (const part of parts) {
    const r = /Wertpapi\s*er\s*-\s*Abrechnung/i.test(part) ? parseTrade(part, fileName) : parseIncome(part, fileName);
    if (r) records.push(r);
  }
  return records;
}

function parseTrade(text: string, fileName: string): ParsedRecord | undefined {
  const warnings: string[] = [];
  const side = /Abrechnung\s+Verkauf/i.test(text) ? 'verkauf' : 'kauf';

  // Zeile "ST 0,829   OM VP FLEXIBLE ...   A3D9CC" bzw. "EUR 2.000,00   4,25% ...   ABC123"
  const posLine = new RegExp(`^\\s*(ST|STK|EUR)\\s+${NUM}\\s+(.+?)\\s{2,}([A-Z0-9]{6})\\s*$`, 'm').exec(text);
  if (!posLine) return undefined;
  const nominal = posLine[1] === 'EUR';
  const quantity = parseDe(posLine[2]);
  let name = posLine[3].trim();
  const wkn = posLine[4];

  // Folgezeile: Namenszusatz + ISIN
  const after = text.slice(posLine.index + posLine[0].length).split('\n').slice(1, 3).join('\n');
  const isinLine = /^\s*(.*?)\s{2,}([A-Z]{2}[A-Z0-9]{9}\d)\s*$/m.exec(after);
  const isin = isinLine?.[2] ?? match(text, ISIN_RE);
  if (isinLine?.[1]) name = `${name} ${isinLine[1].trim()}`;

  // "EUR 117,92   01.07.2026" bzw. "USD 54,10   01.07.2026"
  const kursM = new RegExp(`Zum\\s+Kurs\\s+von[\\s\\S]*?\\n\\s*(?:([A-Z]{3})\\s+)?${NUM}\\s*%?\\s+(\\d{2}\\.\\d{2}\\.\\d{4})`).exec(text);
  const currency = kursM?.[1] && kursM[1] !== 'EUR' ? kursM[1] : undefined;
  const priceRaw = kursM ? parseDe(kursM[2]) : NaN;
  let date = kursM ? deDateToIso(kursM[3]) : '';
  if (!date) {
    const abr = match(text, /Abrechnungstag[\s\S]*?(\d{2}\.\d{2}\.\d{4})/);
    date = abr ? deDateToIso(abr) : '';
    warnings.push('Ausführungstag nicht gefunden, Abrechnungstag verwendet');
  }

  const kurswertEur = parseDe(match(text, new RegExp(`Kurswert\\s+EUR\\s+${NUM}`)));
  const total = parseDe(match(text, new RegExp(`(?:Belastung|Gutschrift)\\s*(?:\\(vor Steuern\\))?\\s+EUR\\s+${NUM}`)));
  const provision = parseDe(match(text, new RegExp(`provision\\*?\\s+EUR\\s+${NUM}`, 'i')));
  const fxRate = parseDe(match(text, new RegExp(`Devisenkurs[^\\d\\n]*${NUM}`)));
  const kurswertFx = currency ? parseDe(match(text, new RegExp(`Kurswert\\s+${currency}\\s+${NUM}`))) : NaN;

  // Kurswert in EUR: direkt aus dem Beleg, sonst über den Devisenkurs umrechnen
  let kurswert = kurswertEur;
  if (!Number.isFinite(kurswert) && currency) {
    const fxValue = Number.isFinite(kurswertFx) ? kurswertFx : priceRaw * quantity;
    if (Number.isFinite(fxRate) && fxRate > 0) {
      kurswert = round(fxValue / fxRate);
      warnings.push(`Kurswert aus ${currency} mit Devisenkurs ${fxRate} umgerechnet – bitte prüfen`);
    } else {
      warnings.push(`Abrechnung in ${currency}: Devisenkurs nicht gefunden – bitte EUR-Betrag prüfen`);
    }
  }

  let fee = 0;
  if (Number.isFinite(kurswert) && Number.isFinite(total)) {
    fee = round(side === 'kauf' ? total - kurswert : kurswert - total);
    if (fee < 0) {
      warnings.push('Gebühren konnten nicht eindeutig bestimmt werden');
      fee = Number.isFinite(provision) ? provision : 0;
    }
  } else if (Number.isFinite(provision)) {
    fee = provision;
  }
  // Preis je Stück in EUR
  const price = currency
    ? Number.isFinite(kurswert) && quantity > 0
      ? kurswert / quantity / (nominal ? 0.01 : 1)
      : NaN
    : priceRaw;

  const reference =
    match(text, /Umsatzreferenz:?\s*(\S+)/) ??
    (() => {
      const o = /(9-WP[KV]-\s*\d+)\s+(\d+)/.exec(text);
      return o ? `${o[1].replace(/\s/g, '')}/${o[2]}` : undefined;
    })();
  if (!reference) warnings.push('Keine Referenz gefunden – doppelte Importe werden über Datum und Betrag erkannt');

  if (!Number.isFinite(quantity) || quantity <= 0) warnings.push('Stückzahl nicht erkannt');
  if (!Number.isFinite(kurswert)) warnings.push('Kurswert nicht erkannt');
  if (!date) warnings.push('Datum nicht erkannt');

  const amount = Number.isFinite(kurswert) ? kurswert : Number.isFinite(price) && Number.isFinite(quantity) ? round(price * quantity * (nominal ? 0.01 : 1)) : 0;

  return {
    asset: { kind: 'wertpapier', typ: guessTyp(name, nominal), name, isin, wkn },
    booking: {
      type: side,
      date,
      konto: HVB_KONTO,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      price: Number.isFinite(price) ? price : quantity ? amount / quantity : 0,
      amount,
      fee,
      tax: 0,
      source: 'pdf',
      sourceFile: fileName,
      reference,
      currency,
      priceOriginal: currency && Number.isFinite(priceRaw) ? priceRaw : undefined,
      fxRate: currency && Number.isFinite(fxRate) ? fxRate : undefined,
    },
    warnings,
  };
}

function parseIncome(text: string, fileName: string): ParsedRecord | undefined {
  const warnings: string[] = [];
  const kindWord = match(text, /Wertpapiermitteilung\s*-\s*(\S+)/) ?? '';
  const isZins = /Zins/i.test(kindWord);

  // "ISH.ST.GL.SEL.DIV.100 U.ETF DE   Wertpapierkennnummer   A0F5UH / DE000A0F5UH1"
  const head = /^\s*(.+?)\s+Wertpapierkennnummer\s+([A-Z0-9]{6})\s*\/\s*([A-Z]{2}[A-Z0-9]{9}\d)/m.exec(text);
  if (!head) return undefined;
  let name = head[1].trim();
  const wkn = head[2];
  const isin = head[3];
  const nextLine = text.slice(head.index + head[0].length).split('\n')[1]?.trim() ?? '';
  const zusatz = nextLine.split(/\s{2,}/)[0];
  if (zusatz && !/^(Geschäftsjahr|Zinsen|Stück|Nennwert|Ex-Tag|Zahlweise|-{3,})/.test(zusatz)) name = `${name} ${zusatz}`;

  const stueck = parseDe(match(text, new RegExp(`Stück\\s+${NUM}`)));
  const nennwert = parseDe(match(text, new RegExp(`Nennwert\\s+EUR\\s+${NUM}`)));
  const nominal = !Number.isFinite(stueck) && Number.isFinite(nennwert);
  const quantity = Number.isFinite(stueck) ? stueck : Number.isFinite(nennwert) ? nennwert : 0;

  const brutto = parseDe(match(text, new RegExp(`Bruttobetrag\\s+EUR\\s+${NUM}`)));
  const gutschrift = parseDe(match(text, new RegExp(`Gutschrift\\s+EUR\\s+${NUM}`)));
  const perUnit = parseDe(match(text, new RegExp(`zahlbar\\s+mit\\s+(?:EUR\\s+)?${NUM}`)));
  const valuta = match(text, /Valuta\s+(\d{2}\.\d{2}\.\d{4})/);
  const date = valuta ? deDateToIso(valuta) : deDateToIso(match(text, /Datum[\s\S]*?(\d{2}\.\d{2}\.\d{4})/) ?? '');
  const reference = match(text, /Referenz\s+(\S+)/);

  const fxCur = match(text, /Bruttobetrag\s+([A-Z]{3})\s/);
  const isFx = !!fxCur && fxCur !== 'EUR';
  if (isFx) warnings.push(`Ertrag in ${fxCur}: EUR-Gutschrift übernommen (nach Abzügen) – bitte prüfen`);
  const amount = Number.isFinite(brutto) ? brutto : Number.isFinite(gutschrift) ? gutschrift : NaN;
  if (!Number.isFinite(amount)) warnings.push('Betrag nicht erkannt');
  // Abzüge zwischen Brutto und Gutschrift (z. B. Quellensteuer, Spesen)
  let tax = 0;
  if (Number.isFinite(brutto) && Number.isFinite(gutschrift) && brutto - gutschrift > 0.004) {
    tax = round(brutto - gutschrift);
    warnings.push('Abzüge (z. B. ausländische Quellensteuer) als Steuer übernommen – bitte prüfen');
  }
  if (!reference) warnings.push('Keine Referenz gefunden');
  if (!date) warnings.push('Datum nicht erkannt');

  return {
    asset: { kind: 'wertpapier', typ: guessTyp(name, nominal), name, isin, wkn },
    booking: {
      type: isZins ? 'zinsen' : 'dividende',
      date,
      konto: HVB_KONTO,
      quantity,
      price: Number.isFinite(perUnit) ? perUnit : 0,
      amount: Number.isFinite(amount) ? amount : 0,
      fee: 0,
      tax,
      source: 'pdf',
      sourceFile: fileName,
      reference,
      currency: isFx ? fxCur : undefined,
      note: kindWord ? `HVB ${kindWord}` : undefined,
    },
    warnings,
  };
}
