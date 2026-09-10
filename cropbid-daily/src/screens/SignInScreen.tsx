// =============================================================================
// SignInScreen — phone, then a six-digit code
// =============================================================================
// Two steps, one field each. No password: a household buying vegetables should
// not be asked to invent one, and every extra field is a shopper who does not
// finish. The API still supports passwords; Daily simply does not offer them.
//
// A NEW NUMBER CREATES A SHOPPER. The name field appears only when the server
// says isNewAccount, so a returning shopper types six digits and is in.
// intendedRole is pinned to CONSUMER in the endpoint: selling is applied for
// from the business app, and an account minted here must never arrive a partner.
//
// LOCALLY THERE IS NO SMS OR WHATSAPP CONFIGURED, so the code is printed to the
// API log. That is expected in dev, not a failure.
// =============================================================================

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { startPhoneSignIn, verifyPhoneSignIn } from '../api/endpoints';
import { errorMessage } from '../api/client';
import type { PhoneChallenge } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { Mono } from '../components/ui';
import { colors, design, font, radius, spacing } from '../theme';

export default function SignInScreen({ onDone }: { onDone?: () => void }) {
  const insets = useSafeAreaInsets();
  const { setUser } = useAuth();

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [challenge, setChallenge] = useState<PhoneChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneValid = phone.replace(/[^0-9]/g, '').length >= 10;
  const codeValid = code.replace(/\s/g, '').length === 6;
  const nameNeeded = challenge?.isNewAccount === true;
  const nameValid = !nameNeeded || name.trim().length >= 2;

  async function sendCode() {
    if (!phoneValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      setChallenge(await startPhoneSignIn(phone.trim()));
    } catch (e) {
      setError(errorMessage(e, 'Could not send a code to that number.'));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!challenge || !codeValid || !nameValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      setUser(await verifyPhoneSignIn(challenge.challengeId, code, nameNeeded ? name.trim() : undefined));
      onDone?.();
    } catch (e) {
      setError(errorMessage(e, 'That code did not work.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.xxl }]}>
      <Text style={styles.wordmark}>
        CropBid <Text style={styles.accent}>Daily</Text>
      </Text>

      {challenge === null ? (
        <>
          <Text style={styles.title}>What's your number?</Text>
          <Text style={styles.copy}>We'll send a six-digit code. No password to remember.</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone number"
            placeholderTextColor={design.ink3}
            keyboardType="phone-pad"
            style={styles.input}
            autoFocus
          />
          <Action label="Send code" onPress={sendCode} enabled={phoneValid && !busy} busy={busy} />
        </>
      ) : (
        <>
          <Text style={styles.title}>Enter the code</Text>
          <Text style={styles.copy}>
            Sent to {challenge.sentTo ?? challenge.phone}
            {challenge.channel ? ` by ${challenge.channel.toLowerCase()}` : ''}.
          </Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="6-digit code"
            placeholderTextColor={design.ink3}
            keyboardType="number-pad"
            maxLength={7}
            style={[styles.input, styles.code]}
            autoFocus
          />
          {nameNeeded ? (
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={design.ink3}
              style={styles.input}
            />
          ) : null}
          <Action label="Sign in" onPress={verify} enabled={codeValid && nameValid && !busy} busy={busy} />
          <Pressable onPress={() => { setChallenge(null); setCode(''); }} hitSlop={8}>
            <Mono style={styles.back}>USE A DIFFERENT NUMBER</Mono>
          </Pressable>
        </>
      )}

      {error ? <Text style={styles.err}>{error}</Text> : null}
    </View>
  );
}

function Action({
  label, onPress, enabled, busy,
}: { label: string; onPress: () => void; enabled: boolean; busy: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      style={({ pressed }) => [styles.btn, !enabled && styles.btnOff, pressed && { opacity: 0.85 }]}
    >
      <Text style={styles.btnText}>{busy ? 'Just a moment…' : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: design.bg, paddingHorizontal: spacing.lg },
  wordmark: { fontFamily: font.sansBold, fontSize: 19, color: design.ink, letterSpacing: -0.3 },
  accent: { color: colors.sage },
  title: { fontFamily: font.sansBold, fontSize: 28, color: design.ink, marginTop: spacing.xxl, letterSpacing: -0.5 },
  copy: { fontFamily: font.sans, fontSize: 15, lineHeight: 22, color: design.ink2, marginTop: spacing.sm },
  input: {
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 50,
    fontFamily: font.sans,
    fontSize: 16,
    color: design.ink,
    marginTop: spacing.lg,
    outlineStyle: 'none',
  } as object,
  code: { fontFamily: font.monoSemi, letterSpacing: 6, fontSize: 20 },
  btn: {
    backgroundColor: colors.forest,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  btnOff: { opacity: 0.4 },
  btnText: { fontFamily: font.sansSemi, fontSize: 16, color: colors.surface },
  back: { fontSize: 9, letterSpacing: 0.6, color: design.ink3, marginTop: spacing.lg, textAlign: 'center' },
  err: { fontFamily: font.sansMed, fontSize: 13, color: colors.ember, marginTop: spacing.md },
});
