// Every account needs a mobile number (decided 2026-11-03), and email is the
// optional one. Sign-up asks for it now, but accounts made before, with an
// email alone, have none. RootNavigator shows this screen instead of the app
// to any signed-in account with no number, the same way it shows the
// application form to a seller who has not written one. The website does the
// same with components/auth/PhoneRequired.
//
// No way past it but saving a number or signing out. The number is not
// verified, the same as sign-up's (CLAUDE.md section 4).

import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { addPhone } from '../api/endpoints';
import { errorMessage } from '../api/client';
import { Button } from '../components/ui';
import { colors, radius, spacing } from '../theme';
import { isIndianMobile } from './SignupScreen';

export default function PhoneRequiredScreen() {
  const { user, applyUser, signOut } = useAuth();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The account this screen is for, and whether it is still on screen. Sign
  // out while a save is in flight unmounts it, and a late answer must then be
  // dropped: applying it would put the signed-out account back on screen with
  // no tokens behind it, or over whoever signed in next.
  const forId = useRef(user?.id);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function onSave() {
    if (!isIndianMobile(phone)) {
      setError('Enter a 10-digit mobile number');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      // The server's copy, which carries the real role even in buying mode,
      // so the account is not stored as a BUYER by mistake.
      const saved = await addPhone(phone.trim());
      if (!mounted.current || saved.id !== forId.current) return;
      applyUser(saved);
    } catch (e) {
      if (!mounted.current) return;
      setError(errorMessage(e, 'Could not save that number. Try again.'));
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>CropBid</Text>
        <View style={styles.card}>
          <Text style={styles.title}>Add your mobile number</Text>
          <Text style={styles.body}>
            Every CropBid account needs one. We use it to reach you about your orders, it is how
            support finds your account if you call, and you can sign in with it.
          </Text>

          <Text style={styles.label}>Mobile number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={(v) => { setPhone(v); setError(null); }}
            keyboardType="phone-pad"
            autoComplete="tel"
            placeholder="98765 43210"
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={onSave}
            returnKeyType="done"
            autoFocus
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button label="Save and continue" onPress={onSave} loading={saving} disabled={!phone.trim()} />
        </View>

        <Pressable onPress={() => { void signOut(); }} hitSlop={8}>
          <Text style={styles.switch}>
            Signed in as {user?.email || user?.name}. <Text style={styles.switchLink}>Sign out</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surfaceAlt },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  brand: { fontSize: 36, fontWeight: '800', color: colors.forest, textAlign: 'center', marginBottom: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.xl,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.lg },
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
  switch: { textAlign: 'center', marginTop: spacing.xl, color: colors.textSecondary, fontSize: 14 },
  switchLink: { color: colors.ember, fontWeight: '600' },
});
