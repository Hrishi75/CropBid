// =============================================================================
// PartnerStatusScreen — where an unapproved partner lives
// =============================================================================
// Selling on CropBid is applied for, not signed up for. The application is
// filed at onboarding and the account sits here until an admin approves it —
// the same wait the web shows at /partner/status, and the same one the server
// enforces at every gated route (requireApprovedPartner). Without this screen a
// new farmer would land in a dashboard where listing a crop, reading offers and
// answering a bid all come back 403 with nothing explaining why.
//
// One job per status:
//   SUBMITTED / UNDER_REVIEW — reassure: received, here's what happens next
//   NEEDS_INFO — show the reviewer's note and hand them the edit button
//   REJECTED   — show why, offer resubmission
//   SUSPENDED  — point at support; no self-service way back on purpose
//
// APPROVED never reaches here: RootNavigator swaps to the real app the moment
// the refreshed user says so, which is why the pull-to-refresh at the top of
// this screen is the one action that matters most.
// =============================================================================

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mono } from '../../components/buyerKit';
import { PressScale } from '../../components/motion';
import { Wordmark } from '../../components/marks';
import { useAuth } from '../../context/AuthContext';
import { PARTNER_STATUS_META, partnerApplication } from '../../lib/partner';
import type { PartnerStatus } from '../../api/types';
import { colors, design, font } from '../../theme';

// The three review stages, as a timeline. Which dot is lit depends on status.
function Timeline({ status }: { status: PartnerStatus }) {
  const stages = [
    { key: 'submitted', label: 'Submitted', done: true },
    { key: 'review', label: 'Under review', done: status !== 'SUBMITTED' },
    { key: 'decision', label: 'Decision', done: status === 'APPROVED' || status === 'REJECTED' },
  ];
  return (
    <View style={styles.timeline}>
      {stages.map((s, i) => (
        <View key={s.key} style={[styles.stage, i < stages.length - 1 && styles.stageGrow]}>
          <View style={styles.stageCol}>
            <View style={[styles.dot, s.done && styles.dotOn]} />
            <Mono style={[styles.stageLabel, s.done && styles.stageLabelOn]}>{s.label}</Mono>
          </View>
          {i < stages.length - 1 ? (
            <View style={[styles.rail, s.done && styles.railOn]} />
          ) : null}
        </View>
      ))}
    </View>
  );
}

