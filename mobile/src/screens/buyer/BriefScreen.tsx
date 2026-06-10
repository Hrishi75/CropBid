// Buyer app · Agent brief — wired to /agent/config. Shows the user's real
// guardrails (price cap, auto-accept, distance), preferred crops, and a live
// deploy/pause toggle hitting POST /agent/toggle.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconBolt, IconCheck } from '../../components/icons';
import { Eyebrow, Mono, StatusPill } from '../../components/buyerKit';
import { colors, design, font } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { getAgentConfig, toggleAgent } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import type { AgentConfig } from '../../api/types';
import { money } from '../../lib/format';

function GuardRow({ label, val, bar, hot }: { label: string; val: string; bar: number; hot?: boolean }) {
  const accent = hot ? colors.ember : colors.forest;
  const clamped = Math.min(Math.max(bar, 0.02), 0.98);
  return (
    <View style={{ paddingVertical: 13 }}>
      <View style={styles.guardHead}>
        <Mono style={styles.guardLabel}>{label}</Mono>
        <Mono style={[styles.guardVal, { color: hot ? colors.ember : design.ink }]}>{val}</Mono>
      </View>
      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${clamped * 100}%`, backgroundColor: accent }]} />
        <View style={[styles.knob, { left: `${clamped * 100}%`, borderColor: accent }]} />
      </View>
    </View>
  );
}

export default function BriefScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const currency = user?.currency || 'INR';

  const load = useCallback(async () => {
    try {
      setConfig(await getAgentConfig());
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not load your agent'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function onToggle() {
    if (busy) return;
    setBusy(true);
    try {
      setConfig(await toggleAgent());
    } catch (e) {
      setError(errorMessage(e, 'Could not update your agent'));
    } finally {
      setBusy(false);
    }
  }

  if (!config && !error) {
    return (
      <View style={[styles.flex, { justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.forest} />
      </View>
    );
  }

  const maxPrice = config?.maxPrice ?? null;
  const autoAccept = config?.autoAcceptThreshold ?? null;
  const distance = config?.maxDistanceKm ?? null;
  const crops = config?.preferredCrops ?? [];

  const briefText = maxPrice != null
    ? (
      <>
        Buy{' '}
        <Text style={styles.b}>{crops.length > 0 ? crops.join(', ') : 'any matching crop'}</Text>
        {' '}within my quality requirements. Don't pay over <Text style={styles.b}>{money(maxPrice, currency)}</Text> per unit.
        {autoAccept != null ? <> Auto-accept anything at or below <Text style={styles.b}>{money(autoAccept, currency)}</Text>.</> : null}
      </>
    )
    : (
      <>No price ceiling set yet. Set a max price on the web dashboard (Agent settings) so your agent knows its walk-away point.</>
    );

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 2, paddingBottom: 96 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        <View style={styles.titlePad}>
          <View style={styles.titleRow}>
            <Eyebrow>Your buyer agent</Eyebrow>
            {config ? (
              <StatusPill tone={config.active ? 'sage' : 'paper'} dot={config.active}>
                {config.active ? 'deployed' : 'paused'}
              </StatusPill>
            ) : null}
          </View>
          <Text style={styles.h1}>
            Briefed in <Text style={styles.h1Serif}>plain English.</Text>
          </Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* brief card */}
        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          <View style={styles.card}>
            <Mono style={styles.briefTag}>● BRIEF · {config?.negotiationStyle ?? 'BALANCED'}</Mono>
            <Text style={styles.briefBody}>{briefText}</Text>
          </View>
        </View>

        {/* guardrails */}
        <View style={[styles.sectionHead, { paddingTop: 20 }]}>
          <Eyebrow>Guardrails · hard stop</Eyebrow>
          <Mono style={styles.noOverride}>no override</Mono>
        </View>
        <View style={{ paddingHorizontal: 16 }}>
          <View style={styles.guardCard}>
            <GuardRow
              label="PRICE CEILING"
              val={maxPrice != null ? `${money(maxPrice, currency)} /unit` : 'not set'}
              bar={maxPrice != null ? 0.9 : 0}
              hot
            />
            <View style={styles.divider} />
            <GuardRow
              label="AUTO-ACCEPT AT"
              val={autoAccept != null ? `${money(autoAccept, currency)} /unit` : 'not set'}
              bar={autoAccept != null && maxPrice ? autoAccept / maxPrice : 0}
            />
            <View style={styles.divider} />
            <GuardRow
              label="MAX DISTANCE"
              val={distance != null ? `${distance} km` : 'anywhere'}
              bar={distance != null ? Math.min(distance / 1000, 1) : 0.98}
            />
            <View style={styles.divider} />
            <GuardRow
              label="AUTO-NEGOTIATE"
              val={config?.autoNegotiate ? 'on' : 'off'}
              bar={config?.autoNegotiate ? 0.98 : 0.02}
              hot={!config?.autoNegotiate}
            />
          </View>
        </View>

        {/* preferred crops */}
        <View style={[styles.sectionHead, { paddingTop: 20 }]}>
          <Eyebrow>Preferred crops</Eyebrow>
        </View>
        <View style={styles.chipWrap}>
          {crops.length > 0 ? (
            crops.map((t) => (
              <View key={t} style={[styles.cpChip, styles.cpChipIdle]}>
                <IconCheck size={13} sw={2.4} stroke={colors.sage} />
                <Text style={[styles.cpText, { color: design.ink2 }]}>{t}</Text>
              </View>
            ))
          ) : (
            <View style={[styles.cpChip, styles.cpChipIdle]}>
              <Text style={[styles.cpText, { color: design.ink3 }]}>Any crop · set preferences on the web</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* deploy bar */}
      <View style={styles.bottomBar}>
        <View style={{ paddingHorizontal: 16 }}>
          <Pressable
            onPress={onToggle}
            disabled={busy || !config}
            style={({ pressed }) => [
              styles.deployBtn,
              config?.active && styles.pauseBtn,
              (pressed || busy) && { opacity: 0.85 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#f4f1ea" size="small" />
            ) : (
              <>
                <IconBolt size={17} fill="#f4f1ea" stroke="none" />
                <Text style={styles.deployText}> {config?.active ? 'Pause agent' : 'Deploy agent'}</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  titlePad: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { marginTop: 8, fontFamily: font.sansMed, fontSize: 27, letterSpacing: -0.7, color: design.ink },
  h1Serif: { fontFamily: font.serifItalic, fontSize: 30, color: colors.forest },

  errorText: { fontFamily: font.sans, fontSize: 13, color: colors.ember, paddingHorizontal: 20, paddingTop: 8 },

  card: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, padding: 16 },
  briefTag: { fontSize: 10.5, color: colors.sage, letterSpacing: 0.8 },
  briefBody: { marginTop: 8, fontFamily: font.sans, fontSize: 15, lineHeight: 22.5, color: design.ink },
  b: { fontFamily: font.sansSemi },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 6 },
  noOverride: { fontSize: 11, color: design.ink3 },
  guardCard: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 4 },
  guardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  guardLabel: { fontSize: 11, color: design.ink3, letterSpacing: 0.55 },
  guardVal: { fontFamily: font.monoSemi, fontSize: 14 },
  track: { height: 5, backgroundColor: design.paper2, borderRadius: 3, justifyContent: 'center' },
  trackFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  knob: { position: 'absolute', width: 18, height: 18, marginLeft: -9, borderRadius: 999, backgroundColor: '#fff', borderWidth: 2, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  divider: { borderTopWidth: 1, borderTopColor: design.lineLight },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  cpChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999 },
  cpChipIdle: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line },
  cpText: { fontFamily: font.sansMed, fontSize: 12.5 },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 12, paddingBottom: 14, backgroundColor: 'rgba(244,241,234,0.97)', borderTopWidth: 1, borderTopColor: design.line },
  deployBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, borderRadius: 12, backgroundColor: colors.forest },
  pauseBtn: { backgroundColor: colors.ember },
  deployText: { fontFamily: font.sansSemi, fontSize: 15.5, color: '#f4f1ea' },
});
