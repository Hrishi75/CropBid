// =============================================================================
// RequirementCard — One buyer requirement, with a fill-progress bar
// =============================================================================
// Used by both the farmer's feed and the buyer's "My requirements" list, so it
// takes no role prop: the caller supplies whatever actions belong on it as
// children, and passes `href` when the whole card should link somewhere.
//
// The progress bar is the point of the card. A requirement is rarely all-or-
// nothing — it gets filled in pieces — so "300 of 500 qtl still needed" is the
// number a farmer actually decides on.
// =============================================================================

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatCurrency } from '../../utils/currency';
import { mspForCrop } from '../../utils/msp';
import { localizedDescription } from '../../utils/localized';
// What kind of business is behind the demand. Worth a chip of its own: "500 qtl
// of Grade A tomato" reads very differently from a restaurant chain (recurring,
// spec-driven) than from an exporter (one-off, volume-driven), and the farmer
// decides partly on that.
import { COMPANY_TYPE_LABEL } from '../../utils/companyType';
import type { BuyerRequirement } from '../../types';

const STATUS_META: Record<string, { label: string; color: string }> = {
  OPEN: { label: 'OPEN', color: 'var(--cb-sage)' },
  FULFILLED: { label: 'FILL', color: 'var(--cb-forest)' },
  CLOSED: { label: 'CLSD', color: 'var(--cb-ink-3)' },
  EXPIRED: { label: 'EXPR', color: 'var(--cb-ink-3)' },
};

interface RequirementCardProps {
  requirement: BuyerRequirement;
  href?: string;
  // Shows the MSP warning chip when the buyer's price is under the government
  // support price. Only meaningful on the farmer's feed — the buyer gets the
  // same warning at post time, as a confirm dialog.
  showMspWarning?: boolean;
  children?: ReactNode;
}

export function RequirementCard({
  requirement: r,
  href,
  showMspWarning,
  children,
}: RequirementCardProps) {
  // useTranslation (not a module-level i18n read) so the card re-renders when
  // the reader switches language.
  const { t, i18n } = useTranslation();
  const description = localizedDescription(r, i18n.language);
  const status = STATUS_META[r.status] || { label: r.status.slice(0, 4), color: 'var(--cb-ink-3)' };
  const filled = r.quantity - r.remainingQuantity;
  const pct = r.quantity > 0 ? Math.min(100, (filled / r.quantity) * 100) : 0;
  const unit = r.unit.toLowerCase();

  const msp = showMspWarning ? mspForCrop(r.cropName, r.unit) : null;
  const belowMsp = msp != null && r.pricePerUnit < msp;

  const title = (
    <>
      {r.cropName}
      {r.cropVariety ? ` · ${r.cropVariety}` : ''}
    </>
  );

  return (
    <div className="cb-card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginRight: 8 }}>
            #{r.id.slice(-6).toUpperCase()}
          </span>
          {href ? (
            <Link to={href} style={{ color: 'var(--cb-ink)', textDecoration: 'none', fontWeight: 500 }}>
              {title}
            </Link>
          ) : (
            <span style={{ fontWeight: 500 }}>{title}</span>
          )}
        </div>
        <span className="cb-mono cb-tiny" style={{ color: status.color }}>● {status.label}</span>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {r.buyer?.buyerProfile?.companyType && (
          <span className="cb-chip">
            {COMPANY_TYPE_LABEL[r.buyer.buyerProfile.companyType] || r.buyer.buyerProfile.companyType}
          </span>
        )}
        <span className="cb-chip">Grade {r.qualityGrade}</span>
        {r.organic && <span className="cb-chip cb-chip-sage">Organic only</span>}
        {belowMsp && (
          <span className="cb-chip cb-chip-ember" title={`Government support price is ${formatCurrency(msp!, r.currency)}/${unit}`}>
            Below MSP {formatCurrency(msp!, r.currency)}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 16 }}>
        <div>
          <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>WANTS</div>
          <div className="cb-mono" style={{ fontSize: 16, fontWeight: 500 }}>
            {formatCurrency(r.pricePerUnit, r.currency)}
            <span className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}> /{unit}</span>
          </div>
        </div>
        <div>
          <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>STILL NEEDED</div>
          <div className="cb-mono" style={{ fontSize: 16, fontWeight: 500 }}>
            {r.remainingQuantity} {unit}
          </div>
        </div>
        <div>
          <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>DELIVER TO</div>
          <div style={{ fontSize: 14 }}>{r.deliveryLocation}, {r.deliveryState}</div>
        </div>
        {r.neededBy && (
          <div>
            <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>NEEDED BY</div>
            <div style={{ fontSize: 14 }}>
              {new Date(r.neededBy).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
        )}
      </div>

      {/* Fill progress — only worth drawing once something has been filled. */}
      {filled > 0 && (
        <div>
          <div className="cb-tiny" style={{ color: 'var(--cb-ink-3)', marginBottom: 4 }}>
            {filled} of {r.quantity} {unit} filled
          </div>
          <div style={{ height: 4, background: 'var(--cb-paper-2)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--cb-sage)' }} />
          </div>
        </div>
      )}

      {r.buyer && (
        <div className="cb-small" style={{ color: 'var(--cb-ink-3)' }}>
          {r.buyer.buyerProfile?.companyName || r.buyer.name}
          {r.buyer.buyerProfile?.verified && ' · verified'}
          {r.buyer.trustScore !== undefined && ` · trust ${Math.round(r.buyer.trustScore)}`}
        </div>
      )}

      {description.text && (
        <div className="cb-small" style={{ padding: 10, background: 'var(--cb-paper-2)', borderRadius: 6 }}>
          {description.text}
          {description.isTranslated && (
            <span className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}> · {t('Translated')}</span>
          )}
        </div>
      )}

      {children}
    </div>
  );
}
