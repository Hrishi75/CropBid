// Where a seller's money should go.
//
// One set of fields for both places a seller can give them: the partner
// application, and the profile editor they come back to when a number changes.
// The server takes a UPI id OR a bank account and refuses two thirds of a bank
// account (server/src/services/payoutDetails.ts); the copy here says so, so a
// seller finds out before they submit rather than after.
//
// WHAT /auth/me RETURNS IS MASKED, so these boxes START EMPTY even for a
// seller who already has an account on file: seeding them from the profile
// would post the mask straight back into the column. What is on file is shown
// above them instead, as text. The server refuses a masked value as well, and
// this is the reason it has to.

import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

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

/** Nothing typed: the caller sends no payout fields rather than four blanks. */
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
  /** The masked details already saved, so the seller knows there is something there. */
  onFile?: {
    payoutUpiId?: string | null;
    payoutAccountName?: string | null;
    payoutAccountNumber?: string | null;
    payoutIfsc?: string | null;
  } | null;
}) {
  const set = (key: keyof PayoutValues) => (text: string) => onChange({ ...values, [key]: text });
  const hasOnFile = !!(onFile?.payoutUpiId || onFile?.payoutAccountNumber);

  return (
    <>
      {hasOnFile ? (
        <View style={styles.onFile}>
          <Text style={styles.onFileTitle}>On file</Text>
          {onFile?.payoutUpiId ? <Text style={styles.onFileLine}>UPI · {onFile.payoutUpiId}</Text> : null}
          {onFile?.payoutAccountNumber ? (
            <Text style={styles.onFileLine}>
              Bank · {onFile.payoutAccountNumber}
              {onFile.payoutIfsc ? ` · ${onFile.payoutIfsc}` : ''}
            </Text>
          ) : null}
          <Text style={styles.onFileHint}>
            Fill anything in below to replace it. Leave it blank to keep what is there.
          </Text>
        </View>
      ) : null}

      <Text style={styles.label}>UPI id</Text>
      <TextInput
        style={styles.input}
        value={values.payoutUpiId}
        onChangeText={set('payoutUpiId')}
        placeholder="e.g., ramesh@okhdfc"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />
      <Text style={styles.hint}>
        A UPI id is enough on its own. Fill in the bank fields instead if you would rather be paid
        into an account.
      </Text>

      <Text style={styles.label}>Name on the bank account</Text>
      <TextInput
        style={styles.input}
        value={values.payoutAccountName}
        onChangeText={set('payoutAccountName')}
        placeholder="As the bank has it"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Account number</Text>
      <TextInput
        style={styles.input}
        value={values.payoutAccountNumber}
        onChangeText={set('payoutAccountNumber')}
        placeholder="9 to 18 digits"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
      />

      <Text style={styles.label}>IFSC</Text>
      <TextInput
        style={styles.input}
        value={values.payoutIfsc}
        onChangeText={set('payoutIfsc')}
        placeholder="e.g., HDFC0001234"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <Text style={styles.hint}>
        All three bank fields together, or none of them. Buyers never see any of this.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    marginBottom: spacing.lg,
  },
  hint: { fontSize: 12.5, lineHeight: 18, color: colors.textMuted, marginTop: -12, marginBottom: spacing.lg },
  onFile: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: 2,
  },
  onFileTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  onFileLine: { fontSize: 13, color: colors.textSecondary },
  onFileHint: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
});
