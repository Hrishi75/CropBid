// Onboarding — the partner application (required before entering the app).
// Renders a farmer OR buyer form based on user.role and POSTs to
// /auth/onboarding/{farmer|buyer}. On success it re-pulls /auth/me.
//
// THIS IS AN APPLICATION, NOT A PROFILE FORM. The server files what is typed
// here as a partner application with status SUBMITTED and refuses every seller
// and buyer route until an admin approves it, so submitting does NOT open the
// dashboard: the navigator swaps to PartnerStatusScreen, where the applicant
// waits for a decision. The copy says so before anything is typed — a form that
// promises a dashboard and then delivers a waiting room is a worse experience
// than one that was honest about the queue.
//
// It is also the RESUBMISSION form. A reviewer who asks for more (NEEDS_INFO)
// or turns an application down (REJECTED) sends the applicant back here from
// the status screen, and the same POST re-files it.

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
import { IconArrowLeft } from '../components/icons';
import { partnerApplication } from '../lib/partner';
import type { SellerType } from '../api/types';
import { wordsFor } from '../lib/sellerType';
import { colors, radius, spacing } from '../theme';

// Compact crop set for the farmer picker (server accepts any string[]).
const CROPS = [
  'Rice', 'Wheat', 'Onion', 'Tomato', 'Potato', 'Grape', 'Sugarcane', 'Cotton',
  'Soybean', 'Maize', 'Chili', 'Turmeric', 'Banana', 'Mango', 'Groundnut', 'Coffee',
];

function taxLabel(country: string): string {
  if (country === 'India') return 'GST number';
  if (country === 'United States') return 'EIN';
  if (['Germany', 'France', 'Netherlands', 'United Kingdom'].includes(country)) return 'VAT number';
  return 'Tax ID';
}

/** Which application a person is filling in. Not the same as their role. */
export type PartnerKind = 'FARMER' | 'BUYER';

/**
 * The three kinds of seller, and what each must supply.
 *
 * These mirror `validateSellerApplication` on the server, which is the rule
 * that actually decides. Repeated here only so the form asks for the right
 * things and can say what is missing before a round trip; the server refuses
 * regardless, and it is the one that counts.
 */
const SHOP_TYPES: [string, string][] = [
  ['VEGETABLE', 'Vegetable shop'],
  ['KIRANA', 'Kirana store'],
  ['GENERAL', 'General store'],
  ['DAIRY', 'Dairy'],
  ['BAKERY', 'Bakery'],
  ['OTHER', 'Something else'],
];

