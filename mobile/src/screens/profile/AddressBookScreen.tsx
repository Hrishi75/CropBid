// =============================================================================
// AddressBookScreen — where a shopper has things delivered
// =============================================================================
// A household does not have one address. They have home, a parent's flat, and
// the office they want vegetables sent to on a Tuesday. Retyping the street at
// every checkout is the friction that loses a basket.
//
// ONE FREE-TEXT LINE, not a form of six fields. Indian addresses do not
// decompose into house / street / postcode: "near Shivaji Chowk, behind the
// temple" is a real and useful address, and a required "Street line 2" makes it
// unenterable. What is structured is only what gets used: a label to pick
// between them, a phone for whoever is receiving it, and a landmark, which
// riders read first.
//
// THE CITY IS THE ACCOUNT'S DELIVERY CITY, not a field. `User.location` decides
// which shelf the shopper sees and the server refuses purchases that cross it,
// so an address in a city they cannot be delivered to is an address that can
// never be used. It is shown, not asked for.
//
// EXACTLY ONE DEFAULT, and the server owns that: setting a new one demotes the
// old inside a transaction, and deleting the default promotes another. This
// screen never has to reason about it, it just re-reads the list.
// =============================================================================

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Alert } from '../../lib/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Mono } from '../../components/buyerKit';
import { PressScale } from '../../components/motion';
import { IconCheck, IconPlus } from '../../components/icons';
import {
  createAddress,
  deleteAddress,
  fetchAddresses,
  setDefaultAddress,
  updateAddress,
} from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import type { Address } from '../../api/types';
import { useAuth } from '../../context/AuthContext';
import { colors, design, font, radius, spacing } from '../../theme';

export default function AddressBookScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user } = useAuth();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Non-null opens the editor. The sentinel 'new' means an empty form.
  const [editing, setEditing] = useState<Address | 'new' | null>(null);

  const city = user?.location?.trim() ?? '';

  const load = useCallback(async () => {
    setError(null);
    try {
      setAddresses(await fetchAddresses());
    } catch (e) {
      setError(errorMessage(e, 'Could not load your addresses.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function confirmDelete(a: Address) {
    Alert.alert(
      t('Remove this address?'),
      a.isDefault
        ? t('This is your default. Another saved address will take over.')
        : t('You can add it again later.'),
      [
        { text: t('Keep'), style: 'cancel' },
        {
          text: t('Remove'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAddress(a.id);
              await load();
            } catch (e) {
              Alert.alert(t('Could not remove it'), errorMessage(e, 'Please try again.'));
            }
          },
        },
      ],
    );
  }

  async function makeDefault(a: Address) {
    if (a.isDefault) return;
    try {
      await setDefaultAddress(a.id);
      await load();
    } catch (e) {
      Alert.alert(t('Could not set the default'), errorMessage(e, 'Please try again.'));
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void load(); }}
            tintColor={colors.forest}
          />
        }
      >
        <View style={styles.head}>
          <Text style={styles.copy}>
            {city
              ? `${t('Saved addresses in')} ${city}. ${t('Checkout starts on your default.')}`
              : t('Pick a delivery city on the home screen before saving an address.')}
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.sage} />
        ) : addresses.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t('No addresses saved')}</Text>
            <Text style={styles.emptyBody}>
              {t('Add one and it will be waiting at checkout instead of being typed again.')}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {addresses.map((a) => (
              <View key={a.id} style={[styles.card, a.isDefault && styles.cardDefault]}>
                <View style={styles.cardTop}>
                  <Text style={styles.label}>{a.label}</Text>
                  {a.isDefault ? (
                    <View style={styles.defaultPill}>
                      <IconCheck size={10} sw={2.6} stroke={colors.forest} />
                      <Mono style={styles.defaultPillText}>{t('DEFAULT')}</Mono>
                    </View>
                  ) : null}
                </View>

                <Text style={styles.line}>{a.line}</Text>
                {a.landmark ? <Text style={styles.landmark}>{a.landmark}</Text> : null}
                <Mono style={styles.cityLine}>
                  {a.city.toUpperCase()}{a.phone ? ` · ${a.phone}` : ''}
                </Mono>

                <View style={styles.actions}>
                  {!a.isDefault ? (
                    <Pressable onPress={() => makeDefault(a)} hitSlop={8}>
                      <Text style={styles.action}>{t('Make default')}</Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => setEditing(a)} hitSlop={8}>
                    <Text style={styles.action}>{t('Edit')}</Text>
                  </Pressable>
                  <Pressable onPress={() => confirmDelete(a)} hitSlop={8}>
                    <Text style={[styles.action, styles.danger]}>{t('Remove')}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.foot, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <PressScale
          onPress={city ? () => setEditing('new') : undefined}
          scaleTo={0.98}
          cardStyle={[styles.addBtn, !city && styles.addBtnOff]}
        >
          <IconPlus size={15} stroke={colors.surface} />
          <Text style={styles.addBtnText}>{t('Add an address')}</Text>
        </PressScale>
      </View>

      <AddressEditor
        open={editing !== null}
        address={editing === 'new' ? null : editing}
        city={city}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); void load(); }}
      />
    </View>
  );
}

