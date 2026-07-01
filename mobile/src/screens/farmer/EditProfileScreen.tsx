// Edit profile — lets a farmer update their contact + farm details after
// onboarding. Pre-fills from the signed-in user, PATCHes /auth/me, and swaps the
// returned user straight into AuthContext (no extra /auth/me round-trip).

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
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../api/client';
import { updateFarmerProfile } from '../../api/endpoints';
import { Button } from '../../components/ui';
import { colors, radius, spacing } from '../../theme';
import type { FarmerStackParamList } from '../../navigation/types';

// Compact crop set for the picker (server accepts any string[]). Any crop the
// farmer already grows but that isn't in this list is merged in below so it
// still renders as a selectable chip.
const CROPS = [
  'Rice', 'Wheat', 'Onion', 'Tomato', 'Potato', 'Grape', 'Sugarcane', 'Cotton',
  'Soybean', 'Maize', 'Chili', 'Turmeric', 'Banana', 'Mango', 'Groundnut', 'Coffee',
];

export default function EditProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<FarmerStackParamList>>();
  const { user, applyUser } = useAuth();

  const profile = user?.farmerProfile;

  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [location, setLocation] = useState(user?.location ?? '');
  const [farmSize, setFarmSize] = useState(
    profile?.farmSizeAcres != null ? String(profile.farmSizeAcres) : '',
  );
  const [state, setState] = useState(profile?.state ?? '');
  const [crops, setCrops] = useState<string[]>(profile?.cropsGrown ?? []);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Show the default set plus any already-selected crop that isn't in it.
  const cropOptions = [...CROPS, ...crops.filter((c) => !CROPS.includes(c))];

  function toggleCrop(crop: string) {
    setCrops((prev) => (prev.includes(crop) ? prev.filter((c) => c !== crop) : [...prev, crop]));
  }

  function validate(): string | null {
    if (name.trim().length < 2) return 'Enter your name';
    const size = parseFloat(farmSize);
    if (!Number.isFinite(size) || size <= 0) return 'Enter a valid farm size';
    if (!state.trim()) return 'Enter your state / region';
    if (crops.length === 0) return 'Pick at least one crop';
    return null;
  }

  async function onSave() {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const updated = await updateFarmerProfile({
        name: name.trim(),
        phone: phone.trim() || null,
        location: location.trim() || null,
        farmSizeAcres: parseFloat(farmSize),
        cropsGrown: crops,
        state: state.trim(),
      });
      applyUser(updated);
      navigation.goBack();
    } catch (e) {
      setError(errorMessage(e, 'Could not save your changes'));
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.section}>Contact</Text>

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="e.g., 9876543210"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Village / town</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="e.g., Baramati"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
          />

          <Text style={[styles.section, styles.sectionGap]}>Farm</Text>

          <Text style={styles.label}>Farm size (acres)</Text>
          <TextInput
            style={styles.input}
            value={farmSize}
            onChangeText={setFarmSize}
            keyboardType="numeric"
            placeholder="e.g., 15"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>State / region</Text>
          <TextInput
            style={styles.input}
            value={state}
            onChangeText={setState}
            placeholder="e.g., Maharashtra"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Crops grown · {crops.length} selected</Text>
          <View style={styles.chips}>
            {cropOptions.map((crop) => {
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

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.spacer} />
          <Button label="Save changes" onPress={onSave} loading={saving} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surfaceAlt },
  container: { padding: spacing.xl, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.xl,
  },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: colors.sage, textTransform: 'uppercase', marginBottom: spacing.md },
  sectionGap: { marginTop: spacing.md },
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
  error: { color: colors.error, fontSize: 14, marginBottom: spacing.sm },
  spacer: { height: spacing.xs },
});
