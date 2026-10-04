// =============================================================================
// BuyerProfile — the "You" tab for a business buyer
// =============================================================================
// Same shape as the shopper's and the seller's, built from the same pieces:
// who you are, the three places a buyer goes most (dashboard, contracts, what
// you have asked for), then sourcing tools, the company, and the rest.
//
// THE TRUST SCORE STAYS. A buyer is judged by the sellers on the other side of
// every deal, as a seller is by buyers, so it is a real fact about them.
//
// Also shown to a seller in buying mode (a shop or a wholesaler stocking up),
// who gets the Selling | Buying switch here as the way back.
// =============================================================================

import React from 'react';
import {
  ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Mono } from '../../components/buyerKit';
import { LanguageChips } from '../../components/LanguagePicker';
import { ModeSwitch } from '../../components/ModeSwitch';
import { PressScale } from '../../components/motion';
import {
  IconBell2, IconDoc, IconGlobe, IconHelp, IconInfo, IconLogout,
  IconMarket, IconPin, IconPlus, IconShare, IconShield,
} from '../../components/icons';
import type { User } from '../../api/types';
import { companyTypeLabel } from '../../lib/companyType';
import { colors, design, font } from '../../theme';
import { MenuRow, SectionTitle, Tile, profileStyles as p } from './ShopperProfile';

