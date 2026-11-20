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

const fmt = (n: number) => n.toFixed(2).replace('.', ',');

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

/**
 * Gesperrt gesetzte Überschriften ("W e r t p a p i e r - A b r e c h n u n g") zusammenziehen.
 * Die HVB setzt einige Titel mit Buchstabenabstand; pdf.js liefert sie dann mit Leerzeichen
 * zwischen jedem Zeichen.
 */
export function normalizeHvbText(text: string): string {
  return (
    text
      .replace(/(?:^|(?<=\s))((?:\S ){3,}\S)(?=\s|$)/gm, (m) => m.replace(/ /g, ''))
      // Je nach PDF zerfällt das gesperrte Wort in zwei Textstücke („Verk auf“, „Ka uf“)
      .replace(/(Abrechnung\s*)(V\s?e\s?r\s?k\s?a\s?u\s?f|K\s?a\s?u\s?f)(?![a-zäöü])/g, (_, a: string, w: string) => a + w.replace(/\s/g, ''))
  );
}

/** Ist das überhaupt ein HVB-Wertpapierbeleg? */
export function isHvbDocument(rawText: string): boolean {
  const text = normalizeHvbText(rawText);
  return /Wertpapi\s*er\s*-\s*Abrechnung|Wertpapiermitteilung/i.test(text) && /HVB|UniCredit|HypoVereinsbank|DE\s*129\s*273\s*380/i.test(text);
}

export function parseHvbText(rawText: string, fileName = ''): ParsedRecord[] {
  const text = normalizeHvbText(rawText);
  // Mehrere Belege in einem PDF? An den Überschriften trennen.
  const parts = text
    .split(/(?=Wertpapi\s*er\s*-\s*Abrechnung\s*(?:Kauf|Verkauf)|Wertpapiermitteilung\s*-\s*\S)/i)
    .filter((p) => /Wertpapi\s*er\s*-\s*Abrechnung\s*(?:Kauf|Verkauf)|Wertpapiermitteilung\s*-\s*\S/i.test(p));
  const records: ParsedRecord[] = [];
  for (const part of parts) {
    const r = /Wertpapi\s*er\s*-\s*Abrechnung/i.test(part) ? parseTrade(part, fileName) : parseIncome(part, fileName);
    if (r) records.push(r);
  }
  return records;
}

