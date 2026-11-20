import { useMemo, useState } from 'react';
import { db } from '../lib/db';
import { parseDe, round, todayIso, uid } from '../lib/num';
import { ASSET_TYP_LABEL, type Asset, type AssetKind, type AssetTyp, BOOKING_TYPE_LABEL, type Booking, type BookingType, priceFactor } from '../lib/types';
import { Field, Sheet } from './ui';

const KONTEN = ['HVB', 'BISON', 'Trade Republic', 'Ledger'];

function numStr(n: number | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return '';
  return String(n).replace('.', ',');
}

interface Props {
  booking?: Booking;
  assets: Asset[];
  defaultKind: AssetKind;
  defaultAssetId?: string;
  onClose: () => void;
}

const NEW = '__neu__';

export function BookingEditor({ booking, assets, defaultKind, defaultAssetId, onClose }: Props) {
  const isNew = !booking;
  const [type, setType] = useState<BookingType>(booking?.type ?? 'kauf');
  const [date, setDate] = useState(booking?.date ?? todayIso());
  const [assetId, setAssetId] = useState<string>(booking?.assetId ?? defaultAssetId ?? (assets.find((a) => a.kind === defaultKind)?.id || NEW));
  const [konto, setKonto] = useState(booking?.konto ?? (defaultKind === 'krypto' ? 'BISON' : 'HVB'));
  const [zielKonto, setZielKonto] = useState(booking?.zielKonto ?? 'Ledger');
  const [qty, setQty] = useState(numStr(booking?.quantity));
  const [price, setPrice] = useState(numStr(booking?.price));
  const [amount, setAmount] = useState(numStr(booking?.amount));
  const [fee, setFee] = useState(numStr(booking?.fee));
  const [tax, setTax] = useState(numStr(booking?.tax));
  const [note, setNote] = useState(booking?.note ?? '');
  // neues Wertpapier
  const [nKind, setNKind] = useState<AssetKind>(defaultKind);
  const [nName, setNName] = useState('');
  const [nIsin, setNIsin] = useState('');
  const [nWkn, setNWkn] = useState('');
  const [nSymbol, setNSymbol] = useState('');
  const [nTyp, setNTyp] = useState<AssetTyp>(defaultKind === 'krypto' ? 'krypto' : 'fonds');
  const [error, setError] = useState('');

  const asset = assets.find((a) => a.id === assetId);
  const factor = priceFactor(asset ?? { typ: nTyp });
  const sortedAssets = useMemo(
    () => [...assets].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)),
    [assets],
  );
  const needsAsset = !['steuer', 'gebuehr'].includes(type);
  const showPrice = ['kauf', 'verkauf', 'einlieferung', 'auslieferung'].includes(type);

  const autoAmount = () => {
    const q = parseDe(qty);
    const p = parseDe(price);
    if (Number.isFinite(q) && Number.isFinite(p) && !amount) setAmount(numStr(round(q * p * factor)));
  };

  const save = async () => {
    setError('');
    const q = parseDe(qty) || 0;
    const p = parseDe(price) || 0;
    const a = parseDe(amount);
    const amt = Number.isFinite(a) ? a : round(q * p * factor);
    if (!date) return setError('Bitte ein Datum angeben.');
    if (needsAsset && assetId === NEW && !nName.trim()) return setError('Bitte das Wertpapier bzw. den Coin benennen.');
    if (['kauf', 'verkauf', 'transfer', 'einlieferung', 'auslieferung'].includes(type) && q <= 0) return setError('Bitte eine Menge angeben.');
    if (type === 'transfer' && zielKonto === konto) return setError('Quell- und Zielkonto müssen verschieden sein.');

    let finalAssetId: string | undefined = assetId === NEW ? undefined : assetId;
    if (assetId === NEW && nName.trim()) {
      const newAsset: Asset = {
        id: uid(),
        kind: nKind,
        typ: nKind === 'krypto' ? 'krypto' : nTyp,
        name: nName.trim(),
        isin: nIsin.trim().toUpperCase() || undefined,
        wkn: nWkn.trim().toUpperCase() || undefined,
        symbol: nKind === 'krypto' ? nSymbol.trim().toUpperCase() || nName.trim().toUpperCase() : undefined,
      };
      await db.assets.add(newAsset);
      finalAssetId = newAsset.id;
    }
    const now = new Date().toISOString();
    const data: Booking = {
      id: booking?.id ?? uid(),
      assetId: finalAssetId,
      type,
      date,
      konto,
      zielKonto: type === 'transfer' ? zielKonto : undefined,
      quantity: q,
      price: p || (q ? amt / q / factor : 0),
      amount: amt,
      fee: parseDe(fee) || 0,
      tax: parseDe(tax) || 0,
      note: note.trim() || undefined,
      source: booking?.source ?? 'manuell',
      sourceFile: booking?.sourceFile,
      reference: booking?.reference,
      currency: booking?.currency,
      priceOriginal: booking?.priceOriginal,
      fxRate: booking?.fxRate,
      edited: booking ? booking.source !== 'manuell' || booking.edited : false,
      hint: booking?.hint,
      createdAt: booking?.createdAt ?? now,
      updatedAt: now,
    };
    await db.bookings.put(data);
    onClose();
  };

  const remove = async () => {
    if (!booking) return;
    if (!window.confirm('Diese Buchung wirklich löschen?')) return;
    await db.bookings.delete(booking.id);
    onClose();
  };

  return (
    <Sheet
      title={isNew ? 'Buchung nachtragen' : 'Buchung bearbeiten'}
      onClose={onClose}
      footer={
        <>
          {!isNew && (
            <button className="btn danger ghost" onClick={remove}>
              Löschen
            </button>
          )}
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" onClick={save}>
            Speichern
          </button>
        </>
      }
    >
      {booking?.source && booking.source !== 'manuell' && (
        <p className="note">
          Importiert aus {booking.sourceFile || booking.source.toUpperCase()}
          {booking.edited ? ' · von Hand angepasst' : ''}
          {booking.currency ? ` · Abrechnung in ${booking.currency}${booking.fxRate ? `, Devisenkurs ${String(booking.fxRate).replace('.', ',')}` : ''}` : ''}
        </p>
      )}
      {booking?.hint && <p className="note warn">{booking.hint}</p>}
      <div className="grid2">
        <Field label="Art">
          <select value={type} onChange={(e) => setType(e.target.value as BookingType)}>
            {Object.entries(BOOKING_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Datum">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      <Field label={needsAsset ? 'Wertpapier / Coin' : 'Wertpapier / Coin (optional)'}>
        <select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
          {!needsAsset && <option value={NEW}>– keins (gilt für das ganze Konto) –</option>}
          {sortedAssets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.kind === 'krypto' ? '₿ ' : ''}
              {a.name}
              {a.wkn ? ` (${a.wkn})` : a.symbol ? ` (${a.symbol})` : ''}
            </option>
          ))}
          {needsAsset && <option value={NEW}>+ Neues Wertpapier / neuer Coin …</option>}
        </select>
      </Field>

      {assetId === NEW && needsAsset && (
        <div className="subcard">
          <div className="grid2">
            <Field label="Bereich">
              <select value={nKind} onChange={(e) => setNKind(e.target.value as AssetKind)}>
                <option value="wertpapier">Wertpapier</option>
                <option value="krypto">Krypto</option>
              </select>
            </Field>
            {nKind === 'wertpapier' ? (
              <Field label="Typ">
                <select value={nTyp} onChange={(e) => setNTyp(e.target.value as AssetTyp)}>
                  {Object.entries(ASSET_TYP_LABEL)
                    .filter(([k]) => k !== 'krypto')
                    .map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                </select>
              </Field>
            ) : (
              <Field label="Kürzel">
                <input value={nSymbol} onChange={(e) => setNSymbol(e.target.value)} placeholder="BTC" />
              </Field>
            )}
          </div>
          <Field label="Name">
            <input value={nName} onChange={(e) => setNName(e.target.value)} placeholder={nKind === 'krypto' ? 'Bitcoin' : 'z. B. iShares Global Select Dividend'} />
          </Field>
          {nKind === 'wertpapier' && (
            <div className="grid2">
              <Field label="WKN">
                <input value={nWkn} onChange={(e) => setNWkn(e.target.value)} />
              </Field>
              <Field label="ISIN">
                <input value={nIsin} onChange={(e) => setNIsin(e.target.value)} />
              </Field>
            </div>
          )}
        </div>
      )}

      <div className="grid2">
        <Field label={type === 'transfer' ? 'Von Konto' : 'Konto / Plattform'}>
          <input list="konten" value={konto} onChange={(e) => setKonto(e.target.value)} />
        </Field>
        {type === 'transfer' && (
          <Field label="Nach Konto">
            <input list="konten" value={zielKonto} onChange={(e) => setZielKonto(e.target.value)} />
          </Field>
        )}
      </div>
      <datalist id="konten">
        {KONTEN.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>

      <div className="grid2">
        <Field label={factor !== 1 ? 'Nennwert' : 'Menge / Stück'}>
          <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} onBlur={autoAmount} />
        </Field>
        {showPrice && (
          <Field label={factor !== 1 ? 'Kurs in %' : 'Kurs je Stück (€)'}>
            <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} onBlur={autoAmount} />
          </Field>
        )}
      </div>
      <div className="grid3">
        <Field label={type === 'dividende' || type === 'zinsen' ? 'Brutto-Betrag (€)' : type === 'steuer' ? 'Steuer (€)' : 'Kurswert (€)'}>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Gebühren (€)">
          <input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
        </Field>
        {type !== 'steuer' && (
          <Field label="Steuern (€)">
            <input inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} />
          </Field>
        )}
      </div>
      <Field label="Notiz">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
      </Field>
      {error && <p className="note error">{error}</p>}
    </Sheet>
  );
}
