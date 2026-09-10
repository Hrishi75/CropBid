// =============================================================================
// JoinScreen — the door into the business app
// =============================================================================
// CropBid is for people who grow and people who buy in bulk. A signed-in
// account that is neither yet is a PROSPECTIVE PARTNER, and this is what they
// see: pick which one you are, then fill in the form.
//
// It used to be a shopping tab bar. Households now have their own app
// (cropbid-daily/), so the business app no longer carries a retail surface at
// all, and a CONSUMER account here means one thing only: somebody on their way
// to selling or buying.
//
// THE CHOICE IS PASSED DOWN, NOT INFERRED. OnboardingScreen used to pick its
// form from user.role, which is empty for exactly the people filling it in, so
// every first-time applicant got the buyer form whichever card they tapped.
// CLAUDE.md section 4 records the web fixing the same bug: the role you are
// applying for cannot also be the entry requirement.
// =============================================================================

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import OnboardingScreen, { type PartnerKind } from '../OnboardingScreen';
import { colors, design, font, radius, spacing } from '../../theme';

export default function JoinScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [kind, setKind] = useState<PartnerKind | null>(null);

  // Once they have chosen, this screen gets out of the way entirely.
  if (kind) return <OnboardingScreen kind={kind} />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.pad, { paddingTop: insets.top + spacing.xxl }]}
    >
      <Text style={styles.wordmark}>CropBid</Text>

      <Text style={styles.title}>{t('What do you do?')}</Text>
      <Text style={styles.copy}>
        {t('CropBid is for growing and for buying in bulk. Pick one and we will take you through it. An admin reviews every application before you can trade.')}
      </Text>

      <Card
        title={t('I grow and want to sell')}
        body={t('Farmers, local shops and wholesalers. List a lot, take bids, or fill what a buyer has asked for.')}
        onPress={() => setKind('FARMER')}
      />
      <Card
        title={t('I buy in bulk')}
        body={t('Processors, exporters, retailers, restaurants. Bid on lots, run auctions, or post what you need.')}
        onPress={() => setKind('BUYER')}
      />

      {/* Said plainly, because somebody who wanted groceries will land here and
          should be sent to the right place rather than left to work it out. */}
      <View style={styles.aside}>
        <Text style={styles.asideTitle}>{t('Just want to buy vegetables?')}</Text>
        <Text style={styles.asideBody}>
          {t('This app is for trade. Households shop on CropBid Daily, where you buy by the kilo from a shop near you.')}
        </Text>
      </View>

      {user ? (
        <Pressable onPress={() => void signOut()} style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]}>
          <Text style={styles.signOutText}>{t('Sign out')}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function Card({ title, body, onPress }: { title: string; body: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: design.bg },
  pad: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  wordmark: { fontFamily: font.sansBold, fontSize: 19, color: design.ink, letterSpacing: -0.3 },
  title: { fontFamily: font.sansBold, fontSize: 28, color: design.ink, marginTop: spacing.xxl, letterSpacing: -0.5 },
  copy: { fontFamily: font.sans, fontSize: 15, lineHeight: 23, color: design.ink2, marginTop: spacing.sm },

  card: {
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  cardTitle: { fontFamily: font.sansSemi, fontSize: 17, color: design.ink },
  cardBody: { fontFamily: font.sans, fontSize: 13, lineHeight: 20, color: design.ink3, marginTop: 6 },

  aside: {
    marginTop: spacing.xxl,
    borderLeftWidth: 3,
    borderLeftColor: colors.wheat,
    paddingLeft: spacing.md,
  },
  asideTitle: { fontFamily: font.sansSemi, fontSize: 14, color: design.ink },
  asideBody: { fontFamily: font.sans, fontSize: 13, lineHeight: 20, color: design.ink3, marginTop: 4 },

  signOut: { marginTop: spacing.xxl, alignItems: 'center', paddingVertical: spacing.md },
  signOutText: { fontFamily: font.sansMed, fontSize: 15, color: colors.ember },
});
