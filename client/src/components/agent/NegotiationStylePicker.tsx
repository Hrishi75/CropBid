// =============================================================================
// NegotiationStylePicker — Pick how the AI agent bargains
// =============================================================================
// Renders three selectable cards (Aggressive / Balanced / Conservative) that
// set the agent's negotiation strategy. Controlled component: parent owns the
// `value` and gets the new choice via `onChange`. See the JSDoc below for why
// cards are used instead of a dropdown.
// =============================================================================

import { Zap, Scale, Shield } from 'lucide-react';
import type { NegotiationStyle } from '../../types';

interface NegotiationStylePickerProps {
  value: NegotiationStyle;
  onChange: (style: NegotiationStyle) => void;
}

/**
 * WHY VISUAL CARDS INSTEAD OF A DROPDOWN?
 * Negotiation style is the most important agent setting — it determines
 * how the AI behaves in every negotiation. Visual cards with descriptions
 * help users understand the trade-offs:
 *   - Aggressive: Faster deals, but may lose opportunities
 *   - Balanced: Best for most users
 *   - Conservative: Protects margins, but negotiations take longer
 */

const STYLES: {
  value: NegotiationStyle;
  label: string;
  icon: React.ReactNode;
  desc: string;
  traits: string[];
  color: string;
}[] = [
  {
    value: 'AGGRESSIVE',
    label: 'Aggressive',
    icon: <Zap size={24} />,
    desc: 'Pushes hard for the best price',
    traits: ['Starts near your ideal price', 'Small concessions', 'Quick to reject low offers', 'Fewer rounds, faster outcome'],
    color: 'border-error text-error',
  },
  {
    value: 'BALANCED',
    label: 'Balanced',
    icon: <Scale size={24} />,
    desc: 'Fair negotiation for both sides',
    traits: ['Starts at midpoint', 'Reasonable concessions', 'Weighs trust scores', 'Most likely to reach a deal'],
    color: 'border-accent text-accent',
  },
  {
    value: 'CONSERVATIVE',
    label: 'Conservative',
    icon: <Shield size={24} />,
    desc: 'Protects your price boundaries',
    traits: ['Starts near floor/ceiling', 'Minimal concessions', 'Patient negotiation', 'Prioritizes your margins'],
    color: 'border-primary text-primary',
  },
];

export function NegotiationStylePicker({ value, onChange }: NegotiationStylePickerProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-text mb-3">Negotiation Style</label>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {STYLES.map((style) => {
          const isSelected = value === style.value;
          return (
            <button
              key={style.value}
              type="button"
              onClick={() => onChange(style.value)}
              className={`p-4 rounded-xl border-2 text-left transition-all
                ${isSelected
                  ? `${style.color} bg-surface shadow-sm`
                  : 'border-border text-text-secondary hover:border-accent/50'
                }`}
            >
              <div className={`mb-2 ${isSelected ? '' : 'text-text-muted'}`}>
                {style.icon}
              </div>
              <p className={`font-semibold text-sm mb-1 ${isSelected ? 'text-text' : ''}`}>
                {style.label}
              </p>
              <p className="text-xs text-text-secondary mb-2">{style.desc}</p>
              <ul className="space-y-1">
                {style.traits.map((trait) => (
                  <li key={trait} className="text-xs text-text-muted flex items-center gap-1">
                    <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-accent' : 'bg-text-muted'}`} />
                    {trait}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>
    </div>
  );
}
