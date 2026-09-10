// =============================================================================
// ProfileScreen — the account, and the two settings that actually matter
// =============================================================================
// Name and delivery city, and nothing else. A settings screen full of toggles
// that do nothing is worse than a short one: every row here changes something
// real on the server.
//
// CHANGING CITY EMPTIES THE BASKET OF OTHER CITIES' PRODUCE, and says so before
// it does. A 2 kg order cannot be trucked across a state, so rows from the old
// city could never be delivered. Dropping them at the moment of the change is
// kinder than letting the shopper discover it at the last gate.
//
// Signed out, this screen IS the sign-in screen rather than a wall in front of
// it: one fewer tap, and nothing here is worth guarding behind a teaser.
// =============================================================================

import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { retailCities } from '../api/endpoints';
import { errorMessage } from '../api/client';
import type { RetailCity } from '../api/types';
import { saveCity } from '../lib/city';
import SignInScreen from './SignInScreen';
import { Mono, SectionLabel } from '../components/ui';
import { IconChevronRight, IconDoc, IconPin } from '../components/icons';
import { colors, design, font, radius, shadow, spacing } from '../theme';

export default function ProfileScreen({
  navigation,
}: {
  navigation: { navigate: (screen: 'Orders') => void };
}) {
  const insets = useSafeAreaInsets();
  const { user, signedIn, signOut, updateProfile } = useAuth();
  const { items, keepOnlyCity } = useCart();

  const [name, setName] = useState(user?.name ?? '');
  const [cities, setCities] = useState<RetailCity[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setName(user?.name ?? ''); }, [user?.name]);
  useEffect(() => { retailCities().then(setCities).catch(() => setCities([])); }, []);

  if (!signedIn || !user) return <SignInScreen />;

  const nameChanged = name.trim().length >= 2 && name.trim() !== user.name;

  async function saveName() {
    if (!nameChanged || busy) return;
    setBusy(true);
    try {
      await updateProfile({ name: name.trim() });
    } catch (e) {
      Alert.alert('Could not save', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function pickCity(next: string) {
    if (next === user!.location) return;

    const strandedCount = items.filter(
      (i) => i.city.trim().toLowerCase() !== next.trim().toLowerCase(),
    ).length;

    const apply = async () => {
      setBusy(true);
      try {
        await updateProfile({ location: next });
        await saveCity(next);
        keepOnlyCity(next);
      } catch (e) {
        Alert.alert('Could not change city', errorMessage(e));
      } finally {
        setBusy(false);
      }
    };

    // Warned BEFORE the change, not after. Silently emptying someone's basket
    // is the kind of thing that reads as the app losing their work.
    if (strandedCount > 0) {
      Alert.alert(
        `Change city to ${next}?`,
        `${strandedCount} ${strandedCount === 1 ? 'item' : 'items'} in your basket ${strandedCount === 1 ? 'is' : 'are'} from another city and cannot be delivered to ${next}. ${strandedCount === 1 ? 'It' : 'They'} will be removed.`,
        [{ text: 'Keep current city', style: 'cancel' }, { text: 'Change', onPress: apply }],
      );
      return;
    }
    void apply();
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.pad, { paddingTop: insets.top + spacing.xl, paddingBottom: spacing.xxl }]}
    >
      <Text style={styles.title}>You</Text>

      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarLetter}>{user.name.trim().charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.identityName} numberOfLines={1}>{user.name}</Text>
          <Mono style={styles.identityPhone}>{user.phone ?? user.email ?? ''}</Mono>
        </View>
      </View>

      <Pressable
        onPress={() => navigation.navigate('Orders')}
        style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.75 }]}
      >
        <View style={styles.linkIcon}>
          <IconDoc size={17} color={colors.forest} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.linkTitle}>Your orders</Text>
          <Mono style={styles.linkSub}>What you have bought, newest first</Mono>
        </View>
        <IconChevronRight size={17} color={design.ink3} />
      </Pressable>

      <SectionLabel>YOUR NAME</SectionLabel>
      <View style={styles.nameRow}>
        <TextInput value={name} onChangeText={setName} style={[styles.input, { flex: 1 }]} />
        <Pressable
          onPress={saveName}
          disabled={!nameChanged || busy}
          style={({ pressed }) => [styles.save, (!nameChanged || busy) && styles.saveOff, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.saveText}>Save</Text>
        </Pressable>
      </View>

      <View style={{ marginTop: spacing.xl }}>
        <SectionLabel>DELIVERY CITY</SectionLabel>
      </View>
      <View style={styles.cityWrap}>
        {cities.map((c) => {
          const on = c.city === user.location;
          return (
            <Pressable
              key={c.city}
              onPress={() => pickCity(c.city)}
              style={({ pressed }) => [styles.cityRow, on && styles.cityRowOn, pressed && { opacity: 0.8 }]}
            >
              <IconPin size={16} color={on ? colors.surface : design.ink3} />
              <Text style={[styles.cityName, on && { color: colors.surface }]}>{c.city}</Text>
              <Mono style={[styles.cityState, on && { color: colors.sage2 }]}>{c.state}</Mono>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() =>
          Alert.alert('Sign out?', 'Your basket stays saved and will be here next time.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
          ])
        }
        style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>

      <Mono style={styles.footer}>CropBid Daily · Pune and Nagpur</Mono>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: design.bg },
  pad: { paddingHorizontal: spacing.lg },
  title: { fontFamily: font.sansBold, fontSize: 28, color: design.ink, marginBottom: spacing.lg },

  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: design.paper,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.xl,
    ...shadow.card,
  },
  avatar: {
    width: 48, height: 48, borderRadius: radius.pill,
    backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { fontFamily: font.sansBold, fontSize: 20, color: colors.surface },
  identityName: { fontFamily: font.sansSemi, fontSize: 17, color: design.ink },
  identityPhone: { fontSize: 11, color: design.ink3, marginTop: 2 },

  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: design.paper,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.xl,
    ...shadow.card,
  },
  linkIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: design.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkTitle: { fontFamily: font.sansSemi, fontSize: 15, color: design.ink },
  linkSub: { fontSize: 10, color: design.ink3, marginTop: 2 },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    backgroundColor: design.paper,
    borderWidth: 1, borderColor: design.line, borderRadius: radius.md,
    paddingHorizontal: spacing.md, height: 46,
    fontFamily: font.sans, fontSize: 15, color: design.ink,
    marginTop: spacing.sm,
    outlineStyle: 'none',
  } as object,
  save: {
    marginTop: spacing.sm, backgroundColor: colors.forest, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, height: 46, alignItems: 'center', justifyContent: 'center',
  },
  saveOff: { opacity: 0.35 },
  saveText: { fontFamily: font.sansSemi, fontSize: 14, color: colors.surface },

  cityWrap: { gap: spacing.sm, marginTop: spacing.sm },
  cityRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: design.paper, borderWidth: 1, borderColor: design.line,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  cityRowOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  cityName: { fontFamily: font.sansSemi, fontSize: 15, color: design.ink },
  cityState: { fontSize: 10, color: design.ink3, marginLeft: 'auto' },

  signOut: {
    marginTop: spacing.xxl, borderWidth: 1, borderColor: design.line,
    borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center',
  },
  signOutText: { fontFamily: font.sansMed, fontSize: 15, color: colors.ember },
  footer: { fontSize: 9, letterSpacing: 0.5, color: design.ink3, textAlign: 'center', marginTop: spacing.xl },
});
