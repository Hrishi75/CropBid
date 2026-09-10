// =============================================================================
// NotHereYet — the screen for somebody we cannot reach
// =============================================================================
// A shopper who opens Daily outside the delivery area is the most useful signal
// the product gets: they wanted to buy and could not. An apologetic empty
// screen throws that away, so this asks to keep in touch and records where they
// were, which is the only real map of where to open next.
//
// IT IS NOT A DEAD END AND DOES NOT READ LIKE ONE. "We are coming to your area"
// is a promise nobody can date, so the copy says what is true: not here yet,
// tell us and we will come to you sooner. The nearest city is offered as a real
// alternative, because someone in Mumbai reading about Pune should at least be
// able to look.
//
// The phone number is OPTIONAL and asked for last. It is a second decision at a
// moment the shopper is already disappointed, and the row is worth having
// without it: the coordinates alone still count toward where to expand.
// =============================================================================

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { requestCoverage } from '../api/endpoints';
import { errorMessage } from '../api/client';
import type { Serviceability } from '../api/endpoints';
import type { Position } from '../lib/position';
import { Mono } from './ui';
import { IconPin } from './icons';
import { colors, design, font, radius, shadow, spacing } from '../theme';

export function NotHereYet({
  position,
  result,
  onBrowseAnyway,
}: {
  position: Position;
  result: Serviceability;
  onBrowseAnyway: () => void;
}) {
  const [phone, setPhone] = useState('');
  const [area, setArea] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestCoverage({
        latitude: position.latitude,
        longitude: position.longitude,
        areaLabel: area.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      setSent(true);
    } catch (e) {
      setError(errorMessage(e, 'Could not send that just now.'));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <View style={styles.wrap}>
        <View style={[styles.icon, { backgroundColor: design.mint }]}>
          <IconPin size={24} color={colors.sage} />
        </View>
        <Text style={styles.title}>Noted, thank you</Text>
        <Text style={styles.copy}>
          {phone.trim()
            ? "We've marked your area. You'll get a message on this number the day we start delivering there."
            : "We've marked your area. Every request moves it up the list."}
        </Text>
        <Pressable onPress={onBrowseAnyway} style={({ pressed }) => [styles.ghost, pressed && { opacity: 0.7 }]}>
          <Text style={styles.ghostText}>
            {result.nearestCity ? `Look around ${result.nearestCity} anyway` : 'Have a look around anyway'}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.icon}>
        <IconPin size={24} color={colors.ember} />
      </View>

      <Text style={styles.title}>We're not in your area yet</Text>
      <Text style={styles.copy}>
        {result.nearestCity && result.nearestKm != null
          ? `The closest we deliver is ${result.nearestCity}, about ${Math.round(result.nearestKm)} km away. Tell us where you are and we'll get there sooner.`
          : "Tell us where you are and we'll get there sooner."}
      </Text>

      <TextInput
        value={area}
        onChangeText={setArea}
        placeholder="Your area, e.g. Hingna"
        placeholderTextColor={design.ink3}
        style={styles.input}
      />
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="Phone (optional, to be told first)"
        placeholderTextColor={design.ink3}
        keyboardType="phone-pad"
        style={styles.input}
      />

      <Pressable
        onPress={send}
        disabled={busy}
        style={({ pressed }) => [styles.btn, busy && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.btnText}>{busy ? 'Sending…' : 'Tell us to come here'}</Text>
      </Pressable>

      {error ? <Text style={styles.err}>{error}</Text> : null}

      <Pressable onPress={onBrowseAnyway} style={({ pressed }) => [styles.ghost, pressed && { opacity: 0.7 }]}>
        <Text style={styles.ghostText}>
          {result.nearestCity ? `Look around ${result.nearestCity} anyway` : 'Have a look around anyway'}
        </Text>
      </Pressable>

      <Mono style={styles.foot}>We keep the spot, not a trail. Nothing is tracked.</Mono>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  icon: {
    width: 52, height: 52, borderRadius: radius.pill,
    backgroundColor: '#f6e4d9',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: { fontFamily: font.sansBold, fontSize: 26, color: design.ink, letterSpacing: -0.5 },
  copy: { fontFamily: font.sans, fontSize: 15, lineHeight: 23, color: design.ink2, marginTop: spacing.sm },
  input: {
    backgroundColor: design.paper,
    borderWidth: 1, borderColor: design.line, borderRadius: radius.md,
    paddingHorizontal: spacing.md, height: 48,
    fontFamily: font.sans, fontSize: 15, color: design.ink,
    marginTop: spacing.md,
    outlineStyle: 'none',
  } as object,
  btn: {
    backgroundColor: colors.forest, borderRadius: radius.md,
    paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.lg,
    ...shadow.card,
  },
  btnText: { fontFamily: font.sansSemi, fontSize: 16, color: colors.surface },
  err: { fontFamily: font.sansMed, fontSize: 13, color: colors.ember, marginTop: spacing.md },
  ghost: { paddingVertical: spacing.md, marginTop: spacing.sm, alignItems: 'center' },
  ghostText: { fontFamily: font.sansMed, fontSize: 14, color: colors.forest, textDecorationLine: 'underline' },
  foot: { fontSize: 9, letterSpacing: 0.4, color: design.ink3, textAlign: 'center', marginTop: spacing.md },
});
