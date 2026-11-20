// Text aus einem PDF lesen – direkt im Browser, ohne Upload.
// Die Textstücke werden zeilenweise zusammengesetzt; Spalten werden durch drei Leerzeichen getrennt,
// damit die Erkennung (hvb.ts) dieselbe Struktur sieht wie in der Druckansicht.

import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface Item {
  str: string;
  x: number;
  y: number;
  w: number;
}

export async function pdfToText(data: ArrayBuffer): Promise<string> {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const pages: string[] = [];
  // Für die Abrechnung reicht die erste Seite(n); die Rückseite enthält nur Rechtstexte.
  const maxPages = Math.min(doc.numPages, 4);
  for (let p = 1; p <= maxPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: Item[] = [];
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      const [, , , , x, y] = it.transform as number[];
      items.push({ str: it.str, x, y, w: it.width });
    }
    pages.push(itemsToLines(items));
  }
  await doc.destroy();
  return pages.join('\n');
}

export function itemsToLines(items: Item[]): string {
  // nach y gruppieren (von oben nach unten), Toleranz 2.5 pt
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Item[][] = [];
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l[0].y - it.y) < 2.5);
    if (line) line.push(it);
    else lines.push([it]);
  }
  return lines
    .map((l) => {
      l.sort((a, b) => a.x - b.x);
      let out = '';
      let end = -Infinity;
      for (const it of l) {
        const gap = it.x - end;
        if (out) out += gap > 6 ? '   ' : gap > 1 ? ' ' : '';
        out += it.str;
        end = it.x + it.w;
      }
      return out;
    })
    .join('\n');
}
