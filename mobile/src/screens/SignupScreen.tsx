// Signup screen — create a farmer or buyer account. Mirrors the web SignupPage:
// role, name, country (which fixes the account currency), phone (the primary
// contact and login identifier — required), email (required for buyers,
// optional for farmers and consumers), and a password with
// live-validated rules. On success AuthContext.signUp() sets the user; the root
// navigator then routes to onboarding (no profile yet).

import React, { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { Button } from '../components/ui';
import { colors, radius, spacing } from '../theme';
import type { AuthStackParamList } from '../navigation/types';
import type { SignupInput } from '../api/endpoints';

type Currency = NonNullable<SignupInput['currency']>;
type Role = SignupInput['role'];

// Same country → currency mapping as the web client (client SignupPage COUNTRIES).
const COUNTRIES: { code: string; label: string; currency: Currency; phone: string }[] = [
  { code: 'India', label: 'India', currency: 'INR', phone: '+91-9876543210' },
  { code: 'United States', label: 'United States', currency: 'USD', phone: '+1-555-0123' },
  { code: 'United Kingdom', label: 'United Kingdom', currency: 'GBP', phone: '+44-7911-123456' },
  { code: 'Germany', label: 'Germany', currency: 'EUR', phone: '+49-151-12345678' },
  { code: 'France', label: 'France', currency: 'EUR', phone: '+33-6-12-34-56-78' },
  { code: 'Netherlands', label: 'Netherlands', currency: 'EUR', phone: '+31-6-12345678' },
  { code: 'Brazil', label: 'Brazil', currency: 'USD', phone: '+55-11-91234-5678' },
  { code: 'Kenya', label: 'Kenya', currency: 'USD', phone: '+254-712-345678' },
  { code: 'Nigeria', label: 'Nigeria', currency: 'USD', phone: '+234-801-234-5678' },
  { code: 'Australia', label: 'Australia', currency: 'USD', phone: '+61-412-345-678' },
  { code: 'UAE', label: 'United Arab Emirates', currency: 'USD', phone: '+971-50-123-4567' },
  { code: 'Thailand', label: 'Thailand', currency: 'USD', phone: '+66-81-234-5678' },
  { code: 'Vietnam', label: 'Vietnam', currency: 'USD', phone: '+84-91-234-56-78' },
  { code: 'Indonesia', label: 'Indonesia', currency: 'USD', phone: '+62-812-3456-7890' },
  { code: 'Ethiopia', label: 'Ethiopia', currency: 'USD', phone: '+251-91-123-4567' },
];

function Rule({ met, label }: { met: boolean; label: string }) {
  return (
    <View style={styles.ruleRow}>
      <Text style={[styles.ruleMark, met && styles.ruleMarkOk]}>{met ? '✓' : '○'}</Text>
      <Text style={[styles.ruleText, met && styles.ruleTextOk]}>{label}</Text>
    </View>
  );
}

export default function SignupScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { signUp } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('FARMER');
  const [country, setCountry] = useState('India');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [countryOpen, setCountryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedCountry = COUNTRIES.find((c) => c.code === country) ?? COUNTRIES[0];

  const rules = useMemo(
    () => ({
      length: password.length >= 8,
      upper: /[A-Z]/.test(password),
      lower: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
    }),
    [password],
  );
  const passwordValid = rules.length && rules.upper && rules.lower && rules.number;
  // Phone is the required primary contact; email is optional but must be valid
  // when provided. Digits are counted on the separator-stripped value (mirrors
  // the server): "+      " looks long enough but carries no number.
  const phoneValid =
    /^[+0-9][0-9\s\-()]*$/.test(phone.trim()) &&
    phone.trim().length <= 20 &&
    phone.replace(/[^0-9]/g, '').length >= 7;
  // Buyers must give an email; farmers and consumers may leave it blank, but a
  // filled-in address still has to be well-formed.
  const emailRequired = role === 'BUYER';
  const emailValid =
    email.trim() === ''
      ? !emailRequired
      : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const nameValid = name.trim().length >= 2;
  const formValid = nameValid && phoneValid && emailValid && passwordValid;

  async function onSubmit() {
    if (!formValid) {
      setError(
        !nameValid
          ? 'Name must be at least 2 characters'
          : !phoneValid
            ? 'Enter a valid phone number'
            : !emailValid
              ? emailRequired && email.trim() === ''
                ? 'Email is required for buyer accounts'
                : 'Enter a valid email address'
              : 'Password does not meet the requirements',
      );
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await signUp({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        password,
        role,
        country,
        currency: selectedCountry.currency,
      });
      // Root navigator now routes to onboarding (new account has no profile).
    } catch (e) {
      setError(errorMessage(e, 'Signup failed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>CropBid</Text>
        <Text style={styles.tagline}>Create your account</Text>

        <View style={styles.form}>
          <Text style={styles.label}>I'm a</Text>
          <View style={styles.pillRow}>
            {(['FARMER', 'BUYER', 'CONSUMER'] as const).map((r) => (
              <Pressable
                key={r}
                onPress={() => setRole(r)}
                style={[styles.pill, role === r && styles.pillActive]}
              >
                <Text style={[styles.pillText, role === r && styles.pillTextActive]}>
                  {r === 'FARMER' ? 'Farmer' : r === 'BUYER' ? 'Buyer' : 'Consumer'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter your full name"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Country</Text>
          <Pressable style={styles.select} onPress={() => setCountryOpen(true)}>
            <Text style={styles.selectText}>{selectedCountry.label}</Text>
            <Text style={styles.selectMeta}>{selectedCountry.currency} ›</Text>
          </Pressable>

          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder={selectedCountry.phone}
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>{emailRequired ? 'Email' : 'Email (optional)'}</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="At least 8 characters"
            placeholderTextColor={colors.textMuted}
          />
          {password.length > 0 ? (
            <View style={styles.rules}>
              <Rule met={rules.length} label="8+ characters" />
              <Rule met={rules.upper} label="Uppercase letter" />
              <Rule met={rules.lower} label="Lowercase letter" />
              <Rule met={rules.number} label="Number" />
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.spacer} />
          <Button label="Create account" onPress={onSubmit} loading={submitting} />
        </View>

        <Pressable onPress={() => navigation.navigate('Login')} hitSlop={8}>
          <Text style={styles.switch}>
            Already on CropBid? <Text style={styles.switchLink}>Sign in</Text>
          </Text>
        </Pressable>
      </ScrollView>

      {/* Country picker */}
      <Modal visible={countryOpen} animationType="slide" transparent onRequestClose={() => setCountryOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setCountryOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Select country</Text>
            <FlatList
              data={COUNTRIES}
              keyExtractor={(c) => c.code}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.sheetRow}
                  onPress={() => {
                    setCountry(item.code);
                    setCountryOpen(false);
                  }}
                >
                  <Text style={styles.sheetRowText}>{item.label}</Text>
                  <Text style={[styles.sheetRowMeta, item.code === country && styles.sheetRowMetaActive]}>
                    {item.currency}
                  </Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surfaceAlt },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  brand: { fontSize: 36, fontWeight: '800', color: colors.forest, textAlign: 'center' },
  tagline: { fontSize: 15, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.xl },
  form: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.xl,
  },
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
  pillRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  pill: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  pillActive: { borderColor: colors.forest, backgroundColor: colors.forest },
  pillText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  pillTextActive: { color: colors.textInverse },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.lg,
  },
  selectText: { fontSize: 16, color: colors.text },
  selectMeta: { fontSize: 14, color: colors.textMuted, fontWeight: '600' },
  rules: { flexDirection: 'row', flexWrap: 'wrap', marginTop: -spacing.sm, marginBottom: spacing.md },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, width: '50%', paddingVertical: 3 },
  ruleMark: { fontSize: 12, color: colors.textMuted },
  ruleMarkOk: { color: colors.sage },
  ruleText: { fontSize: 12, color: colors.textMuted },
  ruleTextOk: { color: colors.sage },
  error: { color: colors.error, fontSize: 14, marginBottom: spacing.sm },
  spacer: { height: spacing.xs },
  switch: { textAlign: 'center', marginTop: spacing.xl, color: colors.textSecondary, fontSize: 14 },
  switchLink: { color: colors.ember, fontWeight: '600' },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(20,20,15,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    maxHeight: '70%',
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: colors.text, paddingHorizontal: spacing.xl, marginBottom: spacing.sm },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  sheetRowText: { fontSize: 16, color: colors.text },
  sheetRowMeta: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  sheetRowMetaActive: { color: colors.forest },
});