function AddressEditor({
  open,
  address,
  city,
  onClose,
  onSaved,
}: {
  open: boolean;
  address: Address | null;
  city: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [label, setLabel] = useState('');
  const [line, setLine] = useState('');
  const [landmark, setLandmark] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on OPEN rather than on every render, so a half-typed address is not
  // wiped by an unrelated re-render, and reopening never shows the last one's
  // text.
  useEffect(() => {
    if (!open) return;
    setLabel(address?.label ?? '');
    setLine(address?.line ?? '');
    setLandmark(address?.landmark ?? '');
    setPhone(address?.phone ?? '');
    setError(null);
  }, [open, address]);

  async function save() {
    if (saving) return;
    if (!label.trim()) { setError(t('Give this address a name, like Home or Office')); return; }
    if (!line.trim()) { setError(t('Enter the address')); return; }

    setSaving(true);
    setError(null);
    try {
      const input = {
        label: label.trim(),
        line: line.trim(),
        city,
        landmark: landmark.trim() || null,
        phone: phone.trim() || null,
      };
      if (address) await updateAddress(address.id, input);
      else await createAddress(input);
      onSaved();
    } catch (e) {
      setError(errorMessage(e, 'Could not save that address.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetWrap}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>
              {address ? t('Edit address') : t('Add an address')}
            </Text>

            <Text style={styles.field}>{t('Name it')}</Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder={t('Home, Office, Mum\'s place')}
              placeholderTextColor={design.ink3}
              style={styles.input}
              maxLength={40}
            />

            <Text style={styles.field}>{t('Address')}</Text>
            <TextInput
              value={line}
              onChangeText={setLine}
              placeholder={t('Flat, building, street, area')}
              placeholderTextColor={design.ink3}
              style={[styles.input, styles.inputTall]}
              multiline
              maxLength={500}
            />

            <Text style={styles.field}>{t('Landmark (optional)')}</Text>
            <TextInput
              value={landmark}
              onChangeText={setLandmark}
              placeholder={t('Near the temple, opposite the school')}
              placeholderTextColor={design.ink3}
              style={styles.input}
              maxLength={500}
            />

            <Text style={styles.field}>{t('Phone for this delivery (optional)')}</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder={t('Rings whoever is receiving it')}
              placeholderTextColor={design.ink3}
              keyboardType="phone-pad"
              style={styles.input}
              maxLength={20}
            />

            {/* Shown, not asked. The account's delivery city is what decides
                the shelf and what the server checks a purchase against, so an
                address in another city could never be used. */}
            <Mono style={styles.cityNote}>{t('CITY')} · {city.toUpperCase()}</Mono>

            {error ? <Text style={styles.sheetError}>{error}</Text> : null}

            <View style={styles.sheetActions}>
              <Pressable onPress={onClose} style={styles.cancel} hitSlop={8}>
                <Text style={styles.cancelText}>{t('Cancel')}</Text>
              </Pressable>
              <PressScale onPress={save} scaleTo={0.97} style={{ flex: 1 }} cardStyle={styles.saveBtn}>
                {saving
                  ? <ActivityIndicator color={colors.surface} size="small" />
                  : <Text style={styles.saveText}>{t('Save address')}</Text>}
              </PressScale>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: design.bg },
  head: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  copy: { fontFamily: font.sans, fontSize: 14, lineHeight: 21, color: design.ink3 },
  error: { fontFamily: font.sans, fontSize: 14, color: colors.ember, paddingHorizontal: spacing.lg, paddingTop: spacing.md },

  empty: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  emptyTitle: { fontFamily: font.sansSemi, fontSize: 16, color: design.ink },
  emptyBody: { fontFamily: font.sans, fontSize: 14, lineHeight: 21, color: design.ink3, marginTop: 4 },

  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },
  card: {
    backgroundColor: design.paper,
    borderWidth: 1, borderColor: design.line, borderRadius: radius.lg,
    padding: spacing.md,
  },
  cardDefault: { borderColor: colors.sage },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { flex: 1, fontFamily: font.sansSemi, fontSize: 16, color: design.ink },
  defaultPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: design.mint, borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  defaultPillText: { fontSize: 8.5, letterSpacing: 0.6, color: colors.forest },

  line: { fontFamily: font.sans, fontSize: 14, lineHeight: 20, color: design.ink2, marginTop: 5 },
  landmark: { fontFamily: font.sans, fontSize: 13, color: design.ink3, marginTop: 2 },
  cityLine: { fontSize: 10, letterSpacing: 0.6, color: design.ink3, marginTop: 6 },

  actions: {
    flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md,
    paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: design.lineLight,
  },
  action: { fontFamily: font.sansMed, fontSize: 13, color: colors.forest },
  danger: { color: colors.ember },

  foot: {
    paddingHorizontal: spacing.lg, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: design.line,
    backgroundColor: 'rgba(251,249,243,0.98)',
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: colors.forest, borderRadius: radius.md, paddingVertical: spacing.md,
  },
  addBtnOff: { opacity: 0.4 },
  addBtnText: { fontFamily: font.sansSemi, fontSize: 15.5, color: colors.surface },

  // --- Editor sheet ---
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,20,15,0.45)' },
  sheet: {
    backgroundColor: design.bg,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: spacing.lg, paddingTop: 10,
  },
  grabber: {
    alignSelf: 'center', width: 38, height: 4, borderRadius: 999,
    backgroundColor: design.line, marginBottom: spacing.md,
  },
  sheetTitle: { fontFamily: font.sansBold, fontSize: 21, color: design.ink, letterSpacing: -0.4 },
  field: { fontFamily: font.sansMed, fontSize: 12.5, color: design.ink3, marginTop: spacing.md, marginBottom: 5 },
  input: {
    backgroundColor: design.paper,
    borderWidth: 1, borderColor: design.line, borderRadius: radius.md,
    paddingHorizontal: spacing.md, minHeight: 44, paddingVertical: 10,
    fontFamily: font.sans, fontSize: 15, color: design.ink,
  },
  inputTall: { minHeight: 72, textAlignVertical: 'top' },
  cityNote: { fontSize: 10, letterSpacing: 0.8, color: design.ink3, marginTop: spacing.md },
  sheetError: { fontFamily: font.sansMed, fontSize: 13, color: colors.ember, marginTop: spacing.sm },

  sheetActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg },
  cancel: { paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  cancelText: { fontFamily: font.sansMed, fontSize: 15, color: design.ink3 },
  saveBtn: {
    backgroundColor: colors.forest, borderRadius: radius.md,
    paddingVertical: spacing.md, alignItems: 'center', minHeight: 46, justifyContent: 'center',
  },
  saveText: { fontFamily: font.sansSemi, fontSize: 15.5, color: colors.surface },
});
