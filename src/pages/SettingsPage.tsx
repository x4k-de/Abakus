import { useEffect, useRef, useState } from 'react';
import { Field } from '../components/ui';
import { downloadBackup, restoreBackup, validateBackup } from '../lib/backup';
import { computeYears } from '../lib/calc';
import { db, requestPersistence, saveSettings } from '../lib/db';
import type { AppData } from '../lib/hooks';
import { fmtEur, isoToDe, parseDe } from '../lib/num';

export function SettingsPage({ data }: { data: AppData }) {
  const s = data.settings;
  const file = useRef<HTMLInputElement>(null);
  const [max, setMax] = useState(String(s.erstattungMax).replace('.', ','));
  const [msg, setMsg] = useState('');
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const years = computeYears(data.assets, data.bookings, s, 'wertpapier', { feesInCost: s.gebuehrenImEinstand });
  const standalone = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone);

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  const restore = async (f: File) => {
    try {
      const backup = validateBackup(JSON.parse(await f.text()));
      if (!window.confirm(`Backup vom ${isoToDe(backup.exportedAt.slice(0, 10))} mit ${backup.bookings.length} Buchungen einspielen? Die aktuellen Daten werden ersetzt.`)) return;
      await restoreBackup(backup);
      setMsg('Backup eingespielt.');
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const wipe = async () => {
    if (!window.confirm('Wirklich ALLE Daten auf diesem Gerät löschen? Vorher ein Backup machen!')) return;
    await db.transaction('rw', db.assets, db.bookings, async () => {
      await db.assets.clear();
      await db.bookings.clear();
    });
    setMsg('Alle Daten gelöscht.');
  };

  return (
    <div className="page">
      <h1>Einstellungen</h1>

      <section className="card">
        <h3>Gebührenerstattung (Mitarbeiter)</h3>
        <p className="muted small">Je Kalenderjahr werden die tatsächlichen Gebühren des Kontos erstattet, höchstens bis zum Maximalbetrag.</p>
        <div className="grid2">
          <Field label="Maximal je Jahr (€)">
            <input inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} onBlur={() => Number.isFinite(parseDe(max)) && saveSettings({ erstattungMax: parseDe(max) })} />
          </Field>
          <Field label="Gilt für Konto">
            <input value={s.erstattungKonto} onChange={(e) => saveSettings({ erstattungKonto: e.target.value })} />
          </Field>
        </div>
        {years.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Jahr</th>
                  <th>Gebühren {s.erstattungKonto}</th>
                  <th>Erstattung</th>
                  <th>Abweichend (€)</th>
                </tr>
              </thead>
              <tbody>
                {years.map((y) => (
                  <tr key={y.year}>
                    <td>{y.year}</td>
                    <td className="num">{fmtEur(y.refundableFees)}</td>
                    <td className="num pos">{fmtEur(y.refund)}</td>
                    <td>
                      <input
                        className="mini"
                        inputMode="decimal"
                        defaultValue={s.erstattungOverrides[y.year] != null ? String(s.erstattungOverrides[y.year]).replace('.', ',') : ''}
                        placeholder="auto"
                        onBlur={(e) => {
                          const v = parseDe(e.target.value);
                          const o = { ...s.erstattungOverrides };
                          if (Number.isFinite(v)) o[y.year] = v;
                          else delete o[y.year];
                          void saveSettings({ erstattungOverrides: o });
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h3>Berechnung</h3>
        <label className="check">
          <input type="checkbox" checked={s.gebuehrenImEinstand} onChange={(e) => saveSettings({ gebuehrenImEinstand: e.target.checked })} />
          Gebühren in den Ø-Kaufkurs einrechnen
        </label>
        <p className="muted small">
          Aus: Ø-Kurs ohne Gebühren (wie in deiner bisherigen Tabelle), Gebühren und Erstattung werden separat gezeigt. Das Gesamtergebnis ist in beiden Fällen gleich.
        </p>
      </section>

      <section className="card">
        <h3>Backup</h3>
        <p className="muted small">
          Deine Daten liegen nur auf diesem Gerät. Exportiere regelmäßig ein Backup und lege es z. B. in iCloud Drive ab. Damit kannst du die Daten auch auf ein anderes Gerät übertragen.
          {s.lastBackup ? ` Letztes Backup: ${isoToDe(s.lastBackup.slice(0, 10))}.` : ' Noch kein Backup erstellt.'}
        </p>
        <div className="row wrap">
          <button className="btn primary" onClick={() => downloadBackup()}>
            Backup exportieren
          </button>
          <button className="btn" onClick={() => file.current?.click()}>
            Backup einspielen …
          </button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
        </div>
        {msg && <p className="note">{msg}</p>}
      </section>

      <section className="card">
        <h3>Speicher & Installation</h3>
        <ul className="kv small">
          <li>
            <span>Buchungen / Positionen</span>
            <span>
              {data.bookings.length} / {data.assets.length}
            </span>
          </li>
          <li>
            <span>Dauerhafte Speicherung</span>
            <span>{persisted == null ? '–' : persisted ? 'aktiv' : 'nicht bestätigt'}</span>
          </li>
          <li>
            <span>Als App installiert</span>
            <span>{standalone ? 'ja' : 'nein'}</span>
          </li>
        </ul>
        {!persisted && (
          <button className="btn small" onClick={() => requestPersistence().then(setPersisted)}>
            Dauerhafte Speicherung anfragen
          </button>
        )}
        {!standalone && (
          <p className="muted small">
            iPhone: In Safari auf „Teilen“ tippen und „Zum Home-Bildschirm“ wählen. Danach startet Abakus wie eine App, und die Daten sind besser vor automatischem Löschen geschützt.
          </p>
        )}
      </section>

      <section className="card">
        <h3>Daten löschen</h3>
        <button className="btn danger" onClick={wipe}>
          Alle Daten auf diesem Gerät löschen
        </button>
      </section>
      <p className="muted small center">Abakus {__APP_VERSION__}</p>
    </div>
  );
}
