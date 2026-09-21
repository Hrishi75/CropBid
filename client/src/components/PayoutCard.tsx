// =============================================================================
// PayoutCard: the seller's own account details, on the web
// =============================================================================
// The website has no seller profile page at all: everything a seller can edit
// about themselves lives in the phone app. That was survivable while nothing
// on the profile mattered, and stopped being survivable the day money started
// reaching escrow with nowhere to go, so the card lives on the dashboard,
// which is the one seller screen on the web that everybody opens.
//
// Two states, because they are two different jobs. With nothing on file it is
// a warning and the form is open: this seller cannot be paid. With something
// on file it is a line of masked text and a link, since changing a bank
// account is rare and a permanently open form invites an accidental
// half-edit.
// =============================================================================

import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/Button';
import { EMPTY_PAYOUT, PayoutFields, isPayoutUntouched, type PayoutValues } from './PayoutFields';
import api from '../lib/axios';
import toast from 'react-hot-toast';

export function PayoutCard() {
  const { user, updateUser } = useAuth();
  const profile = user?.farmerProfile || null;
  const onFile = !!(profile?.payoutUpiId || profile?.payoutAccountNumber);

  const [open, setOpen] = useState(!onFile);
  const [values, setValues] = useState<PayoutValues>(EMPTY_PAYOUT);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!profile) return null;

  async function submit(payload: PayoutValues, done: string) {
    setSaving(true);
    try {
      const { data } = await api.patch('/auth/me', payload);
      updateUser(data.user);
      // Cleared rather than left sitting there: what the server sends back is
      // masked, so the values in these boxes are now the only unmasked copy
      // on the page.
      setValues(EMPTY_PAYOUT);
      setOpen(false);
      toast.success(done);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not save those details');
    } finally {
      setSaving(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (isPayoutUntouched(values)) {
      toast.error('Enter a UPI id or a bank account first');
      return;
    }
    await submit(values, 'Payout details saved');
  }

  // Sending all four blank is how the server is told to forget an account,
  // and until this existed nothing could send it: every form leaves the
  // fields out when they are empty, so the only way off a stale or wrong
  // account was to type a different one. A seller who has sold their shop or
  // closed that account has neither.
  //
  // CONFIRMED IN THE PAGE, not in a window.confirm. Plenty of browser
  // contexts suppress native dialogs and return false without showing
  // anything, which turns a destructive button into one that looks broken:
  // the Browser pane does exactly that, which is how this was caught. The
  // two-step is the same shape the admin review queue uses, where the first
  // click reveals the confirmation and the second sends.
  async function remove() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    await submit(EMPTY_PAYOUT, 'Payout details removed');
  }

  return (
    <div
      className="cb-card"
      style={{
        marginBottom: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        borderColor: onFile ? undefined : 'var(--cb-ember)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <div className="cb-eyebrow">Getting paid</div>
        {onFile && !open && (
          <button type="button" className="cb-btn cb-btn-link" onClick={() => setOpen(true)}>
            Change
          </button>
        )}
      </div>

      {!onFile && (
        <p className="cb-tiny" style={{ margin: 0, color: 'var(--cb-ember)' }}>
          We have nowhere to send your money. Add a UPI id or a bank account so a completed sale
          can be paid out to you.
        </p>
      )}

      {/* Not while the form is open: the same masked line is inside it, under
          "On file", where it is there to be compared against what is being
          typed. Printing it twice reads as two different accounts. */}
      {onFile && !open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {profile.payoutUpiId && <span className="cb-mono">UPI · {profile.payoutUpiId}</span>}
          {profile.payoutAccountNumber && (
            <span className="cb-mono">
              {profile.payoutAccountName ? `${profile.payoutAccountName} · ` : ''}
              {profile.payoutAccountNumber}
              {profile.payoutIfsc ? ` · ${profile.payoutIfsc}` : ''}
            </span>
          )}
          <span className="cb-tiny">
            Money from a completed sale is sent here by hand once the buyer confirms delivery.
          </span>
        </div>
      )}

      {open && (
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <PayoutFields values={values} onChange={setValues} onFile={onFile ? profile : null} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save details'}
            </Button>
            {onFile && (
              <>
                <button
                  type="button"
                  className="cb-btn cb-btn-link"
                  onClick={() => {
                    setValues(EMPTY_PAYOUT);
                    setConfirming(false);
                    setOpen(false);
                  }}
                >
                  Cancel
                </button>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
                  {confirming && (
                    <span className="cb-tiny" style={{ color: 'var(--cb-ember)' }}>
                      Nowhere to pay you until you add new ones.
                    </span>
                  )}
                  <button
                    type="button"
                    className="cb-btn cb-btn-link"
                    style={{ color: 'var(--cb-ember)' }}
                    onClick={remove}
                    disabled={saving}
                  >
                    {confirming ? 'Yes, remove' : 'Remove'}
                  </button>
                </div>
              </>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
