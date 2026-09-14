// =============================================================================
// JoinScreen — the Partner tab, and the door from shopping into trading
// =============================================================================
// EVERYONE ARRIVES AS A SHOPPER. Signing up gets a CONSUMER account and the
// shelf; selling and buying in bulk are applied for from here, and approval is
// what grants the role.
//
// THE CHOICE IS PASSED DOWN, NOT INFERRED. OnboardingScreen used to pick its
// form from user.role, which is CONSUMER for exactly the people filling it in,
// so every first-time applicant got the buyer form whichever card they tapped.
// CLAUDE.md section 4 records the web fixing the same bug, and it is the shape
// that keeps recurring: the role you are applying for cannot also be the thing
// that selects the form, or the entry requirement.
//
// ONCE AN APPLICATION IS ON FILE, THIS TAB REPORTS ON IT rather than offering
// the form again. An applicant is still a CONSUMER while they wait, so
// partnerApplication() reads the profile rather than the role to find it: see
// lib/partner for why those are two different questions.
//
// WHAT IT CLAIMS ABOUT MONEY IS WHAT THE CODE DOES. Joining is free, listing is
// free, and the platform takes a flat 2% only once a deal settles (CLAUDE.md
// §2). There is no signup charge anywhere in the codebase, so this page must
// not invent one, and it must not imply earnings it cannot promise either.
// =============================================================================

import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import OnboardingScreen, { type PartnerKind } from '../OnboardingScreen';
import type { SellerType } from '../../api/types';
import { COMPANY_LABEL, COMPANY_TYPES, type CompanyType } from '../../lib/sellerType';
import { Mono } from '../../components/buyerKit';
import { PressScale } from '../../components/motion';
import { IconArrow, IconArrowLeft, IconCheck, IconShield, IconSprout } from '../../components/icons';
import { useAuth } from '../../context/AuthContext';
import { PARTNER_STATUS_META, partnerApplication } from '../../lib/partner';
import { colors, design, font, radius, spacing } from '../../theme';

/** A short badge per buyer kind, so the cards scan without reading each body. */
const BUYER_BADGE: Record<CompanyType, string> = {
  RESTAURANT: 'FOOD SERVICE',
  SMALL_BUSINESS: 'SMALL',
  WHOLESALER: 'WHOLESALE',
  PROCESSOR: 'PROCESSING',
  FMCG: 'FMCG',
  EXPORTER: 'EXPORT',
  RETAILER: 'RETAIL',
};

/** What each kind actually does, in the words they would use. */
const BUYER_BLURB: Record<CompanyType, string> = {
  RESTAURANT: 'Restaurants, cafés, cloud kitchens. Regular produce for a kitchen.',
  SMALL_BUSINESS: 'Sweet shops, tiffin services, caterers. Smaller recurring volumes.',
  WHOLESALER: 'Buying lots and redistributing them to other traders or shops.',
  PROCESSOR: 'Mills, packers and food manufacturers buying raw crop.',
  FMCG: 'Packaged-goods companies sourcing ingredients at volume.',
  EXPORTER: 'Buying for shipment abroad, usually against a contract.',
  RETAILER: 'Retail chains and supermarkets stocking shelves.',
};

