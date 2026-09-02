// =============================================================================
// QuantityStepper — how much of a listing a shopper wants
// =============================================================================
// Denominated in KILOGRAMS, always, whatever the farmer sells in. A household
// buys half a kilo of chillies; it does not buy 0.005 tonne, and showing it
// that way asks the shopper to do arithmetic to find out whether they are
// about to order a bag or a truck. The lot's own unit is a wholesale detail
// and stays out of the retail surface entirely.
//
// The conversion back into the lot's unit happens at the edge that talks to
// the API (see fromKg in utils/units), not here.
//
// Floating point is the real hazard: 0.1 + 0.2 is 0.30000000000000004, and
// that number would go on to be multiplied by a price and sent as an order
// quantity. Every arithmetic result is rounded to 2dp — 10 g of resolution,
// far finer than the step below — before it leaves.
// =============================================================================

import { formatWeight } from '../../utils/units';

// Half a kilo, the smallest amount a shopper realistically asks for and the
// increment a vegetable stall works in.
const STEP_KG = 0.5;

interface QuantityStepperProps {
  /** Current quantity, in kilograms. */
  value: number;
  /** Called with the next quantity, in kilograms. */
  onChange: (next: number) => void;
  /** Stock left, in kilograms. */
  max: number;
  /**
   * 'md' is the product page's full-width picker. 'sm' is the pill that sits in
   * a cart row and on a shelf card, where the control has to fit next to a
   * price rather than own a line of its own.
   */
  size?: 'sm' | 'md';
  /** Lets the smallest step remove the row instead of clamping at one step. */
  onEmpty?: () => void;
}

// 2dp is enough for the step above and kills the float dust.
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function QuantityStepper({ value, onChange, max, size = 'md', onEmpty }: QuantityStepperProps) {
  const label = formatWeight(value);

  // Never offer a quantity the server would reject: the floor is one step and
  // the ceiling is whatever stock is actually left.
  const clamp = (n: number) => round(Math.min(max, Math.max(STEP_KG, n)));

  // At one step, − either removes the row (cart, shelf card) or does nothing
  // (product page, where there is no row to remove).
  const atMin = value <= STEP_KG;
  const atMax = value >= max;
  const decrement = () => {
    if (atMin) { onEmpty?.(); return; }
    onChange(clamp(value - STEP_KG));
  };

  if (size === 'sm') {
    return (
      <div className="cn-step">
        <button type="button" aria-label={atMin && onEmpty ? 'Remove from cart' : 'Less'}
          disabled={atMin && !onEmpty} onClick={decrement}>
          {atMin && onEmpty ? '🗑' : '−'}
        </button>
        {/* The weight reads the same to a screen reader as it does on screen —
            "1.5" alone tells a screen reader nothing about what was added. */}
        <span className="cn-step-val cb-mono" aria-label={label}>
          {label}
        </span>
        <button type="button" aria-label="More" disabled={atMax}
          onClick={() => onChange(clamp(value + STEP_KG))}>
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
        aria-label="Less"
        disabled={atMin && !onEmpty}
        onClick={decrement}
        style={{ minWidth: 44, justifyContent: 'center', fontSize: 18, lineHeight: 1 }}
      >
        −
      </button>

      <div style={{ flex: 1, textAlign: 'center' }}>
        <span className="cb-mono" style={{ fontSize: 20, fontWeight: 500 }}>{label}</span>
      </div>

      <button
        type="button"
        className="cb-btn cb-btn-ghost"
        aria-label="More"
        disabled={atMax}
        onClick={() => onChange(clamp(value + STEP_KG))}
        style={{ minWidth: 44, justifyContent: 'center', fontSize: 18, lineHeight: 1 }}
      >
        +
      </button>
    </div>
  );
}
