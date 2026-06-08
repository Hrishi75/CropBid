// =============================================================================
// Card — Surface container primitive
// =============================================================================
// Thin wrapper over the `cb-card` CSS class. `padding` and `variant` pick the
// matching modifier classes (e.g. cb-card-sm, cb-card-forest). Used everywhere
// a boxed/elevated content panel is needed.
// =============================================================================

import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
  variant?: 'paper' | 'flat' | 'forest';
}

export function Card({ children, className = '', padding = 'md', variant = 'paper' }: CardProps) {
  const padClass = padding === 'sm' ? 'cb-card-sm' : padding === 'lg' ? 'cb-card-lg' : '';
  const variantClass = variant === 'flat' ? 'cb-card-flat' : variant === 'forest' ? 'cb-card-forest' : '';
  return (
    <div className={`cb-card ${padClass} ${variantClass} ${className}`.trim()}>
      {children}
    </div>
  );
}
