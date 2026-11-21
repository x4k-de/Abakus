import { useMemo, useState } from 'react';
import { BookingEditor } from '../components/BookingEditor';
import { Empty, Money } from '../components/ui';
import { sortBookings } from '../lib/calc';
import type { AppData } from '../lib/hooks';
import { fmtPrice, fmtQty, isoToDe } from '../lib/num';
import { type AssetKind, BOOKING_TYPE_LABEL, type Booking, type BookingType, bookingLabel } from '../lib/types';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export function BookingsPage({ data }: { data: AppData }) {
  const [kind, setKind] = useState<AssetKind | 'alle'>('alle');
  const [type, setType] = useState<BookingType | 'alle'>('alle');
  const [q, setQ] = useState('');
  const [onlyHints, setOnlyHints] = useState(false);
  const [edit, setEdit] = useState<{ booking?: Booking } | null>(null);
  const assetById = useMemo(() => new Map(data.assets.map((a) => [a.id, a])), [data.assets]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sortBookings(data.bookings)
      .reverse()
      .filter((b) => {
        const a = b.assetId ? assetById.get(b.assetId) : undefined;
        if (kind !== 'alle' && (a?.kind ?? 'wertpapier') !== kind) return false;
        if (type !== 'alle' && b.type !== type) return false;
        if (onlyHints && !b.hint) return false;
        if (needle) {
          const hay = `${a?.name ?? ''} ${a?.isin ?? ''} ${a?.wkn ?? ''} ${a?.symbol ?? ''} ${b.konto} ${b.note ?? ''}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      });
  }, [data.bookings, assetById, kind, type, q, onlyHints]);

  const groups = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of filtered) {
      const k = b.date.slice(0, 7);
      m.set(k, [...(m.get(k) ?? []), b]);
    }
    return [...m.entries()];
  }, [filtered]);

  const hintCount = data.bookings.filter((b) => b.hint).length;

  return (
    <div className="page">
      <div className="row between">
        <h1>Buchungen</h1>
        <button className="btn small" onClick={() => setEdit({})}>
          + Nachtragen
        </button>
      </div>
      <div className="filters">
        <input type="search" placeholder="Suchen (Name, WKN, ISIN, Konto …)" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="row filter-row">
          <div className="seg">
            {(['alle', 'wertpapier', 'krypto'] as const).map((k) => (
              <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                {k === 'alle' ? 'Alle' : k === 'wertpapier' ? 'Wertpapiere' : 'Krypto'}
              </button>
            ))}
          </div>
          <select value={type} onChange={(e) => setType(e.target.value as BookingType | 'alle')}>
            <option value="alle">Alle Arten</option>
            {Object.entries(BOOKING_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {hintCount > 0 && (
            <label className="check">
              <input type="checkbox" checked={onlyHints} onChange={(e) => setOnlyHints(e.target.checked)} /> nur zu prüfen ({hintCount})
            </label>
          )}
        </div>
      </div>

      {!filtered.length && <Empty title="Keine Buchungen">{data.bookings.length ? 'Kein Treffer für diesen Filter.' : 'Importiere Abrechnungen oder trage Buchungen von Hand nach.'}</Empty>}

      {groups.map(([month, list]) => (
        <section key={month}>
          <h2 className="section-title">
            {MONTHS[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}
          </h2>
          <ul className="blist card">
            {list.map((b) => {
              const a = b.assetId ? assetById.get(b.assetId) : undefined;
              const unit = a?.typ === 'anleihe' ? ' %' : ' €';
              const value =
                b.type === 'kauf' ? -(b.amount + b.fee) : b.type === 'verkauf' ? b.amount - b.fee : b.type === 'dividende' || b.type === 'zinsen' ? b.amount - b.tax : b.type === 'gebuehr' || b.type === 'steuer' ? -(b.amount + b.fee + b.tax) : undefined;
              return (
                <li key={b.id} onClick={() => setEdit({ booking: b })}>
                  <div className={`type-dot t-${b.type}`} />
                  <div className="grow">
                    <div className="bt">
                      {a?.name ?? (b.type === 'gebuehr' || b.type === 'steuer' ? `${BOOKING_TYPE_LABEL[b.type]} ${b.konto}` : 'ohne Zuordnung')}
                    </div>
                    <div className="muted small">
                      {isoToDe(b.date)} · {bookingLabel(b)}
                      {b.type === 'transfer' ? ` ${b.konto} → ${b.zielKonto}` : ''}
                      {b.quantity ? ` · ${fmtQty(b.quantity)}` : ''}
                      {b.price && b.type !== 'transfer' ? ` à ${fmtPrice(b.price, unit)}` : ''}
                    </div>
                  </div>
                  <div className="b-right">
                    {b.hint && <span className="dot warn" title="bitte prüfen" />}
                    {value != null && <Money value={value} signed />}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {edit && <BookingEditor booking={edit.booking} assets={data.assets} defaultKind={kind === 'krypto' ? 'krypto' : 'wertpapier'} onClose={() => setEdit(null)} />}
    </div>
  );
}