export default function OnboardingScreen({
  kind,
  sellerType = 'FARMER',
  companyType: companyTypeProp,
  onBack,
}: {
  kind?: PartnerKind;
  sellerType?: SellerType;
  /**
   * Which kind of buyer, chosen on the step before this one.
   *
   * Passed down for the same reason `sellerType` is: the form should not ask
   * again for something already answered, and a default of PROCESSOR filed
   * every buyer who did not notice the chip row as a processor.
   */
  companyType?: BuyerOnboardingInput['companyType'];
  /**
   * Where the arrow goes, when there is somewhere to go.
   *
   * Omitted when this screen IS the wall: an account with a partner role and no
   * profile has nothing behind it to return to, and an arrow that popped to
   * nothing would be worse than none. Supplied when JoinScreen pushed it, where
   * the shopper picked a kind and may want to pick another.
   */
  onBack?: () => void;
} = {}) {
  const insets = useSafeAreaInsets();
  const { user, refreshUser, signOut } = useAuth();
  const country = user?.country || 'India';
  // A reviewer who asked for more, or said no, sends the applicant back here.
  // The form is identical; only the framing changes.
  const resubmitting = partnerApplication(user) !== null;

  // WHICH FORM TO SHOW, in order: what they picked, then the role they already
  // hold, then the seller form.
  //
  // It used to read user.role alone, which is the mistake CLAUDE.md section 4
  // records the web fixing: a CONSUMER is precisely somebody with NO partner
  // role yet, so `role === 'FARMER'` was false for every first-time applicant
  // and every one of them was handed the buyer form, whichever card they
  // tapped. The role you are applying for cannot also be the thing that selects
  // the form.
  //
  // A resubmitting farmer is still a FARMER, so the role check keeps their own
  // form in front of them without needing the caller to remember.
  const isFarmer = kind ? kind === 'FARMER' : user?.role === 'FARMER';
  // The word comes from what they are APPLYING FOR, not from the profile they
  // already have. A first-time applicant has no sellerType on file at all, so
  // reading the profile made a kirana store's application say "Tell us about
  // your farm" over a form asking for a shop licence. Same mistake as picking
  // the form from user.role, one field along.
  const { place } = wordsFor(sellerType);

  // Farmer fields
  const [farmSize, setFarmSize] = useState('');
  const [state, setState] = useState('');
  const [crops, setCrops] = useState<string[]>([]);
  const [organic, setOrganic] = useState(false);
  const [fpoName, setFpoName] = useState('');
  const [apmcLicense, setApmcLicense] = useState('');

  // Shop and wholesaler fields. The server requires a different set for each
  // (auth.service `validateSellerApplication`), and the app used to send the
  // farmer shape whoever was applying, so every shop was filed as a farm.
  const [businessName, setBusinessName] = useState('');
  const [shopType, setShopType] = useState('VEGETABLE');
  const [address, setAddress] = useState('');
  const [fssai, setFssai] = useState('');
  const [gstin, setGstin] = useState('');

  const isShop = isFarmer && sellerType === 'LOCAL_SHOP';
  const isWholesaler = isFarmer && sellerType === 'WHOLESALER';
  const isGrower = isFarmer && sellerType === 'FARMER';

  // Buyer fields
  const [companyName, setCompanyName] = useState('');
  const [companyType] = useState<BuyerOnboardingInput['companyType']>(companyTypeProp ?? 'RESTAURANT');
  const [taxId, setTaxId] = useState('');
  const [volume, setVolume] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleCrop(crop: string) {
    setCrops((prev) => (prev.includes(crop) ? prev.filter((c) => c !== crop) : [...prev, crop]));
  }

  function validate(): string | null {
    if (isFarmer) {
      if (!state.trim()) return 'Enter your state / region';
      if (isGrower) {
        const size = parseFloat(farmSize);
        if (!Number.isFinite(size) || size <= 0) return 'Enter a valid farm size';
        if (crops.length === 0) return 'Pick at least one crop';
      } else {
        if (!businessName.trim()) {
          return isShop ? 'Enter your shop name' : 'Enter your firm name';
        }
        if (isShop) {
          if (!address.trim()) return 'Enter your shop address';
          // Food on a consumer shelf needs a licence behind it. The server
          // refuses without one; asking here saves the round trip.
          if (!fssai.trim()) return 'Enter your FSSAI licence number';
        }
        if (isWholesaler && !gstin.trim()) return 'Enter your GSTIN';
      }
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
          // THE KIND, sent explicitly. Without it the column defaults to
          // FARMER and every shop that ever applied through the app was filed
          // as a farm.
          sellerType,
          state: state.trim(),
          organicCertified: organic,
          ...(isGrower
            ? {
                farmSizeAcres: parseFloat(farmSize),
                cropsGrown: crops,
                fpoName: fpoName.trim() || undefined,
                apmcLicense: apmcLicense.trim() || undefined,
              }
            : {
                businessName: businessName.trim(),
                ...(isShop
                  ? { shopType, address: address.trim(), fssaiLicense: fssai.trim() }
                  : { gstin: gstin.trim() }),
              }),
        });
      } else {
        await buyerOnboarding({
          companyName: companyName.trim(),
          companyType,
          taxId: taxId.trim() || undefined,
          annualProcurementVolume: volume.trim() || undefined,
        });
      }
      // Swaps the navigator to the status screen — the application now exists,
      // and it is not approved yet.
      await refreshUser();
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
          <View style={styles.headerLeft}>
            {onBack ? (
              <Pressable
                onPress={onBack}
                hitSlop={12}
                style={styles.backBtn}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <IconArrowLeft size={19} stroke={colors.forest} />
              </Pressable>
            ) : null}
            <Text style={styles.eyebrow}>
              {resubmitting ? 'Update your application' : 'Partner application'}
            </Text>
          </View>
          <Pressable onPress={signOut} hitSlop={8}>
            <Text style={styles.logout}>Log out</Text>
          </Pressable>
        </View>
        <Text style={styles.title}>
          {isFarmer ? `Tell us about your ${place}` : 'Tell us about your company'}
        </Text>
        <Text style={styles.sub}>
          {isFarmer
            ? 'Our team reviews every seller by hand, usually within 24 to 48 hours. These details are what they read — and what your agent later uses to match buyers and price your listings.'
            : 'Our team reviews every buyer by hand, usually within 24 to 48 hours. These details are what they read — and what your agent later uses to find growers and anchor your bids.'}
        </Text>

        <View style={styles.card}>
          {isFarmer ? (
            <>
              {/* Shared by all three: a reviewer needs to know where you are. */}
              <Text style={styles.label}>State / region</Text>
              <TextInput
                style={styles.input}
                value={state}
                onChangeText={setState}
                placeholder="e.g., Maharashtra"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
              />

              {!isGrower ? (
                <>
                  <Text style={styles.label}>{isShop ? 'Shop name' : 'Firm name'}</Text>
                  <TextInput
                    style={styles.input}
                    value={businessName}
                    onChangeText={setBusinessName}
                    placeholder={isShop ? 'e.g., Ramji Sabji Bhandar' : 'e.g., Patil Trading Co.'}
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="words"
                  />
                </>
              ) : null}

              {isShop ? (
                <>
                  <Text style={styles.label}>What kind of shop</Text>
                  <View style={styles.chips}>
                    {SHOP_TYPES.map(([value, label]) => {
                      const sel = shopType === value;
                      return (
                        <Pressable key={value} onPress={() => setShopType(value)} style={[styles.chip, sel && styles.chipActive]}>
                          <Text style={[styles.chipText, sel && styles.chipTextActive]}>
                            {sel ? '✓ ' : ''}{label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={styles.label}>Shop address</Text>
                  <TextInput
                    style={styles.input}
                    value={address}
                    onChangeText={setAddress}
                    placeholder="Street, area, landmark"
                    placeholderTextColor={colors.textMuted}
                  />

                  {/* Not optional, and the copy says why. Food on a consumer
                      shelf needs a licence behind it, and the server refuses
                      the application without one. */}
                  <Text style={styles.label}>FSSAI licence number</Text>
                  <TextInput
                    style={styles.input}
                    value={fssai}
                    onChangeText={setFssai}
                    placeholder="14 digits, from your licence"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                  />
                  <Text style={styles.hint}>
                    Required for anyone selling food to households. We check it before you go live.
                  </Text>
                </>
              ) : null}

              {isWholesaler ? (
                <>
                  <Text style={styles.label}>GSTIN</Text>
                  <TextInput
                    style={styles.input}
                    value={gstin}
                    onChangeText={setGstin}
                    placeholder="15-character GST number"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="characters"
                  />
                </>
              ) : null}

              {isGrower ? (
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

              {/* No company-type picker here: it is the step before this one,
                  the same way a seller picks their kind first. Asking twice
                  invites the two answers to disagree. */}

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
          {/* Not "Activate account": nothing activates here. What this button
              does is file an application that a person then reads. */}
          <Button
            label={resubmitting ? 'Resubmit application' : 'Submit application'}
            onPress={onSubmit}
            loading={submitting}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surfaceAlt },
  container: { padding: spacing.xl, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  backBtn: { marginLeft: -4 },
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
  hint: { fontSize: 12.5, lineHeight: 18, color: colors.textMuted, marginTop: -4, marginBottom: 4 },
  spacer: { height: spacing.xs },
});