function parseTrade(text: string, fileName: string): ParsedRecord | undefined {
  const warnings: string[] = [];
  const side = /Abrechnung\s*Verkauf/i.test(text) ? 'verkauf' : 'kauf';

  // Die Zeilenlage unterscheidet sich je nach PDF-Leser (Druckansicht vs. pdf.js). Deshalb wird
  // abschnittsweise gesucht statt zeilengenau:
  //   [Wertpapierbezeichnung ... Zum Kurs von]  -> Stück/Nennwert, Name, WKN, ISIN
  //   [Zum Kurs von ... Abrechnung]             -> Kurs, Währung, Ausführungstag
  const posStart = text.search(/Wertpapierkennnummer\s*\/\s*ISIN|Wertpapierbezeichnung/);
  const kursStart = text.search(/Zum\s+Kurs\s+von/);
  if (posStart < 0 || kursStart < 0 || kursStart < posStart) return undefined;
  const posSection = text
    .slice(posStart, kursStart)
    .split('\n')
    .slice(1) // Überschriftszeile
    .join('\n');
  const abrStart = text.slice(kursStart).search(/^\s*Abrechnung\s*$|Kurswert/m);
  const kursSection = text.slice(kursStart, abrStart > 0 ? kursStart + abrStart : undefined);

  const qtyM = new RegExp(`\\b(ST|STK)\\s+${NUM}`).exec(posSection) ?? new RegExp(`\\b(EUR)\\s+${NUM}`).exec(posSection);
  if (!qtyM) return undefined;
  const nominal = qtyM[1] === 'EUR';
  const quantity = parseDe(qtyM[2]);

  // Zeilen ohne die Stück-Angabe; die erste Zeile mit WKN am Ende ist der Name
  const qtyPrefix = /^\s*(?:ST|STK|EUR)\s+[\d.,]+\s*/;
  const posLines = posSection
    .split('\n')
    .map((l) => l.replace(qtyPrefix, '').trim())
    .filter(Boolean);
  let name = '';
  let wkn: string | undefined;
  let isin: string | undefined;
  for (const l of posLines) {
    const isinM = /^(.*?)\s*\b([A-Z]{2}[A-Z0-9]{9}\d)$/.exec(l);
    if (isinM) {
      isin = isinM[2];
      if (isinM[1]) name = `${name} ${isinM[1].trim()}`.trim();
      continue;
    }
    const wknM = /^(.*?)\s{2,}([A-Z0-9]{6})$/.exec(l) ?? (!wkn ? /^(.*?)\s+([A-Z0-9]*\d[A-Z0-9]*)$/.exec(l) : null);
    if (wknM && wknM[2].length === 6 && !wkn) {
      wkn = wknM[2];
      name = `${wknM[1].trim()} ${name}`.trim();
    }
  }
  isin ??= match(text, ISIN_RE);
  if (!name) name = wkn ?? isin ?? 'Unbekanntes Wertpapier';

  // "EUR 117,92" bzw. "USD 54,10" und das Ausführungsdatum (Reihenfolge egal)
  const kursM = new RegExp(`\\b([A-Z]{3})\\s+${NUM}\\s*%?`).exec(kursSection) ?? new RegExp(`${NUM}\\s*%`).exec(kursSection);
  const kursCur = kursM && kursM.length > 2 ? kursM[1] : undefined;
  const currency = kursCur && kursCur !== 'EUR' ? kursCur : undefined;
  const priceRaw = kursM ? parseDe(kursM[kursM.length > 2 ? 2 : 1]) : NaN;
  const dateM = /(\d{2}\.\d{2}\.\d{4})/.exec(kursSection);
  let date = dateM ? deDateToIso(dateM[1]) : '';
  if (!date) {
    const abr = match(text, /Abrechnungstag[\s\S]*?(\d{2}\.\d{2}\.\d{4})/);
    date = abr ? deDateToIso(abr) : '';
    warnings.push('Ausführungstag nicht gefunden, Abrechnungstag verwendet');
  }

  const kurswertEur = parseDe(match(text, new RegExp(`Kurswert\\s+EUR\\s+${NUM}`)));
  const total = parseDe(match(text, new RegExp(`(?:Belastung|Gutschrift)\\s*(?:\\(vor\\s+Steuern\\))?\\s+EUR\\s+${NUM}`)));
  const provision = parseDe(match(text, new RegExp(`provision\\*?\\s+EUR\\s+${NUM}`, 'i')));
  const fxRate = parseDe(
    match(text, new RegExp(`Devisenkurs[^\\d\\n]*${NUM}`)) ?? match(text, new RegExp(`Umrechnungskurs\\s+1\\s+EUR\\s*=\\s*${NUM}`)),
  );
  // Devisenkosten (Aufschlag auf den Umrechnungskurs) sind Kosten wie die Provision
  const devKosten = Math.abs(parseDe(match(text, new RegExp(`Devisenkosten\\s+-?${NUM}\\s*EUR`))));
  const kurswertFx = currency ? parseDe(match(text, new RegExp(`Kurswert\\s+${currency}\\s+${NUM}`))) : NaN;

  // Kurswert in EUR: direkt aus dem Beleg, sonst über den Devisenkurs umrechnen
  let kurswert = kurswertEur;
  let fxRateDerived: number | undefined;
  if (!Number.isFinite(kurswert) && currency) {
    const fxValue = Number.isFinite(kurswertFx) ? kurswertFx : priceRaw * quantity;
    if (Number.isFinite(fxRate) && fxRate > 0) {
      kurswert = round(fxValue / fxRate);
    } else if (Number.isFinite(total)) {
      // Kein Devisenkurs im Beleg: EUR-Betrag aus Belastung/Gutschrift und Provision ableiten
      const prov = Number.isFinite(provision) ? provision : 0;
      kurswert = round(side === 'kauf' ? total - prov : total + prov);
      if (Number.isFinite(kurswertFx) && kurswert > 0) fxRateDerived = Math.round((kurswertFx / kurswert) * 1e6) / 1e6;
    } else {
      warnings.push(`Abrechnung in ${currency}: Devisenkurs nicht gefunden – bitte EUR-Betrag prüfen`);
    }
  }

  // Kurswert vor Devisenkosten, damit diese als Gebühr zählen (Gutschrift bzw. Belastung bleibt gleich)
  if (Number.isFinite(devKosten) && devKosten > 0 && Number.isFinite(kurswert) && !Number.isFinite(kurswertEur)) {
    kurswert = round(side === 'kauf' ? kurswert - devKosten : kurswert + devKosten);
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
      fxRate: currency ? (Number.isFinite(fxRate) ? fxRate : fxRateDerived) : undefined,
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
  // Als Ertrag zählt nur, was tatsächlich auf dem Konto ankommt (Gutschrift). Ausländische
  // Quellensteuer und Spesen sind reine Abzüge und werden nicht erstattet.
  const amount = Number.isFinite(gutschrift) ? gutschrift : Number.isFinite(brutto) ? brutto : NaN;
  if (!Number.isFinite(amount)) warnings.push('Betrag nicht erkannt');
  const notes: string[] = [];
  let fxRateIncome = NaN;
  if (kindWord) notes.push(`HVB ${kindWord}`);
  const quSt = parseDe(match(text, new RegExp(`Quellensteuer[^\\n]*?(?:EUR|${fxCur ?? 'EUR'})\\s+${NUM}\\s*-?`)));
  if (isFx) {
    const bruttoFx = parseDe(match(text, new RegExp(`Bruttobetrag\\s+${fxCur}\\s+${NUM}`)));
    if (Number.isFinite(bruttoFx)) notes.push(`brutto ${fmt(bruttoFx)} ${fxCur}`);
    fxRateIncome = parseDe(match(text, new RegExp(`Umrechnungskurs\\s+1\\s+EUR\\s*=\\s*${NUM}`)));
  } else if (Number.isFinite(brutto) && Number.isFinite(amount) && brutto - amount > 0.004) {
    notes.push(`brutto ${fmt(brutto)} €`);
  }
  if (Number.isFinite(quSt) && quSt > 0) notes.push(`Quellensteuer ${fmt(quSt)}${isFx ? ` ${fxCur}` : ' €'} einbehalten`);
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
      tax: 0,
      source: 'pdf',
      sourceFile: fileName,
      reference,
      currency: isFx ? fxCur : undefined,
      fxRate: isFx && Number.isFinite(fxRateIncome) ? fxRateIncome : undefined,
      note: notes.join(' · ') || undefined,
    },
    warnings,
  };
}
