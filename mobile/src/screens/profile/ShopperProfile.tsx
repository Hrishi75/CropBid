// =============================================================================
// ShopperProfile — the "You" tab for a household
// =============================================================================
// A shopper comes to this tab for a handful of things: their orders, where
// things are delivered, their wallet, the language, and help. So those come
// first, as three tiles and two short grouped lists, instead of the twelve
// stacked cards the trade profile carries.
//
// NO TRUST SCORE. The 0-100 platform score means something on a seller or a
// bulk buyer, who are judged by the other side of a deal. On a household it is
// a grade with nothing behind it, and "50 / 100" reads as being marked down.
//
// Rendered by ProfileScreen for CONSUMER accounts only, which keeps the photo
// picker, log-out and delete-account confirm in one place for every role.
// =============================================================================

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Mono } from '../../components/buyerKit';
import { LanguageChips } from '../../components/LanguagePicker';
import { PressScale } from '../../components/motion';
import { shortBalance } from '../../components/WalletPill';
import {
  IconBasket, IconBell2, IconChevR, IconDoc, IconGlobe, IconHelp, IconInfo,
  IconLogout, IconPin, IconShare, IconShield, IconWallet, type IcoProps,
} from '../../components/icons';
import { fetchWallet } from '../../api/endpoints';
import type { User } from '../../api/types';
import type { ProfileParamList } from '../../navigation/types';
import { colors, design, font } from '../../theme';

