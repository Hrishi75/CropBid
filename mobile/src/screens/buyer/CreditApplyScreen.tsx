// =============================================================================
// CreditApplyScreen — a partner applying for credit: a buyer to stock up, a
// seller (a farm, a shop, a wholesaler) to grow a crop or the business
// =============================================================================
// Opened from the business-credit card on the wallet. Asks only what a lender
// would ask first: who the business is, how much it buys, how much it needs and
// for how long, and a number to call. Prefilled from the buyer profile, and
// from the application itself when editing or applying again.
//
// THE CONSENT BOX IS NOT DECORATION. The application exists to be shown to a
// lending partner, so without the buyer's agreement there is nothing to do with
// it, and the server refuses it. The box starts unticked.
//
// Limits and repayment periods come from the server (GET /credit), never kept
// here, so the form cannot offer an ask the server refuses.
// =============================================================================

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Alert } from '../../lib/alert';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Mono } from '../../components/buyerKit';
import { Button } from '../../components/ui';
import { applyForCredit, fetchCredit } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import type { CreditRules, CreditSide, CreditUse } from '../../api/types';
import { SIDE_WORDS, USE_LABEL } from '../../lib/credit';
import { useAuth } from '../../context/AuthContext';
import { money } from '../../lib/format';
import { colors, design, font } from '../../theme';

const digits = (v: string) => v.replace(/[^0-9]/g, '');

