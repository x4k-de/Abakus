// Text aus einem PDF lesen – direkt im Browser, ohne Upload.
// Die Textstücke werden zeilenweise zusammengesetzt; Spalten werden durch drei Leerzeichen getrennt,
// damit die Erkennung (hvb.ts) dieselbe Struktur sieht wie in der Druckansicht.
//
// Ältere HVB-Belege (etwa bis 2021) verwenden Schriften ohne Zeichenzuordnung: Der Text lässt sich
// dann nicht auslesen, sondern nur als Bild erkennen. Dafür wird die erste Seite gerendert und mit
// einer Texterkennung (tesseract.js) gelesen – ebenfalls komplett auf dem Gerät. Die dafür nötigen
// Dateien liefert die App selbst aus (public/ocr), sie werden erst bei Bedarf geladen.

import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { itemsToLines, looksGarbled, type TextItem as Item } from './pdfLines';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfText {
  text: string;
  /** true, wenn der Text per Texterkennung (OCR) gelesen wurde */
  ocr: boolean;
}

export async function pdfToText(data: ArrayBuffer): Promise<PdfText> {
  // pdf.js übernimmt den Puffer; für eine eventuelle Texterkennung eine Kopie behalten
  const copy = data.slice(0);
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
  const text = pages.join('\n');
  if (!looksGarbled(text)) return { text, ocr: false };
  return { text: await ocrFirstPage(copy), ocr: true };
}

type OcrWorker = { recognize: (img: HTMLCanvasElement) => Promise<{ data: { text: string } }> };
let workerPromise: Promise<OcrWorker> | undefined;

function getWorker(): Promise<OcrWorker> {
  workerPromise ??= (async () => {
    const { createWorker } = await import('tesseract.js');
    const base = new URL(`${import.meta.env.BASE_URL}ocr/`, location.href).href;
    return (await createWorker('deu', 1, {
      workerPath: `${base}worker.min.js`,
      corePath: base,
      langPath: base.replace(/\/$/, ''),
      workerBlobURL: false,
    })) as unknown as OcrWorker;
  })();
  return workerPromise;
}

async function ocrFirstPage(data: ArrayBuffer): Promise<string> {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  try {
    const page = await doc.getPage(1);
    // ca. 300 dpi – gut lesbar für die Texterkennung
    const viewport = page.getViewport({ scale: 4 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas nicht verfügbar');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const worker = await getWorker();
    const { data: result } = await worker.recognize(canvas);
    return result.text;
  } finally {
    await doc.destroy();
  }
}
