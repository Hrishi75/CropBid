// =============================================================================
// ConfirmButton — a link-style action that asks once before it acts
// =============================================================================
// For admin actions that take something away: a product off /inputs, a
// listing or an account deleted. Inline rather than window.confirm, which
// embedded browsers can suppress without showing anything.
// =============================================================================

import { useState } from 'react';

interface Props {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  color?: string;
}

export function ConfirmButton({ label, confirmLabel, onConfirm, disabled, color = 'var(--cb-ember)' }: Props) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12, color }}
        disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }

  return (
    <span className="cb-tiny" style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline' }}>
      <span>{confirmLabel}</span>
      <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12, color }}
        disabled={disabled} onClick={() => { setAsking(false); onConfirm(); }}>
        Yes
      </button>
      <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }}
        onClick={() => setAsking(false)}>
        No
      </button>
    </span>
  );
}