export function BuyerProfile({
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
  const nav = useNavigation<any>();
  const company = user.buyerProfile?.companyName?.trim() || user.name;
  const type = companyTypeLabel(user.buyerProfile?.companyType);
  const trust = Math.round(Math.min(Math.max(user.trustScore, 0), 100));
  const contact = [user.phone, user.email].filter(Boolean).join(' · ');

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 28 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
    >
      {/* ---- who you are, and how sellers see you -------------------------- */}
      <View style={p.pad}>
        <View style={[p.hero, styles.hero]}>
          <View style={styles.heroTop}>
            <Pressable onPress={onAvatarPress} hitSlop={6} accessibilityLabel={t('Change your photo')} style={p.avatarWrap}>
              {photo ? (
                <Image source={{ uri: photo }} style={p.avatar} />
              ) : (
                <View style={[p.avatar, p.avatarEmpty]}>
                  <Text style={p.avatarLetter}>{company[0]?.toUpperCase() ?? '·'}</Text>
                </View>
              )}
              {uploading ? (
                <View style={p.avatarBusy}><ActivityIndicator color={colors.surface} /></View>
              ) : null}
              <View style={p.avatarBadge}><Text style={p.avatarBadgeText}>+</Text></View>
            </Pressable>
            <View style={p.heroText}>
              <Text style={p.name} numberOfLines={1}>{company}</Text>
              {contact ? <Text style={p.contact} numberOfLines={1}>{contact}</Text> : null}
              <View style={p.heroTags}>
                <View style={p.tag}><Mono style={p.tagText}>BUYER</Mono></View>
                {type ? <View style={p.tag}><Mono style={p.tagText}>{type.toUpperCase()}</Mono></View> : null}
                {user.location ? (
                  <View style={[p.tag, p.tagCity]}>
                    <IconPin size={11} stroke={design.leaf} />
                    <Mono style={p.tagText}>{user.location.toUpperCase()}</Mono>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
          <View style={styles.trust}>
            <View style={styles.trustRow}>
              <Mono style={styles.trustLabel}>SELLERS TRUST YOU</Mono>
              <Text style={styles.trustVal}>{trust}<Text style={styles.trustOf}> / 100</Text></Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.trackFill, { width: `${Math.max(trust, 2)}%` }]} />
            </View>
          </View>
        </View>
      </View>

      {/* A seller in buying mode: the way back to selling. Nothing for a
          buyer-only account. */}
      <View style={[p.pad, { marginTop: 12 }]}>
        <ModeSwitch />
      </View>

      {/* ---- the three places a buyer goes most --------------------------- */}
      <View style={[p.pad, p.tiles]}>
        <Tile Icon={IconMarket} label={t('Dashboard')} sub={t('Bids & deals')} onPress={() => nav.navigate('Dashboard')} />
        <Tile Icon={IconDoc} label={t('Contracts')} sub={t('Pay & track')} onPress={() => nav.navigate('Contracts')} />
        <Tile Icon={IconShare} label={t('Requests')} sub={t('What you need')} onPress={() => nav.navigate('Requests')} />
      </View>

      {/* ---- sourcing ------------------------------------------------------ */}
      <SectionTitle>{t('Sourcing')}</SectionTitle>
      <View style={p.pad}>
        <View style={p.group}>
          <MenuRow
            Icon={IconPlus}
            label={t('Post what you need')}
            hint={user.buyerProfile?.companyType === 'RESTAURANT' ? t('Sellers offer their price, you negotiate') : t('Sellers fill it at your price, or counter')}
            onPress={() => nav.navigate('CreateRequirement')}
          />
          <MenuRow
            Icon={IconMarket}
            label={t('Demand board')}
            hint={t('What the market is asking for, and at what price')}
            onPress={() => nav.navigate('Demand')}
          />
          <MenuRow
            Icon={IconBell2}
            label={t('Activity')}
            hint={t('Counters, deals and payments')}
            onPress={() => nav.navigate('Notifications')}
            last
          />
        </View>
      </View>

      {/* ---- the company --------------------------------------------------- */}
      {user.buyerProfile ? (
        <>
          <SectionTitle>{t('Your company')}</SectionTitle>
          <View style={p.pad}>
            <View style={[p.group, styles.facts]}>
              <Fact label="COMPANY" value={company} />
              <Fact label="TYPE" value={type ?? t('not set')} />
            </View>
          </View>
        </>
      ) : null}

      {/* ---- language ------------------------------------------------------ */}
      <SectionTitle>{`${t('Language')} · भाषा`}</SectionTitle>
      <View style={p.pad}>
        <View style={p.group}>
          <View style={p.langRow}>
            <View style={p.rowIcon}><IconGlobe size={17} stroke={colors.forest} /></View>
            <Text style={p.langHint}>{t('Choose the language the app speaks')}</Text>
          </View>
          <View style={p.langChips}><LanguageChips /></View>
        </View>
      </View>

      {/* ---- help and the small print ------------------------------------- */}
      <SectionTitle>{t('Help & legal')}</SectionTitle>
      <View style={p.pad}>
        <View style={p.group}>
          <MenuRow Icon={IconHelp} label={t('Help')} hint={t('Write to us at info@cropbid.in')} onPress={() => nav.navigate('Help')} />
          <MenuRow Icon={IconInfo} label={t('About CropBid')} hint={t('What we do, and what we charge')} onPress={() => nav.navigate('About')} />
          <MenuRow Icon={IconShield} label={t('Privacy policy')} onPress={() => nav.navigate('Policy', { kind: 'privacy' })} />
          <MenuRow Icon={IconDoc} label={t('Terms and conditions')} onPress={() => nav.navigate('Policy', { kind: 'terms' })} />
          <MenuRow Icon={IconShare} label={t('Share CropBid')} hint={t('Send the app to someone')} onPress={onShare} last />
        </View>
      </View>

      {/* ---- leaving ------------------------------------------------------- */}
      <View style={[p.pad, p.leave]}>
        <PressScale onPress={signingOut ? undefined : onSignOut} scaleTo={0.98} cardStyle={p.logout}>
          {signingOut ? (
            <ActivityIndicator color={colors.ember} />
          ) : (
            <>
              <IconLogout size={18} stroke={colors.ember} />
              <Text style={p.logoutText}>{t('Log out')}</Text>
            </>
          )}
        </PressScale>
        <Pressable onPress={onDelete} hitSlop={8} style={p.deleteWrap}>
          <Text style={p.deleteText}>{t('Delete account')}</Text>
        </Pressable>
        <Mono style={p.footNote}>CROPBID · INDIA</Mono>
      </View>
    </ScrollView>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Mono style={styles.factLabel}>{label}</Mono>
      <Text style={styles.factValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'column', alignItems: 'stretch', gap: 16 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  trust: { gap: 8, borderTopWidth: 1, borderTopColor: 'rgba(244,241,234,0.12)', paddingTop: 14 },
  trustRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  trustLabel: { fontSize: 9.5, letterSpacing: 0.8, color: design.leaf },
  trustVal: { fontFamily: font.sansBold, fontSize: 18, color: colors.surface },
  trustOf: { fontFamily: font.sans, fontSize: 12, color: 'rgba(244,241,234,0.6)' },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(244,241,234,0.14)', overflow: 'hidden' },
  trackFill: { height: 6, borderRadius: 3, backgroundColor: design.leaf },
  facts: { flexDirection: 'row', gap: 10, padding: 14 },
  fact: { flex: 1, minWidth: 0, backgroundColor: design.bg, borderRadius: 12, padding: 10 },
  factLabel: { fontSize: 8.5, letterSpacing: 0.6, color: design.ink3 },
  factValue: { fontFamily: font.sansSemi, fontSize: 14, color: design.ink, marginTop: 3 },
});
