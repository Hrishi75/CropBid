// =============================================================================
// Skeleton — Loading placeholders
// =============================================================================
// Pulsing grey blocks shown while data loads, to avoid layout jumps.
//   - Skeleton:      one configurable bar (width/height)
//   - SkeletonCard:  a card-shaped cluster of bars
//   - SkeletonStats: a 4-cell KPI strip placeholder
//
// The pulse @keyframes is injected once into <head> on first mount (guarded by
// an id check) so the animation works without relying on the global stylesheet.
// =============================================================================

import { useEffect } from 'react';

interface SkeletonProps {
  className?: string;
  width?: number | string;
  height?: number | string;
}

export function Skeleton({ className = '', width, height }: SkeletonProps) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const id = 'cb-skeleton-style';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `@keyframes cb-skeleton-pulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 0.85; } }`;
    document.head.appendChild(style);
  }, []);
  return (
    <div
      className={className}
      aria-hidden="true"
      style={{
        background: 'var(--cb-paper-2, #efece3)',
        borderRadius: 6,
        animation: 'cb-skeleton-pulse 1.4s ease-in-out infinite',
        width, height,
      }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="cb-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Skeleton height={20} width="40%" />
      <Skeleton height={16} width="100%" />
      <Skeleton height={16} width="80%" />
      <Skeleton height={48} width="100%" />
    </div>
  );
}

export function SkeletonStats() {
  return (
    <div className="cb-kpi-strip">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="cb-kpi-cell">
          <Skeleton height={12} width="50%" />
          <div style={{ marginTop: 10 }}><Skeleton height={28} width="60%" /></div>
        </div>
      ))}
    </div>
  );
}