export default function CreditApplyScreen() {
  const nav = useNavigation<any>();
  const { t } = useTranslation();
  const { user } = useAuth();

  const [rules, setRules] = useState<CreditRules | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The side this session applies from, as the server reads it (a seller in
  // buying mode is a buyer here). The role says the same until it answers.
  const [side, setSide] = useState<CreditSide>(user?.role === 'FARMER' ? 'SELLER' : 'BUYER');
  const [useFor, setUseFor] = useState<CreditUse | null>(null);
  const words = SIDE_WORDS[side];

  // A seller applies under its business name, or a farmer under their own.
  const [businessName, setBusinessName] = useState(
    user?.role === 'FARMER'
      ? user?.farmerProfile?.businessName || user?.name || ''
      : user?.buyerProfile?.companyName ?? user?.farmerProfile?.businessName ?? '',
  );
  const [gstin, setGstin] = useState('');
  const [years, setYears] = useState('');
  const [monthly, setMonthly] = useState('');
  const [amount, setAmount] = useState('');
  const [days, setDays] = useState<number | null>(null);
  const [purpose, setPurpose] = useState('');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [consent, setConsent] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    fetchCredit()
      .then(({ rules: r, side: s, application: a }) => {
        setRules(r);
        if (s) setSide(s);
        // Editing, or applying again after a no: start from what they sent.
        // The consent box still starts unticked, because each submission is a
        // fresh agreement to share it.
        if (a) {
          setEditing(a.status === 'SUBMITTED');
          setBusinessName(a.businessName);
          setGstin(a.gstin ?? '');
          setYears(String(a.yearsInBusiness));
          setMonthly(String(a.monthlyPurchase));
          setAmount(String(a.amountWanted));
          setDays(a.repaymentDays);
          setPurpose(a.purpose ?? '');
          setPhone(a.contactPhone);
          // Carry the use across only if this side may pick it.
          if (a.useFor && r.uses?.[s ?? 'BUYER']?.includes(a.useFor)) setUseFor(a.useFor);
        }
      })
      .catch((e) => setLoadError(errorMessage(e, 'Could not open the form.')));
  }, []);

  const amountNum = Number(amount);

  function validate(): string | null {
    if (!rules) return 'Still loading. Try again in a moment.';
    // An older server serves no uses and takes none.
    if (rules.uses && !useFor) return 'Choose what the money is for';
    if (businessName.trim().length < 2) return side === 'SELLER' ? 'Enter your farm or business name' : 'Enter your business name';
    if (years === '') return 'How many years have you been in business?';
    if (!(Number(monthly) > 0)) return side === 'SELLER' ? 'Roughly how much do you sell in a month?' : 'Roughly how much produce do you buy in a month?';
    if (!(amountNum >= rules.minAmount && amountNum <= rules.maxAmount)) {
      return `Ask for between ${money(rules.minAmount)} and ${money(rules.maxAmount)}`;
    }
    if (days == null) return 'Choose how long you need to repay';
    if (digits(phone).length < 10) return 'Enter a phone number we can call you on';
    if (!consent) return 'Tick the box to let us share this with lending partners';
    return null;
  }

  async function onSubmit() {
    const problem = validate();
    if (problem) { setError(problem); return; }
    setError(null);
    setSubmitting(true);
    try {
      await applyForCredit({
        ...(useFor ? { useFor } : {}),
        businessName: businessName.trim(),
        gstin: gstin.trim() || null,
        yearsInBusiness: Number(years),
        monthlyPurchase: Number(monthly),
        amountWanted: amountNum,
        repaymentDays: days!,
        purpose: purpose.trim() || null,
        contactPhone: phone.trim(),
        consent,
      });
      Alert.alert(
        editing ? t('Application updated') : t('Application in'),
        t('A person will read it and call you when there is an answer. It is not instant.'),
        [{ text: 'OK', onPress: () => nav.goBack() }],
      );
    } catch (e) {
      setError(errorMessage(e, 'Could not send your application'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <View style={[styles.flex, styles.center]}>
        <Text style={styles.error}>{loadError}</Text>
      </View>
    );
  }
  if (!rules) {
    return (
      <View style={[styles.flex, styles.center]}>
        <ActivityIndicator color={colors.forest} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Scrolling closes the keyboard: the number pad has no Done key, so it
          was otherwise the only way out of a quantity or price field. */}
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text style={styles.intro}>
          {t(words.intro)}
        </Text>

        {rules.uses ? (
          <View style={styles.card}>
            <Mono style={styles.eyebrow}>{t('WHAT IT IS FOR')}</Mono>
            <View style={styles.pillRow}>
              {rules.uses[side].map((u) => (
                <Pressable key={u} onPress={() => { setError(null); setUseFor(u); }} style={[styles.pill, useFor === u && styles.pillOn]}>
                  <Text style={[styles.pillText, useFor === u && styles.pillTextOn]}>{t(USE_LABEL[u])}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.card}>
          <Mono style={styles.eyebrow}>{t(side === 'SELLER' ? 'YOU' : 'YOUR BUSINESS')}</Mono>
          <Field label={t(words.nameLabel)}>
            <TextInput style={styles.input} value={businessName} onChangeText={(v) => { setError(null); setBusinessName(v); }} placeholder={words.namePlaceholder} placeholderTextColor={design.ink3} />
          </Field>
          <View style={styles.row}>
            <View style={styles.rowField}>
              <Field label={t('GSTIN (optional)')}>
                <TextInput style={styles.input} value={gstin} onChangeText={(v) => setGstin(v.toUpperCase())} autoCapitalize="characters" maxLength={15} placeholder="27ABCDE1234F1Z5" placeholderTextColor={design.ink3} />
              </Field>
            </View>
            <View style={{ width: 110 }}>
              <Field label={t('Years running')}>
                <TextInput style={styles.input} value={years} onChangeText={(v) => { setError(null); setYears(digits(v)); }} keyboardType="number-pad" maxLength={3} placeholder="5" placeholderTextColor={design.ink3} />
              </Field>
            </View>
          </View>
          <Field label={t(words.monthlyLabel)}>
            <TextInput style={styles.input} value={monthly} onChangeText={(v) => { setError(null); setMonthly(digits(v)); }} keyboardType="number-pad" placeholder={words.monthlyPlaceholder} placeholderTextColor={design.ink3} />
          </Field>
        </View>

        <View style={styles.card}>
          <Mono style={styles.eyebrow}>{t('WHAT YOU NEED')}</Mono>
          <Field label={t('How much (₹)')}>
            <TextInput style={styles.input} value={amount} onChangeText={(v) => { setError(null); setAmount(digits(v)); }} keyboardType="number-pad" placeholder="2,00,000" placeholderTextColor={design.ink3} />
          </Field>
          <Text style={styles.hint}>
            {amountNum > 0 ? `${money(amountNum)} · ` : ''}{t('Between')} {money(rules.minAmount)} {t('and')} {money(rules.maxAmount)}
          </Text>
          <Field label={t('Repay in')}>
            <View style={styles.pillRow}>
              {rules.repaymentDays.map((d) => (
                <Pressable key={d} onPress={() => { setError(null); setDays(d); }} style={[styles.pill, days === d && styles.pillOn]}>
                  <Text style={[styles.pillText, days === d && styles.pillTextOn]}>{d} {t('days')}</Text>
                </Pressable>
              ))}
            </View>
          </Field>
          <Field label={t(words.moreLabel)}>
            <TextInput style={[styles.input, styles.multiline]} value={purpose} onChangeText={setPurpose} multiline maxLength={500} placeholder={t(words.morePlaceholder)} placeholderTextColor={design.ink3} />
          </Field>
        </View>

        <View style={styles.card}>
          <Mono style={styles.eyebrow}>{t('HOW TO REACH YOU')}</Mono>
          <Field label={t('Phone number')}>
            <TextInput style={styles.input} value={phone} onChangeText={(v) => { setError(null); setPhone(v); }} keyboardType="phone-pad" placeholder="98220 55667" placeholderTextColor={design.ink3} />
          </Field>

          <Pressable onPress={() => { setError(null); setConsent((c) => !c); }} style={styles.consent} accessibilityRole="checkbox" accessibilityState={{ checked: consent }}>
            <View style={[styles.box, consent && styles.boxOn]}>
              {consent ? <Text style={styles.tick}>✓</Text> : null}
            </View>
            <Text style={styles.consentText}>
              {t('I agree to CropBid sharing these details with lending partners so they can decide on my application.')}
            </Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button label={editing ? t('Update application') : t('Send application')} onPress={onSubmit} loading={submitting} />
        <Text style={styles.fine}>
          {t('Interest and repayment terms are set by the lender and told to you before you agree to anything.')}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { padding: 14, gap: 12, paddingBottom: 40 },
  intro: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 20, color: design.ink2, paddingHorizontal: 2 },
  card: {
    backgroundColor: design.paper, borderRadius: 14, borderWidth: 1, borderColor: design.line, padding: 16,
  },
  eyebrow: { fontSize: 10, letterSpacing: 0.7, color: design.ink3, marginBottom: 6 },
  field: { marginTop: 10 },
  label: { fontFamily: font.sansSemi, fontSize: 12.5, color: design.ink2, marginBottom: 5 },
  input: {
    borderWidth: 1, borderColor: design.line, borderRadius: 11,
    paddingHorizontal: 13, paddingVertical: 12,
    fontFamily: font.sans, fontSize: 15, color: design.ink, backgroundColor: design.bg,
  },
  multiline: { minHeight: 76, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10 },
  rowField: { flex: 1 },
  hint: { fontFamily: font.sans, fontSize: 12, color: design.ink3, marginTop: 5 },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  pill: {
    borderWidth: 1, borderColor: design.line, backgroundColor: design.bg,
    borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9,
  },
  pillOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  pillText: { fontFamily: font.sansMed, fontSize: 13, color: design.ink2 },
  pillTextOn: { color: colors.textInverse },

  consent: { flexDirection: 'row', gap: 11, marginTop: 16, alignItems: 'flex-start' },
  box: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: design.line,
    alignItems: 'center', justifyContent: 'center', backgroundColor: design.bg, marginTop: 1,
  },
  boxOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  tick: { color: colors.surface, fontSize: 13, fontFamily: font.sansBold },
  consentText: { flex: 1, fontFamily: font.sans, fontSize: 13, lineHeight: 19, color: design.ink },

  error: { fontFamily: font.sansMed, fontSize: 13, color: colors.error },
  fine: { fontFamily: font.sans, fontSize: 11.5, lineHeight: 17, color: design.ink3, textAlign: 'center', paddingHorizontal: 8 },
});
