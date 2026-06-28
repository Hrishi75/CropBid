// Onboarding — post-signup profile setup (required before entering the app).
// Renders a farmer OR buyer form based on user.role and POSTs to
// /auth/onboarding/{farmer|buyer}. On success it re-pulls /auth/me so the root
// navigator drops the onboarding gate and shows the role's tabs.

import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { buyerOnboarding, farmerOnboarding, type BuyerOnboardingInput } from '../api/endpoints';
import { Button } from '../components/ui';
import { colors, radius, spacing } from '../theme';

// Compact crop set for the farmer picker (server accepts any string[]).
const CROPS = [
  'Rice', 'Wheat', 'Onion', 'Tomato', 'Potato', 'Grape', 'Sugarcane', 'Cotton',
  'Soybean', 'Maize', 'Chili', 'Turmeric', 'Banana', 'Mango', 'Groundnut', 'Coffee',
];

const COMPANY_TYPES: [BuyerOnboardingInput['companyType'], string][] = [
  ['PROCESSOR', 'Processor'],
  ['FMCG', 'FMCG'],
  ['RESTAURANT', 'Restaurant'],
  ['EXPORTER', 'Exporter'],
  ['RETAILER', 'Retailer'],
];

function taxLabel(country: string): string {
  if (country === 'India') return 'GST number';
  if (country === 'United States') return 'EIN';
  if (['Germany', 'France', 'Netherlands', 'United Kingdom'].includes(country)) return 'VAT number';
  return 'Tax ID';
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser, signOut } = useAuth();
  const country = user?.country || 'India';
  const isFarmer = user?.role === 'FARMER';

  // Farmer fields
  const [farmSize, setFarmSize] = useState('');
  const [state, setState] = useState('');
  const [crops, setCrops] = useState<string[]>([]);
  const [organic, setOrganic] = useState(false);
  const [fpoName, setFpoName] = useState('');
  const [apmcLicense, setApmcLicense] = useState('');

  // Buyer fields
  const [companyName, setCompanyName] = useState('');
  const [companyType, setCompanyType] = useState<BuyerOnboardingInput['companyType']>('PROCESSOR');
  const [taxId, setTaxId] = useState('');
  const [volume, setVolume] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleCrop(crop: string) {
    setCrops((prev) => (prev.includes(crop) ? prev.filter((c) => c !== crop) : [...prev, crop]));
  }

  function validate(): string | null {
    if (isFarmer) {
      const size = parseFloat(farmSize);
      if (!Number.isFinite(size) || size <= 0) return 'Enter a valid farm size';
      if (!state.trim()) return 'Enter your state / region';
      if (crops.length === 0) return 'Pick at least one crop';
    } else {
      if (!companyName.trim()) return 'Enter your company name';
    }
    return null;
  }

  async function onSubmit() {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      if (isFarmer) {
        await farmerOnboarding({
          farmSizeAcres: parseFloat(farmSize),
          cropsGrown: crops,
          state: state.trim(),
          organicCertified: organic,
          fpoName: fpoName.trim() || undefined,
          apmcLicense: apmcLicense.trim() || undefined,
        });
      } else {
        await buyerOnboarding({
          companyName: companyName.trim(),
          companyType,
          taxId: taxId.trim() || undefined,
          annualProcurementVolume: volume.trim() || undefined,
        });
      }
      await refreshUser(); // navigator swaps to the app once the profile exists
    } catch (e) {
      setError(errorMessage(e, 'Could not save your profile'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <Text style={styles.eyebrow}>Step 2 of 2</Text>
          <Pressable onPress={signOut} hitSlop={8}>
            <Text style={styles.logout}>Log out</Text>
          </Pressable>
        </View>
        <Text style={styles.title}>{isFarmer ? 'Set up your farm' : 'Set up your company'}</Text>
        <Text style={styles.sub}>
          {isFarmer
            ? 'Your agent uses these to match buyers and price your listings.'
            : 'Your agent uses these to find growers and anchor your bids.'}
        </Text>

        <View style={styles.card}>
          {isFarmer ? (
            <>
              <Text style={styles.label}>Farm size (acres)</Text>
              <TextInput
                style={styles.input}
                value={farmSize}
                onChangeText={setFarmSize}
                keyboardType="numeric"
                placeholder="e.g., 15"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.label}>State / region</Text>
              <TextInput
                style={styles.input}
                value={state}
                onChangeText={setState}
                placeholder="e.g., Maharashtra"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
              />

              <Text style={styles.label}>Crops grown · {crops.length} selected</Text>
              <View style={styles.chips}>
                {CROPS.map((crop) => {
                  const sel = crops.includes(crop);
                  return (
                    <Pressable key={crop} onPress={() => toggleCrop(crop)} style={[styles.chip, sel && styles.chipActive]}>
                      <Text style={[styles.chipText, sel && styles.chipTextActive]}>
                        {sel ? '✓ ' : ''}{crop}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable style={styles.toggleRow} onPress={() => setOrganic((v) => !v)}>
                <Text style={styles.label}>Organic certified</Text>
                <View style={[styles.switch, organic && styles.switchOn]}>
                  <View style={[styles.knob, organic && styles.knobOn]} />
                </View>
              </Pressable>

              {country === 'India' ? (
                <>
                  <Text style={[styles.label, styles.optional]}>FPO affiliation (optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={fpoName}
                    onChangeText={setFpoName}
                    placeholder="Farmer Producer Organization"
                    placeholderTextColor={colors.textMuted}
                  />
                  <Text style={[styles.label, styles.optional]}>APMC license (optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={apmcLicense}
                    onChangeText={setApmcLicense}
                    placeholder="e.g., MH-APMC-2024-1234"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="characters"
                  />
                </>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.label}>Company name</Text>
              <TextInput
                style={styles.input}
                value={companyName}
                onChangeText={setCompanyName}
                placeholder="e.g., Agri Foods Pvt Ltd"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
              />

              <Text style={styles.label}>Company type</Text>
              <View style={styles.chips}>
                {COMPANY_TYPES.map(([value, lbl]) => {
                  const sel = companyType === value;
                  return (
                    <Pressable key={value} onPress={() => setCompanyType(value)} style={[styles.chip, sel && styles.chipActive]}>
                      <Text style={[styles.chipText, sel && styles.chipTextActive]}>{lbl}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.label, styles.optional]}>{taxLabel(country)} (optional)</Text>
              <TextInput
                style={styles.input}
                value={taxId}
                onChangeText={setTaxId}
                placeholder={country === 'India' ? 'e.g., 27AABCA1234A1ZA' : 'Tax identification number'}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
              />

              <Text style={[styles.label, styles.optional]}>Annual procurement volume (optional)</Text>
              <TextInput
                style={styles.input}
                value={volume}
                onChangeText={setVolume}
                placeholder="e.g., 5000-10000 tonnes"
                placeholderTextColor={colors.textMuted}
              />
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.spacer} />
          <Button label="Activate account" onPress={onSubmit} loading={submitting} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surfaceAlt },
  container: { padding: spacing.xl, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: colors.sage, textTransform: 'uppercase' },
  logout: { fontSize: 13, color: colors.ember, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '800', color: colors.forest, marginTop: spacing.sm },
  sub: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.xl, lineHeight: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.xl,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  optional: { marginTop: spacing.sm },
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipActive: { borderColor: colors.forest, backgroundColor: colors.forest },
  chipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  chipTextActive: { color: colors.textInverse },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
  },
  switch: { width: 46, height: 28, borderRadius: 999, backgroundColor: colors.border, padding: 3, justifyContent: 'center' },
  switchOn: { backgroundColor: colors.sage },
  knob: { width: 22, height: 22, borderRadius: 999, backgroundColor: colors.surface, alignSelf: 'flex-start' },
  knobOn: { alignSelf: 'flex-end' },
  error: { color: colors.error, fontSize: 14, marginBottom: spacing.sm },
  spacer: { height: spacing.xs },
});
