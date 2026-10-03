// =============================================================================
// SellerProfile — the "You" tab for a farm, a local shop or a wholesaler
// =============================================================================
// Same shape as the shopper's (ShopperProfile), built from its pieces, with
// what a seller comes here for: their stock, their offers and their sales up
// front, then the selling tools, then their own details.
//
// THE TRUST SCORE STAYS HERE. Unlike a household, a seller is judged by the
// buyers on the other side of every deal, so the score is a real fact about
// them, and it sits on the identity card where they will see it.
//
// THE PAYOUT NUDGE. A seller with nowhere to be paid gets a card asking for a
// UPI id or bank account (CLAUDE.md §4a): money can reach escrow for them, and
// without details it has nowhere to go afterwards. It never says payment is
// automatic, because it is not (§6).
//
// Words come from lib/sellerType, so a shop is never told about its farm.
// =============================================================================

import React from 'react';
import {
  ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Mono } from '../../components/buyerKit';
import { LanguageChips } from '../../components/LanguagePicker';
import { PressScale } from '../../components/motion';
import {
  IconAgent, IconBell, IconBell2, IconDoc, IconGlobe, IconHelp, IconInfo, IconLogout,
  IconMarket, IconPin, IconShare, IconShield, IconUser, IconWallet,
} from '../../components/icons';
import type { User } from '../../api/types';
import type { ProfileParamList } from '../../navigation/types';
import { accountTags, sellerDisplayName, sellerWords } from '../../lib/sellerType';
import { colors, design, font } from '../../theme';
import { MenuRow, SectionTitle, Tile, profileStyles as p } from './ShopperProfile';
import { ModeSwitch } from '../../components/ModeSwitch';
import { IconBasket, IconChevR } from '../../components/icons';

