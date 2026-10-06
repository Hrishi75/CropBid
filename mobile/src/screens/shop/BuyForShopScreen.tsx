// =============================================================================
// BuyForShopScreen — a local shop or a wholesaler applying to buy stock
// =============================================================================
// The buyer application, cut down to what a shop needs to say: the name it
// buys under (its own, by default) and, optionally, a GSTIN. It is filed as a
// SMALL_BUSINESS buyer and goes into the same admin queue as every other
// application (CLAUDE.md §4). Approval leaves the account a seller and adds the
// buying side, which the shop then reaches with the Selling | Buying switch.
//
// The same screen shows where the application stands once it is filed, so
// the profile card can always send the shop here.
// =============================================================================

import React, { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert } from '../../lib/alert';
import { Mono } from '../../components/buyerKit';
import { IconArrowLeft, IconBasket, IconCheck, IconClock } from '../../components/icons';
import { useAuth } from '../../context/AuthContext';
import { buyerOnboarding } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { sellerDisplayName } from '../../lib/sellerType';
import { colors, design, font } from '../../theme';

export default function BuyForShopScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { user, refreshUser, switchMode } = useAuth();
  const app = user?.buyerProfile ?? null;
  // A wholesaler is filed as a wholesale buyer and called a business; a shop
  // as a small business and called a shop.
  const isWholesaler = user?.farmerProfile?.sellerType === 'WHOLESALER';
  const place = isWholesaler ? 'business' : 'shop';
  const status = app?.status;
  // Asked again only when a reviewer sent it back.
  const filing = !app || status === 'NEEDS_INFO' || status === 'REJECTED';

  const [name, setName] = useState(app?.companyName || sellerDisplayName(user));
  const [gstin, setGstin] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (name.trim().length < 2) {
      Alert.alert('Name missing', `Enter the name your ${place} buys under.`);
      return;
    }
    setSaving(true);
    try {
      await buyerOnboarding({
        companyName: name.trim(),
        companyType: isWholesaler ? 'WHOLESALER' : 'SMALL_BUSINESS',
        taxId: gstin.trim() || undefined,
      });
      await refreshUser();
    } catch (e) {
      Alert.alert('Could not send the application', errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 110 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.head}>
          <Pressable onPress={() => nav.goBack()} hitSlop={8} accessibilityLabel="Back" style={styles.back}>
            <IconArrowLeft size={19} stroke={design.ink} />
          </Pressable>
          <View style={styles.iconTile}><IconBasket size={24} stroke={colors.forest} /></View>
          <Text style={styles.h1}>Buy stock for your {place}</Text>
          <Text style={styles.lede}>
            Buy from farms and {isWholesaler ? 'other wholesalers' : 'wholesalers'} at mandi-linked prices, with the same account. Once
            CropBid approves it, switch between selling and buying from your profile.
          </Text>
        </View>

        {status === 'APPROVED' ? (
          <View style={[styles.state, styles.stateGood]}>
            <IconCheck size={18} stroke={colors.forest} />
            <View style={{ flex: 1 }}>
              <Text style={styles.stateTitle}>You can buy now</Text>
              <Text style={styles.stateBody}>Switch to buying any time from your profile.</Text>
            </View>
          </View>
        ) : status === 'SUBMITTED' || status === 'UNDER_REVIEW' ? (
          <View style={styles.state}>
            <IconClock size={18} stroke={design.ink2} />
            <View style={{ flex: 1 }}>
              <Text style={styles.stateTitle}>Application under review</Text>
              <Text style={styles.stateBody}>
                A person at CropBid checks every application. You will get a notification when it is decided.
              </Text>
            </View>
          </View>
        ) : status === 'NEEDS_INFO' || status === 'REJECTED' || status === 'SUSPENDED' ? (
          <View style={[styles.state, styles.stateWarn]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.stateTitle}>
                {status === 'NEEDS_INFO'
                  ? 'The reviewer asked for more'
                  : status === 'SUSPENDED'
                    ? 'Buying is paused on this account'
                    : 'This application was not approved'}
              </Text>
              {app?.statusNote ? <Text style={styles.stateBody}>“{app.statusNote}”</Text> : null}
            </View>
          </View>
        ) : null}

        {filing ? (
          <View style={styles.card}>
            <Mono style={styles.label}>BUY UNDER THE NAME</Mono>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={`Your ${place}'s name`}
              placeholderTextColor={design.ink3}
            />
            <Mono style={[styles.label, { marginTop: 6 }]}>GSTIN · OPTIONAL</Mono>
            <TextInput
              style={styles.input}
              value={gstin}
              onChangeText={setGstin}
              autoCapitalize="characters"
              placeholder="22AAAAA0000A1Z5"
              placeholderTextColor={design.ink3}
            />
            <Text style={styles.hint}>
              Filed as {isWholesaler ? 'a wholesale buyer' : 'a small business'}. Your selling stays exactly as it is.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {filing || status === 'APPROVED' ? (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            disabled={saving}
            onPress={status === 'APPROVED' ? () => switchMode('BUY') : submit}
            style={({ pressed }) => [styles.submit, (pressed || saving) && { opacity: 0.85 }]}
          >
            {saving ? (
              <ActivityIndicator color="#f4f1ea" size="small" />
            ) : (
              <Text style={styles.submitText}>
                {status === 'APPROVED' ? 'Switch to buying' : app ? 'Send it again' : 'Apply to buy'}
              </Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  head: { paddingHorizontal: 20, paddingBottom: 6 },
  back: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: design.paper, borderWidth: 1, borderColor: design.line,
  },
  iconTile: {
    width: 52, height: 52, borderRadius: 16, marginTop: 18,
    alignItems: 'center', justifyContent: 'center', backgroundColor: design.mint,
  },
  h1: { marginTop: 14, fontFamily: font.sansBold, fontSize: 25, letterSpacing: -0.6, color: design.ink },
  lede: { marginTop: 6, fontFamily: font.sans, fontSize: 14, lineHeight: 20, color: design.ink2 },

  state: {
    flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 16,
    backgroundColor: design.paper2, borderRadius: 14, padding: 14,
  },
  stateGood: { backgroundColor: design.mint },
  stateWarn: { backgroundColor: 'rgba(200,96,43,0.1)' },
  stateTitle: { fontFamily: font.sansSemi, fontSize: 14.5, color: design.ink },
  stateBody: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 18, color: design.ink2, marginTop: 2 },

  card: {
    marginHorizontal: 16, marginTop: 16, padding: 16, gap: 8,
    backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 18,
  },
  label: { fontSize: 9.5, letterSpacing: 0.7, color: design.ink3 },
  input: {
    borderWidth: 1, borderColor: design.line, borderRadius: 12, backgroundColor: design.bg,
    paddingHorizontal: 14, paddingVertical: 12, fontFamily: font.sans, fontSize: 15.5, color: design.ink,
  },
  hint: { fontFamily: font.sans, fontSize: 12, color: design.ink3, marginTop: 4 },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 12, paddingHorizontal: 16,
    backgroundColor: 'rgba(244,241,234,0.97)', borderTopWidth: 1, borderTopColor: design.line,
  },
  submit: { alignItems: 'center', justifyContent: 'center', paddingVertical: 15, borderRadius: 14, backgroundColor: colors.forest },
  submitText: { fontFamily: font.sansSemi, fontSize: 15.5, color: '#f4f1ea' },
});
