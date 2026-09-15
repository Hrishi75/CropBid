// Login screen — phone-or-email + password sign-in. Phone is the primary
// identifier; the server matches either column. Calls AuthContext.signIn();
// the root navigator swaps to the app once authenticated.

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
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { Button } from '../components/ui';
import { colors, radius, spacing } from '../theme';
import type { AuthStackParamList } from '../navigation/types';

export default function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    if (!identifier.trim() || !password) {
      setError('Enter your phone number (or email) and password');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await signIn(identifier.trim(), password);
    } catch (e) {
      setError(errorMessage(e, 'Login failed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brand}>CropBid</Text>
        <Text style={styles.tagline}>AI-powered crop trading</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Phone or email</Text>
          <TextInput
            style={styles.input}
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="default"
            placeholder="+91-9876543210"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={onSubmit}
            returnKeyType="go"
          />

          {/* Under the password field, where somebody who has just failed to
              remember it is already looking. It went missing from the web sign-in
              once and cost people their accounts; it is not going missing here. */}
          <Pressable onPress={() => navigation.navigate('ForgotPassword')} hitSlop={8}>
            <Text style={styles.forgot}>Forgot password?</Text>
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.spacer} />
          <Button label="Log in" onPress={onSubmit} loading={submitting} />
        </View>

        <Pressable onPress={() => navigation.navigate('Signup')} hitSlop={8}>
          <Text style={styles.switch}>
            New to CropBid? <Text style={styles.switchLink}>Create account</Text>
          </Text>
        </Pressable>
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
  forgot: {
    alignSelf: 'flex-end',
    color: colors.ember,
    fontSize: 13,
    fontWeight: '600',
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  error: { color: colors.error, fontSize: 14, marginBottom: spacing.sm },
  spacer: { height: spacing.xs },
  switch: { textAlign: 'center', marginTop: spacing.xl, color: colors.textSecondary, fontSize: 14 },
  switchLink: { color: colors.ember, fontWeight: '600' },
});
