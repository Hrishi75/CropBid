// =============================================================================
// AboutScreen — what CropBid is
// =============================================================================
// Written from CLAUDE.md §1 and §2, which is the product's own description of
// itself, so this page and the repo cannot tell two different stories.
//
// EVERY CLAIM HERE IS TRUE OF THE CODE TODAY, which is the same standard
// CLAUDE.md §5 sets for the public policy pages, and for the same reason: an
// About page is where a company is most tempted to describe the product it
// intends to be. So it says two cities rather than "across India", it says the
// fee is 2% on a settled deal rather than "low fees", and it does not claim
// instant payouts, because settlement is still a manual bank transfer (§6).
//
// It also says the company is not incorporated yet, because it is not, and a
// shopper handing over money is entitled to know who they are dealing with.
// When incorporation lands, TermsPage's OPERATOR constant gets filled in and
// this line should be updated in the same change.
// =============================================================================

import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Mono } from '../../components/buyerKit';
import { Wordmark } from '../../components/marks';
import { SUPPORT_EMAIL } from './HelpScreen';
import { colors, design, font, radius, spacing } from '../../theme';

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
    >
      <View style={styles.hero}>
        <Wordmark size={22} color={colors.surface} accent={colors.sage2} />
        <Text style={styles.tagline}>
          {t('One harvest,')}{'\n'}
          <Text style={styles.taglineAccent}>{t('two markets.')}</Text>
        </Text>
      </View>

      <View style={styles.pad}>
        <Text style={styles.body}>
          {t('CropBid connects Indian farmers directly with the people who buy from them. The same listing can go two ways: to a processor or exporter buying a whole lot, or to a household buying a kilo.')}
        </Text>

        <Block
          label={t('THE PRICE IS PUBLIC')}
          text={t('Every listing is anchored to the day\'s government mandi rate, pulled from AGMARKNET across 4,600+ markets. Both sides negotiate against the same reference number, so nobody is guessing what a crop is worth.')}
        />
        <Block
          label={t('THE MONEY IS HELD')}
          text={t('Payment is captured into escrow when an order is placed and released to the seller after delivery is confirmed. The buyer is not paying a stranger up front, and the seller is not shipping on a promise.')}
        />
        <Block
          label={t('WHAT WE CHARGE')}
          text={t('A flat 2% when a deal settles. Accounts, listings and mandi rates are free. Freight is arranged by us and paid by the seller, charged separately.')}
        />
        <Block
          label={t('WHERE WE DELIVER')}
          text={t('Household delivery runs in Pune and Nagpur. Wholesale lots travel nationally, because a lot can be freighted and a few kilos cannot.')}
        />

        <View style={styles.note}>
          <Mono style={styles.noteLabel}>{t('ABOUT THE COMPANY')}</Mono>
          <Text style={styles.noteText}>
            {t('CropBid is not yet an incorporated company. Registration is in progress, and until it completes the terms name no registered entity, because naming one that does not exist would be worse than saying so. We operate from Pune, Maharashtra, under Indian law.')}
          </Text>
        </View>

        <Text
          style={styles.contact}
          onPress={() => { void Linking.openURL(`mailto:${SUPPORT_EMAIL}`); }}
        >
          {SUPPORT_EMAIL}
        </Text>
      </View>
    </ScrollView>
  );
}

function Block({ label, text }: { label: string; text: string }) {
  return (
    <View style={styles.block}>
      <Mono style={styles.blockLabel}>{label}</Mono>
      <Text style={styles.blockText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: design.bg },

  hero: {
    backgroundColor: colors.forest,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  tagline: {
    fontFamily: font.sansBold, fontSize: 27, lineHeight: 33,
    color: colors.surface, letterSpacing: -0.6, marginTop: spacing.lg,
  },
  taglineAccent: { fontFamily: font.serifItalic, fontSize: 30, color: colors.sage2 },

  pad: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  body: { fontFamily: font.sans, fontSize: 15, lineHeight: 23, color: design.ink2 },

  block: { marginTop: spacing.xl },
  blockLabel: { fontSize: 9.5, letterSpacing: 1.2, color: colors.sage },
  blockText: { fontFamily: font.sans, fontSize: 14, lineHeight: 21, color: design.ink2, marginTop: 5 },

  note: {
    marginTop: spacing.xxl,
    borderLeftWidth: 3, borderLeftColor: colors.wheat,
    paddingLeft: spacing.md,
  },
  noteLabel: { fontSize: 9, letterSpacing: 0.8, color: design.ink3 },
  noteText: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 20, color: design.ink3, marginTop: 4 },

  contact: {
    fontFamily: font.sansMed, fontSize: 14, color: colors.forest,
    textDecorationLine: 'underline', marginTop: spacing.xl,
  },
});
