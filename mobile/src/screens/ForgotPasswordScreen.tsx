// =============================================================================
// ForgotPasswordScreen — the way back in
// =============================================================================
// Sign-in is by phone or email, but the reset is by EMAIL only: the reset link
// is emailed, and the server has no SMS lane for it. So this screen asks for
// the address the account was made with, not the number it signs in with.
//
// The endpoint is deliberately enumeration-safe — it answers identically
// whether or not an account exists — so this screen is too. There is no "no
// such account" state, on purpose; telling a stranger which emails are
// registered is exactly what the API refuses to do.
//
// The emailed link opens the web reset page. Finishing the reset in the app
// would mean handling a deep link and a second token screen for a journey
// somebody takes once; the link works fine in the phone's browser, and the app
// signs in with the new password afterwards.
// =============================================================================

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
import { useNavigation } from '@react-navigation/native';
import { forgotPassword } from '../api/endpoints';
import { errorMessage } from '../api/client';
import { Button } from '../components/ui';
import { colors, radius, spacing } from '../theme';

export default function ForgotPasswordScreen() {
  const navigation = useNavigation<any>();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function onSubmit() {
    if (!emailValid) {
      setError('Enter the email address on your account');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (e) {
      setError(errorMessage(e, 'Something went wrong — please try again'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>CropBid</Text>
        <Text style={styles.tagline}>
          {sent ? 'Check your inbox' : 'Reset your password'}
        </Text>

        <View style={styles.form}>
          {sent ? (
            <>
              <Text style={styles.body}>
                If an account exists for <Text style={styles.strong}>{email.trim()}</Text>, we have
                emailed a link to choose a new password. It expires in an hour.
              </Text>
              <Text style={styles.small}>
                Nothing arriving? Check your spam folder, or try again with the email you signed up
                with.
              </Text>
              <View style={styles.spacer} />
              <Button label="Back to log in" onPress={() => navigation.goBack()} />
            </>
          ) : (
            <>
              <Text style={styles.body}>
                Enter your account email and we will send you a single-use reset link.
              </Text>

              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={(t) => { setError(null); setEmail(t); }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                onSubmitEditing={onSubmit}
                returnKeyType="send"
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <View style={styles.spacer} />
              <Button label="Send reset link" onPress={onSubmit} loading={submitting} />
            </>
          )}
        </View>

        {!sent ? (
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Text style={styles.switch}>
              Remembered it? <Text style={styles.switchLink}>Log in</Text>
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surfaceAlt },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  brand: { fontSize: 40, fontWeight: '800', color: colors.forest, textAlign: 'center' },
  tagline: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.xxl,
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.xl,
  },
  body: { fontSize: 15, lineHeight: 22, color: colors.textSecondary, marginBottom: spacing.lg },
  strong: { fontWeight: '700', color: colors.text },
  small: { fontSize: 13, lineHeight: 19, color: colors.textMuted },
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
    marginBottom: spacing.md,
  },
  error: { color: colors.error, fontSize: 14, marginBottom: spacing.sm },
  spacer: { height: spacing.xs },
  switch: { textAlign: 'center', marginTop: spacing.xl, color: colors.textSecondary, fontSize: 14 },
  switchLink: { color: colors.ember, fontWeight: '600' },
});
