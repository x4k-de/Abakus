import type { ReactNode } from 'react';
import { fmtEur, fmtPct } from '../lib/num';

export function Money({ value: raw, signed, className = '' }: { value: number | undefined; signed?: boolean; className?: string }) {
  if (raw == null || !Number.isFinite(raw)) return <span className={className}>–</span>;
  const value = Math.abs(raw) < 0.005 ? 0 : raw; // verhindert die Anzeige "-0,00 €" 
  const cls = signed ? (value > 0.004 ? 'pos' : value < -0.004 ? 'neg' : '') : '';
  return (
    <span className={`num ${cls} ${className}`}>
      {signed && value > 0.004 ? '+' : ''}
      {fmtEur(value)}
    </span>
  );
}

export function Pct({ value: raw }: { value: number | undefined }) {
  if (raw == null || !Number.isFinite(raw)) return null;
  const value = Math.abs(raw) < 0.0005 ? 0 : raw;
  const cls = value > 0.0004 ? 'pos' : value < -0.0004 ? 'neg' : '';
  return (
    <span className={`pct ${cls}`}>
      {value > 0 ? '+' : ''}
      {fmtPct(value)}
    </span>
  );
}

export function Stat({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{children}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">◎</div>
      <h3>{title}</h3>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
