import { useEffect, useMemo, useRef, useState } from 'react';
import { BookingEditor } from '../components/BookingEditor';
import { PositionDetail } from '../components/PositionDetail';
import { IconChevron, IconRefresh } from '../components/icons';
import { Empty, Money, Pct, Stat } from '../components/ui';
import { computeSummary, type Position } from '../lib/calc';
import type { AppData } from '../lib/hooks';
import { fmtEur, fmtPrice, fmtQty, isoToDe, todayIso } from '../lib/num';
import { updatePrices } from '../lib/prices';
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

  const refreshPrices = async (auto = false) => {
    setBusy(true);
    if (!auto) setMsg('');
    try {
      const open = s.positions.map((p) => p.asset).filter((a) => !auto || a.priceSource !== 'manuell');
      const r = await updatePrices(kind, open);
      setMsg(auto && !r.updated ? '' : `${r.updated} Kurse aktualisiert`);
    } catch (e) {
      setMsg(auto ? 'Kurse konnten nicht automatisch geladen werden (offline?)' : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Beim Öffnen automatisch aktualisieren, wenn ein Kurs nicht von heute ist (einmal je Sitzung und Reiter)
  const autoDone = useRef(false);
  useEffect(() => {
    if (!data.loaded || autoDone.current || !s.positions.length) return;
    autoDone.current = true;
    if (s.positions.some((p) => p.asset.priceSource !== 'manuell' && p.asset.priceDate !== today)) void refreshPrices(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.loaded, s.positions.length]);

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

  const missing = s.positions.filter((p) => p.priceIsFallback).length;
  return (
    <div className="page">
      <section className="hero">
        <div className="hero-top">
          <div className="hero-label">{isCrypto ? 'Krypto-Bestand' : 'Depotwert'}</div>
          <button className={`round-btn${busy ? ' spin' : ''}`} onClick={() => refreshPrices()} disabled={busy} aria-label="Kurse aktualisieren" title="Kurse aktualisieren">
            <IconRefresh />
          </button>
        </div>
        <div className="hero-value num">{fmtEur(s.marketValue)}</div>
        <div className="hero-glass">
          <div>
            <div className="hero-k">Kursgewinn</div>
            <div className="hero-v">
              <Money value={s.unrealized} signed /> <Pct value={s.costBasis ? s.unrealized / s.costBasis : undefined} />
            </div>
          </div>
          <div className="right">
            <div className="hero-k">Gesamtergebnis</div>
            <div className="hero-v">
              <Money value={s.total} signed />
            </div>
          </div>
        </div>
      </section>
      {(msg || missing > 0) && (
        <p className="status-line">
          {busy ? 'Kurse werden geladen …' : msg}
          {missing > 0 && !busy && (
            <span className="warn-text">
              {msg ? ' · ' : ''}
              {missing} ohne aktuellen Kurs
            </span>
          )}
        </p>
      )}

      <section className="stats">
        <Stat label="Einstand">
          <Money value={s.costBasis} />
        </Stat>
        {!isCrypto ? (
          <Stat label="Dividenden & Zinsen">
            <Money value={s.incomeNet} />
          </Stat>
        ) : (
          <Stat label="Gebühren">
            <Money value={s.fees} />
          </Stat>
        )}
        <Stat label="Realisiert">
          <Money value={s.realized} signed />
        </Stat>
        {!isCrypto && (
          <Stat label="Gebühren netto" hint={s.refund ? `nach ${fmtEur(s.refund)} Erstattung` : undefined}>
            <Money value={s.fees - s.refund} />
          </Stat>
        )}
      </section>

      <h2 className="section-title">Positionen</h2>
      <div className="list-panel">
        {s.positions.map((p) => (
          <PositionCard key={p.asset.id} p={p} onClick={() => setDetailId(p.asset.id)} />
        ))}
        {!s.positions.length && <p className="muted">Keine offenen Positionen.</p>}
      </div>

      {!isCrypto && s.years.length > 0 && (
        <>
          <h2 className="section-title">Jahresübersicht</h2>
          <div className="panel table-wrap">
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
            Geschlossene Positionen <span className="count">{s.closed.length}</span>
            <span className={`chev${showClosed ? ' open' : ''}`}>
              <IconChevron />
            </span>
          </button>
          {showClosed && (
            <div className="list-panel">
              {s.closed.map((p) => {
                const res = p.realized + p.incomeNet - p.extraCosts;
                return (
                  <button key={p.asset.id} className="pos-row" onClick={() => setDetailId(p.asset.id)}>
                    <div className="pc-main">
                      <div className="pc-name">{p.asset.name}</div>
                      <div className="pc-sub">
                        {p.firstDate && isoToDe(p.firstDate)} – {isoToDe(p.asset.closedAt ?? p.lastDate ?? '')} · {ASSET_TYP_LABEL[p.asset.typ]}
                      </div>
                    </div>
                    <div className="pc-right">
                      <div className="pc-value">
                        {p.missingBuys && <span className="dot warn" title="Käufe fehlen?" />}
                        <Money value={res} signed />
                      </div>
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
  const flag = p.priceIsFallback ? 'Kein aktueller Kurs – letzter Kaufkurs verwendet' : p.missingBuys ? 'Käufe fehlen?' : '';
  return (
    <button className="pos-row" onClick={onClick}>
      <div className="pc-main">
        <div className="pc-name">{p.asset.name}</div>
        <div className="pc-sub">
          {fmtQty(p.quantity)} {p.asset.kind === 'krypto' ? p.asset.symbol : 'Stk.'} · Ø {fmtPrice(p.incomeNet > 0 ? p.effAvgPrice : p.avgPrice, unit)}
        </div>
      </div>
      <div className="pc-right">
        <div className="pc-value num">
          {flag && <span className="dot warn" title={flag} />}
          {fmtEur(p.marketValue)}
        </div>
        <div className="pc-delta">
          <Money value={p.unrealized} signed /> <Pct value={p.unrealizedPct} />
        </div>
      </div>
    </button>
  );
}
