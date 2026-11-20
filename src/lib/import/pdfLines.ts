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
