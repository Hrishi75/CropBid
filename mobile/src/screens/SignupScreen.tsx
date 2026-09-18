// Signup screen — create an account. Four fields, the same as the web's
// create-an-account lane: name, an email OR a phone number (one box, whichever
// they have), a password with live-validated rules, and the password again.
// No code is sent: the account is made on the spot and AuthContext.signUp()
// signs them in, so the root navigator drops them on the storefront. Phone
// verification is to be integrated later (CLAUDE.md section 4).
//
// EVERYONE ARRIVES AS A SHOPPER. There is no role picker, and that is the
// point: this used to open with FARMER/BUYER/CONSUMER pills defaulting to
// FARMER, which minted a partner account at signup and dropped a first-time
// visitor into an application form before they had seen anything the product
// does. Selling and buying in bulk are applied for afterwards, from the Partner
// tab, and approval is what grants the role.
//
// CLAUDE.md section 4 records the web fixing the same thing, and the rule
// behind it: the role you are applying for cannot also be the entry
// requirement. The server already agrees, `/auth/onboarding/{farmer,buyer}`
// accept CONSUMER precisely because that is who applies.
//
// NO COUNTRY PICKER. It offered fifteen countries and three foreign currencies
// to a product that is India only. The server makes every account India and
// rupees when the request names neither.
//
// No role is sent. The server makes every new account a shopper, and it never
// asks one for the old buyer's emailed code, so signUp() always resolves
// 'created' from here.

import React, { useMemo, useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { Button } from '../components/ui';
import { colors, radius, spacing } from '../theme';
import type { AuthStackParamList } from '../navigation/types';

function Rule({ met, label }: { met: boolean; label: string }) {
  return (
    <View style={styles.ruleRow}>
      <Text style={[styles.ruleMark, met && styles.ruleMarkOk]}>{met ? '✓' : '○'}</Text>
      <Text style={[styles.ruleText, met && styles.ruleTextOk]}>{label}</Text>
    </View>
  );
}

/**
 * Read the one "email or phone" box. Anything with an @ is an email address;
 * everything else has to be a phone number, counted on its digits the way the
 * server counts them, so "+  -  " cannot pass as one.
 */
function readContact(raw: string): { email?: string; phone?: string } | null {
  const value = raw.trim();
  if (value.includes('@')) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? { email: value } : null;
  }
  const digits = value.replace(/[^0-9]/g, '');
  return /^[+0-9][0-9\s\-()]*$/.test(value) && digits.length >= 7 && value.length <= 20
    ? { phone: value }
    : null;
}

export default function SignupScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { signUp } = useAuth();

  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Mirrors passwordSchema on the server, which is what actually enforces it.
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
  const mismatch = confirm.length > 0 && confirm !== password;

  async function onSubmit() {
    const parsedContact = readContact(contact);
    const problem =
      name.trim().length < 2 ? 'Name must be at least 2 characters'
        : !parsedContact ? 'Enter a valid email address or phone number'
        : !passwordValid ? 'Password does not meet the requirements'
        : confirm !== password ? 'The two passwords do not match'
        : null;
    if (problem || !parsedContact) {
      setError(problem);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await signUp({ name: name.trim(), ...parsedContact, password });
    } catch (e) {
      setError(errorMessage(e, 'Signup failed'));
    } finally {
      setSubmitting(false);
    }
  }

  // Any edit clears the last complaint, so it never sits under a field that
  // has since been fixed.
  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    setError(null);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>CropBid</Text>
        <Text style={styles.tagline}>Create your account</Text>

        <View style={styles.form}>
          {/* No role picker. Everyone gets a shopper's account, live on the
              spot; growing and bulk buying are applied for from the Partner tab
              afterwards, and said here rather than discovered. */}
          <Text style={styles.roleNote}>
            Your account is ready straight away. Pick your city and the local shelf opens. If you
            also grow, or buy in bulk, apply for that from the Partner tab once you're in.
          </Text>

          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={edit(setName)}
            placeholder="Enter your full name"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
            autoComplete="name"
          />

          <Text style={styles.label}>Email or phone number</Text>
          <TextInput
            style={[styles.input, styles.inputWithHint]}
            value={contact}
            onChangeText={edit(setContact)}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            placeholder="you@example.com or +91-9876543210"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={styles.hint}>Whichever you give is what you sign in with.</Text>

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={edit(setPassword)}
            secureTextEntry
            autoComplete="new-password"
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

          <Text style={styles.label}>Confirm password</Text>
          <TextInput
            style={[styles.input, mismatch && styles.inputWithHint]}
            value={confirm}
            onChangeText={edit(setConfirm)}
            secureTextEntry
            autoComplete="new-password"
            placeholder="Type it again"
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={onSubmit}
            returnKeyType="go"
          />
          {mismatch ? <Text style={styles.hint}>Does not match yet.</Text> : null}

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
  // A line of help under a box sits close to it, then leaves the usual gap.
  inputWithHint: { marginBottom: spacing.xs },
  hint: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.lg },
  rules: { flexDirection: 'row', flexWrap: 'wrap', marginTop: -spacing.sm, marginBottom: spacing.md },
  roleNote: { fontSize: 12.5, lineHeight: 18, color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.md },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, width: '50%', paddingVertical: 3 },
  ruleMark: { fontSize: 12, color: colors.textMuted },
  ruleMarkOk: { color: colors.sage },
  ruleText: { fontSize: 12, color: colors.textMuted },
  ruleTextOk: { color: colors.sage },
  error: { color: colors.error, fontSize: 14, marginBottom: spacing.sm },
  spacer: { height: spacing.xs },
  switch: { textAlign: 'center', marginTop: spacing.xl, color: colors.textSecondary, fontSize: 14 },
  switchLink: { color: colors.ember, fontWeight: '600' },
});
