// Textstücke eines PDFs (pdf.js) zu Zeilen zusammensetzen.
// Spalten werden durch drei Leerzeichen getrennt, damit die Erkennung (hvb.ts) dieselbe Struktur sieht
// wie in der Druckansicht.

export interface TextItem {
  str: string;
  x: number;
  y: number;
  w: number;
}

export function itemsToLines(items: TextItem[]): string {
  // nach y gruppieren (von oben nach unten), Toleranz 2.5 pt
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextItem[][] = [];
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
        if (out) out += gap > 12 ? '   ' : gap > 1 ? ' ' : '';
        // gesperrt gesetzte Titel ("K a u f") je Textstück zusammenziehen
        out += /^(?:\S ){2,}\S$/.test(it.str) ? it.str.replace(/ /g, '') : it.str;
        end = it.x + it.w;
      }
      return out;
    })
    .join('\n');
}

/** Ist der ausgelesene Text unbrauchbar (Schrift ohne Zeichenzuordnung)? */
export function looksGarbled(text: string): boolean {
  if (/Wertpapier|Abrechnung|Depotnummer/i.test(text)) return false;
  const visible = text.replace(/\s/g, '');
  if (visible.length < 50) return true;
  // eslint-disable-next-line no-control-regex
  const control = (visible.match(/[\u0000-\u001f�]/g) ?? []).length;
  const letters = (visible.match(/[A-Za-zÄÖÜäöüß]/g) ?? []).length;
  return control / visible.length > 0.05 || letters / visible.length < 0.4;
}
