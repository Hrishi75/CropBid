// =============================================================================
// ConfirmModal — Yes/No confirmation dialog
// =============================================================================
// Renders a centered modal over a dimmed backdrop for destructive or important
// actions (delete listing, accept bid, etc). Returns null when `open` is false.
//
// Accessibility/UX details handled here:
//   - role="dialog" + aria-modal + aria-labelledby for screen readers
//   - autofocus the Cancel button when opened (safer default)
//   - Escape key and backdrop click both trigger onCancel
//   - `variant` tints the eyebrow/confirm button (danger | warning | info)
// =============================================================================

import { useEffect, useRef } from 'react';
import { Button } from './Button';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmVariant = variant === 'danger' ? 'danger' : 'primary';
  const accentColor = variant === 'danger' ? 'var(--cb-ember)' : variant === 'warning' ? 'var(--cb-wheat)' : 'var(--cb-info)';

  return (
    <div
      className="cb-app"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={onCancel}
        style={{ position: 'absolute', inset: 0, background: 'rgba(20,20,15,0.55)' }}
      />
      <div className="cb-card" style={{ position: 'relative', width: '100%', maxWidth: 440, padding: 0, boxShadow: '0 24px 60px -20px rgba(0,0,0,0.4)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--cb-line)' }}>
          <div className="cb-eyebrow" style={{ color: accentColor, marginBottom: 8 }}>● {variant}</div>
          <h3 id="confirm-title" className="cb-h3" style={{ fontSize: 20 }}>{title}</h3>
          <p className="cb-small" style={{ marginTop: 8 }}>{message}</p>
        </div>
        <div
          style={{
            display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10,
            padding: '14px 24px', background: 'var(--cb-paper-2)',
          }}
        >
          <Button ref={cancelRef} variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
