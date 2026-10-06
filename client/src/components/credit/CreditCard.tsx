// =============================================================================
// CreditCard — business credit, on the buyer dashboard
// =============================================================================
// The website's twin of the app's wallet card (mobile/components/CreditCard).
// CROPBID DOES NOT LEND: a person reads each application and, with the
// buyer's permission, takes it to a lending partner, and an approval records a
// limit somebody agreed to. Nothing here says "instant" or puts money anywhere
// (CLAUDE.md §9). Four states off GET /credit: nothing yet, in, being read,
// approved, not approved.
// =============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/axios';
import { formatCurrency } from '../../utils/currency';

export interface CreditApplication {
  id: string;
  businessName: string;
  amountWanted: number;
  repaymentDays: number;
  contactPhone: string;
  status: 'SUBMITTED' | 'IN_REVIEW' | 'APPROVED' | 'DECLINED';
  approvedLimit: number | null;
  reviewNote: string | null;
}

const HEAD: Record<CreditApplication['status'], { label: string; color: string; body: string }> = {
  SUBMITTED: { label: 'APPLICATION IN', color: 'var(--cb-ink-3)', body: 'Waiting for somebody to pick it up. You can still change it until they do.' },
  IN_REVIEW: { label: 'BEING READ', color: '#b7791f', body: 'Somebody is reading it now. We will call you when there is an answer.' },
  APPROVED: { label: 'APPROVED', color: 'var(--cb-sage)', body: '' },
  DECLINED: { label: 'NOT APPROVED THIS TIME', color: 'var(--cb-ember)', body: 'You can apply again with more detail.' },
};

export function CreditCard() {
  const [app, setApp] = useState<CreditApplication | null | undefined>(undefined);

  useEffect(() => {
    api.get('/credit').then((r) => setApp(r.data.application)).catch(() => setApp(undefined));
  }, []);

  // Not loaded (or failed): say nothing rather than flash the pitch at a
  // buyer whose application is already in.
  if (app === undefined) return null;

  if (!app) {
    return (
      <div className="cb-card cb-bd-credit">
        <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-sage)' }}>BUSINESS CREDIT</div>
        <div className="cb-bd-credit-title">Need money to stock up?</div>
        <p className="cb-small" style={{ color: 'var(--cb-ink-2)', margin: 0 }}>
          Buy produce now and repay in 30, 60 or 90 days. Tell us about your business and we take it to a lending partner.
        </p>
        <ol className="cb-bd-steps">
          <li><strong>Tell us about your business.</strong> Two minutes.</li>
          <li><strong>A person reads it.</strong> With your permission, a lending partner sees it. Not instant.</li>
          <li><strong>We call you with the answer.</strong> The lender sets the terms.</li>
        </ol>
        <Link to="/buyer/credit" className="cb-btn cb-btn-primary" style={{ alignSelf: 'flex-start' }}>Apply for business credit</Link>
        <div className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>CropBid does not lend money.</div>
      </div>
    );
  }

  const h = HEAD[app.status];
  return (
    <div className="cb-card cb-bd-credit">
      <div className="cb-mono cb-tiny" style={{ color: h.color }}>● BUSINESS CREDIT · {h.label}</div>
      {app.status === 'APPROVED' && app.approvedLimit != null ? (
        <>
          <div className="cb-bd-credit-limit">{formatCurrency(app.approvedLimit, 'INR')}</div>
          <p className="cb-small" style={{ margin: 0, color: 'var(--cb-ink-2)' }}>
            Approved limit. We will call you on {app.contactPhone} to set it up. Nothing is added to your account until then.
          </p>
        </>
      ) : (
        <>
          <div className="cb-bd-credit-title">{app.businessName}</div>
          <div className="cb-small">You asked for {formatCurrency(app.amountWanted, 'INR')} over {app.repaymentDays} days</div>
          <p className="cb-small" style={{ margin: 0, color: 'var(--cb-ink-3)' }}>{h.body}</p>
        </>
      )}
      {app.status === 'DECLINED' && app.reviewNote && (
        <div className="cb-small" style={{ background: 'var(--cb-paper-2)', borderRadius: 8, padding: 10 }}>Why: {app.reviewNote}</div>
      )}
      {(app.status === 'SUBMITTED' || app.status === 'DECLINED') && (
        <Link to="/buyer/credit" className="cb-btn cb-btn-ghost" style={{ alignSelf: 'flex-start' }}>
          {app.status === 'DECLINED' ? 'Apply again' : 'Edit your application'}
        </Link>
      )}
    </div>
  );
}
