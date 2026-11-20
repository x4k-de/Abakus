import { useRef, useState } from 'react';
import { buildPreview, commitPreview, parseFile, type PreviewRow } from '../lib/import/importService';
import type { FileParseResult } from '../lib/import/model';
import { fmtEur, fmtQty, isoToDe } from '../lib/num';
import { BOOKING_TYPE_LABEL } from '../lib/types';
import { IconImport } from '../components/icons';

export function ImportPage({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<FileParseResult[]>([]);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [saved, setSaved] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);

  const handleFiles = async (files: FileList | File[]) => {
    const list = [...files];
    if (!list.length) return;
    setSaved(null);
    setProgress({ done: 0, total: list.length });
    const res: FileParseResult[] = [];
    // nacheinander, damit auch Hunderte PDFs auf dem iPhone nicht den Speicher sprengen
    for (const f of list) {
      res.push(await parseFile(f));
      setProgress({ done: res.length, total: list.length });
    }
    const all = [...results, ...res];
    setResults(all);
    setRows(await buildPreview(all));
    setProgress(null);
  };

  const toggle = (key: string) => setRows((r) => r.map((x) => (x.key === key ? { ...x, selected: !x.selected } : x)));
  const selectedCount = rows.filter((r) => r.selected).length;
  const errors = results.filter((r) => r.error);
  const stats = {
    neu: rows.filter((r) => r.status === 'neu').length,
    pruefen: rows.filter((r) => r.status === 'pruefen').length,
    duplikat: rows.filter((r) => r.status === 'duplikat').length,
  };

  const commit = async () => {
    const n = await commitPreview(rows);
    setSaved(n);
    setRows([]);
    setResults([]);
  };

  return (
    <div className="page">
      <h1>Import</h1>
      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void handleFiles(e.dataTransfer.files);
        }}
      >
        <div className="dz-icon">
          <IconImport />
        </div>
        <div className="strong">Dateien auswählen oder hierher ziehen</div>
        <div className="muted small">HVB-PDFs · BISON- und Trade-Republic-CSV</div>
        <div className="muted small">Bleibt auf diesem Gerät – nichts wird hochgeladen.</div>
        <input
          ref={input}
          type="file"
          multiple
          accept=".pdf,.csv,application/pdf,text/csv"
          hidden
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {progress && (
        <div className="card">
          <div className="strong">
            Lese Dateien … {progress.done} / {progress.total}
          </div>
          <div className="bar">
            <div style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {saved != null && (
        <div className="card success">
          <div className="strong">{saved} Buchungen übernommen.</div>
          <button className="btn" onClick={onDone}>
            Zur Übersicht
          </button>
        </div>
      )}

      {errors.length > 0 && (
        <div className="card warnbox">
          <div className="strong">{errors.length} Datei(en) nicht übernommen</div>
          <ul className="small">
            {errors.map((e) => (
              <li key={e.fileName}>
                <b>{e.fileName}</b>: {e.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="row between sticky-actions">
            <div className="small">
              <span className="tag ok">{stats.neu} neu</span> <span className="tag warn">{stats.pruefen} prüfen</span>{' '}
              <span className="tag">{stats.duplikat} schon vorhanden</span>
            </div>
            <button className="btn primary" disabled={!selectedCount} onClick={commit}>
              {selectedCount} übernehmen
            </button>
          </div>
          <ul className="blist card">
            {rows.map((r) => {
              const b = r.record.booking;
              return (
                <li key={r.key} className={r.selected ? '' : 'off'} onClick={() => toggle(r.key)}>
                  <input type="checkbox" checked={r.selected} readOnly />
                  <div className="grow">
                    <div className="bt">
                      {r.record.asset?.name ?? '–'}
                      {r.status === 'duplikat' && <span className="tag">schon vorhanden</span>}
                      {r.status === 'pruefen' && <span className="tag warn">prüfen</span>}
                      {b.currency && <span className="tag">{b.currency}</span>}
                    </div>
                    <div className="muted small">
                      {isoToDe(b.date)} · {BOOKING_TYPE_LABEL[b.type]}
                      {b.type === 'transfer' ? ` ${b.konto} → ${b.zielKonto}` : ` · ${b.konto}`} · {fmtQty(b.quantity)}
                      {b.fee ? ` · Gebühr ${fmtEur(b.fee)}` : ''}
                    </div>
                    {(r.record.warnings.length > 0 || b.hint) && <div className="small warn-text">{[b.hint, ...r.record.warnings].filter(Boolean).join(' · ')}</div>}
                  </div>
                  <div className="num">{b.type === 'transfer' ? '' : fmtEur(b.amount)}</div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {!rows.length && !progress && saved == null && (
        <div className="card flat">
          <h3>So geht's</h3>
          <ol className="small steps">
            <li>Abrechnungen aus dem HVB-Postfach als PDF speichern (z. B. in einen Ordner in „Dateien“).</li>
            <li>Hier alle auf einmal auswählen. Die App erkennt Kauf, Verkauf, Ausschüttungen und Zinsen.</li>
            <li>Vorschau prüfen: Doppelte werden automatisch abgewählt, Unklares ist mit „prüfen“ markiert.</li>
            <li>Übernehmen. Jede Buchung kannst du danach noch bearbeiten.</li>
          </ol>
        </div>
      )}
    </div>
  );
}
