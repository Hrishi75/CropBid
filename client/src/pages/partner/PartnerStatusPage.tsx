// =============================================================================
// PartnerStatusPage — where an unapproved partner lives
// =============================================================================
// Every login and every attempt to reach a dashboard lands here until the
// application is APPROVED (ProtectedRoute enforces it; the server enforces it
// again with requireApprovedPartner). The page has one job per status:
//   SUBMITTED / UNDER_REVIEW — reassure: received, here's what happens next
//   NEEDS_INFO — show the reviewer's note and hand them the edit button
//   REJECTED   — show why, offer resubmission
//   SUSPENDED  — point at support; no self-service way back on purpose
//   APPROVED   — bounce straight to the dashboard (they usually arrive via a
//                stale link or the notification email)
// =============================================================================

import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ArcMark, ArrowIcon } from '../../components/ui/Brand';
import { partnerApplication, PARTNER_STATUS_META } from '../../utils/partner';
import api from '../../lib/axios';

// The three review stages, as a timeline. Which dot is lit depends on status.
function Timeline({ status }: { status: string }) {
  const stages = [
    { key: 'submitted', label: 'Submitted', done: true },
    { key: 'review', label: 'Under review', done: status !== 'SUBMITTED' },
    { key: 'decision', label: 'Decision', done: ['APPROVED', 'REJECTED'].includes(status) },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, margin: '28px 0' }}>
      {stages.map((s, i) => (
        <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: i < stages.length - 1 ? 1 : 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 80 }}>
            <div
              style={{
                width: 12, height: 12, borderRadius: '50%',
                background: s.done ? 'var(--cb-sage)' : 'transparent',
                border: `2px solid ${s.done ? 'var(--cb-sage)' : 'var(--cb-line)'}`,
              }}
            />
            <span className="cb-mono cb-tiny" style={{ color: s.done ? 'var(--cb-ink)' : 'var(--cb-ink-3)' }}>{s.label}</span>
          </div>
          {i < stages.length - 1 && (
            <div style={{ flex: 1, height: 1, background: s.done ? 'var(--cb-sage)' : 'var(--cb-line)', margin: '0 8px', marginBottom: 22 }} />
          )}
        </div>
      ))}
    </div>
  );
}

export function PartnerStatusPage() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const app = partnerApplication(user);

  // Approval can land while this page is open (admin clicks, user waits).
  // One refetch on mount keeps the common path — "email said approved, opened
  // the app" — from showing a stale WAITING screen.
  useEffect(() => {
    let on = true;
    api.get('/auth/me')
      .then(({ data }) => { if (on && data?.user) updateUser(data.user); })
      .catch(() => {});
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) { navigate('/login', { replace: true }); return; }
    if (!app) { navigate(user.role === 'FARMER' || user.role === 'BUYER' ? '/onboarding' : '/', { replace: true }); return; }
    if (app.status === 'APPROVED') {
      navigate(user.role === 'FARMER' ? '/farmer' : '/buyer', { replace: true });
    }
  }, [user, app, navigate]);

  if (!user || !app || app.status === 'APPROVED') return null;

  const meta = PARTNER_STATUS_META[app.status];
  const editable = app.status === 'NEEDS_INFO' || app.status === 'REJECTED';

  const heading =
    app.status === 'NEEDS_INFO' ? <>One more thing<br /><span className="cb-italic">from you.</span></>
    : app.status === 'REJECTED' ? <>Not this time —<br /><span className="cb-italic">but not the end.</span></>
    : app.status === 'SUSPENDED' ? <>Account<br /><span className="cb-italic">suspended.</span></>
    : <>Application received.<br /><span className="cb-italic">We're on it.</span></>;

  const body =
    app.status === 'NEEDS_INFO'
      ? 'A reviewer looked at your application and needs a little more before approving it. The note below says exactly what.'
      : app.status === 'REJECTED'
        ? 'We couldn\'t approve the application as submitted. The note below says why — fix it and resubmit whenever you\'re ready.'
        : app.status === 'SUSPENDED'
          ? 'An administrator has suspended your partner account. If you believe this is a mistake, contact support and we\'ll look into it.'
          : 'Our team reviews every application by hand — usually within 24–48 hours. We\'ll notify you here and by email the moment there\'s a decision.';

  return (
    <div className="cb-app" style={{ minHeight: '100vh' }}>
      <header className="cb-auth-nav">
        <Link to="/" className="wordmark">
          <ArcMark size={22} />
          <span className="wordmark-text">CropBid</span>
        </Link>
        <span className="cb-tiny">{user.name}</span>
      </header>

      <main style={{ maxWidth: 640, margin: '0 auto', padding: '48px 24px 80px' }}>
        <div className="cb-eyebrow">
          Partner application ·{' '}
          <span style={{ color: meta.color }}>● {meta.label}</span>
        </div>

        <h1 className="cb-page-title" style={{ marginTop: 14 }}>{heading}</h1>
        <p className="cb-body" style={{ marginTop: 16 }}>{body}</p>

        {app.status !== 'SUSPENDED' && <Timeline status={app.status} />}

        {app.note && (app.status === 'NEEDS_INFO' || app.status === 'REJECTED' || app.status === 'SUSPENDED') && (
          <div
            className="cb-card"
            style={{ padding: 20, borderLeft: `3px solid ${meta.color}`, marginBottom: 24 }}
          >
            <div className="cb-eyebrow" style={{ marginBottom: 8 }}>From the reviewer</div>
            <p className="cb-small" style={{ margin: 0, color: 'var(--cb-ink-2)' }}>{app.note}</p>
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
          {editable && (
            <Link to="/onboarding" className="cb-btn cb-btn-primary">
              {app.status === 'REJECTED' ? 'Edit & resubmit' : 'Update application'}
              <ArrowIcon />
            </Link>
          )}
          <Link to="/" className="cb-btn cb-btn-ghost">Browse the marketplace</Link>
          <button
            type="button"
            className="cb-btn cb-btn-link"
            onClick={async () => { await logout(); }}
          >
            Sign out
          </button>
        </div>

        {(app.status === 'SUBMITTED' || app.status === 'UNDER_REVIEW') && (
          <p className="cb-tiny" style={{ marginTop: 32, color: 'var(--cb-ink-3)' }}>
            While you wait: the marketplace, live rates and the public demand
            board are open to browse. Your dashboard unlocks on approval.
          </p>
        )}
      </main>
    </div>
  );
}