export function SellerProfile({
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
  // The profile is a tab inside the seller's tab navigator, so the other tabs
  // (stock, offers) are reachable by name from here.
  const nav = useNavigation<NativeStackNavigationProp<ProfileParamList> & { navigate: (r: string) => void }>();
  const words = sellerWords(user);
  const tags = accountTags(user);
  const farm = user.farmerProfile;
  const name = sellerDisplayName(user);
  const trust = Math.round(Math.min(Math.max(user.trustScore, 0), 100));
  const contact = [user.phone, user.email].filter(Boolean).join(' · ');
  const place = [user.location, farm?.state].filter(Boolean).join(', ');
  const hasPayout = !!(farm?.payoutUpiId || farm?.payoutAccountNumber);
  // A local shop sells to households at a fixed price: no offers, no buyer
  // demand, no helper to bargain for it. Its tabs have no Offers screen.
  const isShop = farm?.sellerType === 'LOCAL_SHOP';

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 28 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
    >
      {/* ---- who you are, and how buyers see you --------------------------- */}
      <View style={p.pad}>
        <View style={[p.hero, styles.hero]}>
          <View style={styles.heroTop}>
            <Pressable onPress={onAvatarPress} hitSlop={6} accessibilityLabel={t('Change your photo')} style={p.avatarWrap}>
              {photo ? (
                <Image source={{ uri: photo }} style={p.avatar} />
              ) : (
                <View style={[p.avatar, p.avatarEmpty]}>
                  <Text style={p.avatarLetter}>{name[0]?.toUpperCase() ?? '·'}</Text>
                </View>
              )}
              {uploading ? (
                <View style={p.avatarBusy}><ActivityIndicator color={colors.surface} /></View>
              ) : null}
              <View style={p.avatarBadge}><Text style={p.avatarBadgeText}>+</Text></View>
            </Pressable>
            <View style={p.heroText}>
              <Text style={p.name} numberOfLines={1}>{name}</Text>
              {contact ? <Text style={p.contact} numberOfLines={1}>{contact}</Text> : null}
              <View style={p.heroTags}>
                <View style={p.tag}><Mono style={p.tagText}>{tags.category}</Mono></View>
                {tags.subtype ? (
                  <View style={p.tag}><Mono style={p.tagText}>{t(tags.subtype).toUpperCase()}</Mono></View>
                ) : null}
                {place ? (
                  <View style={[p.tag, p.tagCity]}>
                    <IconPin size={11} stroke={design.leaf} />
                    <Mono style={p.tagText}>{place.toUpperCase()}</Mono>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.trust}>
            <View style={styles.trustRow}>
              <Mono style={styles.trustLabel}>{words.trustLabel}</Mono>
              <Text style={styles.trustVal}>{trust}<Text style={styles.trustOf}> / 100</Text></Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.trackFill, { width: `${Math.max(trust, 2)}%` }]} />
            </View>
          </View>
        </View>
      </View>

      {/* Selling | Buying, once the shop is approved to buy as well. */}
      <View style={[p.pad, { marginTop: 12 }]}>
        <ModeSwitch />
      </View>

      {/* ---- the three things a seller checks ------------------------------- */}
      <View style={[p.pad, p.tiles]}>
        <Tile Icon={IconDoc} label={t(words.stockTab)} sub={t('On sale')} onPress={() => nav.navigate('Listings')} />
        {isShop ? (
          <Tile Icon={IconBell} label={t('Orders')} sub={t('To send')} onPress={() => nav.navigate('Farm')} />
        ) : (
          <Tile Icon={IconBell} label={t('Offers')} sub={t('Reply to buyers')} onPress={() => nav.navigate('Bids')} />
        )}
        <Tile Icon={IconWallet} label={t('Sales')} sub={t('Your deals')} onPress={() => nav.navigate('Contracts')} />
      </View>

      {/* A shop buying stock for itself: apply, or see where that stands.
          Gone once approved, where the switch above takes over. */}
      {isShop && user.buyerProfile?.status !== 'APPROVED' ? (
        <View style={p.pad}>
          <PressScale onPress={() => nav.navigate('BuyForShop')} scaleTo={0.98} cardStyle={styles.buyCard}>
            <View style={styles.buyIcon}><IconBasket size={18} stroke={colors.forest} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.payoutTitle}>
                {!user.buyerProfile
                  ? t('Buy stock for your shop')
                  : user.buyerProfile.status === 'SUBMITTED' || user.buyerProfile.status === 'UNDER_REVIEW'
                    ? t('Buying: application under review')
                    : t('Buying: your application needs attention')}
              </Text>
              <Text style={styles.payoutBody}>
                {!user.buyerProfile
                  ? t('Apply once, then switch between selling and buying.')
                  : t('Tap to see where it stands.')}
              </Text>
            </View>
            <IconChevR size={12} stroke={design.ink3} />
          </PressScale>
        </View>
      ) : null}

      {!hasPayout ? (
        <View style={p.pad}>
          <PressScale onPress={() => nav.navigate('EditProfile')} scaleTo={0.98} cardStyle={styles.payout}>
            <View style={styles.payoutIcon}><IconWallet size={18} stroke={colors.ember} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.payoutTitle}>{t('Add where you get paid')}</Text>
              <Text style={styles.payoutBody}>
                {t('A UPI id or bank account, so money from your sales has somewhere to go.')}
              </Text>
            </View>
          </PressScale>
        </View>
      ) : null}

      {/* Trade tools only: a shop has no offers or buyer demand. */}
      {!isShop ? (
        <>
          {/* ---- selling tools ---------------------------------------------------- */}
          <SectionTitle>{t('Selling')}</SectionTitle>
          <View style={p.pad}>
            <View style={p.group}>
              <MenuRow
                Icon={IconMarket}
                label={t('What buyers need')}
                hint={t('Fill an order at their price, or counter')}
                onPress={() => nav.navigate('Demand')}
              />
              <MenuRow
                Icon={IconShare}
                label={t('Your offers')}
                hint={t('What you have offered against buyer demand')}
                onPress={() => nav.navigate('MyOffers')}
              />
              <MenuRow
                Icon={IconAgent}
                label={t('Your AI helper')}
                hint={t('Answers offers for you')}
                onPress={() => nav.navigate('Helper')}
              />
              <MenuRow
                Icon={IconBell2}
                label={t('Activity')}
                hint={t('Offers, deals and payments')}
                onPress={() => nav.navigate('Notifications')}
                last
              />
            </View>
          </View>
        </>
      ) : null}

      {/* ---- the business ----------------------------------------------------- */}
      <SectionTitle>{t(words.placeSection)}</SectionTitle>
      <View style={p.pad}>
        <View style={p.group}>
          <View style={styles.facts}>
            {words.sizeLabel ? (
              <Fact label={words.sizeLabel} value={farm?.farmSizeAcres != null ? `${farm.farmSizeAcres} acres` : t('not set')} />
            ) : null}
            <Fact label="STATE" value={farm?.state ?? t('not set')} />
            {farm?.organicCertified ? <Fact label="CERTIFIED" value={t('Organic')} /> : null}
          </View>
          {farm?.cropsGrown?.length ? (
            <View style={styles.crops}>
              <Mono style={styles.cropsLabel}>{words.stockLabel}</Mono>
              <View style={styles.chips}>
                {farm.cropsGrown.map((c) => (
                  <View key={c} style={styles.chip}><Text style={styles.chipText}>{c}</Text></View>
                ))}
              </View>
            </View>
          ) : null}
          {isShop ? (
            <MenuRow
              Icon={IconBell2}
              label={t('Activity')}
              hint={t('Orders and payments')}
              onPress={() => nav.navigate('Notifications')}
            />
          ) : null}
          <MenuRow
            Icon={IconUser}
            label={t('Change your details')}
            hint={t('Name, phone, place and where you get paid')}
            onPress={() => nav.navigate('EditProfile')}
            last
          />
        </View>
      </View>

      {/* ---- language --------------------------------------------------------- */}
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

      {/* ---- help and the small print ----------------------------------------- */}
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

      {/* ---- leaving ---------------------------------------------------------- */}
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

  payout: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12,
    backgroundColor: 'rgba(200,96,43,0.07)', borderWidth: 1, borderColor: 'rgba(200,96,43,0.3)',
    borderRadius: 16, padding: 14,
  },
  payoutIcon: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(200,96,43,0.12)',
  },
  buyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12,
    backgroundColor: design.paper, borderWidth: 1, borderColor: design.line,
    borderRadius: 16, padding: 14,
  },
  buyIcon: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', backgroundColor: design.mint,
  },
  payoutTitle: { fontFamily: font.sansSemi, fontSize: 14.5, color: design.ink },
  payoutBody: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 17, color: design.ink2, marginTop: 2 },

  facts: { flexDirection: 'row', gap: 10, padding: 14, paddingBottom: 6 },
  fact: { flex: 1, minWidth: 0, backgroundColor: design.bg, borderRadius: 12, padding: 10 },
  factLabel: { fontSize: 8.5, letterSpacing: 0.6, color: design.ink3 },
  factValue: { fontFamily: font.sansSemi, fontSize: 14, color: design.ink, marginTop: 3 },
  crops: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 8, gap: 8 },
  cropsLabel: { fontSize: 9, letterSpacing: 0.7, color: design.ink3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: design.mint, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontFamily: font.sansMed, fontSize: 12, color: colors.forest },
});