export default function JoinScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [kind, setKind] = useState<PartnerKind | null>(null);
  // WHICH KIND OF SELLER, asked before the form rather than assumed.
  //
  // Tapping "I sell" used to go straight to a farm application: acreage, crops
  // grown, FPO affiliation. A kirana store owner was asked how many acres they
  // farm, and whatever they typed was filed as sellerType FARMER, because the
  // app never sent one and the column defaults to it. The server has always
  // had three kinds with different required fields (auth.service
  // `validateSellerApplication`); only the app pretended there was one.
  const [sellerType, setSellerType] = useState<SellerType | null>(null);
  // Buyers get the same treatment as sellers: which kind, before the form.
  // Seven of them, and the form no longer asks again once it is chosen.
  const [companyType, setCompanyType] = useState<CompanyType | null>(null);

  const application = partnerApplication(user);
  // A reviewer sending a shop back for more should not make them re-declare
  // that they are a shop. Their existing type seeds the picker, so the resubmit
  // button lands straight on the right form.
  const existingType = user?.farmerProfile?.sellerType ?? null;

  // Once they have chosen, this screen gets out of the way entirely. A seller
  // is not done choosing until the KIND is picked too.
  // Back goes to the step BEFORE this one, not always to the top: a seller
  // returns to the three kinds they just chose from, a buyer to the two doors.
  if (kind === 'BUYER' && companyType) {
    return (
      <OnboardingScreen
        kind="BUYER"
        companyType={companyType}
        onBack={() => setCompanyType(null)}
      />
    );
  }
  if (kind === 'FARMER' && sellerType) {
    return (
      <OnboardingScreen
        kind="FARMER"
        sellerType={sellerType}
        onBack={() => setSellerType(null)}
      />
    );
  }

  if (kind === 'BUYER') {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.pad, { paddingTop: insets.top + spacing.xl, paddingBottom: spacing.xxl * 2 }]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={() => setKind(null)}
          hitSlop={12}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <IconArrowLeft size={19} stroke={colors.forest} />
          <Text style={styles.backText}>{t('Back')}</Text>
        </Pressable>

        <Text style={styles.title}>{t('What kind of business?')}</Text>
        <Text style={styles.copy}>
          {t('This is what a reviewer reads first, and it decides which growers your agent looks for.')}
        </Text>

        {/* All seven the server accepts, the three most common first. The form
            used to offer five of them and miss WHOLESALER and SMALL_BUSINESS
            entirely, so two real kinds of buyer had to claim to be something
            they were not. */}
        {COMPANY_TYPES.map((c) => (
          <Card
            key={c}
            badge={BUYER_BADGE[c]}
            title={COMPANY_LABEL[c]}
            body={BUYER_BLURB[c]}
            onPress={() => setCompanyType(c)}
          />
        ))}
      </ScrollView>
    );
  }

  if (kind === 'FARMER') {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.pad, { paddingTop: insets.top + spacing.xl }]}
      >
        <Pressable
          onPress={() => setKind(null)}
          hitSlop={12}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <IconArrowLeft size={19} stroke={colors.forest} />
          <Text style={styles.backText}>{t('Back')}</Text>
        </Pressable>

        <Text style={styles.title}>{t('Which of these are you?')}</Text>
        <Text style={styles.copy}>
          {t('They are reviewed differently and the form asks for different things, so this decides what we need from you.')}
        </Text>

        <Card
          badge={t('FARM')}
          title={t('I grow it myself')}
          body={t('A farm selling its own harvest. We will ask for your acreage and what you grow.')}
          onPress={() => setSellerType('FARMER')}
        />
        <Card
          badge={t('SHOP')}
          title={t('I run a local shop')}
          body={t('A kirana, vegetable or general store selling to households nearby. We will ask for your shop address and FSSAI licence.')}
          onPress={() => setSellerType('LOCAL_SHOP')}
        />
        <Card
          badge={t('WHOLESALE')}
          title={t('I trade in bulk')}
          body={t('Buying lots and redistributing them. We will ask for your firm name and GSTIN.')}
          onPress={() => setSellerType('WHOLESALER')}
        />
      </ScrollView>
    );
  }

  // ---- Already applied -----------------------------------------------------
  // The status, not the form. Offering a blank application to somebody who sent
  // one last week reads as the first one having been lost.
  if (application) {
    const meta = PARTNER_STATUS_META[application.status];
    const resubmit = application.status === 'NEEDS_INFO' || application.status === 'REJECTED';
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.pad, { paddingTop: insets.top + spacing.xl }]}
      >
        <View style={[styles.hero, { borderColor: meta.color }]}>
          <View style={styles.heroTop}>
            <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
            <Mono style={styles.heroEyebrow}>{t('YOUR APPLICATION')}</Mono>
          </View>
          <Text style={styles.heroTitle}>{t(meta.label)}</Text>
          <Text style={styles.heroBody}>
            {application.kind === 'SELLER'
              ? t('You applied to sell on CropBid.')
              : t('You applied to buy in bulk on CropBid.')}
            {' '}
            {resubmit
              ? t('A reviewer needs more from you before this can go ahead.')
              : t('An admin reads every application, usually within 24 to 48 hours. Keep shopping in the meantime.')}
          </Text>
        </View>

        {/* A reviewer's own words, when they left any. More useful than any
            status label, so it gets its own block rather than a footnote. */}
        {application.note ? (
          <View style={styles.note}>
            <Mono style={styles.noteLabel}>{t('FROM THE REVIEWER')}</Mono>
            <Text style={styles.noteText}>{application.note}</Text>
          </View>
        ) : null}

        {resubmit ? (
          <PressScale
            onPress={() => {
              if (application.kind === 'SELLER') setSellerType(existingType ?? 'FARMER');
              else setCompanyType((user?.buyerProfile?.companyType as CompanyType) ?? 'RESTAURANT');
              setKind(application.kind === 'SELLER' ? 'FARMER' : 'BUYER');
            }}
            scaleTo={0.98}
            cardStyle={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>{t('Update your application')}</Text>
          </PressScale>
        ) : null}
      </ScrollView>
    );
  }

  // ---- Not applied ---------------------------------------------------------
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.pad, { paddingTop: insets.top + spacing.xl, paddingBottom: spacing.xxl * 2 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* The offer, said first and said plainly. Free is the fact most likely
          to change somebody's mind, and burying it under a form would waste it. */}
      <View style={styles.pitch}>
        <View style={styles.pitchIcon}>
          <IconSprout size={20} stroke={colors.sage2} />
        </View>
        <Mono style={styles.pitchTag}>{t('FREE TO JOIN')}</Mono>
        <Text style={styles.pitchTitle}>
          {t('Sell to a city,')}{'\n'}
          <Text style={styles.pitchTitleAccent}>{t('not to a middleman.')}</Text>
        </Text>
        <Text style={styles.pitchBody}>
          {t('Onboarding costs nothing. No joining fee, no listing fee, no monthly charge. We take a flat 2% only when a deal actually settles.')}
        </Text>
      </View>

      <View style={styles.perks}>
        <Perk text={t('List in two minutes, from the field')} />
        <Perk text={t('Priced against today\'s live mandi rates')} />
        <Perk text={t('Money held in escrow until delivery is confirmed')} />
        <Perk text={t('We book and pay for the freight')} />
      </View>

      <Mono style={styles.pick}>{t('WHICH ONE ARE YOU?')}</Mono>

      <Card
        badge={t('SELLER')}
        title={t('I grow or stock produce')}
        body={t('A farm, a local shop or a wholesaler. We will ask which on the next screen, because each is reviewed differently.')}
        onPress={() => setKind('FARMER')}
      />
      <Card
        badge={t('BUYER')}
        title={t('I buy for my business')}
        body={t('A restaurant, a shop, a processor or a trading firm. Register and you can bid on lots, run auctions, or post what you need and let farmers come to you.')}
        onPress={() => setKind('BUYER')}
      />

      <View style={styles.reviewNote}>
        <IconShield size={14} stroke={design.ink3} />
        <Text style={styles.reviewText}>
          {t('An admin reviews every application before you can trade. It usually takes 24 to 48 hours.')}
        </Text>
      </View>

      {/* Said before they fill anything in, because it is the surprise in this
          flow: approval REPLACES the shopper account rather than adding to it.
          See CLAUDE.md section 4 — roles are exclusive on the server, and
          stacking them is a refactor nobody has decided on. */}
      <View style={styles.aside}>
        <Text style={styles.asideTitle}>{t('One thing to know')}</Text>
        <Text style={styles.asideBody}>
          {t('An approved seller or buyer account cannot also use the basket. If somebody in your household shops here, keep their account separate from this one.')}
        </Text>
      </View>
    </ScrollView>
  );
}

