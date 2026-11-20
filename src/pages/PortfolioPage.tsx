import { useMemo, useState } from 'react';
import { BookingEditor } from '../components/BookingEditor';
import { PositionDetail } from '../components/PositionDetail';
import { Empty, Money, Pct, Stat } from '../components/ui';
import { computeSummary, type Position } from '../lib/calc';
import type { AppData } from '../lib/hooks';
import { fmtEur, fmtPrice, fmtQty, isoToDe, todayIso } from '../lib/num';
import { updateCryptoPrices } from '../lib/prices';
import { ASSET_TYP_LABEL, type AssetKind, type Booking } from '../lib/types';

interface Props {
  data: AppData;
  kind: AssetKind;
  onGoImport: () => void;
}

export function PortfolioPage({ data, kind, onGoImport }: Props) {
  const today = todayIso();
  const s = useMemo(() => computeSummary(data.assets, data.bookings, data.settings, kind, today), [data, kind, today]);
  const [detailId, setDetailId] = useState<string>();
  const [edit, setEdit] = useState<{ booking?: Booking; assetId?: string } | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const all = [...s.positions, ...s.closed];
  const detail = all.find((p) => p.asset.id === detailId);
  const isCrypto = kind === 'krypto';

  const refreshPrices = async () => {
    setBusy(true);
    setMsg('');
    try {
      const r = await updateCryptoPrices();
      setMsg(`${r.updated} Kurse aktualisiert${r.missing.length ? ` · ohne Kursquelle: ${r.missing.join(', ')}` : ''}`);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (data.loaded && !all.length) {
    return (
      <Empty title={isCrypto ? 'Noch keine Krypto-Umsätze' : 'Noch keine Wertpapiere'}>
        <p>{isCrypto ? 'Lade deine BISON- oder Trade-Republic-CSV hoch.' : 'Lade deine HVB-Abrechnungen (PDF) hoch – gern viele auf einmal.'}</p>
        <button className="btn primary" onClick={onGoImport}>
          Zum Import
        </button>
      </Empty>
    );
  }

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-label">{isCrypto ? 'Krypto-Bestand' : 'Depotwert'}</div>
        <div className="hero-value">{fmtEur(s.marketValue)}</div>
        <div className="hero-sub">
          <Money value={s.unrealized} signed /> <Pct value={s.costBasis ? s.unrealized / s.costBasis : undefined} />
          <span className="muted"> Kursgewinn</span>
        </div>
        {s.missingPrices > 0 && <div className="hero-warn">{s.missingPrices} Position(en) ohne Kurs</div>}
      </section>

      <section className="stats">
        <Stat label="Gesamtergebnis" hint={isCrypto ? 'inkl. Verkäufe, abzgl. Gebühren' : 'inkl. Erträge & Erstattung'}>
          <Money value={s.total} signed />
        </Stat>
        <Stat label="Einstand">
          <Money value={s.costBasis} />
        </Stat>
        {!isCrypto && (
          <Stat label="Dividenden & Zinsen">
            <Money value={s.incomeNet} />
          </Stat>
        )}
        <Stat label="Realisiert">
          <Money value={s.realized} signed />
        </Stat>
        <Stat label="Gebühren">
          <Money value={s.fees} />
        </Stat>
        {!isCrypto && (
          <Stat label="Erstattung" hint={`max. ${fmtEur(data.settings.erstattungMax)} je Jahr`}>
            <Money value={s.refund} className="pos" />
          </Stat>
        )}
      </section>

      {isCrypto && (
        <div className="row">
          <button className="btn" onClick={refreshPrices} disabled={busy}>
            {busy ? 'Lade Kurse …' : '↻ Kurse aktualisieren'}
          </button>
          {msg && <span className="muted small">{msg}</span>}
        </div>
      )}

      <h2 className="section-title">Positionen</h2>
      <div className="cards">
        {s.positions.map((p) => (
          <PositionCard key={p.asset.id} p={p} onClick={() => setDetailId(p.asset.id)} />
        ))}
        {!s.positions.length && <p className="muted">Keine offenen Positionen.</p>}
      </div>

      {!isCrypto && s.years.length > 0 && (
        <>
          <h2 className="section-title">Jahresübersicht</h2>
          <div className="card table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Jahr</th>
                  <th>Investiert</th>
                  <th>Erträge</th>
                  <th>Realisiert</th>
                  <th>Gebühren</th>
                  <th>Erstattung</th>
                  <th>Netto-Gebühren</th>
                </tr>
              </thead>
              <tbody>
                {s.years.map((y) => (
                  <tr key={y.year}>
                    <td>{y.year}</td>
                    <td className="num">{fmtEur(y.invested)}</td>
                    <td className="num">{fmtEur(y.incomeNet)}</td>
                    <td className={`num ${y.realized > 0 ? 'pos' : y.realized < 0 ? 'neg' : ''}`}>{fmtEur(y.realized)}</td>
                    <td className="num">{fmtEur(y.fees)}</td>
                    <td className="num pos">
                      {fmtEur(y.refund)}
                      {y.refundIsOverride && ' ✎'}
                    </td>
                    <td className="num">{fmtEur(y.fees - y.refund)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {s.closed.length > 0 && (
        <>
          <button className="section-title as-btn" onClick={() => setShowClosed(!showClosed)}>
            Historie geschlossener Positionen ({s.closed.length}) {showClosed ? '▾' : '▸'}
          </button>
          {showClosed && (
            <div className="cards">
              {s.closed.map((p) => {
                const res = p.realized + p.incomeNet - p.extraCosts;
                return (
                  <button key={p.asset.id} className="pos-card closed" onClick={() => setDetailId(p.asset.id)}>
                    <div className="pc-main">
                      <div className="pc-name">{p.asset.name}</div>
                      <div className="muted small">
                        {p.firstDate && isoToDe(p.firstDate)} – {isoToDe(p.asset.closedAt ?? p.lastDate ?? '')} · {ASSET_TYP_LABEL[p.asset.typ]}
                      </div>
                    </div>
                    <div className="pc-right">
                      <Money value={res} signed />
                      <div className="muted small">{res >= 0 ? 'Gewinn' : 'Verlust'}</div>
                      {p.missingBuys && <div className="tag warn">Käufe fehlen?</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {detail && (
        <PositionDetail
          position={detail}
          bookings={data.bookings.filter((b) => b.assetId === detail.asset.id)}
          onClose={() => setDetailId(undefined)}
          onEditBooking={(b) => setEdit({ booking: b })}
          onAddBooking={(assetId) => setEdit({ assetId })}
        />
      )}
      {edit && (
        <BookingEditor booking={edit.booking} defaultAssetId={edit.assetId} assets={data.assets} defaultKind={kind} onClose={() => setEdit(null)} />
      )}
    </div>
  );
}

function PositionCard({ p, onClick }: { p: Position; onClick: () => void }) {
  const unit = p.asset.typ === 'anleihe' ? ' %' : ' €';
  return (
    <button className="pos-card" onClick={onClick}>
      <div className="pc-main">
        <div className="pc-name">{p.asset.name}</div>
        <div className="muted small">
          {fmtQty(p.quantity)} {p.asset.kind === 'krypto' ? p.asset.symbol : 'Stk.'} · Ø {fmtPrice(p.avgPrice, unit)}
          {p.incomeNet > 0 && <> · nach Ausschüttung {fmtPrice(p.effAvgPrice, unit)}</>}
        </div>
      </div>
      <div className="pc-right">
        <div className="num strong">{fmtEur(p.marketValue)}</div>
        <div className="row tight">
          <Money value={p.unrealized} signed className="small" />
          <Pct value={p.unrealizedPct} />
        </div>
        {p.priceIsFallback && <div className="tag warn">Kurs fehlt</div>}
        {p.missingBuys && <div className="tag warn">Käufe fehlen?</div>}
      </div>
    </button>
  );
}