export function ShopperProfile({
  user, photo, uploading, refreshing, signingOut,
  onRefresh, onAvatarPress, onShare, onSignOut, onDelete,
}: {
  user: User;
  photo: string | null;
  uploading: boolean;
  refreshing: boolean;
  signingOut: boolean;
  onRefresh: () => void;
  onAvatarPress: () => void;
  onShare: () => void;
  onSignOut: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<NativeStackNavigationProp<ProfileParamList>>();
  const [balance, setBalance] = useState<number | null>(null);

  // Read on focus, like the header pill, so a top-up made on the wallet
  // screen is on the tile when they come back.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchWallet()
        .then((w) => { if (!cancelled) setBalance(w.balance); })
        .catch(() => {});
      return () => { cancelled = true; };
    }, []),
  );

  // Whichever they signed up with, phone first: it is the one a delivery uses.
  const contact = [user.phone, user.email].filter(Boolean).join(' · ');

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 28 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
    >
      {/* ---- who you are ---------------------------------------------------- */}
      <View style={styles.pad}>
        <View style={styles.hero}>
          <Pressable
            onPress={onAvatarPress}
            hitSlop={6}
            accessibilityLabel={t('Change your photo')}
            style={styles.avatarWrap}
          >
            {photo ? (
              <Image source={{ uri: photo }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarEmpty]}>
                <Text style={styles.avatarLetter}>{user.name?.[0]?.toUpperCase() ?? '·'}</Text>
              </View>
            )}
            {uploading ? (
              <View style={styles.avatarBusy}>
                <ActivityIndicator color={colors.surface} />
              </View>
            ) : null}
            <View style={styles.avatarBadge}>
              <Text style={styles.avatarBadgeText}>+</Text>
            </View>
          </Pressable>
          <View style={styles.heroText}>
            <Text style={styles.name} numberOfLines={1}>{user.name}</Text>
            {contact ? <Text style={styles.contact} numberOfLines={1}>{contact}</Text> : null}
            <View style={styles.heroTags}>
              <View style={styles.tag}>
                <Mono style={styles.tagText}>SHOPPER</Mono>
              </View>
              {user.location ? (
                <View style={[styles.tag, styles.tagCity]}>
                  <IconPin size={11} stroke={design.leaf} />
                  <Mono style={styles.tagText}>{user.location.toUpperCase()}</Mono>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </View>

      {/* ---- the three things people come here for -------------------------- */}
      <View style={[styles.pad, styles.tiles]}>
        <Tile
          Icon={IconBasket}
          label={t('Orders')}
          sub={t('Pay, track, confirm')}
          onPress={() => nav.navigate('Orders')}
        />
        <Tile
          Icon={IconPin}
          label={t('Addresses')}
          sub={t('Where it goes')}
          onPress={() => nav.navigate('AddressBook')}
        />
        <Tile
          Icon={IconWallet}
          label={t('Wallet')}
          sub={balance === null ? t('Credits') : shortBalance(balance)}
          onPress={() => nav.navigate('Wallet')}
        />
      </View>

      {/* ---- language -------------------------------------------------------- */}
      <SectionTitle>{`${t('Language')} · भाषा`}</SectionTitle>
      <View style={styles.pad}>
        <View style={styles.group}>
          <View style={styles.langRow}>
            <View style={styles.rowIcon}>
              <IconGlobe size={17} stroke={colors.forest} />
            </View>
            <Text style={styles.langHint}>{t('Choose the language the app speaks')}</Text>
          </View>
          <View style={styles.langChips}>
            <LanguageChips />
          </View>
        </View>
      </View>

      {/* ---- settings -------------------------------------------------------- */}
      <SectionTitle>{t('Settings')}</SectionTitle>
      <View style={styles.pad}>
        <View style={styles.group}>
          <MenuRow
            Icon={IconBell2}
            label={t('Notifications')}
            hint={t('What this device tells you about')}
            onPress={() => nav.navigate('NotificationPrefs')}
          />
          <MenuRow
            Icon={IconShare}
            label={t('Share CropBid')}
            hint={t('Send the app to someone')}
            onPress={onShare}
            last
          />
        </View>
      </View>

      {/* ---- help and the small print ---------------------------------------- */}
      <SectionTitle>{t('Help & legal')}</SectionTitle>
      <View style={styles.pad}>
        <View style={styles.group}>
          <MenuRow
            Icon={IconHelp}
            label={t('Help')}
            hint={t('Write to us at info@cropbid.in')}
            onPress={() => nav.navigate('Help')}
          />
          <MenuRow
            Icon={IconInfo}
            label={t('About CropBid')}
            hint={t('What we do, and what we charge')}
            onPress={() => nav.navigate('About')}
          />
          <MenuRow
            Icon={IconShield}
            label={t('Privacy policy')}
            onPress={() => nav.navigate('Policy', { kind: 'privacy' })}
          />
          <MenuRow
            Icon={IconDoc}
            label={t('Terms and conditions')}
            onPress={() => nav.navigate('Policy', { kind: 'terms' })}
            last
          />
        </View>
      </View>

      {/* ---- leaving --------------------------------------------------------- */}
      <View style={[styles.pad, styles.leave]}>
        <PressScale onPress={signingOut ? undefined : onSignOut} scaleTo={0.98} cardStyle={styles.logout}>
          {signingOut ? (
            <ActivityIndicator color={colors.ember} />
          ) : (
            <>
              <IconLogout size={18} stroke={colors.ember} />
              <Text style={styles.logoutText}>{t('Log out')}</Text>
            </>
          )}
        </PressScale>
        {/* Quieter than log out on purpose: it cannot be undone, so it should
            never be the thing a thumb finds first. The confirm still asks for
            the password. */}
        <Pressable onPress={onDelete} hitSlop={8} style={styles.deleteWrap}>
          <Text style={styles.deleteText}>{t('Delete account')}</Text>
        </Pressable>
        <Mono style={styles.footNote}>CROPBID · INDIA</Mono>
      </View>
    </ScrollView>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Mono style={styles.section}>{typeof children === 'string' ? children.toUpperCase() : children}</Mono>;
}

export function Tile({
  Icon, label, sub, onPress,
}: { Icon: React.ComponentType<IcoProps>; label: string; sub: string; onPress: () => void }) {
  return (
    <PressScale onPress={onPress} scaleTo={0.95} style={styles.tileSlot} cardStyle={styles.tile}>
      <View style={styles.tileIcon}>
        <Icon size={20} stroke={colors.forest} />
      </View>
      <Text style={styles.tileLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.tileSub} numberOfLines={1}>{sub}</Text>
    </PressScale>
  );
}

export function MenuRow({
  Icon, label, hint, onPress, last,
}: {
  Icon: React.ComponentType<IcoProps>;
  label: string;
  hint?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowIcon}>
        <Icon size={17} stroke={colors.forest} />
      </View>
      <View style={[styles.rowBody, !last && styles.rowDivider]}>
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>{label}</Text>
          {hint ? <Text style={styles.rowHint} numberOfLines={1}>{hint}</Text> : null}
        </View>
        <IconChevR size={12} stroke={design.ink3} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16 },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: colors.forest, borderRadius: 22,
    padding: 18,
    shadowColor: colors.forest, shadowOpacity: 0.22, shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  avatarWrap: { width: 72, height: 72 },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarEmpty: {
    backgroundColor: 'rgba(244,241,234,0.12)',
    borderWidth: 1, borderColor: 'rgba(244,241,234,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { fontFamily: font.sansSemi, fontSize: 30, color: colors.surface },
  avatarBusy: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 36,
    backgroundColor: 'rgba(20,20,15,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  avatarBadge: {
    position: 'absolute', right: -2, bottom: -2,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.ember, borderWidth: 2, borderColor: colors.forest,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarBadgeText: { fontFamily: font.sansBold, fontSize: 15, lineHeight: 17, color: colors.surface },
  heroText: { flex: 1, minWidth: 0 },
  name: { fontFamily: font.sansBold, fontSize: 21, letterSpacing: -0.4, color: colors.surface },
  contact: { fontFamily: font.sans, fontSize: 12.5, color: 'rgba(244,241,234,0.72)', marginTop: 3 },
  heroTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(244,241,234,0.12)', borderRadius: 999,
    paddingHorizontal: 9, paddingVertical: 4,
  },
  tagCity: { backgroundColor: 'rgba(155,201,122,0.16)' },
  tagText: { fontSize: 9, letterSpacing: 0.7, color: colors.surface },

  tiles: { flexDirection: 'row', gap: 10, marginTop: 14 },
  tileSlot: { flex: 1 },
  tile: {
    backgroundColor: design.paper,
    borderWidth: 1, borderColor: design.line, borderRadius: 18,
    paddingVertical: 14, paddingHorizontal: 12, gap: 2,
  },
  tileIcon: {
    width: 38, height: 38, borderRadius: 12, marginBottom: 8,
    alignItems: 'center', justifyContent: 'center', backgroundColor: design.mint,
  },
  tileLabel: { fontFamily: font.sansSemi, fontSize: 14, color: design.ink },
  tileSub: { fontFamily: font.sans, fontSize: 11.5, color: design.ink3 },

  section: {
    fontSize: 10, letterSpacing: 1.1, color: design.ink3,
    paddingHorizontal: 20, marginTop: 24, marginBottom: 8,
  },
  group: {
    backgroundColor: design.paper,
    borderWidth: 1, borderColor: design.line, borderRadius: 18,
    overflow: 'hidden',
  },
  langRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingTop: 14 },
  langHint: { flex: 1, fontFamily: font.sans, fontSize: 13, color: design.ink2 },
  langChips: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 4 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 14 },
  rowPressed: { backgroundColor: design.paper2 },
  rowIcon: {
    width: 34, height: 34, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', backgroundColor: design.mint,
  },
  rowBody: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, paddingRight: 16,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: design.line },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontFamily: font.sansSemi, fontSize: 14.5, color: design.ink },
  rowHint: { fontFamily: font.sans, fontSize: 12, color: design.ink3, marginTop: 2 },

  leave: { marginTop: 26, alignItems: 'stretch' },
  logout: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(200,96,43,0.35)', borderRadius: 16,
    backgroundColor: 'rgba(200,96,43,0.06)', paddingVertical: 14, minHeight: 50,
  },
  logoutText: { fontFamily: font.sansSemi, fontSize: 15, color: colors.ember },
  deleteWrap: { alignSelf: 'center', marginTop: 14, paddingVertical: 4, paddingHorizontal: 10 },
  deleteText: { fontFamily: font.sansMed, fontSize: 12.5, color: design.ink3, textDecorationLine: 'underline' },
  footNote: { alignSelf: 'center', fontSize: 9.5, letterSpacing: 1.2, color: design.ink3, marginTop: 18 },
});

/** The shared look, for the seller profile to build from. */
export const profileStyles = styles;
