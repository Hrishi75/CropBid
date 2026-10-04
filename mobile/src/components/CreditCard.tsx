// =============================================================================
// CreditCard — business credit, on a buyer's wallet
// =============================================================================
// Money to stock up now and repay later, applied for here and read by a person.
//
// WHAT IT MUST NOT SAY: "instant", "guaranteed", or anything that reads as
// CropBid lending. CropBid does not lend and has no lending partner signed yet;
// a person reads each application and, with the buyer's permission, takes it to
// one. An approval records a limit somebody agreed to, and setting it up is a
// phone call, not credits landing in this wallet (CLAUDE.md §9).
//
// One card, four states, read off the buyer's own application: nothing yet (the
// pitch and how it works), in, being read, approved, or not approved.
// =============================================================================

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Mono } from './buyerKit';
import { PressScale } from './motion';
import type { CreditApplication } from '../api/types';
import { money, timeAgo } from '../lib/format';
import { colors, design, font, radius, spacing } from '../theme';

const STEPS: Array<[string, string]> = [
  ['Tell us about your business', 'What you buy, roughly how much a month, and how much you need. Two minutes.'],
  ['A person reads it', 'With your permission we share it with a lending partner. It is not instant.'],
  ['We call you with the answer', 'If a lender says yes, we set it up with you on the phone, terms and all.'],
];

export function CreditCard({
  application, onApply,
}: {
  application: CreditApplication | null;
  onApply: () => void;
}) {
  const { t } = useTranslation();

  if (!application) {
    return (
      <View style={styles.card}>
        <Mono style={styles.kicker}>{t('BUSINESS CREDIT')}</Mono>
        <Text style={styles.title}>{t('Need money to stock up?')}</Text>
        <Text style={styles.lede}>
          {t('Buy produce now and repay in 30, 60 or 90 days. Tell us about your business and we take it to a lending partner.')}
        </Text>
        <View style={styles.steps}>
          {STEPS.map(([head, body], i) => (
            <View key={head} style={styles.step}>
              <View style={styles.stepN}><Text style={styles.stepNText}>{i + 1}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepHead}>{t(head)}</Text>
                <Text style={styles.stepBody}>{t(body)}</Text>
              </View>
            </View>
          ))}
        </View>
        <PressScale onPress={onApply} scaleTo={0.98} cardStyle={styles.cta}>
          <Text style={styles.ctaText}>{t('Apply for business credit')}</Text>
        </PressScale>
        <Text style={styles.fine}>
          {t('CropBid does not lend money. Interest and repayment terms are set by the lender and told to you before you agree to anything.')}
        </Text>
      </View>
    );
  }

  const a = application;
  const asked = `${money(a.amountWanted)} · ${a.repaymentDays} ${t('days')}`;

  return (
    <View style={styles.card}>
      <View style={styles.statusRow}>
        <View style={[styles.dot, { backgroundColor: TONE[a.status] }]} />
        <Mono style={[styles.kicker, { color: TONE[a.status], marginBottom: 0 }]}>{t(HEAD[a.status])}</Mono>
        <Mono style={styles.when}>{timeAgo(a.reviewedAt ?? a.updatedAt).toUpperCase()}</Mono>
      </View>

      {a.status === 'APPROVED' && a.approvedLimit != null ? (
        <>
          <Text style={styles.limit}>{money(a.approvedLimit)}</Text>
          <Text style={styles.lede}>
            {t('Approved limit. We will call you on')} {a.contactPhone} {t('to set it up. Nothing is added to your wallet until then.')}
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.title}>{a.businessName}</Text>
          <Text style={styles.asked}>{t('You asked for')} {asked}</Text>
          <Text style={styles.lede}>{t(BODY[a.status])}</Text>
        </>
      )}

      {a.status === 'DECLINED' && a.reviewNote ? (
        <View style={styles.note}>
          <Mono style={styles.noteLabel}>{t('WHY')}</Mono>
          <Text style={styles.noteText}>{a.reviewNote}</Text>
        </View>
      ) : null}

      {/* Editable while it waits, and open again after a no. Being read or
          approved is a person's decision, so there is no button to undo it. */}
      {a.status === 'SUBMITTED' || a.status === 'DECLINED' ? (
        <PressScale onPress={onApply} scaleTo={0.98} cardStyle={a.status === 'DECLINED' ? styles.cta : styles.ghost}>
          <Text style={a.status === 'DECLINED' ? styles.ctaText : styles.ghostText}>
            {a.status === 'DECLINED' ? t('Apply again') : t('Edit your application')}
          </Text>
        </PressScale>
      ) : null}
    </View>
  );
}

const HEAD: Record<CreditApplication['status'], string> = {
  SUBMITTED: 'APPLICATION IN',
  IN_REVIEW: 'BEING READ',
  APPROVED: 'BUSINESS CREDIT APPROVED',
  DECLINED: 'NOT APPROVED THIS TIME',
};

const BODY: Record<CreditApplication['status'], string> = {
  SUBMITTED: 'Waiting for somebody to pick it up. You can still change it until they do.',
  IN_REVIEW: 'Somebody is reading it now. We will call you when there is an answer.',
  APPROVED: '',
  DECLINED: 'You can apply again with more detail.',
};

const TONE: Record<CreditApplication['status'], string> = {
  SUBMITTED: design.ink3,
  IN_REVIEW: '#b7791f',
  APPROVED: colors.sage,
  DECLINED: colors.ember,
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg, marginTop: spacing.xl,
    backgroundColor: design.paper, borderWidth: 1, borderColor: design.line,
    borderRadius: radius.lg, padding: spacing.lg,
  },
  kicker: { fontSize: 10, letterSpacing: 1.1, color: colors.sage, marginBottom: 6 },
  title: { fontFamily: font.sansBold, fontSize: 19, color: design.ink, letterSpacing: -0.3 },
  lede: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 20, color: design.ink2, marginTop: 6 },
  steps: { marginTop: spacing.md, gap: 12 },
  step: { flexDirection: 'row', gap: 12 },
  stepN: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: design.mint,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  stepNText: { fontFamily: font.sansBold, fontSize: 12, color: colors.forest },
  stepHead: { fontFamily: font.sansSemi, fontSize: 14, color: design.ink },
  stepBody: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 18, color: design.ink3, marginTop: 2 },
  cta: {
    marginTop: spacing.lg, backgroundColor: colors.forest, borderRadius: radius.md,
    paddingVertical: 14, alignItems: 'center',
  },
  ctaText: { fontFamily: font.sansSemi, fontSize: 15, color: colors.surface },
  ghost: {
    marginTop: spacing.lg, borderWidth: 1, borderColor: design.line, borderRadius: radius.md,
    paddingVertical: 12, alignItems: 'center', backgroundColor: design.bg,
  },
  ghostText: { fontFamily: font.sansSemi, fontSize: 14.5, color: colors.forest },
  fine: { fontFamily: font.sans, fontSize: 11.5, lineHeight: 17, color: design.ink3, marginTop: spacing.md },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  when: { marginLeft: 'auto', fontSize: 10, letterSpacing: 0.8, color: design.ink3 },
  asked: { fontFamily: font.sansMed, fontSize: 14, color: design.ink, marginTop: 4 },
  limit: { fontFamily: font.sansBold, fontSize: 32, color: colors.forest, letterSpacing: -0.8 },
  note: { marginTop: spacing.md, backgroundColor: design.bg, borderRadius: radius.md, padding: spacing.md },
  noteLabel: { fontSize: 9.5, letterSpacing: 0.9, color: design.ink3 },
  noteText: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 19, color: design.ink, marginTop: 3 },
});
