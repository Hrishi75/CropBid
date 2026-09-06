// Profile tab ("You") — identity card with a tappable profile photo (camera or
// gallery via expo-image-picker, uploaded to POST /auth/me/avatar), a trust
// meter, detail cards, and pressable rows for edit / activity / sign-out.
// Farmer copy stays in plain words; buyers keep the neutral vocabulary.

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { Eyebrow, Mono, StatusPill } from '../components/buyerKit';
import { LanguageChips } from '../components/LanguagePicker';
import { IconChevR } from '../components/icons';
import { colors, design, font } from '../theme';
import { useAuth } from '../context/AuthContext';
import type { ProfileParamList } from '../navigation/types';
import { deleteAccount, uploadAvatar } from '../api/endpoints';
import { errorMessage, mediaUrl } from '../api/client';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<NativeStackNavigationProp<ProfileParamList>>();
  const { user, refreshUser, applyUser, signOut, dropSession } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // Delete-account confirm sheet: the password typed in it, and the in-flight /
  // error state of the DELETE call.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!user) return null;

  const isFarmer = user.role === 'FARMER';
  // A shopper has no demand board: the routes are not in the consumer stack and
  // the server refuses the feed to anyone but a farmer or a buyer.
  const trades = isFarmer || user.role === 'BUYER';
  const farm = user.farmerProfile;
  const photo = mediaUrl(user.avatar);
  const trust = Math.round(Math.min(Math.max(user.trustScore, 0), 100));
  const subtitle = isFarmer
    ? `${t('Farmer')}${farm?.state ? ` · ${farm.state}` : ''}`
    : user.buyerProfile?.companyName ?? t('Buyer');

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refreshUser();
    } finally {
      setRefreshing(false);
    }
  }

  function onAvatarPress() {
    if (uploading) return;
    Alert.alert('Profile photo', undefined, [
      { text: 'Take a photo', onPress: () => pickPhoto('camera') },
      { text: 'Choose from gallery', onPress: () => pickPhoto('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function pickPhoto(source: 'camera' | 'library') {
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Permission needed',
        source === 'camera' ? 'Allow camera access to take your photo.' : 'Allow photo access to pick your photo.',
      );
      return;
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;

    setUploading(true);
    try {
      const form = new FormData();
      form.append('avatar', {
        uri: asset.uri,
        name: asset.fileName ?? 'avatar.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      } as unknown as Blob);
      applyUser(await uploadAvatar(form));
    } catch (e) {
      Alert.alert('Could not save photo', errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  function onDeletePress() {
    Alert.alert(
      t('Delete your account?'),
      t('Your profile, listings, offers and notifications are removed for good. Completed deals stay on record without your personal details. This cannot be undone.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Continue'),
          style: 'destructive',
          onPress: () => {
            setDeletePassword('');
            setDeleteError(null);
            setDeleteOpen(true);
          },
        },
      ],
    );
  }

  async function onConfirmDelete() {
    if (deleting || !deletePassword) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount(deletePassword);
      setDeleteOpen(false);
      await dropSession(); // navigator falls back to the guest storefront
    } catch (e) {
      setDeleteError(errorMessage(e, 'Could not delete the account'));
    } finally {
      setDeleting(false);
    }
  }

  function onSignOutPress() {
    Alert.alert(t('Log out?'), isFarmer ? t('You can come back any time') : undefined, [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Log out'),
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          try {
            await signOut();
          } finally {
            setSigningOut(false);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        <View style={styles.headerPad}>
          <View style={styles.rowBetween}>
            <Eyebrow>{t('Your account')}</Eyebrow>
            <StatusPill tone="sage">{isFarmer ? t('farmer') : t('buyer')}</StatusPill>
          </View>
          <Text style={styles.h1}>
            {isFarmer ? <>Everything about <Text style={styles.h1Serif}>you.</Text></> : <>Your <Text style={styles.h1Serif}>account.</Text></>}
          </Text>
        </View>

        {/* identity card */}
        <View style={styles.sidePad}>
          <View style={styles.card}>
            <View style={styles.identityRow}>
              <Pressable onPress={onAvatarPress} hitSlop={6} style={styles.avatarWrap}>
                {photo ? (
                  <Image source={{ uri: photo }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarEmpty]}>
                    <Text style={styles.avatarLetter}>{user.name[0]?.toUpperCase()}</Text>
                  </View>
                )}
                {uploading ? (
                  <View style={styles.avatarBusy}>
                    <ActivityIndicator color="#f4f1ea" />
                  </View>
                ) : null}
                <View style={styles.avatarBadge}>
                  <Text style={styles.avatarBadgeText}>+</Text>
                </View>
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{user.name}</Text>
                <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
                <Text style={styles.photoHint}>{t('Tap the photo to change it')}</Text>
              </View>
            </View>

            {/* trust meter */}
            <View style={styles.trustBlock}>
              <View style={styles.rowBetween}>
                <Mono style={styles.trustLabel}>{isFarmer ? 'BUYERS TRUST YOU' : 'TRUST SCORE'}</Mono>
                <Mono style={styles.trustVal}>{trust} / 100</Mono>
              </View>
              <View style={styles.track}>
                <View style={[styles.trackFill, { width: `${Math.max(trust, 2)}%` }]} />
              </View>
            </View>
          </View>
        </View>

        {/* language */}
        <View style={[styles.sectionHead, styles.sidePadHead]}>
          <Eyebrow>{t('Language')} · भाषा</Eyebrow>
        </View>
        <View style={styles.sidePad}>
          <View style={styles.card}>
            <Text style={styles.langHint}>{t('Choose the language the app speaks')}</Text>
            <LanguageChips />
          </View>
        </View>

        {/* details */}
        <View style={[styles.sectionHead, styles.sidePadHead]}>
          <Eyebrow>{isFarmer ? t('Your details') : t('Account details')}</Eyebrow>
        </View>
        <View style={styles.sidePad}>
          <View style={styles.card}>
            <Field label="EMAIL" value={user.email} />
            <View style={styles.divider} />
            <Field label="PHONE" value={user.phone ?? 'not set'} />
            {isFarmer ? (
              <>
                <View style={styles.divider} />
                <Field label="VILLAGE / TOWN" value={user.location ?? 'not set'} />
              </>
            ) : null}
            <View style={styles.divider} />
            <Field label="COUNTRY" value={user.country} />
          </View>
        </View>

        {/* farm card (farmer) / company card (buyer) */}
        {isFarmer ? (
          <>
            <View style={[styles.sectionHead, styles.sidePadHead]}>
              <Eyebrow>{t('Your farm')}</Eyebrow>
              {farm?.organicCertified ? <StatusPill tone="sage">organic</StatusPill> : null}
            </View>
            <View style={styles.sidePad}>
              <View style={styles.card}>
                <Field label="FARM SIZE" value={farm?.farmSizeAcres != null ? `${farm.farmSizeAcres} acres` : 'not set'} />
                <View style={styles.divider} />
                <Field label="STATE" value={farm?.state ?? 'not set'} />
                {farm?.cropsGrown?.length ? (
                  <>
                    <View style={styles.divider} />
                    <Mono style={styles.cropsLabel}>YOUR CROPS</Mono>
                    <View style={styles.chipWrap}>
                      {farm.cropsGrown.map((c) => (
                        <View key={c} style={styles.chip}>
                          <Text style={styles.chipText}>{c}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}
              </View>
            </View>
          </>
        ) : user.buyerProfile ? (
          <>
            <View style={[styles.sectionHead, styles.sidePadHead]}>
              <Eyebrow>{t('Company')}</Eyebrow>
            </View>
            <View style={styles.sidePad}>
              <View style={styles.card}>
                <Field label="COMPANY" value={user.buyerProfile.companyName ?? 'not set'} />
                <View style={styles.divider} />
                <Field label="TYPE" value={user.buyerProfile.companyType ?? 'not set'} />
              </View>
            </View>
          </>
        ) : null}

        {/* actions */}
        <View style={[styles.sectionHead, styles.sidePadHead]}>
          <Eyebrow>{isFarmer ? t('Do something') : t('Actions')}</Eyebrow>
        </View>
        <View style={[styles.sidePad, { gap: 10 }]}>
          {isFarmer ? (
            <Row
              label={t('Change your details')}
              hint={t('Name, phone, village and farm')}
              onPress={() => nav.navigate('EditProfile')}
            />
          ) : null}
          <Row
            label={isFarmer ? t('See what happened') : t('Activity')}
            hint={isFarmer ? t('Offers, deals and payments') : t('Notifications and updates')}
            onPress={() => nav.navigate('Notifications')}
          />
          {isFarmer ? (
            <Row label={t('Your sales')} hint={t('Deals and payments so far')} onPress={() => nav.navigate('Contracts')} />
          ) : null}
          {/* The demand board is reachable from both dashboards; it is here too
              because Profile is where someone who has not found the dashboard
              strip goes looking for "everything else I can do". */}
          {trades ? (
            <>
              <Row
                label={isFarmer ? t('What buyers need') : t('Demand board')}
                hint={isFarmer
                  ? t('Fill an order at their price, or counter')
                  : t('What the market is asking for, and at what price')}
                onPress={() => nav.navigate('Demand')}
              />
              <Row
                label={isFarmer ? t('Your offers') : t('Your requirements')}
                hint={isFarmer
                  ? t('What you have offered against buyer demand')
                  : t('The demand you have posted, and the offers on it')}
                onPress={() => nav.navigate(isFarmer ? 'MyOffers' : 'MyRequirements')}
              />
            </>
          ) : null}
          {isFarmer ? (
            <Row label={t('Your AI helper')} hint={t('Answers offers for you')} onPress={() => nav.navigate('Helper')} />
          ) : null}
          <Row
            label={t('Log out')}
            hint={isFarmer ? t('You can come back any time') : undefined}
            danger
            loading={signingOut}
            onPress={onSignOutPress}
          />
          <Row
            label={t('Delete account')}
            hint={t('This cannot be undone')}
            danger
            onPress={onDeletePress}
          />
        </View>
      </ScrollView>

      {/* delete-account confirm sheet — password re-entry, then DELETE /auth/me */}
      <Modal
        visible={deleteOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !deleting && setDeleteOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalScrim}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('Delete your account?')}</Text>
            <Text style={styles.modalBody}>
              {t('Enter your password to confirm. Everything is removed for good.')}
            </Text>
            <TextInput
              style={styles.modalInput}
              value={deletePassword}
              onChangeText={(v) => { setDeletePassword(v); setDeleteError(null); }}
              placeholder={t('Password')}
              placeholderTextColor={design.ink3}
              secureTextEntry
              autoCapitalize="none"
              autoFocus
              editable={!deleting}
              onSubmitEditing={onConfirmDelete}
            />
            {deleteError ? <Text style={styles.modalError}>{deleteError}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setDeleteOpen(false)}
                disabled={deleting}
                style={({ pressed }) => [styles.modalBtn, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.modalBtnText}>{t('Cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={onConfirmDelete}
                disabled={deleting || !deletePassword}
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnDanger,
                  (pressed || deleting || !deletePassword) && { opacity: 0.75 },
                ]}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.modalBtnText, styles.modalBtnDangerText]}>{t('Delete forever')}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fieldRow}>
      <Mono style={styles.fieldLabel}>{label}</Mono>
      <Text style={styles.fieldValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function Row({
  label,
  hint,
  onPress,
  danger,
  loading,
}: {
  label: string;
  hint?: string;
  onPress: () => void;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowLabel, danger && { color: colors.ember }]}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={danger ? colors.ember : colors.forest} />
      ) : (
        <IconChevR stroke={danger ? colors.ember : design.ink3} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  headerPad: { paddingHorizontal: 20, paddingBottom: 14 },
  sidePad: { paddingHorizontal: 16 },
  sidePadHead: { paddingHorizontal: 20 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { marginTop: 8, fontFamily: font.sansMed, fontSize: 26, letterSpacing: -0.65, color: design.ink },
  h1Serif: { fontFamily: font.serifItalic, fontSize: 29, color: colors.forest },

  card: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, padding: 16 },
  langHint: { fontFamily: font.sans, fontSize: 12.5, color: design.ink3, marginBottom: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 22, paddingBottom: 8 },

  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarWrap: { width: 84, height: 84 },
  avatar: { width: 84, height: 84, borderRadius: 999, backgroundColor: design.paper2 },
  avatarEmpty: { backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontFamily: font.sansMed, fontSize: 34, color: '#f4f1ea' },
  avatarBusy: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999,
    backgroundColor: 'rgba(31,45,24,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  avatarBadge: {
    position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 999,
    backgroundColor: colors.ember, borderWidth: 2, borderColor: design.paper,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarBadgeText: { fontFamily: font.sansMed, fontSize: 16, lineHeight: 19, color: '#f4f1ea' },
  name: { fontFamily: font.sansMed, fontSize: 18, letterSpacing: -0.3, color: design.ink },
  subtitle: { fontFamily: font.sans, fontSize: 13.5, color: design.ink2, marginTop: 2 },
  photoHint: { fontFamily: font.sans, fontSize: 12, color: design.ink3, marginTop: 6 },

  trustBlock: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: design.lineLight },
  trustLabel: { fontSize: 10.5, letterSpacing: 0.6, color: design.ink3 },
  trustVal: { fontFamily: font.monoSemi, fontSize: 13, color: design.ink },
  track: { height: 6, backgroundColor: design.paper2, borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: 3, backgroundColor: colors.forest },

  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 11 },
  fieldLabel: { fontSize: 10.5, letterSpacing: 0.6, color: design.ink3 },
  fieldValue: { fontFamily: font.sansMed, fontSize: 14, color: design.ink, flexShrink: 1, textAlign: 'right' },
  divider: { borderTopWidth: 1, borderTopColor: design.lineLight },

  cropsLabel: { fontSize: 10.5, letterSpacing: 0.6, color: design.ink3, paddingTop: 12 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 10 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: design.paper2, borderWidth: 1, borderColor: design.line },
  chipText: { fontFamily: font.sansMed, fontSize: 12.5, color: design.ink2 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: design.paper, borderWidth: 1, borderColor: design.line,
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16,
  },
  rowLabel: { fontFamily: font.sansMed, fontSize: 15, letterSpacing: -0.15, color: design.ink },
  rowHint: { fontFamily: font.sans, fontSize: 12.5, color: design.ink3, marginTop: 2 },

  // delete-account confirm sheet
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(22,31,16,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    alignSelf: 'stretch',
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 18,
    padding: 20,
  },
  modalTitle: { fontFamily: font.sansSemi, fontSize: 18, letterSpacing: -0.3, color: design.ink },
  modalBody: { fontFamily: font.sans, fontSize: 13, lineHeight: 18, color: design.ink2, marginTop: 6 },
  modalInput: {
    backgroundColor: design.bg,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: font.sans,
    fontSize: 14.5,
    color: design.ink,
    marginTop: 14,
  },
  modalError: { fontFamily: font.sansMed, fontSize: 12, color: colors.ember, marginTop: 8 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: design.paper,
  },
  modalBtnDanger: { backgroundColor: colors.ember, borderColor: colors.ember },
  modalBtnText: { fontFamily: font.sansSemi, fontSize: 13.5, color: design.ink },
  modalBtnDangerText: { color: '#fff' },
});
