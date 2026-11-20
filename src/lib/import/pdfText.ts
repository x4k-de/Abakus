// Text aus einem PDF lesen – direkt im Browser, ohne Upload.
// Die Textstücke werden zeilenweise zusammengesetzt; Spalten werden durch drei Leerzeichen getrennt,
// damit die Erkennung (hvb.ts) dieselbe Struktur sieht wie in der Druckansicht.

import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { itemsToLines, type TextItem as Item } from './pdfLines';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

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
