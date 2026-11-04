// =============================================================================
// LoadFailed — what an admin list shows when its fetch did not come back
// =============================================================================
// Not the empty state. "No users match" or "Queue clear, nothing waiting on
// you" is a claim about the data, and a failed request is not evidence for it:
// on the partners queue it read as every application handled.
// =============================================================================

interface Props {
  what: string;
  onRetry: () => void;
}

export function LoadFailed({ what, onRetry }: Props) {
  return (
    <div className="cb-card" style={{ padding: 40, textAlign: 'center' }} role="alert">
      <div className="cb-tiny" style={{ color: 'var(--cb-ember)', marginBottom: 10 }}>
        Couldn't load {what}, so we don't know what is there.
      </div>
      <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }} onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
