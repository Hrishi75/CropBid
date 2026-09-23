// =============================================================================
// DemoDataCard — the seeded accounts, and removing them
// =============================================================================
// Shows what a purge would take BEFORE anything is pressed, because the counts
// are the only way to tell a database that still holds the seed from one that
// holds real trade. The server decides the set (GET /admin/demo-data) and this
// card only renders it; the confirm phrase is typed, not clicked, and the
// button does nothing until it matches.
//
// It renders only when there IS demo data. On a database with none, which is
// where production should end up, there is nothing to say and no box that
// could be typed into by accident.
//
// The purge is scoped to demo accounts and their own rows (CLAUDE.md §7), and
// refuses outright if anything Razorpay has touched is caught in it. When that
// happens this card says so and offers no button at all: that is a person's
// job, not a click.
// =============================================================================

import { useState, useEffect } from 'react';
import { Button } from '../../components/ui/Button';
import api from '../../lib/axios';
import toast from 'react-hot-toast';

const CONFIRM_PHRASE = 'PURGE_DEMO_DATA';

interface DemoData {
  counts: Record<string, number>;
  paid: { transactions: number; retailPayments: number; walletTopUps: number };
  accounts: string[];
  demoSuffix: string;
}

// The order they read in: accounts first, then what hangs off them.
const ROWS: { key: string; label: string }[] = [
  { key: 'users', label: 'accounts' },
  { key: 'listings', label: 'lots' },
  { key: 'bids', label: 'bids' },
  { key: 'transactions', label: 'deals' },
  { key: 'retailOrders', label: 'shop orders' },
  { key: 'retailPayments', label: 'shop payments' },
  { key: 'shipments', label: 'shipments' },
  { key: 'negotiations', label: 'negotiations' },
  { key: 'requirements', label: 'demand posts' },
  { key: 'requirementOffers', label: 'offers' },
  { key: 'notifications', label: 'notifications' },
];

export function DemoDataCard() {
  const [demo, setDemo] = useState<DemoData | null>(null);
  const [phrase, setPhrase] = useState('');
  const [purging, setPurging] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const res = await api.get('/admin/demo-data');
      setDemo(res.data);
    } catch (err) {
      // Quietly: this card is housekeeping, and a failure here must not read
      // as "there is no demo data".
      console.error('Failed to load demo data:', err);
      setDemo(null);
    }
  }

  async function handlePurge() {
    setPurging(true);
    try {
      const res = await api.post('/admin/purge-demo-data', { confirm: CONFIRM_PHRASE });
      const { users, listings, transactions } = res.data.deleted;
      toast.success(`Removed ${users} accounts, ${listings} lots and ${transactions} deals`);
      setPhrase('');
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not remove the demo data');
    } finally {
      setPurging(false);
    }
  }

  if (!demo || demo.counts.users === 0) return null;

  const blocked = demo.paid.transactions + demo.paid.retailPayments + demo.paid.walletTopUps > 0;
  const listed = ROWS.filter((r) => (demo.counts[r.key] ?? 0) > 0);

  return (
    <div className="cb-card" style={{ marginTop: 16 }}>
      <div className="cb-eyebrow" style={{ marginBottom: 10 }}>Demo data</div>
      <div className="cb-small" style={{ marginBottom: 12 }}>
        {demo.counts.users} seeded {demo.counts.users === 1 ? 'account' : 'accounts'} ({demo.demoSuffix}) and
        what belongs to them. Real accounts, and their lots and deals, are left alone.
      </div>

      <div className="cb-mono cb-tiny" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginBottom: 12 }}>
        {listed.map((r) => (
          <span key={r.key} style={{ color: 'var(--cb-ink-3)' }}>
            {demo.counts[r.key]} {r.label}
          </span>
        ))}
      </div>

      <div className="cb-tiny" style={{ color: 'var(--cb-ink-3)', marginBottom: 12 }}>
        {demo.accounts.slice(0, 6).join(', ')}
        {demo.accounts.length > 6 && ` and ${demo.accounts.length - 6} more`}
      </div>

      {blocked ? (
        <div className="cb-small" style={{ color: 'var(--cb-ember)' }}>
          Real payments are attached to this data: {demo.paid.transactions} deals,{' '}
          {demo.paid.retailPayments} shop payments, {demo.paid.walletTopUps} wallet top-ups. Nothing
          can be removed from here while that is true, because money reached a demo account and
          somebody has to look at it first.
        </div>
      ) : (
        <>
          <div className="cb-tiny" style={{ marginBottom: 8 }}>
            This cannot be undone. Type <span className="cb-mono">{CONFIRM_PHRASE}</span> to confirm.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <input
              className="cb-input cb-mono"
              style={{ width: 200, padding: '6px 10px', fontSize: 13 }}
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={CONFIRM_PHRASE}
              aria-label={`Type ${CONFIRM_PHRASE} to confirm`}
            />
            <Button
              variant="ghost"
              onClick={handlePurge}
              loading={purging}
              disabled={phrase !== CONFIRM_PHRASE}
            >
              Remove demo data
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
