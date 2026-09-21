// =============================================================================
// Where a seller's money should go
// =============================================================================
// One set of fields, used by the partner application and by the payout card on
// the seller's dashboard, because a seller who filled this in on the
// application must see the same thing when they come back to change a number.
//
// A UPI id OR a bank account: the server takes either, and refuses two thirds
// of a bank account (server/src/services/payoutDetails.ts). The rules are
// stated here in the copy as well as enforced there, so a seller who gets it
// wrong finds out before they submit rather than after.
//
// WHAT COMES BACK IS MASKED. /auth/me returns the account number as dots and
// the last four digits, which is deliberate: it is the seller's own screen but
// it is also the screen someone reads over their shoulder. So the form starts
// EMPTY with the masked value shown above it as "on file", rather than
// prefilled with a mask that would post straight back into the column. The
// server refuses a masked value anyway, and this is why it has to.
// =============================================================================

import { Input } from './ui/Input';

export interface PayoutValues {
  payoutUpiId: string;
  payoutAccountName: string;
  payoutAccountNumber: string;
  payoutIfsc: string;
}

export const EMPTY_PAYOUT: PayoutValues = {
  payoutUpiId: '',
  payoutAccountName: '',
  payoutAccountNumber: '',
  payoutIfsc: '',
};

/** Nothing typed at all: the caller sends no payout fields rather than blanks. */
export function isPayoutUntouched(values: PayoutValues): boolean {
  return Object.values(values).every((v) => v.trim() === '');
}

export function PayoutFields({
  values,
  onChange,
  onFile,
}: {
  values: PayoutValues;
  onChange: (next: PayoutValues) => void;
  /** The masked details already saved, if any, shown so the seller knows there is something there. */
  onFile?: { payoutUpiId: string | null; payoutAccountNumber: string | null; payoutIfsc: string | null } | null;
}) {
  const set = (key: keyof PayoutValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...values, [key]: e.target.value });

  const hasOnFile = !!(onFile?.payoutUpiId || onFile?.payoutAccountNumber);

  return (
    <>
      {hasOnFile && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: '10px 12px',
            background: 'var(--cb-paper-2)',
            border: '1px solid var(--cb-line)',
            borderRadius: 8,
          }}
        >
          <strong style={{ fontSize: 13 }}>On file</strong>
          {onFile?.payoutUpiId && <span className="cb-tiny">UPI · {onFile.payoutUpiId}</span>}
          {onFile?.payoutAccountNumber && (
            <span className="cb-tiny">
              Bank · {onFile.payoutAccountNumber}
              {onFile.payoutIfsc ? ` · ${onFile.payoutIfsc}` : ''}
            </span>
          )}
          <span className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>
            Fill anything in below to replace it. Leave it all blank to keep what is there.
          </span>
        </div>
      )}

      <Input
        label="UPI id"
        placeholder="e.g., ramesh@okhdfc"
        value={values.payoutUpiId}
        onChange={set('payoutUpiId')}
      />

      <p className="cb-field-hint" style={{ margin: 0 }}>
        A UPI id is enough on its own. Add a bank account instead if you would rather be paid into one.
      </p>

      <Input
        label="Name on the bank account"
        placeholder="As the bank has it"
        value={values.payoutAccountName}
        onChange={set('payoutAccountName')}
      />
      <div className="cb-form-grid-2">
        <Input
          label="Account number"
          placeholder="9 to 18 digits"
          value={values.payoutAccountNumber}
          onChange={set('payoutAccountNumber')}
        />
        <Input
          label="IFSC"
          placeholder="e.g., HDFC0001234"
          value={values.payoutIfsc}
          onChange={set('payoutIfsc')}
        />
      </div>
      <p className="cb-field-hint" style={{ margin: 0 }}>
        All three bank fields together, or none of them. We never show these to buyers.
      </p>
    </>
  );
}
