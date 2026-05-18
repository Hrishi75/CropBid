import type { ReactNode } from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
}: EmptyStateProps) {
  return (
    <div
      className="cb-card"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '48px 24px', gap: 8 }}
    >
      {icon && (
        <div
          style={{
            width: 56, height: 56, borderRadius: 999, background: 'var(--cb-paper-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--cb-ember)', marginBottom: 8,
          }}
        >
          {icon}
        </div>
      )}
      <h3 className="cb-h3" style={{ fontSize: 20 }}>{title}</h3>
      {description && (
        <p className="cb-body" style={{ maxWidth: 400, fontSize: 14 }}>{description}</p>
      )}
      {actionLabel && onAction && (
        <div style={{ marginTop: 12 }}>
          <Button onClick={onAction}>{actionLabel}</Button>
        </div>
      )}
      {actionLabel && actionHref && (
        <a href={actionHref} className="cb-btn cb-btn-primary" style={{ marginTop: 12 }}>
          {actionLabel}
        </a>
      )}
    </div>
  );
}