export default function PartnerStatusScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user, refreshUser, signOut } = useAuth();
  const app = partnerApplication(user);
  const [refreshing, setRefreshing] = useState(false);

  const recheck = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshUser();
    } catch {
      // Offline, or the session is on its way out. The screen it would swap to
      // is the one already on display, so there is nothing to report.
    } finally {
      setRefreshing(false);
    }
  }, [refreshUser]);

  // Approval can land while this screen is open (an admin clicks, the applicant
  // waits). One refetch on mount keeps the common path — "the email said
  // approved, I opened the app" — from showing a stale WAITING screen.
  useEffect(() => { void recheck(); }, [recheck]);

  if (!user || !app) return null;

  const meta = PARTNER_STATUS_META[app.status];
  const editable = app.status === 'NEEDS_INFO' || app.status === 'REJECTED';
  const waiting = app.status === 'SUBMITTED' || app.status === 'UNDER_REVIEW';

  const heading =
    app.status === 'NEEDS_INFO' ? 'One more thing from you.'
    : app.status === 'REJECTED' ? 'Not this time — but not the end.'
    : app.status === 'SUSPENDED' ? 'Account suspended.'
    : "Application received. We're on it.";

  const body =
    app.status === 'NEEDS_INFO'
      ? 'A reviewer looked at your application and needs a little more before approving it. The note below says exactly what.'
      : app.status === 'REJECTED'
        ? "We couldn't approve the application as submitted. The note below says why — fix it and resubmit whenever you're ready."
        : app.status === 'SUSPENDED'
          ? 'An administrator has suspended your partner account. If you believe this is a mistake, contact support and we will look into it.'
          : 'Our team reviews every application by hand — usually within 24 to 48 hours. We will notify you here and by email the moment there is a decision.';

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={recheck} tintColor={colors.forest} />
        }
      >
        <View style={styles.brandRow}>
          <Wordmark />
          <Text style={styles.who} numberOfLines={1}>{user.name}</Text>
        </View>

        <View style={styles.statusRow}>
          <Mono style={styles.eyebrow}>
            {app.kind === 'SELLER' ? 'SELLER APPLICATION' : 'BUYER APPLICATION'} ·
          </Mono>
          <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
          <Mono style={[styles.statusLabel, { color: meta.color }]}>{meta.label.toUpperCase()}</Mono>
        </View>

        <Text style={styles.title}>{heading}</Text>
        <Text style={styles.lede}>{body}</Text>

        {app.status !== 'SUSPENDED' ? <Timeline status={app.status} /> : null}

        {app.note && app.status !== 'SUBMITTED' && app.status !== 'UNDER_REVIEW' ? (
          <View style={[styles.noteCard, { borderLeftColor: meta.color }]}>
            <Mono style={styles.noteEyebrow}>FROM THE REVIEWER</Mono>
            <Text style={styles.noteText}>{app.note}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          {editable ? (
            <PressScale onPress={() => nav.navigate('Application')} cardStyle={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>
                {app.status === 'REJECTED' ? 'Edit & resubmit' : 'Update application'}
              </Text>
            </PressScale>
          ) : null}

          <PressScale onPress={recheck} cardStyle={styles.ghostBtn}>
            <Text style={styles.ghostBtnText}>
              {refreshing ? 'Checking…' : 'Check for a decision'}
            </Text>
          </PressScale>
        </View>

        {waiting ? (
          <Text style={styles.hint}>
            While you wait, today's mandi rates, the Sarkari Yojana hub and the equipment
            catalogue are open to you. Your dashboard unlocks on approval.
          </Text>
        ) : null}

        <View style={styles.linkRow}>
          <PressScale onPress={() => nav.navigate('Rates')} cardStyle={styles.linkChip}>
            <Text style={styles.linkChipText}>Mandi rates</Text>
          </PressScale>
          <PressScale onPress={() => nav.navigate('Schemes')} cardStyle={styles.linkChip}>
            <Text style={styles.linkChipText}>Sarkari Yojana</Text>
          </PressScale>
          <PressScale onPress={() => nav.navigate('Equipment')} cardStyle={styles.linkChip}>
            <Text style={styles.linkChipText}>Equipment</Text>
          </PressScale>
        </View>

        <PressScale
          onPress={() =>
            Alert.alert('Sign out?', 'Your application stays exactly where it is.', [
              { text: 'Stay', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: () => { void signOut(); } },
            ])
          }
          cardStyle={styles.signOut}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </PressScale>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  body: { paddingHorizontal: 22, gap: 0 },

  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  who: { fontFamily: font.sansMed, fontSize: 12.5, color: design.ink3, flexShrink: 1 },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 34 },
  eyebrow: { fontSize: 10, letterSpacing: 0.8, color: design.ink3 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusLabel: { fontSize: 10, letterSpacing: 0.8 },

  title: {
    fontFamily: font.serif,
    fontSize: 34,
    lineHeight: 39,
    letterSpacing: -0.6,
    color: design.ink,
    marginTop: 12,
  },
  lede: { fontFamily: font.sans, fontSize: 15, lineHeight: 23, color: design.ink2, marginTop: 14 },

  timeline: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 30, marginBottom: 8 },
  stage: { flexDirection: 'row', alignItems: 'center' },
  stageGrow: { flex: 1 },
  stageCol: { alignItems: 'center', gap: 7, width: 78 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: design.line },
  dotOn: { backgroundColor: colors.sage, borderColor: colors.sage },
  stageLabel: { fontSize: 9.5, letterSpacing: 0.4, color: design.ink3 },
  stageLabelOn: { color: design.ink },
  rail: { flex: 1, height: 1, backgroundColor: design.line, marginBottom: 20, marginHorizontal: 4 },
  railOn: { backgroundColor: colors.sage },

  noteCard: {
    backgroundColor: design.paper,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: design.line,
    borderLeftWidth: 3,
    padding: 16,
    marginTop: 22,
  },
  noteEyebrow: { fontSize: 10, letterSpacing: 0.7, color: design.ink3, marginBottom: 7 },
  noteText: { fontFamily: font.sans, fontSize: 14, lineHeight: 21, color: design.ink2 },

  actions: { gap: 10, marginTop: 26 },
  primaryBtn: { backgroundColor: colors.forest, borderRadius: 13, paddingVertical: 15, alignItems: 'center' },
  primaryBtnText: { fontFamily: font.sansBold, fontSize: 15, color: colors.textInverse },
  ghostBtn: {
    borderWidth: 1.4,
    borderColor: colors.forest,
    borderRadius: 13,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ghostBtnText: { fontFamily: font.sansBold, fontSize: 14.5, color: colors.forest },

  hint: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 19, color: design.ink3, marginTop: 26 },

  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  linkChip: {
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  linkChipText: { fontFamily: font.sansMed, fontSize: 12.5, color: design.ink2 },

  signOut: { alignSelf: 'flex-start', paddingVertical: 14, marginTop: 22 },
  signOutText: { fontFamily: font.sansSemi, fontSize: 13.5, color: colors.ember },
});
