// =============================================================================
// QuantityStepper — how much of a listing a shopper wants
// =============================================================================
// Listings are denominated in the unit the FARMER sells in (kg, quintal or
// tonne), and the direct-purchase API takes its quantity in that same unit. A
// shopper buying "1" of a quintal-denominated lot would be ordering 100 kg, so
// the step size is scaled per unit rather than being a flat 1, and the caller
// prints the kg equivalent underneath.
//
// Floating point is the real hazard here: 0.1 + 0.2 is 0.30000000000000004, and
// that number would go on to be multiplied by a price and sent as an order
// quantity. Every arithmetic result is rounded to 2dp before it leaves.
// =============================================================================

import type { Unit } from '../../types';

// Roughly a half-kilo of resolution in every denomination, so the buttons move
// by an amount a household actually thinks in.
const STEP: Record<Unit, number> = { KG: 0.5, QUINTAL: 0.05, TONNE: 0.005 };

interface QuantityStepperProps {
  value: number;
  onChange: (next: number) => void;
  unit: Unit;
  max: number;
}

// 2dp is enough for every step size above and kills the float dust.
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function QuantityStepper({ value, onChange, unit, max }: QuantityStepperProps) {
  const step = STEP[unit];
  const label = unit.toLowerCase();

  // Never offer a quantity the server would reject: the floor is one step and
  // the ceiling is whatever stock is actually left.
  const clamp = (n: number) => round(Math.min(max, Math.max(step, n)));

  const atMin = value <= step;
  const atMax = value >= max;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button
        type="button"
        className="cb-btn cb-btn-ghost"
        aria-label={`Less ${label}`}
        disabled={atMin}
        onClick={() => onChange(clamp(value - step))}
        style={{ minWidth: 44, justifyContent: 'center', fontSize: 18, lineHeight: 1 }}
      >
        −
      </button>

      <div style={{ flex: 1, textAlign: 'center' }}>
        <span className="cb-mono" style={{ fontSize: 20, fontWeight: 500 }}>{value}</span>
        <span className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}> {label}</span>
      </div>

      <button
        type="button"
        className="cb-btn cb-btn-ghost"
        aria-label={`More ${label}`}
        disabled={atMax}
        onClick={() => onChange(clamp(value + step))}
        style={{ minWidth: 44, justifyContent: 'center', fontSize: 18, lineHeight: 1 }}
      >
        +
      </button>
    </div>
  );
}
