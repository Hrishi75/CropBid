// =============================================================================
// ModeSwitch — Selling | Buying, for a seller approved to do both
// =============================================================================
// One account, two sides (CLAUDE.md §4). Flipping it changes the whole site:
// AuthContext hands every page the account as a BUYER and sends X-Act-As on
// every request, and the server checks the approval. Switching lands on that
// side's dashboard, since the page you were on belongs to the other side.
//
// Renders nothing for an account that cannot switch, so callers drop it in.
// =============================================================================

import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { canSwitchToBuying, type AccountMode } from '../../utils/accountMode';

export function ModeSwitch({ onSwitched }: { onSwitched?: () => void }) {
  const { user, accountRole, mode, switchMode } = useAuth();
  const navigate = useNavigate();
  // `user` may be the buying-side view; the account itself is the seller.
  const real = user && accountRole ? { ...user, role: accountRole } : null;
  if (!canSwitchToBuying(real)) return null;

  const kind = user?.farmerProfile?.sellerType;
  const sellSub = kind === 'LOCAL_SHOP' ? 'To households' : kind === 'WHOLESALER' ? 'Your lots' : 'Your crops';
  const buySub = kind === 'LOCAL_SHOP' ? 'Stock for your shop' : 'Stock for your business';

  function pick(m: AccountMode) {
    if (m === mode) return;
    switchMode(m);
    onSwitched?.();
    navigate(m === 'BUY' ? '/buyer' : '/farmer');
  }

  return (
    <div className="cb-mode" role="group" aria-label="Selling or buying">
      <div className="cb-mono cb-tiny cb-mode-label">YOU ARE</div>
      <div className="cb-mode-track">
        {(['SELL', 'BUY'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={`cb-mode-side ${mode === m ? 'on' : ''}`}
            aria-pressed={mode === m}
            onClick={() => pick(m)}
          >
            <span className="cb-mode-title">{m === 'SELL' ? 'Selling' : 'Buying'}</span>
            <span className="cb-mode-sub">{m === 'SELL' ? sellSub : buySub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
