// =============================================================================
// AgentStatusBadge — Toggle pill for the AI negotiation agent
// =============================================================================
// A single button that shows whether the user's auto-negotiation agent is on,
// and toggles it via the onToggle callback. The bot icon pulses while active.
// Parent owns the state; this is a presentational toggle.
// =============================================================================

import { Bot } from 'lucide-react';

interface AgentStatusBadgeProps {
  active: boolean;
  onToggle: () => void;
  loading?: boolean;
}

export function AgentStatusBadge({ active, onToggle, loading }: AgentStatusBadgeProps) {
  return (
    <button
      onClick={onToggle}
      disabled={loading}
      className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all
        ${active
          ? 'bg-accent text-white shadow-sm'
          : 'bg-surface-alt text-text-secondary border border-border hover:border-accent'
        }
        ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <Bot size={16} className={active ? 'animate-pulse' : ''} />
      {active ? 'Agent Active' : 'Agent Inactive'}
      <span className={`w-2 h-2 rounded-full ${active ? 'bg-white' : 'bg-text-muted'}`} />
    </button>
  );
}
