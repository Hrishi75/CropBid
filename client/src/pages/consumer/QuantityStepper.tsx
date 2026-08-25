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
  /**
   * 'md' is the product page's full-width picker. 'sm' is the pill that sits in
   * a cart row and on a shelf card, where the control has to fit next to a
   * price rather than own a line of its own.
   */
  size?: 'sm' | 'md';
  /** Lets the smallest step remove the row instead of clamping at one step. */
  onEmpty?: () => void;
  /**
   * Whether the pill spells out the unit next to the number. A cart row has
   * space for "1.5 kg"; a 150px-wide shelf card does not, and there the price
   * sitting beside it already reads "₹28/kg", so the unit is only repeated.
   * Only meaningful at size 'sm'.
   */
  showUnit?: boolean;
}

// 2dp is enough for every step size above and kills the float dust.
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function QuantityStepper({ value, onChange, unit, max, size = 'md', onEmpty, showUnit = true }: QuantityStepperProps) {
  const step = STEP[unit];
  const label = unit.toLowerCase();

  // Never offer a quantity the server would reject: the floor is one step and
  // the ceiling is whatever stock is actually left.
  const clamp = (n: number) => round(Math.min(max, Math.max(step, n)));

  // At one step, − either removes the row (cart, shelf card) or does nothing
  // (product page, where there is no row to remove).
  const atMin = value <= step;
  const atMax = value >= max;
  const decrement = () => {
    if (atMin) { onEmpty?.(); return; }
    onChange(clamp(value - step));
  };

  if (size === 'sm') {
    return (
      <div className={`cn-step${showUnit ? '' : ' tight'}`}>
        <button type="button" aria-label={atMin && onEmpty ? `Remove ${label}` : `Less ${label}`}
          disabled={atMin && !onEmpty} onClick={decrement}>
          {atMin && onEmpty ? '🗑' : '−'}
        </button>
        {/* The unit stays in the accessible name even when it is not drawn —
            "1.5" alone tells a screen reader nothing about what was added. */}
        <span className="cn-step-val cb-mono" aria-label={`${value} ${label}`}>
          {value}{showUnit && <span className="cn-step-unit"> {label}</span>}
        </span>
        <button type="button" aria-label={`More ${label}`} disabled={atMax}
          onClick={() => onChange(clamp(value + step))}>
          +
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button
        type="button"
        className="cb-btn cb-btn-ghost"
        aria-label={`Less ${label}`}
        disabled={atMin && !onEmpty}
        onClick={decrement}
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
