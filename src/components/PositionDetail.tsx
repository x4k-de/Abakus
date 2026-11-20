import { useState } from 'react';
import type { Position } from '../lib/calc';
import { sortBookings } from '../lib/calc';
import { db } from '../lib/db';
import { fmtEur, fmtPrice, fmtQty, isoToDe, parseDe, round, todayIso, uid } from '../lib/num';
import { ASSET_TYP_LABEL, type AssetTyp, BOOKING_TYPE_LABEL, type Booking } from '../lib/types';
import { Field, Money, Pct, Sheet } from './ui';

interface Props {
  position: Position;
  bookings: Booking[];
  onClose: () => void;
  onEditBooking: (b: Booking) => void;
  onAddBooking: (assetId: string) => void;
}

export function PositionDetail({ position: p, bookings, onClose, onEditBooking, onAddBooking }: Props) {
  const a = p.asset;
  const isBond = a.typ === 'anleihe';
  const unit = isBond ? ' %' : ' €';
  const [price, setPrice] = useState(a.currentPrice != null ? String(a.currentPrice).replace('.', ',') : '');
  const [name, setName] = useState(a.name);
  const [typ, setTyp] = useState<AssetTyp>(a.typ);
  const [closing, setClosing] = useState(false);
  const [closeDate, setCloseDate] = useState(todayIso());
  const [closePrice, setClosePrice] = useState('');
  const list = sortBookings(bookings).reverse();

  const savePrice = async () => {
    const v = parseDe(price);
    await db.assets.update(a.id, Number.isFinite(v) ? { currentPrice: v, priceDate: todayIso(), priceSource: 'manuell' } : { currentPrice: undefined, priceDate: undefined, priceSource: undefined });
  };
  const saveMeta = async () => {
    await db.assets.update(a.id, { name: name.trim() || a.name, typ });
  };

  const closePosition = async () => {
    const rest = p.quantity;
    if (rest > 1e-9) {
      const pr = parseDe(closePrice) || 0;
      const now = new Date().toISOString();
      await db.bookings.add({
        id: uid(),
        assetId: a.id,
        type: pr > 0 ? 'verkauf' : 'auslieferung',
        date: closeDate,
        konto: Object.keys(p.perKonto)[0] ?? 'HVB',
        quantity: rest,
        price: pr,
        amount: round(rest * pr * (isBond ? 0.01 : 1)),
        fee: 0,
        tax: 0,
        note: pr > 0 ? 'Position geschlossen (Restbestand)' : 'Position geschlossen – Restbestand ausgebucht',
        source: 'manuell',
        createdAt: now,
        updatedAt: now,
      });
    }
    await db.assets.update(a.id, { closedAt: closeDate });
    setClosing(false);
    onClose();
  };
  const reopen = async () => {
    await db.assets.update(a.id, { closedAt: undefined });
  };
  const removeAsset = async () => {
    if (!window.confirm(`„${a.name}“ und alle ${bookings.length} Buchungen dazu löschen?`)) return;
    await db.transaction('rw', db.assets, db.bookings, async () => {
      await db.bookings.where('assetId').equals(a.id).delete();
      await db.assets.delete(a.id);
    });
    onClose();
  };

  return (
    <Sheet title={a.name} onClose={onClose}>
      <section className="hero compact">
        <div className="hero-label">
          {ASSET_TYP_LABEL[a.typ]}
          {a.wkn && ` · ${a.wkn}`}
          {a.symbol && a.kind === 'krypto' && ` · ${a.symbol}`}
          {a.closedAt && ` · geschlossen ${isoToDe(a.closedAt)}`}
        </div>
        <div className="hero-value num">{fmtEur(p.marketValue)}</div>
        <div className="hero-glass">
          <div>
            <div className="hero-k">Kursgewinn</div>
            <div className="hero-v">
              <Money value={p.unrealized} signed /> <Pct value={p.unrealizedPct} />
            </div>
          </div>
          <div className="right">
            <div className="hero-k">Gesamtergebnis</div>
            <div className="hero-v">
              <Money value={p.totalReturn ?? p.realized + p.incomeNet - p.extraCosts} signed />
            </div>
          </div>
        </div>
      </section>

      {p.missingBuys && (
        <p className="note warn">
          Es wurde mehr verkauft als gekauft – vermutlich fehlen ältere Kaufabrechnungen. Der Erlös dieser Stücke (
          {fmtEur(p.uncoveredProceeds)}) zählt deshalb nicht als Gewinn. Importiere die fehlenden Käufe oder trage sie nach,
          dann stimmt der realisierte Gewinn.
        </p>
      )}
      <ul className="kv-panel">
        <li>
          <span>Bestand</span>
          <span className="num">
            {fmtQty(p.quantity)} {a.kind === 'krypto' ? a.symbol : 'Stk.'}
          </span>
        </li>
        <li>
          <span>Einstand</span>
          <Money value={p.costBasis} />
        </li>
        <li>
          <span>Ø-Kaufkurs</span>
          <span className="num">{fmtPrice(p.avgPrice, unit)}</span>
        </li>
        {p.incomeNet > 0 && (
          <li>
            <span>Ø nach Ausschüttungen</span>
            <span className="num">{fmtPrice(p.effAvgPrice, unit)}</span>
          </li>
        )}
        <li>
          <span>Realisiert</span>
          <Money value={p.realized} signed />
        </li>
        {a.kind !== 'krypto' && (
          <li>
            <span>Erträge netto</span>
            <Money value={p.incomeNet} />
          </li>
        )}
        <li>
          <span>Gebühren</span>
          <Money value={p.fees} />
        </li>
        {a.isin && (
          <li>
            <span>ISIN</span>
            <span className="num muted">{a.isin}</span>
          </li>
        )}
      </ul>

      {a.kind === 'krypto' && (
        <div className="card flat">
          <h3>Verteilung & Haltefrist</h3>
          <ul className="kv">
            {Object.entries(p.perKonto).map(([k, q]) => (
              <li key={k}>
                <span>{k}</span>
                <span className="num">{fmtQty(q)}</span>
              </li>
            ))}
            <li>
              <span>davon älter als 1 Jahr (steuerfrei)</span>
              <span className="num pos">{fmtQty(p.taxFreeQty)}</span>
            </li>
            {p.nextTaxFreeDate && (
              <li>
                <span>nächster Teil steuerfrei ab</span>
                <span className="num">{isoToDe(p.nextTaxFreeDate)}</span>
              </li>
            )}
          </ul>
          <p className="muted small">Haltefrist nach FIFO (zuerst gekaufte Coins gelten als zuerst verkauft). Keine Steuerberatung.</p>
        </div>
      )}

      <div className="card flat">
        <h3>Aktueller Kurs</h3>
        <div className="row">
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={p.price ? `zuletzt ${fmtPrice(p.price, unit)}` : 'Kurs eingeben'} />
          <button className="btn" onClick={savePrice}>
            Übernehmen
          </button>
        </div>
        <p className="muted small">
          {a.priceDate ? `Stand ${isoToDe(a.priceDate)} (${a.priceSource})` : p.priceIsFallback ? 'Noch kein Kurs eingetragen – es wird der letzte Kaufkurs verwendet.' : ''}
        </p>
      </div>

      <div className="card flat">
        <div className="row between">
          <h3>Buchungen ({bookings.length})</h3>
          <button className="btn small" onClick={() => onAddBooking(a.id)}>
            + Nachtragen
          </button>
        </div>
        <ul className="blist">
          {list.map((b) => (
            <li key={b.id} onClick={() => onEditBooking(b)}>
              <div>
                <div className="bt">
                  {BOOKING_TYPE_LABEL[b.type]}
                  {b.type === 'transfer' && ` ${b.konto} → ${b.zielKonto}`}
                  {b.hint && <span className="dot warn" title="bitte prüfen" />}
                </div>
                <div className="muted small">
                  {isoToDe(b.date)} · {fmtQty(b.quantity)} {b.price ? `à ${fmtPrice(b.price, unit)}` : ''} {b.fee ? `· Gebühr ${fmtPrice(b.fee)}` : ''}
                </div>
              </div>
              <Money value={b.type === 'kauf' ? -(b.amount + b.fee) : b.type === 'transfer' ? undefined : b.amount} signed={b.type !== 'transfer'} />
            </li>
          ))}
        </ul>
      </div>

      <div className="card flat">
        <h3>Stammdaten</h3>
        <div className="grid2">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveMeta} />
          </Field>
          {a.kind === 'wertpapier' && (
            <Field label="Typ">
              <select
                value={typ}
                onChange={(e) => {
                  setTyp(e.target.value as AssetTyp);
                  void db.assets.update(a.id, { typ: e.target.value as AssetTyp });
                }}
              >
                {Object.entries(ASSET_TYP_LABEL)
                  .filter(([k]) => k !== 'krypto')
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </select>
            </Field>
          )}
        </div>
        <div className="row wrap">
          {a.closedAt ? (
            <button className="btn" onClick={reopen}>
              Wieder öffnen
            </button>
          ) : (
            <button className="btn" onClick={() => setClosing(true)}>
              Position schließen …
            </button>
          )}
          <button className="btn danger ghost" onClick={removeAsset}>
            Löschen
          </button>
        </div>
        {closing && (
          <div className="subcard">
            <p className="small">
              Die Position wandert in die Historie. {p.quantity > 1e-9 ? `Der Restbestand von ${fmtQty(p.quantity)} wird ausgebucht – mit Verkaufskurs als Verkauf, ohne Kurs als wertlos.` : ''}
            </p>
            <div className="grid2">
              <Field label="Datum">
                <input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
              </Field>
              {p.quantity > 1e-9 && (
                <Field label={`Kurs für Restbestand${unit}`}>
                  <input inputMode="decimal" value={closePrice} onChange={(e) => setClosePrice(e.target.value)} placeholder="leer = wertlos" />
                </Field>
              )}
            </div>
            <div className="row">
              <button className="btn ghost" onClick={() => setClosing(false)}>
                Abbrechen
              </button>
              <button className="btn primary" onClick={closePosition}>
                Schließen
              </button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
