// Profile tab — shows the signed-in user's identity/role summary and sign-out.
// Farmers also see their farm details and an "Edit profile" entry point.

import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { Button, Card } from '../components/ui';
import { colors, radius, spacing } from '../theme';
import type { FarmerStackParamList } from '../navigation/types';

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<FarmerStackParamList>>();
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  if (!user) return null;

  const isFarmer = user.role === 'FARMER';
  const profile = user.farmerProfile;

  const subtitle = isFarmer
    ? profile?.state ?? 'Farmer'
    : user.buyerProfile?.companyName ?? 'Buyer';

  async function onSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{user.name[0]?.toUpperCase()}</Text>
      </View>
      <Text style={styles.name}>{user.name}</Text>
      <Text style={styles.subtitle}>
        {user.role} · {subtitle}
      </Text>

      <Card style={styles.card}>
        <Field label="Email" value={user.email} />
        <Field label="Phone" value={user.phone ?? '—'} />
        {isFarmer ? <Field label="Village / town" value={user.location ?? '—'} /> : null}
        <Field label="Country" value={user.country} />
        <Field label="Trust score" value={String(user.trustScore)} />
      </Card>

      {isFarmer ? (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Farm details</Text>
          <Field
            label="Farm size"
            value={profile?.farmSizeAcres != null ? `${profile.farmSizeAcres} acres` : '—'}
          />
          <Field label="State / region" value={profile?.state ?? '—'} />
          <Field
            label="Crops grown"
            value={profile?.cropsGrown?.length ? profile.cropsGrown.join(', ') : '—'}
          />
          <Field
            label="Organic certified"
            value={profile?.organicCertified ? 'Yes' : 'No'}
          />
        </Card>
      ) : null}

      {isFarmer ? (
        <Button label="Edit profile" onPress={() => navigation.navigate('EditProfile')} />
      ) : null}

      <Button label="Log out" variant="outline" onPress={onSignOut} loading={signingOut} />
    </ScrollView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, alignItems: 'center', gap: spacing.md, backgroundColor: colors.surfaceAlt, flexGrow: 1 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 34, fontWeight: '800', color: colors.textInverse },
  name: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.md },
  card: { width: '100%', gap: spacing.sm, marginBottom: spacing.lg },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between' },
  fieldLabel: { color: colors.textMuted, fontSize: 14 },
  fieldValue: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