function Perk({ text }: { text: string }) {
  return (
    <View style={styles.perk}>
      <View style={styles.perkTick}>
        <IconCheck size={11} sw={2.6} stroke={colors.sage} />
      </View>
      <Text style={styles.perkText}>{text}</Text>
    </View>
  );
}

function Card({
  badge,
  title,
  body,
  onPress,
}: {
  badge: string;
  title: string;
  body: string;
  onPress: () => void;
}) {
  return (
    <PressScale onPress={onPress} scaleTo={0.98} cardStyle={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.cardBadge}>
          <Mono style={styles.cardBadgeText}>{badge}</Mono>
        </View>
        <IconArrow size={14} stroke={colors.forest} />
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: design.bg },
  pad: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },

  // --- Pitch ---
  pitch: {
    backgroundColor: colors.forest,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  pitchIcon: {
    width: 40, height: 40, borderRadius: radius.pill,
    backgroundColor: 'rgba(155,201,122,0.16)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  pitchTag: { fontSize: 9, letterSpacing: 1.2, color: colors.sage2 },
  pitchTitle: {
    fontFamily: font.sansBold, fontSize: 26, lineHeight: 31,
    color: colors.surface, letterSpacing: -0.6, marginTop: 5,
  },
  pitchTitleAccent: { fontFamily: font.serifItalic, fontSize: 29, color: colors.sage2 },
  pitchBody: {
    fontFamily: font.sans, fontSize: 13.5, lineHeight: 20,
    color: 'rgba(244,241,234,0.72)', marginTop: spacing.md,
  },

  // --- Perks ---
  perks: { marginTop: spacing.lg, gap: 9 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  perkTick: {
    width: 19, height: 19, borderRadius: radius.pill,
    backgroundColor: design.mint,
    alignItems: 'center', justifyContent: 'center',
  },
  perkText: { flex: 1, fontFamily: font.sans, fontSize: 13.5, color: design.ink2 },

  pick: { fontSize: 10, letterSpacing: 1.2, color: design.ink3, marginTop: spacing.xxl },

  // --- Role cards ---
  card: {
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardBadge: {
    backgroundColor: design.mint,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  cardBadgeText: { fontSize: 9, letterSpacing: 0.8, color: colors.forest },
  cardTitle: { fontFamily: font.sansSemi, fontSize: 18, color: design.ink, marginTop: spacing.sm },
  cardBody: { fontFamily: font.sans, fontSize: 13, lineHeight: 20, color: design.ink3, marginTop: 5 },

  back: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.xs, marginBottom: spacing.sm, alignSelf: 'flex-start' },
  title: { fontFamily: font.sansBold, fontSize: 27, color: design.ink, letterSpacing: -0.5 },
  copy: { fontFamily: font.sans, fontSize: 14.5, lineHeight: 22, color: design.ink2, marginTop: spacing.sm },
  backText: { fontFamily: font.sansMed, fontSize: 14, color: colors.forest },
  reviewNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    marginTop: spacing.lg,
  },
  reviewText: { flex: 1, fontFamily: font.sans, fontSize: 12.5, lineHeight: 18, color: design.ink3 },

  // --- Status (already applied) ---
  hero: {
    backgroundColor: design.paper,
    borderWidth: 1.5,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusDot: { width: 9, height: 9, borderRadius: 999 },
  heroEyebrow: { fontSize: 9, letterSpacing: 1.2, color: design.ink3 },
  heroTitle: { fontFamily: font.sansBold, fontSize: 27, color: design.ink, letterSpacing: -0.5, marginTop: 5 },
  heroBody: { fontFamily: font.sans, fontSize: 14, lineHeight: 21, color: design.ink2, marginTop: spacing.sm },

  note: {
    borderLeftWidth: 3,
    borderLeftColor: colors.ember,
    paddingLeft: spacing.md,
    marginTop: spacing.lg,
  },
  noteLabel: { fontSize: 9, letterSpacing: 0.8, color: design.ink3 },
  noteText: { fontFamily: font.sans, fontSize: 14, lineHeight: 21, color: design.ink2, marginTop: 3 },

  primaryBtn: {
    backgroundColor: colors.forest,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  primaryBtnText: { fontFamily: font.sansSemi, fontSize: 16, color: colors.surface },

  aside: {
    marginTop: spacing.xxl,
    borderLeftWidth: 3,
    borderLeftColor: colors.wheat,
    paddingLeft: spacing.md,
  },
  asideTitle: { fontFamily: font.sansSemi, fontSize: 14, color: design.ink },
  asideBody: { fontFamily: font.sans, fontSize: 13, lineHeight: 20, color: design.ink3, marginTop: 4 },
});
