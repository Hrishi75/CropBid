// =============================================================================
// BuyStockCard — a shop or wholesaler buying stock for itself
// =============================================================================
// On the seller dashboard, for a local shop or a wholesaler (a farm grows its
// own stock). Three states, read off the buyer profile:
//   none      → apply: parks the buyer intent and opens the onboarding form,
//               the same door /partner uses (rememberPartnerType)
//   pending   → under review
//   approved  → the Selling | Buying switch, right here
// The server accepts a FARMER's buyer application (CLAUDE.md §4).
// =============================================================================

import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { rememberPartnerType } from '../pages/auth/SignupPage';
import { ModeSwitch } from './layout/ModeSwitch';
import { Button } from './ui/Button';

export function BuyStockCard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const kind = user?.farmerProfile?.sellerType;
  if (user?.role !== 'FARMER' || (kind !== 'LOCAL_SHOP' && kind !== 'WHOLESALER')) return null;
  const place = kind === 'LOCAL_SHOP' ? 'shop' : 'business';
  const status = user.buyerProfile?.status;

  if (status === 'APPROVED') {
    return (
      <div className="cb-card" style={{ padding: 4, marginBottom: 20 }}>
        <ModeSwitch />
      </div>
    );
  }

  const pending = status === 'SUBMITTED' || status === 'UNDER_REVIEW';
  return (
    <div className="cb-card" style={{ padding: 20, marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 260px' }}>
        <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-sage)', marginBottom: 4 }}>BUY STOCK</div>
        <div style={{ fontWeight: 600, fontSize: 16 }}>
          {pending ? 'Your buyer application is under review' : `Buy stock for your ${place} here too`}
        </div>
        <div className="cb-small" style={{ color: 'var(--cb-ink-3)', marginTop: 4 }}>
          {pending
            ? 'Once it is approved, switch between selling and buying from your account menu.'
            : 'Apply once, then switch between selling and buying on the same account.'}
          {status === 'NEEDS_INFO' && user.buyerProfile?.statusNote ? ` Reviewer: "${user.buyerProfile.statusNote}"` : ''}
        </div>
      </div>
      {!pending && (
        <Button
          onClick={() => {
            rememberPartnerType('BUYER', kind === 'LOCAL_SHOP' ? 'SMALL_BUSINESS' : 'WHOLESALER');
            navigate('/onboarding');
          }}
        >
          {status === 'NEEDS_INFO' || status === 'REJECTED' ? 'Update application' : 'Apply to buy'}
        </Button>
      )}
    </div>
  );
}
