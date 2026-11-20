// Kopiert die Dateien der Texterkennung (tesseract.js) nach public/ocr, damit die App sie selbst
// ausliefert – ohne fremdes CDN. Läuft automatisch vor `npm run dev` und `npm run build`.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'ocr');
mkdirSync(out, { recursive: true });
const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/deu/4.0.0/deu.traineddata.gz', 'deu.traineddata.gz'],
];
for (const [from, to] of files) {
  const src = join(root, from);
  if (!existsSync(src)) throw new Error(`Fehlt: ${from} – bitte \`npm install\` ausführen`);
  copyFileSync(src, join(out, to));
}
console.log(`Texterkennung: ${files.length} Dateien nach public/ocr kopiert`);
